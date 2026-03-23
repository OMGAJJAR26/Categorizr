import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { proxyImageUrl } from '../api/Axios';

// Configure PDF.js worker - use local file from public folder
// This must be set BEFORE any PDF.js operations
let workerConfigured = false;

function configurePDFWorker() {
  if (typeof window === 'undefined') return;
  
  try {
    // Use absolute URL without cache busting (cache busting can cause issues)
    const workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
    
    // IMPORTANT: Set worker source BEFORE any PDF.js operations
    // This must be done synchronously and before getDocument is called
    Object.defineProperty(pdfjsLib.GlobalWorkerOptions, 'workerSrc', {
      value: workerSrc,
      writable: true,
      configurable: true
    });
    
    // Also set it directly
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    
    workerConfigured = true;
    
    console.log('PDF.js worker configured (local):', pdfjsLib.GlobalWorkerOptions.workerSrc);
    console.log('PDF.js version:', pdfjsLib.version);
    console.log('Worker source verified:', pdfjsLib.GlobalWorkerOptions.workerSrc === workerSrc);
  } catch (error) {
    console.error('Failed to configure PDF.js worker:', error);
    // Fallback: jsdelivr CDN
    const pdfjsVersion = pdfjsLib.version || '5.4.296';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
    console.log('Using fallback worker (jsdelivr):', pdfjsLib.GlobalWorkerOptions.workerSrc);
    workerConfigured = true;
  }
}

// Configure immediately when module loads
if (typeof window !== 'undefined') {
  configurePDFWorker();
}

/**
 * Convert PDF file to image (canvas)
 * @param {File} pdfFile - PDF file
 * @returns {Promise<HTMLCanvasElement>} Canvas element with rendered PDF page
 */
export async function pdfToImage(pdfFile) {
  try {
    console.log('Reading PDF file...', pdfFile.name, pdfFile.size, 'bytes');
    const arrayBuffer = await pdfFile.arrayBuffer();
    console.log('PDF file read, size:', arrayBuffer.byteLength, 'bytes');
    
    // CRITICAL: Ensure worker is configured BEFORE any PDF.js operations
    configurePDFWorker();
    
    // Force set worker to local file (in case it was changed)
    const workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    
    // Log to verify it's set correctly
    console.log('Worker source before getDocument:', pdfjsLib.GlobalWorkerOptions.workerSrc);
    
    console.log('Worker configured in pdfToImage:', pdfjsLib.GlobalWorkerOptions.workerSrc);
    
    // Verify the worker file exists by trying to fetch it
    try {
      const workerResponse = await fetch(workerSrc, { method: 'HEAD' });
      if (!workerResponse.ok) {
        throw new Error(`Worker file not found: ${workerResponse.status} ${workerResponse.statusText}`);
      }
      console.log('Worker file verified, accessible at:', workerSrc);
    } catch (fetchError) {
      console.error('Failed to verify worker file:', fetchError);
      // Don't throw here, let PDF.js try to load it - it might work anyway
      console.warn('Continuing despite worker verification failure...');
    }
    
    console.log('Loading PDF document...');
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      verbosity: 0, // Suppress console warnings
      useSystemFonts: true
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded successfully. Total pages: ${pdf.numPages}`);
    
    if (pdf.numPages === 0) {
      throw new Error('PDF has no pages');
    }
    
    // Get first page (most receipts are single page)
    console.log('Getting first page...');
    const page = await pdf.getPage(1);
    console.log('Page loaded');
    
    // Set scale for better quality (2.5 for good balance between quality and performance)
    const scale = 2.5;
    const viewport = page.getViewport({ scale: scale });
    console.log(`Viewport: ${viewport.width}x${viewport.height} at scale ${scale}`);
    
    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Set canvas dimensions
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    console.log(`Canvas created: ${canvas.width}x${canvas.height}`);
    
    // Set white background for better OCR
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    console.log('Rendering PDF page to canvas...');
    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };
    
    await page.render(renderContext).promise;
    console.log('PDF page rendered to canvas successfully');
    
    // Verify canvas has content
    const imageData = context.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height));
    const hasContent = imageData.data.some((pixel, index) => {
      // Check if pixel is not white (RGB 255,255,255)
      if (index % 4 === 3) return false; // Skip alpha channel
      return pixel < 255;
    });
    
    if (!hasContent) {
      console.warn('Warning: Canvas appears to be empty or all white');
    }
    
    console.log('PDF converted to image successfully');
    return canvas;
  } catch (error) {
    console.error('PDF to image conversion error:', error);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to convert PDF to image: ${error.message}`);
  }
}

/**
 * Convert canvas to image file/blob
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @returns {Promise<Blob>} Image blob
 */
export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    // Use high quality PNG for better OCR
    canvas.toBlob((blob) => {
      if (blob) {
        console.log(`Canvas converted to blob: ${(blob.size / 1024).toFixed(2)} KB`);
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to blob'));
      }
    }, 'image/png', 1.0); // 1.0 = maximum quality
  });
}

/**
 * Check if file is a PDF
 * @param {File} file - File to check
 * @returns {boolean} True if file is PDF
 */
function isPDF(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Extract text from receipt image using OCR
 * Supports both image files and PDF files
 * @param {File|string} fileOrUrl - Image file, PDF file, or image URL
 * @returns {Promise<string>} Extracted text from receipt
 */
export async function extractTextFromReceipt(fileOrUrl) {
  try {
    let imageSource = fileOrUrl;
    let isPDFConverted = false;
    
    // If it's a File object and it's a PDF, convert to image first
    if (fileOrUrl instanceof File && isPDF(fileOrUrl)) {
      console.log('=== PDF DETECTED ===');
      console.log('File name:', fileOrUrl.name);
      console.log('File type:', fileOrUrl.type);
      console.log('File size:', fileOrUrl.size, 'bytes');
      
      try {
        console.log('Step 1: Converting PDF to image...');
        const canvas = await pdfToImage(fileOrUrl);
        console.log('Step 2: PDF converted to canvas successfully');
        
        // Try multiple methods to ensure Tesseract can process it
        // Method 1: Convert canvas to blob, then to File
        console.log('Step 3: Converting canvas to blob...');
        const blob = await canvasToBlob(canvas);
        console.log('Step 4: Blob created, size:', blob.size, 'bytes');
        
        // Create File from blob
        imageSource = new File([blob], 'receipt.png', { type: 'image/png' });
        console.log('Step 5: File created from blob');
        isPDFConverted = true;
        
        // Verify the file
        if (!imageSource || imageSource.size === 0) {
          throw new Error('Converted image file is empty');
        }
        console.log('Converted file size:', imageSource.size, 'bytes');
        
      } catch (pdfError) {
        console.error('PDF conversion failed:', pdfError);
        // Try fallback: use data URL
        console.log('Trying fallback: data URL method...');
        try {
          const canvas = await pdfToImage(fileOrUrl);
          const dataUrl = canvas.toDataURL('image/png', 1.0);
          if (dataUrl && dataUrl.length > 100) {
            imageSource = dataUrl;
            isPDFConverted = true;
            console.log('Fallback successful: using data URL');
          } else {
            throw new Error('Data URL is too short or invalid');
          }
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
          throw new Error(`PDF conversion failed: ${pdfError.message}. Fallback also failed: ${fallbackError.message}`);
        }
      }
    } else if (fileOrUrl instanceof File) {
      console.log(`Processing ${fileOrUrl.type || 'image'} file for OCR...`);
    }
    
    console.log('=== STARTING TESSERACT OCR ===');
    console.log('Image source type:', typeof imageSource);
    console.log('Is File?', imageSource instanceof File);
    console.log('Is string?', typeof imageSource === 'string');
    
    if (isPDFConverted) {
      console.log('Using converted PDF image for OCR');
    }
    
    const { data: { text } } = await Tesseract.recognize(
      imageSource,
      'eng',
      {
        logger: (m) => {
          // Log all important status updates
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          } else if (m.status === 'loading tesseract core') {
            console.log('Loading Tesseract core...');
          } else if (m.status === 'initializing tesseract') {
            console.log('Initializing Tesseract...');
          } else if (m.status === 'loading language traineddata') {
            console.log('Loading language data...');
          }
        }
      }
    );
    
    console.log(`=== OCR COMPLETED ===`);
    console.log(`Extracted ${text.length} characters`);
    console.log('First 200 characters:', text.substring(0, 200));
    
    if (text.length === 0) {
      console.warn('Warning: No text extracted from receipt. The image might be too low quality or empty.');
    }
    return text;
  } catch (error) {
    console.error('=== OCR EXTRACTION ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to extract text from receipt: ${error.message}`);
  }
}

/**
 * Normalize merchant name to match mobile app format
 * Removes "THE" prefix and other common prefixes
 * @param {string} merchantName - Merchant name to normalize
 * @returns {string} Normalized merchant name
 */
function normalizeMerchantName(merchantName) {
  if (!merchantName) return '';
  
  let normalized = merchantName.trim();
  
  // Remove "THE" prefix (case-insensitive)
  normalized = normalized.replace(/^THE\s+/i, '');
  
  // Remove other common prefixes
  normalized = normalized.replace(/^A\s+/i, '');
  normalized = normalized.replace(/^AN\s+/i, '');
  
  // Trim and return
  return normalized.trim();
}

/**
 * Parse merchant name from receipt text
 * Matches against existing merchants database (like mobile app)
 * Uses component-based matching with confidence scoring
 * @param {string} text - Extracted text from receipt
 * @param {Array} merchantsList - List of merchant objects with name property
 * @returns {string} Detected merchant name (normalized to match mobile app)
 */
export function parseMerchantName(text, merchantsList = []) {
  if (!text) return '';

  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // If we have merchants list, use component-based matching (like mobile app)
  if (merchantsList && merchantsList.length > 0) {
    const storeNames = merchantsList.map(m => (m.name || '').toLowerCase().trim()).filter(Boolean);
    
    // Focus on top area of receipt (first 20 lines) - merchant name is usually at top
    const topAreaLines = lines.slice(0, Math.min(20, lines.length));
    
    const possibleStores = [];
    
    for (const storeName of storeNames) {
      if (storeName.length <= 3) continue; // Skip very short names
      
      // Split store name into components (words)
      const components = storeName.split(/\s+/).filter(c => c.length > 0);
      let matchedComponentCount = 0;
      let componentMatchedLength = 0;
      let foundInLineIndex = -1;
      
      // Check each component against top area lines
      for (const component of components) {
        const cleanedComponent = component.replace(/[^\w]/g, '').toLowerCase();
        if (cleanedComponent.length === 0) continue;
        
        for (let i = 0; i < topAreaLines.length; i++) {
          const line = topAreaLines[i];
          const cleanedLine = line.replace(/[^\w\s]/g, ' ').toLowerCase();
          
          // Check if line contains the component
          if (cleanedLine.includes(cleanedComponent)) {
            matchedComponentCount += 1;
            componentMatchedLength += cleanedComponent.length;
            if (foundInLineIndex === -1) {
              foundInLineIndex = i; // Track which line (Y position - lower index = higher on receipt)
            }
            break; // Found this component, move to next
          }
        }
      }
      
      // If we matched all components (or single component fully matched)
      if ((components.length === 1 && matchedComponentCount === 1) || 
          (components.length > 1 && matchedComponentCount > 1)) {
        const storeNameWithoutSpace = storeName.replace(/\s+/g, '');
        const confidence = (componentMatchedLength / storeNameWithoutSpace.length) * 100;
        
        possibleStores.push({
          storeName: storeName,
          totalComponents: components.length,
          matchedComponents: matchedComponentCount,
          confidence: confidence,
          lineIndex: foundInLineIndex, // Lower index = higher on receipt (better)
        });
      }
    }
    
    if (possibleStores.length > 0) {
      // Sort by confidence, then by total components, then by line position (higher on receipt is better)
      possibleStores.sort((a, b) => {
        if (Math.abs(a.confidence - b.confidence) > 1) {
          return b.confidence - a.confidence; // Higher confidence first
        }
        if (a.totalComponents !== b.totalComponents) {
          return b.totalComponents - a.totalComponents; // More components matched is better
        }
        return a.lineIndex - b.lineIndex; // Higher on receipt (lower index) is better
      });
      
      const bestMatch = possibleStores[0];
      // Find the original merchant object to get the exact name (preserving case)
      const originalMerchant = merchantsList.find(m => 
        (m.name || '').toLowerCase().trim() === bestMatch.storeName
      );
      
      if (originalMerchant && originalMerchant.name) {
        const normalizedName = normalizeMerchantName(originalMerchant.name);
        console.log(`Matched merchant: ${originalMerchant.name} -> ${normalizedName} (confidence: ${bestMatch.confidence.toFixed(1)}%)`);
        return normalizedName;
      }
    }
  }
  
  // Fallback: Use pattern matching if no merchants list provided or no match found
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

  // Check first 15 lines for merchant name
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i];
    
    for (const { pattern, name } of merchantPatterns) {
      if (pattern.test(line)) {
        return normalizeMerchantName(name);
      }
    }
  }

  // Search entire text for merchant patterns
  const fullText = text.toUpperCase();
  for (const { pattern, name } of merchantPatterns) {
    if (pattern.test(fullText)) {
      return normalizeMerchantName(name);
    }
  }

  return '';
}

/**
 * Parse purchase date from receipt text
 * Common patterns:
 * - MM/DD/YY, MM/DD/YYYY
 * - DD/MM/YY, DD/MM/YYYY
 * - YYYY-MM-DD
 * @param {string} text - Extracted text from receipt
 * @returns {string} Detected date in YYYY-MM-DD format
 */
export function parsePurchaseDate(text) {
  if (!text) return '';

  // Date patterns to look for
  const datePatterns = [
    // MM/DD/YY or MM/DD/YYYY
    /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g,
    // DD/MM/YY or DD/MM/YYYY
    /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g,
    // YYYY-MM-DD
    /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g,
  ];

  const lines = text.split('\n');
  
  // Look for date in first 20 lines (usually near top of receipt)
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i];
    
    // Try MM/DD/YY or MM/DD/YYYY pattern
    const mmddyyMatch = line.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (mmddyyMatch) {
      let month = parseInt(mmddyyMatch[1], 10);
      let day = parseInt(mmddyyMatch[2], 10);
      let year = parseInt(mmddyyMatch[3], 10);
      
      // Handle 2-digit year
      if (year < 100) {
        year = year < 50 ? 2000 + year : 1900 + year;
      }
      
      // Validate date
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
        // Format as YYYY-MM-DD
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    
    // Try YYYY-MM-DD pattern
    const yyyymmddMatch = line.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (yyyymmddMatch) {
      const year = parseInt(yyyymmddMatch[1], 10);
      const month = parseInt(yyyymmddMatch[2], 10);
      const day = parseInt(yyyymmddMatch[3], 10);
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  return '';
}

/**
 * Parse payment method from receipt text
 * Common patterns:
 * - VISA, MASTERCARD, AMERICAN EXPRESS, DISCOVER
 * - Card numbers (last 4 digits)
 * - Cash, Debit, Credit
 * @param {string} text - Extracted text from receipt
 * @returns {string} Detected payment method
 */
export function parsePaymentMethod(text) {
  if (!text) return '';

  const upperText = text.toUpperCase();
  
  // Payment method patterns (order matters - more specific first)
  // Look for payment method keywords in the text
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

  // Also check for card number patterns that might indicate payment method
  // Look for patterns like "XXXXXXXXXXXX7836 MASTERCARD"
  const cardNumberWithTypePattern = /(?:X+\s*|\*+\s*)(\d{4})\s+(MASTERCARD|VISA|AMEX|AMERICAN\s+EXPRESS|DISCOVER)/i;
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

  // Check for payment method keywords
  for (const { pattern, name } of paymentPatterns) {
    if (pattern.test(text)) {
      // Try to find last 4 digits near the payment method
      const paymentIndex = text.search(pattern);
      if (paymentIndex !== -1) {
        // Look in context around the payment method (100 chars before and after)
        const context = text.substring(Math.max(0, paymentIndex - 100), paymentIndex + 100);
        
        // Look for patterns like "XXXX XXXX XXXX 7836" or "XXXXXXXXXXXX7836" or "**** 7836"
        // Try multiple patterns
        const cardPatterns = [
          /(?:X+|\*+)\s*(\d{4})/,  // XXXX 7836 or **** 7836
          /(?:X+\s*){3}(\d{4})/,   // XXXX XXXX XXXX 7836
          /\*{4,}\s*(\d{4})/,      // **** 7836
        ];
        
        for (const cardPattern of cardPatterns) {
          const last4Match = context.match(cardPattern);
          if (last4Match) {
            const last4 = last4Match[1];
            if (last4 && /^\d{4}$/.test(last4)) {
              return `${name} *${last4}`;
            }
          }
        }
      }
      
      return name;
    }
  }

  // Look for card number patterns (XXXX XXXX XXXX 1234)
  const cardNumberPattern = /\b(?:\d{4}\s+){3}(\d{4})\b/;
  const cardMatch = text.match(cardNumberPattern);
  if (cardMatch) {
    const last4 = cardMatch[1];
    // Try to determine card type from context
    const context = text.substring(Math.max(0, text.indexOf(cardMatch[0]) - 50), text.indexOf(cardMatch[0]) + 50);
    if (/\bVISA\b/i.test(context)) return `Visa *${last4}`;
    if (/\bMASTERCARD\b/i.test(context)) return `MasterCard *${last4}`;
    if (/\bAMEX\b/i.test(context) || /\bAMERICAN\s+EXPRESS\b/i.test(context)) return `American Express *${last4}`;
    if (/\bDISCOVER\b/i.test(context)) return `Discover *${last4}`;
    
    // Determine card type from first digit of card number (BIN - Bank Identification Number)
    // MasterCard: 5, Visa: 4, Amex: 3, Discover: 6
    // Try to find the first 4-6 digits in the context
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

  // Look for masked card numbers (**** **** **** 1234)
  const maskedPattern = /\*{4,}\s*\*{4,}\s*\*{4,}\s*(\d{4})/;
  const maskedMatch = text.match(maskedPattern);
  if (maskedMatch) {
    const last4 = maskedMatch[1];
    // Check context for card type
    const context = text.substring(Math.max(0, text.indexOf(maskedMatch[0]) - 100), text.indexOf(maskedMatch[0]) + 100);
    if (/\bVISA\b/i.test(context)) return `Visa *${last4}`;
    if (/\bMASTERCARD\b/i.test(context) || /\bMASTER\s+CARD\b/i.test(context)) return `MasterCard *${last4}`;
    if (/\bAMEX\b/i.test(context) || /\bAMERICAN\s+EXPRESS\b/i.test(context)) return `American Express *${last4}`;
    if (/\bDISCOVER\b/i.test(context)) return `Discover *${last4}`;
    
    // Look for card number with X pattern before the masked pattern
    const xPattern = /(?:X+\s*){3}(\d{4})/;
    const xMatch = context.match(xPattern);
    if (xMatch && xMatch[1] === last4) {
      // Found XXXX XXXX XXXX 1234 pattern, check for card type in wider context
      const widerContext = text.substring(Math.max(0, text.indexOf(maskedMatch[0]) - 200), text.indexOf(maskedMatch[0]) + 200);
      if (/\bMASTERCARD\b/i.test(widerContext) || /\bMASTER\s+CARD\b/i.test(widerContext)) return `MasterCard *${last4}`;
      if (/\bVISA\b/i.test(widerContext)) return `Visa *${last4}`;
      if (/\bAMEX\b/i.test(widerContext) || /\bAMERICAN\s+EXPRESS\b/i.test(widerContext)) return `American Express *${last4}`;
      if (/\bDISCOVER\b/i.test(widerContext)) return `Discover *${last4}`;
    }
    
    return `Card *${last4}`;
  }

  // Look for patterns like "XXXXXXXXXXXX7836" (all X's followed by digits)
  const allXPattern = /X{8,}\s*(\d{4})/i;
  const allXMatch = text.match(allXPattern);
  if (allXMatch) {
    const last4 = allXMatch[1];
    const context = text.substring(Math.max(0, text.indexOf(allXMatch[0]) - 150), text.indexOf(allXMatch[0]) + 150);
    // Check for payment method in context
    if (/\bMASTERCARD\b/i.test(context) || /\bMASTER\s+CARD\b/i.test(context)) return `MasterCard *${last4}`;
    if (/\bVISA\b/i.test(context)) return `Visa *${last4}`;
    if (/\bAMEX\b/i.test(context) || /\bAMERICAN\s+EXPRESS\b/i.test(context)) return `American Express *${last4}`;
    if (/\bDISCOVER\b/i.test(context)) return `Discover *${last4}`;
    // Default to MasterCard if no specific type found (common case)
    return `MasterCard *${last4}`;
  }

  // Additional card number patterns from mobile app
  // Patterns: **** 1234, ****1234, xxxx1234, xxxx 1234, ####1234, #### 1234, *+1234
  const cardRegexPatterns = [
    /\*\*\*\*\s*(\d{4})/,      // **** 1234
    /\*\*\*\*(\d{4})/,         // ****1234
    /xxxx\s*(\d{4})/i,         // xxxx 1234
    /xxxx(\d{4})/i,            // xxxx1234
    /####\s*(\d{4})/,          // #### 1234
    /####(\d{4})/,             // ####1234
    /\*+\s*(\d{4})/,           // *+ 1234
    /\*+(\d{4})/,              // *+1234
  ];

  // Check if any card type was found earlier
  let detectedCardType = '';
  for (const { pattern, name } of paymentPatterns) {
    if (pattern.test(text)) {
      detectedCardType = name;
      break;
    }
  }

  // Look for card numbers near detected card types or in the text
  for (const cardPattern of cardRegexPatterns) {
    const matches = [...text.matchAll(new RegExp(cardPattern.source, 'gi'))];
    for (const match of matches) {
      const last4 = match[1];
      if (last4 && last4 !== '0000' && /^\d{4}$/.test(last4)) {
        // Check context around the match
        const matchIndex = match.index;
        const context = text.substring(Math.max(0, matchIndex - 200), matchIndex + 200);
        
        // Check for card type in context
        if (/\bMASTERCARD\b/i.test(context) || /\bMASTER\s+CARD\b/i.test(context)) {
          return `MasterCard *${last4}`;
        }
        if (/\bVISA\b/i.test(context)) {
          return `Visa *${last4}`;
        }
        if (/\bAMEX\b/i.test(context) || /\bAMERICAN\s+EXPRESS\b/i.test(context)) {
          return `American Express *${last4}`;
        }
        if (/\bDISCOVER\b/i.test(context)) {
          return `Discover *${last4}`;
        }
        
        // If we detected a card type earlier, use it
        if (detectedCardType) {
          return `${detectedCardType} *${last4}`;
        }
        
        // Default to MasterCard (most common)
        return `MasterCard *${last4}`;
      }
    }
  }

  // If card type was detected but no card number found, return just the type
  if (detectedCardType) {
    return detectedCardType;
  }

  return '';
}

/**
 * Fetch merchant logo using imagesearch API
 * @param {string} merchantName - Merchant name to search for
 * @returns {Promise<string|null>} Logo URL or null if not found
 */
async function fetchMerchantLogo(merchantName) {
  if (!merchantName || merchantName.trim().length === 0) {
    return null;
  }

  try {
    const queries = [
      merchantName,
      `${merchantName} logo`,
      merchantName.replace(/\s+/g, '+'),
      merchantName.replace(/\s+/g, ''),
    ];

    const pickUrl = (data) => {
      if (!data) return null;

      // Handle the specific array response format from imagesearch API
      if (Array.isArray(data) && data.length > 0) {
        const firstItem = data[0];
        if (firstItem && typeof firstItem === 'object') {
          const fullUrl = firstItem.fullurl;
          if (fullUrl && /^https?:\/\//i.test(fullUrl)) {
            return proxyImageUrl(fullUrl);
          }
        }

        // Fallback: try other objects in array
        for (const item of data) {
          if (item && typeof item === 'object') {
            const url = item.fullurl || item.url || item.image || item.src || item.link || item.thumburl;
            if (url && /^https?:\/\//i.test(url)) {
              return proxyImageUrl(url);
            }
          }
        }
        return null;
      }

      // Handle object response
      if (typeof data === 'object') {
        const arr = data.images || data.results || data.data || data.items || [];
        if (Array.isArray(arr) && arr.length > 0) {
          const firstItem = arr[0];
          if (firstItem && typeof firstItem === 'object') {
            const url = firstItem.fullurl || firstItem.url || firstItem.image || firstItem.src || firstItem.link;
            if (url && /^https?:\/\//i.test(url)) return proxyImageUrl(url);
          }
        }

        const directUrl = data.url || data.image || data.src || data.link || data.fullurl;
        if (directUrl && /^https?:\/\//i.test(directUrl)) return proxyImageUrl(directUrl);
      }

      return null;
    };

    for (const qRaw of queries) {
      const queryWithLogo = `${qRaw} logo`;
      const q = encodeURIComponent(queryWithLogo);
      
      try {
        const resp = await fetch(`/imagesearch?searchkeyword=${q}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!resp.ok) {
          continue;
        }

        let data;
        const contentType = resp.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
          data = await resp.json();
        } else {
          const text = await resp.text();
          try {
            data = JSON.parse(text);
          } catch {
            // If it's not JSON, try to extract URL from text
            const urlMatch = text.match(/(https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp))/i);
            if (urlMatch) {
              return urlMatch[1];
            } else {
              continue;
            }
          }
        }

        const candidate = pickUrl(data);
        if (candidate && /^https?:\/\//i.test(candidate)) {
          console.log(`Found logo for ${merchantName}: ${candidate}`);
          return candidate;
        }
      } catch (error) {
        console.warn(`Error fetching logo for query "${queryWithLogo}":`, error);
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching merchant logo for ${merchantName}:`, error);
    return null;
  }
}

/**
 * Parse receipt image/PDF and extract merchant name, date, payment method, and logo
 * Supports both image files (JPEG, PNG, etc.) and PDF files
 * @param {File|string} fileOrUrl - Image file, PDF file, or image URL
 * @param {Array} merchantsList - Optional list of merchant objects for matching (like mobile app)
 * @returns {Promise<{merchantName: string, purchaseDate: string, paymentMethod: string, merchantLogo: string}>}
 */
export async function parseReceipt(fileOrUrl, merchantsList = []) {
  try {
    console.log('Starting receipt parsing...');
    
    // Check file type for logging
    if (fileOrUrl instanceof File) {
      console.log(`File type: ${fileOrUrl.type}, Name: ${fileOrUrl.name}`);
    }
    
    // Extract text from receipt image/PDF
    const extractedText = await extractTextFromReceipt(fileOrUrl);
    console.log('Extracted text (first 1000 chars):', extractedText.substring(0, 1000)); // Log first 1000 chars
    console.log('Total extracted text length:', extractedText.length);
    
    // Parse individual fields
    const merchantName = parseMerchantName(extractedText, merchantsList);
    const purchaseDate = parsePurchaseDate(extractedText);
    const paymentMethod = parsePaymentMethod(extractedText);
    
    // Fetch merchant logo if merchant name was detected
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
    console.log('===========================');
    
    // Log first few lines for debugging merchant name
    const firstLines = extractedText.split('\n').slice(0, 10).map((line, i) => `${i + 1}: ${line.trim()}`);
    console.log('First 10 lines of extracted text:', firstLines);
    
    return {
      merchantName,
      purchaseDate,
      paymentMethod,
      merchantLogo, // Include merchant logo URL
      rawText: extractedText, // Include raw text for debugging
    };
  } catch (error) {
    console.error('Receipt parsing error:', error);
    return {
      merchantName: '',
      purchaseDate: '',
      paymentMethod: '',
      merchantLogo: null,
      rawText: '',
    };
  }
}
