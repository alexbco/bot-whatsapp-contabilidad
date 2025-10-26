function eur(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Number(n).toFixed(2) + "€";
}

// Texto corto y "humano" del tipo de movimiento
function etiquetaTipo(tipo) {
  switch (tipo) {
    case "COMPRA":
      return "Compra";
    case "TRABAJOS":
      return "Trabajos";
    case "MARI":
      return "Mari";
    case "MENSUALIDAD":
      return "Mensualidad";
    case "PAGO_CLIENTE":
      return "Pago";
    default:
      return tipo;
  }
}

// Una línea por movimiento
function renderLineaMovimiento(m) {
  // fecha corta YYYY-MM-DD
  const fechaCorta = m.fecha?.slice(0, 10) || "-";

  // importe que vamos a mostrar en la línea
  // regla:
  //  - si es PAGO_CLIENTE => usamos monto (lo que ha pagado el cliente)
  //  - si no => usamos precioCliente (lo que le cobramos)
  let importeVisible = null;
  if (m.tipo === "PAGO_CLIENTE") {
    importeVisible = m.monto ?? null;
  } else {
    importeVisible = m.precioCliente ?? null;
  }
  const tieneFactura = m.facturaPath ? "📸" : "";

  return `• ${fechaCorta} | ${etiquetaTipo(m.tipo)} | ${m.concepto} ${tieneFactura} | ${eur(importeVisible)}`;
}

export function formatExtractoWhatsApp(data) {
  // data viene de getExtractoMensual()

  if (!data || data.ok === false) {
    return `❌ ${data?.error || "No se pudo generar el extracto."}`;
  }

  const nombreCliente = data.cliente.nombre;
  const saldoActual = data.cliente.saldoActual;
  const mes = data.mes;

  const {
    totalFacturadoEseMes,
    totalPagosEseMes,
    beneficioBrutoMes,
    beneficioSoloComprasMes,
  } = data.resumen;

  // Detalle de movimientos
  let bloqueMovs;
  if (!data.movimientos || data.movimientos.length === 0) {
    bloqueMovs = "(sin movimientos este mes)";
  } else {
    bloqueMovs = data.movimientos.map(renderLineaMovimiento).join("\n");
  }

  // Montamos el mensaje
  return [
    `📆 Extracto ${mes}`,
    `Cliente: ${nombreCliente}`,
    ``,
    `DETALLE:`,
    bloqueMovs,
    ``,
    `RESUMEN DEL MES:`,
    `  Facturado este mes: ${eur(totalFacturadoEseMes)}`,
    `  Pagos recibidos:    ${eur(totalPagosEseMes)}`,
    `  Beneficio bruto:    ${eur(beneficioBrutoMes)}`,
    `  Beneficio compras:  ${eur(beneficioSoloComprasMes)}`,
    ``,
    `SALDO PENDIENTE A DÍA DE HOY:`,
    `  ${eur(saldoActual)}  (negativo = te queda por pagarte / positivo = tiene saldo a favor)`,
  ].join("\n");
}
