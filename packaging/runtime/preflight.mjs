import path from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot } from "./environment.mjs";

await import(pathToFileURL(path.join(appRoot, "server", "dist", "installer-preflight.mjs")).href);
