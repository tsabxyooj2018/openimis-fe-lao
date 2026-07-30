# Translations

Paired dictionaries, one file per language, all with the same keys — so any two
can be read side by side for review.

| File | What it is |
|---|---|
| `en.json` | **Generated.** Every English string openIMIS ships (3,352). Do not edit. |
| `fr.json` | **Generated.** The French pack (3,147), as a second reference. Do not edit. |
| `lo.json` | **The file to edit.** Same keys as `en.json`; `""` means not translated yet. |
| `src/lao-language/lo.json` | **Generated** from `lo.json` — what the app imports. |

## Translating

Open `en.json` and `lo.json` side by side. Both are sorted by key, so the lines
line up. Fill in the empty values:

```json
  "insuree.familyName": ""      →      "insuree.familyName": "ນາມສະກຸນ"
```

Leave a value empty if you are unsure. **Empty falls back to English; a wrong
translation does not.** Partial coverage is safe by design — see
`withBaseLanguageFallback` in `src/ModulesManager.js`.

`fr.json` is worth consulting when an English string is ambiguous: the French
pack is complete and was written by people who knew the domain.

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

New strings arrive with new keys. Regenerate the references:

```bash
node lao/translations/extract-messages.js
```

Then add any new keys to `lo.json` as empty values. The build reports keys in
`lo.json` that no longer exist upstream; it never discards them.

### Where en.json comes from

The published modules contain only `dist/index.js` — no translation files, and
the source maps do not carry them either. The strings exist solely as an object
literal inside each bundle, which `extract-messages.js` locates and evaluates.

It has to evaluate rather than parse: rollup leaves keys unquoted where they are
valid identifiers, and splits an imported JSON file into one const per top-level
key. Eight of the thirty modules are therefore not valid JSON and reference
bindings declared elsewhere in the bundle — including `fe-language_fr`, which
holds essentially all of the French.
