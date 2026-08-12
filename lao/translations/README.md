# Lao translation

Only Lao lives here. English and French ship with openIMIS and are not ours to
copy or maintain — keeping our own versions would duplicate data we do not own
and go stale at every upgrade.

| File | What it is |
|---|---|
| `lo.json` | **The file to edit.** Every key openIMIS has, with the English text alongside. |
| `src/lao-language/lo.json` | **Generated** from `lo.json` — what the app imports. |

## Translating

Each entry carries its English text, so the pair is one line and there is no
second file to keep aligned:

```json
  "insuree.familyName": { "en": "Family Name", "lo": "" }
                                                     ↓
  "insuree.familyName": { "en": "Family Name", "lo": "ນາມສະກຸນ" }
```

Only ever edit `"lo"`. `"en"` is a copy of upstream, refreshed by the extractor;
editing it changes nothing in the application.

Leave a value empty if you are unsure. **Empty falls back to English; a wrong
translation does not.** Partial coverage is safe by design — see
`withBaseLanguageFallback` in `src/ModulesManager.js`.

### Placeholders must survive

`{code}`, `{name}`, `{rolesTotalCount}` are substituted at runtime. Keep them
exactly, braces included — a renamed placeholder renders literally.

```json
"Delete program {code} {name}"      →      "ລຶບໂຄງການ {code} {name}"
```

Word order may change freely; the names may not.

### Agree the vocabulary first

This is domain translation, not language translation. *Insuree*, *Batch Run*,
*Capitation Payment*, *Contribution Plan Bundle*, *Deductible* recur across
hundreds of strings and need to match what Lao health-insurance staff and
ministry documents already use. Settle those terms before bulk work — a
consistent glossary matters more than speed, and changing a term later means
revisiting every entry that used it.

## Status

3,605 of 3,669 translated. The 26 entries still empty are that way on purpose:

| | |
|---|---|
| `*.export.*` (14) | CSV column headers and export filenames — `first_name`, `beneficiaries_export`. Read by spreadsheets and scripts, not by people. |
| `socialProtection.benefitPlan.jsonExt` | A database column name shown verbatim. |
| `currency` | Set to `LAK` in `src/translations/ref.json`, not here. The deployment's currency is kip whatever language the interface is in, so a Lao-only override would imply a French-speaking user in Laos sees different money. |
| `policyHolder.*Validation.regexMsg.{en,fr}` (10) | Indexed at runtime by `intl.locale`, which `openimis.json` sets to `en-GB` / `fr-FR` / `lo-LA`. `regexMsg["en-GB"]` is already undefined, so these render in no language including English. A Lao value would not appear; fixing them means changing module config, not this file. |

Coverage is therefore complete for everything a user reads.

## After editing

```bash
node lao/translations/build-lo.js
```

That writes `src/lao-language/lo.json` with the empty entries removed, and
reports coverage. Commit both files. The Docker build runs it with `--check` and
**fails** if they have drifted, so a stale dictionary cannot ship.

Removing the empties is the point: an empty string is a valid translation as far
as react-intl is concerned, so shipping the working file as-is would render most
of the interface blank. Only an absent key falls through to English.

## Consistency checks

```bash
node lao/translations/check-lo.js
```

Three things that are easy to get wrong by hand and impossible to see by reading:

- **Placeholder drift** — a dropped `{code}` leaves a blank where a claim number
  should be; an invented one throws at render.
- **Thai characters in Lao text** — separate Unicode blocks that look alike, so a
  stray Thai codepoint renders as a wrong-but-plausible letter.
- **One English string rendered two ways** — openIMIS repeats labels across
  modules, and translating each occurrence independently makes one interface look
  like two.

The third has an allowlist in the script for genuine homographs and for upstream
labelling bugs Lao deliberately does not carry over — `Schema` on the price-list
origin, a show/hide toggle whose two states share one English string, a reject
button carrying a tab's title. Each entry states its reason. The default answer
to a collision is to harmonise it, not to add it there.

## Checking the menus

```bash
node lao/translations/menu-coverage.js
```

Lists any sidebar label still in English. Do not look for these by searching the
dictionary for keys containing `menu` — that misses whole groups.
`fe-opensearch_reports` names its entries `openSearchReports.openSearch.*` and
`fe-tasks_management` uses `tasksManagement.entries.*`, so the Dashboards group
and two Tasks entries stayed English twice with nothing to show it. The script
reads the `MainMenuContribution` call in each module instead of guessing.

Not wired into the build: partial translation is normal here, and failing every
build over it would be wrong.

## After an openIMIS upgrade

```bash
node lao/translations/extract-messages.js
```

Adds new keys as untranslated, refreshes English wording that changed, and
reports both. Existing Lao is never touched. Keys that disappeared upstream are
left in place and listed, rather than deleted — upstream sometimes moves a key
between modules, and discarding someone's work over that is not recoverable.

Run `build-lo.js` afterwards and commit both files.

### Where the English text comes from

The published modules contain only `dist/index.js` — no translation files, and
the source maps do not carry them either. The strings exist solely as an object
literal inside each bundle, which `extract-messages.js` locates and evaluates.

It has to evaluate rather than parse: rollup leaves keys unquoted where they are
valid identifiers, and splits an imported JSON file into one const per top-level
key. Eight of the thirty modules are therefore not valid JSON and reference
bindings declared elsewhere in the bundle. Parsing them as JSON reads 2,020
strings and skips those eight silently; resolving the references reads all
thirty, for 3,352.

If a module cannot be read, the script refuses to rewrite `lo.json` at all — a
partial read would look exactly like keys being removed upstream.
