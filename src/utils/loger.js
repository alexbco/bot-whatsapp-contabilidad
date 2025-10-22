// src/utils/loger.js
import fs from "fs";
const LOG_FILE = "./logs.txt";

export function logInfo(msg) {
  const line = `[INFO] ${new Date().toISOString()} ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

export function logWarn(msg) {
  const line = `[WARN] ${new Date().toISOString()} ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.warn(line.trim());
}

export function logError(msg, err) {
  const line = `[ERROR] ${new Date().toISOString()} ${msg} → ${err?.message || err}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.error(line.trim());
}
