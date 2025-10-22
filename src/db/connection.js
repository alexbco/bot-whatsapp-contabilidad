// src/db/connection.js
import Database from "better-sqlite3";

const db = new Database("./data.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cantidad_cents INTEGER NOT NULL,
  fecha_iso TEXT NOT NULL,
  remitente TEXT
);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_iso);
CREATE INDEX IF NOT EXISTS idx_pagos_nombre ON pagos(nombre);
`);

export default db;
