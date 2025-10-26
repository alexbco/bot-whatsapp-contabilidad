// src/utils/formatExtracto.js

// Este formatter convierte el objeto que devuelve getExtractoMensual()
// en el mensajito de WhatsApp bonito tipo:
//
// 📅 Extracto 2025-10
// Cliente: alex blanco
//
// DETALLE:
// • 2025-10-26 | COMPRA | regalos | 30,00€
// ...
//
// RESUMEN DEL MES:
// Facturado este mes: 130,00€
// Pagos recibidos:    0,00€
// Beneficio bruto:    120,00€
// Beneficio compras:  0,00€
//
// SALDO PENDIENTE A DÍA DE HOY:
// -130,00€ (negativo = te queda por pagarte / positivo = tiene saldo a favor)

function euros(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "0,00€";
  return Number(n).toFixed(2).replace(".", ",") + "€";
}

export function formatExtractoWhatsApp(info) {
  // Ajustamos a los NUEVOS nombres establecidos en getExtractoMensual()

  const nombreCliente =
    info.clienteNombreCompleto ||
    (info.cliente && info.cliente.nombre) || // fallback por si algún día vuelve
    "-";

  const mesStr = info.mes || "-";

  // movimientos normalizados
  const lineasDetalle = Array.isArray(info.movimientos)
    ? info.movimientos.map((m) => {
        // formateamos fecha rollo yyyy-mm-dd
        const fechaCruda =
          m.fecha ||
          m.dia ||
          m.fechaOperacion ||
          m.created_at ||
          m.fechaMovimiento ||
          "";
        const fechaLimpia = limpiaFecha(fechaCruda);

        const tipo = m.tipo || "—";
        const concepto = m.concepto || "—";

        const importe =
          m.importe ??
          m.precioCliente ??
          m.totalCobrado ??
          m.monto ??
          0;

        return `• ${fechaLimpia} | ${tipo} | ${concepto} | ${euros(importe)}`;
      })
    : ["(sin movimientos este mes)"];

  // totales
  const facturado = info.totales?.facturado ?? 0;
  const pagado = info.totales?.pagado ?? 0;
  const beneficioBruto = info.totales?.beneficioBruto ?? 0;
  const beneficioCompras = info.totales?.beneficioCompras ?? 0;

  // saldo actual
  const saldo = info.saldo_actual ?? 0;

  // construimos mensaje final
  return [
    `📅 Extracto ${mesStr}`,
    `Cliente: ${nombreCliente}`,
    "",
    `DETALLE:`,
    ...lineasDetalle,
    "",
    `RESUMEN DEL MES:`,
    `Facturado este mes: ${euros(facturado)}`,
    `Pagos recibidos:    ${euros(pagado)}`,
    `Beneficio bruto:    ${euros(beneficioBruto)}`,
    `Beneficio compras:  ${euros(beneficioCompras)}`,
    "",
    `SALDO PENDIENTE A DÍA DE HOY:`,
    `${euros(
      saldo
    )}  (negativo = te queda por pagarte / positivo = tiene saldo a favor)`,
  ].join("\n");
}

// helper para cortar la T y la Z
function limpiaFecha(f) {
  if (!f || typeof f !== "string") return f || "¿fecha?";
  const tIndex = f.indexOf("T");
  if (tIndex !== -1) {
    return f.slice(0, tIndex);
  }
  return f;
}
