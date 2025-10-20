import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import Database from "better-sqlite3";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const PORT = process.env.PORT || 3000;
const NOMBRE_PAPA = "Antonio"; // 👈 Personalización

// --- App base ---
const app = express();
app.use(cors());
app.use(express.json());

// --- Validación .env básica ---
["WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "VERIFY_TOKEN"].forEach((v) => {
  if (!process.env[v]) console.warn(`⚠️ Falta ${v} en .env`);
});

// --- Paths / exports estáticos ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.join(__dirname, "exports");
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
app.use("/exports", express.static(EXPORT_DIR));

// --- DB (SQLite) ---
const db = new Database("./data.db");
db.exec(`
CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  cantidad_cents INTEGER NOT NULL,
  fecha_iso TEXT NOT NULL,
  remitente TEXT
);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_iso);
CREATE INDEX IF NOT EXISTS idx_pagos_nombre ON pagos(nombre);
`);

// --- Helpers WhatsApp ---
async function sendWhatsApp(to, text) {
  const url = `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`;
  console.log("📤 Enviando a", to, ":", text);
  await axios.post(
    url,
    { messaging_product: "whatsapp", to, text: { body: text } },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// --- Helpers dinero/fechas/urls ---
function eurosToCents(e) {
  return Math.round(parseFloat(String(e).replace(",", ".")) * 100);
}
function centsToEuros(c) {
  return (c / 100).toFixed(2);
}
function monthRangeFromArgOrText(argOrText) {
  // acepta "10/2025", "octubre", "oct", "este mes", "mes actual", etc.
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const t = (argOrText || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"");

  let y = dayjs().format("YYYY");
  let m = dayjs().format("M");

  const mYear = t.match(/^\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/);
  if (mYear) { m = mYear[1]; y = mYear[2]; }
  else if (/este mes|mes actual|hoy/.test(t)) { /* ya están m y y por defecto */ }
  else {
    const idx = meses.findIndex(name => t.includes(name));
    if (idx >= 0) m = String(idx + 1);
  }

  const from = dayjs(`${y}-${m}-01`).startOf("month");
  const to = from.endOf("month");
  return { from, to, y, m: String(m).padStart(2, "0") };
}
function toCsvRow(values) {
  return values.map(v => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}
function getPublicBaseUrl() {
  const envUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  return envUrl || `http://localhost:${PORT}`;
}

// --- Rate limit anti-spam ---
const lastMessageAt = new Map(); // from -> timestamp
function rateLimit(from, windowMs = 1200) {
  const now = Date.now();
  const last = lastMessageAt.get(from) || 0;
  lastMessageAt.set(from, now);
  return now - last < windowMs;
}

// === NLU (intents sin comandos) ===
function isGreeting(text) {
  return /^(hola|buenas|hey|holi|holis|qué tal|que tal)\b/i.test(text);
}
function parseAddPayment(text) {
  // Ejemplos que entiende:
  // "Juan me ha pagado 120", "apunta a Juan 120", "he cobrado de lucia 35,50",
  // "Lucía pagó 50 euros", "Poner a Pepe 20"
  const t = text.toLowerCase();
  const amount = text.match(/(-?\d+[.,]?\d*)\s*(€|eur|euros)?/i)?.[1];
  // intenta capturar un nombre razonable (palabras con letras/espacios antes del verbo clave)
  const nameBeforePaid = text.match(/^([\p{L}\s'.-]{2,})\s+(me ha pagado|ha pagado|pag[oó])/iu)?.[1];
  const nameAfterTo = text.match(/(a|de)\s+([\p{L}\s'.-]{2,})\s+(-?\d+[.,]?\d*)/iu)?.[2];
  const nameLoose = text.match(/apunta\s+a\s+([\p{L}\s'.-]{2,})/iu)?.[1];

  const nombre = (nameBeforePaid || nameAfterTo || nameLoose)?.trim();
  if (!amount || !nombre) return null;
  return { nombre, cantidad: eurosToCents(amount) };
}
function parseSummary(text) {
  // "total", "resumen", "cuánto llevo", "total octubre", "resumen 10/2025"
  if (!/(total|resumen|cuanto llevo|cuánto llevo|sumatorio)/i.test(text)) return null;
  return monthRangeFromArgOrText(text);
}
function parseFind(text) {
  // "busca juan", "ver lucia", "que tengo de juan"
  const m = text.match(/(busca|ver|muestrame|qué tengo de|que tengo de)\s+([\p{L}\s'.-]{2,})/iu);
  if (!m) return null;
  return { query: m[2].trim() };
}
function parseTop(text) {
  // "quien me ha pagado mas", "ranking", "top del mes", "mejores pagadores octubre"
  if (!/(quien.*mas|ranking|top|mejores pagadores)/i.test(text)) return null;
  return monthRangeFromArgOrText(text);
}
function parseExport(text) {
  // "exporta", "sacame excel", "genera csv", "exporta octubre", "exporta 10/2025"
  if (!/(exporta|excel|csv|descargar)/i.test(text)) return null;
  return monthRangeFromArgOrText(text);
}

// --- Comandos clásicos (para /help) ---
const commands = {
  help: () =>
`📎 *Comandos disponibles* (opcional):
/help → este menú
/add "Nombre" 250 → guardar pago
/sum [mes/año] → total del mes (p.ej. /sum 10/2025)
/find Nombre → ver pagos de alguien
/top [mes/año] → ranking del mes
/export [mes/año] → generar CSV del mes

💡 Consejo: también puedes hablar *en natural*:
• "Juan me ha pagado 120"
• "total de octubre"
• "busca lucia"
• "exporta 10/2025"
`,

  // mantenemos echo y add/sum/find/top/export para power users
  echo: (args) => args.join(" ") || "Nada que repetir 😅",

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
      `SELECT COALESCE(SUM(cantidad_cents),0) as total
       FROM pagos WHERE fecha_iso BETWEEN ? AND ?`
    ).get(from.toISOString(), to.toISOString());
    return `📊 Total ${from.format("MM/YYYY")} → *${centsToEuros(row.total)}€*`;
  },

  find: (args) => {
    const q = args.join(" ").trim();
    if (!q) return `Uso: /find Nombre`;

    const rows = db.prepare(
      `SELECT nombre, cantidad_cents, fecha_iso
       FROM pagos
       WHERE nombre LIKE ?
       ORDER BY fecha_iso DESC
       LIMIT 12`
    ).all(`%${q}%`);

    if (!rows.length) return `No hay pagos que coincidan con “${q}”.`;

    const lines = rows.map(r =>
      `• ${r.nombre} — ${centsToEuros(r.cantidad_cents)}€ — ${dayjs(r.fecha_iso).format("DD/MM HH:mm")}`
    );
    return `🔎 Resultados:\n${lines.join("\n")}`;
  },

  top: (args) => {
    const { from, to } = monthRangeFromArgOrText(args[0] || "");
    const rows = db.prepare(
      `SELECT nombre, SUM(cantidad_cents) as total_cents
       FROM pagos
       WHERE fecha_iso BETWEEN ? AND ?
       GROUP BY nombre
       ORDER BY total_cents DESC`
    ).all(from.toISOString(), to.toISOString());

    if (!rows.length) return `No hay pagos en ${from.format("MM/YYYY")}.`;

    const lines = rows.map((r, i) => `${i + 1}. ${r.nombre} — ${centsToEuros(r.total_cents)}€`);
    return `🏆 Top ${from.format("MM/YYYY")}:\n${lines.join("\n")}`;
  },

  export: (args) => {
    const { from, to, y, m } = monthRangeFromArgOrText(args[0] || "");
    const rows = db.prepare(
      `SELECT nombre, cantidad_cents, fecha_iso
       FROM pagos
       WHERE fecha_iso BETWEEN ? AND ?
       ORDER BY fecha_iso ASC`
    ).all(from.toISOString(), to.toISOString());

    if (!rows.length) return `No hay pagos en ${from.format("MM/YYYY")} para exportar.`;

    const header = toCsvRow(["fecha", "nombre", "cantidad_eur"]);
    const body = rows.map(r =>
      toCsvRow([dayjs(r.fecha_iso).format("YYYY-MM-DD HH:mm"), r.nombre, centsToEuros(r.cantidad_cents)])
    ).join("\n");
    const csv = `${header}\n${body}\n`;

    const filename = `pagos_${y}-${m}.csv`;
    const filepath = path.join(EXPORT_DIR, filename);
    fs.writeFileSync(filepath, csv, "utf8");

    const url = `${getPublicBaseUrl()}/exports/${filename}`;
    return `📤 Exportado ${from.format("MM/YYYY")} → ${rows.length} registros\n🔗 ${url}`;
  },
};

// --- Mensaje de bienvenida para Antonio ---
function saludoParaAntonio() {
  return `¡Hola ${NOMBRE_PAPA}! 👋
Soy tu *bot de contabilidad* personalizado.
Puedo apuntar cobros y decirte el total del mes sin que uses comandos.

Ejemplos que me puedes decir:
• "Juan me ha pagado 120"
• "total de octubre"
• "busca lucia"
• "exporta 10/2025"

Si alguna vez quieres la lista de comandos, escribe */help*.`;
}

// --- Rutas básicas ---
app.get("/", (_req, res) => {
  res.send("🚀 Bot de WhatsApp activo y funcionando!");
});

// GET /webhook -> verificación de Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST /webhook -> mensajes entrantes (NLU natural + comandos + fallback)
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];
    const statuses = value?.statuses?.[0];

    // Ignorar callbacks de estado
    if (statuses) return res.sendStatus(200);
    if (!message) return res.sendStatus(200);

    const from = message.from;

    // Rate limit silencioso
    if (rateLimit(from)) return res.sendStatus(200);

    // Normalizamos texto
    let text = "";
    if (message.type === "text") {
      text = message.text?.body?.trim() || "";
    } else if (message.type === "interactive") {
      text = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
    } else if (message.type === "image") {
      text = message.caption || "[Imagen]";
    }

    if (!text) {
      await sendWhatsApp(from, `No te he entendido bien 🤔. Prueba con algo como:
"Juan me ha pagado 50" o "total de octubre".`);
      return res.sendStatus(200);
    }

    // 0) Saludo humano
    if (isGreeting(text)) {
      await sendWhatsApp(from, saludoParaAntonio());
      return res.sendStatus(200);
    }

    // 1) Intentos naturales (sin comandos)
    const add = parseAddPayment(text);
    if (add) {
      db.prepare(
        `INSERT INTO pagos (nombre, cantidad_cents, fecha_iso, remitente) VALUES (?, ?, ?, ?)`
      ).run(add.nombre, add.cantidad, dayjs().toISOString(), from);

      await sendWhatsApp(from,
        `💾 Anotado: *${add.nombre}* → *${centsToEuros(add.cantidad)}€* ✅
Puedes pedirme: "total de este mes" o "ranking del mes".`);
      return res.sendStatus(200);
    }

    const sum = parseSummary(text);
    if (sum) {
      const row = db.prepare(
        `SELECT COALESCE(SUM(cantidad_cents),0) as total
         FROM pagos WHERE fecha_iso BETWEEN ? AND ?`
      ).get(sum.from.toISOString(), sum.to.toISOString());

      await sendWhatsApp(from, `📊 Total ${sum.from.format("MM/YYYY")} → *${centsToEuros(row.total)}€*`);
      return res.sendStatus(200);
    }

    const find = parseFind(text);
    if (find) {
      const rows = db.prepare(
        `SELECT nombre, cantidad_cents, fecha_iso
         FROM pagos
         WHERE nombre LIKE ?
         ORDER BY fecha_iso DESC LIMIT 12`
      ).all(`%${find.query}%`);

      if (!rows.length) {
        await sendWhatsApp(from, `No encontré pagos de “${find.query}”.`);
      } else {
        const lines = rows.map(r =>
          `• ${r.nombre.padEnd(12," ")} — ${centsToEuros(r.cantidad_cents)}€ — ${dayjs(r.fecha_iso).format("DD/MM HH:mm")}`
        ).join("\n");
        await sendWhatsApp(from, `🔎 Resultados:\n${lines}`);
      }
      return res.sendStatus(200);
    }

    const top = parseTop(text);
    if (top) {
      const rows = db.prepare(
        `SELECT nombre, SUM(cantidad_cents) as total_cents
         FROM pagos WHERE fecha_iso BETWEEN ? AND ?
         GROUP BY nombre ORDER BY total_cents DESC`
      ).all(top.from.toISOString(), top.to.toISOString());

      if (!rows.length) {
        await sendWhatsApp(from, `No hay pagos en ${top.from.format("MM/YYYY")}.`);
      } else {
        const lines = rows.map((r,i)=> `${i+1}. ${r.nombre} — ${centsToEuros(r.total_cents)}€`).join("\n");
        await sendWhatsApp(from, `🏆 Top ${top.from.format("MM/YYYY")}:\n${lines}`);
      }
      return res.sendStatus(200);
    }

    const exp = parseExport(text);
    if (exp) {
      const rows = db.prepare(
        `SELECT nombre, cantidad_cents, fecha_iso
         FROM pagos WHERE fecha_iso BETWEEN ? AND ?
         ORDER BY fecha_iso ASC`
      ).all(exp.from.toISOString(), exp.to.toISOString());

      if (!rows.length) {
        await sendWhatsApp(from, `No hay pagos en ${exp.from.format("MM/YYYY")} para exportar.`);
      } else {
        const header = toCsvRow(["fecha","nombre","cantidad_eur"]);
        const body = rows.map(r =>
          toCsvRow([dayjs(r.fecha_iso).format("YYYY-MM-DD HH:mm"), r.nombre, centsToEuros(r.cantidad_cents)])
        ).join("\n");
        const csv = `${header}\n${body}\n`;
        const filename = `pagos_${exp.y}-${exp.m}.csv`;
        fs.writeFileSync(path.join(EXPORT_DIR, filename), csv, "utf8");
        await sendWhatsApp(from, `📤 Exportado ${exp.from.format("MM/YYYY")} → ${rows.length} registros
🔗 ${getPublicBaseUrl()}/exports/${filename}`);
      }
      return res.sendStatus(200);
    }

    // 2) Comandos clásicos
    if (text.startsWith("/")) {
      const [cmd, ...args] = text.slice(1).trim().split(/\s+/);
      if (commands[cmd]) {
        const out = await commands[cmd](args);
        await sendWhatsApp(from, out);
      } else {
        await sendWhatsApp(from, "❓ Comando no reconocido. Escribe /help para ver opciones.");
      }
      return res.sendStatus(200);
    }

    // 3) Fallback amable
    await sendWhatsApp(from,
`No te he entendido bien, ${NOMBRE_PAPA} 🤔
Prueba con:
• "Juan me ha pagado 120"
• "total de este mes"
• "busca lucia"
Si quieres ver todos los comandos: /help`);
    res.sendStatus(200);
  } catch (e) {
    console.error("Webhook error:", e.response?.data || e.message);
    res.sendStatus(200); // evitar reintentos en bucle
  }
});

// Endpoint manual para enviar mensajes (para Postman)
app.post("/send", async (req, res) => {
  try {
    const { to, text } = req.body;
    await sendWhatsApp(to, text);
    res.status(200).send("✅ Mensaje enviado correctamente");
  } catch (error) {
    console.error("Error enviando mensaje:", error.response?.data || error.message);
    res.status(500).send("❌ Error al enviar mensaje");
  }
});

// Lanzar server
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
});
