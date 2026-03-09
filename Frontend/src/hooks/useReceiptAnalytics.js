import { useMemo, useCallback } from "react";
import { useData } from "../context/DataContext";
import {
  calculateTotalSpending,
  calculateAverage,
  groupByCategory,
  groupByMerchant,
  groupByPaymentMethod,
  groupByReceiptType,
  groupByMonth,
  getTopSpenders,
  filterByDateRange,
  filterByCategory,
  filterByMerchant,
  filterByPaymentMethod,
  parseDateExpression,
  formatCurrency,
  getSpendingSummary,
} from "../utils/receiptAnalytics";

/**
 * Custom hook for receipt analytics
 * Provides memoized analytics calculations and filtering functions
 */
export const useReceiptAnalytics = () => {
  const { receipts, merchants, expenseCategories, paymentMethods } = useData();

  // Memoized overall summary
  const overallSummary = useMemo(() => {
    return getSpendingSummary(receipts);
  }, [receipts]);

  // Memoized category breakdown
  const categoryBreakdown = useMemo(() => {
    return groupByCategory(receipts);
  }, [receipts]);

  // Memoized merchant breakdown
  const merchantBreakdown = useMemo(() => {
    return groupByMerchant(receipts);
  }, [receipts]);

  // Memoized payment method breakdown
  const paymentBreakdown = useMemo(() => {
    return groupByPaymentMethod(receipts);
  }, [receipts]);

  // Memoized receipt type breakdown (Personal/Business)
  const receiptTypeBreakdown = useMemo(() => {
    return groupByReceiptType(receipts);
  }, [receipts]);

  // Memoized monthly breakdown
  const monthlyBreakdown = useMemo(() => {
    return groupByMonth(receipts);
  }, [receipts]);

  // Get top categories by spending
  const getTopCategories = useCallback((limit = 5) => {
    return getTopSpenders(categoryBreakdown, limit);
  }, [categoryBreakdown]);

  // Get top merchants by spending
  const getTopMerchants = useCallback((limit = 5) => {
    return getTopSpenders(merchantBreakdown, limit);
  }, [merchantBreakdown]);

  // Get top payment methods by spending
  const getTopPaymentMethods = useCallback((limit = 5) => {
    return getTopSpenders(paymentBreakdown, limit);
  }, [paymentBreakdown]);

  // Get spending for a specific time period
  const getSpendingForPeriod = useCallback((periodExpression) => {
    const dateRange = parseDateExpression(periodExpression);
    if (!dateRange) return null;

    const filteredReceipts = filterByDateRange(receipts, dateRange.startDate, dateRange.endDate);
    return {
      ...getSpendingSummary(filteredReceipts),
      period: periodExpression,
      dateRange,
    };
  }, [receipts]);

  // Get spending for a specific category
  const getSpendingForCategory = useCallback((category, periodExpression = null) => {
    let filteredReceipts = filterByCategory(receipts, category);

    if (periodExpression) {
      const dateRange = parseDateExpression(periodExpression);
      if (dateRange) {
        filteredReceipts = filterByDateRange(filteredReceipts, dateRange.startDate, dateRange.endDate);
      }
    }

    return {
      category,
      total: calculateTotalSpending(filteredReceipts),
      count: filteredReceipts.length,
      average: calculateAverage(filteredReceipts),
      receipts: filteredReceipts,
    };
  }, [receipts]);

  // Get spending for a specific merchant
  const getSpendingForMerchant = useCallback((merchant, periodExpression = null) => {
    let filteredReceipts = filterByMerchant(receipts, merchant);

    if (periodExpression) {
      const dateRange = parseDateExpression(periodExpression);
      if (dateRange) {
        filteredReceipts = filterByDateRange(filteredReceipts, dateRange.startDate, dateRange.endDate);
      }
    }

    return {
      merchant,
      total: calculateTotalSpending(filteredReceipts),
      count: filteredReceipts.length,
      average: calculateAverage(filteredReceipts),
      receipts: filteredReceipts,
    };
  }, [receipts]);

  // Get spending for a specific payment method
  const getSpendingForPaymentMethod = useCallback((paymentMethod, periodExpression = null) => {
    let filteredReceipts = filterByPaymentMethod(receipts, paymentMethod);

    if (periodExpression) {
      const dateRange = parseDateExpression(periodExpression);
      if (dateRange) {
        filteredReceipts = filterByDateRange(filteredReceipts, dateRange.startDate, dateRange.endDate);
      }
    }

    return {
      paymentMethod,
      total: calculateTotalSpending(filteredReceipts),
      count: filteredReceipts.length,
      average: calculateAverage(filteredReceipts),
      receipts: filteredReceipts,
    };
  }, [receipts]);

  // Search receipts by multiple criteria
  const searchReceipts = useCallback((criteria) => {
    let filtered = [...receipts];

    if (criteria.category) {
      filtered = filterByCategory(filtered, criteria.category);
    }

    if (criteria.merchant) {
      filtered = filterByMerchant(filtered, criteria.merchant);
    }

    if (criteria.paymentMethod) {
      filtered = filterByPaymentMethod(filtered, criteria.paymentMethod);
    }

    if (criteria.period) {
      const dateRange = parseDateExpression(criteria.period);
      if (dateRange) {
        filtered = filterByDateRange(filtered, dateRange.startDate, dateRange.endDate);
      }
    }

    if (criteria.startDate && criteria.endDate) {
      filtered = filterByDateRange(filtered, criteria.startDate, criteria.endDate);
    }

    return {
      receipts: filtered,
      total: calculateTotalSpending(filtered),
      count: filtered.length,
      average: calculateAverage(filtered),
    };
  }, [receipts]);

  // Compare spending between two periods
  const compareSpending = useCallback((period1, period2) => {
    const data1 = getSpendingForPeriod(period1);
    const data2 = getSpendingForPeriod(period2);

    if (!data1 || !data2) return null;

    const difference = data1.total - data2.total;
    const percentChange = data2.total !== 0
      ? ((data1.total - data2.total) / data2.total) * 100
      : 0;

    return {
      period1: { ...data1, label: period1 },
      period2: { ...data2, label: period2 },
      difference,
      percentChange,
      trend: difference > 0 ? "increase" : difference < 0 ? "decrease" : "same",
    };
  }, [getSpendingForPeriod]);

  // Get available categories from data
  const availableCategories = useMemo(() => {
    return expenseCategories || [];
  }, [expenseCategories]);

  // Get available merchants from data
  const availableMerchants = useMemo(() => {
    return merchants || [];
  }, [merchants]);

  // Get available payment methods from data
  const availablePaymentMethods = useMemo(() => {
    return paymentMethods || [];
  }, [paymentMethods]);

  return {
    // Data
    receipts,

    // Summaries
    overallSummary,
    categoryBreakdown,
    merchantBreakdown,
    paymentBreakdown,
    receiptTypeBreakdown,
    monthlyBreakdown,

    // Top spenders
    getTopCategories,
    getTopMerchants,
    getTopPaymentMethods,

    // Specific queries
    getSpendingForPeriod,
    getSpendingForCategory,
    getSpendingForMerchant,
    getSpendingForPaymentMethod,

    // Search and compare
    searchReceipts,
    compareSpending,

    // Available options
    availableCategories,
    availableMerchants,
    availablePaymentMethods,

    // Utilities
    formatCurrency,
    parseDateExpression,
  };
};

export default useReceiptAnalytics;
