import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "release", "piccolo", "INSTALAR-Y-PROBAR-PICCOLO.html");
const output = path.join(root, "release", "piccolo", "INSTALAR-Y-PROBAR-PICCOLO.pdf");
const candidates = [
  process.env["CHROME_PATH"],
  process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : "/usr/local/bin/google-chrome",
  "google-chrome",
  "chromium",
].filter(Boolean);

if (!fs.existsSync(source)) throw new Error(`Missing guide source: ${source}`);

let rendered = false;
fs.rmSync(output, { force: true });
for (const browser of candidates) {
  const result = spawnSync(browser, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${path.join(root, "release", "piccolo", ".chrome-pdf-profile")}`,
    `--print-to-pdf=${output}`,
    "--print-to-pdf-no-header",
    pathToFileURL(source).href,
  ], { stdio: "inherit", timeout: 10_000, killSignal: "SIGKILL" });
  if (fs.existsSync(output) && fs.statSync(output).size > 1_000) {
    rendered = true;
    break;
  }
}
if (!rendered) throw new Error("Unable to render installation PDF; set CHROME_PATH");
process.stdout.write(`Rendered ${output}\n`);
