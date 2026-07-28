import { parseReceiptTags, toTaxLabel } from "./receiptFormatters";
import { collectReceiptMediaUrls } from "./mediaUrlUtils";

/**
 * Build the "View" receipt-image cell for a report row.
 *
 * Fixes: previously the cell linked to the raw `emailAttachment` field, which is often
 * "0", empty, or several comma-joined URLs — so the link pointed at nothing. Here we
 * collect the receipt's real image URLs (emailAttachment + receipt_image, split &
 * deduped) and:
 *   • link the first image via a normal href (works in PDF and as a fallback), and
 *   • carry ALL urls in data-images so the preview window's viewer can page through
 *     them with next/prev when a receipt has more than one image.
 * The onclick calls the viewer when present (interactive preview) and otherwise just
 * follows the href (PDF / plain new tab).
 */
const buildReceiptImageCell = (receipt, fontSize = "11px") => {
  const urls = collectReceiptMediaUrls(receipt);
  if (!urls.length) return `<span style="color: #999;">—</span>`;
  const label = urls.length > 1 ? `View (${urls.length})` : "View";
  const dataImages = urls.join("|").replace(/"/g, "&quot;");
  const firstUrl = urls[0].replace(/"/g, "&quot;");
  return (
    `<a href="${firstUrl}" target="_blank" rel="noopener noreferrer" ` +
    `data-images="${dataImages}" ` +
    `onclick="return window.__openReceiptImages ? window.__openReceiptImages(event, this) : true" ` +
    `style="color: #1a73e8; text-decoration: none; font-weight: 500; cursor: pointer; font-size: ${fontSize};">${label}</a>`
  );
};

// Unified payment display logic (exported so the CSV/ZIP export renders the exact
// same payment string as the on-screen/PDF report table).
export const getPaymentDisplay = (r) => {
  if (!r.paymentType && !r.card_issuer_name) return "—";

  if (r.paymentType && r.card_issuer_name && r.last_4_digit_card) {
    const basePaymentType = r.paymentType.replace(/\s*\*\d+$/, "").trim();

    const normalizedBase = basePaymentType.toLowerCase();
    const normalizedIssuer = r.card_issuer_name.toLowerCase();

    if (
      normalizedBase.includes(normalizedIssuer) ||
      normalizedIssuer.includes(normalizedBase)
    ) {
      const finalName =
        basePaymentType.length > r.card_issuer_name.length
          ? basePaymentType
          : r.card_issuer_name;
      return `${finalName} *${r.last_4_digit_card}`;
    } else {
      return `${basePaymentType} ${r.card_issuer_name} *${r.last_4_digit_card}`;
    }
  }

  if (r.paymentType && r.last_4_digit_card) {
    const basePaymentType = r.paymentType.replace(/\s*\*\d+$/, "").trim();
    return `${basePaymentType} *${r.last_4_digit_card}`;
  }

  // Card network + issuer but no last 4 (e.g. "MasterCard" + "Bank of America"):
  // keep the issuer instead of dropping it, so it reads "MasterCard Bank of America".
  if (r.paymentType && r.card_issuer_name) {
    const basePaymentType = r.paymentType.replace(/\s*\*\d+$/, "").trim();
    const normalizedBase = basePaymentType.toLowerCase();
    const normalizedIssuer = r.card_issuer_name.toLowerCase();
    if (
      normalizedBase.includes(normalizedIssuer) ||
      normalizedIssuer.includes(normalizedBase)
    ) {
      return basePaymentType.length > r.card_issuer_name.length
        ? basePaymentType
        : r.card_issuer_name;
    }
    return `${basePaymentType} ${r.card_issuer_name}`;
  }

  if (r.paymentType) {
    return r.paymentType;
  }

  if (r.card_issuer_name && r.last_4_digit_card) {
    return `${r.card_issuer_name} *${r.last_4_digit_card}`;
  }

  return "—";
};

// Helper function for applied filters text
const getAppliedFiltersText = (filters, sortConfig, searchTerm, formatCurrencyFixed2, allReceipts = []) => {
  const filterTexts = [];

  // Date filter - always show date range
  const dateFilterText = (() => {
    if (filters.date) {
      // If user has selected a date range, show that
      const startDate = filters.date.startDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const endDate = filters.date.endDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return `<div style="margin-bottom: 5px;"><strong>Date Range:</strong> ${startDate} to ${endDate}</div>`;
    } else {
      // If no date range selected, show oldest receipt date to current date
      // Find oldest receipt date from the receipts
      let oldestDate = new Date();
      if (allReceipts && allReceipts.length > 0) {
        const validReceipts = allReceipts.filter(r => r.product_date);
        if (validReceipts.length > 0) {
          const sortedReceipts = [...validReceipts].sort((a, b) =>
            (a.product_date || 0) - (b.product_date || 0)
          );
          const oldestReceipt = sortedReceipts[0];
          if (oldestReceipt && oldestReceipt.product_date) {
            oldestDate = new Date(Number(oldestReceipt.product_date) * 1000);
          }
        }
      }

      const startDateStr = oldestDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const endDateStr = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return `<div style="margin-bottom: 5px;"><strong>Date Range:</strong> ${startDateStr} to ${endDateStr}</div>`;
    }
  })();
  filterTexts.push(dateFilterText);

  // Receipt Category filter (renamed to Expense Type - Business/Personal)
  if (filters.receiptCategory?.length > 0) {
    const receiptCatText = filters.receiptCategory
      .map((cat) => (cat === "0" ? "Personal" : cat === "1" ? "Business" : cat))
      .sort()
      .join(", ");
    filterTexts.push(`<div style="margin-bottom: 5px;"><strong>Expense Type:</strong> ${receiptCatText}</div>`);
  }

  // Merchant filter
  if (filters.merchant?.length > 0) {
    const merchantText = [...filters.merchant].sort().join(", ");
    filterTexts.push(`<div style="margin-bottom: 5px;"><strong>Merchant:</strong> ${merchantText}</div>`);
  }

  // Expense Category filter (renamed from Expense Type)
  if (filters.expenseCategory?.length > 0) {
    const categoryText = [...filters.expenseCategory].sort().join(", ");
    filterTexts.push(`<div style="margin-bottom: 5px;"><strong>Expense Category:</strong> ${categoryText}</div>`);
  }

// Payment Method filter with receipt data
if (filters.paymentMethod?.length > 0 && allReceipts.length > 0) {
  // Get unique payment methods from filtered receipts
  const paymentMethodsFromReceipts = new Set();

  allReceipts.forEach(receipt => {
    const paymentDisplay = getPaymentDisplay(receipt);
    if (paymentDisplay && paymentDisplay !== "—") {
      paymentMethodsFromReceipts.add(paymentDisplay);
    }
  });

  // Filter only the payment methods that match the filter
  const filteredPaymentMethods = [...paymentMethodsFromReceipts]
    .filter(payment => {
      // Check if this payment method matches any of the filter criteria
      // This is simplified - you might need more complex matching logic
      return filters.paymentMethod.some(filterPayment => {
        const normalizedFilter = filterPayment.toLowerCase();
        const normalizedPayment = payment.toLowerCase();
        return normalizedPayment.includes(normalizedFilter) ||
               normalizedFilter.includes(normalizedPayment);
      });
    })
    .sort();

  if (filteredPaymentMethods.length > 0) {
    const paymentText = filteredPaymentMethods.join(", ");
    filterTexts.push(`<div style="margin-bottom: 5px;"><strong>Payment Method:</strong> ${paymentText}</div>`);
  }
}

  // Tax Types & Tips filter
  if (filters.taxTypes?.length > 0) {
    const sortedTaxTypes = [...filters.taxTypes].sort();
    const taxText = sortedTaxTypes.join(", ");
    filterTexts.push(`<div style="margin-bottom: 5px;"><strong>Tax Types:</strong> ${taxText}</div>`);
  }

  // Tags filter (exclude locked/unlocked from tags display)
  if (filters.tags?.length > 0) {
    const tagDisplayNames = {
      verified: "Verified",
      unverified: "Unverified",
      starred: "Starred",
      unstarred: "Unstarred",
      flagged: "Flagged",
      unflagged: "Unflagged",
      reconciled: "Reconciled",
      unreconciled: "Unreconciled",
      reimbursed: "Reimbursement",
      unreimbursed: "Not Reimbursed",
      warrantied: "Warrantied",
      unwarrantied: "Unwarrantied",
    };

    // Filter out locked/unlocked from tags display
    const tagsWithoutLocked = filters.tags.filter(
      tag => tag !== "locked" && tag !== "unlocked"
    );

    if (tagsWithoutLocked.length > 0) {
      const tagsText = tagsWithoutLocked
        .map((tag) => tagDisplayNames[tag] || tag)
        .sort()
        .join(", ");
      filterTexts.push(`<div style="margin-bottom: 5px;"><strong>Tags:</strong> ${tagsText}</div>`);
    }
  }

  // Locked status filter (show only if locked is selected, not unlocked)
  const hasLockedFilter = filters.tags?.includes("locked");
  if (hasLockedFilter) {
    filterTexts.push(`<div style="margin-bottom: 5px;"><strong>Locked:</strong> Yes</div>`);
  }

  // Price filter (renamed to Total)
  if (filters.price) {
    if (filters.price.type === "greaterThan") {
      filterTexts.push(
        `<div style="margin-bottom: 5px;"><strong>Total:</strong> Greater than ${formatCurrencyFixed2(
          filters.price.value || 0
        )}</div>`
      );
    } else if (filters.price.type === "range") {
      const min = formatCurrencyFixed2(filters.price.min ?? 0);
      const max = filters.price.max == null || filters.price.max === ""
        ? "No limit"
        : formatCurrencyFixed2(filters.price.max);
      filterTexts.push(
        `<div style="margin-bottom: 5px;"><strong>Total:</strong> ${min} to ${max}</div>`
      );
    }
  }

  // Sort filters (renamed to Sorted By)
  const sortFilters = [];
  if (sortConfig.order) {
    sortFilters.push(`${sortConfig.order === "az" ? "A to Z" : "Z to A"}`);
  }
  if (sortConfig.date) {
    sortFilters.push(
      `${sortConfig.date === "newest" ? "Newest First" : "Oldest First"}`
    );
  }
  if (sortConfig.amount) {
    sortFilters.push(
      `${sortConfig.amount === "asc" ? "Lowest Amount" : "Highest Amount"}`
    );
  }

  if (sortFilters.length > 0) {
    filterTexts.push(
      `<div style="margin-bottom: 5px;"><strong>Sorted By:</strong> ${sortFilters.join(", ")}</div>`
    );
  } else {
    filterTexts.push(
      `<div style="margin-bottom: 5px;"><strong>Sorted By:</strong> Newest First (Default)</div>`
    );
  }

  // Search filter
  if (searchTerm) {
    filterTexts.push(
      `<div style="margin-bottom: 5px;"><strong>Search:</strong> "${searchTerm}"</div>`
    );
  }

  return filterTexts.length > 0
    ? filterTexts.join("")
    : "<div>No filters applied</div>";
};

// Tax Report Generator
export const generateTaxReportHTML = ({
  receipts,
  selectedTaxes,
  monthLabel,
  filters,
  sortConfig,
  searchTerm,
  formatCurrencyFixed2,
  userName = ""
}) => {
  const userDisplay = userName ? ` (${userName})` : "";
  let html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <div style="font-weight: bold; margin-bottom: 10px; font-size: 18px; text-align: left; color: #333;">
        Tax Report - Categorizr${userDisplay}
      </div>

      <div style="font-size: 14px; color: #666; text-align: left; margin-bottom: 5px;">
        <strong>Report Date:</strong> ${new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </div>

      <div style="margin-bottom: 10px; font-size: 14px; color: #666; text-align: left; font-weight: 500;">
        <strong>Number of Receipts:</strong> ${receipts.length} receipts
      </div>

      <div style="margin-bottom: 20px; font-size: 11px; color: #555; background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef;">
        <div style="font-weight: bold; margin-bottom: 8px; text-align: left;">Applied Filters:</div>
        <div style="text-align: left;">
          ${getAppliedFiltersText(filters, sortConfig, searchTerm, formatCurrencyFixed2, receipts)}
        </div>
      </div>

      <table border="1" cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; font-size: 8px; border: 1px solid #333; table-layout: fixed;">
        <colgroup>
          <col style="width: 25px;">
          <col style="width: 65px;">
          <col style="width: 105px;">
          <col style="width: 105px;">
          <col style="width: 85px;">
          <col style="width: 55px;">
          <col style="width: 65px;">
          <col style="width: 50px;">
          <col style="width: 40px;">
          <col style="width: 55px;">
          <col style="width: 32px;">
        </colgroup>
        <thead style="background: #f8f9fa; font-weight: bold; border-bottom: 2px solid #333;">
          <tr>
            <th style="text-align: center; padding: 2px 4px; border: 1px solid #ddd;">#</th>
            <th style="text-align: left; padding: 2px 4px; border: 1px solid #ddd; white-space: nowrap;">DATE</th>
            <th style="text-align: left; padding: 2px 4px; border: 1px solid #ddd; white-space: nowrap;">MERCHANT</th>
            <th style="text-align: left; padding: 2px 4px; border: 1px solid #ddd; white-space: nowrap;">PAYMENT METHOD</th>
            <th style="text-align: left; padding: 2px 4px; border: 1px solid #ddd;">EXPENSE CATEGORY</th>
            <th style="text-align: right; padding: 2px 4px; border: 1px solid #ddd;">SUBTOTAL</th>
            <th style="text-align: right; padding: 2px 4px; border: 1px solid #ddd;">TAX TYPES</th>
            <th style="text-align: right; padding: 2px 4px; border: 1px solid #ddd;">TAX AMT</th>
            <th style="text-align: right; padding: 2px 4px; border: 1px solid #ddd;">TIPS</th>
            <th style="text-align: right; padding: 2px 4px; border: 1px solid #ddd;">TOTAL</th>
            <th style="text-align: center; padding: 2px 4px; border: 1px solid #ddd;">IMAGE</th>
          </tr>
        </thead>
        <tbody>
  `;

  let receiptNumber = 1;
  const taxTypeTotals = {};
  let grandSubtotal = 0;
  let grandTax = 0;
  let grandTips = 0;
  let grandTotal = 0;

  receipts.forEach((receipt, index) => {
    const background = index % 2 === 0 ? "#ffffff" : "#f8f9fa";
    const dateStr = receipt.product_date
      ? new Date(Number(receipt.product_date) * 1000).toLocaleDateString("en-US", {
          timeZone: "UTC", // UTC calendar day — avoid off-by-one in timezones behind UTC.
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";

    // Calculate values
    const total = Number(receipt.purchasePrice || 0);
    const taxValues = receipt.receipt_tax_values || [];

    // Filter out tips and get only taxes
    const taxes = taxValues.filter(
      (tax) => !(tax.tax_name || "").toLowerCase().includes("tip")
    );

    // Calculate total tax amount
    const totalTax = taxes.reduce(
      (sum, tax) => sum + (Number(tax.tax_amount) || 0),
      0
    );

    // Find tips
    const tips = taxValues.find((tax) =>
      (tax.tax_name || "").toLowerCase().includes("tip")
    );
    const tipsAmount = tips ? Number(tips.tax_amount || 0) : 0;

    // Calculate subtotal
    const subtotal = total - totalTax - tipsAmount;

    // Update grand totals
    grandSubtotal += subtotal;
    grandTax += totalTax;
    grandTips += tipsAmount;
    grandTotal += total;

    // Build tax types and amounts strings
    let taxTypesHTML = "";
    let taxAmountsHTML = "";

    taxes.forEach((tax) => {
      const taxName = tax.tax_name || "Tax";
      const taxRate = Math.round(Number(tax.tax_rate) || 0);
      const taxAmount = Number(tax.tax_amount || 0);

      // Update tax type totals
      const taxKey = `${taxName} (${taxRate}%)`;
      if (!taxTypeTotals[taxKey]) {
        taxTypeTotals[taxKey] = 0;
      }
      taxTypeTotals[taxKey] += taxAmount;

      taxTypesHTML += `<div style="margin: 0; text-align: right; font-weight: 500; line-height: 1.2;">${taxName} (${taxRate}%)</div>`;
      taxAmountsHTML += `<div style="margin: 0; text-align: right; font-weight: 500; line-height: 1.2;">${formatCurrencyFixed2(
        taxAmount
      )}</div>`;
    });

    if (taxes.length === 0) {
      taxTypesHTML = "<div style='text-align: right; color: #999;'>—</div>";
      taxAmountsHTML = "<div style='text-align: right; color: #999;'>—</div>";
    }

    // Get payment display
    const paymentDisplayText = getPaymentDisplay(receipt);

    const viewIconHTML = buildReceiptImageCell(receipt, "8px");

    html += `
      <tr style="background: ${background};">
        <td style="padding: 2px 4px; border: 1px solid #ddd; text-align: center; font-weight: 600; vertical-align: middle; font-size: 8px;">${String(
          receiptNumber
        ).padStart(3, "0")}</td>
        <td style="padding: 2px 4px; border: 1px solid #ddd; vertical-align: middle; font-size: 8px; white-space: nowrap;">${dateStr}</td>
        <td style="padding: 2px 4px; border: 1px solid #ddd; vertical-align: middle; font-size: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${
          receipt.storeName || "Untitled"
        }</td>
        <td style="padding: 2px 4px; border: 1px solid #ddd; vertical-align: middle; font-size: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${paymentDisplayText}</td>
        <td style="padding: 2px 4px; border: 1px solid #ddd; vertical-align: middle; font-size: 8px;">${
          receipt.expense_type || "—"
        }</td>
        <td style="padding: 2px 4px; border: 1px solid #ddd; text-align: right; vertical-align: middle; font-size: 8px;">${formatCurrencyFixed2(
          subtotal
        )}</td>
        <td style="padding: 2px 4px; border: 1px solid #ddd; text-align: right; vertical-align: middle; font-size: 8px;">${taxTypesHTML}</td>
        <td style="padding: 2px 4px; border: 1px solid #ddd; text-align: right; vertical-align: middle; font-size: 8px;">${taxAmountsHTML}</td>
        <td style="padding: 2px 4px; border: 1px solid #ddd; text-align: right; vertical-align: middle; font-size: 8px;">${formatCurrencyFixed2(
          tipsAmount
        )}</td>
        <td style="padding: 2px 4px; border: 1px solid #ddd; text-align: right; vertical-align: middle; font-weight: 600; font-size: 8px;">${formatCurrencyFixed2(
          total
        )}</td>
        <td style="padding: 2px 4px; border: 1px solid #ddd; text-align: center; vertical-align: middle; font-size: 8px;">${viewIconHTML}</td>
      </tr>
    `;

    receiptNumber++;
  });

  // Add totals row
  html += `
    <tr style="background: #e8f0fe; font-weight: bold; border-top: 2px solid #333;">
      <td style="padding: 3px 4px; border: 1px solid #ddd; text-align: right; font-size: 8px;" colspan="5">TOTAL</td>
      <td style="padding: 3px 4px; border: 1px solid #ddd; text-align: right; font-size: 8px;">${formatCurrencyFixed2(
        grandSubtotal
      )}</td>
      <td style="padding: 3px 4px; border: 1px solid #ddd; text-align: right; color: #999; font-size: 8px;">—</td>
      <td style="padding: 3px 4px; border: 1px solid #ddd; text-align: right; font-size: 8px;">${formatCurrencyFixed2(
        grandTax
      )}</td>
      <td style="padding: 3px 4px; border: 1px solid #ddd; text-align: right; font-size: 8px;">${formatCurrencyFixed2(
        grandTips
      )}</td>
      <td style="padding: 3px 4px; border: 1px solid #ddd; text-align: right; font-size: 8px;">${formatCurrencyFixed2(
        grandTotal
      )}</td>
      <td style="padding: 3px 4px; border: 1px solid #ddd; text-align: center; color: #999; font-size: 8px;">—</td>
    </tr>
  `;

  html += `
        </tbody>
      </table>
  `;

  // Add tax summary
  if (Object.keys(taxTypeTotals).length > 0) {
    html += `
      <div style="margin-top: 25px; padding: 15px; background: #f8f9fa; border: 1px solid #333; border-radius: 6px;">
        <div style="font-weight: bold; margin-bottom: 12px; font-size: 14px; color: #333; text-align: center;">Tax Summary</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
    `;

    Object.entries(taxTypeTotals).forEach(([taxType, totalAmount]) => {
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: white; border: 1px solid #ddd; border-radius: 4px;">
          <span style="font-weight: 600; color: #333; font-size: 12px;">${taxType}</span>
          <span style="font-weight: bold; color: #1e40af; font-size: 12px;">${formatCurrencyFixed2(
            totalAmount
          )}</span>
        </div>
      `;
    });

    html += `</div></div>`;
  }

  html += `</div>`;

  return html;
};

// Summary Report Generator
export const generateSummaryHTML = ({
  filters,
  sortConfig,
  searchTerm,
  filteredReceipts,
  formatCurrencyFixed2,
  userName = ""
}) => {
  const userDisplay = userName ? ` (${userName})` : "";
  let html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <div style="font-weight: bold; margin-bottom: 10px; font-size: 18px; text-align: left; color: #333;">
        Summary Report - Categorizr${userDisplay}
      </div>

      <div style="font-size: 14px; color: #666; text-align: left; margin-bottom: 5px;">
        <strong>Report Date:</strong> ${new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </div>

      <div style="margin-bottom: 10px; font-size: 14px; color: #666; text-align: left; font-weight: 500;">
        <strong>Number of Receipts:</strong> ${filteredReceipts.length} receipts
      </div>

      <div style="margin-bottom: 20px; font-size: 11px; color: #555; background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef;">
        <div style="font-weight: bold; margin-bottom: 8px; text-align: left;">Applied Filters:</div>
        <div style="text-align: left;">
          ${getAppliedFiltersText(filters, sortConfig, searchTerm, formatCurrencyFixed2, filteredReceipts)}
        </div>
      </div>
  `;

  // Group by year
  const groupedByYear = {};
  filteredReceipts.forEach((receipt) => {
    const year = receipt.product_date
      ? new Date(Number(receipt.product_date) * 1000).getFullYear()
      : "No Date";
    if (!groupedByYear[year]) groupedByYear[year] = [];
    groupedByYear[year].push(receipt);
  });

  let globalIndex = 1;

  // Real years newest-first, with the undated "No Date" group always at the end.
  const groupKeys = Object.keys(groupedByYear);
  const hasNoDate = groupKeys.includes("No Date");
  const orderedYears = [
    ...groupKeys.filter((y) => y !== "No Date").sort((a, b) => b - a),
    ...(hasNoDate ? ["No Date"] : []),
  ];

  orderedYears.forEach((year) => {
      const yearReceipts = groupedByYear[year];
      const yearTotal = yearReceipts.reduce(
        (sum, r) => sum + (Number(r.purchasePrice) || 0),
        0
      );

      html += `
      <div style="margin-bottom: 20px;">
        <div style="font-weight: bold; font-size: 13px; background: #e8f0fe; padding: 8px 12px; border-radius: 4px; margin-bottom: 10px;">
          ${year} - Total: ${formatCurrencyFixed2(yearTotal)}
        </div>
        <table border="1" cellspacing="0" cellpadding="4" style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 15px;">
          <thead style="background: #f1f1f1; font-weight: bold;">
            <tr>
              <th style="text-align: left; padding: 6px; width: 35px;">#</th>
              <th style="text-align: left; padding: 6px; width: 90px; white-space: nowrap;">DATE</th>
              <th style="text-align: left; padding: 6px;">MERCHANT</th>
              <th style="text-align: left; padding: 6px;">EXPENSE CATEGORY</th>
              <th style="text-align: left; padding: 6px;">PAYMENT METHOD</th>
              <th style="text-align: right; padding: 6px; width: 70px;">TOTAL</th>
              <th style="text-align: center; padding: 6px; width: 70px;">RECEIPT IMAGE</th>
            </tr>
          </thead>
          <tbody>
      `;

      yearReceipts.forEach((receipt, idx) => {
        const dateStr = receipt.product_date
          ? new Date(Number(receipt.product_date) * 1000).toLocaleDateString("en-US", {
              timeZone: "UTC", // product_date is a UTC calendar day — format in UTC so it
              day: "numeric",  // never shows one day earlier in timezones behind UTC.
              month: "short",
              year: "numeric",
            })
          : "—";

        const background = idx % 2 === 0 ? "#ffffff" : "#f8f9fa";
        const imageCellHTML = buildReceiptImageCell(receipt);

        // Simple payment display for summary report
        const paymentDisplayText = getPaymentDisplay(receipt);

        html += `
        <tr style="background: ${background};">
          <td style="text-align: left; padding: 6px; font-size: 11px;">${String(
            globalIndex
          ).padStart(3, "0")}</td>
          <td style="text-align: left; padding: 6px; font-size: 11px; white-space: nowrap;">${dateStr}</td>
          <td style="text-align: left; padding: 6px; font-size: 11px;">${
            receipt.storeName || "Untitled"
          }</td>
          <td style="text-align: left; padding: 6px; font-size: 11px;">${
            receipt.expense_type || "—"
          }</td>
          <td style="text-align: left; padding: 6px; font-size: 11px;">${paymentDisplayText}</td>
          <td style="text-align: right; padding: 6px; font-size: 11px; font-weight: 600;">${formatCurrencyFixed2(
            receipt.purchasePrice || 0
          )}</td>
          <td style="text-align: center; padding: 6px; font-size: 11px;">
          ${imageCellHTML}
          </td>
        </tr>
      `;
        globalIndex++;
      });

      html += `
          </tbody>
        </table>
      </div>
    `;
    });

  const totalSum = filteredReceipts.reduce(
    (sum, r) => sum + (Number(r.purchasePrice) || 0),
    0
  );

  html += `
    <div style="border-top: 2px solid #333; padding-top: 15px; margin-top: 20px;">
      <table style="width: 100%; font-size: 13px; font-weight: bold;">
        <tr>
          <td style="text-align: right; padding: 6px;">GRAND TOTAL:</td>
          <td style="text-align: right; padding: 6px; min-width: 100px;">${formatCurrencyFixed2(
            totalSum
          )}</td>
        </tr>
        <tr>
          <td style="text-align: right; padding: 6px;">Total Receipts:</td>
          <td style="text-align: right; padding: 6px;">${
            filteredReceipts.length
          }</td>
        </tr>
      </table>
    </div>`;

  return html;
};
