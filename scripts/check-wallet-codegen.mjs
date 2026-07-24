import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "lib/api-client-react/src/wallet-generated");

function digest() {
  const hash = createHash("sha256");
  for (const file of fs.readdirSync(output).sort()) {
    hash.update(file);
    hash.update(fs.readFileSync(path.join(output, file)));
  }
  return hash.digest("hex");
}

function generate() {
  execFileSync("pnpm", ["--filter", "@workspace/api-spec", "run", "codegen:wallet"], {
    cwd: root,
    stdio: "inherit",
  });
}

generate();
const first = digest();
generate();
const second = digest();
if (first !== second) throw new Error(`Wallet codegen is not deterministic: ${first} != ${second}`);
console.log(`Wallet codegen deterministic: ${second}`);
