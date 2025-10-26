import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

/**
 * generaExtractoPDF(info, outputAbsPath)
 *
 * info = {
 *   cliente: { nombre, saldoActual },
 *   mes: "2025-10",
 *   resumen: {
 *     totalFacturadoEseMes,
 *     totalPagosEseMes,
 *   },
 *   movimientos: [
 *     {
 *       fecha,              // "2025-10-03"
 *       tipo,               // "COMPRA" | "TRABAJOS" | "MARI" | "SUELDO_MENSUAL" | "PAGO_CLIENTE"
 *       concepto,
 *       precioCliente,      // lo que se le cobra (para COMPRA/TRABAJOS/MARI/SUELDO_MENSUAL)
 *       monto,              // lo que paga el cliente (para PAGO_CLIENTE)
 *       facturaPath         // ruta local a la imagen de factura (puede ser null)
 *     },
 *     ...
 *   ]
 * }
 *
 * outputAbsPath = ruta física tipo /app/exports/juan_carlos_2025-10.pdf
 */
export function generaExtractoPDF(info, outputAbsPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ autoFirstPage: false });

      const stream = fs.createWriteStream(outputAbsPath);
      doc.pipe(stream);

      // ============= PÁGINA 1: RESUMEN =================
      doc.addPage({ margin: 40 });

      doc.fontSize(18).text("Extracto mensual", { align: "center" });
      doc.moveDown(0.5);

      doc.fontSize(12).text(`Cliente: ${info.cliente.nombre}`);
      doc.text(`Mes: ${info.mes}`);
      doc.moveDown(1);

      // resumen económico
      const eur = (n) =>
        (Number(n || 0).toFixed(2) + " €").replace(".", ",");

      doc.text(`Total servicios/materiales del mes: ${eur(info.resumen.totalFacturadoEseMes)}`);
      doc.text(`Pagos realizados este mes:         ${eur(info.resumen.totalPagosEseMes)}`);
      doc.text(`Saldo pendiente a día de hoy:      ${eur(info.cliente.saldoActual)}`);
      doc.moveDown(1.5);

      // TABLA DE MOVIMIENTOS
      doc.fontSize(14).text("Movimientos del mes:");
      doc.moveDown(0.5);

      doc.fontSize(10);
      // cabecera
      doc.text("Fecha", 40, doc.y, { continued: true, width: 80 });
      doc.text("Tipo", 110, doc.y, { continued: true, width: 90 });
      doc.text("Concepto", 200, doc.y, { continued: true, width: 220 });
      doc.text("Importe", 420, doc.y);
      doc.moveDown(0.5);

      info.movimientos.forEach((m) => {
        const fechaCorta = (m.fecha || "").slice(0, 10);

        let importeVisible;
        if (m.tipo === "PAGO_CLIENTE") {
          // Pagos los mostramos como negativo (ya te pagó esto)
          importeVisible =
            "-" + Number(m.monto || 0).toFixed(2).replace(".", ",") + " €";
        } else if (m.tipo === "SUELDO_MENSUAL") {
          // Sueldo mensual también es un cargo, así que va positivo hacia el cliente
          importeVisible =
            Number(m.precioCliente || m.monto || 0)
              .toFixed(2)
              .replace(".", ",") + " €";
        } else {
          // Compra / Trabajos / Mari
          importeVisible =
            Number(m.precioCliente || 0).toFixed(2).replace(".", ",") + " €";
        }

        doc.text(fechaCorta, 40, doc.y, { continued: true, width: 80 });
        doc.text(tipoBonito(m.tipo), 110, doc.y, { continued: true, width: 90 });
        doc.text(m.concepto || "-", 200, doc.y, { continued: true, width: 220 });
        doc.text(importeVisible, 420, doc.y);
        doc.moveDown(0.5);
      });

      // ============= PÁGINAS SIGUIENTES: FACTURAS =================
      const conFactura = info.movimientos.filter(
        (m) => m.facturaPath
      );

      conFactura.forEach((m) => {
        doc.addPage({ margin: 40 });
        const fechaCorta = (m.fecha || "").slice(0, 10);

        doc.fontSize(14).text("Factura / justificante");
        doc.moveDown(0.5);

        doc.fontSize(10).text(
          `${fechaCorta} · ${tipoBonito(m.tipo)} · ${m.concepto || ""}`
        );

        // intentar meter la imagen si existe físicamente:
        try {
          // ojo: facturaPath en DB puede ser "/facturas/x.jpg"
          // construimos path absoluto desde el root del proyecto
          const absPath = path.join(
            process.cwd(),
            m.facturaPath.replace(/^\//, "")
          );

          if (fs.existsSync(absPath)) {
            doc.moveDown(1);
            doc.image(absPath, {
              fit: [500, 700],
              align: "center",
              valign: "center",
            });
          } else {
            doc.moveDown(1);
            doc
              .fontSize(10)
              .fillColor("red")
              .text("⚠ No se encontró la imagen en el servidor.");
            doc.fillColor("black");
          }
        } catch (err) {
          doc.moveDown(1);
          doc
            .fontSize(10)
            .fillColor("red")
            .text("⚠ Error cargando imagen.");
          doc.fillColor("black");
        }
      });

      // cerrar doc
      doc.end();

      stream.on("finish", () => {
        resolve({
          ok: true,
          path: outputAbsPath,
        });
      });

      stream.on("error", (e) => {
        reject(e);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function tipoBonito(tipo) {
  switch (tipo) {
    case "COMPRA":
      return "Compra";
    case "TRABAJOS":
      return "Trabajo";
    case "MARI":
      return "Limpieza";
    case "SUELDO_MENSUAL":
      return "Mantenimiento";
    case "PAGO_CLIENTE":
      return "Pago";
    default:
      return tipo;
  }
}
