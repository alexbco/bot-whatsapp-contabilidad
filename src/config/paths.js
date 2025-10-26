// src/config/paths.js
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// __dirname ahora es /src/config
// subimos uno -> /src
const ROOT_DIR = path.join(__dirname, "..");

export const EXTRACTOS_DIR = path.join(ROOT_DIR, "public", "extractos");

export function getServerBaseUrl() {
  return process.env.PUBLIC_BASE_URL || "http://localhost:3000";
}
