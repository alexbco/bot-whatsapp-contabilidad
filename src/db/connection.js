import Database from "better-sqlite3";
const db = new Database("./data.db");

// =========================
// Tabla clientes
// =========================
db.prepare(`
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    saldo_actual REAL NOT NULL DEFAULT 0
);
`).run();

// 👇 Migración suave: añadimos cuota_mensual si no existe
try {
  db.prepare(`
    ALTER TABLE clientes
    ADD COLUMN cuota_mensual REAL NOT NULL DEFAULT 0;
  `).run();
} catch (e) {
  // si ya existe, SQLite lanza error -> lo ignoramos
}

// =========================
db.prepare(`
CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    mes TEXT NOT NULL,
    cliente_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,           -- COMPRA / TRABAJOS / MARI / MENSUALIDAD / PAGO_CLIENTE
    concepto TEXT NOT NULL,
    precio_cliente REAL,
    precio_coste REAL,
    beneficio REAL,
    monto REAL,
    factura_path TEXT,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);
`).run();

// =========================
// Tabla meta_config (para guardar llaves tipo "mensualidad_ultima_aplicada")
// =========================
db.prepare(`
CREATE TABLE IF NOT EXISTS meta_config (
    clave TEXT PRIMARY KEY,
    valor TEXT
);
`).run();

export default db;
