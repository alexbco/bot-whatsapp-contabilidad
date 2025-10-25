import express from "express";
export const router = express.Router();

import {
  registrarCompra,
  registrarTrabajos,
  registrarMari,
  registrarPagoCliente,
  getExtractoMensual,
} from "../db/repository.js";

import { parseIncomingText } from "../utils/parser.js";
import { formatExtractoWhatsApp } from "../utils/formatExtracto.js";
import { getChuletaUso } from "../utils/chuleta.js";
import { sendWhatsApp } from "../utils/helpers.js";

// Webhook de WhatsApp (POST /webhook)
router.post("/", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messageObj = value?.messages?.[0];

    if (!messageObj) {
      return res.sendStatus(200);
    }

    const fromNumber = messageObj.from;
    const msgType = messageObj.type;

    if (msgType === "text") {
      const text = messageObj.text.body;
      await handleTextoDeUsuario(fromNumber, text);
    } else if (msgType === "image") {
      // más adelante: guardar foto como factura y asociarla
      await sendWhatsApp(
        fromNumber,
        "📸 Factura recibida. (Guardado automático de facturas lo añadimos luego)"
      );
    } else {
      await sendWhatsApp(fromNumber, "Mensaje no soportado todavía 😅");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en /webhook:", err);
    res.sendStatus(500);
  }
});

async function handleTextoDeUsuario(fromNumber, text) {
  const parsed = parseIncomingText(text);

  // 1) ayuda directa
  if (parsed.action === "HELP") {
    await sendWhatsApp(fromNumber, getChuletaUso());
    return;
  }

  // 2) comando desconocido
  if (parsed.action === "UNKNOWN") {
    await sendWhatsApp(
      fromNumber,
      "No te he entendido.\n\n" + getChuletaUso()
    );
    return;
  }

  // 3) comando mal formado
  if (parsed.action === "ERROR") {
    await sendWhatsApp(
      fromNumber,
      `❌ ${parsed.error}\n\n` + getChuletaUso()
    );
    return;
  }

  // 4) casos buenos
  switch (parsed.action) {
    // ======================
    // COMPRA
    // ======================
    case "COMPRA": {
      const { clienteNombreCompleto, concepto, precioCliente, precioCoste } =
        parsed.data;

      const result = registrarCompra({
        nombreCliente: clienteNombreCompleto,
        concepto,
        precioCliente,
        precioCoste,
        facturaPath: null, // foto luego
      });

      await sendWhatsApp(
        fromNumber,
        [
          `🧾 Compra guardada`,
          `Cliente: ${clienteNombreCompleto}`,
          `Concepto: ${concepto}`,
          `Cobro cliente: ${precioCliente}€`,
          `Coste real:   ${precioCoste}€`,
          `Beneficio:    ${(precioCliente - precioCoste).toFixed(2)}€`,
          `Saldo actual: ${result.saldo_actual_nuevo.toFixed(2)}€`,
        ].join("\n")
      );
      break;
    }

    // ======================
    // TRABAJOS
    // ======================
    case "TRABAJOS": {
      const { clienteNombreCompleto, concepto, importe } = parsed.data;

      const result = registrarTrabajos({
        nombreCliente: clienteNombreCompleto,
        concepto,
        importe,
      });

      await sendWhatsApp(
        fromNumber,
        [
          `🔧 Trabajo apuntado`,
          `Cliente: ${clienteNombreCompleto}`,
          `Trabajo: ${concepto}`,
          `Importe: ${importe}€`,
          `Saldo actual: ${result.saldo_actual_nuevo.toFixed(2)}€`,
        ].join("\n")
      );
      break;
    }

    // ======================
    // MARI
    // ======================
    case "MARI": {
      const { clienteNombreCompleto, concepto, totalCobrado, costeProductos } =
        parsed.data;

      const result = registrarMari({
        nombreCliente: clienteNombreCompleto,
        concepto,
        totalCobrado,
        costeProductos,
        facturaPath: null, // más adelante guardamos aquí la imagen
      });

      await sendWhatsApp(
        fromNumber,
        [
          `🧹 Limpieza apuntada (Mari)`,
          `Cliente: ${clienteNombreCompleto}`,
          `Concepto: ${concepto}`,
          `Cobrado al cliente: ${totalCobrado}€`,
          `Productos limpieza: ${costeProductos}€`,
          `Beneficio Mari: ${(totalCobrado - costeProductos).toFixed(2)}€`,
          `Saldo actual: ${result.saldo_actual_nuevo.toFixed(2)}€`,
        ].join("\n")
      );
      break;
    }

    // ======================
    // PAGO DEL CLIENTE
    // ======================
    case "PAGO_CLIENTE": {
      const { clienteNombreCompleto, cantidad } = parsed.data;

      const result = registrarPagoCliente({
        nombreCliente: clienteNombreCompleto,
        cantidad,
      });

      await sendWhatsApp(
        fromNumber,
        [
          `💶 Pago registrado`,
          `Cliente: ${clienteNombreCompleto}`,
          `Ha pagado: ${cantidad}€`,
          `Saldo actual: ${result.saldo_actual_nuevo.toFixed(2)}€`,
        ].join("\n")
      );
      break;
    }

    // ======================
    // EXTRACTO
    // ======================
    case "EXTRACTO": {
      const { clienteNombreCompleto, mes } = parsed.data;

      const info = getExtractoMensual({
        nombreCliente: clienteNombreCompleto,
        mes,
      });

      const resumenTxt = formatExtractoWhatsApp(info);
      await sendWhatsApp(fromNumber, resumenTxt);
      break;
    }
  }
}
