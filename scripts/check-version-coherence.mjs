import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const expected = "0.9.0-rc.2";
const errors = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const assertEqual = (label, actual) => {
  if (actual !== expected) errors.push(`${label}: expected ${expected}, got ${actual}`);
};

assertEqual("VERSION", read("VERSION").trim());
for (const file of [
  "package.json",
  "artifacts/api-server/package.json",
  "artifacts/piccolo-tpv/package.json",
]) assertEqual(file, JSON.parse(read(file)).version);
assertEqual("version.json", JSON.parse(read("artifacts/piccolo-tpv/public/version.json")).version);

for (const file of [
  "artifacts/api-server/src/lib/app-version.ts",
  "artifacts/piccolo-tpv/src/lib/app-version.ts",
  "artifacts/piccolo-tpv/public/sw.js",
  "release/piccolo/VERSION.txt",
]) {
  if (!read(file).includes(expected)) errors.push(`${file}: missing ${expected}`);
}

if (errors.length) {
  process.stderr.write(`Version coherence failed:\n- ${errors.join("\n- ")}\n`);
  process.exit(1);
}
process.stdout.write(`Version coherence passed: Piccolo TPV ${expected} — Solo para pruebas\n`);
