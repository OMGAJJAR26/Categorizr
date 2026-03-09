// utils/generatePDF.js
import html2pdf from "html2pdf.js";

// helper: format money using saved language->currency selection
const fmtMoney = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  const lang = localStorage.getItem("appLanguage") || "English";

  const localeMap = {
    English: "en-US",
    Spanish: "es-ES",
    India: "hi-IN",
    Canadian: "en-CA",
  };
  const currencyMap = {
    English: "USD",
    Spanish: "EUR",
    India: "INR",
    Canadian: "CAD",
  };

  const locale = localeMap[lang] || "en-US";
  const currency = currencyMap[lang] || "USD";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return num.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
};

// helper: safe date format "MMM d" (e.g., Sep 24)
const fmtDate = (epochSeconds) => {
  if (!epochSeconds) return "—";
  const n = Number(epochSeconds);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Date(n * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
};

// helper: get all tax types and amounts for a receipt (excluding tips)
const getAllTaxes = (receipt) => {
  const taxes = [];
  if (Array.isArray(receipt?.receipt_tax_values)) {
    receipt.receipt_tax_values.forEach(tax => {
      if (tax?.tax_name && tax?.tax_rate !== undefined) {
        // Exclude tips from tax types
        const taxName = (tax.tax_name ?? "").toString().trim().toLowerCase();
        if (taxName !== "tip" && taxName !== "tips") {
          taxes.push({
            type: `${tax.tax_name}(${tax.tax_rate}%)`,
            amount: Number(tax.tax_amount) || 0
          });
        }
      }
    });
  }
  return taxes;
};

// helper: compute subtotal
const getSubtotal = (r) => {
  if (typeof r?.subtotal !== "undefined") {
    const n = Number(r.subtotal);
    if (Number.isFinite(n)) return n;
  }
  const price = Number(r?.purchasePrice);
  const taxes = (Array.isArray(r?.receipt_tax_values) ? r.receipt_tax_values : []).reduce(
    (sum, tv) => sum + (Number(tv?.tax_amount) || 0),
    0
  );
  if (Number.isFinite(price)) {
    if (Number.isFinite(taxes)) return price - taxes;
    return price;
  }
  return null;
};

// helper: get tips (completely separate from taxes)
const getTips = (r) => {
  // First check the direct tips field
  if (typeof r?.tips !== "undefined") {
    const n = Number(r.tips);
    if (Number.isFinite(n)) return n;
  }
  
  // Then check for tips in tax_values but keep it separate
  const list = Array.isArray(r?.receipt_tax_values) ? r.receipt_tax_values : [];
  const tipLike = list.find((tv) => {
    const nm = (tv?.tax_name ?? "").toString().trim().toLowerCase();
    return nm === "tip" || nm === "tips";
  });
  const amt = tipLike ? Number(tipLike.tax_amount) : NaN;
  return Number.isFinite(amt) ? amt : null;
};

// helper: get total
const getTotal = (r) => {
  const price = Number(r?.purchasePrice);
  if (Number.isFinite(price)) return price;
  const sub = getSubtotal(r);
  const tips = getTips(r) || 0;
  if (sub === null) return null;
  return sub + tips;
};

// Main function
export const generateTaxReportPDF = ({
  receipts = [],
  filters = {},
} = {}) => {
  
  const reportDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Create simple header
  const headerHtml = `
    <div style="font-family: Arial, sans-serif; margin-bottom: 20px;">
      <h1 style="margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">TAX REPORT - CATEGORIZER</h1>
      <div style="font-size: 12px; margin-bottom: 5px;"><strong>Report Date:</strong> ${reportDate}</div>
    </div>
  `;

  // Create table HTML
  const createTableHtml = (receipts) => {
    const rowsHtml = receipts
      .map((r, idx) => {
        const date = fmtDate(r?.product_date);
        const merchant = r?.storeName || r?.merchant_name || r?.merchant || "Untitled";
        const category = r?.expense_type || "—";
        const sub = getSubtotal(r);
        const tips = getTips(r);
        const total = getTotal(r);

        // Get all tax types and amounts for this receipt (excluding tips)
        const taxes = getAllTaxes(r);
        
        // Create tax types and amounts HTML (stacked)
        const taxTypesHtml = taxes.map(tax => 
          `<div style="padding: 2px 0;">${tax.type}</div>`
        ).join('');
        
        const taxAmountsHtml = taxes.map(tax => 
          `<div style="padding: 2px 0; text-align: right;">${fmtMoney(tax.amount)}</div>`
        ).join('');

        return `
          <tr style="background: ${idx % 2 ? "#f9fafb" : "#fff"};">
            <td style="padding:6px; font-family: monospace; text-align: center;">${String(idx + 1).padStart(4, '0')}</td>
            <td style="padding:6px; text-align: center;">${date}</td>
            <td style="padding:6px;">${merchant}</td>
            <td style="padding:6px;">${category}</td>
            <td style="padding:6px; text-align:left;">${sub === null ? "—" : fmtMoney(sub)}</td>
            <td style="padding:6px; vertical-align: top;">
              ${taxes.length > 0 ? taxTypesHtml : "—"}
            </td>
            <td style="padding:6px; vertical-align: top; text-align: right;">
              ${taxes.length > 0 ? taxAmountsHtml : "—"}
            </td>
            <td style="padding:6px; text-align:right;">${tips === null ? "—" : fmtMoney(tips)}</td>
            <td style="padding:6px; text-align:right;">${total === null ? "—" : fmtMoney(total)}</td>
            <td style="padding:6px; text-align:center;">
              <span style="display:inline-block;width:12px;height:12px;border:1px solid #999;border-radius:2px;"></span>
            </td>
          </tr>
        `;
      })
      .join("");

    // Calculate totals
    const totals = receipts.reduce(
      (acc, r) => {
        const sub = getSubtotal(r);
        acc.sub += sub || 0;
        
        const taxes = getAllTaxes(r);
        taxes.forEach(tax => {
          if (!acc.taxTotals[tax.type]) {
            acc.taxTotals[tax.type] = 0;
          }
          acc.taxTotals[tax.type] += tax.amount;
        });
        
        const tp = getTips(r);
        acc.tips += tp || 0;
        
        const ttl = getTotal(r);
        acc.total += ttl || 0;
        
        return acc;
      },
      { sub: 0, taxTotals: {}, tips: 0, total: 0 }
    );

    // Get all unique tax types for totals (excluding tips)
    const allTaxTypes = [];
    receipts.forEach(r => {
      const taxes = getAllTaxes(r);
      taxes.forEach(tax => {
        if (!allTaxTypes.includes(tax.type)) {
          allTaxTypes.push(tax.type);
        }
      });
    });

    // Create totals row with stacked tax types and amounts
    const taxTypesTotalHtml = allTaxTypes.map(taxType => 
      `<div style="padding: 2px 0;">${taxType}</div>`
    ).join('');
    
    const taxAmountsTotalHtml = allTaxTypes.map(taxType => 
      `<div style="padding: 2px 0; text-align: right;">${fmtMoney(totals.taxTotals[taxType] || 0)}</div>`
    ).join('');

    return `
      ${headerHtml}
      <table border="1" cellspacing="0" cellpadding="0" style="width:100%; border-collapse: collapse; font-size:11px;">
        <thead style="background:#f1f1f1; font-weight: 700;">
          <tr>
            <th style="text-align:center; padding:6px; width:50px;">#</th>
            <th style="text-align:center; padding:6px; width:60px;">Date</th>
            <th style="text-align:left; padding:6px; width:150px;">Merchant</th>
            <th style="text-align:left; padding:6px; width:80px;">Category</th>
            <th style="text-align:right; padding:6px; width:80px;">Subtotal</th>
            <th style="text-align:right; padding:6px; width:100px;">Tax Types</th>
            <th style="text-align:right; padding:6px; width:90px;">Tax Amount</th>
            <th style="text-align:right; padding:6px; width:70px;">Tips</th>
            <th style="text-align:right; padding:6px; width:80px;">TOTAL</th>
            <th style="text-align:center; padding:6px; width:50px;">View</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || `<tr><td colspan="10" style="padding:10px; text-align:center;">No receipts found.</td></tr>`}
          <tr style="background:#f1f1f1; font-weight:700;">
            <td style="padding:6px; text-align:right;" colspan="4">TOTAL</td>
            <td style="padding:6px; text-align:right;">${fmtMoney(totals.sub)}</td>
            <td style="padding:6px; vertical-align: top;">
              ${allTaxTypes.length > 0 ? taxTypesTotalHtml : "—"}
            </td>
            <td style="padding:6px; vertical-align: top; text-align: right;">
              ${allTaxTypes.length > 0 ? taxAmountsTotalHtml : "—"}
            </td>
            <td style="padding:6px; text-align:right;">${fmtMoney(totals.tips)}</td>
            <td style="padding:6px; text-align:right;">${fmtMoney(totals.total)}</td>
            <td style="padding:6px;"></td>
          </tr>
        </tbody>
      </table>
    `;
  };

  const completeHtml = `
    <div style="font-family: Arial, sans-serif; padding: 20px; width: 100%; max-width: 900px;">
      ${createTableHtml(receipts)}
      <div style="text-align: center; margin-top: 20px; font-size: 11px; color: #666;">
        Page 1 of 1
      </div>
    </div>
  `;

  const container = document.createElement("div");
  container.innerHTML = completeHtml;

  const opt = {
    margin: 0.5,
    filename: "Tax_Report.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
  };

  html2pdf().from(container).set(opt).save();
};