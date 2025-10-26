// src/utils/facturas.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logInfo } from "./loger.js";

// ⚠️ Versión stub: no descarga de WhatsApp todavía.
// Solo crea la carpeta y devuelve una ruta simulada.

export async function guardarFacturaImagen(mediaId) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // carpeta física donde guardaremos facturas reales
  const facturasDir = path.join(__dirname, "..", "..", "facturas");
  if (!fs.existsSync(facturasDir)) {
    fs.mkdirSync(facturasDir, { recursive: true });
    logInfo("📂 Carpeta /facturas creada automáticamente");
  }

  // de momento no descargamos nada real, solo devolvemos una ruta "fake"
  // luego aquí haremos la descarga con el mediaId
  const fakeName = `factura_${mediaId || Date.now()}.jpg`;
  const fakePathAbs = path.join(facturasDir, fakeName);

  // crear un archivo vacío temporal para que exista físicamente y no pete
  if (!fs.existsSync(fakePathAbs)) {
    fs.writeFileSync(fakePathAbs, "");
  }

  // devolvemos lo que guardaremos en la DB
  // podrías guardar ruta absoluta o relativa, tú mandas.
  const relativeForDb = `/facturas/${fakeName}`;

  return relativeForDb;
}
