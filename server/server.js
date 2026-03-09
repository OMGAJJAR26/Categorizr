import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import chatRoutes from "./routes/chat.js";
import integrationRoutes from "./routes/integrations.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5000",
  "https://categorizr.com",
  process.env.FRONTEND_URL,   // exact staging/production Vercel URL from env
].filter(Boolean);

// Pattern-based origins: allow all Vercel preview deployments for this project
// e.g. https://categorizr-git-staging-yourteam.vercel.app
const allowedOriginPatterns = [
  /^https:\/\/categorizr(-[a-z0-9-]+)?\.vercel\.app$/,
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // allow server-to-server / curl
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (allowedOriginPatterns.some((re) => re.test(origin))) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

// API routes
app.use("/api/chat", chatRoutes);
app.use("/api/integrations", integrationRoutes);

// API 404 guard (prevents SPA catch-all from swallowing /api/*)
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Serve frontend build if present
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

app.use(express.static(distPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
