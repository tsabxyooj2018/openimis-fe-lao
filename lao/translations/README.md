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

### Worth doing first

`core.*` (235 strings) holds the shared buttons, table controls and dialogs that
appear on every screen, so it buys the most visible change per string. Then the
modules this deployment actually uses: `insuree`, `policy`, `claim`.

The first 92 `core.*` strings are done as a first pass and need review.

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
