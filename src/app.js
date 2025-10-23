// src/app.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Conexión a la base de datos SQLite
import "./db/connection.js";

// Importamos las rutas del bot
import { router as webhookRouter } from "./routes/webhook.js";

// Funciones para logs personalizados
import { logInfo, logWarn } from "./utils/loger.js";

// ============================================================
// 1️⃣ CONFIGURACIÓN INICIAL
// ============================================================

// Cargar variables del archivo .env
dotenv.config();

// Comprobamos que las variables importantes existan
const variablesNecesarias = ["WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "VERIFY_TOKEN"];
for (const variable of variablesNecesarias) {
  if (!process.env[variable]) logWarn(`⚠️ Falta la variable ${variable} en .env`);
}

// Creamos la aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// 2️⃣ MIDDLEWARES (cosas que Express hace con cada petición)
// ============================================================

// Permite recibir peticiones desde fuera (por ejemplo desde Meta)
app.use(cors());

// Permite procesar el cuerpo (body) de las peticiones JSON
app.use(express.json());

// ============================================================
// 3️⃣ CONFIGURACIÓN DE CARPETAS
// ============================================================

// Conseguimos la ruta actual del archivo (por temas de ESModules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Creamos la carpeta "exports" si no existe (para los CSV)
const exportPath = path.join(__dirname, "..", "exports");
if (!fs.existsSync(exportPath)) {
  fs.mkdirSync(exportPath, { recursive: true });
  logInfo("📂 Carpeta /exports creada automáticamente");
}

// Hacemos pública la carpeta exports (para descargar los CSV)
app.use("/exports", express.static(exportPath));
app.set("EXPORT_DIR", exportPath); // para acceder a ella desde otras partes

// ============================================================
// 4️⃣ RUTAS DEL SERVIDOR
// ============================================================

// Ruta principal → solo para comprobar si está vivo el servidor
app.get("/", (_req, res) => {
  res.send("🚀 Bot de WhatsApp activo y funcionando!");
});

// Ruta del webhook → donde Meta manda los mensajes de WhatsApp
app.use("/webhook", webhookRouter);

// ============================================================
// 5️⃣ INICIO DEL SERVIDOR
// ============================================================

app.listen(PORT, () => logInfo(`✅ Servidor iniciado en http://localhost:${PORT}`));
