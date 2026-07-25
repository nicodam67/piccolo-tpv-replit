import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "lib/api-client-react/src/cash-payments-generated");

function digest() {
  const files = fs.readdirSync(output).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(output, file)));
  }
  return hash.digest("hex");
}

function generate() {
  execFileSync("pnpm", ["--filter", "@workspace/api-spec", "run", "codegen:cash-payments"], {
    cwd: root,
    stdio: "inherit",
  });
}

generate();
const first = digest();
generate();
const second = digest();
if (first !== second) {
  console.error(`Cash & Payments codegen is not deterministic: ${first} != ${second}`);
  process.exit(1);
}
console.log(`Cash & Payments codegen deterministic: ${second}`);
