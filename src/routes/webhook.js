import express from "express";
export const router = express.Router(); // 👈 esto es clave

import {
  registrarGastoReventa,
  registrarServicioExtra,
  registrarLimpieza,
  registrarPagoCliente,
  getExtractoMensual,
} from "../db/repository.js";

import { parseIncomingText } from "../utils/parser.js";
import { formatExtractoWhatsApp } from "../utils/formatExtracto.js";
import { getChuletaUso } from "../utils/chuleta.js";
import { sendWhatsApp } from "../utils/helpers.js";

// =======================
// POST /webhook (cuando Meta manda un mensaje nuevo)
// =======================
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
    } else {
      await sendWhatsApp(fromNumber, "📸 Recibí tu imagen. (Soporte de facturas próximamente)");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en /webhook:", err);
    res.sendStatus(500);
  }
});

// =======================
// Función que procesa texto recibido
// =======================
async function handleTextoDeUsuario(fromNumber, text) {
  const parsed = parseIncomingText(text);

  if (parsed.action === "HELP") {
    await sendWhatsApp(fromNumber, getChuletaUso());
    return;
  }

  if (parsed.action === "UNKNOWN") {
    await sendWhatsApp(fromNumber, "No te he entendido.\n\n" + getChuletaUso());
    return;
  }

  if (parsed.action === "ERROR") {
    await sendWhatsApp(fromNumber, `❌ ${parsed.error}\n\n` + getChuletaUso());
    return;
  }

  switch (parsed.action) {
    case "GASTO_REVENTA": {
      const { clienteNombreOAlias, concepto, precioCliente, precioCoste } =
        parsed.data;

      const result = registrarGastoReventa({
        nombreCliente: clienteNombreOAlias,
        aliasCliente: clienteNombreOAlias,
        concepto,
        precioCliente,
        precioCoste,
      });

      await sendWhatsApp(
        fromNumber,
        [
          `🧾 Gasto guardado`,
          `Cliente: ${clienteNombreOAlias}`,
          `Concepto: ${concepto}`,
          `Cobro cliente: ${precioCliente}€`,
          `Coste real:   ${precioCoste}€`,
          `Saldo actual: ${result.saldo_actual_nuevo.toFixed(2)}€`,
        ].join("\n")
      );
      break;
    }

    case "SERVICIO_EXTRA": {
      const { clienteNombreOAlias, concepto, importe } = parsed.data;

      const result = registrarServicioExtra({
        nombreCliente: clienteNombreOAlias,
        aliasCliente: clienteNombreOAlias,
        concepto,
        importe,
      });

      await sendWhatsApp(
        fromNumber,
        [
          `🔧 Servicio apuntado`,
          `Cliente: ${clienteNombreOAlias}`,
          `Trabajo: ${concepto}`,
          `Importe: ${importe}€`,
          `Saldo actual: ${result.saldo_actual_nuevo.toFixed(2)}€`,
        ].join("\n")
      );
      break;
    }

    case "LIMPIEZA": {
      const { clienteNombreOAlias, concepto, totalCobrado } = parsed.data;

      const result = registrarLimpieza({
        nombreCliente: clienteNombreOAlias,
        aliasCliente: clienteNombreOAlias,
        concepto,
        totalCobrado,
      });

      await sendWhatsApp(
        fromNumber,
        [
          `🧹 Limpieza apuntada`,
          `Cliente: ${clienteNombreOAlias}`,
          `Concepto: ${concepto}`,
          `Total: ${totalCobrado}€`,
          `Saldo actual: ${result.saldo_actual_nuevo.toFixed(2)}€`,
        ].join("\n")
      );
      break;
    }

    case "PAGO_CLIENTE": {
      const { clienteNombreOAlias, cantidad } = parsed.data;

      const result = registrarPagoCliente({
        nombreCliente: clienteNombreOAlias,
        aliasCliente: clienteNombreOAlias,
        cantidad,
      });

      await sendWhatsApp(
        fromNumber,
        [
          `💶 Pago registrado`,
          `Cliente: ${clienteNombreOAlias}`,
          `Ha pagado: ${cantidad}€`,
          `Saldo actual: ${result.saldo_actual_nuevo.toFixed(2)}€`,
        ].join("\n")
      );
      break;
    }

    case "EXTRACTO": {
      const { clienteNombreOAlias, mes } = parsed.data;

      const info = getExtractoMensual({
        nombreClienteOAlias: clienteNombreOAlias,
        mes,
      });

      const resumenTxt = formatExtractoWhatsApp(info);

      await sendWhatsApp(fromNumber, resumenTxt);
      break;
    }
  }
}
