import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);

function option(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const delivery = option("delivery");
const summary = option("summary");
const profile = option("profile");
const dryRun = args.includes("--dry-run");
if (!delivery || !summary || !profile) {
  throw new Error("Required: --delivery <id> --summary <text> --profile <validation profile>");
}

const validationArgs = ["scripts/validate-change.mjs", "--profile", profile];
for (const name of ["tests", "packages", "codegen"]) {
  const value = option(name);
  if (value) validationArgs.push(`--${name}`, value);
}
run("node", validationArgs);

if (dryRun) {
  console.log(`Delivery ${delivery} validation completed (dry run; state not changed).`);
  process.exit(0);
}

const statePath = path.join(root, "project-state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const numeric = Number(delivery);
const deliveryId = Number.isFinite(numeric) && String(numeric) === delivery ? numeric : delivery;
state.lastDelivery = deliveryId;
state.lastSummary = summary;
state.deliveries = state.deliveries.filter((item) => String(item.number) !== String(deliveryId));
state.deliveries.push({ number: deliveryId, summary });
fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
run("node", ["scripts/update-project-state.mjs"]);
console.log(`Delivery ${delivery} finalized and PROJECT_STATE.md updated.`);
