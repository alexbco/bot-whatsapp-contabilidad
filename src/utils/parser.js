// src/utils/parser.js

function norm(str) {
  return str.trim().replace(/\s+/g, " ").toLowerCase();
}

// separa las 2 primeras palabras como "nombre apellido"
function splitNombre(rest) {
  const parts = rest.split(" ");
  const nombreCompleto = [parts[0], parts[1]].join(" ");
  const resto = parts.slice(2).join(" ");
  return [nombreCompleto, resto];
}

// convierte "187,50" o "187.50" → Number(187.50)
function toNumber(numStr) {
  if (!numStr) return NaN;
  const normalized = numStr.replace(",", ".");
  return parseFloat(normalized);
}

export function parseIncomingText(rawMessage) {
  const msg = norm(rawMessage);

  // 1. confirmaciones
  if (["si", "sí", "vale", "ok", "confirmo", "correcto"].includes(msg)) {
    return { action: "CONFIRMAR" };
  }
  if (["no", "nanai", "cancela", "cancelar"].includes(msg)) {
    return { action: "CANCELAR" };
  }

  // 2. ayuda / hola
  if (
    msg === "ayuda" ||
    msg === "help" ||
    msg === "ayudame" ||
    msg === "ayúdame"
  ) {
    return { action: "AYUDA" };
  }

  if (
    msg === "hola" ||
    msg === "buenas" ||
    msg === "que tal" ||
    msg === "qué tal"
  ) {
    return { action: "SALUDO" };
  }

  // 3. parse comando principal
  const firstSpace = msg.indexOf(" ");
  let cmd, restAfterCmd;
  if (firstSpace === -1) {
    cmd = msg;
    restAfterCmd = "";
  } else {
    cmd = msg.slice(0, firstSpace);
    restAfterCmd = msg.slice(firstSpace + 1);
  }

  switch (cmd) {
    case "compra":
      return parseCompra(restAfterCmd);

    case "trabajos":
      return parseTrabajos(restAfterCmd);

    case "mari":
      return parseMari(restAfterCmd);

    case "paga":
    case "pago":
      return parsePago(restAfterCmd);

    case "extracto":
      return parseExtracto(restAfterCmd);

    default:
      return { action: "UNKNOWN" };
  }
}

// compra <nombre> <apellido> <concepto...> <precioCliente> <precioCoste>
function parseCompra(rest) {
  const [clienteNombreCompleto, resto] = splitNombre(rest);
  const parts = resto.split(" ");

  if (parts.length < 3) {
    return {
      action: "ERROR",
      error:
        "Formato compra: compra <nombre> <apellido> <concepto> <precioCliente> <precioCoste>",
    };
  }

  const precioClienteStr = parts[parts.length - 2];
  const precioCosteStr = parts[parts.length - 1];

  const precioCliente = toNumber(precioClienteStr);
  const precioCoste = toNumber(precioCosteStr);

  if (Number.isNaN(precioCliente) || Number.isNaN(precioCoste)) {
    return { action: "ERROR", error: "Importes no válidos en compra." };
  }

  const concepto = parts.slice(0, parts.length - 2).join(" ");

  return {
    action: "COMPRA",
    data: {
      clienteNombreCompleto,
      concepto,
      precioCliente,
      precioCoste,
    },
  };
}

// trabajos <nombre> <apellido> <concepto...> <importe>
function parseTrabajos(rest) {
  const [clienteNombreCompleto, resto] = splitNombre(rest);
  const parts = resto.split(" ");

  if (parts.length < 2) {
    return {
      action: "ERROR",
      error:
        "Formato trabajos: trabajos <nombre> <apellido> <concepto> <importe>",
    };
  }

  const importeStr = parts[parts.length - 1];
  const importe = toNumber(importeStr);
  if (Number.isNaN(importe)) {
    return { action: "ERROR", error: "Importe no válido en trabajos." };
  }

  const concepto = parts.slice(0, parts.length - 1).join(" ");

  return {
    action: "TRABAJOS",
    data: {
      clienteNombreCompleto,
      concepto,
      importe,
    },
  };
}

// mari <nombre> <apellido> <concepto...> <totalCobrado> [costeProductos]
function parseMari(rest) {
  const [clienteNombreCompleto, resto] = splitNombre(rest);
  const parts = resto.split(" ");

  if (parts.length < 2) {
    return {
      action: "ERROR",
      error:
        "Formato mari: mari <nombre> <apellido> <concepto> <totalCobrado> [costeProductos]",
    };
  }

  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];

  const lastNum = toNumber(last); // puede ser totalCobrado O costeProductos
  const secondLastNum = toNumber(secondLast);

  let totalCobrado;
  let costeProductos;
  let concepto;

  // Caso con dos importes: "58,65 9,15"
  if (
    !Number.isNaN(lastNum) &&
    !Number.isNaN(secondLastNum) &&
    parts.length >= 3
  ) {
    totalCobrado = secondLastNum;
    costeProductos = lastNum;
    concepto = parts.slice(0, parts.length - 2).join(" ");
  } else if (!Number.isNaN(lastNum)) {
    // Caso con un solo importe: "49,50"
    totalCobrado = lastNum;
    costeProductos = 0;
    concepto = parts.slice(0, parts.length - 1).join(" ");
  } else {
    return {
      action: "ERROR",
      error:
        "Importes no válidos en mari. Ej: mari antonio vargas limpieza septiembre 58,65 9,15",
    };
  }

  return {
    action: "MARI",
    data: {
      clienteNombreCompleto,
      concepto,
      totalCobrado,
      costeProductos,
    },
  };
}

// paga <nombre> <apellido> <cantidad>
function parsePago(rest) {
  const [clienteNombreCompleto, resto] = splitNombre(rest);

  const cantidad = toNumber(resto);
  if (!clienteNombreCompleto || Number.isNaN(cantidad)) {
    return {
      action: "ERROR",
      error: "Formato paga: paga <nombre> <apellido> <cantidad>",
    };
  }

  return {
    action: "PAGO_CLIENTE",
    data: {
      clienteNombreCompleto,
      cantidad,
    },
  };
}

// extracto <nombre> <apellido> <yyyy-mm>
function parseExtracto(rest) {
  const [clienteNombreCompleto, resto] = splitNombre(rest);

  const mes = resto.trim(); // "2025-10"
  if (!clienteNombreCompleto || !mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return {
      action: "ERROR",
      error:
        "Formato extracto: extracto <nombre> <apellido> <2025-10>",
    };
  }

  return {
    action: "EXTRACTO",
    data: {
      clienteNombreCompleto,
      mes,
    },
  };
}
