// src/utils/parser.js

function normalizaTexto(str) {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Intenta separar "primerToken resto..."
function splitFirst(str) {
  const firstSpace = str.indexOf(" ");
  if (firstSpace === -1) return [str, ""];
  return [str.slice(0, firstSpace), str.slice(firstSpace + 1)];
}

/**
 * Parseo de comandos:
 *
 * gasto <cliente> <concepto ...> <precioCliente> <precioCoste>
 * ej: "gasto avu 2 sacos de abono 187.50 90.50"
 *
 * servicio <cliente> <concepto ...> <importe>
 * ej: "servicio lo cortar setos 80"
 *
 * limpieza <cliente> <concepto ...> <importe>
 * ej: "limpieza maria ortega limpieza septiembre 49.50"
 *
 * paga <cliente> <cantidad>
 * ej: "paga lo 250"
 *
 * extracto <cliente> <mes>
 * ej: "extracto lo 2025-09"
 */

export function parseIncomingText(msgRaw) {
  const msg = normalizaTexto(msgRaw);

  // 1) Sacamos el comando principal (gasto | servicio | limpieza | paga | extracto)
  const [cmd, restAfterCmd] = splitFirst(msg);

  if (!restAfterCmd) {
    return { action: "UNKNOWN", error: "Falta información después del comando." };
  }

  // según comando
  switch (cmd) {
    case "gasto":
      return parseGasto(restAfterCmd);

    case "servicio":
      return parseServicio(restAfterCmd);

    case "limpieza":
      return parseLimpieza(restAfterCmd);

    case "paga":
    case "pago": // por si dice "pago pepe 150"
      return parsePago(restAfterCmd);

    case "extracto":
      return parseExtracto(restAfterCmd);

    default:
      return { action: "UNKNOWN", error: "Comando no reconocido." };
  }
}

// ---------- Helpers de parseo específicos ----------

// gasto <cliente> <concepto ...> <precioCliente> <precioCoste>
function parseGasto(rest) {
  // ejemplo rest:
  // "avu 2 sacos de abono 187.50 90.50"
  //
  // estrategia:
  // 1. primer token = cliente/alias
  // 2. lo demás => ultimo 2 tokens son numeros => precioCliente y precioCoste
  //    lo anterior = concepto

  const [clienteToken, resto] = splitFirst(rest);
  if (!resto) {
    return { action: "ERROR", error: "Faltan datos del gasto." };
  }

  const parts = resto.split(" ");
  if (parts.length < 3) {
    return { action: "ERROR", error: "Formato gasto incorrecto." };
  }

  // Sacar los últimos 2 números
  const precioClienteStr = parts[parts.length - 2];
  const precioCosteStr = parts[parts.length - 1];

  const precioCliente = parseFloat(precioClienteStr.replace(",", "."));
  const precioCoste = parseFloat(precioCosteStr.replace(",", "."));

  if (Number.isNaN(precioCliente) || Number.isNaN(precioCoste)) {
    return { action: "ERROR", error: "Importes no válidos en gasto." };
  }

  // concepto = todo menos los dos últimos tokens numéricos
  const concepto = parts.slice(0, parts.length - 2).join(" ");

  return {
    action: "GASTO_REVENTA",
    data: {
      clienteNombreOAlias: clienteToken,
      concepto,
      precioCliente,
      precioCoste,
    },
  };
}

// servicio <cliente> <concepto ...> <importe>
function parseServicio(rest) {
  // "lo cortar setos 80"
  const [clienteToken, resto] = splitFirst(rest);
  if (!resto) return { action: "ERROR", error: "Faltan datos del servicio." };

  const parts = resto.split(" ");
  if (parts.length < 2) {
    return { action: "ERROR", error: "Formato servicio incorrecto." };
  }

  const importeStr = parts[parts.length - 1];
  const importe = parseFloat(importeStr.replace(",", "."));
  if (Number.isNaN(importe)) {
    return { action: "ERROR", error: "Importe no válido en servicio." };
  }

  const concepto = parts.slice(0, parts.length - 1).join(" ");

  return {
    action: "SERVICIO_EXTRA",
    data: {
      clienteNombreOAlias: clienteToken,
      concepto,
      importe,
    },
  };
}

// limpieza <cliente> <concepto ...> <importe>
function parseLimpieza(rest) {
  // "maria ortega limpieza septiembre 49.50"
  //
  // ojo: el nombre del cliente puede ser más de una palabra
  // estrategia:
  // 1. vamos a intentar detectar el último token como importe
  // 2. lo de antes lo partimos así:
  //    asumimos que el nombre del cliente son las primeras 1 o 2 palabras
  //    -> para la primera versión vamos a suponer que el nombre del cliente es UNA palabra.
  //    si luego quieres soportar nombre con espacios, lo ampliamos.

  // versión 1 (simple): igual que servicio
  const [clienteToken, resto] = splitFirst(rest);
  if (!resto) return { action: "ERROR", error: "Faltan datos de limpieza." };

  const parts = resto.split(" ");
  if (parts.length < 2) {
    return { action: "ERROR", error: "Formato limpieza incorrecto." };
  }

  const totalCobradoStr = parts[parts.length - 1];
  const totalCobrado = parseFloat(totalCobradoStr.replace(",", "."));
  if (Number.isNaN(totalCobrado)) {
    return { action: "ERROR", error: "Importe no válido en limpieza." };
  }

  const concepto = parts.slice(0, parts.length - 1).join(" ");

  return {
    action: "LIMPIEZA",
    data: {
      clienteNombreOAlias: clienteToken,
      concepto,
      totalCobrado,
    },
  };
}

// paga <cliente> <cantidad>
function parsePago(rest) {
  // "lo 250"
  const [clienteToken, cantidadStr] = splitFirst(rest);
  const cantidad = parseFloat(cantidadStr?.replace(",", "."));
  if (!clienteToken || Number.isNaN(cantidad)) {
    return { action: "ERROR", error: "Formato pago incorrecto." };
  }

  return {
    action: "PAGO_CLIENTE",
    data: {
      clienteNombreOAlias: clienteToken,
      cantidad,
    },
  };
}

// extracto <cliente> <mes>
function parseExtracto(rest) {
  // "lo 2025-09"
  const [clienteToken, mes] = splitFirst(rest);

  if (!clienteToken || !mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return {
      action: "ERROR",
      error: "Formato extracto incorrecto. Usa: extracto pepe 2025-09",
    };
  }

  return {
    action: "EXTRACTO",
    data: {
      clienteNombreOAlias: clienteToken,
      mes, // "2025-09"
    },
  };
}
