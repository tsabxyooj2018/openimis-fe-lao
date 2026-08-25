# Place names in two languages

openIMIS stores **one** name per location. `location_Location.name` holds the
Lao name and there is no second column, so an English interface showed ອັດຕະປື
and ໄຊເຊດຖາ everywhere a place is named.

| File | What it is |
|---|---|
| `build-location-names.js` | **The generator.** Run it after the location tree changes. |
| `src/lao-language/locationNames.json` | **Generated.** Code → `{ en, lo }`, 18 provinces and 148 districts. |
| `src/lao-language/locationNames.js` | The store middleware that applies it. |

## Regenerating

```bash
node lao/locations/build-location-names.js --csv ../openimis/locations-lao.csv
```

The CSV lives in the private deployment repository, which is why its path is an
argument rather than a constant. Add `--wikitext <file>` to parse a saved copy
instead of fetching.

## Where the English comes from

The English Wikipedia article **Districts of Laos** — the same source the Lao
column of `locations-lao.csv` was transcribed from. It carries both scripts in
one table, so the two halves come from one place and cannot drift apart.

Fetched as raw wikitext rather than rendered HTML, and parsed by the script.
Nothing is retyped, and nothing is transliterated: each row is matched to a CSV
row by comparing **the Lao strings**. A district whose Lao does not match is
reported and left untranslated rather than guessed at.

### Matching is scoped by province, and that is not optional

District names repeat across Laos. Viengthong is in both Bolikhamsai and
Houaphanh, Phonthong in Champasak and Luang Prabang, Viengkham in Vientiane and
Luang Prabang. Matching on the district name alone takes whichever province was
read first — silently, and it did: the first version of this script mis-assigned
three provinces and reported success.

So each CSV province is bound to a Wikipedia province first, by counting how many
of its districts overlap, and districts are matched only within that pair. The
script **throws** if a province does not stand clear of the next candidate rather
than publishing a guess.

### Folding

The first three rules are `seed-locations.py`'s `_FOLD`, kept identical
deliberately: the seeder decides whether a place already exists using those
rules, so matching by a different set here would bind English names to codes the
seeder would not.

The fourth is not in the seeder **and should be**. Sign AM has a precomposed
form `ຳ` (U+0EB3) and a written-out form `ໍາ` (U+0ECD U+0EB2) for the same sound,
and Unicode will not fold them — Lao AM has no canonical decomposition, so NFC
and NFD both leave the strings unequal. `locations-lao.csv` writes Viengkham as
`ວຽງຄຳ`; Wikipedia writes `ວຽງຄໍາ`. Without the rule they are two different
districts.

**This is a live bug in the seeder.** A district entered by hand as `ວຽງຄໍາ`
will not match the CSV's `ວຽງຄຳ`, so `seed-locations.py` creates a second copy
instead of recognising it — the duplicate-creation failure the folding exists to
prevent, and the same family as the Thai characters already documented there.

## What needs a human

**HO09.** The CSV spells it `ກອນ`, Wikipedia `ກອັນ` — an extra U+0EB1, a real
spelling difference rather than an encoding one. It is in the `MANUAL` table in
the generator as **Kone**, identified by elimination: Houaphanh has ten districts
in both sources, nine matched on their Lao names, and Kone was the only Wikipedia
row left unclaimed. Sound arithmetic, but it rests on the two spellings being the
same place. Have someone who knows Houaphanh confirm it.

**The source is not authoritative.** Wikipedia is not the Lao Statistics Bureau
and not a ministry establishment list — the same caveat the deployment README
already makes about the Lao names. Three transcription errors were visible on the
page while parsing it: a doubled `ເມືອງເມືອງ`, a `ມືອງ` missing its vowel, and
`Hiam` labelling `ວຽງທອງ`. The first two are worked around; the third means at
least one English name here is questionable. Treat these 166 names as a starting
set, not a verified one, before they appear on anything a member receives.

## How it is applied

A **store middleware**, contributed by the language module and applied after
`redux-api-middleware`, so it sees every API response before any reducer.

There is no single place that renders a location name — `locationLabel` covers
the pickers, then fe-location builds `code - name` inline in half a dozen more
places, fe-insuree has `formatLocationString`, fe-claim has its own. Patching
each means finding them all again after every upgrade, and a missed one is
invisible until somebody notices a screen in the wrong language. The data,
though, arrives through one door.

A location is translated only when **both** its code is known **and** its stored
name still folds equal to the Lao name recorded for that code. Codes get reused
and places get renamed; without the second test this would confidently relabel a
district that had been edited. The worst case is now that a renamed district
stays in Lao — visibly incomplete rather than quietly wrong.

### The record is never translated

The middleware keeps the stored name as `nameLo`, and `lao/apply-overrides.js`
points the Locations edit dialog at it. Without that, opening Attapeu in English
and pressing Save would write `"Attapeu"` into `location_Location.name` and lose
the Lao name for every user in every language, permanently. The build fails if
that patch stops matching.

## What this does not cover

**Anything rendered by the backend.** Reports, and any PDF built server-side,
never see this dictionary — they print the stored Lao name. A screen reading
`Attapeu` beside a report reading `ອັດຕະປື` is the expected result, not a fault.
Fixing that means a second name in the database and a custom backend image; see
`UPGRADING.md` in the deployment repository.

**Locations added after the last regeneration.** They keep their stored name in
every language until the generator is run again.
