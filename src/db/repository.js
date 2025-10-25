// db/repository.js
import db from "./connection.js";

// Util: asegura que el cliente existe y devuelve su fila
export function getOrCreateCliente({ nombre, alias = null }) {
  // 1. intentar buscar por nombre exacto
  let row = db.prepare(`
    SELECT * FROM clientes WHERE nombre = ?
  `).get(nombre);

  // si no lo encuentra por nombre y nos pasan alias, intentar por alias
  if (!row && alias) {
    row = db.prepare(`
      SELECT * FROM clientes WHERE alias = ?
    `).get(alias);
  }

  // si sigue sin existir, crearlo
  if (!row) {
    const result = db.prepare(`
      INSERT INTO clientes (nombre, alias, saldo_actual)
      VALUES (?, ?, 0)
    `).run(nombre, alias);
    row = {
      id: result.lastInsertRowid,
      nombre,
      alias,
      saldo_actual: 0,
    };
  }

  return row;
}

// Util: actualiza saldo en clientes
function actualizarSaldoCliente(clienteId, delta) {
  db.prepare(`
    UPDATE clientes
    SET saldo_actual = saldo_actual + ?
    WHERE id = ?
  `).run(delta, clienteId);
}

// Util: inserta un movimiento genérico
function insertarMovimientoBase(mov) {
  // mov = {fecha, mes, cliente_id, tipo, concepto,
  //        precio_cliente, precio_coste, beneficio,
  //        monto, factura_path, extra_json}

  const stmt = db.prepare(`
    INSERT INTO movimientos (
      fecha, mes, cliente_id, tipo, concepto,
      precio_cliente, precio_coste, beneficio,
      monto, factura_path, extra_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    mov.fecha,
    mov.mes,
    mov.cliente_id ?? null,
    mov.tipo,
    mov.concepto,
    mov.precio_cliente ?? null,
    mov.precio_coste ?? null,
    mov.beneficio ?? null,
    mov.monto ?? null,
    mov.factura_path ?? null,
    mov.extra_json ? JSON.stringify(mov.extra_json) : null
  );

  return result.lastInsertRowid;
}

// === CASOS DE NEGOCIO ===

// 1. Gasto con descuento (GASTO_REVENTA)
export function registrarGastoReventa({ nombreCliente, aliasCliente, concepto, precioCliente, precioCoste }) {
  const cliente = getOrCreateCliente({ nombre: nombreCliente, alias: aliasCliente });

  const beneficio = (precioCliente - precioCoste);
  const monto = -precioCliente; // el cliente ahora debe ese dinero

  const now = new Date();
  const fechaISO = now.toISOString();
  const mes = fechaISO.slice(0, 7); // "2025-10"

  const movimientoId = insertarMovimientoBase({
    fecha: fechaISO,
    mes,
    cliente_id: cliente.id,
    tipo: "GASTO_REVENTA",
    concepto,
    precio_cliente: precioCliente,
    precio_coste: precioCoste,
    beneficio,
    monto,
    factura_path: null,
    extra_json: null,
  });

  actualizarSaldoCliente(cliente.id, monto);

  return {
    movimientoId,
    saldo_actual_nuevo: cliente.saldo_actual + monto,
    beneficio,
  };
}

// 2. Servicio sin descuento (SERVICIO_EXTRA)
export function registrarServicioExtra({ nombreCliente, aliasCliente, concepto, importe }) {
  const cliente = getOrCreateCliente({ nombre: nombreCliente, alias: aliasCliente });

  const beneficio = importe;
  const monto = -importe;

  const now = new Date();
  const fechaISO = now.toISOString();
  const mes = fechaISO.slice(0, 7);

  const movimientoId = insertarMovimientoBase({
    fecha: fechaISO,
    mes,
    cliente_id: cliente.id,
    tipo: "SERVICIO_EXTRA",
    concepto,
    precio_cliente: importe,
    precio_coste: null,
    beneficio,
    monto,
    factura_path: null,
    extra_json: null,
  });

  actualizarSaldoCliente(cliente.id, monto);

  return {
    movimientoId,
    saldo_actual_nuevo: cliente.saldo_actual + monto,
    beneficio,
  };
}

// 3. Limpieza (LIMPIEZA)
export function registrarLimpieza({ nombreCliente, aliasCliente, concepto, totalCobrado }) {
  const cliente = getOrCreateCliente({ nombre: nombreCliente, alias: aliasCliente });

  const beneficio = totalCobrado; // todo lo que se cobra es beneficio
  const monto = -totalCobrado;    // el cliente debe eso

  const now = new Date();
  const fechaISO = now.toISOString();
  const mes = fechaISO.slice(0, 7);

  const movimientoId = insertarMovimientoBase({
    fecha: fechaISO,
    mes,
    cliente_id: cliente.id,
    tipo: "LIMPIEZA",
    concepto,
    precio_cliente: totalCobrado,
    precio_coste: 0,
    beneficio,
    monto,
    factura_path: null,
    extra_json: null, // ya no necesitamos horas ni productos
  });

  actualizarSaldoCliente(cliente.id, monto);

  return {
    movimientoId,
    saldo_actual_nuevo: cliente.saldo_actual + monto,
    beneficio,
  };
}


// 4. Pago del cliente (PAGO_CLIENTE)
export function registrarPagoCliente({ nombreCliente, aliasCliente, cantidad }) {
  const cliente = getOrCreateCliente({ nombre: nombreCliente, alias: aliasCliente });

  const monto = cantidad; // pago reduce deuda -> monto positivo

  const now = new Date();
  const fechaISO = now.toISOString();
  const mes = fechaISO.slice(0, 7);

  const movimientoId = insertarMovimientoBase({
    fecha: fechaISO,
    mes,
    cliente_id: cliente.id,
    tipo: "PAGO_CLIENTE",
    concepto: "Pago cliente",
    precio_cliente: null,
    precio_coste: null,
    beneficio: null,
    monto,
    factura_path: null,
    extra_json: null,
  });

  actualizarSaldoCliente(cliente.id, monto);

  return {
    movimientoId,
    saldo_actual_nuevo: cliente.saldo_actual + monto,
  };
}
// db/repository.js
import db from "./connection.js";

// Buscar cliente por nombre o alias (para extractos y tal)
function findClienteByNombreOAlias(nombreOAlias) {
  const row = db.prepare(
    `
    SELECT * FROM clientes
    WHERE lower(nombre) = lower(?)
       OR lower(alias) = lower(?)
    `
  ).get(nombreOAlias, nombreOAlias);

  return row || null;
}

// Devuelve movimientos de un cliente en un mes concreto ("2025-09")
export function getExtractoMensual({ nombreClienteOAlias, mes }) {
  const cliente = findClienteByNombreOAlias(nombreClienteOAlias);
  if (!cliente) {
    return {
      ok: false,
      error: `No existe el cliente "${nombreClienteOAlias}".`,
    };
  }

  // Todos los movimientos de ese mes
  const movimientos = db
    .prepare(
      `
      SELECT
        id,
        fecha,
        tipo,
        concepto,
        precio_cliente AS precioCliente,
        precio_coste   AS precioCoste,
        beneficio,
        monto,
        factura_path   AS facturaPath
      FROM movimientos
      WHERE cliente_id = ?
        AND mes = ?
      ORDER BY fecha ASC
      `
    )
    .all(cliente.id, mes);

  // Calcular totales útiles para el extracto

  let totalFacturadoEseMes = 0; // suma de lo que se le ha cobrado (precioCliente) en trabajos/gastos/limpieza
  let totalPagosEseMes = 0;     // suma de pagos recibidos del cliente
  let beneficioBrutoMes = 0;    // suma de beneficios (lo que gana tu padre/madre)

  movimientos.forEach((m) => {
    if (m.tipo === "PAGO_CLIENTE") {
      // pago del cliente → monto es positivo y reduce deuda
      totalPagosEseMes += m.monto || 0;
    } else {
      // servicios, limpieza, gasto reventa → lo que el cliente debe pagar
      totalFacturadoEseMes += m.precioCliente || 0;
      beneficioBrutoMes += m.beneficio || 0;
    }
  });

  // El saldo_actual del cliente ahora (vivo hoy)
  const saldoActual = db
    .prepare(
      `
      SELECT saldo_actual AS saldoActual
      FROM clientes
      WHERE id = ?
      `
    )
    .get(cliente.id).saldoActual;

  // También calculamos saldo al cierre del mes
  // Truco: sumamos todos los movimientos DEL CLIENTE con fecha <= último día de ese mes
  // Nota: Para no liar fechas aún, primer MVP: saldoActual es lo que vamos a mostrar.
  // (si tu padre quiere "saldo a final de septiembre" exacto-histórico, luego afinamos
  // con una query por rango de fechas; ahora no lo complico porque aún estamos montando el flujo).

  return {
    ok: true,
    cliente: {
      id: cliente.id,
      nombre: cliente.nombre,
      alias: cliente.alias,
      saldoActual,
    },
    mes,
    movimientos,
    resumen: {
      totalFacturadoEseMes,
      totalPagosEseMes,
      beneficioBrutoMes,
    },
  };
}
