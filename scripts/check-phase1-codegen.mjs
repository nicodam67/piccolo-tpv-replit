import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "lib/api-client-react/src/phase1-generated");
const compatibilityFiles = [
  path.join(root, "lib/api-client-react/src/generated/api.ts"),
  path.join(root, "lib/api-client-react/src/phase1-compat.ts"),
];

function digest() {
  const files = fs.readdirSync(output).sort();
  const hash = createHash("sha256");
  for (const file of files) {
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
  execFileSync("pnpm", ["--filter", "@workspace/api-spec", "run", "codegen:phase1"], {
    cwd: root,
    stdio: "inherit",
  });
  execFileSync("node", ["scripts/migrate-floor-generated-hooks.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
}

generate();
const first = digest();
generate();
const second = digest();
if (first !== second) {
  console.error(`Phase 1 codegen is not deterministic: ${first} != ${second}`);
  process.exit(1);
}
console.log(`Phase 1 codegen deterministic: ${second}`);
