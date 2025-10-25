// db/connection.js (ejemplo con better-sqlite3)
import Database from "better-sqlite3";
const db = new Database("./data.db");

// Tabla clientes
db.prepare(`
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,   -- nombre completo: "Antonio Vargas Uceda"
    alias TEXT UNIQUE,             -- opcional: "AVU", "LO", etc. puede ser NULL
    saldo_actual REAL NOT NULL DEFAULT 0
);
`).run();

// Tabla movimientos
db.prepare(`
CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,                -- ISO string "2025-10-25T13:40:00"
    mes TEXT NOT NULL,                  -- "2025-10" para agrupar extractos
    cliente_id INTEGER,                 -- puede ser NULL en cosas que no son cliente
    tipo TEXT NOT NULL,                 -- 'GASTO_REVENTA' | 'SERVICIO_EXTRA' | 'LIMPIEZA' | 'PAGO_CLIENTE'
    concepto TEXT NOT NULL,             -- ej. "2 sacos abono", "limpieza septiembre", "gasolina"
    precio_cliente REAL,                -- lo que se cobra al cliente (p.e. 187.50)
    precio_coste REAL,                  -- lo que costó de verdad (p.e. 90.50). Para servicios puede ser NULL
    beneficio REAL,                     -- diferencia. Podemos calcularla antes de insertar.
    monto REAL,                         -- impacto en la cuenta del cliente:
                                         --   gasto/servicio: NEGATIVO (aumenta deuda)
                                         --   pago del cliente: POSITIVO (disminuye deuda)
    factura_path TEXT,                  -- ruta/filename si hay foto asociada
    extra_json TEXT,                    -- JSON opcional para detalles extra (ej: horas de limpieza, productos, etc.)
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);
`).run();

export default db;
