// src/app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import "./db/connection.js"; // inicializa SQLite y crea tabla si no existe
import { router as webhookRouter } from "./routes/webhook.js";
import { logInfo, logWarn } from "./utils/loger.js";

// ========================
// 1) CONFIG ENV, APP BASE
// ========================
dotenv.config();

const variablesNecesarias = ["WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "VERIFY_TOKEN"];
for (const variable of variablesNecesarias) {
  if (!process.env[variable]) logWarn(`⚠️ Falta la variable ${variable} en .env`);
}

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// 2) MIDDLEWARES GLOBALES
// ========================
app.use(cors());
app.use(express.json());

// ========================
// 3) RUTAS Y STATIC /exports
// ========================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// carpeta física donde dejaremos los CSV exportados
const exportPath = path.join(__dirname, "..", "exports");
if (!fs.existsSync(exportPath)) {
  fs.mkdirSync(exportPath, { recursive: true });
  logInfo("📂 Carpeta /exports creada automáticamente");
}

// servir esa carpeta como estática para poder descargar
app.use("/exports", express.static(exportPath));
// guardar ruta en app para poder usarla desde el webhook
app.set("EXPORT_DIR", exportPath);

// ping rápido para saber si está vivo
app.get("/", (_req, res) => {
  res.send("🚀 Bot de WhatsApp activo y funcionando!");
});

// webhook que usa Meta
app.use("/webhook", webhookRouter);

// ========================
// 4) ARRANQUE SERVER
// ========================
app.listen(PORT, () => {
  logInfo(`✅ Servidor iniciado en http://localhost:${PORT}`);
});
