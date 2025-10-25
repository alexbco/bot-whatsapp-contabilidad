// src/utils/formatExtracto.js

function eur(n) {
  if (n === null || n === undefined) return "-";
  return n.toFixed(2) + "€";
}

function shortTipo(tipo) {
  switch (tipo) {
    case "GASTO_REVENTA":
      return "Material";
    case "SERVICIO_EXTRA":
      return "Servicio";
    case "LIMPIEZA":
      return "Limpieza";
    case "PAGO_CLIENTE":
      return "Pago";
    default:
      return tipo;
  }
}

// Formatea todos los movimientos en líneas de texto
function formatLineas(movs) {
  if (!movs.length) return "  (sin movimientos este mes)\n";

  return movs
    .map((m) => {
      // fecha cortita YYYY-MM-DD
      const fechaCorta = m.fecha.slice(0, 10);
      // qué ha sido
      const etiqueta = shortTipo(m.tipo);
      // importe visible al cliente
      // - si es un pago del cliente, mostramos "Pago 250€"
      // - si es gasto/servicio/limpieza, mostramos el precioCliente
      let importeVisible;
      if (m.tipo === "PAGO_CLIENTE") {
        importeVisible = eur(m.monto || 0);
      } else {
        importeVisible = eur(m.precioCliente || 0);
      }

      return `• ${fechaCorta} | ${etiqueta} | ${m.concepto} | ${importeVisible}`;
    })
    .join("\n");
}

export function formatExtractoWhatsApp(data) {
  // data = { ok, cliente, mes, movimientos, resumen }

  if (!data.ok) {
    return `❌ ${data.error || "No se pudo generar el extracto."}`;
  }

  const nombreCliente = data.cliente.nombre || data.cliente.alias;
  const mes = data.mes;
  const saldoActual = data.cliente.saldoActual;

  const {
    totalFacturadoEseMes,
    totalPagosEseMes,
    beneficioBrutoMes,
  } = data.resumen;

  const bloqueMovs = formatLineas(data.movimientos);

  // Construimos el mensaje final
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
    ``,
    `SALDO PENDIENTE A DÍA DE HOY:`,
    `  ${eur(saldoActual)}  (negativo = te queda por pagarme / positivo = tienes saldo a favor)`,
  ].join("\n");
}
