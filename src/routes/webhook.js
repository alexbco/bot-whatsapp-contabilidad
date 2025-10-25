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

// Esta función la llamas cuando recibes texto de WhatsApp:
async function handleTextoDeUsuario(fromNumber, text) {
  const parsed = parseIncomingText(text);

  // si pide ayuda directamente o no ha puesto nada útil
  if (parsed.action === "HELP") {
    await sendWhatsApp(fromNumber, getChuletaUso());
    return;
  }

  // si no ha entendido el comando
  if (parsed.action === "UNKNOWN") {
    await sendWhatsApp(fromNumber, "No te he entendido.\n\n" + getChuletaUso());
    return;
  }

  // si hay error de formato
  if (parsed.action === "ERROR") {
    await sendWhatsApp(
      fromNumber,
      `❌ ${parsed.error}\n\n` + getChuletaUso()
    );
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
        mes, // "2025-09"
      });

      const resumenTxt = formatExtractoWhatsApp(info);

      await sendWhatsApp(fromNumber, resumenTxt);
      break;
    }
  }
}
