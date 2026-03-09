/**
 * Chat Controller
 * Handles chat API requests
 */

import { processQuery } from "../services/aiService.js";

/**
 * Process a chat query
 * POST /api/chat/query
 */
export async function handleQuery(req, res) {
  try {
    const { message, context } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    console.log(`Chat query: "${message.substring(0, 100)}..."`);

    const result = await processQuery(message, context || {});

    return res.json(result);
  } catch (error) {
    console.error("Chat controller error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to process chat query",
      response: {
        type: "error",
        message: "Sorry, I encountered an error. Please try again.",
      },
    });
  }
}

/**
 * Health check for chat service
 * GET /api/chat/health
 */
export function healthCheck(req, res) {
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  return res.json({
    status: "ok",
    aiEnabled: hasApiKey,
    timestamp: new Date().toISOString(),
  });
}
