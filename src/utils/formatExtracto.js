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

export function formatExtractoWhatsApp(datos) {
  // asumo que 'datos' trae estos campos:
  // datos.totalMaterial
  // datos.totalServicio
  // datos.totalPagos
  // datos.movimientos (lista con detalle)

  const totalFacturado = datos.totalMaterial + datos.totalServicio;

  // 👇 NUEVA LÓGICA
  const beneficioBruto = totalFacturado;

  const saldoPendiente = datos.totalPagos - totalFacturado;

  // ahora montas el texto final:
  let detalleLines = datos.movimientos.map(mov => {
    // ej: "• 2025-10-25 | Material | abono cesped | 187.50€"
    return `• ${mov.fecha} | ${mov.tipo} | ${mov.concepto} | ${mov.importe.toFixed(2)}€`;
  });

  return (
`📅 Extracto ${datos.mes}
Cliente: ${datos.cliente}

DETALLE:
${detalleLines.join("\n")}

RESUMEN DEL MES:
Facturado este mes: ${totalFacturado.toFixed(2)}€
Pagos recibidos:   ${datos.totalPagos.toFixed(2)}€
Beneficio bruto:   ${beneficioBruto.toFixed(2)}€

SALDO PENDIENTE A DÍA DE HOY:
${saldoPendiente.toFixed(2)}€ 
(negativo = te queda por pagarte / positivo = tiene saldo a favor)`
  );
}
