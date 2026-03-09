/**
 * AI Service for Chat Assistant
 * Integrates with OpenAI GPT-4 for natural language processing
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are a helpful receipt assistant for Categorizr, a receipt management application. Your role is to help users understand their spending patterns and answer questions about their receipts.

When answering questions:
1. Be concise and specific with numbers
2. Format currency as USD with 2 decimal places (e.g., $1,234.56)
3. When showing lists, limit to top 5-10 items
4. Provide actionable insights when possible
5. If you can't answer definitively, suggest what information might help

You have access to the user's receipt summary data including:
- Total receipts and spending
- Expense categories and amounts
- Merchants/stores and spending
- Payment methods used

Always be helpful, friendly, and focused on providing value about their financial data.`;

/**
 * Process a chat query using OpenAI GPT-4
 * @param {string} message - User's message
 * @param {object} context - Receipt context data
 * @returns {Promise<object>} AI response
 */
export async function processQuery(message, context) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, using fallback response");
    return getFallbackResponse(message, context);
  }

  try {
    const contextSummary = formatContextForAI(context);

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: `Here is the user's receipt data summary:\n\n${contextSummary}\n\nUser question: ${message}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("OpenAI API error:", response.status, errorData);
      return getFallbackResponse(message, context);
    }

    const data = await response.json();
    const aiMessage = data.choices?.[0]?.message?.content;

    if (!aiMessage) {
      return getFallbackResponse(message, context);
    }

    return {
      success: true,
      response: {
        type: "text",
        message: aiMessage,
        data: null,
      },
    };
  } catch (error) {
    console.error("AI Service error:", error);
    return getFallbackResponse(message, context);
  }
}

function formatContextForAI(context) {
  const lines = [];

  if (context.totalReceipts !== undefined) {
    lines.push(`Total Receipts: ${context.totalReceipts}`);
  }

  if (context.totalSpending !== undefined) {
    lines.push(`Total Spending: $${context.totalSpending.toFixed(2)}`);
  }

  if (context.categories && context.categories.length > 0) {
    lines.push(`\nExpense Categories: ${context.categories.join(", ")}`);
  }

  if (context.topCategories && context.topCategories.length > 0) {
    lines.push("\nTop Categories by Spending:");
    context.topCategories.forEach((cat, i) => {
      lines.push(`  ${i + 1}. ${cat.name}: $${cat.total.toFixed(2)} (${cat.count} receipts)`);
    });
  }

  if (context.topMerchants && context.topMerchants.length > 0) {
    lines.push("\nTop Merchants by Spending:");
    context.topMerchants.forEach((m, i) => {
      lines.push(`  ${i + 1}. ${m.name}: $${m.total.toFixed(2)} (${m.count} visits)`);
    });
  }

  if (context.paymentMethods && context.paymentMethods.length > 0) {
    lines.push(`\nPayment Methods: ${context.paymentMethods.slice(0, 10).join(", ")}`);
  }

  return lines.join("\n");
}

function getFallbackResponse(message, context) {
  const normalized = message.toLowerCase();

  if (context.totalSpending !== undefined) {
    if (normalized.includes("total") || normalized.includes("spent") || normalized.includes("spending")) {
      return {
        success: true,
        response: {
          type: "summary",
          message: `Your total spending is $${context.totalSpending.toFixed(2)} across ${context.totalReceipts} receipts.`,
          data: {
            total: context.totalSpending,
            count: context.totalReceipts,
          },
        },
      };
    }

    if (normalized.includes("category") || normalized.includes("categories")) {
      if (context.topCategories && context.topCategories.length > 0) {
        const list = context.topCategories
          .map((c, i) => `${i + 1}. ${c.name}: $${c.total.toFixed(2)}`)
          .join("\n");
        return {
          success: true,
          response: {
            type: "breakdown",
            message: `Here's your spending by category:\n\n${list}`,
            data: {
              items: context.topCategories,
            },
          },
        };
      }
    }

    if (normalized.includes("merchant") || normalized.includes("store")) {
      if (context.topMerchants && context.topMerchants.length > 0) {
        const list = context.topMerchants
          .map((m, i) => `${i + 1}. ${m.name}: $${m.total.toFixed(2)}`)
          .join("\n");
        return {
          success: true,
          response: {
            type: "breakdown",
            message: `Here are your top merchants:\n\n${list}`,
            data: {
              items: context.topMerchants,
            },
          },
        };
      }
    }
  }

  return {
    success: true,
    response: {
      type: "text",
      message:
        "I can help you analyze your receipts! Try asking about:\n• Your total spending\n• Spending by category\n• Top merchants\n• Payment methods used",
      data: null,
    },
  };
}
