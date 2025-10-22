// src/app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import "./db/connection.js";                 // inicializa SQLite
import { router as webhookRouter } from "./routes/webhook.js";
import { logInfo, logWarn } from "./utils/loger.js";

dotenv.config();

// Validación .env
["WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "VERIFY_TOKEN"].forEach((v) => {
  if (!process.env[v]) logWarn(`⚠️ Falta ${v} en .env`);
});

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

// Carpeta de exportaciones públicas (CSV)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.join(__dirname, "..", "exports");
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
app.use("/exports", express.static(EXPORT_DIR));
app.set("EXPORT_DIR", EXPORT_DIR); // para acceder desde el router

// Healthcheck
app.get("/", (_req, res) => res.send("🚀 Bot de WhatsApp activo y funcionando!"));

// Webhook
app.use("/webhook", webhookRouter);

app.listen(PORT, () => logInfo(`✅ Servidor en http://localhost:${PORT}`));
