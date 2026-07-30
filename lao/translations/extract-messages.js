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
 * Usage:
 *   node lao/translations/extract-messages.js [modulesDir] [outDir]
 *
 * Defaults to node_modules/@openimis and lao/translations. Re-run it after
 * upgrading openIMIS: new strings appear in en.json as untranslated keys.
 */
const fs = require("fs");
const path = require("path");

const MODULES_DIR = process.argv[2] || path.join("node_modules", "@openimis");
const OUT_DIR = process.argv[3] || path.join("lao", "translations");
const LANGS = ["en", "fr"];

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

function messagesFor(src, lang) {
  const m = new RegExp(`var messages_${lang}\\s*=\\s*(?=\\{)`).exec(src);
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

const merged = Object.fromEntries(LANGS.map((l) => [l, {}]));
const modules = bundlesIn(MODULES_DIR);
let failures = 0;

modules.forEach(({ name, file }) => {
  const src = fs.readFileSync(file, "utf8");
  const found = [];
  LANGS.forEach((lang) => {
    let dict;
    try {
      dict = messagesFor(src, lang);
    } catch (e) {
      console.error(`  ${name} [${lang}]: ${e.message}`);
      failures += 1;
      return;
    }
    if (!dict) return;
    found.push(`${lang}=${Object.keys(dict).length}`);
    // First definition wins. Modules share the "core.*" prefix for a few
    // strings; taking the first keeps the result stable across runs.
    Object.entries(dict).forEach(([k, v]) => {
      if (!(k in merged[lang])) merged[lang][k] = v;
    });
  });
  console.log(`  ${name}: ${found.join(", ") || "none"}`);
});

fs.mkdirSync(OUT_DIR, { recursive: true });
LANGS.forEach((lang) => {
  const sorted = Object.fromEntries(Object.entries(merged[lang]).sort(([a], [b]) => a.localeCompare(b)));
  const out = path.join(OUT_DIR, `${lang}.json`);
  fs.writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  console.log(`${out}: ${Object.keys(sorted).length} strings`);
});

if (failures) {
  console.error(`\n${failures} dictionaries could not be read -- the output is incomplete.`);
  process.exit(1);
}
