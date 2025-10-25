function normalizaTexto(str) {
  return str.trim().replace(/\s+/g, " ").toLowerCase();
}

// toma las 2 primeras palabras como "nombre apellido"
function takeWords(str, n) {
  const parts = str.split(" ");
  const head = parts.slice(0, n).join(" ");
  const tail = parts.slice(n).join(" ");
  return [head, tail];
}

function toNumber(str) {
  if (!str) return NaN;
  return parseFloat(str.replace(",", "."));
}

export function parseIncomingText(msgRaw) {
  const msg = normalizaTexto(msgRaw);

  // primer token = comando
  const firstSpace = msg.indexOf(" ");
  let cmd, restAfterCmd;
  if (firstSpace === -1) {
    cmd = msg;
    restAfterCmd = "";
  } else {
    cmd = msg.slice(0, firstSpace);
    restAfterCmd = msg.slice(firstSpace + 1);
  }

  if (
    cmd === "hola" ||
    cmd === "ayuda" ||
    cmd === "help"
  ) {
    return { action: "HELP" };
  }

  if (!restAfterCmd) {
    return { action: "HELP" };
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
  let [clienteNombreCompleto, resto] = takeWords(rest, 2);

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
  let [clienteNombreCompleto, resto] = takeWords(rest, 2);

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
  let [clienteNombreCompleto, resto] = takeWords(rest, 2);

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

  const lastNum = toNumber(last);
  const secondLastNum = toNumber(secondLast);

  let totalCobrado;
  let costeProductos;
  let concepto;

  if (!Number.isNaN(lastNum) && !Number.isNaN(secondLastNum) && parts.length >= 3) {
    // caso con dos importes (ej: 58.65 9.15)
    totalCobrado = secondLastNum;
    costeProductos = lastNum;
    concepto = parts.slice(0, parts.length - 2).join(" ");
  } else if (!Number.isNaN(lastNum)) {
    // caso con un solo importe (ej: 49.50)
    totalCobrado = lastNum;
    costeProductos = 0;
    concepto = parts.slice(0, parts.length - 1).join(" ");
  } else {
    return {
      action: "ERROR",
      error:
        "Importes no válidos en mari. Ej: mari maria ortega limpieza sept 58.65 9.15",
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
  let [clienteNombreCompleto, resto] = takeWords(rest, 2);

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
  let [clienteNombreCompleto, resto] = takeWords(rest, 2);

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
