/*
 * Apply Lao deployment label overrides to the installed @openimis/fe-core.
 *
 * Why patch the compiled bundle:
 *
 *  - fe-core is published with "main": "dist/index.js" and
 *    "module": "dist/index.es.js". Its src/translations/en.json ships in the
 *    package but is NOT what gets imported, so editing it has no effect.
 *  - formatMessage only looks up `${module}.${id}` then `${id}`
 *    (src/helpers/i18n.js). There is no `overwrite.*` tier, despite i18n.md.
 *  - App.js merges dictionaries as `{ ...messages, ...msgs }`, so module
 *    contributions always beat the assembly's `messages` prop -- root
 *    translations in src/translations/ref.json cannot win.
 *  - modules-config.js rewrites package.json, deleting every `@openimis/*`
 *    dependency and re-adding it from openimis.json, so an unpublished local
 *    language-pack module cannot be referenced without also patching it.
 *
 * Each key must already exist, so a value that upstream renames fails the
 * build loudly instead of silently producing an unbranded image.
 *
 * Run after `npm install` and before `npm run build`.
 */
const fs = require("fs");
const path = require("path");

const PKG = path.join(__dirname, "..", "node_modules", "@openimis", "fe-core");
const TARGETS = ["dist/index.js", "dist/index.es.js"];
const overrides = JSON.parse(fs.readFileSync(path.join(__dirname, "login-overrides.en.json"), "utf-8"));

if (!fs.existsSync(PKG)) {
  console.error(`@openimis/fe-core not found at ${PKG} - did npm install run?`);
  process.exit(1);
}

/*
 * Give each sidebar group a stable, language-independent hook.
 *
 * fe-core builds the accordion id from the group's *translated* heading:
 *
 *   id: "".concat(_this.props.header, "-header")
 *
 * so the only handle the DOM offers changes with the language. Styling keyed on
 * it -- the group icons, and the Profile block pinned to the bottom of the
 * sidebar -- worked in English and silently stopped matching in French and Lao,
 * because "Social Protection" became "Protection sociale".
 *
 * menuId is already passed to this component by every module that contributes a
 * menu (BenefitPlanMainMenu, ProfileMainMenu, TasksMainMenu, ...) and is a
 * constant in the module's source, so it does not translate. Emitting it as a
 * data attribute gives CSS something that holds in every language.
 *
 * A prop that is undefined renders no attribute at all in React, so a module
 * that passes no menuId is unaffected rather than gaining an empty one.
 */
const STABLE_MENU_ID = {
  find: 'id: "".concat(_this.props.header, "-header")',
  replace: 'id: "".concat(_this.props.header, "-header"), "data-menu-id": _this.props.menuId',
};

/*
 * The same problem in the toolbar.
 *
 * fe-core renders the logout and documentation buttons as
 *
 *   <Tooltip title={formatMessage("core.tooltip.logout")}><IconButton>...
 *
 * and MUI forwards that tooltip down to the DOM `title`. So the only attribute
 * distinguishing them is the TRANSLATED text: title="Log out" in English,
 * something else in Lao. The rules that move logout to the foot of the sidebar
 * and hide the documentation "?" therefore applied in English only -- which is
 * why both reappeared, in their original places, as soon as the language changed.
 *
 * There is no id, no name and no stable class to key on; the two buttons differ
 * solely by their icon component. So the icon is what identifies them, and the
 * patch stamps an explicit action attribute for the stylesheet to use.
 *
 * Written tolerantly because the two published bundles differ in form:
 *
 *   index.es.js  React.createElement(IconButton, {...}, React.createElement(ExitToApp
 *   index.js     React__default["default"].createElement(core.IconButton, {...}, ...Icons.ExitToApp
 */
const TOOLBAR_ACTIONS = [
  { icon: "ExitToApp", action: "logout" },
  { icon: "HelpOutline", action: "help" },
];

/*
 * Do not announce "Session Expired" to someone who never had a session.
 *
 * fe-core's API middleware treats ANY GraphQL error whose message normalises to
 * "unauthorized" as session expiry, and offers to redirect to the login page:
 *
 *   csrfError = gqlErrors.some(e => { const msg = norm(e?.message);
 *     return msg === "csrftoken" || msg === "user not authorized for this
 *            operation" || msg === "unauthorized"; });
 *   if (csrfError) dispatch(coreConfirm("Session Expired", ...))
 *
 * The grievance module fetches grievanceConfig as the app loads, and that
 * resolver rejects anonymous callers outright:
 *
 *   grievance_social_protection/schema.py  resolve_grievance_config()
 *     if type(user) is AnonymousUser: raise PermissionDenied(_("unauthorized"))
 *
 * so every visitor met a Session Expired dialog on the login page, before
 * having a session at all. The module was removed to stop it; this fixes the
 * cause instead, so the Grievance menu can come back.
 *
 * "Unauthorized" only means the session ended if there WAS one. The header is
 * the test: fe-core renders it only for an authenticated user, which is the
 * same signal src/index.css uses to scope the login page. It is read when the
 * error arrives rather than at mount, so it reflects the state at that moment.
 *
 * Genuine expiry is untouched -- the header is present then, and the dialog
 * still appears.
 */
/*
 * Keep the sidebar group open for the page you are on.
 *
 * Clicking an entry collapsed its group. Not because the entry toggles it -- in
 * the drawer variant onClick only redirects -- but because fetchSubmenuConfig
 * builds a NEW component function on every render:
 *
 *   return { ...menu, component: function (props) { ... } }
 *
 * A new function is a new component type to React, so the whole menu is
 * unmounted and remounted on every navigation, and the constructor resets
 * `expanded: props.isInitiallyOpen || false`.
 *
 * fe-core does have an intended answer -- isInitiallyOpen is set for the group
 * matching activeMenuId -- but only when getConf("fe-core", "menus") is
 * populated, and populating it is a trap: once non-empty, filterNoConfig drops
 * every menu absent from it and fetchSubmenuConfig drops every entry without an
 * explicit position. A partial config silently hides menus, and it would need
 * revisiting on each upgrade of all thirty-one modules.
 *
 * So the initial state is derived from the location instead, using fe-core's own
 * menuEntryMatchesLocationPath -- the same test it already uses to mark the
 * entry selected. Since the component remounts on every navigation, this is
 * recomputed each time: the group owning the current page opens, the others
 * close. Collapsing one by hand still works and lasts until the next
 * navigation, because this only affects the initial state.
 *
 * Profile is excluded. It is the same kind of group, but src/index.css renders
 * it as the toolbar dropdown rather than a sidebar section, so opening it for
 * the current page would leave that menu hanging over the screen every time
 * someone lands on My Profile or Change Password.
 */
const KEEP_ACTIVE_GROUP_OPEN = {
  find: "expanded: props.isInitiallyOpen || false",
  replace:
    'expanded: props.isInitiallyOpen || (props.menuId !== "ProfileMainMenu" ' +
    "&& (props.entries || []).some(menuEntryMatchesLocationPath)) || false",
};

const SESSION_EXPIRY_GUARD = {
  find: "csrfError = gqlErrors.some(function (e) {",
  replace: 'csrfError = !!document.querySelector("header") && gqlErrors.some(function (e) {',
};

const toolbarPattern = (icon) =>
  new RegExp(
    `(createElement\\((?:[\\w$."\\[\\]]+\\.)?IconButton,\\s*\\{)([^{}]*)(\\}\\s*,\\s*(?:/\\*#__PURE__\\*/\\s*)?[\\w$."\\[\\]]+\\.createElement\\((?:[\\w$."\\[\\]]+\\.)?${icon}\\b)`,
    "g",
  );

const totals = {};
let filesPatched = 0;
let menuIdPatched = 0;
let guardPatched = 0;
let keepOpenPatched = 0;
const toolbarHits = {};

for (const rel of TARGETS) {
  const file = path.join(PKG, rel);
  if (!fs.existsSync(file)) {
    console.log(`  ${rel}: absent, skipped`);
    continue;
  }

  let source = fs.readFileSync(file, "utf-8");
  let replacedHere = 0;

  for (const [key, value] of Object.entries(overrides)) {
    // Match "<key>" : "<any string literal>" and swap only the value.
    const pattern = new RegExp(
      `("${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`,
      "g",
    );
    let hits = 0;
    source = source.replace(pattern, (_m, prefix) => {
      hits += 1;
      return prefix + JSON.stringify(value);
    });
    totals[key] = (totals[key] || 0) + hits;
    replacedHere += hits;
  }

  const already = source.includes(STABLE_MENU_ID.replace);
  const menuIdHits = already ? 0 : source.split(STABLE_MENU_ID.find).length - 1;
  if (menuIdHits) source = source.split(STABLE_MENU_ID.find).join(STABLE_MENU_ID.replace);
  menuIdPatched += menuIdHits || (already ? 1 : 0);

  const keptOpen = source.includes(KEEP_ACTIVE_GROUP_OPEN.replace);
  const openHits = keptOpen ? 0 : source.split(KEEP_ACTIVE_GROUP_OPEN.find).length - 1;
  if (openHits) {
    source = source.split(KEEP_ACTIVE_GROUP_OPEN.find).join(KEEP_ACTIVE_GROUP_OPEN.replace);
  }
  keepOpenPatched += openHits || (keptOpen ? 1 : 0);

  const guarded = source.includes(SESSION_EXPIRY_GUARD.replace);
  const guardHits = guarded ? 0 : source.split(SESSION_EXPIRY_GUARD.find).length - 1;
  if (guardHits) source = source.split(SESSION_EXPIRY_GUARD.find).join(SESSION_EXPIRY_GUARD.replace);
  guardPatched += guardHits || (guarded ? 1 : 0);

  const actions = [];
  for (const { icon, action } of TOOLBAR_ACTIONS) {
    const marker = `"data-toolbar-action": "${action}"`;
    if (source.includes(marker)) {
      toolbarHits[action] = (toolbarHits[action] || 0) + 1;
      actions.push(`${action}(already)`);
      continue;
    }
    let hits = 0;
    source = source.replace(toolbarPattern(icon), (_m, open, props, tail) => {
      hits += 1;
      const sep = props.trim() ? `${props.replace(/,\s*$/, "")},\n    ` : "";
      return `${open}${sep}${marker}${tail}`;
    });
    toolbarHits[action] = (toolbarHits[action] || 0) + hits;
    actions.push(`${action}=${hits}`);
  }

  fs.writeFileSync(file, source, "utf-8");
  filesPatched += 1;
  console.log(
    `  ${rel}: ${replacedHere} replacements, ` +
      `data-menu-id ${menuIdHits || (already ? "(already present)" : "NOT FOUND")}, ` +
      `toolbar ${actions.join(" ")}, ` +
      `session-guard ${guardHits || (guarded ? "(already present)" : "NOT FOUND")}, ` +
      `keep-open ${openHits || (keptOpen ? "(already present)" : "NOT FOUND")}`,
  );
}

if (filesPatched === 0) {
  console.error("no fe-core dist bundle found to patch");
  process.exit(1);
}

const unstamped = TOOLBAR_ACTIONS.filter(({ action }) => !toolbarHits[action]);
if (unstamped.length) {
  console.error("\ncould not stamp these toolbar buttons:");
  unstamped.forEach(({ icon, action }) => console.error(`  ${action} (looked for the ${icon} icon)`));
  console.error("fe-core has changed how the toolbar is built; src/index.css needs a new hook.");
  process.exit(1);
}

if (keepOpenPatched === 0) {
  console.error("\ncould not keep the active sidebar group open: fe-core no longer initialises");
  console.error("expanded from props.isInitiallyOpen. Groups will collapse on every navigation.");
  process.exit(1);
}

if (guardPatched === 0) {
  console.error("\ncould not guard the Session Expired dialog: fe-core no longer builds csrfError");
  console.error("the same way. Anonymous visitors may see a false session-expiry prompt.");
  process.exit(1);
}

// Fail loudly rather than ship a sidebar that looks right in English only.
if (menuIdPatched === 0) {
  console.error("\ncould not add data-menu-id: fe-core no longer builds the accordion id from");
  console.error("props.header, so the sidebar styling needs a new hook. See lao/apply-overrides.js.");
  process.exit(1);
}

/*
 * Do not load the dashboard iframe before its URL is known.
 *
 * fe-opensearch_reports builds the src unconditionally:
 *
 *   var dashboardUrl = props.dashboardUrl;
 *   <iframe src={"https://" + host + "/opensearch/" + dashboardUrl}>
 *
 * and the page passes `dashboard?.url`, which is undefined until the record
 * arrives from the API. So every report page first fetched
 * /opensearch/undefined and displayed OpenSearch's raw error to the user --
 *
 *   {"statusCode":404,"error":"Not Found","message":"Not Found"}
 *
 * -- before replacing it with the real dashboard a moment later. Rendering
 * nothing until the URL exists shows an empty panel for that moment instead.
 */
const REPORTS_PKG = path.join(__dirname, "..", "node_modules", "@openimis", "fe-opensearch_reports");
const DEFER_IFRAME = {
  find: "var dashboardUrl = props.dashboardUrl;",
  replace: "var dashboardUrl = props.dashboardUrl;\n  if (!dashboardUrl) return null;",
};

let iframePatched = 0;
if (fs.existsSync(REPORTS_PKG)) {
  for (const rel of TARGETS) {
    const file = path.join(REPORTS_PKG, rel);
    if (!fs.existsSync(file)) continue;
    let src = fs.readFileSync(file, "utf-8");
    if (src.includes(DEFER_IFRAME.replace)) {
      iframePatched += 1;
      console.log(`  fe-opensearch_reports/${rel}: iframe guard (already present)`);
      continue;
    }
    const hits = src.split(DEFER_IFRAME.find).length - 1;
    if (hits) {
      src = src.split(DEFER_IFRAME.find).join(DEFER_IFRAME.replace);
      fs.writeFileSync(file, src, "utf-8");
      iframePatched += hits;
    }
    console.log(`  fe-opensearch_reports/${rel}: iframe guard ${hits || "NOT FOUND"}`);
  }
  if (iframePatched === 0) {
    console.error("\ncould not defer the dashboard iframe: fe-opensearch_reports no longer reads");
    console.error("props.dashboardUrl that way. Report pages will flash an OpenSearch 404.");
    process.exit(1);
  }
} else {
  console.log("  @openimis/fe-opensearch_reports absent, iframe guard skipped");
}

const missing = Object.keys(overrides).filter((k) => !totals[k]);
if (missing.length) {
  console.error("\nThese keys were not found in fe-core - upstream may have renamed them:");
  missing.forEach((k) => console.error(`  ${k}`));
  process.exit(1);
}

console.log(`Lao login overrides applied: ${Object.keys(overrides).length} keys across ${filesPatched} bundle(s).`);
