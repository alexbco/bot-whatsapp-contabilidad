// src/utils/helpers.js
import axios from "axios";

// ==========================
// 📲 Enviar mensaje WhatsApp
// ==========================
export async function sendWhatsApp(to, text) {
  const url = `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// ==========================
// 💾 Utils CSV / export
// ==========================
export const toCsvRow = (values) =>
  values
    .map((v) => {
      const s = String(v ?? "");
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");

// URL base pública (para montar link de descarga del CSV)
export function getPublicBaseUrl() {
  const envUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  return envUrl || `http://localhost:${process.env.PORT || 3000}`;
}

// ==========================
// ⏱ Rate limit básico
// ==========================
const lastMessageAt = new Map(); // from -> timestamp ms
export function rateLimit(from, windowMs = 1200) {
  const now = Date.now();
  const last = lastMessageAt.get(from) || 0;
  lastMessageAt.set(from, now);
  return now - last < windowMs;
}

// ==========================
// 👋 Detección saludo rápido
// ==========================
export const isGreeting = (text) =>
  /^(hola|buenas|hey|holi|holis|qué tal|que tal)\b/i.test(text);

// ==========================
// 🧠 Mensaje de bienvenida
// ==========================
export function saludoParaAntonio() {
  return `¡Hola Antonio! 👋
Soy tu bot de control de gastos.

Ejemplos:
/addmov 24-10-25 coche gasolina_repsol 60 5 pagado
/ultimos 5
/find gasolina
/total 10-25
/export 10-25

💡 Formato fecha: 24-10-25 (día-mes-año corto)
💡 Formato mes: 10-25 (mes-año)
`;
}

// ==========================
// 🔢 Helpers de formato
// ==========================
export function formatMoney(n) {
  return Number(n).toFixed(2) + "€";
}

// Valida y normaliza "10-25" (o "10/25") → "10-25"
export function normalizarMesYY(raw) {
  if (!raw) return null;
  const txt = raw.trim().replace("/", "-");
  if (!/^\d{1,2}-\d{2}$/.test(txt)) return null;
  return txt;
}
