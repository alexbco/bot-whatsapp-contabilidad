// src/db/connection.js
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { logInfo } from "../utils/loger.js";

// Abrimos la BD en modo promesa
const dbPromise = open({
  filename: "./db/data.db",
  driver: sqlite3.Database,
});

// Creamos la tabla 'movimientos' si no existe
(async () => {
  const db = await dbPromise;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT,           -- ej: "24-10-25"
      destino TEXT,         -- ej: "coche", "casa", "cliente X"
      concepto TEXT,        -- ej: "gasolina repsol", "pintura garaje"
      v_compra REAL,        -- valor bruto de compra
      v_descuento REAL,     -- descuento aplicado
      diferencia REAL,      -- v_compra - v_descuento (se calcula solo)
      estado TEXT           -- ej: "pagado", "pendiente"
    );
  `);
  logInfo("🗄️ Tabla 'movimientos' lista en SQLite");
})();

export default dbPromise;
