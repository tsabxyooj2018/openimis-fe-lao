#!/usr/bin/env node
/*
 * Turns the translator's file into the one the application imports.
 *
 * lao/translations/lo.json is the working copy: it holds every key English has,
 * so it can be reviewed side by side with en.json, and an untranslated string
 * is an empty value. src/lao-language/lo.json is the build product: the same
 * data with the empty entries removed.
 *
 * Removing them is the whole point. An empty string is a perfectly valid
 * translation as far as react-intl is concerned, so shipping the working file
 * as-is would render most of the interface BLANK -- worse than the raw message
 * keys that prompted the English fallback in src/ModulesManager.js. Only an
 * absent key falls through to English.
 *
 * It lands in src/ because Create React App refuses imports from outside it.
 *
 * Usage:  node lao/translations/build-lo.js [--check]
 *
 * --check verifies the committed output matches the source and exits non-zero
 * if not, so a build fails rather than quietly shipping a stale dictionary.
 */
const fs = require("fs");
const path = require("path");

const SRC = path.join("lao", "translations", "lo.json");
const REF = path.join("lao", "translations", "en.json");
const OUT = path.join("src", "lao-language", "lo.json");
const check = process.argv.includes("--check");

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const source = read(SRC);
const english = fs.existsSync(REF) ? read(REF) : {};

const translated = Object.entries(source)
  .filter(([, v]) => typeof v === "string" && v.trim() !== "")
  .sort(([a], [b]) => a.localeCompare(b));

// A key that no longer exists upstream is dead weight, and usually a sign the
// working file needs regenerating after an openIMIS upgrade. Reported, not
// dropped: discarding someone's translation silently would be worse.
const orphans = Object.keys(english).length
  ? translated.filter(([k]) => !(k in english)).map(([k]) => k)
  : [];

const out = `${JSON.stringify(Object.fromEntries(translated), null, 2)}\n`;
const total = Object.keys(source).length;
const pct = total ? ((translated.length / total) * 100).toFixed(1) : "0.0";

if (check) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  // Compared with line endings normalised: a Windows checkout stores CRLF, and
  // failing the build over that would say "stale dictionary" when nothing is
  // stale. Content is what matters here, not bytes.
  const same = (s) => s.replace(/\r\n/g, "\n");
  if (same(current) !== same(out)) {
    console.error(`${OUT} is out of date -- run: node ${SRC.replace("lo.json", "build-lo.js")}`);
    process.exit(1);
  }
  console.log(`${OUT} is up to date (${translated.length}/${total}, ${pct}%)`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out, "utf8");
  console.log(`${OUT}: ${translated.length} of ${total} strings (${pct}%)`);
}

if (orphans.length) {
  console.warn(`\n${orphans.length} translated key(s) no longer exist in en.json:`);
  orphans.slice(0, 10).forEach((k) => console.warn(`  ${k}`));
  if (orphans.length > 10) console.warn(`  ... and ${orphans.length - 10} more`);
  console.warn("Re-run extract-messages.js after an openIMIS upgrade.");
}
