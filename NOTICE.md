# Source offer and attribution

This repository is the **Corresponding Source** for the openIMIS frontend running at
<https://www.openimislaos.site>.

It is a modified version of [openimis-fe_js](https://github.com/openimis/openimis-fe_js)
release **26.04**, published here to satisfy **AGPL v3 section 13**, which requires
that users interacting with a modified version over a network be offered its source.

- Upstream project: <https://openimis.org>
- Licence: GNU Affero General Public License v3 — see `GNU AFFERO GENERAL PUBLIC LICENSE.md`
- openIMIS is funded largely by the Swiss Agency for Development and Cooperation (SDC)
  and GIZ, and is recognised as a Digital Public Good.

## What was modified

| Path | Change |
|---|---|
| `src/helpers/theme.js` | Institutional blue palette; Lao-capable fonts ahead of Rubik/Roboto, which do not cover U+0E80–0EFF |
| `src/index.css` | Login screen restyle, scoped with `:has(input[type="password"])`; AGPL credit line |
| `src/translations/ref.json` | `appName` set to the Lao service name |
| `src/helpers/logo.js` | Emblem replaces the openIMIS logo |
| `src/emblem-moh.png` | Added — emblem, downscaled from the source published at fdd.gov.la |
| `openimis.json` | Added the `lo` / `lo-LA` locale |
| `lao/` | Added — bilingual Lao/English login labels and the build step that applies them |
| `Dockerfile` | Pinned `npm@10`; strips CR from the entrypoint; runs the label overrides |
| `.github/workflows/build-fe.yml` | Added — builds and publishes the image to GHCR |
| `openimis.json` | Added the `lo` locale; module list otherwise unchanged |

Upstream's own workflow files were removed: they reference secrets that do not
exist here and would fail on every push.

### The false "Session Expired" dialog

`fe-core`'s API middleware treats any GraphQL error whose message normalises to
`unauthorized` as session expiry, and offers to redirect to the login page.

The grievance module fetches `grievanceConfig` as the app loads, and that
resolver (`grievance_social_protection/schema.py`, `resolve_grievance_config`)
rejects anonymous callers outright. Every visitor therefore met a "Session
Expired" dialog on the login page, before having a session at all.

`lao/apply-overrides.js` requires an authenticated header to be present before
the middleware draws that conclusion. "Unauthorized" only means the session ended
if there was one. Genuine expiry is unaffected.

The module itself was removed for a time as a workaround; it is back, and the
menu with it.

### Two upstream bugs fixed here

**The Dockerfile no longer builds upstream.** It pins `FROM node:20` but installs
`npm@latest`, and npm 12 requires node >= 22. Pinned to the 10.x line.

**A Windows checkout breaks the image.** `script/entrypoint.sh` picks up CRLF
endings, and bash then fails with `syntax error near unexpected token $'do\r'`,
so the container exits on start. Fixed with `.gitattributes` and a `sed` step.

Both are worth reporting upstream.

## Trademarks

AGPL v3 licenses copyright, not trademarks. The openIMIS name and logo are not
licensed by it, and the emblem used here belongs to its owner. This deployment is
not an official openIMIS product and openIMIS does not endorse it.

## What is not here

Deployment configuration — compose files, environment, credentials — lives in a
separate private repository. None of it is part of the Program, so AGPL does not
require its publication.
