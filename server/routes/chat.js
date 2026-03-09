/**
 * Chat API Routes
 */
import express from "express";
import { handleQuery, healthCheck } from "../controllers/chatController.js";

const router = express.Router();

// POST /api/chat/query - Process a chat query
router.post("/query", handleQuery);

// GET /api/chat/health - Health check
router.get("/health", healthCheck);

export default router;
