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

/*
 * Give each sidebar group a stable, language-independent hook.
 *
 * fe-core builds the accordion id from the group's *translated* heading:
 *
 *   id: "".concat(_this.props.header, "-header")
 *
 * so the only handle the DOM offers changes with the language. Styling keyed on
 * it -- the group icons, and the Profile block pinned to the bottom of the
 * sidebar -- worked in English and silently stopped matching in French and Lao,
 * because "Social Protection" became "Protection sociale".
 *
 * menuId is already passed to this component by every module that contributes a
 * menu (BenefitPlanMainMenu, ProfileMainMenu, TasksMainMenu, ...) and is a
 * constant in the module's source, so it does not translate. Emitting it as a
 * data attribute gives CSS something that holds in every language.
 *
 * A prop that is undefined renders no attribute at all in React, so a module
 * that passes no menuId is unaffected rather than gaining an empty one.
 */
const STABLE_MENU_ID = {
  find: 'id: "".concat(_this.props.header, "-header")',
  replace: 'id: "".concat(_this.props.header, "-header"), "data-menu-id": _this.props.menuId',
};

const totals = {};
let filesPatched = 0;
let menuIdPatched = 0;

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

  const already = source.includes(STABLE_MENU_ID.replace);
  const menuIdHits = already ? 0 : source.split(STABLE_MENU_ID.find).length - 1;
  if (menuIdHits) source = source.split(STABLE_MENU_ID.find).join(STABLE_MENU_ID.replace);
  menuIdPatched += menuIdHits || (already ? 1 : 0);

  fs.writeFileSync(file, source, "utf-8");
  filesPatched += 1;
  console.log(`  ${rel}: ${replacedHere} replacements, data-menu-id ${menuIdHits || (already ? "(already present)" : "NOT FOUND")}`);
}

if (filesPatched === 0) {
  console.error("no fe-core dist bundle found to patch");
  process.exit(1);
}

// Fail loudly rather than ship a sidebar that looks right in English only.
if (menuIdPatched === 0) {
  console.error("\ncould not add data-menu-id: fe-core no longer builds the accordion id from");
  console.error("props.header, so the sidebar styling needs a new hook. See lao/apply-overrides.js.");
  process.exit(1);
}

const missing = Object.keys(overrides).filter((k) => !totals[k]);
if (missing.length) {
  console.error("\nThese keys were not found in fe-core - upstream may have renamed them:");
  missing.forEach((k) => console.error(`  ${k}`));
  process.exit(1);
}

console.log(`Lao login overrides applied: ${Object.keys(overrides).length} keys across ${filesPatched} bundle(s).`);
