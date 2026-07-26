import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot } from "./environment.mjs";

const mode = process.argv[2] === "check" ? "check" : "apply";
process.argv[2] = mode;
await import(pathToFileURL(path.join(appRoot, "server", "dist", "migrate.mjs")).href);
