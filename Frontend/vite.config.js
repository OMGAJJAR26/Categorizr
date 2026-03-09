import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load OpenAI API key from server/.env
let OPENAI_API_KEY = '';
try {
  const serverEnvPath = path.resolve(__dirname, '../server/.env');
  const envContent = fs.readFileSync(serverEnvPath, 'utf-8');
  const match = envContent.match(/OPENAI_API_KEY=(.+)/);
  if (match) {
    OPENAI_API_KEY = match[1].trim();
  }
} catch (e) {
  console.warn('Could not load OpenAI API key from server/.env');
}

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are a helpful receipt assistant for Categorizr, a receipt management application. Your role is to help users understand their spending patterns and answer questions about their receipts.

When answering questions:
1. Be concise and specific with numbers
2. Format currency as USD with 2 decimal places (e.g., $1,234.56)
3. When showing lists, limit to top 5-10 items
4. Provide actionable insights when possible
5. If you can't answer definitively, suggest what information might help
6. When searching for items, look through the receipt details (store, product, notes) to find matches

You have access to the user's receipt data including:
- Total receipts and spending
- Expense categories and amounts
- Merchants/stores and spending
- Payment methods used
- Recent receipt details with store names, product descriptions, amounts, and notes

When users ask about specific items (like "blue jacket" or "coffee"), search through the receipt details to find matches.

Always be helpful, friendly, and focused on providing value about their financial data.`;

// Format context data for AI consumption
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

  // Add recent receipt details for searching
  if (context.recentReceipts && context.recentReceipts.length > 0) {
    lines.push("\n\nRecent Receipt Details (for searching):");
    context.recentReceipts.slice(0, 30).forEach((r, i) => {
      const parts = [];
      if (r.store) parts.push(`Store: ${r.store}`);
      if (r.product) parts.push(`Product: ${r.product}`);
      if (r.amount) parts.push(`$${r.amount.toFixed(2)}`);
      if (r.category) parts.push(`Category: ${r.category}`);
      if (r.notes) parts.push(`Notes: ${r.notes}`);
      if (r.date) parts.push(`Date: ${r.date}`);
      if (parts.length > 0) {
        lines.push(`  ${i + 1}. ${parts.join(" | ")}`);
      }
    });
  }

  return lines.join("\n");
}

// Chat handler with OpenAI integration
const chatHandler = async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/chat/query') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message, context } = JSON.parse(body);

        // If we have OpenAI API key, use it
        if (OPENAI_API_KEY) {
          try {
            const contextSummary = formatContextForAI(context || {});

            const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                  {
                    role: 'system',
                    content: SYSTEM_PROMPT,
                  },
                  {
                    role: 'user',
                    content: `Here is the user's receipt data summary:\n\n${contextSummary}\n\nUser question: ${message}`,
                  },
                ],
                max_tokens: 500,
                temperature: 0.7,
              }),
            });

            if (openaiResponse.ok) {
              const data = await openaiResponse.json();
              const aiMessage = data.choices?.[0]?.message?.content;

              if (aiMessage) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: true,
                  response: {
                    type: 'text',
                    message: aiMessage,
                    data: null,
                  },
                }));
                return;
              }
            } else {
              const errorData = await openaiResponse.json().catch(() => ({}));
              console.error('OpenAI API error:', openaiResponse.status, errorData);
            }
          } catch (aiError) {
            console.error('OpenAI request failed:', aiError);
          }
        }

        // Fallback response if OpenAI fails or no key
        let response = {
          type: 'text',
          message: 'I can help you analyze your receipts! Try asking about your spending totals, categories, or payment methods.',
          data: null
        };

        const normalizedMsg = (message || '').toLowerCase();

        if (context && context.totalSpending !== undefined) {
          if (normalizedMsg.includes('total') || normalizedMsg.includes('spent')) {
            response = {
              type: 'summary',
              message: `Your total spending is $${context.totalSpending.toFixed(2)} across ${context.totalReceipts} receipts.`,
              data: { total: context.totalSpending, count: context.totalReceipts }
            };
          } else if (normalizedMsg.includes('category') || normalizedMsg.includes('categories')) {
            if (context.topCategories && context.topCategories.length > 0) {
              const list = context.topCategories.map((c, i) => `${i + 1}. ${c.name}: $${c.total.toFixed(2)}`).join('\n');
              response = {
                type: 'breakdown',
                message: `Here's your spending by category:\n\n${list}`,
                data: { items: context.topCategories }
              };
            }
          } else if (normalizedMsg.includes('merchant') || normalizedMsg.includes('store')) {
            if (context.topMerchants && context.topMerchants.length > 0) {
              const list = context.topMerchants.map((m, i) => `${i + 1}. ${m.name}: $${m.total.toFixed(2)}`).join('\n');
              response = {
                type: 'breakdown',
                message: `Here are your top merchants:\n\n${list}`,
                data: { items: context.topMerchants }
              };
            }
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, response }));
      } catch (e) {
        console.error('Chat handler error:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid request' }));
      }
    });
    return true;
  }
  return false;
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'chat-api-handler',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/chat')) {
            chatHandler(req, res);
          } else {
            next();
          }
        });
      }
    }
  ],
  server: {
    proxy: {
      '/api/integrations': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const token = req.headers.accesstoken || req.headers.authorization;
            if (token) {
              proxyReq.setHeader('Accesstoken', token);
            }
          });
        },
      },
      // Existing emailserver APIs stay proxied to production backend
      '/api': {
        target: 'https://categorizr.com/emailserver',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const accessToken = req.headers['accesstoken'];
            if (accessToken) {
              proxyReq.setHeader('Accesstoken', accessToken);
            }
          });
        },
      },
      '/searchimage': {
        target: 'https://categorizr.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/searchimage/, '/searchimage.php'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // You can add any necessary headers for the searchimage API here
            console.log('Proxying search image request:', req.url);
          });
        },
      },
      '/imagesearch': {
        target: 'https://categorizr.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/imagesearch/, '/imagesearchv2.php'),
      },
    },
  },
})