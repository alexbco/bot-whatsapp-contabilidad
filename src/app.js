// src/app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import "./db/connection.js"; // inicializa SQLite
import { router as webhookRouter } from "./routes/webhook.js";
import { logInfo, logWarn } from "./utils/loger.js"; // (typo: ¿no sería logger.js?)

// ───────────────────────────────────────────────────────────────
// 1) Config / ENV
// ───────────────────────────────────────────────────────────────
dotenv.config();

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    missing.forEach((k) => logWarn(`⚠️ Falta ${k} en .env`));
  }
}
requireEnv(["WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "VERIFY_TOKEN"]);

const PORT = Number(process.env.PORT ?? 3000);

// ───────────────────────────────────────────────────────────────
// 2) Paths (resueltos una sola vez)
// ───────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPORT_DIR = path.join(__dirname, "..", "exports");
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// ───────────────────────────────────────────────────────────────
// 3) App + Middlewares base
// ───────────────────────────────────────────────────────────────
export const app = express();

app.use(cors());
app.use(express.json());

// estáticos públicos (CSV)
app.use("/exports", express.static(EXPORT_DIR));
// comparte la ruta con otros módulos (router)
app.set("EXPORT_DIR", EXPORT_DIR);

// Healthcheck ultra simple
app.get("/", (_req, res) => {
  res.send("🚀 Bot de WhatsApp activo y funcionando!");
});

// ───────────────────────────────────────────────────────────────
// 4) Rutas
// ───────────────────────────────────────────────────────────────
app.use("/webhook", webhookRouter);

// 404 (si nada respondió antes)
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

// Error handler (último middleware siempre)
app.use((err, _req, res, _next) => {
  logWarn(`❌ Error: ${err.message}`);
  res.status(err.status || 500).json({ error: "Internal Server Error" });
});

// ───────────────────────────────────────────────────────────────
// 5) Arranque del servidor (separado ⇒ test friendly)
// ───────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => logInfo(`✅ Servidor en http://localhost:${PORT}`));
}
