// src/routes/webhook.js
import express from "express";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";

import db from "../db/connection.js";
import { logError } from "../utils/loger.js";
import {
  sendWhatsApp,
  eurosToCents,
  centsToEuros,
  monthRangeFromArgOrText,
  toCsvRow,
  getPublicBaseUrl,
  rateLimit,
  isGreeting,
  saludoParaAntonio,
} from "../utils/helpers.js";

export const router = express.Router();

// --- GET /webhook -> verificación de Meta
router.get("/", (req, res) => {
  const { ["hub.mode"]: mode, ["hub.verify_token"]: token, ["hub.challenge"]: challenge } = req.query;
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// === Parsers para lenguaje natural ===
function parseAddPayment(text) {
  const amount = text.match(/(-?\d+[.,]?\d*)\s*(€|eur|euros)?/i)?.[1];
  const nameBeforePaid = text.match(/^([\p{L}\s'.-]{2,})\s+(me ha pagado|ha pagado|pag[oó])/iu)?.[1];
  const nameAfterTo = text.match(/(a|de)\s+([\p{L}\s'.-]{2,})\s+(-?\d+[.,]?\d*)/iu)?.[2];
  const nameLoose = text.match(/apunta\s+a\s+([\p{L}\s'.-]{2,})/iu)?.[1];
  const nombre = (nameBeforePaid || nameAfterTo || nameLoose)?.trim();
  if (!amount || !nombre) return null;
  return { nombre, cantidad: eurosToCents(amount) };
}
const parseSummary = (t) => (/(total|resumen|cuanto llevo|cuánto llevo|sumatorio)/i.test(t) ? monthRangeFromArgOrText(t) : null);
const parseFind    = (t) => { const m = t.match(/(busca|ver|muestrame|qué tengo de|que tengo de)\s+([\p{L}\s'.-]{2,})/iu); return m ? { query: m[2].trim() } : null; };
const parseTop     = (t) => (/(quien.*mas|ranking|top|mejores pagadores)/i.test(t) ? monthRangeFromArgOrText(t) : null);
const parseExport  = (t) => (/(exporta|excel|csv|descargar)/i.test(t) ? monthRangeFromArgOrText(t) : null);

// --- Comandos clásicos (power users) ---
const commands = {
  help: () => `📎 *Comandos*
/help
/add "Nombre" 250
/sum [mes/año]
/find Nombre
/top [mes/año]
/export [mes/año]
💡 También puedes hablar en natural: "Juan me ha pagado 120"`,

  add: (args) => {
    const joined = args.join(" ");
    const nameMatch = joined.match(/"([^"]+)"|([^\s]+)\s/);
    const amountMatch = joined.match(/(-?\d+[.,]?\d*)$/);
    if (!nameMatch || !amountMatch) return `Uso: /add "Nombre Apellido" 250`;

    const nombre = (nameMatch[1] || nameMatch[2]).replaceAll("_", " ").trim();
    const cantidad = eurosToCents(amountMatch[1]);
    const fechaISO = dayjs().toISOString();

    db.prepare(`INSERT INTO pagos (nombre, cantidad_cents, fecha_iso) VALUES (?, ?, ?)`)
      .run(nombre, cantidad, fechaISO);

    return `✅ Guardado: ${nombre} → ${centsToEuros(cantidad)}€ (${dayjs(fechaISO).format("DD/MM HH:mm")})`;
  },

  sum: (args) => {
    const { from, to } = monthRangeFromArgOrText(args[0] || "");
    const row = db.prepare(
      `SELECT COALESCE(SUM(cantidad_cents),0) AS total FROM pagos WHERE fecha_iso BETWEEN ? AND ?`
    ).get(from.toISOString(), to.toISOString());
    return `📊 Total ${from.format("MM/YYYY")} → *${centsToEuros(row.total)}€*`;
  },

  find: (args) => {
    const q = args.join(" ").trim();
    if (!q) return `Uso: /find Nombre`;
    const rows = db.prepare(
      `SELECT nombre, cantidad_cents, fecha_iso
       FROM pagos WHERE nombre LIKE ? ORDER BY fecha_iso DESC LIMIT 12`
    ).all(`%${q}%`);
    if (!rows.length) return `No hay pagos que coincidan con “${q}”.`;
    const lines = rows.map(r => `• ${r.nombre} — ${centsToEuros(r.cantidad_cents)}€ — ${dayjs(r.fecha_iso).format("DD/MM HH:mm")}`);
    return `🔎 Resultados:\n${lines.join("\n")}`;
  },

  top: (args) => {
    const { from, to } = monthRangeFromArgOrText(args[0] || "");
    const rows = db.prepare(
      `SELECT nombre, SUM(cantidad_cents) AS total_cents
       FROM pagos WHERE fecha_iso BETWEEN ? AND ?
       GROUP BY nombre ORDER BY total_cents DESC`
    ).all(from.toISOString(), to.toISOString());
    if (!rows.length) return `No hay pagos en ${from.format("MM/YYYY")}.`;
    const lines = rows.map((r, i) => `${i + 1}. ${r.nombre} — ${centsToEuros(r.total_cents)}€`);
    return `🏆 Top ${from.format("MM/YYYY")}:\n${lines.join("\n")}`;
  },

  export: (args, app) => {
    const { from, to, y, m } = monthRangeFromArgOrText(args[0] || "");
    const rows = db.prepare(
      `SELECT nombre, cantidad_cents, fecha_iso
       FROM pagos WHERE fecha_iso BETWEEN ? AND ?
       ORDER BY fecha_iso ASC`
    ).all(from.toISOString(), to.toISOString());
    if (!rows.length) return `No hay pagos en ${from.format("MM/YYYY")} para exportar.`;

    const header = toCsvRow(["fecha","nombre","cantidad_eur"]);
    const body = rows.map(r => toCsvRow([dayjs(r.fecha_iso).format("YYYY-MM-DD HH:mm"), r.nombre, centsToEuros(r.cantidad_cents)])).join("\n");
    const csv = `${header}\n${body}\n`;

    const filename = `pagos_${y}-${m}.csv`;
    const EXPORT_DIR = app.get("EXPORT_DIR");
    const filepath = path.join(EXPORT_DIR, filename);
    fs.writeFileSync(filepath, csv, "utf8");

    const url = `${getPublicBaseUrl()}/exports/${filename}`;
    return `📤 Exportado ${from.format("MM/YYYY")} → ${rows.length} registros\n🔗 ${url}`;
  },
};

// --- POST /webhook ---
router.post("/", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    const statuses = value?.statuses?.[0];
    if (statuses) return res.sendStatus(200); // ignorar callbacks de estado
    if (!message) return res.sendStatus(200);

    const from = message.from;
    if (rateLimit(from)) return res.sendStatus(200);

    // Normalizar texto
    let text = "";
    if (message.type === "text") text = message.text?.body?.trim() || "";
    else if (message.type === "interactive")
      text = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
    else if (message.type === "image") text = message.caption || "[Imagen]";

    if (!text) {
      await sendWhatsApp(from, `No te he entendido 🤔. Prueba: "Juan me ha pagado 50" o "total de octubre".`);
      return res.sendStatus(200);
    }

    // Saludo
    if (isGreeting(text)) {
      await sendWhatsApp(from, saludoParaAntonio());
      return res.sendStatus(200);
    }

    // Lenguaje natural
    const add = parseAddPayment(text);
    if (add) {
      db.prepare(`INSERT INTO pagos (nombre, cantidad_cents, fecha_iso, remitente) VALUES (?, ?, ?, ?)`)
        .run(add.nombre, add.cantidad, dayjs().toISOString(), from);
      await sendWhatsApp(from, `💾 Anotado: *${add.nombre}* → *${centsToEuros(add.cantidad)}€* ✅`);
      return res.sendStatus(200);
    }

    const sum = parseSummary(text);
    if (sum) {
      const row = db.prepare(
        `SELECT COALESCE(SUM(cantidad_cents),0) AS total FROM pagos WHERE fecha_iso BETWEEN ? AND ?`
      ).get(sum.from.toISOString(), sum.to.toISOString());
      await sendWhatsApp(from, `📊 Total ${sum.from.format("MM/YYYY")} → *${centsToEuros(row.total)}€*`);
      return res.sendStatus(200);
    }

    const find = parseFind(text);
    if (find) {
      const rows = db.prepare(
        `SELECT nombre, cantidad_cents, fecha_iso
         FROM pagos WHERE nombre LIKE ? ORDER BY fecha_iso DESC LIMIT 12`
      ).all(`%${find.query}%`);
      if (!rows.length) await sendWhatsApp(from, `No encontré pagos de “${find.query}”.`);
      else {
        const lines = rows.map(r => `• ${r.nombre} — ${centsToEuros(r.cantidad_cents)}€ — ${dayjs(r.fecha_iso).format("DD/MM HH:mm")}`).join("\n");
        await sendWhatsApp(from, `🔎 Resultados:\n${lines}`);
      }
      return res.sendStatus(200);
    }

    const top = parseTop(text);
    if (top) {
      const rows = db.prepare(
        `SELECT nombre, SUM(cantidad_cents) AS total_cents
         FROM pagos WHERE fecha_iso BETWEEN ? AND ? GROUP BY nombre ORDER BY total_cents DESC`
      ).all(top.from.toISOString(), top.to.toISOString());
      if (!rows.length) await sendWhatsApp(from, `No hay pagos en ${top.from.format("MM/YYYY")}.`);
      else {
        const lines = rows.map((r,i)=> `${i+1}. ${r.nombre} — ${centsToEuros(r.total_cents)}€`).join("\n");
        await sendWhatsApp(from, `🏆 Top ${top.from.format("MM/YYYY")}:\n${lines}`);
      }
      return res.sendStatus(200);
    }

    const exp = parseExport(text);
    if (exp) {
      const msg = commands.export([`${exp.m}/${exp.y}`], req.app);
      await sendWhatsApp(from, msg);
      return res.sendStatus(200);
    }

    // Comandos clásicos
    if (text.startsWith("/")) {
      const [cmd, ...args] = text.slice(1).trim().split(/\s+/);
      if (commands[cmd]) {
        const out = commands[cmd](args, req.app);
        await sendWhatsApp(from, out);
      } else {
        await sendWhatsApp(from, "❓ Comando no reconocido. Escribe /help.");
      }
      return res.sendStatus(200);
    }

    // Fallback
    await sendWhatsApp(from, `No te he entendido bien 🤔\nPrueba:\n• "Juan me ha pagado 120"\n• "total de este mes"\n• "busca lucia"\n• /help`);
    res.sendStatus(200);
  } catch (err) {
    logError("Webhook error", err);
    res.sendStatus(200);
  }
});
