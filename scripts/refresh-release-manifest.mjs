import path from "node:path";
import { execFileSync } from "node:child_process";
import { artifactManifest, writeChecksums } from "./release-utils.mjs";

const root = path.resolve(import.meta.dirname, "..");
const release = path.join(root, "release", "piccolo");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const manifest = artifactManifest(release, commit);
manifest.signed = process.argv.includes("--signed");
writeChecksums(release, manifest);
