/**
 * Receipt Analytics Utility Functions
 * Provides calculations for spending analysis, grouping, and date filtering
 */

/**
 * Validate purchase price - filter out invalid/corrupted values
 * @param {any} price - Price value to validate
 * @returns {number} Valid price or 0
 */
const validatePrice = (price) => {
  if (price === null || price === undefined || price === "") return 0;
  
  const numPrice = parseFloat(price);
  
  // Check if it's a valid number
  if (isNaN(numPrice)) return 0;
  
  // Filter out unreasonably large values (likely corrupted data)
  // Most personal/business expenses should be under $1 million
  if (numPrice > 1000000) {
    console.warn(`Invalid purchase price detected: ${price} - filtering out`);
    return 0;
  }
  
  // Allow negative values (returns/refunds) but filter out extremely negative
  if (numPrice < -1000000) {
    console.warn(`Invalid purchase price detected: ${price} - filtering out`);
    return 0;
  }
  
  return numPrice;
};

/**
 * Calculate total spending for a list of receipts
 * @param {Array} receipts - Array of receipt objects
 * @returns {number} Total spending amount
 */
export const calculateTotalSpending = (receipts) => {
  if (!receipts || !Array.isArray(receipts)) return 0;
  return receipts.reduce((total, receipt) => {
    const price = validatePrice(receipt.purchasePrice);
    return total + price;
  }, 0);
};

/**
 * Calculate average transaction amount
 * @param {Array} receipts - Array of receipt objects
 * @returns {number} Average amount per transaction
 */
export const calculateAverage = (receipts) => {
  if (!receipts || !Array.isArray(receipts) || receipts.length === 0) return 0;
  const total = calculateTotalSpending(receipts);
  const validCount = receipts.filter(r => validatePrice(r.purchasePrice) > 0).length;
  return validCount > 0 ? total / validCount : 0;
};

/**
 * Group receipts by expense category
 * @param {Array} receipts - Array of receipt objects
 * @returns {Object} Object with category names as keys and { total, count, receipts } as values
 */
export const groupByCategory = (receipts) => {
  if (!receipts || !Array.isArray(receipts)) return {};

  return receipts.reduce((groups, receipt) => {
    const category = receipt.expense_type || "Uncategorized";
    if (!groups[category]) {
      groups[category] = { total: 0, count: 0, receipts: [] };
    }
    const price = validatePrice(receipt.purchasePrice);
    groups[category].total += price;
    groups[category].count += 1;
    groups[category].receipts.push(receipt);
    return groups;
  }, {});
};

/**
 * Group receipts by merchant/store name
 * @param {Array} receipts - Array of receipt objects
 * @returns {Object} Object with merchant names as keys and { total, count, receipts } as values
 */
export const groupByMerchant = (receipts) => {
  if (!receipts || !Array.isArray(receipts)) return {};

  return receipts.reduce((groups, receipt) => {
    const merchant = receipt.storeName || receipt.merchant || "Unknown";
    if (!groups[merchant]) {
      groups[merchant] = { total: 0, count: 0, receipts: [] };
    }
    const price = validatePrice(receipt.purchasePrice);
    groups[merchant].total += price;
    groups[merchant].count += 1;
    groups[merchant].receipts.push(receipt);
    return groups;
  }, {});
};

/**
 * Group receipts by payment method
 * @param {Array} receipts - Array of receipt objects
 * @returns {Object} Object with payment methods as keys and { total, count, receipts } as values
 */
export const groupByPaymentMethod = (receipts) => {
  if (!receipts || !Array.isArray(receipts)) return {};

  return receipts.reduce((groups, receipt) => {
    const payment = receipt.paymentType || receipt.card_issuer_name || "Unknown";
    if (!groups[payment]) {
      groups[payment] = { total: 0, count: 0, receipts: [] };
    }
    const price = validatePrice(receipt.purchasePrice);
    groups[payment].total += price;
    groups[payment].count += 1;
    groups[payment].receipts.push(receipt);
    return groups;
  }, {});
};

/**
 * Group receipts by receipt category (Personal/Business)
 * @param {Array} receipts - Array of receipt objects
 * @returns {Object} Object with category types as keys
 */
export const groupByReceiptType = (receipts) => {
  if (!receipts || !Array.isArray(receipts)) return {};

  return receipts.reduce((groups, receipt) => {
    const type = receipt.receipt_category == 0 ? "Personal" :
                 receipt.receipt_category == 1 ? "Business" : "Unknown";
    if (!groups[type]) {
      groups[type] = { total: 0, count: 0, receipts: [] };
    }
    const price = validatePrice(receipt.purchasePrice);
    groups[type].total += price;
    groups[type].count += 1;
    groups[type].receipts.push(receipt);
    return groups;
  }, {});
};

/**
 * Group receipts by month
 * @param {Array} receipts - Array of receipt objects
 * @returns {Object} Object with month keys (YYYY-MM) and { total, count, receipts } as values
 */
export const groupByMonth = (receipts) => {
  if (!receipts || !Array.isArray(receipts)) return {};

  return receipts.reduce((groups, receipt) => {
    const timestamp = Number(receipt.product_date) * 1000;
    const date = new Date(timestamp);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (!groups[monthKey]) {
      groups[monthKey] = { total: 0, count: 0, receipts: [], label: monthName };
    }
    const price = validatePrice(receipt.purchasePrice);
    groups[monthKey].total += price;
    groups[monthKey].count += 1;
    groups[monthKey].receipts.push(receipt);
    return groups;
  }, {});
};

/**
 * Get top spenders from grouped data
 * @param {Object} grouped - Grouped data object
 * @param {number} limit - Number of top items to return
 * @returns {Array} Array of { name, total, count } sorted by total descending
 */
export const getTopSpenders = (grouped, limit = 5) => {
  return Object.entries(grouped)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
};

/**
 * Filter receipts by date range
 * @param {Array} receipts - Array of receipt objects
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array} Filtered receipts
 */
export const filterByDateRange = (receipts, startDate, endDate) => {
  if (!receipts || !Array.isArray(receipts)) return [];

  const start = startDate.getTime();
  const end = endDate.getTime();

  return receipts.filter(receipt => {
    const timestamp = Number(receipt.product_date) * 1000;
    return timestamp >= start && timestamp <= end;
  });
};

/**
 * Filter receipts by category
 * @param {Array} receipts - Array of receipt objects
 * @param {string} category - Category to filter by
 * @returns {Array} Filtered receipts
 */
export const filterByCategory = (receipts, category) => {
  if (!receipts || !Array.isArray(receipts)) return [];
  const normalizedCategory = category.toLowerCase();

  return receipts.filter(receipt => {
    const expenseType = (receipt.expense_type || "").toLowerCase();
    return expenseType.includes(normalizedCategory) || normalizedCategory.includes(expenseType);
  });
};

/**
 * Filter receipts by merchant
 * @param {Array} receipts - Array of receipt objects
 * @param {string} merchant - Merchant name to filter by
 * @returns {Array} Filtered receipts
 */
export const filterByMerchant = (receipts, merchant) => {
  if (!receipts || !Array.isArray(receipts)) return [];
  const normalizedMerchant = merchant.toLowerCase();

  return receipts.filter(receipt => {
    const storeName = (receipt.storeName || receipt.merchant || "").toLowerCase();
    return storeName.includes(normalizedMerchant) || normalizedMerchant.includes(storeName);
  });
};

/**
 * Filter receipts by payment method
 * @param {Array} receipts - Array of receipt objects
 * @param {string} paymentMethod - Payment method to filter by
 * @returns {Array} Filtered receipts
 */
export const filterByPaymentMethod = (receipts, paymentMethod) => {
  if (!receipts || !Array.isArray(receipts)) return [];
  const normalizedPayment = paymentMethod.toLowerCase();

  return receipts.filter(receipt => {
    const payment = (receipt.paymentType || receipt.card_issuer_name || "").toLowerCase();
    return payment.includes(normalizedPayment) || normalizedPayment.includes(payment);
  });
};

/**
 * Parse natural language date expressions
 * @param {string} expression - Date expression like "this month", "last year", "today"
 * @returns {Object} { startDate, endDate } or null if not parseable
 */
export const parseDateExpression = (expression) => {
  const now = new Date();
  const normalized = expression.toLowerCase().trim();

  // Explicit year (e.g., "2021", "in 2020", "year 2019")
  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const yearNum = Number(yearMatch[0]);
    const start = new Date(yearNum, 0, 1);
    const end = new Date(yearNum, 11, 31, 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // Month + year (e.g., "march 2023")
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  for (let i = 0; i < monthNames.length; i++) {
    const m = monthNames[i];
    const monthYearRegex = new RegExp(`\\b${m}\\s+(19|20)\\d{2}\\b`);
    const match = normalized.match(monthYearRegex);
    if (match) {
      const yearNum = Number(match[0].match(/\d{4}/)[0]);
      const start = new Date(yearNum, i, 1);
      const end = new Date(yearNum, i + 1, 0, 23, 59, 59);
      return { startDate: start, endDate: end };
    }
  }

  // Today
  if (normalized.includes("today")) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // Yesterday
  if (normalized.includes("yesterday")) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // This week
  if (normalized.includes("this week")) {
    const dayOfWeek = now.getDay();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // Last week
  if (normalized.includes("last week")) {
    const dayOfWeek = now.getDay();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - 7);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - 1, 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // This month
  if (normalized.includes("this month")) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // Last month
  if (normalized.includes("last month")) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // This year
  if (normalized.includes("this year") || normalized.includes("year to date") || normalized.includes("ytd")) {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // Last year
  if (normalized.includes("last year")) {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // Last 7 days
  if (normalized.includes("last 7 days") || normalized.includes("past week") || normalized.includes("past 7 days")) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // Last 30 days
  if (normalized.includes("last 30 days") || normalized.includes("past month") || normalized.includes("past 30 days")) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // Last 90 days / 3 months
  if (normalized.includes("last 90 days") || normalized.includes("last 3 months") || normalized.includes("past 3 months")) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { startDate: start, endDate: end };
  }

  // Specific month name (e.g., "January", "in March")
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  for (let i = 0; i < months.length; i++) {
    if (normalized.includes(months[i])) {
      // Check if year is specified
      const yearMatch = normalized.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : now.getFullYear();
      const start = new Date(year, i, 1);
      const end = new Date(year, i + 1, 0, 23, 59, 59);
      return { startDate: start, endDate: end };
    }
  }

  return null;
};

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Get spending summary statistics
 * @param {Array} receipts - Array of receipt objects
 * @returns {Object} Summary statistics
 */
export const getSpendingSummary = (receipts) => {
  if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
    return {
      total: 0,
      count: 0,
      average: 0,
      min: 0,
      max: 0,
      byCategory: {},
      byMerchant: {},
      byPayment: {},
    };
  }

  // Filter out receipts with invalid prices and get valid prices
  const validReceipts = receipts.filter(r => {
    const price = validatePrice(r.purchasePrice);
    return price > 0; // Only include receipts with valid positive prices
  });

  const prices = validReceipts.map(r => validatePrice(r.purchasePrice)).filter(p => p > 0);

  return {
    total: calculateTotalSpending(validReceipts),
    count: validReceipts.length,
    average: calculateAverage(validReceipts),
    min: prices.length > 0 ? Math.min(...prices) : 0,
    max: prices.length > 0 ? Math.max(...prices) : 0,
    byCategory: groupByCategory(validReceipts),
    byMerchant: groupByMerchant(validReceipts),
    byPayment: groupByPaymentMethod(validReceipts),
  };
};
