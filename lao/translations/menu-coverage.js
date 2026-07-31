#!/usr/bin/env node
/*
 * Reports which sidebar labels are still untranslated.
 *
 * READ THIS BEFORE TRUSTING IT: the list is a best effort, not a proof. The
 * sidebar is assembled at runtime from contributions, so no static scan can be
 * sure it has found every label. An empty result means "nothing found by the
 * rules below", never "the menus are complete". Check against the running app.
 *
 * That distinction is the whole reason this file says so loudly. An earlier
 * version reported "every sidebar label is translated" while seven entries
 * under Legal and Finance were plainly English on screen.
 *
 * Labels are collected three ways, because modules name and place them
 * differently:
 *
 *   1. near a MainMenuContribution call -- the group heading and the entries
 *      the owning module defines itself
 *   2. immediately before a `route:` -- an entry is a label plus a route, and
 *      this catches entries a module pushes into ANOTHER module's menu through
 *      a *.MainMenu contribution (fe-contribution_plan does this to
 *      invoice.MainMenu, so rule 1 never sees them)
 *   3. keys ending `.route` -- fe-payroll labels its entries that way
 *      (payroll.route.payrollsPending), reached through a variable that no
 *      textual rule can follow
 *
 * Usage:  node lao/translations/menu-coverage.js [modulesDir] [workingFile]
 *
 * Exits non-zero when anything found is untranslated. Deliberately NOT wired
 * into the Docker build: partial translation is a normal state here, and
 * failing every build over it would be wrong.
 */
const fs = require("fs");
const path = require("path");

const MODULES_DIR = process.argv[2] || path.join("node_modules", "@openimis");
const WORKING = process.argv[3] || path.join("lao", "translations", "lo.json");
const WINDOW = 6000;

const ANCHOR = /createElement\((?:[\w$.[\]"]+\.)?MainMenuContribution\b/g;
const KEY = /formatMessage\((?:[^()]|\([^()]*\))*?['"]([\w][\w.]*)['"]\s*\)/g;
const MODULE_NAME = /var MODULE_NAME\s*=\s*['"]([^'"]+)['"]/;

if (!fs.existsSync(MODULES_DIR)) {
  console.error(`no such directory: ${MODULES_DIR}`);
  process.exit(1);
}

const ROUTE = /route:/g;
const BACK = 400;

const found = new Map();
const note = (key, prefix) => {
  if (!found.has(key)) found.set(key, new Set());
  found.get(key).add(prefix);
};

fs.readdirSync(MODULES_DIR).forEach((name) => {
  const file = path.join(MODULES_DIR, name, "dist", "index.es.js");
  if (!fs.existsSync(file)) return;
  const src = fs.readFileSync(file, "utf8");
  const prefix = (MODULE_NAME.exec(src) || [])[1] || "";

  // 1. around the MainMenuContribution call
  for (const m of src.matchAll(ANCHOR)) {
    const seg = src.slice(Math.max(0, m.index - WINDOW), m.index + 600);
    for (const k of seg.matchAll(KEY)) note(k[1], prefix);
  }

  // 2. the label immediately preceding a route
  for (const r of src.matchAll(ROUTE)) {
    const keys = [...src.slice(Math.max(0, r.index - BACK), r.index).matchAll(KEY)];
    if (keys.length) note(keys[keys.length - 1][1], prefix);
  }
});

// 3. every key that looks like a route label, taken from the dictionary itself
//    rather than the bundles -- fe-payroll reaches these through a variable.
Object.keys(JSON.parse(fs.readFileSync(WORKING, "utf8")))
  .filter((k) => k.endsWith(".route") || /\.route\./.test(k))
  .forEach((k) => note(k, ""));

const work = JSON.parse(fs.readFileSync(WORKING, "utf8"));

// formatMessage(intl, MODULE, "x") is looked up as "MODULE.x" first, then "x".
const resolve = (key, prefixes) => {
  if (key in work) return key;
  for (const p of prefixes) if (p && `${p}.${key}` in work) return `${p}.${key}`;
  return null;
};

const missing = [];
let translated = 0;
let unknown = 0;

[...found.keys()].sort().forEach((key) => {
  const real = resolve(key, found.get(key));
  if (!real) unknown += 1;
  else if (work[real].lo.trim()) translated += 1;
  else missing.push([real, work[real].en]);
});

console.log(
  `sidebar labels: ${found.size} found, ${translated} translated, ` +
    `${missing.length} untranslated, ${unknown} not in the dictionary`,
);

if (missing.length) {
  console.log("\nuntranslated:");
  missing.forEach(([k, en]) => console.log(`  ${k}\n    ${en}`));
  process.exit(1);
}
// Deliberately not "the menus are complete" -- see the header. The sidebar is
// assembled at runtime and this cannot see all of it.
console.log("nothing untranslated among the labels this can detect.");
console.log("That is not a guarantee -- check the running app.");
