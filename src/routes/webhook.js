// src/routes/webhook.js
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
import { getAyudaUso } from "../utils/ayuda.js";
import { sendWhatsApp } from "../utils/helpers.js";
import { guardarFacturaImagen } from "../utils/facturas.js";

// memoria temporal para confirmaciones pendientes
const pendingActions = {}; // { [fromNumber]: { action: 'COMPRA', data: {...} } }

// --------------------------------------------------
// WEBHOOK PRINCIPAL (Meta llama aquí)
// --------------------------------------------------
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
      await handleMensaje(fromNumber, text, null);
    } else if (msgType === "image") {
      // foto con caption
      const caption = messageObj.image?.caption || "";
      const mediaId = messageObj.image?.id;

      // guardamos foto físicamente y pillamos la ruta (stub si hace falta)
      const facturaPath = await guardarFacturaImagen(mediaId);

      await handleMensaje(fromNumber, caption, facturaPath);
    } else {
      await sendWhatsApp(
        fromNumber,
        "Mensaje no reconocido.\nEscribe 'ayuda' para ver ejemplos."
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en /webhook:", err);
    res.sendStatus(500);
  }
});

// --------------------------------------------------
// LÓGICA AL RECIBIR MENSAJE (texto directo o caption)
// --------------------------------------------------
async function handleMensaje(fromNumber, text, facturaPath) {
  const parsed = parseIncomingText(text);

  // 1) Confirmaciones: "sí" / "no"
  if (parsed.action === "CONFIRMAR") {
    return await confirmarAccionPendiente(fromNumber);
  }

  if (parsed.action === "CANCELAR") {
    delete pendingActions[fromNumber];
    await sendWhatsApp(fromNumber, "❌ Cancelado. No he guardado nada.");
    return;
  }

  // 2) Ayuda directa
  if (parsed.action === "AYUDA") {
    await sendWhatsApp(fromNumber, getAyudaUso());
    return;
  }

  // 3) Hola / saludo
  if (parsed.action === "SALUDO") {
    await sendWhatsApp(
      fromNumber,
      "Hola 👋 Soy tu bot de cuentas.\nEscribe 'ayuda' para ver cómo hablarme."
    );
    return;
  }

  // 4) Errores de formato
  if (parsed.action === "ERROR") {
    await sendWhatsApp(
      fromNumber,
      `❌ ${parsed.error}\n\nEscribe 'ayuda' para ver ejemplos.`
    );
    return;
  }

  // 5) Comando desconocido
  if (parsed.action === "UNKNOWN") {
    await sendWhatsApp(
      fromNumber,
      "No te he entendido 🤔\nEscribe 'ayuda' para ver ejemplos."
    );
    return;
  }

  // 6) Comandos que generan acción pendiente (COMPRA, TRABAJOS, MARI, PAGO_CLIENTE)
  if (
    parsed.action === "COMPRA" ||
    parsed.action === "TRABAJOS" ||
    parsed.action === "MARI" ||
    parsed.action === "PAGO_CLIENTE"
  ) {
    pendingActions[fromNumber] = {
      action: parsed.action,
      data: { ...parsed.data, facturaPath: facturaPath || null },
    };

    const previewMsg = buildPreviewMessage(pendingActions[fromNumber]);
    await sendWhatsApp(fromNumber, previewMsg);
    return;
  }

  // 7) Extracto (esto sí se ejecuta directo)
  if (parsed.action === "EXTRACTO") {
    const { clienteNombreCompleto, mes } = parsed.data;

    const info = getExtractoMensual({
      nombreCliente: clienteNombreCompleto,
      mes,
    });

    const resumenTxt = formatExtractoWhatsApp(info);
    await sendWhatsApp(fromNumber, resumenTxt);

    // FUTURO: generar PDF y pasar link
    return;
  }

  // fallback paranoia
  await sendWhatsApp(
    fromNumber,
    "No te he entendido 🤔\nEscribe 'ayuda' para ver ejemplos."
  );
}

// --------------------------------------------------
// Construir el mensaje de confirmación previo
// --------------------------------------------------
function euros(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  // usamos coma
  return Number(n).toFixed(2).replace(".", ",") + " €";
}

function buildPreviewMessage(pending) {
  const { action, data } = pending;

  if (action === "COMPRA") {
    const beneficio = data.precioCliente - data.precioCoste;
    return [
      "📌 A apuntar (sin guardar aún):",
      "",
      `Cliente: ${data.clienteNombreCompleto}`,
      `Tipo: COMPRA`,
      `Concepto: ${data.concepto}`,
      `Le cobras: ${euros(data.precioCliente)}`,
      `Te costó: ${euros(data.precioCoste)}`,
      `Beneficio: ${euros(beneficio)}`,
      data.facturaPath ? "📸 Factura incluida" : "📸 Sin foto",
      "",
      "¿Lo guardo? (sí / no)",
    ].join("\n");
  }

  if (action === "TRABAJOS") {
    return [
      "📌 A apuntar (sin guardar aún):",
      "",
      `Cliente: ${data.clienteNombreCompleto}`,
      `Tipo: TRABAJOS`,
      `Trabajo: ${data.concepto}`,
      `Importe: ${euros(data.importe)}`,
      "",
      "¿Lo guardo? (sí / no)",
    ].join("\n");
  }

  if (action === "MARI") {
    const beneficio = data.totalCobrado - data.costeProductos;
    return [
      "📌 A apuntar (sin guardar aún):",
      "",
      `Cliente: ${data.clienteNombreCompleto}`,
      `Tipo: LIMPIEZA MARI`,
      `Concepto: ${data.concepto}`,
      `Total cobrado al cliente: ${euros(data.totalCobrado)}`,
      `Productos limpieza: ${euros(data.costeProductos)}`,
      `Beneficio: ${euros(beneficio)}`,
      data.facturaPath ? "📸 Factura incluida" : "📸 Sin foto",
      "",
      "¿Lo guardo? (sí / no)",
    ].join("\n");
  }

  if (action === "PAGO_CLIENTE") {
    return [
      "📌 A apuntar (sin guardar aún):",
      "",
      `Cliente: ${data.clienteNombreCompleto}`,
      `Tipo: PAGO DEL CLIENTE`,
      `Ha pagado: ${euros(data.cantidad)}`,
      "",
      "¿Lo guardo? (sí / no)",
    ].join("\n");
  }

  return "Voy a apuntar algo, ¿confirmas? (sí / no)";
}

// --------------------------------------------------
// Confirmar acción pendiente y guardar en DB
// --------------------------------------------------
async function confirmarAccionPendiente(fromNumber) {
  const pending = pendingActions[fromNumber];
  if (!pending) {
    await sendWhatsApp(
      fromNumber,
      "No tengo nada pendiente para guardar ahora mismo."
    );
    return;
  }

  const { action, data } = pending;
  let result;

  if (action === "COMPRA") {
    result = registrarCompra({
      nombreCliente: data.clienteNombreCompleto,
      concepto: data.concepto,
      precioCliente: data.precioCliente,
      precioCoste: data.precioCoste,
      facturaPath: data.facturaPath || null,
    });

    await sendWhatsApp(
      fromNumber,
      [
        "✅ Apuntado.",
        `Saldo actual del cliente: ${euros(result.saldo_actual_nuevo)}`,
      ].join("\n")
    );
  }

  else if (action === "TRABAJOS") {
    result = registrarTrabajos({
      nombreCliente: data.clienteNombreCompleto,
      concepto: data.concepto,
      importe: data.importe,
    });

    await sendWhatsApp(
      fromNumber,
      [
        "✅ Apuntado.",
        `Saldo actual del cliente: ${euros(result.saldo_actual_nuevo)}`,
      ].join("\n")
    );
  }

  else if (action === "MARI") {
    result = registrarMari({
      nombreCliente: data.clienteNombreCompleto,
      concepto: data.concepto,
      totalCobrado: data.totalCobrado,
      costeProductos: data.costeProductos,
      facturaPath: data.facturaPath || null,
    });

    await sendWhatsApp(
      fromNumber,
      [
        "✅ Apuntado.",
        `Saldo actual del cliente: ${euros(result.saldo_actual_nuevo)}`,
      ].join("\n")
    );
  }

  else if (action === "PAGO_CLIENTE") {
    result = registrarPagoCliente({
      nombreCliente: data.clienteNombreCompleto,
      cantidad: data.cantidad,
    });

    await sendWhatsApp(
      fromNumber,
      [
        "✅ Pago registrado.",
        `Saldo actual del cliente: ${euros(result.saldo_actual_nuevo)}`,
      ].join("\n")
    );
  }

  // ya no está pendiente
  delete pendingActions[fromNumber];
}
