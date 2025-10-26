// src/config/paths.js
import path from "path";
import { fileURLToPath } from "url";

// dirname del proyecto raíz (carpeta donde está /src)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OJO: este __dirname ahora es .../src/config
// subimos dos niveles para llegar al root del repo
const ROOT_DIR = path.join(__dirname, ".."); // -> .../src

// carpeta public/extractos (absoluta)
export const EXTRACTOS_DIR = path.join(ROOT_DIR, "public", "extractos");

// helper para base URL pública
export function getServerBaseUrl() {
  return process.env.PUBLIC_BASE_URL || "http://localhost:3000";
}
