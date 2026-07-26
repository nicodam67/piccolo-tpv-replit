import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot, dataRoot } from "./environment.mjs";

fs.mkdirSync(path.join(dataRoot, "logs"), { recursive: true });
fs.mkdirSync(process.env.PICCOLO_UPLOAD_ROOT, { recursive: true });
fs.mkdirSync(process.env.BACKUP_LOCAL_ROOTS, { recursive: true });

await import(pathToFileURL(path.join(appRoot, "server", "dist", "index.mjs")).href);
