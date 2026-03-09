import { useState, useCallback, useEffect } from "react";
import { useReceiptAnalytics } from "./useReceiptAnalytics";
import { NODE_API_URL } from "../api/Axios";

const STORAGE_KEY = "chat_history";
const MAX_MESSAGES = 50;

/**
 * Generate unique ID for messages
 */
const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Custom hook for chat assistant functionality
 * Handles message history, API calls, and response processing
 */
export const useChatAssistant = () => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const analytics = useReceiptAnalytics();

  // Load messages from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setMessages(parsed.slice(-MAX_MESSAGES));
        }
      }
    } catch (e) {
      console.error("Failed to load chat history:", e);
    }
  }, []);

  // Save messages to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch (e) {
      console.error("Failed to save chat history:", e);
    }
  }, [messages]);

  /**
   * Add a message to the chat
   */
  const addMessage = useCallback((role, content, data = null, type = "text") => {
    const message = {
      id: generateId(),
      role,
      content,
      data,
      type,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev.slice(-MAX_MESSAGES + 1), message]);
    return message;
  }, []);

  /**
   * Process user message and generate response
   */
  const processMessage = useCallback(async (userMessage) => {
    const normalized = userMessage.toLowerCase().trim();

    // Parse intent from the message
    let response = null;

    // Quick-help intents (no analytics needed)
    if (normalized.includes("forgot password") || normalized.includes("reset password")) {
      response = {
        type: "text",
        content:
          "To reset your password: go to Login > tap 'Forgot Password' > enter your email > open the reset link we send. If you don't see it, check spam and make sure you use your registered email.",
      };
    } else if (
      normalized.includes("logout") ||
      normalized.includes("log out") ||
      normalized.includes("sign out")
    ) {
      response = {
        type: "text",
        content: "To log out: open the profile/menu and choose 'Logout'. This clears your local session; log back in with your email and password to continue.",
      };
    } else if (
      normalized.includes("add receipt") ||
      normalized.includes("upload receipt") ||
      normalized.includes("new receipt") ||
      normalized.includes("how can i add") ||
      normalized.includes("how to add") ||
      normalized.includes("how do i add") ||
      (normalized.includes("add") && normalized.includes("receipt"))
    ) {
      response = {
        type: "text",
        content:
          "To add a receipt: click the 'Add Receipt' button (plus icon) on the Home page > upload a photo/PDF of your receipt or enter details manually > review the auto-detected merchant, total, taxes, and date > make any corrections needed > click 'Save'. The new receipt will appear immediately in your receipt list.",
      };
    }
    // Check for spending total queries
    else if (
      normalized.includes("how much") ||
      normalized.includes("total") ||
      normalized.includes("spent") ||
      normalized.includes("spend")
    ) {
      response = await handleSpendingQuery(normalized, analytics);
    }
    // Check for category breakdown
    else if (
      normalized.includes("by category") ||
      normalized.includes("categories") ||
      normalized.includes("breakdown")
    ) {
      response = handleCategoryBreakdown(analytics);
    }
    // Check for payment method queries
    else if (
      normalized.includes("payment") ||
      normalized.includes("card") ||
      normalized.includes("method")
    ) {
      response = handlePaymentQuery(normalized, analytics);
    }
    // Check for average queries
    else if (normalized.includes("average")) {
      response = handleAverageQuery(normalized, analytics);
    }
    // Check for merchant/store queries
    else if (
      normalized.includes("merchant") ||
      normalized.includes("store") ||
      normalized.includes("from") ||
      normalized.includes("at ")
    ) {
      response = handleMerchantQuery(normalized, analytics);
    }
    // Check for search/find queries (items, descriptions, products)
    else if (
      normalized.includes("find") ||
      normalized.includes("search") ||
      normalized.includes("looking for") ||
      normalized.includes("is there") ||
      normalized.includes("do i have") ||
      normalized.includes("any receipt") ||
      normalized.includes("bought")
    ) {
      response = handleSearchQuery(normalized, userMessage, analytics);
    }
    // Check for receipt list/show queries
    else if (
      normalized.includes("show") ||
      normalized.includes("list") ||
      normalized.includes("receipts")
    ) {
      response = handleReceiptListQuery(normalized, analytics);
    }
    // Check for comparison queries
    else if (normalized.includes("compare") || normalized.includes("vs") || normalized.includes("versus")) {
      response = handleComparisonQuery(normalized, analytics);
    }
    // Default: try to send to AI API
    else {
      response = await handleAIQuery(userMessage, analytics);
    }

    return response;
  }, [analytics]);

  /**
   * Send a message and get response
   */
  const sendMessage = useCallback(async (userMessage) => {
    if (!userMessage.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    // Add user message
    addMessage("user", userMessage);

    try {
      const response = await processMessage(userMessage);

      if (response) {
        addMessage("assistant", response.content, response.data, response.type);
      } else {
        addMessage(
          "assistant",
          "I'm not sure how to help with that. Try asking about your spending, categories, or payment methods.",
          null,
          "text"
        );
      }
    } catch (err) {
      console.error("Chat error:", err);
      setError(err.message);
      addMessage(
        "assistant",
        "Sorry, I encountered an error processing your request. Please try again.",
        null,
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, addMessage, processMessage]);

  /**
   * Clear chat history
   */
  const clearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
  };
};

/**
 * Handle spending total queries
 */
async function handleSpendingQuery(query, analytics) {
  // Year-specific query (e.g., "in 2021")
  const yearMatch = query.match(/\b(19|20)\d{2}\b/);
  let explicitPeriod = null;
  if (yearMatch) {
    explicitPeriod = yearMatch[0];
  }

  // Check for category mention
  const categories = analytics.availableCategories;
  let matchedCategory = null;
  for (const cat of categories) {
    if (query.includes(cat.toLowerCase())) {
      matchedCategory = cat;
      break;
    }
  }

  // Check for time period
  let period = explicitPeriod;
  const periodPhrases = [
    "this month", "last month", "this year", "last year",
    "this week", "last week", "today", "yesterday",
    "last 7 days", "last 30 days", "last 90 days"
  ];
  for (const phrase of periodPhrases) {
    if (query.includes(phrase)) {
      period = phrase;
      break;
    }
  }

  // Handle category + period query
  if (matchedCategory) {
    const result = analytics.getSpendingForCategory(matchedCategory, period);
    const periodText = period ? ` ${period}` : "";
    return {
      type: "summary",
      content: `You spent ${analytics.formatCurrency(result.total)} on ${matchedCategory}${periodText} across ${result.count} transaction${result.count !== 1 ? "s" : ""}.`,
      data: {
        total: result.total,
        count: result.count,
        average: result.average,
        receipts: result.receipts.slice(0, 5),
      },
    };
  }

  // Handle period-only query
  if (period) {
    const result = analytics.getSpendingForPeriod(period);
    if (result) {
      return {
        type: "summary",
        content: `You spent ${analytics.formatCurrency(result.total)} ${period} across ${result.count} transaction${result.count !== 1 ? "s" : ""}.`,
        data: {
          total: result.total,
          count: result.count,
          average: result.average,
        },
      };
    }
  }

  // Default: overall spending
  const summary = analytics.overallSummary;
  return {
    type: "summary",
    content: `Your total spending is ${analytics.formatCurrency(summary.total)} across ${summary.count} receipts.`,
    data: {
      total: summary.total,
      count: summary.count,
      average: summary.average,
    },
  };
}

/**
 * Handle category breakdown queries
 */
function handleCategoryBreakdown(analytics) {
  const topCategories = analytics.getTopCategories(10);

  if (topCategories.length === 0) {
    return {
      type: "text",
      content: "You don't have any categorized receipts yet.",
    };
  }

  const total = topCategories.reduce((sum, cat) => sum + cat.total, 0);
  const formattedList = topCategories
    .map((cat, i) => `${i + 1}. ${cat.name}: ${analytics.formatCurrency(cat.total)}`)
    .join("\n");

  return {
    type: "breakdown",
    content: `Here's your spending by category:\n\n${formattedList}`,
    data: {
      items: topCategories,
      total,
    },
  };
}

/**
 * Handle payment method queries
 */
function handlePaymentQuery(query, analytics) {
  const topPayments = analytics.getTopPaymentMethods(10);

  if (topPayments.length === 0) {
    return {
      type: "text",
      content: "You don't have any payment methods recorded yet.",
    };
  }

  // "Which do I use most" query
  if (query.includes("most") || query.includes("top")) {
    const top = topPayments[0];
    return {
      type: "summary",
      content: `Your most used payment method is "${top.name}" with ${top.count} transactions totaling ${analytics.formatCurrency(top.total)}.`,
      data: {
        total: top.total,
        count: top.count,
        items: topPayments,
      },
    };
  }

  // General payment breakdown
  const formattedList = topPayments
    .map((p, i) => `${i + 1}. ${p.name}: ${p.count} transactions (${analytics.formatCurrency(p.total)})`)
    .join("\n");

  return {
    type: "breakdown",
    content: `Here's your spending by payment method:\n\n${formattedList}`,
    data: {
      items: topPayments,
    },
  };
}

/**
 * Handle average transaction queries
 */
function handleAverageQuery(query, analytics) {
  // Check for category
  const categories = analytics.availableCategories;
  let matchedCategory = null;
  for (const cat of categories) {
    if (query.includes(cat.toLowerCase())) {
      matchedCategory = cat;
      break;
    }
  }

  if (matchedCategory) {
    const result = analytics.getSpendingForCategory(matchedCategory);
    return {
      type: "summary",
      content: `Your average ${matchedCategory} transaction is ${analytics.formatCurrency(result.average)}.`,
      data: {
        average: result.average,
        count: result.count,
        total: result.total,
      },
    };
  }

  // Overall average
  const summary = analytics.overallSummary;
  return {
    type: "summary",
    content: `Your average transaction is ${analytics.formatCurrency(summary.average)} across ${summary.count} receipts.`,
    data: {
      average: summary.average,
      count: summary.count,
      total: summary.total,
    },
  };
}

/**
 * Handle merchant/store queries
 */
function handleMerchantQuery(query, analytics) {
  const merchants = analytics.availableMerchants;

  // Try to find a mentioned merchant
  let matchedMerchant = null;
  for (const merchant of merchants) {
    if (query.includes(merchant.toLowerCase())) {
      matchedMerchant = merchant;
      break;
    }
  }

  if (matchedMerchant) {
    const result = analytics.getSpendingForMerchant(matchedMerchant);
    return {
      type: "summary",
      content: `You spent ${analytics.formatCurrency(result.total)} at ${matchedMerchant} across ${result.count} visit${result.count !== 1 ? "s" : ""}.`,
      data: {
        total: result.total,
        count: result.count,
        average: result.average,
        receipts: result.receipts.slice(0, 5),
      },
    };
  }

  // Show top merchants
  const topMerchants = analytics.getTopMerchants(10);
  if (topMerchants.length === 0) {
    return {
      type: "text",
      content: "You don't have any merchant data yet.",
    };
  }

  const formattedList = topMerchants
    .map((m, i) => `${i + 1}. ${m.name}: ${analytics.formatCurrency(m.total)} (${m.count} visits)`)
    .join("\n");

  return {
    type: "breakdown",
    content: `Here are your top merchants by spending:\n\n${formattedList}`,
    data: {
      items: topMerchants,
    },
  };
}

/**
 * Handle receipt list queries
 */
function handleReceiptListQuery(query, analytics) {
  const { receipts } = analytics;

  // Check for merchant
  let matchedMerchant = null;
  for (const merchant of analytics.availableMerchants) {
    if (query.includes(merchant.toLowerCase())) {
      matchedMerchant = merchant;
      break;
    }
  }

  // Check for category
  let matchedCategory = null;
  for (const cat of analytics.availableCategories) {
    if (query.includes(cat.toLowerCase())) {
      matchedCategory = cat;
      break;
    }
  }

  let filtered = receipts;
  let description = "";

  if (matchedMerchant) {
    const result = analytics.getSpendingForMerchant(matchedMerchant);
    filtered = result.receipts;
    description = `from ${matchedMerchant}`;
  } else if (matchedCategory) {
    const result = analytics.getSpendingForCategory(matchedCategory);
    filtered = result.receipts;
    description = `in ${matchedCategory}`;
  }

  if (filtered.length === 0) {
    return {
      type: "text",
      content: `I couldn't find any receipts ${description || "matching your criteria"}.`,
    };
  }

  return {
    type: "receipt_list",
    content: `Found ${filtered.length} receipt${filtered.length !== 1 ? "s" : ""} ${description}:`,
    data: {
      receipts: filtered.slice(0, 10),
      count: filtered.length,
    },
  };
}

/**
 * Handle comparison queries
 */
function handleComparisonQuery(query, analytics) {
  // Try to extract two periods
  const periods = [];
  const periodPhrases = [
    "this month", "last month", "this year", "last year",
    "this week", "last week"
  ];

  for (const phrase of periodPhrases) {
    if (query.includes(phrase)) {
      periods.push(phrase);
    }
  }

  if (periods.length >= 2) {
    const comparison = analytics.compareSpending(periods[0], periods[1]);
    if (comparison) {
      const direction = comparison.trend === "increase" ? "more" : comparison.trend === "decrease" ? "less" : "the same";
      const percentText = Math.abs(comparison.percentChange).toFixed(1);

      return {
        type: "summary",
        content: `${periods[0]}: ${analytics.formatCurrency(comparison.period1.total)}\n${periods[1]}: ${analytics.formatCurrency(comparison.period2.total)}\n\nYou spent ${direction} ${periods[0]} (${comparison.trend === "same" ? "no change" : `${percentText}% ${comparison.trend}`}).`,
        data: {
          period1: comparison.period1,
          period2: comparison.period2,
          difference: comparison.difference,
          percentChange: comparison.percentChange,
        },
      };
    }
  }

  // Default comparison: this month vs last month
  const comparison = analytics.compareSpending("this month", "last month");
  if (comparison) {
    const direction = comparison.trend === "increase" ? "more" : comparison.trend === "decrease" ? "less" : "the same";

    return {
      type: "summary",
      content: `This month: ${analytics.formatCurrency(comparison.period1.total)}\nLast month: ${analytics.formatCurrency(comparison.period2.total)}\n\nYou're spending ${direction} this month.`,
      data: {
        period1: comparison.period1,
        period2: comparison.period2,
      },
    };
  }

  return {
    type: "text",
    content: "I couldn't compare those periods. Try asking to compare 'this month vs last month' or 'this year vs last year'.",
  };
}

/**
 * Handle search queries - search through receipt descriptions, product names, notes
 */
function handleSearchQuery(normalizedQuery, originalQuery, analytics) {
  const { receipts } = analytics;

  // Extract search terms - remove common words
  const stopWords = [
    "find", "search", "looking", "for", "is", "there", "any", "receipt",
    "receipts", "do", "i", "have", "a", "an", "the", "with", "bought",
    "purchased", "where", "what", "which", "that", "has", "have", "contains"
  ];

  // Get search terms from the query
  const words = originalQuery.toLowerCase().split(/\s+/);
  const searchTerms = words.filter(word =>
    word.length > 2 && !stopWords.includes(word)
  );

  if (searchTerms.length === 0) {
    return {
      type: "text",
      content: "What would you like me to search for? Try asking something like 'Find blue jacket' or 'Search for coffee'.",
    };
  }

  // Search through receipts
  const matchingReceipts = receipts.filter(receipt => {
    const searchableText = [
      receipt.storeName || "",
      receipt.product_name || "",
      receipt.notes || "",
      receipt.expense_type || "",
      receipt.description || "",
      receipt.item_description || "",
    ].join(" ").toLowerCase();

    // Check if any search term matches
    return searchTerms.some(term => searchableText.includes(term));
  });

  if (matchingReceipts.length === 0) {
    return {
      type: "text",
      content: `I couldn't find any receipts matching "${searchTerms.join(" ")}". Try different keywords or check the spelling.`,
    };
  }

  // Calculate total for matching receipts
  const total = matchingReceipts.reduce((sum, r) => sum + (parseFloat(r.purchasePrice) || 0), 0);

  return {
    type: "receipt_list",
    content: `Found ${matchingReceipts.length} receipt${matchingReceipts.length !== 1 ? "s" : ""} matching "${searchTerms.join(" ")}" (Total: ${analytics.formatCurrency(total)}):`,
    data: {
      receipts: matchingReceipts.slice(0, 10),
      count: matchingReceipts.length,
      total: total,
    },
  };
}

/**
 * Handle queries that need AI processing
 * This sends to the backend API
 */
async function handleAIQuery(query, analytics) {
  const token = localStorage.getItem("token");

  try {
    // Prepare receipt details for AI (limit to recent 50 for context size)
    const recentReceipts = analytics.receipts
      .slice(0, 50)
      .map(r => ({
        store: r.storeName || "Unknown",
        product: r.product_name || "",
        amount: parseFloat(r.purchasePrice) || 0,
        category: r.expense_type || "",
        notes: r.notes || "",
        date: r.product_date ? new Date(Number(r.product_date) * 1000).toLocaleDateString() : "",
      }))
      .filter(r => r.store !== "Unknown" || r.amount > 0);

    // Prepare context for AI
    const context = {
      totalReceipts: analytics.receipts.length,
      totalSpending: analytics.overallSummary.total,
      categories: analytics.availableCategories,
      merchants: analytics.availableMerchants.slice(0, 20),
      paymentMethods: analytics.availablePaymentMethods,
      topCategories: analytics.getTopCategories(5),
      topMerchants: analytics.getTopMerchants(5),
      recentReceipts: recentReceipts,
    };

    const response = await fetch(`${NODE_API_URL}/api/chat/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accesstoken: token,
      },
      body: JSON.stringify({
        message: query,
        context,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get AI response");
    }

    const data = await response.json();

    if (data.success && data.response) {
      return {
        type: data.response.type || "text",
        content: data.response.message,
        data: data.response.data,
      };
    }
  } catch (err) {
    console.error("AI query error:", err);
  }

  // Fallback response
  return {
    type: "text",
    content: "I can help you with questions about:\n• Spending totals (e.g., 'How much did I spend this month?')\n• Category breakdown (e.g., 'Show spending by category')\n• Payment methods (e.g., 'Which card do I use most?')\n• Merchant queries (e.g., 'How much at Walmart?')\n• Comparisons (e.g., 'Compare this month vs last month')",
  };
}

export default useChatAssistant;
