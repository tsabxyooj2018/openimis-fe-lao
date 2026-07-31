#!/usr/bin/env node
/*
 * Reports which sidebar labels are still untranslated.
 *
 * Written because the menus were "finished" twice and were not. Searching the
 * dictionary for keys containing "menu" looks reasonable and misses whole
 * groups: fe-opensearch_reports names its entries
 * openSearchReports.openSearch.individualReports, and fe-tasks_management uses
 * tasksManagement.entries.*. Neither matches, so the Dashboards group and two
 * Tasks entries stayed English with nothing to indicate it.
 *
 * This asks the code instead of guessing at key names. Every group is a
 * MainMenuContribution, and the entries array and header are built immediately
 * above that call, so the messages formatted in that window are exactly the
 * labels the sidebar renders.
 *
 * Usage:  node lao/translations/menu-coverage.js [modulesDir] [workingFile]
 *
 * Exits non-zero when anything is untranslated, so it can gate a release when
 * the menus are meant to be complete. It is deliberately NOT wired into the
 * Docker build: partial translation is a normal state here, and failing every
 * build over it would be wrong.
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

const found = new Map();
fs.readdirSync(MODULES_DIR).forEach((name) => {
  const file = path.join(MODULES_DIR, name, "dist", "index.es.js");
  if (!fs.existsSync(file)) return;
  const src = fs.readFileSync(file, "utf8");
  const prefix = (MODULE_NAME.exec(src) || [])[1] || "";
  for (const m of src.matchAll(ANCHOR)) {
    const seg = src.slice(Math.max(0, m.index - WINDOW), m.index + 600);
    for (const k of seg.matchAll(KEY)) {
      if (!found.has(k[1])) found.set(k[1], new Set());
      found.get(k[1]).add(prefix);
    }
  }
});

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
console.log("every sidebar label is translated.");
