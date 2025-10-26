// src/utils/pdf.js
import fs from "fs";
import PDFDocument from "pdfkit";

/**
 * generaExtractoPDF(info, absPath)
 * - info: objeto que viene de getExtractoMensual(...)
 * - absPath: ruta absoluta donde guardar el PDF final
 */
export async function generaExtractoPDF(info, absPath) {
  return new Promise((resolve, reject) => {
    try {
      // 1. crear carpeta destino si no existe
      const dir = absPath.substring(0, absPath.lastIndexOf("/"));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 2. crear el doc PDF
      const doc = new PDFDocument({ margin: 40 });

      const stream = fs.createWriteStream(absPath);
      doc.pipe(stream);

      // CABECERA
      doc
        .fontSize(16)
        .text("Extracto mensual", { underline: true })
        .moveDown(0.5);

      doc
        .fontSize(12)
        .text(`Cliente: ${info.clienteNombreCompleto || "-"}`)
        .text(`Mes: ${info.mes || "-"}`)
        .moveDown(1);

      // DETALLE DE MOVIMIENTOS
      doc.fontSize(13).text("Detalle de movimientos:", { underline: true });
      doc.moveDown(0.5);

      if (Array.isArray(info.movimientos) && info.movimientos.length > 0) {
        info.movimientos.forEach((mov) => {
          // aquí yo asumo que cada "mov" tiene algo tipo:
          // { fecha: '2025-10-26', tipo: 'Compra', concepto: 'césped', importe: 10.0 }
          // si tu estructura real es distinta, adáptalo aquí
          const fecha = mov.fecha || mov.dia || mov.fechaOperacion || "¿fecha?";
          const tipo = mov.tipo || mov.categoria || "-";
          const concepto = mov.concepto || mov.detalle || "-";

          // en compras/trabajos/etc a veces el dinero está en otra prop:
          // intenta importe || totalCobrado || precioCliente etc
          const importe =
            mov.importe ??
            mov.totalCobrado ??
            mov.precioCliente ??
            mov.cantidad ??
            0;

          doc
            .fontSize(11)
            .text(
              `• ${fecha} | ${tipo} | ${concepto} | ${formateaEuros(importe)}`,
              { lineBreak: true }
            );
        });
      } else {
        doc.fontSize(11).text("No hay movimientos en este periodo.");
      }

      doc.moveDown(1);

      // RESUMEN DEL MES
      doc.fontSize(13).text("Resumen del mes:", { underline: true });
      doc.moveDown(0.5);

      const facturado = info.totales?.facturado ?? 0;
      const pagado = info.totales?.pagado ?? 0;
      const beneficioBruto = info.totales?.beneficioBruto ?? 0;
      const beneficioCompras = info.totales?.beneficioCompras ?? 0;

      doc.fontSize(11).text(`Facturado este mes: ${formateaEuros(facturado)}`);
      doc.fontSize(11).text(`Pagos recibidos:   ${formateaEuros(pagado)}`);
      doc.fontSize(11).text(`Beneficio bruto:   ${formateaEuros(beneficioBruto)}`);
      doc
        .fontSize(11)
        .text(`Beneficio compras: ${formateaEuros(beneficioCompras)}`);

      doc.moveDown(1);

      // SALDO PENDIENTE
      const saldo = info.saldo_actual ?? 0;
      doc.fontSize(13).text("Saldo pendiente a día de hoy:", {
        underline: true,
      });
      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .text(
          `${formateaEuros(
            saldo
          )}  (negativo = te queda por pagarte / positivo = tiene saldo a favor)`
        );

      // cerrar el PDF
      doc.end();

      stream.on("finish", () => {
        resolve();
      });

      stream.on("error", (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function formateaEuros(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Number(n).toFixed(2).replace(".", ",") + "€";
}
