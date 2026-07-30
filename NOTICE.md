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
| `openimis.json` | Removed `GrievanceSocialProtectionModule` — see below |

Upstream's own workflow files were removed: they reference secrets that do not
exist here and would fail on every push.

### Grievance module removed

The module queries `grievanceConfig` as the app loads. Its backend resolver
(`grievance_social_protection/schema.py`, `resolve_grievance_config`) raises
`PermissionDenied("unauthorized")` for anonymous users, and `fe-core` treats any
`unauthorized` GraphQL error as session expiry — so every visitor met a
"Session Expired" dialog on the login page before they had a session at all.

Restore the entry in `openimis.json` once the backend permits anonymous access to
that config, or once the query is deferred until after sign-in. The grievance
backend module is unaffected and still present in the stock backend image.

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
