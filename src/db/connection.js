// src/db/connection.js
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { logInfo } from "../utils/loger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// === Aseguramos que exista la carpeta /db incluso en Render ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "data.db");

// Si no existe la carpeta, la crea
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  logInfo("📂 Carpeta /db creada automáticamente");
}

const dbPromise = open({
  filename: dbPath,
  driver: sqlite3.Database,
});

// Creamos la tabla al iniciar
(async () => {
  const db = await dbPromise;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT,
      destino TEXT,
      concepto TEXT,
      v_compra REAL,
      v_descuento REAL,
      diferencia REAL,
      estado TEXT
    );
  `);
  logInfo("🗄️ Tabla 'movimientos' lista en SQLite");
})();

export default dbPromise;
