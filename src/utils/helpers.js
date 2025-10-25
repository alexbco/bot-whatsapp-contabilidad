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
export function saludoParaAntonio() {
  return `👋 ¡Hola Antonio!
Soy tu bot de control de gastos 💼

Puedes usarme con estos comandos:

🧾 GASTOS (materiales con descuento)
  ➤ gasto avu abono cesped 187.50 90.50
     (187.50 = lo que cobras al cliente / 90.50 = lo que te costó)

🔧 SERVICIOS (mano de obra o trabajos extra)
  ➤ servicio lo cortar setos 80

🧹 LIMPIEZA (servicio de tu mujer)
  ➤ limpieza maria ortega limpieza septiembre 49.50

💶 PAGOS DE CLIENTES
  ➤ paga lo 250

📊 EXTRACTOS MENSUALES
  ➤ extracto lo 2025-09

💡 Consejo:
- Puedes usar el nombre completo o las siglas del cliente (ej: lo, avu, fec…)
- Si mando una factura después de registrar un gasto o limpieza, la guardaré automáticamente.

Escribe "hola" o "ayuda" cuando quieras ver de nuevo esta lista ✅`;
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
