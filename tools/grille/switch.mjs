#!/usr/bin/env node
// Points web/graph-editor at a Grille dev tarball (GitHub release) or an npm release.
// Usage: node tools/grille/switch.mjs dev [tag] | release [version] | status | check
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = "@weblings_things/grille";
const REPO = "weblings/GrilleDS";
const EDITOR = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/graph-editor");
const NPM_HOST = "https://registry.npmjs.org/";

function run(cmd, args, { capture = true } = {}) {
  // One quoted string through the shell: npm and gh are .cmd shims on Windows.
  const line = [cmd, ...args.map((a) => `"${a}"`)].join(" ");
  const r = spawnSync(line, {
    cwd: EDITOR,
    encoding: "utf8",
    shell: true,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (r.error) die(`${cmd} could not start: ${r.error.message}`);
  return r;
}

function die(msg) {
  console.error(`grille: ${msg}`);
  process.exit(1);
}

function gh(args) {
  const r = run("gh", [...args, "--repo", REPO]);
  if (r.status !== 0) die(`gh ${args.slice(0, 2).join(" ")} failed: ${(r.stderr || "").trim()}`);
  return JSON.parse(r.stdout);
}

function pinned() {
  const pkg = JSON.parse(readFileSync(resolve(EDITOR, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(resolve(EDITOR, "package-lock.json"), "utf8"));
  const entry = lock.packages?.[`node_modules/${PKG}`] ?? {};
  const spec = pkg.dependencies?.[PKG] ?? "(missing)";
  const resolved = entry.resolved ?? "(missing)";
  let source = "other";
  if (resolved.startsWith(NPM_HOST)) source = "npm";
  else if (resolved.includes("github.com") && resolved.endsWith(".tgz")) source = "github";
  return { spec, resolved, version: entry.version ?? "?", source };
}

function printStatus() {
  const p = pinned();
  console.log(`grille: ${p.source} ${p.version}`);
  console.log(`  package.json: ${p.spec}`);
  console.log(`  lockfile:     ${p.resolved}`);
  return p;
}

function install(spec) {
  const r = run("npm", ["install", "--save-exact", spec], { capture: false });
  if (r.status !== 0) die("npm install failed, package.json and the lockfile may be half-written");
  const d = run("git", ["diff", "--stat", "--", "package.json", "package-lock.json"]);
  console.log(d.stdout.trim() || "(no change)");
  printStatus();
}

function cmdDev(arg) {
  const releases = gh(["release", "list", "--json", "tagName,isPrerelease", "--limit", "30"]);
  let tag = arg && (arg.startsWith("v") ? arg : `v${arg}`);
  if (!tag) tag = releases.find((r) => r.isPrerelease)?.tagName;
  if (!tag) die("no pre-release found on GitHub");
  const rel = gh(["release", "view", tag, "--json", "assets"]);
  const asset = rel.assets.find((a) => a.name.endsWith(".tgz"));
  if (!asset) die(`${tag} has no .tgz asset`);
  console.log(`grille: dev ${tag}`);
  install(asset.url);
}

function cmdRelease(arg) {
  let version = arg?.replace(/^v/, "");
  if (!version) {
    const releases = gh(["release", "list", "--json", "tagName,isPrerelease", "--limit", "30"]);
    const tag = releases.find((r) => !r.isPrerelease)?.tagName;
    if (!tag) die("no non-prerelease found on GitHub");
    version = tag.replace(/^v/, "");
  }
  const v = run("npm", ["view", `${PKG}@${version}`, "version"]);
  if (v.status !== 0 || !v.stdout.trim()) {
    die(`${PKG}@${version} is not on npm (tagged on GitHub but not yet published?)`);
  }
  console.log(`grille: release ${version}`);
  install(`${PKG}@${version}`);
}

function cmdCheck() {
  const p = printStatus();
  const exact = /^\d+\.\d+\.\d+$/.test(p.spec);
  if (p.source !== "npm" || !exact) {
    die("release builds need an exact npm version, run: node tools/grille/switch.mjs release");
  }
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case "dev": cmdDev(arg); break;
  case "release": cmdRelease(arg); break;
  case "status": printStatus(); break;
  case "check": cmdCheck(); break;
  default:
    console.error("usage: switch.mjs dev [tag] | release [version] | status | check");
    process.exit(2);
}
