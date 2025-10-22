// src/utils/helpers.js
import axios from "axios";
import dayjs from "dayjs";

export const NOMBRE_PAPA = "Antonio"; // personalización rápida

// WhatsApp
export async function sendWhatsApp(to, text) {
  const url = `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`;
  await axios.post(
    url,
    { messaging_product: "whatsapp", to, text: { body: text } },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
}

// Dinero
export const eurosToCents = (e) => Math.round(parseFloat(String(e).replace(",", ".")) * 100);
export const centsToEuros = (c) => (c / 100).toFixed(2);

// Fechas
export function monthRangeFromArgOrText(argOrText) {
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const t = (argOrText || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  let y = dayjs().format("YYYY");
  let m = dayjs().format("M");

  const mYear = t.match(/^\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/);
  if (mYear) { m = mYear[1]; y = mYear[2]; }
  else if (/este mes|mes actual|hoy/.test(t)) { /* default */ }
  else {
    const idx = meses.findIndex((name) => t.includes(name));
    if (idx >= 0) m = String(idx + 1);
  }

  const from = dayjs(`${y}-${m}-01`).startOf("month");
  const to = from.endOf("month");
  return { from, to, y, m: String(m).padStart(2, "0") };
}

// CSV
export const toCsvRow = (values) =>
  values.map((v) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");

// URL pública base (para links de export)
export function getPublicBaseUrl() {
  const envUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  return envUrl || `http://localhost:${process.env.PORT || 3000}`;
}

// Rate limit
const lastMessageAt = new Map(); // from -> ts
export function rateLimit(from, windowMs = 1200) {
  const now = Date.now();
  const last = lastMessageAt.get(from) || 0;
  lastMessageAt.set(from, now);
  return now - last < windowMs;
}

// NLU rápido
export const isGreeting = (text) => /^(hola|buenas|hey|holi|holis|qué tal|que tal)\b/i.test(text);

export function saludoParaAntonio() {
  return `¡Hola ${NOMBRE_PAPA}! 👋
Soy tu *bot de contabilidad*.
Ejemplos:
• "Juan me ha pagado 120"
• "total de octubre"
• "busca lucia"
• "exporta 10/2025"
Comandos: /help`;
}
