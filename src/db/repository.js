// src/db/repository.js
import dbPromise from "./connection.js";

// Inserta una nueva fila en la tabla movimientos.
// Calcula diferencia = v_compra - v_descuento automáticamente.
export async function insertarMovimiento({ fecha, destino, concepto, v_compra, v_descuento = 0, estado = "pendiente" }) {
  const db = await dbPromise;

  const compraNum = Number(String(v_compra).replace(",", "."));
  const descNum = Number(String(v_descuento).replace(",", ".") || 0);
  const diferencia = compraNum - descNum;

  const result = await db.run(
    `INSERT INTO movimientos (fecha, destino, concepto, v_compra, v_descuento, diferencia, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [fecha, destino, concepto, compraNum, descNum, diferencia, estado]
  );

  return {
    id: result.lastID,
    fecha,
    destino,
    concepto,
    v_compra: compraNum,
    v_descuento: descNum,
    diferencia,
    estado,
  };
}

// Devuelve últimos N movimientos (por defecto 10)
export async function listarUltimosMovimientos(limit = 10) {
  const db = await dbPromise;
  const rows = await db.all(
    `SELECT id, fecha, destino, concepto, v_compra, v_descuento, diferencia, estado
     FROM movimientos
     ORDER BY id DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

// Buscar por texto (destino o concepto contienen ese texto)
export async function buscarPorConcepto(query) {
  const db = await dbPromise;
  const like = `%${query}%`;
  const rows = await db.all(
    `SELECT id, fecha, destino, concepto, v_compra, v_descuento, diferencia, estado
     FROM movimientos
     WHERE concepto LIKE ? OR destino LIKE ?
     ORDER BY fecha DESC, id DESC`,
    [like, like]
  );
  return rows;
}

// Total del mes "MM-YY" (ej: "10-25" = octubre 2025)
// Suma la columna diferencia.
export async function totalPorMes(mesYY) {
  const db = await dbPromise;
  const row = await db.get(
    `SELECT SUM(diferencia) AS total
     FROM movimientos
     WHERE fecha LIKE ?`,
    [`%${mesYY}`] // esto pilla "24-10-25" cuando pides "10-25"
  );
  return row?.total || 0;
}

// Lista completa de un mes concreto "MM-YY" para exportar a CSV.
export async function movimientosPorMes(mesYY) {
  const db = await dbPromise;
  const rows = await db.all(
    `SELECT fecha, destino, concepto, v_compra, v_descuento, diferencia, estado
     FROM movimientos
     WHERE fecha LIKE ?
     ORDER BY fecha ASC, id ASC`,
    [`%${mesYY}`]
  );
  return rows;
}
