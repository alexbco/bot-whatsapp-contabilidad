import db from "./connection.js";
import { logInfo } from "../utils/loger.js";

// =======================
// Helpers internos
// =======================

function getConfigValor(clave) {
  const row = db.prepare(
    `SELECT valor FROM meta_config WHERE clave = ?`
  ).get(clave);
  return row ? row.valor : null;
}

function setConfigValor(clave, valor) {
  const existing = db.prepare(
    `SELECT valor FROM meta_config WHERE clave = ?`
  ).get(clave);

  if (existing) {
    db.prepare(
      `UPDATE meta_config SET valor = ? WHERE clave = ?`
    ).run(valor, clave);
  } else {
    db.prepare(
      `INSERT INTO meta_config (clave, valor) VALUES (?, ?)`
    ).run(clave, valor);
  }
}

// Busca cliente por nombre (case-insensitive),
// si no existe lo crea con saldo 0 y cuota_mensual 0
export function getOrCreateCliente({ nombre }) {
  let row = db
    .prepare(`SELECT * FROM clientes WHERE lower(nombre)=lower(?)`)
    .get(nombre);

  if (!row) {
    const result = db
      .prepare(
        `INSERT INTO clientes (nombre, saldo_actual, cuota_mensual)
         VALUES (?, 0, 0)`
      )
      .run(nombre);

    row = {
      id: result.lastInsertRowid,
      nombre,
      saldo_actual: 0,
      cuota_mensual: 0,
    };
  }

  return row;
}

function findClienteByNombre(nombreBuscado) {
  const row = db
    .prepare(
      `SELECT * FROM clientes WHERE lower(nombre)=lower(?)`
    )
    .get(nombreBuscado);
  return row || null;
}

function actualizarSaldoCliente(clienteId, delta) {
  db.prepare(
    `UPDATE clientes SET saldo_actual = saldo_actual + ? WHERE id = ?`
  ).run(delta, clienteId);
}

function insertarMovimientoBase(mov) {
  const stmt = db.prepare(`
    INSERT INTO movimientos (
      fecha,
      mes,
      cliente_id,
      tipo,
      concepto,
      precio_cliente,
      precio_coste,
      beneficio,
      monto,
      factura_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    mov.fecha,
    mov.mes,
    mov.cliente_id,
    mov.tipo,
    mov.concepto,
    mov.precio_cliente ?? null,
    mov.precio_coste ?? null,
    mov.beneficio ?? null,
    mov.monto ?? null,
    mov.factura_path ?? null
  );

  return result.lastInsertRowid;
}

// =======================
// Movimiento: COMPRA
// =======================
export function registrarCompra({
  nombreCliente,
  concepto,
  precioCliente,
  precioCoste,
  facturaPath = null,
}) {
  const cliente = getOrCreateCliente({ nombre: nombreCliente });

  const beneficio = precioCliente - precioCoste;
  const monto = -precioCliente;

  const now = new Date();
  const fechaISO = now.toISOString();
  const mes = fechaISO.slice(0, 7);

  const movimientoId = insertarMovimientoBase({
    fecha: fechaISO,
    mes,
    cliente_id: cliente.id,
    tipo: "COMPRA",
    concepto,
    precio_cliente: precioCliente,
    precio_coste: precioCoste,
    beneficio,
    monto,
    factura_path: facturaPath,
  });

  actualizarSaldoCliente(cliente.id, monto);

  return {
    movimientoId,
    saldo_actual_nuevo: cliente.saldo_actual + monto,
    beneficio,
  };
}

// =======================
// Movimiento: TRABAJOS
// =======================
export function registrarTrabajos({ nombreCliente, concepto, importe }) {
  const cliente = getOrCreateCliente({ nombre: nombreCliente });

  const beneficio = importe;
  const monto = -importe;

  const now = new Date();
  const fechaISO = now.toISOString();
  const mes = fechaISO.slice(0, 7);

  const movimientoId = insertarMovimientoBase({
    fecha: fechaISO,
    mes,
    cliente_id: cliente.id,
    tipo: "TRABAJOS",
    concepto,
    precio_cliente: importe,
    precio_coste: null,
    beneficio,
    monto,
    factura_path: null,
  });

  actualizarSaldoCliente(cliente.id, monto);

  return {
    movimientoId,
    saldo_actual_nuevo: cliente.saldo_actual + monto,
    beneficio,
  };
}

// =======================
// Movimiento: MARI
// =======================
export function registrarMari({
  nombreCliente,
  concepto,
  totalCobrado,
  costeProductos,
  facturaPath = null,
}) {
  const cliente = getOrCreateCliente({ nombre: nombreCliente });

  const beneficio = totalCobrado - costeProductos;
  const monto = -totalCobrado;

  const now = new Date();
  const fechaISO = now.toISOString();
  const mes = fechaISO.slice(0, 7);

  const movimientoId = insertarMovimientoBase({
    fecha: fechaISO,
    mes,
    cliente_id: cliente.id,
    tipo: "MARI",
    concepto,
    precio_cliente: totalCobrado,
    precio_coste: costeProductos,
    beneficio,
    monto,
    factura_path: facturaPath,
  });

  actualizarSaldoCliente(cliente.id, monto);

  return {
    movimientoId,
    saldo_actual_nuevo: cliente.saldo_actual + monto,
    beneficio,
  };
}

// =======================
// Movimiento: MENSUALIDAD
// =======================

// Aplica UNA mensualidad a UN cliente (resta su cuota fija al saldo)
export function registrarMensualidadCliente({ nombreCliente, fechaForzada = null }) {
  const cliente = getOrCreateCliente({ nombre: nombreCliente });

  const cuota = cliente.cuota_mensual || 0;
  if (!cuota || cuota <= 0) {
    return {
      ok: false,
      msg: `El cliente ${nombreCliente} no tiene cuota mensual configurada`,
    };
  }

  // Fecha del movimiento: día 25 del mes actual (o del mes de fechaForzada)
  const baseDate = fechaForzada ? new Date(fechaForzada) : new Date();

  const fechaMovimiento = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    25,
    12,
    0,
    0,
    0
  );
  const fechaISO = fechaMovimiento.toISOString();
  const mes = fechaISO.slice(0, 7); // "2025-10"

  const concepto = `mantenimiento ${mes}`;
  const monto = -cuota;        // aumenta deuda
  const beneficio = cuota;     // todo esto es ingreso de servicio mensual

  const movimientoId = insertarMovimientoBase({
    fecha: fechaISO,
    mes,
    cliente_id: cliente.id,
    tipo: "MENSUALIDAD",
    concepto,
    precio_cliente: cuota,
    precio_coste: null,
    beneficio,
    monto,
    factura_path: null,
  });

  actualizarSaldoCliente(cliente.id, monto);

  return {
    ok: true,
    movimientoId,
    saldo_actual_nuevo: cliente.saldo_actual + monto,
    cuota_aplicada: cuota,
  };
}

// Lógica que mete mensualidad A TODOS los clientes si toca (día 25) y si no se ha hecho este mes
export function aplicarMensualidadDelMesActual() {
  const ahora = new Date();
  const dia = ahora.getDate(); // 1..31
  if (dia !== 25) {
    return { ok: false, msg: "No es día 25, no aplico mensualidad." };
  }

  const mesActual = ahora.toISOString().slice(0, 7); // "2025-10"
  const ultimaAplicada = getConfigValor("mensualidad_ultima_aplicada");

  // si ya hicimos este mes, no repetir
  if (ultimaAplicada === mesActual) {
    return { ok: false, msg: "Mensualidad ya aplicada este mes." };
  }

  // Sacar todos los clientes con cuota_mensual > 0
  const clientesConCuota = db
    .prepare(
      `SELECT * FROM clientes WHERE cuota_mensual > 0`
    )
    .all();

  for (const cli of clientesConCuota) {
    registrarMensualidadCliente({
      nombreCliente: cli.nombre,
      // podemos forzar la misma fecha base "ahora"
      fechaForzada: ahora.toISOString(),
    });
  }

  // Guardamos que este mes ya está aplicado
  setConfigValor("mensualidad_ultima_aplicada", mesActual);

  return {
    ok: true,
    msg: `Mensualidad aplicada a ${clientesConCuota.length} clientes para ${mesActual}`,
  };
}

// =======================
// Movimiento: PAGO_CLIENTE
// =======================
export function registrarPagoCliente({ nombreCliente, cantidad }) {
  const cliente = getOrCreateCliente({ nombre: nombreCliente });
  const monto = cantidad; // pago = reduce deuda

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
  });

  actualizarSaldoCliente(cliente.id, monto);

  return {
    movimientoId,
    saldo_actual_nuevo: cliente.saldo_actual + monto,
  };
}

// =======================
// Extracto
// =======================
export function getExtractoMensual({ nombreCliente, mes }) {
  const cliente = findClienteByNombre(nombreCliente);
  if (!cliente) {
    return { ok: false, error: `No existe el cliente "${nombreCliente}".` };
  }

  const movimientosRaw = db
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

  let totalFacturadoEseMes = 0;
  let totalPagosEseMes = 0;
  let beneficioBrutoMes = 0;
  let beneficioSoloComprasMes = 0;

  // también formateamos cada movimiento para el PDF
  const movimientos = movimientosRaw.map((m) => {
    // calculamos importe = lo que se le cobró al cliente en esa línea
    const importe =
      m.precioCliente ??
      m.monto ?? // por si es un pago cliente
      0;

    // totales
    if (m.tipo === "PAGO_CLIENTE") {
      totalPagosEseMes += m.monto || 0;
    } else {
      totalFacturadoEseMes += m.precioCliente || 0;
      beneficioBrutoMes += m.beneficio || 0;
      if (m.tipo === "COMPRA") {
        beneficioSoloComprasMes += m.beneficio || 0;
      }
    }

    return {
      fecha: m.fecha,                 // ej "2025-10-26T20:23:15.390Z"
      tipo: m.tipo,                   // "COMPRA" | "TRABAJOS" | "MARI" | etc
      concepto: m.concepto,           // "regalos" | "poda" | ...
      importe: importe,               // número en €
      facturaPath: m.facturaPath || null, // 👈 la ruta en disco /facturas/... o null
    };
  });

  const saldoActual = cliente.saldo_actual;

  // devolvemos en el shape que el PDF Y WhatsApp entienden
  return {
    ok: true,

    // nombre del cliente COMO STRING ya plano:
    clienteNombreCompleto: cliente.nombre,

    mes, // "2025-10"

    movimientos, // array normalizado tal cual lo quiere el PDF

    totales: {
      facturado: totalFacturadoEseMes,
      pagado: totalPagosEseMes,
      beneficioBruto: beneficioBrutoMes,
      beneficioCompras: beneficioSoloComprasMes,
    },

    saldo_actual: saldoActual,
  };
}

export function aplicarSueldoMensualAutomatico() {
  const hoy = new Date();
  const dia = hoy.getDate();
  const mes = hoy.getMonth() + 1; // 1-12
  const anio = hoy.getFullYear();

  // Solo ejecutar el día 1 del mes
  if (dia !== 1) return;

  const mesClave = `${anio}-${String(mes).padStart(2, "0")}`;

  db.all("SELECT * FROM clientes", [], (err, clientes) => {
    if (err) {
      console.error("❌ Error al leer clientes:", err);
      return;
    }

    clientes.forEach((cliente) => {
      if (!cliente.sueldo_mensual || cliente.sueldo_mensual === 0) return;

      // Verificamos si ya se aplicó este mes
      db.get(
        `SELECT COUNT(*) AS count FROM movimientos
         WHERE nombre_cliente = ? AND tipo = 'SUELDO_MENSUAL' AND mes = ?`,
        [cliente.nombre_cliente, mesClave],
        (err, row) => {
          if (err) {
            console.error("Error comprobando mensualidad:", err);
            return;
          }

          if (row.count > 0) return; // ya aplicado este mes

          // Insertamos nuevo movimiento mensual
          const importe = -Math.abs(cliente.sueldo_mensual);

          db.run(
            `INSERT INTO movimientos (fecha, tipo, nombre_cliente, concepto, importe, mes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              new Date().toISOString().split("T")[0],
              "SUELDO_MENSUAL",
              cliente.nombre_cliente,
              `Sueldo mensual ${mesClave}`,
              importe,
              mesClave,
            ],
            (err) => {
              if (err) {
                console.error("❌ Error insertando sueldo mensual:", err);
              } else {
                // actualizamos saldo del cliente
                db.run(
                  `UPDATE clientes SET saldo_actual = saldo_actual + ? WHERE nombre_cliente = ?`,
                  [importe, cliente.nombre_cliente],
                  (err2) => {
                    if (!err2) {
                      logInfo(
                        `💼 Sueldo mensual aplicado a ${cliente.nombre_cliente}: ${importe}€`
                      );
                    }
                  }
                );
              }
            }
          );
        }
      );
    });
  });
}