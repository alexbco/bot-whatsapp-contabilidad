// src/utils/pdf.js
import fs from "fs";
import PDFDocument from "pdfkit";

/**
 * generaExtractoPDF(info, absPath)
 * - info: objeto que viene de getExtractoMensual(...)
 * - absPath: ruta absoluta donde guardar el PDF final
 *
 * Estructura esperada de info (lo alineamos a lo que ya mandas por WhatsApp):
 * {
 *   clienteNombreCompleto: "alex blanco",
 *   mes: "2025-10",
 *   movimientos: [
 *      {
 *        fecha: "2025-10-26T20:23:15.390Z",
 *        tipo: "TRABAJOS",        // o "MARI", "COMPRA", "PAGO", etc.
 *        concepto: "poda",
 *        importe: 80
 *      },
 *      ...
 *   ],
 *   totales: {
 *      facturado: 130,
 *      pagado: 0,
 *      beneficioBruto: 120,
 *      beneficioCompras: 0
 *   },
 *   saldo_actual: -130
 * }
 */
export async function generaExtractoPDF(info, absPath) {
  return new Promise((resolve, reject) => {
    try {
      // ---- asegurar carpeta destino
      const dir = absPath.substring(0, absPath.lastIndexOf("/"));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // ---- crear documento PDF
      const doc = new PDFDocument({ margin: 40 });

      const stream = fs.createWriteStream(absPath);
      doc.pipe(stream);

      // ===== CABECERA =====
      doc
        .fontSize(16)
        .text("Extracto mensual", { underline: true })
        .moveDown(0.5);

      doc
        .fontSize(12)
        .text(`Cliente: ${info.clienteNombreCompleto || "-"}`)
        .text(`Mes: ${info.mes || "-"}`)
        .moveDown(1);

      // ===== DETALLE =====
      doc.fontSize(13).text("Detalle de movimientos:", { underline: true });
      doc.moveDown(0.5);

      if (Array.isArray(info.movimientos) && info.movimientos.length > 0) {
        info.movimientos.forEach((mov) => {
          // Normalizamos campos
          const fechaCruda =
            mov.fecha ||
            mov.dia ||
            mov.fechaOperacion ||
            mov.created_at ||
            mov.fechaMovimiento ||
            "";
          const fechaLimpia = formateaFecha(fechaCruda);

          const tipo =
            mov.tipo ||
            mov.categoria ||
            mov.origen ||
            mov.clase ||
            "—";

          const concepto =
            mov.concepto ||
            mov.detalle ||
            mov.descripcion ||
            mov.nota ||
            "—";

          // Detectar número €: intentamos en orden las props que sueles usar
          const importe =
            mov.importe ??
            mov.totalCobrado ??
            mov.precioCliente ??
            mov.cantidad ??
            0;

          doc
            .fontSize(11)
            .text(
              `• ${fechaLimpia} | ${tipo} | ${concepto} | ${formateaEuros(
                importe
              )}`,
              { lineBreak: true }
            );
        });
      } else {
        doc.fontSize(11).text("No hay movimientos en este periodo.");
      }

      doc.moveDown(1);

      // ===== RESUMEN DEL MES =====
      doc.fontSize(13).text("Resumen del mes:", { underline: true });
      doc.moveDown(0.5);

      // Aquí usamos exactamente las keys que usa tu WhatsApp
      const facturado = info.totales?.facturado ?? 0;
      const pagado = info.totales?.pagado ?? 0;
      const beneficioBruto = info.totales?.beneficioBruto ?? 0;
      const beneficioCompras = info.totales?.beneficioCompras ?? 0;

      doc.fontSize(11).text(`Facturado este mes: ${formateaEuros(facturado)}`);
      doc.fontSize(11).text(`Pagos recibidos:    ${formateaEuros(pagado)}`);
      doc.fontSize(11).text(`Beneficio bruto:    ${formateaEuros(beneficioBruto)}`);
      doc
        .fontSize(11)
        .text(`Beneficio compras:  ${formateaEuros(beneficioCompras)}`);

      doc.moveDown(1);

      // ===== SALDO =====
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

      stream.on("finish", () => resolve());
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

// === helpers ===

// convierte 2025-10-26T20:23:15.390Z -> 2025-10-26
function formateaFecha(f) {
  if (!f || typeof f !== "string") return f || "¿fecha?";
  // si viene con 'T', cortamos fecha al principio
  const tIndex = f.indexOf("T");
  if (tIndex !== -1) {
    return f.slice(0, tIndex); // yyyy-mm-dd
  }
  return f;
}

function formateaEuros(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Number(n).toFixed(2).replace(".", ",") + "€";
}
