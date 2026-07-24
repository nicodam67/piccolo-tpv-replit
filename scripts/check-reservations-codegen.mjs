import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "lib/api-client-react/src/reservations-generated");
const compatibilityFiles = [
  path.join(root, "lib/api-client-react/src/generated/api.ts"),
  path.join(root, "lib/api-client-react/src/reservations-compat.ts"),
];

function digest() {
  const hash = createHash("sha256");
  for (const file of fs.readdirSync(output).sort()) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(output, file)));
  }
  for (const file of compatibilityFiles) {
    hash.update(path.relative(root, file));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

function generate() {
  execFileSync("pnpm", ["--filter", "@workspace/api-spec", "run", "codegen:reservations"], {
    cwd: root,
    stdio: "inherit",
  });
  execFileSync("node", ["scripts/migrate-reservations-generated-hooks.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
}

generate();
const first = digest();
generate();
const second = digest();
if (first !== second) throw new Error(`Reservations codegen is not deterministic: ${first} != ${second}`);
console.log(`Reservations codegen deterministic: ${second}`);
