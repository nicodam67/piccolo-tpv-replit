import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const appRoot = path.resolve(process.env.PICCOLO_APP_ROOT ?? path.join(here, ".."));
export const dataRoot = path.resolve(
  process.env.PICCOLO_DATA_ROOT
  ?? (process.env.ProgramData ? path.join(process.env.ProgramData, "PiccoloTPV") : path.join(appRoot, "data")),
);

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(path.join(dataRoot, "config", "piccolo.env"));
loadEnv(path.join(dataRoot, "secrets", "secrets.env"));

Object.assign(process.env, {
  NODE_ENV: "production",
  PICCOLO_VERSION: process.env.PICCOLO_VERSION ?? "0.9.0-rc.1",
  PICCOLO_DATA_ROOT: dataRoot,
  PICCOLO_WEB_ROOT: process.env.PICCOLO_WEB_ROOT ?? path.join(appRoot, "web"),
  PICCOLO_UPLOAD_ROOT: process.env.PICCOLO_UPLOAD_ROOT ?? path.join(dataRoot, "uploads"),
  DB_MIGRATIONS_ROOT: process.env.DB_MIGRATIONS_ROOT ?? path.join(appRoot, "db"),
  BACKUP_LOCAL_ROOTS: process.env.BACKUP_LOCAL_ROOTS ?? path.join(dataRoot, "backups"),
});
