import fs from "fs";
import PDFDocument from "pdfkit";

/**
 * generaExtractoPDF(info, absPath)
 * info = resultado de getExtractoMensual(...)
 */
export async function generaExtractoPDF(info, absPath) {
  return new Promise((resolve, reject) => {
    try {
      // --- asegurar carpeta destino ---
      const dir = absPath.substring(0, absPath.lastIndexOf("/"));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // ==========================
      // 1. NORMALIZACIÓN DE DATOS
      // ==========================

      // nombre del cliente
      const clienteNombre =
        info.clienteNombreCompleto ||
        info.clienteNombre ||
        info.nombreCliente ||
        info.cliente ||
        "-";

      // mes
      const mesStr = info.mes || info.periodo || info.mesConsulta || "-";

      // movimientos (array)
      const movimientos = Array.isArray(info.movimientos)
        ? info.movimientos
        : Array.isArray(info.detalle)
        ? info.detalle
        : [];

      // totales
      // buscamos nombres alternativos por si tu repo los expone distinto
      const facturado =
        info.totales?.facturado ??
        info.facturado_mes ??
        info.totalFacturado ??
        0;

      const pagado =
        info.totales?.pagado ??
        info.totalPagado ??
        info.pagosRecibidos ??
        0;

      const beneficioBruto =
        info.totales?.beneficioBruto ??
        info.beneficioBruto ??
        0;

      const beneficioCompras =
        info.totales?.beneficioCompras ??
        info.beneficioCompras ??
        0;

      const saldoActual =
        info.saldo_actual ??
        info.saldoActual ??
        info.saldo_actual_nuevo ??
        info.saldoFinal ??
        0;

      // fotos de factura asociadas (si existen)
      // idea: cada movimiento podría venir con mov.facturaPath
      // lo normalizamos a una lista plana de rutas que existan
      const facturaImages = [];
      for (const mov of movimientos) {
        if (mov.facturaPath && fs.existsSync(mov.facturaPath)) {
          facturaImages.push(mov.facturaPath);
        }
      }

      const norm = {
        clienteNombre,
        mesStr,
        movimientos,
        facturado,
        pagado,
        beneficioBruto,
        beneficioCompras,
        saldoActual,
        facturaImages,
      };

      // ==========================
      // 2. CREAR DOCUMENTO
      // ==========================
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
        .text(`Cliente: ${norm.clienteNombre}`)
        .text(`Mes: ${norm.mesStr}`)
        .moveDown(1);

      // ===== DETALLE =====
      doc.fontSize(13).text("Detalle de movimientos:", { underline: true });
      doc.moveDown(0.5);

      if (norm.movimientos.length > 0) {
        norm.movimientos.forEach((mov) => {
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

      // ===== RESUMEN =====
      doc.fontSize(13).text("Resumen del mes:", { underline: true });
      doc.moveDown(0.5);

      doc
        .fontSize(11)
        .text(`Facturado este mes: ${formateaEuros(norm.facturado)}`);
      doc
        .fontSize(11)
        .text(`Pagos recibidos:    ${formateaEuros(norm.pagado)}`);
      doc
        .fontSize(11)
        .text(`Beneficio bruto:    ${formateaEuros(norm.beneficioBruto)}`);
      doc
        .fontSize(11)
        .text(`Beneficio compras:  ${formateaEuros(norm.beneficioCompras)}`);

      doc.moveDown(1);

      // ===== SALDO =====
      doc.fontSize(13).text("Saldo pendiente a día de hoy:", {
        underline: true,
      });
      doc.moveDown(0.5);

      doc
        .fontSize(11)
        .text(
          `${formateaEuros(
            norm.saldoActual
          )}  (negativo = te queda por pagarte / positivo = tiene saldo a favor)`
        );

      doc.moveDown(1.5);

      // ===== FACTURAS / FOTOS =====
      if (norm.facturaImages.length > 0) {
        doc.fontSize(13).text("Fotos de factura:", { underline: true });
        doc.moveDown(0.5);

        // renderizamos cada imagen en pequeño
        norm.facturaImages.forEach((imgPath, idx) => {
          try {
            // anchura fija 200px, altura auto
            doc.image(imgPath, {
              fit: [200, 200],
              align: "left",
            });
            doc.moveDown(0.5);
            doc
              .fontSize(10)
              .text(`Factura ${idx + 1}: ${imgPath}`, { lineBreak: true })
              .moveDown(1);
          } catch (imgErr) {
            // si una imagen da error (formato raro, etc), no rompemos el PDF
            doc
              .fontSize(10)
              .fillColor("red")
              .text(
                `⚠ No se pudo incrustar la imagen ${idx + 1} (${imgPath})`
              )
              .fillColor("black")
              .moveDown(1);
          }
        });
      }

      // cerrar el PDF
      doc.end();

      stream.on("finish", () => resolve());
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

// --- helpers ---

// 2025-10-26T20:23:15.390Z -> 2025-10-26
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
