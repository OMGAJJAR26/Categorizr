import { useState, useCallback, useEffect, useRef } from "react";
import { normalizeSelectedTags } from "../utils/tagStatusGroups";

export const FILTER_TYPES = {
  PRICE: 'price',
  DATE: 'date',
  MERCHANT: 'merchant',
  MERCHANT_DATA: 'merchantData',
  EXPENSE_CATEGORY: 'expenseCategory',
  RECEIPT_CATEGORY: 'receiptCategory',
  PAYMENT_METHOD: 'paymentMethod',
  PAYMENT_METHOD_DATA: 'paymentMethodData',
  TAX_TYPES: 'taxTypes',
  TAGS: 'tags',
};

const FILTERS_STORAGE_KEY = 'receiptFilters';

// Helper to get initial filters from localStorage
const getInitialFilters = () => {
  const defaultFilters = {
    [FILTER_TYPES.PRICE]: null,
    [FILTER_TYPES.DATE]: null,
    [FILTER_TYPES.MERCHANT]: [],
    [FILTER_TYPES.MERCHANT_DATA]: [],
    [FILTER_TYPES.EXPENSE_CATEGORY]: [],
    [FILTER_TYPES.RECEIPT_CATEGORY]: [],
    [FILTER_TYPES.PAYMENT_METHOD]: [],
    [FILTER_TYPES.PAYMENT_METHOD_DATA]: [],
    [FILTER_TYPES.TAX_TYPES]: [],
    [FILTER_TYPES.TAGS]: [],
  };

  try {
    const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to ensure all keys exist
      const merged = { ...defaultFilters, ...parsed };
      merged[FILTER_TYPES.TAGS] = normalizeSelectedTags(merged[FILTER_TYPES.TAGS] || []);
      return merged;
    }
  } catch (error) {
    console.error("Error loading saved filters:", error);
  }
  return defaultFilters;
};

export const useReceiptFilters = () => {
  const [filters, setFilters] = useState(getInitialFilters);

  const [activeMenu, setActiveMenu] = useState(null);
  const [searchTerm, setSearchTerm] = useState(() => {
    try {
      return localStorage.getItem('receiptSearchTerm') || '';
    } catch {
      return '';
    }
  });

  const isInitialMount = useRef(true);

  // Save all filters to localStorage when they change
  useEffect(() => {
    // Skip on initial mount to avoid overwriting with defaults
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch (error) {
      console.error("Error saving filters:", error);
    }
  }, [filters]);

  // Save search term separately
  useEffect(() => {
    try {
      if (searchTerm) {
        localStorage.setItem('receiptSearchTerm', searchTerm);
      } else {
        localStorage.removeItem('receiptSearchTerm');
      }
    } catch (error) {
      console.error("Error saving search term:", error);
    }
  }, [searchTerm]);

  const updateFilter = useCallback((filterType, value, additionalData = null) => {
    
    setFilters(prev => {
      const newFilters = { ...prev };
      
      switch (filterType) {
        case FILTER_TYPES.PRICE:
          newFilters[FILTER_TYPES.PRICE] = value;
          break;
        
        case FILTER_TYPES.DATE:
          newFilters[FILTER_TYPES.DATE] = value;
          break;
        
        case FILTER_TYPES.MERCHANT:
          newFilters[FILTER_TYPES.MERCHANT] = value;
          if (additionalData) {
            newFilters[FILTER_TYPES.MERCHANT_DATA] = additionalData;
          }
          break;
        
        case FILTER_TYPES.EXPENSE_CATEGORY:
          newFilters[FILTER_TYPES.EXPENSE_CATEGORY] = value;
          break;
        
        case FILTER_TYPES.RECEIPT_CATEGORY:
          newFilters[FILTER_TYPES.RECEIPT_CATEGORY] = value;
          break;
        
        case FILTER_TYPES.PAYMENT_METHOD:
          newFilters[FILTER_TYPES.PAYMENT_METHOD] = value;
          if (additionalData) {
            newFilters[FILTER_TYPES.PAYMENT_METHOD_DATA] = additionalData;
          }
          break;
        
        case FILTER_TYPES.TAX_TYPES:
          newFilters[FILTER_TYPES.TAX_TYPES] = value;
          break;
        
        case FILTER_TYPES.TAGS:
          newFilters[FILTER_TYPES.TAGS] = normalizeSelectedTags(value || []);
          break;
        
        default:
          console.warn(`Unknown filter type: ${filterType}`);
      }
      
      return newFilters;
    });
  }, []);

  const clearFilter = useCallback((filterType) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      
      switch (filterType) {
        case FILTER_TYPES.PRICE:
          newFilters[FILTER_TYPES.PRICE] = null;
          break;
        
        case FILTER_TYPES.DATE:
          newFilters[FILTER_TYPES.DATE] = null;
          break;
        
        case FILTER_TYPES.MERCHANT:
          newFilters[FILTER_TYPES.MERCHANT] = [];
          newFilters[FILTER_TYPES.MERCHANT_DATA] = [];
          break;
        
        case FILTER_TYPES.EXPENSE_CATEGORY:
          newFilters[FILTER_TYPES.EXPENSE_CATEGORY] = [];
          break;
        
        case FILTER_TYPES.RECEIPT_CATEGORY:
          newFilters[FILTER_TYPES.RECEIPT_CATEGORY] = [];
          break;
        
        case FILTER_TYPES.PAYMENT_METHOD:
          newFilters[FILTER_TYPES.PAYMENT_METHOD] = [];
          newFilters[FILTER_TYPES.PAYMENT_METHOD_DATA] = [];
          break;
        
        case FILTER_TYPES.TAX_TYPES:
          newFilters[FILTER_TYPES.TAX_TYPES] = [];
          localStorage.removeItem("selectedTaxAndTipsTypes");
          break;
        
        case FILTER_TYPES.TAGS:
          newFilters[FILTER_TYPES.TAGS] = [];
          break;
        
        case 'search':
          setSearchTerm('');
          break;
        
        case 'sortOrder':
        case 'sortDate':
        case 'sortAmount':
          // These are handled by sort hook - do nothing here
          break;
        
        default:
          // Handle tag removal (tag_*)
          if (filterType.startsWith('tag_')) {
            const tagToRemove = filterType.replace('tag_', '');
            newFilters[FILTER_TYPES.TAGS] = newFilters[FILTER_TYPES.TAGS].filter(
              tag => tag !== tagToRemove
            );
            newFilters[FILTER_TYPES.TAGS] = normalizeSelectedTags(newFilters[FILTER_TYPES.TAGS]);
          }
      }
      
      return newFilters;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({
      [FILTER_TYPES.PRICE]: null,
      [FILTER_TYPES.DATE]: null,
      [FILTER_TYPES.MERCHANT]: [],
      [FILTER_TYPES.MERCHANT_DATA]: [],
      [FILTER_TYPES.EXPENSE_CATEGORY]: [],
      [FILTER_TYPES.RECEIPT_CATEGORY]: [],
      [FILTER_TYPES.PAYMENT_METHOD]: [],
      [FILTER_TYPES.PAYMENT_METHOD_DATA]: [],
      [FILTER_TYPES.TAX_TYPES]: [],
      [FILTER_TYPES.TAGS]: [],
    });
    setSearchTerm('');
    // Clear all filter-related localStorage items
    localStorage.removeItem(FILTERS_STORAGE_KEY);
    localStorage.removeItem("selectedTaxAndTipsTypes");
    localStorage.removeItem("selectedMerchants");
    localStorage.removeItem("receiptSearchTerm");
    localStorage.removeItem("dateRange");
    localStorage.removeItem("selectedExpenseCategory");
    localStorage.removeItem("selectedReceiptCategories");
    localStorage.removeItem("selectedPaymentMethods");
    localStorage.removeItem("selectedPriceFilter");
  }, []);

  return {
    filters,
    updateFilter,
    clearFilter,
    clearAllFilters,
    activeMenu,
    setActiveMenu,
    searchTerm,
    setSearchTerm,
    FILTER_TYPES,
  };
};