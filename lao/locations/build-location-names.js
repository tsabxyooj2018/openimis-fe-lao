/*
 * Build src/lao-language/locationNames.json -- the English names for Lao
 * provinces and districts, keyed by the location code.
 *
 * WHY THIS EXISTS
 *
 * openIMIS stores one name per location. `location_Location.name` holds the Lao
 * name and there is nowhere to put a second one, so switching the interface to
 * English left every province and district in Lao script. This file is the
 * English half, kept outside the database because putting it inside would mean
 * forking the backend.
 *
 * WHERE THE NAMES COME FROM
 *
 * The same source the Lao names came from: the English Wikipedia article
 * "Districts of Laos", which carries both scripts in one table. Fetched as raw
 * wikitext rather than rendered HTML, and parsed here, so no name is ever
 * retyped by hand.
 *
 * MATCHED ON THE LAO STRING, NOT ON A READING OF IT
 *
 * Each row of locations-lao.csv is matched to a Wikipedia row by comparing the
 * Lao names, folded. Nobody transliterates anything: if the Lao does not match,
 * the district is reported and left out rather than guessed at.
 *
 * SCOPED BY PROVINCE, WHICH IS NOT OPTIONAL
 *
 * District names repeat across Laos -- Viengthong is in both Bolikhamsai and
 * Houaphanh, Phonthong in Champasak and Luang Prabang, Viengkham in Vientiane
 * and Luang Prabang. Matching on the district name alone therefore takes
 * whichever province happened to be read first, silently. Each CSV province is
 * bound to a Wikipedia province first, by how many of its districts overlap, and
 * districts are only matched within that pair.
 *
 * USAGE
 *
 *   node lao/locations/build-location-names.js \
 *     --csv ../openimis/locations-lao.csv
 *
 * Add --wikitext <file> to parse a local copy instead of fetching. The CSV lives
 * in the private deployment repository, which is why its path is an argument
 * rather than a constant.
 */
const fs = require("fs");
const path = require("path");

const WIKI_URL =
  "https://en.wikipedia.org/w/index.php?title=Districts_of_Laos&action=raw";
const OUT = path.join(__dirname, "..", "..", "src", "lao-language", "locationNames.json");

/*
 * Lao spellings that render alike but are different strings.
 *
 * The first three are seed-locations.py's _FOLD, kept identical on purpose: the
 * seeder decides whether a place already exists using those rules, so matching
 * by a different set here would bind names to codes the seeder would not.
 *
 * The fourth is not in the seeder and should be. Sign AM has a precomposed form
 * (U+0EB3) and a written-out form (U+0ECD U+0EB2) for the same sound, and
 * Unicode will not fold them for you -- Lao AM has no canonical decomposition,
 * so NFC and NFD both leave the two strings unequal. locations-lao.csv writes
 * Viengkham as ວຽງຄຳ and Wikipedia writes it ວຽງຄໍາ; without this rule they are
 * two different districts.
 */
const FOLD = [
  ["ຫລ", "ຫຼ"],
  ["ຫນ", "ໜ"],
  ["ຫມ", "ໝ"],
  ["ໍາ", "ຳ"],
];

/*
 * "muang" and "khoueng" -- district and province -- which Wikipedia prefixes to
 * the Lao name and the CSV does not. The third is a typo on the page: one row
 * writes muang without its leading vowel. One other row doubles the prefix,
 * which is why stripping repeats until nothing changes.
 */
const PREFIXES = ["ເມືອງ", "ແຂວງ", "ມືອງ"];

function norm(value) {
  let text = (value || "").normalize("NFC").trim();
  for (const [from, to] of FOLD) text = text.split(from).join(to);
  for (let again = true; again; ) {
    again = false;
    for (const p of PREFIXES) {
      if (text.startsWith(p)) {
        text = text.slice(p.length);
        again = true;
      }
    }
  }
  return text.replace(/\s+/g, "");
}

function cleanEnglish(s) {
  return s
    .replace(/\{\{small\|.*?\}\}/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/'''|''/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+District$/, "")
    .replace(/\s+Province$/, "")
    .trim();
}

/*
 * Names Wikipedia spells differently enough that the fold cannot reach them.
 * Each one is a deliberate decision, recorded here rather than made silently by
 * a looser comparison -- a fuzzy match that catches this would also match
 * genuinely different places.
 */
const MANUAL = {
  // locations-lao.csv has ກອນ, Wikipedia ກອັນ -- an extra U+0EB1, a real
  // spelling difference rather than an encoding one. Identified by elimination:
  // Houaphanh has ten districts in both sources, nine matched on their Lao
  // names, and Kone was the only Wikipedia row left unclaimed. Sound, but it
  // rests on the two spellings being the same place. Have someone who knows
  // Houaphanh confirm it.
  HO09: "Kone",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
  return args;
}

async function readWikitext(local) {
  if (local) return fs.readFileSync(local, "utf-8");
  const res = await fetch(WIKI_URL, {
    headers: { "User-Agent": "openimis-fe-lao location-names builder" },
  });
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status} ${res.statusText}`);
  return res.text();
}

function parseWikitext(text) {
  const rows = [];
  let cur = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("|-")) {
      if (cur.length >= 4) rows.push(cur);
      cur = [];
    } else if (line.startsWith("|") && !line.startsWith("|}")) {
      cur.push(line.slice(1).trim());
    }
  }
  if (cur.length >= 4) rows.push(cur);

  const byProvince = new Map();
  for (const row of rows) {
    const lao = /\{\{lang\|lo\|([^}|]*)/.exec(row[2]);
    if (!lao) continue;
    const province = cleanEnglish(row[3]);
    if (!byProvince.has(province)) byProvince.set(province, new Map());
    byProvince.get(province).set(norm(lao[1]), cleanEnglish(row[1]));
  }
  return byProvince;
}

function readCsv(file) {
  const provinces = new Map();
  for (const raw of fs.readFileSync(file, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("province_code")) continue;
    const parts = line.split(",");
    if (parts.length !== 4) continue;
    const [pc, pn, dc, dn] = parts;
    if (!provinces.has(pc)) provinces.set(pc, { lao: pn, districts: [] });
    provinces.get(pc).districts.push({ code: dc, lao: dn });
  }
  return provinces;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.csv) {
    console.error("usage: node lao/locations/build-location-names.js --csv <locations-lao.csv> [--wikitext <file>]");
    process.exit(1);
  }

  const wiki = parseWikitext(await readWikitext(args.wikitext));
  const csv = readCsv(args.csv);

  const out = {};
  const unmatched = [];
  let districts = 0;

  for (const [code, province] of [...csv.entries()].sort()) {
    const mine = new Set(province.districts.map((d) => norm(d.lao)));

    // Bind this province to a Wikipedia province by district overlap.
    const scored = [...wiki.entries()]
      .map(([name, ds]) => [[...mine].filter((d) => ds.has(d)).length, name])
      .sort((a, b) => b[0] - a[0]);
    const [best, bestName] = scored[0];
    const [runnerUp] = scored[1] || [0];

    // A province that does not stand clear of the next candidate has not been
    // identified, it has been guessed. Refuse rather than publish a guess.
    if (best === 0 || best === runnerUp) {
      throw new Error(
        `province ${code} could not be identified: best ${bestName} (${best}) ` +
          `is not clear of the next candidate (${runnerUp})`,
      );
    }

    out[code] = { en: bestName, lo: province.lao };
    for (const d of province.districts) {
      const en = wiki.get(bestName).get(norm(d.lao)) || MANUAL[d.code];
      if (en) {
        out[d.code] = { en, lo: d.lao };
        districts += 1;
      } else {
        unmatched.push(`${d.code} ${d.lao} (${code} / ${bestName})`);
      }
    }
  }

  const total = [...csv.values()].reduce((n, p) => n + p.districts.length, 0);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf-8");

  console.log(`provinces: ${csv.size}`);
  console.log(`districts: ${districts} / ${total}`);
  if (unmatched.length) {
    console.log("\nno Lao match, left untranslated:");
    unmatched.forEach((u) => console.log(`  ${u}`));
  }
  console.log(`\nwrote ${path.relative(process.cwd(), OUT)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
