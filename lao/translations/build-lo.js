#!/usr/bin/env node
/*
 * Turns the translator's file into the one the application imports.
 *
 * lao/translations/lo.json holds every key openIMIS has, each with the English
 * text for context and a Lao value that starts empty:
 *
 *   "insuree.familyName": { "en": "Family Name", "lo": "ນາມສະກຸນ" }
 *
 * English sits inline rather than in a companion en.json so that nothing in
 * this repository claims to own the English or French dictionaries -- those
 * ship with openIMIS and are not ours to keep a copy of. It also removes the
 * failure mode of two files drifting out of alignment: the pair is one line.
 *
 * src/lao-language/lo.json is the build product: the Lao values only, with the
 * empty ones dropped. Dropping them is the whole point -- an empty string is a
 * perfectly valid translation as far as react-intl is concerned, so shipping
 * the working file as-is would render most of the interface BLANK, which is
 * worse than the raw message keys that prompted the English fallback in
 * src/ModulesManager.js. Only an ABSENT key falls through to English.
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
const OUT = path.join("src", "lao-language", "lo.json");
const check = process.argv.includes("--check");

const source = JSON.parse(fs.readFileSync(SRC, "utf8"));

const entries = Object.entries(source);
const malformed = entries.filter(([, v]) => !v || typeof v !== "object" || !("lo" in v));
if (malformed.length) {
  console.error(`${SRC}: ${malformed.length} entr(ies) are not { en, lo } objects, e.g.`);
  malformed.slice(0, 5).forEach(([k]) => console.error(`  ${k}`));
  process.exit(1);
}

const translated = entries
  .filter(([, v]) => typeof v.lo === "string" && v.lo.trim() !== "")
  .sort(([a], [b]) => a.localeCompare(b));

const out = `${JSON.stringify(Object.fromEntries(translated.map(([k, v]) => [k, v.lo])), null, 2)}\n`;
const pct = entries.length ? ((translated.length / entries.length) * 100).toFixed(1) : "0.0";

if (check) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  // Compared with line endings normalised: a Windows checkout stores CRLF, and
  // failing the build over that would say "stale dictionary" when nothing is
  // stale. Content is what matters here, not bytes.
  const same = (s) => s.replace(/\r\n/g, "\n");
  if (same(current) !== same(out)) {
    console.error(`${OUT} is out of date -- run: node lao/translations/build-lo.js`);
    process.exit(1);
  }
  console.log(`${OUT} is up to date (${translated.length}/${entries.length}, ${pct}%)`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out, "utf8");
  console.log(`${OUT}: ${translated.length} of ${entries.length} strings (${pct}%)`);
}
