import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);

function option(name, fallback = "") {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function run(command, commandArgs) {
  console.log(`\n> ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const profile = option("profile");
const packages = option("packages", "api-server").split(",").filter(Boolean);
const tests = option("tests").split(",").filter(Boolean);
const codegen = option("codegen");

if (!["docs", "domain", "shared", "phase"].includes(profile)) {
  throw new Error("Use --profile docs|domain|shared|phase");
}

if (profile === "docs") {
  run("git", ["diff", "--check"]);
}

if (profile === "domain") {
  if (!tests.length && !codegen) {
    throw new Error("Domain validation requires --tests and/or --codegen");
  }
  for (const packageName of packages) {
    run("pnpm", ["--filter", `@workspace/${packageName}`, "run", "typecheck"]);
  }
  if (tests.length) {
    run("pnpm", ["--filter", "@workspace/api-server", "exec", "vitest", "run", ...tests]);
  }
}

if (profile === "shared") {
  run("pnpm", ["run", "typecheck"]);
  run("pnpm", ["run", "lint"]);
  for (const packageName of packages) {
    run("pnpm", ["--filter", `@workspace/${packageName}`, "run", "build"]);
  }
  if (tests.length) {
    run("pnpm", ["--filter", "@workspace/api-server", "exec", "vitest", "run", ...tests]);
  }
}

if (codegen) {
  run("pnpm", ["run", `codegen:${codegen}:check`]);
}

if (profile === "phase") {
  run("pnpm", ["run", "typecheck"]);
  run("pnpm", ["run", "lint"]);
  run("pnpm", ["-r", "--if-present", "run", "build"]);
  run("bash", ["scripts/run-e2e-staging-local.sh"]);
  run("bash", ["scripts/run-restore-staging-local.sh"]);
  run("bash", ["scripts/check-codegen.sh"]);
  run("pnpm", ["audit", "--prod", "--audit-level", "moderate"]);
}

console.log(`\nValidation profile '${profile}' completed.`);
