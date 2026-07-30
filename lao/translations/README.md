# Lao translation

`openimis-strings.csv` holds every translatable string in this deployment —
**2,928 strings across 29 modules**, extracted from the built bundle.

| Column | Meaning |
|---|---|
| `module` | which openIMIS module the string belongs to |
| `key` | the translation key; **do not change this** |
| `english` | the string as it appears today |
| `lao` | **fill this in** — leave blank to keep English |
| `priority` | `1` = seen constantly (menus, buttons, labels, column headers), `2` = the rest |

## How to work through it

Open it in Excel or LibreOffice, **filter `priority = 1`**, and fill the `lao`
column. That is 1,564 strings, and it covers what staff actually read. The
remaining 1,364 are error messages, rarely-used dialogs and edge cases; they can
follow later or stay in English indefinitely.

Blank rows are safe. Anything without a Lao value falls back to English, so the
file can be delivered in stages — there is no need to finish before shipping.

Suggested order, heaviest first:

| Module | priority-1 strings |
|---|---:|
| claim | 207 |
| insuree | 139 |
| socialProtection | 115 |
| payroll | 105 |
| core | 92 |
| policy | 83 |

`core` is worth doing first despite not being the largest: it holds the shared
buttons, table controls and dialogs that appear on every screen.

## Terminology

This is domain translation, not language translation. Terms like *Batch Run*,
*Capitation Payment*, *Contribution Plan Bundle* and *Deductible* need to match
what Lao health-insurance staff and ministry documents already use. Agree those
before bulk work starts — a consistent glossary matters more than speed, and
changing a term later means revisiting every row that used it.

## Saving

Save as **CSV UTF-8**. Excel's plain "CSV" on a Windows machine writes the
system codepage and will mangle Lao script.

## Where the finished translations live

`src/lao-language/lo.json` — **not** in this directory. Create React App refuses
imports from outside `src/`, so the dictionary the build consumes must sit there.
This folder holds the working spreadsheet only.

`core` (92 strings) is already done as a first pass and needs review.

## Then

Hand the file back and it gets merged into `src/lao-language/lo.json`. Nothing else needs to
change: the `lo` locale is already registered in `openimis.json`, Lao is already
in `tblLanguages`, and the language switcher already works.
