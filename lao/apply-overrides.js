/*
 * Apply Lao deployment label overrides to the installed @openimis/fe-core.
 *
 * Why patch the compiled bundle:
 *
 *  - fe-core is published with "main": "dist/index.js" and
 *    "module": "dist/index.es.js". Its src/translations/en.json ships in the
 *    package but is NOT what gets imported, so editing it has no effect.
 *  - formatMessage only looks up `${module}.${id}` then `${id}`
 *    (src/helpers/i18n.js). There is no `overwrite.*` tier, despite i18n.md.
 *  - App.js merges dictionaries as `{ ...messages, ...msgs }`, so module
 *    contributions always beat the assembly's `messages` prop -- root
 *    translations in src/translations/ref.json cannot win.
 *  - modules-config.js rewrites package.json, deleting every `@openimis/*`
 *    dependency and re-adding it from openimis.json, so an unpublished local
 *    language-pack module cannot be referenced without also patching it.
 *
 * Each key must already exist, so a value that upstream renames fails the
 * build loudly instead of silently producing an unbranded image.
 *
 * Run after `npm install` and before `npm run build`.
 */
const fs = require("fs");
const path = require("path");

const PKG = path.join(__dirname, "..", "node_modules", "@openimis", "fe-core");
const TARGETS = ["dist/index.js", "dist/index.es.js"];
const overrides = JSON.parse(fs.readFileSync(path.join(__dirname, "login-overrides.en.json"), "utf-8"));

if (!fs.existsSync(PKG)) {
  console.error(`@openimis/fe-core not found at ${PKG} - did npm install run?`);
  process.exit(1);
}

const totals = {};
let filesPatched = 0;

for (const rel of TARGETS) {
  const file = path.join(PKG, rel);
  if (!fs.existsSync(file)) {
    console.log(`  ${rel}: absent, skipped`);
    continue;
  }

  let source = fs.readFileSync(file, "utf-8");
  let replacedHere = 0;

  for (const [key, value] of Object.entries(overrides)) {
    // Match "<key>" : "<any string literal>" and swap only the value.
    const pattern = new RegExp(
      `("${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`,
      "g",
    );
    let hits = 0;
    source = source.replace(pattern, (_m, prefix) => {
      hits += 1;
      return prefix + JSON.stringify(value);
    });
    totals[key] = (totals[key] || 0) + hits;
    replacedHere += hits;
  }

  fs.writeFileSync(file, source, "utf-8");
  filesPatched += 1;
  console.log(`  ${rel}: ${replacedHere} replacements`);
}

if (filesPatched === 0) {
  console.error("no fe-core dist bundle found to patch");
  process.exit(1);
}

const missing = Object.keys(overrides).filter((k) => !totals[k]);
if (missing.length) {
  console.error("\nThese keys were not found in fe-core - upstream may have renamed them:");
  missing.forEach((k) => console.error(`  ${k}`));
  process.exit(1);
}

console.log(`Lao login overrides applied: ${Object.keys(overrides).length} keys across ${filesPatched} bundle(s).`);
