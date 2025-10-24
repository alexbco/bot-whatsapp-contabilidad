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

// =======================
// GET /webhook (Meta check)
// =======================
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

// =======================
// Helpers internos
// =======================

// formatea una fila de la tabla movimientos en texto legible
function formatMovimientoRow(r) {
  return (
    `${r.fecha} | ${r.destino} | ${r.concepto}\n` +
    `  → compra ${formatMoney(r.v_compra)} - desc ${formatMoney(r.v_descuento)} = ${formatMoney(r.diferencia)} (${r.estado})`
  );
}

// parsea /addmov
// sintaxis esperada:
// /addmov FECHA DESTINO CONCEPTO... V_COMPRA [V_DESC] [ESTADO]
// ejemplo:
// /addmov 24-10-25 coche gasolina_repsol 60 5 pagado
//
// lógica:
// - FECHA = args[0]
// - DESTINO = args[1]
// - El final del array son números y opcionalmente un estado tipo "pagado"/"pendiente"
// - Lo que quede en medio es CONCEPTO (puede tener espacios)
function parseAddMovArgs(args) {
  if (args.length < 4) {
    return { error: `Uso: /addmov FECHA DESTINO CONCEPTO V_COMPRA [V_DESC] [ESTADO]
Ejemplo:
/addmov 24-10-25 coche gasolina_repsol 60 5 pagado` };
  }

  const tokens = [...args];

  const fecha = tokens.shift();   // "24-10-25"
  const destino = tokens.shift(); // "coche"

  // Miramos último token a ver si es estado (no número)
  let estado = "pendiente";
  const last = tokens[tokens.length - 1];
  if (isNaN(parseFloat(last))) {
    estado = last;
    tokens.pop();
  }

  // Ahora del final hacia atrás sacamos los importes
  const numericTail = [];
  while (tokens.length && !isNaN(parseFloat(tokens[tokens.length - 1]))) {
    numericTail.unshift(tokens.pop());
  }

  if (numericTail.length === 0) {
    return { error: "Falta el valor de compra. Ejemplo: ... 60 5 pagado" };
  }

  let v_compra = numericTail[0];
  let v_descuento = 0;
  if (numericTail.length >= 2) {
    v_compra = numericTail[0];
    v_descuento = numericTail[1];
  }

  const concepto = tokens.join(" ").replaceAll("_", " ").trim();
  if (!concepto) {
    return { error: "Falta el concepto (ej: gasolina_repsol)" };
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

// Genera CSV de un mes concreto y devuelve el link
async function generarCSVyLink(mesYY, app) {
  // sacamos todos los movimientos del mes
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

  // Guardamos en /exports/pagos_MM-YY.csv (o mejor movimientos_MM-YY.csv)
  const filename = `movimientos_${mesYY}.csv`;
  const EXPORT_DIR = app.get("EXPORT_DIR");
  const filepath = path.join(EXPORT_DIR, filename);

  fs.writeFileSync(filepath, csv, "utf8");

  const url = `${getPublicBaseUrl()}/exports/${filename}`;
  return `📤 Exportado ${mesYY} → ${rows.length} registros\n🔗 ${url}`;
}

// =======================
// Comandos tipo power user
// =======================
const commands = {
  help: async () => {
    return `📎 *Comandos disponibles*
/help
/addmov FECHA DESTINO CONCEPTO V_COMPRA [V_DESC] [ESTADO]
/ultimos [n]
/find TEXTO
/total MM-YY
/export MM-YY

Ejemplos:
/addmov 24-10-25 coche gasolina_repsol 60 5 pagado
/ultimos 5
/find gasolina
/total 10-25
/export 10-25

Notas:
- FECHA usa formato DD-MM-YY (24-10-25).
- MM-YY es mes-año: 10-25 = octubre 2025.
- diferencia = v_compra - v_descuento (se calcula sola).`;
  },

  addmov: async (args) => {
    const parsed = parseAddMovArgs(args);
    if (parsed.error) {
      return parsed.error;
    }

    const mov = await insertarMovimiento(parsed);
    return (
      `✅ Movimiento guardado:\n` +
      formatMovimientoRow(mov)
    );
  },

  ultimos: async (args) => {
    const limit = parseInt(args[0]) || 10;
    const rows = await listarUltimosMovimientos(limit);
    if (!rows.length) {
      return "No hay movimientos todavía.";
    }
    const lines = rows.map((r) => `• ${formatMovimientoRow(r)}`);
    return `🕘 Últimos ${limit} movimientos:\n${lines.join("\n\n")}`;
  },

  find: async (args) => {
    const q = args.join(" ").trim();
    if (!q) return `Uso: /find TEXTO`;
    const rows = await buscarPorConcepto(q);
    if (!rows.length) {
      return `No encontré movimientos que contengan “${q}”.`;
    }
    const lines = rows.slice(0, 12).map((r) => `• ${formatMovimientoRow(r)}`);
    return `🔎 Resultados para "${q}":\n${lines.join("\n\n")}`;
  },

  total: async (args) => {
    const mesYY = normalizarMesYY(args[0]);
    if (!mesYY) {
      return `Uso: /total MM-YY  (ej: /total 10-25 para octubre 2025)`;
    }
    const total = await totalPorMes(mesYY);
    return `📊 Total ${mesYY} → ${formatMoney(total)}`;
  },

  export: async (args, app) => {
    const mesYY = normalizarMesYY(args[0]);
    if (!mesYY) {
      return `Uso: /export MM-YY  (ej: /export 10-25)`;
    }
    const msg = await generarCSVyLink(mesYY, app);
    return msg;
  },
};

// =======================
// POST /webhook
// =======================
router.post("/", async (req, res) => {
  try {
    // Meta te manda mensajes dentro de esta estructura
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    const statuses = value?.statuses?.[0];

    // ignorar los "status callbacks"
    if (statuses) return res.sendStatus(200);
    if (!message) return res.sendStatus(200);

    const from = message.from;

    // antispam básico
    if (rateLimit(from)) return res.sendStatus(200);

    // normalizamos texto recibido según tipo de mensaje
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

    // si no hay texto reconocible
    if (!text) {
      await sendWhatsApp(
        from,
        `No te he entendido 🤔.\nPrueba con /help para ver ejemplos.`
      );
      return res.sendStatus(200);
    }

    // saludo tipo "hola", "buenas", etc.
    if (isGreeting(text)) {
      await sendWhatsApp(from, saludoParaAntonio());
      return res.sendStatus(200);
    }

    // si empieza por "/" -> comando avanzado
    if (text.startsWith("/")) {
      const [cmd, ...args] = text.slice(1).trim().split(/\s+/);
      if (commands[cmd]) {
        const out = await commands[cmd](args, req.app);
        await sendWhatsApp(from, out);
      } else {
        await sendWhatsApp(
          from,
          "❓ Comando no reconocido. Escribe /help."
        );
      }
      return res.sendStatus(200);
    }

    // cualquier otro mensaje que no sea comando -> le invitamos a usar /help
    await sendWhatsApp(
      from,
      `No te he entendido bien 🤔\nMira ejemplos con /help`
    );

    res.sendStatus(200);
  } catch (err) {
    logError("Webhook error", err);
    res.sendStatus(200);
  }
});
