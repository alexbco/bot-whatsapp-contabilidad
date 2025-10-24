// src/routes/webhook.js
import express from "express";
import fs from "fs";
import path from "path";

import {
  sendWhatsApp,
  toCsvRow,
  getPublicBaseUrl,
  rateLimit,
  isGreeting,
  saludoParaAntonio,
  formatMoney,
  normalizarMesYY,
} from "../utils/helpers.js";

import {
  insertarMovimiento,
  listarUltimosMovimientos,
  buscarPorConcepto,
  totalPorMes,
  movimientosPorMes,
} from "../db/repository.js";

import { logError } from "../utils/loger.js";

export const router = express.Router();

/* =========================================================
   GET /webhook  (verificación inicial de Meta)
========================================================= */
router.get("/", (req, res) => {
  const {
    ["hub.mode"]: mode,
    ["hub.verify_token"]: token,
    ["hub.challenge"]: challenge,
  } = req.query;

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* =========================================================
   Helpers internos
========================================================= */

// Convierte un movimiento en texto legible y bonito
function formatMovimientoRow(r) {
  return (
    `${r.fecha} | ${r.destino} | ${r.concepto}\n` +
    `  → ${formatMoney(r.v_compra)} - ${formatMoney(r.v_descuento)} = ${formatMoney(r.diferencia)} (${r.estado})`
  );
}

// -------------------------
// 1) Parseo de ALTA de movimiento en lenguaje “/addmov …” (modo técnico)
// -------------------------
// /addmov FECHA DESTINO CONCEPTO V_COMPRA [V_DESC] [ESTADO]
// /addmov 24-10-25 coche gasolina_repsol 60 5 pagado
function parseAddMovArgs(args) {
  if (args.length < 4) {
    return {
      error:
        `Para apuntar un gasto escribe: /addmov FECHA DESTINO CONCEPTO PRECIO [DESCUENTO] [pagado/pendiente]\n` +
        `Ejemplo:\n/addmov 24-10-25 coche gasolina_repsol 60 5 pagado`,
    };
  }

  const tokens = [...args];

  const fecha = tokens.shift(); // "24-10-25"
  const destino = tokens.shift(); // "coche"

  // Miramos el último token: si no es número, lo tratamos como estado
  let estado = "pendiente";
  const last = tokens[tokens.length - 1];
  if (isNaN(parseFloat(last))) {
    estado = last;
    tokens.pop();
  }

  // Saco importes desde el final hacia atrás
  const numericTail = [];
  while (tokens.length && !isNaN(parseFloat(tokens[tokens.length - 1]))) {
    numericTail.unshift(tokens.pop());
  }

  if (numericTail.length === 0) {
    return { error: "Falta el importe. Ejemplo al final: 60 5 pagado" };
  }

  let v_compra = numericTail[0];
  let v_descuento = 0;
  if (numericTail.length >= 2) {
    v_compra = numericTail[0];
    v_descuento = numericTail[1];
  }

  const concepto = tokens.join(" ").replaceAll("_", " ").trim();
  if (!concepto) {
    return { error: "Falta el concepto. Ejemplo: gasolina_repsol" };
  }

  return {
    fecha,
    destino,
    concepto,
    v_compra,
    v_descuento,
    estado,
  };
}

// -------------------------
// 2) Parseo NATURAL de frases tipo:
// "he gastado 60 euros en gasolina del coche, con un descuento de 5, pagado el 24-10-25"
// "gasto 40 en cena familia bar, pendiente, 23-10-25"
// -------------------------
//
// Esta función intenta sacar:
// fecha, destino, concepto, v_compra, v_descuento, estado
//
// Reglas aproximadas:
// - precio: "60", "60 euros", "60€"
// - descuento opcional: "descuento de 5", "con un descuento de 5"
// - estado opcional: "pagado" o "pendiente"
// - fecha opcional: "el 24-10-25" o "24-10-25"
// - destino: primera palabra 'coche', 'casa', 'bar', etc si está después de "en"/"del"/"de la"
// - concepto: resto de la descripción
//
// Nota: esto no es IA mágica, es un parser aproximado basado en regex y heurística.
// Para tu padre ya vale: si habla más o menos igual cada vez, entra.
//
function parseNaturalMovement(text) {
  const original = text.toLowerCase().trim();

  // Precio principal
  const precioMatch = original.match(/(\d+[.,]?\d*)\s*(euros|€)?/);
  const v_compra = precioMatch ? precioMatch[1].replace(",", ".") : null;

  // Descuento
  const descMatch = original.match(/descuento\s+(de\s+)?(\d+[.,]?\d*)/);
  const v_descuento = descMatch
    ? descMatch[2].replace(",", ".")
    : 0;

  // Estado: pagado / pendiente
  let estado = "pendiente";
  if (/\bpagado\b/.test(original)) estado = "pagado";
  if (/\bpendiente\b/.test(original)) estado = "pendiente";

  // Fecha tipo 24-10-25 o 24/10/25
  const fechaMatch = original.match(
    /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/
  );
  const fecha = fechaMatch
    ? fechaMatch[1].replace(/\//g, "-")
    : null;

  // Intentar pillar destino y concepto.
  // Heurística:
  // "he gastado 60 euros en gasolina del coche" ->
  // destino: "coche"
  // concepto: "gasolina"
  //
  // buscamos "... en X ... del|de la|de|del Y"
  // si hay "coche", "casa", "bar", "taller"... lo ponemos como destino
  // y lo anterior como concepto.
  //
  // Si no conseguimos separar, metemos todo como concepto y destino = "general".
  let destino = "general";
  let concepto = "";

  // 1) patron "en <concepto> (del|de la|de|del) <destino>"
  const destRegex = /en\s+([a-z0-9\s._-]+?)\s+(del|de la|de|al)\s+([a-z0-9\s._-]+)/;
  const m1 = original.match(destRegex);
  if (m1) {
    concepto = m1[1].trim().replaceAll("_", " ");
    destino = m1[3].trim().replaceAll("_", " ");
  } else {
    // 2) patron "en <destino> <concepto...>"
    // ej: "he gastado 40 en coche gasolina repsol"
    const m2 = original.match(/en\s+([a-z0-9._-]+)\s+([a-z0-9\s._-]+)/);
    if (m2) {
      destino = m2[1].trim().replaceAll("_", " ");
      concepto = m2[2].trim().replaceAll("_", " ");
    }
  }

  // fallback: si aún no hay concepto pero sí hay precio, intenta pillar lo que viene después de "en"
  if (!concepto && /en\s+([a-z0-9\s._-]+)/.test(original)) {
    const afterEn = original.match(/en\s+([a-z0-9\s._-]+)/);
    if (afterEn) {
      concepto = afterEn[1].trim().replaceAll("_", " ");
    }
  }

  // último fallback: si seguimos sin concepto, mete una descripción mínima
  if (!concepto) concepto = "movimiento";

  // fecha: si no la dijo, le metemos hoy en formato DD-MM-YY
  // lo dejo en blanco aquí; si hace falta podemos meter dayjs y autogenerar hoy.
  // Para no liarla con imports, si no hay fecha devolvemos null y luego lo tratamos.
  return {
    fecha,
    destino,
    concepto,
    v_compra,
    v_descuento,
    estado,
  };
}

// -------------------------
// 3) Generar CSV y link público
// -------------------------
async function generarCSVyLink(mesYY, app) {
  const rows = await movimientosPorMes(mesYY);
  if (!rows.length) {
    return `No hay movimientos en ${mesYY} para exportar.`;
  }

  const header = toCsvRow([
    "fecha",
    "destino",
    "concepto",
    "v_compra",
    "v_descuento",
    "diferencia",
    "estado",
  ]);

  const body = rows
    .map((r) =>
      toCsvRow([
        r.fecha,
        r.destino,
        r.concepto,
        r.v_compra,
        r.v_descuento,
        r.diferencia,
        r.estado,
      ])
    )
    .join("\n");

  const csv = `${header}\n${body}\n`;

  const filename = `movimientos_${mesYY}.csv`;
  const EXPORT_DIR = app.get("EXPORT_DIR");
  const filepath = path.join(EXPORT_DIR, filename);

  fs.writeFileSync(filepath, csv, "utf8");

  const url = `${getPublicBaseUrl()}/exports/${filename}`;
  return `📤 He preparado el archivo del mes ${mesYY}.\nPulsa este enlace para descargarlo:\n${url}`;
}

/* =========================================================
   Comandos “avanzados”
========================================================= */
const commands = {
  help: async () => {
    return (
      `Te puedo ayudar con:\n\n` +
      `• Apuntar un gasto\n` +
      `• Ver los últimos apuntes\n` +
      `• Buscar algo concreto (por ejemplo gasolina)\n` +
      `• Ver cuánto llevas gastado en un mes\n` +
      `• Sacarte el Excel de un mes para guardarlo\n\n` +
      `Ejemplos:\n` +
      `- "he gastado 60 euros en gasolina del coche con un descuento de 5 pagado el 24-10-25"\n` +
      `- "enséñame los últimos movimientos"\n` +
      `- "búscame lo de la gasolina"\n` +
      `- "cuánto llevo gastado en 10-25"\n` +
      `- "descárgame 10-25"`
    );
  },

  // alta manual tipo /addmov ...
  addmov: async (args) => {
    const parsed = parseAddMovArgs(args);
    if (parsed.error) return parsed.error;

    // si no puso fecha, o lo que sea raro -> lo dejamos tal cual,
    // porque en este modo se supone que él ya la está dando bien
    const mov = await insertarMovimiento(parsed);
    return `✅ Apuntado:\n${formatMovimientoRow(mov)}`;
  },

  // ver últimos N movimientos
  ultimos: async (args) => {
    const limit = parseInt(args[0]) || 10;
    const rows = await listarUltimosMovimientos(limit);
    if (!rows.length) {
      return "No hay movimientos todavía.";
    }
    const lines = rows.map((r) => `• ${formatMovimientoRow(r)}`);
    return `Estos son los últimos ${limit} movimientos:\n\n${lines.join("\n\n")}`;
  },

  // buscar por palabra
  find: async (args) => {
    const q = args.join(" ").trim();
    if (!q) return `Dime qué quieres buscar. Por ejemplo: gasolina, coche, pintura...`;
    const rows = await buscarPorConcepto(q);
    if (!rows.length) {
      return `No he encontrado nada relacionado con "${q}".`;
    }
    const lines = rows.slice(0, 12).map((r) => `• ${formatMovimientoRow(r)}`);
    return `Esto es lo que tengo de "${q}":\n\n${lines.join("\n\n")}`;
  },

  // total del mes tipo "10-25"
  total: async (args) => {
    const mesYY = normalizarMesYY(args[0]);
    if (!mesYY) {
      return `Dime el mes y el año corto, por ejemplo "10-25" para octubre de 2025.`;
    }
    const total = await totalPorMes(mesYY);
    return `📊 Total ${mesYY} → ${formatMoney(total)}`;
  },

  // exportar excel del mes
  export: async (args, app) => {
    const mesYY = normalizarMesYY(args[0]);
    if (!mesYY) {
      return `Dime qué mes quieres descargar. Ejemplo: "descárgame 10-25".`;
    }
    const msg = await generarCSVyLink(mesYY, app);
    return msg;
  },
};

/* =========================================================
   INTENTOS DE ENTENDER FRASES NORMALES (lenguaje natural)
========================================================= */

// 1. ¿Está preguntando por "últimos movimientos"?
function matchesUltimos(t) {
  return /ultimos|últimos|lo.*ultimo|lo.*último|movimientos recientes|enséñame los últimos/i.test(
    t
  );
}

// 2. ¿Está preguntando por buscar algo? ("búscame lo de la gasolina")
function extractFindQuery(t) {
  // busca "gasolina", "coche", etc.
  const m = t.match(/busca(?:me)?\s+(.*)/i) || t.match(/búscame\s+(.*)/i);
  if (m && m[1]) {
    return m[1].trim();
  }
  return null;
}

// 3. ¿Está preguntando por el total del mes?
// acepta "cuánto llevo gastado en octubre", "cuánto llevo gastado en 10-25"
function extractMesForTotal(t) {
  // primero intentamos "10-25" / "10/25"
  const m1 = t.match(/(\d{1,2}[-/]\d{2})/);
  if (m1) return m1[1].replace("/", "-");

  // luego intentamos nombre de mes tipo "octubre"
  // ojo: esto es un mapa fijo, rápido
  const meses = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    setiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };

  const lower = t.toLowerCase();
  for (const [mesStr, mesNum] of Object.entries(meses)) {
    if (lower.includes(mesStr)) {
      // usamos el año actual en formato corto
      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2); // "2025" -> "25"
      return `${mesNum}-${yy}`;
    }
  }

  return null;
}

// 4. ¿Está pidiendo exportar/descargar el Excel?
function extractMesForExport(t) {
  // buscamos "descarga", "descárgame", "exporta"
  if (/descarg|descárg|exporta|sácame el excel/i.test(t)) {
    const m = t.match(/(\d{1,2}[-/]\d{2})/);
    if (m) return m[1].replace("/", "-");
  }
  return null;
}

/* =========================================================
   POST /webhook  (donde llega cada mensaje de WhatsApp)
========================================================= */
router.post("/", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    const statuses = value?.statuses?.[0];

    // ignoramos callbacks de estado tipo "mensaje entregado", etc.
    if (statuses) return res.sendStatus(200);
    if (!message) return res.sendStatus(200);

    const from = message.from;

    // anti-spam básico
    if (rateLimit(from)) return res.sendStatus(200);

    // normalizamos el texto que ha mandado
    let text = "";
    if (message.type === "text") {
      text = message.text?.body?.trim() || "";
    } else if (message.type === "interactive") {
      text =
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        "";
    } else if (message.type === "image") {
      text = message.caption || "[Imagen]";
    }

    // si no hay texto útil
    if (!text) {
      await sendWhatsApp(
        from,
        `No te he entendido 🤔.\nPuedes decirme cosas como:\n- "he gastado 60 euros en gasolina del coche"\n- "enséñame los últimos movimientos"\n- "cuánto llevo gastado en 10-25"`
      );
      return res.sendStatus(200);
    }

    // 0) saludo tipo "hola", "buenas", etc.
    if (isGreeting(text)) {
      await sendWhatsApp(from, saludoParaAntonio());
      return res.sendStatus(200);
    }

    // 1) ¿está intentando meter un gasto hablando normal?
    //    Ej: "he gastado 60 euros en gasolina del coche con un descuento de 5 pagado el 24-10-25"
    const posibleMov = parseNaturalMovement(text);
    if (
      posibleMov &&
      posibleMov.v_compra && // necesitamos al menos el precio para considerarlo "movimiento válido"
      posibleMov.concepto
    ) {
      // si no hay fecha en el mensaje, no le voy a inventar una.
      // se la pido. así evitamos grabar basura sin fecha.
      if (!posibleMov.fecha) {
        await sendWhatsApp(
          from,
          `He entendido el gasto (${posibleMov.concepto} en ${posibleMov.destino} por ${posibleMov.v_compra}€).\nDime la fecha en formato DD-MM-YY, por ejemplo 24-10-25.`
        );
        return res.sendStatus(200);
      }

      const mov = await insertarMovimiento({
        fecha: posibleMov.fecha,
        destino: posibleMov.destino,
        concepto: posibleMov.concepto,
        v_compra: posibleMov.v_compra,
        v_descuento: posibleMov.v_descuento || 0,
        estado: posibleMov.estado || "pendiente",
      });

      await sendWhatsApp(
        from,
        `✅ Apuntado:\n${formatMovimientoRow(mov)}`
      );
      return res.sendStatus(200);
    }

    // 2) ¿está pidiendo "últimos movimientos" en lenguaje normal?
    if (matchesUltimos(text)) {
      const rows = await listarUltimosMovimientos(10);
      if (!rows.length) {
        await sendWhatsApp(from, "No hay movimientos todavía.");
      } else {
        const lines = rows.map((r) => `• ${formatMovimientoRow(r)}`).join("\n\n");
        await sendWhatsApp(
          from,
          `Estos son los últimos movimientos:\n\n${lines}`
        );
      }
      return res.sendStatus(200);
    }

    // 3) ¿está diciendo "búscame lo de la gasolina"?
    const findQuery = extractFindQuery(text);
    if (findQuery) {
      const rows = await buscarPorConcepto(findQuery);
      if (!rows.length) {
        await sendWhatsApp(
          from,
          `No tengo nada guardado de "${findQuery}".`
        );
      } else {
        const lines = rows
          .slice(0, 12)
          .map((r) => `• ${formatMovimientoRow(r)}`)
          .join("\n\n");
        await sendWhatsApp(
          from,
          `Esto es lo que tengo de "${findQuery}":\n\n${lines}`
        );
      }
      return res.sendStatus(200);
    }

    // 4) ¿está preguntando "cuánto llevo gastado en octubre" o "cuánto llevo gastado en 10-25"?
    const mesParaTotal = extractMesForTotal(text);
    if (mesParaTotal) {
      const mesYY = normalizarMesYY(mesParaTotal);
      if (mesYY) {
        const total = await totalPorMes(mesYY);
        await sendWhatsApp(
          from,
          `📊 Total ${mesYY} → ${formatMoney(total)}`
        );
        return res.sendStatus(200);
      }
    }

    // 5) ¿está pidiendo "descárgame octubre" / "descárgame 10-25"?
    const mesParaExport = extractMesForExport(text);
    if (mesParaExport) {
      const mesYY = normalizarMesYY(mesParaExport);
      if (mesYY) {
        const msg = await generarCSVyLink(mesYY, req.app);
        await sendWhatsApp(from, msg);
        return res.sendStatus(200);
      }
    }

    // 6) ¿está usando comandos tipo /addmov ... /ultimos ... /find ... ?
    if (text.startsWith("/")) {
      const [cmd, ...args] = text.slice(1).trim().split(/\s+/);
      if (commands[cmd]) {
        const out = await commands[cmd](args, req.app);
        await sendWhatsApp(from, out);
      } else {
        await sendWhatsApp(
          from,
          "No conozco ese comando. Pídeme ayuda diciendo: ayuda"
        );
      }
      return res.sendStatus(200);
    }

    // 7) fallback final: no he entendido
    await sendWhatsApp(
      from,
      `No te he entendido 🤔.\nPuedes decirme:\n- "he gastado 60 euros en gasolina del coche"\n- "enséñame los últimos movimientos"\n- "cuánto llevo gastado en 10-25"\n- "descárgame 10-25"\n- "ayuda"`
    );

    res.sendStatus(200);
  } catch (err) {
    logError("Webhook error", err);
    res.sendStatus(200);
  }
});
