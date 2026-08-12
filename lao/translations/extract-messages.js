#!/usr/bin/env node
/*
 * Extracts the message dictionaries that openIMIS modules ship inside their
 * bundles, so a translator has a complete file to work from.
 *
 * The published packages contain nothing but dist/index.js and
 * dist/index.es.js -- no translations/en.json, and the source maps do not carry
 * one either, because the JSON is inlined at build time. The strings only exist
 * as an object literal:
 *
 *   var messages_en = { "core.pickerNoOptionsLabel": "No options available", ... }
 *
 * That literal is JavaScript, not JSON: rollup leaves keys unquoted where they
 * are valid identifiers, so eight of the thirty modules -- including
 * fe-language_fr, which holds most of the French -- fail JSON.parse outright.
 * They are evaluated instead, which is what makes the extraction complete
 * rather than nearly complete.
 *
 * Evaluating build output is acceptable here and nowhere near user input: the
 * input is a package this project already installs and executes in the browser
 * on every page load. Only the matched literal is evaluated, never the bundle.
 *
 * It does NOT write an English dictionary. openIMIS owns English and French;
 * keeping a copy here would duplicate data this project does not maintain and
 * go stale at every upgrade. The English text is folded into lao/translations/
 * lo.json instead, as context beside each Lao value:
 *
 *   "insuree.familyName": { "en": "Family Name", "lo": "" }
 *
 * Existing Lao is preserved. Re-running after an upgrade adds new keys as
 * untranslated, refreshes English wording that changed, and reports keys that
 * disappeared upstream without deleting anyone's work.
 *
 * One source is not a module at all. src/translations/ref.json is this project's
 * own catalogue, handed to fe-core's App as the `messages` prop, and fe-core
 * builds every locale as { ...messages, ...contributedForThisLanguage }. It is
 * therefore the base layer under all three languages, and a key it defines that
 * no module redefines renders identically in English, French and Lao.
 *
 * Forty-two of them did. "Search Criteria", "Reset filters", "Search", "Rows Per
 * Page", "Actions" and the twelve month names sit on nearly every screen in the
 * product, and stayed English in Lao because nothing here ever looked at this
 * file -- it holds no module prefix, so scanning bundles could not find it.
 * A Lao value for the same key overrides it for Lao alone, which is what makes
 * these translatable without touching English or French.
 *
 * Usage:
 *   node lao/translations/extract-messages.js [modulesDir] [workingFile]
 *
 * Defaults to node_modules/@openimis and lao/translations/lo.json.
 */
const fs = require("fs");
const path = require("path");

const MODULES_DIR = process.argv[2] || path.join("node_modules", "@openimis");
const WORKING = process.argv[3] || path.join("lao", "translations", "lo.json");
const BASE_APP_MESSAGES = path.join("src", "translations", "ref.json");
const BASE_LANG = "en";

const OPENERS = { "{": "}", "[": "]" };

/** Returns the literal starting at `start` -- object, array or string. */
function literalAt(src, start) {
  const open = src[start];
  if (open === '"' || open === "'") {
    let esc = false;
    for (let i = start + 1; i < src.length; i += 1) {
      if (esc) esc = false;
      else if (src[i] === "\\") esc = true;
      else if (src[i] === open) return src.slice(start, i + 1);
    }
    throw new Error("unterminated string");
  }
  if (!OPENERS[open]) throw new Error(`not a literal at ${start}`);

  let depth = 0;
  let inStr = null;
  let esc = false;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === inStr) inStr = null;
    } else if (c === '"' || c === "'" || c === "`") {
      inStr = c;
    } else if (c === "{" || c === "[") {
      depth += 1;
    } else if (c === "}" || c === "]") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced brackets");
}

/*
 * Evaluates a literal that may reference other top-level bindings.
 *
 * rollup's JSON plugin turns each top-level key of an imported .json into its
 * own const and rebuilds the object from them, so the dictionary is not
 * self-contained:
 *
 *   var project = { picker: { label: "Projects" } };
 *   var messages_en = { "socialProtection.x": "...", project: project };
 *
 * Rather than give up on those modules, unresolved identifiers are looked up in
 * the bundle on demand and evaluated the same way, recursively. Anything that
 * still cannot be resolved throws, so a module is never silently half-read.
 */
function evaluate(src, literal) {
  const cache = new Map();
  const scope = new Proxy(Object.create(null), {
    has: () => true,
    get(_t, name) {
      // `with` probes this symbol first; claiming it breaks the scope entirely.
      if (typeof name !== "string") return undefined;
      if (cache.has(name)) return cache.get(name);
      const decl = new RegExp(`var ${name}\\s*=\\s*(?=[{["'])`).exec(src);
      if (!decl) throw new Error(`cannot resolve "${name}"`);
      cache.set(name, undefined); // guards against a cyclic reference
      const value = evaluate(src, literalAt(src, decl.index + decl[0].length));
      cache.set(name, value);
      return value;
    },
  });
  // eslint-disable-next-line no-new-func
  return new Function("scope", `with (scope) { return ${literal}; }`)(scope);
}

/*
 * A few modules keep part of their dictionary nested. react-intl looks messages
 * up by flat id, so those are flattened to dotted keys -- the form the code
 * asks for.
 */
function flatten(obj, prefix, out) {
  Object.entries(obj).forEach(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  });
  return out;
}

/*
 * Modules do not agree on how to name the dictionary. Most declare
 * `var messages_en`; fe-admin, fe-opensearch_reports and fe-deduplication use
 * `var messagesEn`. Matching only the first spelling skipped those three
 * silently -- which is how "Administration" and "Dashboards", both visible
 * sidebar headings, came to be missing from the working file with no error.
 */
function messagesFor(src, lang) {
  const m = new RegExp(`var messages_?${lang}\\s*=\\s*(?=\\{)`, "i").exec(src);
  if (!m) return null;
  const value = evaluate(src, literalAt(src, m.index + m[0].length));
  return value && typeof value === "object" ? flatten(value, "", {}) : null;
}

function bundlesIn(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`no such directory: ${dir}`);
    process.exit(1);
  }
  return fs
    .readdirSync(dir)
    .map((name) => ({ name, file: path.join(dir, name, "dist", "index.es.js") }))
    .filter((m) => fs.existsSync(m.file))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const english = {};
let failures = 0;

bundlesIn(MODULES_DIR).forEach(({ name, file }) => {
  const src = fs.readFileSync(file, "utf8");
  let dict;
  try {
    dict = messagesFor(src, BASE_LANG);
  } catch (e) {
    console.error(`  ${name}: ${e.message}`);
    failures += 1;
    return;
  }
  console.log(`  ${name}: ${dict ? Object.keys(dict).length : "none"}`);
  if (!dict) return;
  // First definition wins. A few keys appear in more than one module; taking
  // the first keeps the result stable across runs.
  Object.entries(dict).forEach(([k, v]) => {
    if (!(k in english)) english[k] = v;
  });
});

/*
 * Added last, so a module that happens to define the same bare key keeps
 * priority -- the same order fe-core spreads them in at runtime.
 */
if (fs.existsSync(BASE_APP_MESSAGES)) {
  const base = JSON.parse(fs.readFileSync(BASE_APP_MESSAGES, "utf8"));
  const fresh = Object.keys(base).filter((k) => !(k in english));
  console.log(`  ${BASE_APP_MESSAGES}: ${Object.keys(base).length} (${fresh.length} not in any module)`);
  fresh.forEach((k) => {
    english[k] = base[k];
  });
} else {
  console.error(`  ${BASE_APP_MESSAGES}: missing -- app-level messages will be skipped`);
  failures += 1;
}

if (failures) {
  console.error(`\n${failures} module(s) could not be read -- refusing to rewrite ${WORKING},`);
  console.error("because a partial read would look like keys being removed upstream.");
  process.exit(1);
}

const existing = fs.existsSync(WORKING) ? JSON.parse(fs.readFileSync(WORKING, "utf8")) : {};

const added = [];
const rewordedEnglish = [];
const merged = {};
Object.keys(english)
  .sort((a, b) => a.localeCompare(b))
  .forEach((key) => {
    const was = existing[key];
    if (!was) added.push(key);
    else if (was.en !== english[key] && was.lo) rewordedEnglish.push(key);
    merged[key] = { en: english[key], lo: was?.lo ?? "" };
  });

// Kept, not dropped: discarding someone's translation because a key vanished
// from one upgrade would be irreversible, and upstream sometimes moves keys
// between modules. Reported so they can be pruned deliberately.
const gone = Object.keys(existing).filter((k) => !(k in english));

fs.writeFileSync(WORKING, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

const translated = Object.values(merged).filter((v) => v.lo.trim() !== "").length;
console.log(`\n${WORKING}: ${Object.keys(merged).length} keys, ${translated} translated`);
if (added.length) console.log(`  ${added.length} new key(s)`);
if (gone.length) {
  console.log(`  ${gone.length} key(s) no longer in openIMIS (left in place):`);
  gone.slice(0, 10).forEach((k) => console.log(`    ${k}`));
}
if (rewordedEnglish.length) {
  console.log(`  ${rewordedEnglish.length} translated key(s) whose English changed -- review:`);
  rewordedEnglish.slice(0, 10).forEach((k) => console.log(`    ${k}`));
}
