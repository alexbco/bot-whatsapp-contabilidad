// src/app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import "./db/connection.js"; // inicializa SQLite y crea tablas si no existen
import { router as webhookRouter } from "./routes/webhook.js";
import {
  aplicarMensualidadDelMesActual,
  aplicarSueldoMensualAutomatico,
} from "./db/repository.js";
import { logInfo, logWarn } from "./utils/loger.js";

// 👇 añadimos esto ARRIBA, no en medio:
import { EXTRACTOS_DIR } from "./config/paths.js";

// ========================
// 1) CONFIG ENV, APP BASE
// ========================
dotenv.config();

const variablesNecesarias = [
  "WHATSAPP_TOKEN",
  "PHONE_NUMBER_ID",
  "VERIFY_TOKEN",
  // no es estrictamente obligatorio para arrancar,
  // pero lo avisamos porque lo usamos para construir URLs públicas
  "PUBLIC_BASE_URL",
];

for (const variable of variablesNecesarias) {
  if (!process.env[variable]) {
    logWarn(`⚠️ Falta la variable ${variable} en .env`);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// 2) MIDDLEWARES GLOBALES
// ========================
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================
// 3) STATIC: EXPORTS (CSV)
// ========================
// carpeta física donde dejaremos los CSV exportados
const exportPath = path.join(__dirname, "..", "exports");
if (!fs.existsSync(exportPath)) {
  fs.mkdirSync(exportPath, { recursive: true });
  logInfo("📂 Carpeta /exports creada automáticamente");
}

// servir esa carpeta como estática para poder descargar CSVs
// => accesible en http://TU-DOMINIO/exports/loquesea.csv
app.use("/exports", express.static(exportPath));

// guardar ruta en app para poder usarla desde otros módulos si hace falta
app.set("EXPORT_DIR", exportPath);

// ========================
// 4) STATIC: EXTRACTOS (PDF)
// ========================
// A) aseguramos que la carpeta exista por si Render arranca fría
if (!fs.existsSync(EXTRACTOS_DIR)) {
  fs.mkdirSync(EXTRACTOS_DIR, { recursive: true });
  logInfo("📂 Carpeta /public/extractos creada automáticamente");
}

// B) Servimos esa carpeta en /extractos
// -> Un PDF guardado en /public/extractos/alex_blanco-2025-10.pdf
//    se podrá abrir vía
//    https://tu-dominio.onrender.com/extractos/alex_blanco-2025-10.pdf
app.use("/extractos", express.static(EXTRACTOS_DIR));

// C) Guardamos la ruta física en la app (si quieres usarla en otros sitios)
app.set("EXTRACTOS_DIR", EXTRACTOS_DIR);

// ========================
// 5) RUTAS HTTP
// ========================

// ping rápido para saber si está vivo
app.get("/", (_req, res) => {
  res.send("🚀 Bot de WhatsApp activo y funcionando!");
});

// webhook que usa Meta (WhatsApp Business API)
app.use("/webhook", webhookRouter);

// ========================
// 6) CRON INTERNO (cada hora)
// ========================
// cada hora comprobamos si hay que aplicar mensualidad
setInterval(() => {
  aplicarSueldoMensualAutomatico();
  // si quieres también aplicarMensualidadDelMesActual(), descomenta abajo:
  // aplicarMensualidadDelMesActual();
}, 60 * 60 * 1000); // cada hora

// ========================
// 7) ARRANQUE SERVER
// ========================
app.listen(PORT, () => {
  logInfo(`✅ Servidor iniciado en http://localhost:${PORT}`);
  logInfo("⏰ Cron interno activo: revisará mensualidades cada hora.");
});
