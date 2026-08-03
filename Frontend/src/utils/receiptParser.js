import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { proxyImageUrl } from '../api/Axios';
import { getPdfProxyUrl } from './mediaUrlUtils';

// Configure PDF.js worker - use local file from public folder
let workerConfigured = false;

function configurePDFWorker() {
  if (typeof window === 'undefined') return;

  try {
    const workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
    Object.defineProperty(pdfjsLib.GlobalWorkerOptions, 'workerSrc', {
      value: workerSrc,
      writable: true,
      configurable: true,
    });
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    workerConfigured = true;
    console.log('PDF.js worker configured (local):', pdfjsLib.GlobalWorkerOptions.workerSrc);
    console.log('PDF.js version:', pdfjsLib.version);
  } catch (error) {
    console.error('Failed to configure PDF.js worker:', error);
    const pdfjsVersion = pdfjsLib.version || '5.4.296';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
    console.log('Using fallback worker (jsdelivr):', pdfjsLib.GlobalWorkerOptions.workerSrc);
    workerConfigured = true;
  }
}

if (typeof window !== 'undefined') {
  configurePDFWorker();
}

/**
 * Convert PDF file to image (canvas)
 */
export async function pdfToImage(pdfFile) {
  try {
    console.log('Reading PDF file...', pdfFile.name, pdfFile.size, 'bytes');
    const arrayBuffer = await pdfFile.arrayBuffer();

    configurePDFWorker();
    const workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

    try {
      const workerResponse = await fetch(workerSrc, { method: 'HEAD' });
      if (!workerResponse.ok) {
        throw new Error(`Worker file not found: ${workerResponse.status}`);
      }
    } catch (fetchError) {
      console.warn('Worker verification failed, continuing anyway:', fetchError);
    }

    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      verbosity: 0,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    if (pdf.numPages === 0) throw new Error('PDF has no pages');

    const page = await pdf.getPage(1);
    const scale = 2.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport }).promise;
    console.log('PDF converted to canvas successfully');
    return canvas;
  } catch (error) {
    console.error('PDF to image conversion error:', error);
    throw new Error(`Failed to convert PDF to image: ${error.message}`);
  }
}

/**
 * Render the first page of a remote (or data:) PDF to a JPEG data URL for thumbnails.
 */
export async function renderPdfFirstPageFromUrl(pdfUrl, options = {}) {
  const { maxWidth = 256 } = options;
  configurePDFWorker();

  let arrayBuffer;
  if (pdfUrl.startsWith('data:')) {
    const base64 = pdfUrl.split(',')[1];
    if (!base64) throw new Error('Invalid PDF data URL');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    arrayBuffer = bytes.buffer;
  } else {
    const fetchUrl = getPdfProxyUrl(pdfUrl);
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status}`);
    arrayBuffer = await response.arrayBuffer();
  }

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0 }).promise;
  if (pdf.numPages === 0) throw new Error('PDF has no pages');

  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1.5, maxWidth / baseViewport.width);
  const viewport = page.getViewport({ scale: Math.max(scale, 0.25) });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.88);
}

/**
 * Convert canvas to PNG blob
 */
export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          console.log(`Canvas converted to blob: ${(blob.size / 1024).toFixed(2)} KB`);
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      'image/png',
      1.0
    );
  });
}

function isPDF(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Internal: prepare the image source (handles PDF → canvas → File conversion).
 * Returns a File/Blob/string suitable for Tesseract.recognize().
 */
async function _prepareImageForOCR(fileOrUrl) {
  if (!(fileOrUrl instanceof File) || !isPDF(fileOrUrl)) {
    return fileOrUrl;
  }

  console.log('=== PDF DETECTED ===', fileOrUrl.name, fileOrUrl.size, 'bytes');
  try {
    const canvas = await pdfToImage(fileOrUrl);
    const blob = await canvasToBlob(canvas);
    const imageFile = new File([blob], 'receipt.png', { type: 'image/png' });
    if (!imageFile || imageFile.size === 0) throw new Error('Converted image file is empty');
    console.log('PDF → image conversion success, size:', imageFile.size, 'bytes');
    return imageFile;
  } catch (pdfError) {
    console.error('PDF conversion failed, trying data URL fallback:', pdfError);
    const canvas = await pdfToImage(fileOrUrl);
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    if (!dataUrl || dataUrl.length < 100) throw new Error('Data URL fallback failed');
    console.log('PDF → data URL fallback success');
    return dataUrl;
  }
}

/**
 * Read the embedded text layer of a (digital) PDF directly, reconstructing lines
 * from text-item positions. Digital receipt PDFs carry crisp, exact text — reading
 * it beats rasterizing the page and OCR'ing it (Tesseract mangles masked card
 * numbers like "XXXXXXXXXXXX7836 MASTERCARD"). Returns { text, lines } in the same
 * shape as the OCR path, or null when the PDF has no usable text (scanned/image PDF).
 */
async function extractPdfTextLines(pdfFile) {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0 }).promise;
  const lines = [];
  let fullText = '';
  const numPages = Math.min(pdf.numPages, 5);

  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    // Group text items into rows by their (flipped) y position, 4px tolerance.
    const rows = new Map();
    for (const item of content.items) {
      const str = (item.str || '');
      if (!str.trim()) continue;
      const tr = item.transform; // [a, b, c, d, e(x), f(y)]
      const x = tr[4];
      const yTop = viewport.height - tr[5]; // flip so top of page = 0
      const h = item.height || 10;
      const w = item.width || str.length * h * 0.5;
      const key = Math.round(yTop / 4);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ str, x, y: yTop, w, h });
    }

    for (const key of [...rows.keys()].sort((a, b) => a - b)) {
      const items = rows.get(key).sort((a, b) => a.x - b.x);
      const text = items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const words = items.map((i) => ({
        text: i.str,
        bbox: { x0: i.x, y0: i.y, x1: i.x + i.w, y1: i.y + i.h },
      }));
      lines.push({
        text,
        bbox: {
          x0: Math.min(...items.map((i) => i.x)),
          y0: Math.min(...items.map((i) => i.y)),
          x1: Math.max(...items.map((i) => i.x + i.w)),
          y1: Math.max(...items.map((i) => i.y + i.h)),
        },
        words,
      });
      fullText += text + '\n';
    }
  }

  return { text: fullText, lines };
}

/**
 * Extract OCR data from a receipt image or PDF.
 * Returns { text, lines, words } where lines/words include Tesseract bounding box data.
 *
 * lines[i] = { text: string, bbox: { x0, y0, x1, y1 }, words: [...] }
 * words[i]  = { text: string, bbox: { x0, y0, x1, y1 }, confidence: number }
 */
export async function extractReceiptData(fileOrUrl) {
  // For digital PDFs, read the embedded text layer directly — it is exact, whereas
  // OCR'ing a rasterized page mis-reads masked card numbers, small digits, etc.
  // Fall back to OCR only when the PDF has too little text (scanned/image-only PDF).
  if (fileOrUrl instanceof File && isPDF(fileOrUrl)) {
    try {
      const pdfData = await extractPdfTextLines(fileOrUrl);
      const wordCount = (pdfData.text.match(/[A-Za-z0-9]{2,}/g) || []).length;
      if (wordCount >= 10) {
        const words = pdfData.lines.flatMap((l) => l.words);
        console.log(
          `=== PDF TEXT LAYER USED === ${pdfData.text.length} chars, ${pdfData.lines.length} lines, ${words.length} words`
        );
        return { text: pdfData.text, lines: pdfData.lines, words };
      }
      console.log('PDF text layer too sparse — falling back to OCR.');
    } catch (pdfTextErr) {
      console.warn('PDF text-layer extraction failed — falling back to OCR:', pdfTextErr);
    }
  }

  const imageSource = await _prepareImageForOCR(fileOrUrl);

  console.log('=== STARTING TESSERACT OCR ===');
  // Tesseract.js v5+ returns ONLY `text` by default — the line/word bounding-box
  // data that total/subtotal/tax parsing relies on lives in `blocks`, which must
  // be explicitly requested. The convenience `Tesseract.recognize()` helper never
  // passes an `output` option, so `data.blocks` (and the derived lines/words) came
  // back empty and NO Total was ever detected. Use a worker, opt into `blocks`,
  // then flatten the block → paragraph → line tree into the flat `lines` array the
  // parser expects: { text, bbox, words: [{ text, bbox }] }.
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  let data;
  try {
    ({ data } = await worker.recognize(imageSource, {}, { text: true, blocks: true }));
  } finally {
    await worker.terminate();
  }

  const text = data.text || '';

  let lines = [];
  for (const block of data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        lines.push({
          text: line.text || '',
          bbox: line.bbox || null,
          words: (line.words || []).map((w) => ({
            text: w.text || '',
            bbox: w.bbox || null,
          })),
        });
      }
    }
  }

  // Fallback: if block data is unavailable, derive lines from the raw text so the
  // keyword-based total/subtotal/tax matching still works (column detection needs
  // bbox data and is skipped in this path).
  if (lines.length === 0 && text) {
    lines = text
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ text: t, bbox: null, words: [] }));
  }

  const words = lines.flatMap((l) => l.words);

  console.log(`=== OCR COMPLETED === ${text.length} chars, ${lines.length} lines, ${words.length} words`);
  console.log('First 200 chars:', text.substring(0, 200));

  return { text, lines, words };
}

/**
 * Extract text from receipt image using OCR (backward-compatible wrapper).
 */
export async function extractTextFromReceipt(fileOrUrl) {
  try {
    const { text } = await extractReceiptData(fileOrUrl);
    if (!text || text.length === 0) {
      console.warn('Warning: No text extracted from receipt.');
    }
    return text;
  } catch (error) {
    console.error('=== OCR EXTRACTION ERROR ===', error.message);
    throw new Error(`Failed to extract text from receipt: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────
// MERCHANT NAME PARSING
// ─────────────────────────────────────────────────────────

function normalizeMerchantName(merchantName) {
  if (!merchantName) return '';
  let normalized = merchantName.trim();
  normalized = normalized.replace(/^THE\s+/i, '');
  normalized = normalized.replace(/^A\s+/i, '');
  normalized = normalized.replace(/^AN\s+/i, '');
  return normalized.trim();
}

/**
 * Parse merchant name from receipt text.
 * Matches against existing merchants database using component-based confidence scoring
 * (mirrors iOS getStoresNew logic).
 */
export function parseMerchantName(text, merchantsList = []) {
  if (!text) return '';

  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

  if (merchantsList && merchantsList.length > 0) {
    const storeNames = merchantsList.map((m) => (m.name || '').toLowerCase().trim()).filter(Boolean);
    const topAreaLines = lines.slice(0, Math.min(20, lines.length));
    const possibleStores = [];

    for (const storeName of storeNames) {
      if (storeName.length <= 3) continue;

      const components = storeName.split(/\s+/).filter((c) => c.length > 0);
      let matchedComponentCount = 0;
      let componentMatchedLength = 0;
      let foundInLineIndex = -1;

      for (const component of components) {
        const cleanedComponent = component.replace(/[^\w]/g, '').toLowerCase();
        if (cleanedComponent.length === 0) continue;

        for (let i = 0; i < topAreaLines.length; i++) {
          const cleanedLine = topAreaLines[i].replace(/[^\w\s]/g, ' ').toLowerCase();
          if (cleanedLine.includes(cleanedComponent)) {
            matchedComponentCount += 1;
            componentMatchedLength += cleanedComponent.length;
            if (foundInLineIndex === -1) foundInLineIndex = i;
            break;
          }
        }
      }

      if (
        (components.length === 1 && matchedComponentCount === 1) ||
        (components.length > 1 && matchedComponentCount > 1)
      ) {
        const storeNameWithoutSpace = storeName.replace(/\s+/g, '');
        const confidence = (componentMatchedLength / storeNameWithoutSpace.length) * 100;
        possibleStores.push({
          storeName,
          totalComponents: components.length,
          matchedComponents: matchedComponentCount,
          confidence,
          lineIndex: foundInLineIndex,
        });
      }
    }

    if (possibleStores.length > 0) {
      possibleStores.sort((a, b) => {
        if (Math.abs(a.confidence - b.confidence) > 1) return b.confidence - a.confidence;
        if (a.totalComponents !== b.totalComponents) return b.totalComponents - a.totalComponents;
        return a.lineIndex - b.lineIndex;
      });

      const bestMatch = possibleStores[0];
      const originalMerchant = merchantsList.find(
        (m) => (m.name || '').toLowerCase().trim() === bestMatch.storeName
      );

      if (originalMerchant && originalMerchant.name) {
        const normalizedName = normalizeMerchantName(originalMerchant.name);
        console.log(
          `Matched merchant: ${originalMerchant.name} → ${normalizedName} (confidence: ${bestMatch.confidence.toFixed(1)}%)`
        );
        return normalizedName;
      }
    }
  }

  // Fallback: known merchant patterns
  const merchantPatterns = [
    { pattern: /(?:THE\s+)?H[O0]M[E3]\s+D[E3]P[O0]T/i, name: 'Home Depot' },
    { pattern: /WAL[MART]+/i, name: 'Walmart' },
    { pattern: /TARGET/i, name: 'Target' },
    { pattern: /AMAZON/i, name: 'Amazon' },
    { pattern: /STARBUCKS/i, name: 'Starbucks' },
    { pattern: /MCDONALD['S]?/i, name: "McDonald's" },
    { pattern: /COSTCO/i, name: 'Costco' },
    { pattern: /BEST\s+BUY/i, name: 'Best Buy' },
    { pattern: /CVS/i, name: 'CVS' },
    { pattern: /WALGREENS/i, name: 'Walgreens' },
    { pattern: /KROGER/i, name: 'Kroger' },
    { pattern: /SAFEWAY/i, name: 'Safeway' },
    { pattern: /WHOLE\s+FOODS/i, name: 'Whole Foods' },
    { pattern: /TRADER\s+JOE['S]?/i, name: "Trader Joe's" },
    { pattern: /LOWE['S]?/i, name: "Lowe's" },
  ];

  for (let i = 0; i < Math.min(15, lines.length); i++) {
    for (const { pattern, name } of merchantPatterns) {
      if (pattern.test(lines[i])) return normalizeMerchantName(name);
    }
  }

  const fullText = text.toUpperCase();
  for (const { pattern, name } of merchantPatterns) {
    if (pattern.test(fullText)) return normalizeMerchantName(name);
  }

  return '';
}

// ─────────────────────────────────────────────────────────
// PURCHASE DATE PARSING  (mirrors iOS getTransactionDate)
// ─────────────────────────────────────────────────────────

const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function parseMonthName(s) {
  return MONTH_NAMES[(s || '').toLowerCase()] || null;
}

function formatDateYMD(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isValidDate(year, month, day) {
  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Collect all plausible dates from a text string.
 * Mirrors iOS getTransactionDate logic: try 11+ regex patterns, try multiple
 * format orderings for each match, discard future dates, apply frequency-based
 * and nearest-to-today selection.
 *
 * @param {string} text
 * @returns {string} YYYY-MM-DD or ''
 */
export function parsePurchaseDate(text) {
  if (!text) return '';

  const now = new Date();
  const nowTs = now.getTime();
  const collectedDates = []; // { date: Date, dateKey: string }

  function tryAdd(year, month, day) {
    if (!isValidDate(year, month, day)) return;
    const d = new Date(year, month - 1, day);
    if (d.getTime() > nowTs) return; // skip future dates
    collectedDates.push({ date: d, key: formatDateYMD(year, month, day) });
  }

  // Sanitize a line before matching (remove common OCR artifacts)
  function sanitize(s) {
    return s.replace(/[|\\]/g, '').trim();
  }

  const lines = text.split('\n').map(sanitize).filter(Boolean);
  // Also scan the full text for cross-line patterns (rare)
  const corpus = [...lines, text];

  for (const line of corpus) {
    const s = line;
    const sl = s.toLowerCase();

    // ── Pattern 1: YYYY-MM-DD HH:mm:ss  (iOS transactionDateRegex1)
    {
      const re = /(\d{4})-(\d{2})-(\d{2})\s+\d{2}:\d{2}:\d{2}/g;
      let m;
      while ((m = re.exec(s)) !== null) tryAdd(+m[1], +m[2], +m[3]);
    }

    // ── Pattern 2: YYYY/MM/DD HH:mm[:ss]  (iOS transactionDateRegex2&3)
    {
      const re = /(\d{4})\/(\d{2})\/(\d{2})\s+\d{2}:\d{2}/g;
      let m;
      while ((m = re.exec(s)) !== null) tryAdd(+m[1], +m[2], +m[3]);
    }

    // ── Pattern 3: MM/DD/YYYY  (iOS transactionDateRegex1 legacy)
    {
      const re = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
      let m;
      while ((m = re.exec(s)) !== null) {
        tryAdd(+m[3], +m[1], +m[2]); // MM/DD/YYYY
        tryAdd(+m[3], +m[2], +m[1]); // DD/MM/YYYY alternative
      }
    }

    // ── Pattern 4: YYYY/MM/DD  (iOS transactionDateRegex2 legacy)
    {
      const re = /\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/g;
      let m;
      while ((m = re.exec(s)) !== null) tryAdd(+m[1], +m[2], +m[3]);
    }

    // ── Pattern 5: MM/DD/YY  (iOS transactionDateRegex3 legacy)
    {
      const re = /\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/g;
      let m;
      while ((m = re.exec(s)) !== null) {
        const yr = +m[3] < 50 ? 2000 + +m[3] : 1900 + +m[3];
        tryAdd(yr, +m[1], +m[2]);
        tryAdd(yr, +m[2], +m[1]);
      }
    }

    // ── Pattern 6: MM-DD-YYYY  (iOS transactionDateRegex4)
    {
      const re = /\b(\d{1,2})-(\d{1,2})-(\d{4})\b/g;
      let m;
      while ((m = re.exec(s)) !== null) {
        tryAdd(+m[3], +m[1], +m[2]); // MM-DD-YYYY
        tryAdd(+m[3], +m[2], +m[1]); // DD-MM-YYYY
      }
    }

    // ── Pattern 7: YYYY-MM-DD  (ISO, iOS transactionDateRegex5)
    {
      const re = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
      let m;
      while ((m = re.exec(s)) !== null) tryAdd(+m[1], +m[2], +m[3]);
    }

    // ── Pattern 8: DD-MMM-YYYY  e.g. 15-Jan-2024  (iOS transactionDateRegex8)
    {
      const re = /\b(\d{1,2})-([a-z]{3,9})-(\d{4})\b/gi;
      let m;
      while ((m = re.exec(s)) !== null) {
        const mo = parseMonthName(m[2]);
        if (mo) tryAdd(+m[3], mo, +m[1]);
      }
    }

    // ── Pattern 9: MMM DD, YYYY  e.g. Jan 15, 2024  (iOS transactionDateRegex7)
    {
      const re = /\b([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/gi;
      let m;
      while ((m = re.exec(s)) !== null) {
        const mo = parseMonthName(m[1]);
        if (mo) tryAdd(+m[3], mo, +m[2]);
      }
    }

    // ── Pattern 10: DD MMM YYYY  e.g. 15 Jan 2024  (iOS transactionDateRegex9)
    {
      const re = /\b(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})\b/gi;
      let m;
      while ((m = re.exec(s)) !== null) {
        const mo = parseMonthName(m[2]);
        if (mo) tryAdd(+m[3], mo, +m[1]);
      }
    }

    // ── Pattern 11: MMM DD YYYY  e.g. Jan 15 2024 (no comma)  (iOS transactionDateRegex10)
    {
      const re = /\b([a-z]{3,9})\s+(\d{1,2})\s+(\d{4})\b/gi;
      let m;
      while ((m = re.exec(s)) !== null) {
        const mo = parseMonthName(m[1]);
        if (mo) tryAdd(+m[3], mo, +m[2]);
      }
    }

    // ── Pattern 12: Oct08'22  (iOS transactionDateRegex11)
    {
      const re = /\b([a-z]{3,9})(\d{2})'(\d{2})\b/gi;
      let m;
      while ((m = re.exec(s)) !== null) {
        const mo = parseMonthName(m[1]);
        const yr = 2000 + +m[3];
        if (mo) tryAdd(yr, mo, +m[2]);
      }
    }

    // ── Pattern 13: DD-MM-YY  e.g. 15-01-22  (iOS transactionDateRegex6)
    {
      const re = /\b(\d{2})-(\d{1,2})-(\d{2})\b/g;
      let m;
      while ((m = re.exec(s)) !== null) {
        const yr = +m[3] < 50 ? 2000 + +m[3] : 1900 + +m[3];
        tryAdd(yr, +m[2], +m[1]); // DD-MM-YY
        tryAdd(yr, +m[1], +m[2]); // MM-DD-YY
      }
    }
  }

  if (collectedDates.length === 0) return '';

  // Frequency-based selection (iOS logic: pick the date that appears most often)
  const freq = {};
  for (const { key } of collectedDates) freq[key] = (freq[key] || 0) + 1;

  const maxFreq = Math.max(...Object.values(freq));
  const candidates = collectedDates.filter(({ key }) => freq[key] === maxFreq);

  // Among tied candidates, pick nearest to today (iOS: currentTimeStamp - date)
  candidates.sort((a, b) => Math.abs(nowTs - a.date.getTime()) - Math.abs(nowTs - b.date.getTime()));
  return candidates[0]?.key || '';
}

// ─────────────────────────────────────────────────────────
// PAYMENT METHOD PARSING
// ─────────────────────────────────────────────────────────

/**
 * Parse payment method from receipt text.
 * Mirrors iOS getPaymentMethod: detect card type then find masked card number.
 */
export function parsePaymentMethod(text) {
  if (!text) return '';

  const paymentPatterns = [
    { pattern: /\bAMERICAN\s+EXPRESS\b/i, name: 'American Express' },
    { pattern: /\bAMEX\b/i, name: 'American Express' },
    { pattern: /\bMASTERCARD\b/i, name: 'MasterCard' },
    { pattern: /\bMASTER\s+CARD\b/i, name: 'MasterCard' },
    { pattern: /\bVISA\b/i, name: 'Visa' },
    { pattern: /\bDISCOVER\b/i, name: 'Discover' },
    { pattern: /\bDINERS\s+CLUB\b/i, name: 'Diners Club' },
    { pattern: /\bPAYPAL\b/i, name: 'PayPal' },
    { pattern: /\bDEBIT\s+CARD\b/i, name: 'Debit Card' },
    { pattern: /\bDEBIT\b/i, name: 'Debit Card' },
    { pattern: /\bCREDIT\s+CARD\b/i, name: 'Credit Card' },
    { pattern: /\bCASH\b/i, name: 'Cash' },
  ];

  // Card number with type on same text fragment: "XXXXXXXXXXXX7836 MASTERCARD"
  const cardNumberWithTypePattern =
    /(?:X+\s*|\*+\s*)(\d{4})\s+(MASTERCARD|VISA|AMEX|AMERICAN\s+EXPRESS|DISCOVER)/i;
  const cardNumberMatch = text.match(cardNumberWithTypePattern);
  if (cardNumberMatch) {
    const last4 = cardNumberMatch[1];
    const cardType = cardNumberMatch[2].toUpperCase();
    let cardName = 'Card';
    if (cardType.includes('MASTER')) cardName = 'MasterCard';
    else if (cardType.includes('VISA')) cardName = 'Visa';
    else if (cardType.includes('AMEX') || cardType.includes('AMERICAN')) cardName = 'American Express';
    else if (cardType.includes('DISCOVER')) cardName = 'Discover';
    return `${cardName} *${last4}`;
  }

  // Check for card type keywords, then look for card number near keyword
  for (const { pattern, name } of paymentPatterns) {
    if (pattern.test(text)) {
      const paymentIndex = text.search(pattern);
      if (paymentIndex !== -1) {
        const context = text.substring(Math.max(0, paymentIndex - 100), paymentIndex + 100);
        const cardPatterns = [
          /(?:X+|\*+)\s*(\d{4})/,
          /(?:X+\s*){3}(\d{4})/,
          /\*{4,}\s*(\d{4})/,
        ];
        for (const cardPattern of cardPatterns) {
          const last4Match = context.match(cardPattern);
          if (last4Match && /^\d{4}$/.test(last4Match[1])) {
            return `${name} *${last4Match[1]}`;
          }
        }
      }
      return name;
    }
  }

  // Full card number XXXX XXXX XXXX 1234
  const cardNumberPattern = /\b(?:\d{4}\s+){3}(\d{4})\b/;
  const cardMatch = text.match(cardNumberPattern);
  if (cardMatch) {
    const last4 = cardMatch[1];
    const context = text.substring(
      Math.max(0, text.indexOf(cardMatch[0]) - 50),
      text.indexOf(cardMatch[0]) + 50
    );
    if (/\bVISA\b/i.test(context)) return `Visa *${last4}`;
    if (/\bMASTERCARD\b/i.test(context)) return `MasterCard *${last4}`;
    if (/\bAMEX\b/i.test(context) || /\bAMERICAN\s+EXPRESS\b/i.test(context))
      return `American Express *${last4}`;
    if (/\bDISCOVER\b/i.test(context)) return `Discover *${last4}`;
    const binMatch = context.match(/(\d{4,6})/);
    if (binMatch) {
      const firstDigit = binMatch[1][0];
      if (firstDigit === '5') return `MasterCard *${last4}`;
      if (firstDigit === '4') return `Visa *${last4}`;
      if (firstDigit === '3') return `American Express *${last4}`;
      if (firstDigit === '6') return `Discover *${last4}`;
    }
    return `Card *${last4}`;
  }

  // Masked patterns: **** **** **** 1234
  const maskedPattern = /\*{4,}\s*\*{4,}\s*\*{4,}\s*(\d{4})/;
  const maskedMatch = text.match(maskedPattern);
  if (maskedMatch) {
    const last4 = maskedMatch[1];
    const context = text.substring(
      Math.max(0, text.indexOf(maskedMatch[0]) - 100),
      text.indexOf(maskedMatch[0]) + 100
    );
    if (/\bVISA\b/i.test(context)) return `Visa *${last4}`;
    if (/\bMASTERCARD\b/i.test(context)) return `MasterCard *${last4}`;
    if (/\bAMEX\b/i.test(context) || /\bAMERICAN\s+EXPRESS\b/i.test(context))
      return `American Express *${last4}`;
    if (/\bDISCOVER\b/i.test(context)) return `Discover *${last4}`;
    return `Card *${last4}`;
  }

  // All-X pattern: XXXXXXXXXXXX7836
  const allXPattern = /X{8,}\s*(\d{4})/i;
  const allXMatch = text.match(allXPattern);
  if (allXMatch) {
    const last4 = allXMatch[1];
    const context = text.substring(
      Math.max(0, text.indexOf(allXMatch[0]) - 150),
      text.indexOf(allXMatch[0]) + 150
    );
    if (/\bMASTERCARD\b/i.test(context)) return `MasterCard *${last4}`;
    if (/\bVISA\b/i.test(context)) return `Visa *${last4}`;
    if (/\bAMEX\b/i.test(context) || /\bAMERICAN\s+EXPRESS\b/i.test(context))
      return `American Express *${last4}`;
    if (/\bDISCOVER\b/i.test(context)) return `Discover *${last4}`;
    return `MasterCard *${last4}`;
  }

  // iOS-style masked card patterns (cardRegex1-7)
  const cardRegexPatterns = [
    /\*\*\*\*\s+(\d{4})/,   // **** 1234
    /\*\*\*\*(\d{4})/,       // ****1234
    /xxxx\s+(\d{4})/i,       // xxxx 1234
    /xxxx(\d{4})/i,           // xxxx1234
    /####\s+(\d{4})/,         // #### 1234
    /####(\d{4})/,             // ####1234
    /\*+(\d{4})\b/,            // *+1234
  ];

  let detectedCardType = '';
  for (const { pattern, name } of paymentPatterns) {
    if (pattern.test(text)) {
      detectedCardType = name;
      break;
    }
  }

  const lines = text.split('\n');
  let prevLineCardType = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // iOS logic: if previous line contained card type name and this line has a card number
    for (const cardPattern of cardRegexPatterns) {
      const globalPattern = new RegExp(cardPattern.source, 'gi');
      const matches = [...line.matchAll(globalPattern)];
      for (const match of matches) {
        const last4 = match[1];
        if (!last4 || last4 === '0000' || !/^\d{4}$/.test(last4)) continue;

        // Check context (same line + prev line) for card type
        const context = (i > 0 ? lines[i - 1] + '\n' : '') + line;
        if (/\bMASTERCARD\b/i.test(context)) return `MasterCard *${last4}`;
        if (/\bVISA\b/i.test(context)) return `Visa *${last4}`;
        if (/\bAMEX\b/i.test(context) || /\bAMERICAN\s+EXPRESS\b/i.test(context))
          return `American Express *${last4}`;
        if (/\bDISCOVER\b/i.test(context)) return `Discover *${last4}`;
        if (/\bDINERS\b/i.test(context)) return `Diners Club *${last4}`;
        if (detectedCardType) return `${detectedCardType} *${last4}`;
        return `Card *${last4}`;
      }
    }
  }

  if (detectedCardType) return detectedCardType;
  return '';
}

// ─────────────────────────────────────────────────────────
// PRICE / TOTAL PARSING  (mirrors iOS getTotalPrice)
// ─────────────────────────────────────────────────────────

/**
 * Extract the first dollar amount from a text string.
 * Returns a number or null.
 */
function extractPriceFromText(text) {
  if (!text) return null;
  const patterns = [
    /\$\s*(\d{1,3}(?:,\d{3})*\.\d{2})/,  // $1,234.56
    /\$\s*(\d+\.\d{2})/,                    // $12.34
    /(\d{1,3}(?:,\d{3})*\.\d{2})/,          // 1,234.56
    /(\d+\.\d{2})/,                           // 12.34
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (val > 0) return val;
    }
  }
  return null;
}

/**
 * Find the largest price in the rightmost column of a receipt.
 * Mirrors iOS Strategy 2 fallback: group prices by x-position, take rightmost group.
 *
 * @param {Array} lines - Tesseract lines array (each has .words with .bbox)
 * @returns {{ total: number|null, subtotal: number|null }}
 */
function findRightColumnPrices(lines) {
  // Collect all price words with their right-edge x-coordinate
  const priceEntries = [];

  for (const line of lines) {
    for (const word of line.words || []) {
      const val = extractPriceFromText(word.text);
      if (val === null || val <= 0) continue;
      priceEntries.push({ value: val, xRight: word.bbox?.x1 || 0 });
    }

    // Also try the whole line text for amounts that span multiple words (e.g. "$12 .34")
    const lineVal = extractPriceFromText(line.text);
    if (lineVal !== null && lineVal > 0) {
      const xRight = line.bbox?.x1 || 0;
      // Avoid duplicates by checking if same value already registered from a word
      if (!priceEntries.some((e) => e.value === lineVal && Math.abs(e.xRight - xRight) < 20)) {
        priceEntries.push({ value: lineVal, xRight });
      }
    }
  }

  if (priceEntries.length === 0) return { total: null, subtotal: null };

  // Determine rightmost x boundary
  const maxX = Math.max(...priceEntries.map((e) => e.xRight));
  // Consider prices within 20% of max x as "right column" (iOS uses > 0.8 threshold)
  const threshold = maxX * 0.75;
  const rightColPrices = priceEntries.filter((e) => e.xRight >= threshold);

  if (rightColPrices.length === 0) {
    // Fallback: just return largest overall
    const sorted = [...priceEntries].sort((a, b) => b.value - a.value);
    return { total: sorted[0]?.value || null, subtotal: sorted[1]?.value || null };
  }

  // Sort descending by value: largest = total, 2nd largest = subtotal (iOS logic)
  rightColPrices.sort((a, b) => b.value - a.value);
  return {
    total: rightColPrices[0]?.value || null,
    subtotal: rightColPrices[1]?.value || null,
  };
}

/**
 * Parse total, subtotal, tax, and tip amounts from Tesseract line data.
 * Mirrors iOS getTotalPrice strategy:
 *   1. Find lines with "total"/"subtotal"/"tax"/"tip" keywords containing a price.
 *   2. Fallback: rightmost column prices (largest = total, 2nd = subtotal).
 *
 * @param {Array} lines - Tesseract lines array
 * @returns {{ total: number|null, subtotal: number|null, taxAmount: number|null, tip: number|null }}
 */
export function parseTotalFromLines(lines) {
  if (!lines || lines.length === 0) return { total: null, subtotal: null, taxAmount: null, tip: null };

  let total = null;
  let subtotal = null;
  let taxAmount = null;
  let tip = null;

  // Strategy 1: keyword-based line matching (same as iOS strategy 1)
  // We look at every line; for iOS this is "find keyword label, then find overlapping price".
  // In Tesseract, the line already contains both label and price, so we just parse the line.
  for (const line of lines) {
    const lineText = (line.text || '').trim();
    const lineLower = lineText.toLowerCase();
    const price = extractPriceFromText(lineText);
    if (!price || price <= 0) continue;

    // iOS: "total" keyword, excluding "sub" and "tax"
    const isTotal =
      /\btotal\b/.test(lineLower) &&
      !/\bsub/.test(lineLower) &&
      !/\btax\b/.test(lineLower);

    // iOS also checks "amount" and "payment" as total synonyms
    const isAmount = /\b(amount|payment|due|balance)\b/.test(lineLower) && !/\bsub/.test(lineLower);

    if (isTotal || isAmount) {
      // iOS picks the LOWEST "total" label on the receipt (last occurrence = final total)
      // so we overwrite with any higher value we find
      if (total === null || price > total) total = price;
    }

    if (/\b(subtotal|sub\s*total|sub-total)\b/.test(lineLower)) {
      if (subtotal === null) subtotal = price;
    }

    if (/\btax\b/.test(lineLower) && !/\btotal\b/.test(lineLower)) {
      if (taxAmount === null) taxAmount = price;
    }

    if (/\b(tip|gratuity)\b/.test(lineLower)) {
      if (tip === null) tip = price;
    }
  }

  // Strategy 2 (iOS fallback): rightmost column prices
  if (!total) {
    const { total: colTotal, subtotal: colSubtotal } = findRightColumnPrices(lines);
    if (colTotal) total = colTotal;
    if (!subtotal && colSubtotal) subtotal = colSubtotal;
  }

  console.log('=== PARSED AMOUNTS ===', { total, subtotal, taxAmount, tip });
  return { total, subtotal, taxAmount, tip };
}

/**
 * Detect individual, NAMED tax-type lines (name + rate + amount) from receipt lines.
 * Recognizes the common labels HST/GST/PST/QST/VAT. The rate is read from a printed
 * "NN%" on the line when present, otherwise inferred from amount ÷ subtotal.
 * Best-effort: only fires when the receipt prints a labelled tax breakdown. Generic
 * unlabelled "Tax" lines are intentionally NOT returned here — those are handled by the
 * existing taxAmount + default-tax-type behaviour. Capped at 2 (the receipt UI shows 2).
 * @returns {Array<{name: string, rate: number|null, amount: number}>}
 */
export function parseTaxTypesFromLines(lines, subtotal = null) {
  if (!lines || lines.length === 0) return [];
  const sub = parseFloat(subtotal) || 0;
  const RATE_RE = /(\d{1,2}(?:\.\d+)?)\s*%/;
  const PRIORITY = ['HST', 'GST', 'PST', 'QST', 'VAT'];

  // Pick the tax label from a line, preferring HST — a combined "GST/HST" label is the
  // harmonized tax (HST), and receipts often print both.
  const pickLabel = (text) => {
    const up = (text || '').toUpperCase();
    for (const l of PRIORITY) {
      if (new RegExp(`\\b${l}\\b`).test(up)) return l;
    }
    return null;
  };

  // Pass 1 — collect a printed rate per label from ANY line (the rate is often on a
  // separate line from the amount, e.g. "13%  HST R135772911").
  const rateByLabel = {};
  for (const line of lines) {
    const text = (line.text || '').trim();
    if (!text) continue;
    const rateM = text.match(RATE_RE);
    if (!rateM) continue;
    const label = pickLabel(text);
    if (!label) continue;
    const r = parseFloat(rateM[1]);
    if (r > 0 && r <= 30 && rateByLabel[label] == null) rateByLabel[label] = r;
  }

  // Pass 2 — collect the tax amount from each labelled line.
  const results = [];
  const seen = new Set();
  for (const line of lines) {
    const text = (line.text || '').trim();
    if (!text) continue;
    const lower = text.toLowerCase();
    // Skip subtotal / grand-total rows and registration-number lines.
    if (/\b(subtotal|sub\s*total|sub-total|total)\b/.test(lower)) continue;
    if (/\bR\d{5,}\b/.test(text)) continue; // e.g. "13% HST R135772911" — rate only, no amount

    const label = pickLabel(text);
    if (!label) continue;

    const price = extractPriceFromText(text);
    if (!price || price <= 0) continue;
    // A tax is a fraction of the subtotal — guard against grabbing a large id/number.
    if (sub > 0 && price > sub * 1.5) continue;

    // Rate: printed on this line → the label's printed rate from pass 1 → inferred.
    let rate = null;
    const rateM = text.match(RATE_RE);
    if (rateM) rate = parseFloat(rateM[1]);
    else if (rateByLabel[label] != null) rate = rateByLabel[label];
    else if (sub > 0) rate = parseFloat(((price / sub) * 100).toFixed(2));

    const key = `${label}|${price.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ name: label, rate, amount: price });
    if (results.length >= 2) break;
  }

  return results;
}

// ─────────────────────────────────────────────────────────
// MERCHANT LOGO
// ─────────────────────────────────────────────────────────

async function fetchMerchantLogo(merchantName) {
  if (!merchantName || merchantName.trim().length === 0) return null;

  const pickUrl = (data) => {
    if (!data) return null;
    if (Array.isArray(data) && data.length > 0) {
      for (const item of data) {
        if (item && typeof item === 'object') {
          const url = item.fullurl || item.url || item.image || item.src || item.link || item.thumburl;
          if (url && /^https?:\/\//i.test(url)) return proxyImageUrl(url);
        }
      }
      return null;
    }
    if (typeof data === 'object') {
      const arr = data.images || data.results || data.data || data.items || [];
      if (Array.isArray(arr) && arr.length > 0) {
        const first = arr[0];
        if (first && typeof first === 'object') {
          const url = first.fullurl || first.url || first.image || first.src || first.link;
          if (url && /^https?:\/\//i.test(url)) return proxyImageUrl(url);
        }
      }
      const directUrl = data.url || data.image || data.src || data.link || data.fullurl;
      if (directUrl && /^https?:\/\//i.test(directUrl)) return proxyImageUrl(directUrl);
    }
    return null;
  };

  const queries = [merchantName, `${merchantName} logo`];

  for (const qRaw of queries) {
    const q = encodeURIComponent(`${qRaw} logo`);
    try {
      const resp = await fetch(`/imagesearch?searchkeyword=${q}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) continue;

      let data;
      const ct = resp.headers.get('content-type');
      if (ct && ct.includes('application/json')) {
        data = await resp.json();
      } else {
        const txt = await resp.text();
        try {
          data = JSON.parse(txt);
        } catch {
          const urlMatch = txt.match(/(https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp))/i);
          if (urlMatch) return urlMatch[1];
          continue;
        }
      }

      const candidate = pickUrl(data);
      if (candidate && /^https?:\/\//i.test(candidate)) {
        console.log(`Found logo for ${merchantName}: ${candidate}`);
        return candidate;
      }
    } catch (err) {
      console.warn(`Logo fetch error for "${qRaw}":`, err);
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────
// MAIN PARSE RECEIPT
// ─────────────────────────────────────────────────────────

/**
 * Parse receipt image/PDF and extract all structured data.
 * Mirrors iOS handleDetectedText: merchant, date, payment method, total, subtotal, tax, tip.
 *
 * @param {File|string} fileOrUrl
 * @param {Array} merchantsList - merchant objects for name matching
 * @returns {Promise<{
 *   merchantName: string,
 *   purchaseDate: string,
 *   paymentMethod: string,
 *   merchantLogo: string|null,
 *   total: number|null,
 *   subtotal: number|null,
 *   taxAmount: number|null,
 *   tip: number|null,
 *   rawText: string,
 * }>}
 */
export async function parseReceipt(fileOrUrl, merchantsList = []) {
  try {
    console.log('Starting receipt parsing...');
    if (fileOrUrl instanceof File) {
      console.log(`File type: ${fileOrUrl.type}, Name: ${fileOrUrl.name}`);
    }

    // Extract OCR data (text + Tesseract line/word bounding box data)
    const { text: extractedText, lines } = await extractReceiptData(fileOrUrl);
    console.log('Extracted text (first 1000 chars):', extractedText.substring(0, 1000));
    console.log('Total extracted text length:', extractedText.length);

    // Parse all fields in parallel where possible
    const merchantName = parseMerchantName(extractedText, merchantsList);
    const purchaseDate = parsePurchaseDate(extractedText);
    const paymentMethod = parsePaymentMethod(extractedText);
    const { total, subtotal, taxAmount, tip } = parseTotalFromLines(lines);
    const detectedTaxes = parseTaxTypesFromLines(lines, subtotal);

    // Fetch merchant logo (slow, do last)
    let merchantLogo = null;
    if (merchantName) {
      console.log(`Fetching logo for merchant: ${merchantName}`);
      merchantLogo = await fetchMerchantLogo(merchantName);
    }

    console.log('=== PARSED RECEIPT DATA ===');
    console.log('Merchant Name:', merchantName || '(not found)');
    console.log('Merchant Logo:', merchantLogo || '(not found)');
    console.log('Purchase Date:', purchaseDate || '(not found)');
    console.log('Payment Method:', paymentMethod || '(not found)');
    console.log('Total:', total ?? '(not found)');
    console.log('Subtotal:', subtotal ?? '(not found)');
    console.log('Tax:', taxAmount ?? '(not found)');
    console.log('Tip:', tip ?? '(not found)');
    console.log('===========================');

    // Log first 10 lines for debugging
    const firstLines = extractedText.split('\n').slice(0, 10).map((l, i) => `${i + 1}: ${l.trim()}`);
    console.log('First 10 lines:', firstLines);

    return {
      merchantName,
      purchaseDate,
      paymentMethod,
      merchantLogo,
      total,
      subtotal,
      taxAmount,
      tip,
      detectedTaxes,
      rawText: extractedText,
    };
  } catch (error) {
    console.error('Receipt parsing error:', error);
    return {
      merchantName: '',
      purchaseDate: '',
      paymentMethod: '',
      merchantLogo: null,
      total: null,
      subtotal: null,
      taxAmount: null,
      tip: null,
      detectedTaxes: [],
      rawText: '',
    };
  }
}
