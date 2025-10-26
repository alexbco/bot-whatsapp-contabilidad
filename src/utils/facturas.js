// src/utils/facturas.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logInfo } from "./loger.js";

/**
 * guardarFacturaImagen(mediaId)
 * Ahora mismo es stub: no descarga de WhatsApp aún,
 * pero CREAMOS un archivo vacío en /public/facturas
 * y devolvemos la ruta ABSOLUTA en disco.
 *
 * Esa ruta absoluta es la que se mete en la DB (factura_path).
 * Luego getExtractoMensual la lee y el PDF la incrusta.
 */
export async function guardarFacturaImagen(mediaId) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // carpeta física donde guardaremos facturas reales EN PRODU
  // -> /src/public/facturas
  const facturasDir = path.join(__dirname, "..", "public", "facturas");
  if (!fs.existsSync(facturasDir)) {
    fs.mkdirSync(facturasDir, { recursive: true });
    logInfo("📂 Carpeta /public/facturas creada automáticamente");
  }

  const fakeName = `factura_${mediaId || Date.now()}.jpg`;
  const absPath = path.join(facturasDir, fakeName);

  // crear un archivo vacío (placeholder)
  if (!fs.existsSync(absPath)) {
    fs.writeFileSync(absPath, "");
  }

  // devolvemos la ruta ABSOLUTA, porque PDFKit necesita ruta absoluta
  return absPath;
}
