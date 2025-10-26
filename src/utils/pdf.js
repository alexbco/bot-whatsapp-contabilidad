import fs from "fs";
import PDFDocument from "pdfkit";

/**
 * info = {
 *   ok: true,
 *   clienteNombreCompleto: "alex blanco",
 *   mes: "2025-10",
 *   movimientos: [
 *     {
 *       fecha: "2025-10-26T20:23:15.390Z",
 *       tipo: "COMPRA",
 *       concepto: "regalos",
 *       importe: 30,
 *       facturaPath: "/opt/render/project/.../public/facturas/factura_123.jpg"
 *     },
 *     ...
 *   ],
 *   totales: {
 *     facturado: 130,
 *     pagado: 0,
 *     beneficioBruto: 120,
 *     beneficioCompras: 0
 *   },
 *   saldo_actual: -130
 * }
 */
export async function generaExtractoPDF(info, absPath) {
  return new Promise((resolve, reject) => {
    try {
      // asegurar carpeta destino
      const dir = absPath.substring(0, absPath.lastIndexOf("/"));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // normalización mínima ya que ahora info viene en el shape correcto
      const clienteNombre =
        typeof info.clienteNombreCompleto === "string"
          ? info.clienteNombreCompleto
          : // fallback si alguien mete objeto en DB por error
            (info.clienteNombreCompleto &&
              (info.clienteNombreCompleto.nombreCompleto ||
                [
                  info.clienteNombreCompleto.nombre,
                  info.clienteNombreCompleto.apellidos,
                ]
                  .filter(Boolean)
                  .join(" "))) ||
            "-";

      const mesStr = info.mes || "-";

      const movimientos = Array.isArray(info.movimientos)
        ? info.movimientos
        : [];

      const tot = info.totales || {};
      const facturado = tot.facturado ?? 0;
      const pagado = tot.pagado ?? 0;
      const beneficioBruto = tot.beneficioBruto ?? 0;
      const beneficioCompras = tot.beneficioCompras ?? 0;

      const saldoActual = info.saldo_actual ?? 0;

      // recojo todas las rutas de factura que existan y sean accesibles
      const facturaImages = [];
      for (const mov of movimientos) {
        if (
          mov.facturaPath &&
          typeof mov.facturaPath === "string" &&
          fs.existsSync(mov.facturaPath)
        ) {
          facturaImages.push(mov.facturaPath);
        }
      }

      // crear PDF
      const doc = new PDFDocument({ margin: 40 });
      const stream = fs.createWriteStream(absPath);
      doc.pipe(stream);

      // cabecera
      doc
        .fontSize(16)
        .text("Extracto mensual", { underline: true })
        .moveDown(0.5);

      doc.fontSize(12).text(`Cliente: ${clienteNombre}`);
      doc.fontSize(12).text(`Mes: ${mesStr}`).moveDown(1);

      // detalle de movimientos
      doc.fontSize(13).text("Detalle de movimientos:", { underline: true });
      doc.moveDown(0.5);

      if (movimientos.length > 0) {
        movimientos.forEach((mov) => {
          const fechaLimpia = formateaFecha(mov.fecha);
          const tipo = mov.tipo || "—";
          const concepto = mov.concepto || "—";
          const importe = mov.importe ?? 0;

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

      // resumen del mes
      doc.fontSize(13).text("Resumen del mes:", { underline: true });
      doc.moveDown(0.5);

      doc
        .fontSize(11)
        .text(`Facturado este mes: ${formateaEuros(facturado)}`);
      doc
        .fontSize(11)
        .text(`Pagos recibidos:    ${formateaEuros(pagado)}`);
      doc
        .fontSize(11)
        .text(`Beneficio bruto:    ${formateaEuros(beneficioBruto)}`);
      doc
        .fontSize(11)
        .text(`Beneficio compras:  ${formateaEuros(beneficioCompras)}`);

      doc.moveDown(1);

      // saldo pendiente
      doc
        .fontSize(13)
        .text("Saldo pendiente a día de hoy:", { underline: true });
      doc.moveDown(0.5);

      doc
        .fontSize(11)
        .text(
          `${formateaEuros(
            saldoActual
          )}  (negativo = te queda por pagarte / positivo = tiene saldo a favor)`
        );

      doc.moveDown(1.5);

      // fotos de factura
      if (facturaImages.length > 0) {
        doc.fontSize(13).text("Fotos de factura:", { underline: true });
        doc.moveDown(0.5);

        facturaImages.forEach((imgPath, idx) => {
          try {
            doc.image(imgPath, {
              fit: [200, 200],
              align: "left",
            });
            doc.moveDown(0.5);
            doc
              .fontSize(10)
              .text(`Factura ${idx + 1}`, { lineBreak: true })
              .moveDown(1);
          } catch (errImg) {
            doc
              .fontSize(10)
              .fillColor("red")
              .text(`⚠ No se pudo incrustar la imagen ${idx + 1}`)
              .fillColor("black")
              .moveDown(1);
          }
        });
      }

      // cerrar PDF
      doc.end();

      stream.on("finish", () => resolve());
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

function formateaFecha(f) {
  if (!f || typeof f !== "string") return f || "¿fecha?";
  const tIndex = f.indexOf("T");
  if (tIndex !== -1) {
    return f.slice(0, tIndex); // yyyy-mm-dd
  }
  return f;
}

function formateaEuros(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "0,00€";
  return Number(n).toFixed(2).replace(".", ",") + "€";
}
