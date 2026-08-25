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

/*
 * Let a picker open again after its value has been cleared.
 *
 * Clicking the X on the Province picker emptied the field and then left the
 * dropdown unopenable: clicking it again produced nothing at all, and only a
 * full page reload brought the list back. Every AutoSuggestion picker has this,
 * not just the location ones -- profession, relation, education, identification
 * type, insuree officer, authority.
 *
 * AutoSuggestion decides whether to open with
 *
 *   _shouldRenderSuggestions = function () {
 *     return _this.state.value !== _this.state.selected;
 *   }
 *
 * whose intent is "do not re-open the list on the value we just chose". Its
 * initial state is
 *
 *   INIT_STATE = { value: "", suggestions: [], selected: null }
 *
 * and "" !== null, so a freshly mounted picker opens. onClear then sets
 *
 *   { value: null, selected: null }
 *
 * and null !== null is false. The test can never pass again for the life of the
 * component, which is exactly why reloading the page fixes it and nothing else
 * does -- the constructor puts INIT_STATE back.
 *
 * So clear to "" rather than null: the same state the component mounts in,
 * reached by the same route. Nothing else in the component distinguishes the
 * two. renderAutoselect passes `value ?? ""` to the input, and the select/
 * autoselect branch in render() tests `!value`, so both are falsy and both
 * render an empty box.
 *
 * The alternative -- making _shouldRenderSuggestions always true -- would also
 * reopen the list immediately after picking something, which is the behaviour
 * upstream deliberately wrote that test to prevent.
 *
 * TWO PLACES SET IT, AND FIXING ONLY onClear FIXES ONLY THE SECOND CLICK.
 *
 * onClear is not the end of the story. It runs props.onClear(), which for a
 * location picker is RegionPicker.onSuggestionSelected -- that calls onChange,
 * the filter above drops the value, and AutoSuggestion is re-rendered with a
 * `value` prop that has gone from the chosen region to undefined. So
 * componentDidUpdate fires, sees prevProps.value !== this.props.value, and runs
 *
 *   value:    props.value ? props.getSuggestionValue(props.value) : null,
 *   selected: props.value ? props.getSuggestionValue(props.value) : null
 *
 * putting both back to null a tick after onClear had separated them.
 *
 * This is exactly the shape of the symptom. Clear once: onClear separates them,
 * componentDidUpdate re-joins them, the box is dead. Clear a SECOND time:
 * onClear separates them again, but props.value is already undefined so
 * isEqual(prev, next) holds, componentDidUpdate does not fire, and the picker
 * opens. Two clicks on the X to reach a list that one click should have shown.
 *
 * Both branches of componentDidUpdate are patched -- the reset branch and the
 * value-changed branch -- because a programmatic reset strands the picker the
 * same way. Only the `value:` line moves; `selected:` keeps its null, since it
 * is the pair being unequal that opens the list. The trailing comma in the find
 * string is what keeps it off the selected: line, which has none.
 */
/*
 * Never let a translated place name be saved back as the place name.
 *
 * src/lao-language/locationNames.js rewrites location names to English when the
 * interface is in English, in a store middleware -- so every screen that names a
 * place is right without patching each one. The Locations screen, though, does
 * not only display those names: its edit dialog loads the location into a form
 * and writes what is in that form back to the database. Left alone, opening
 * Attapeu in English and pressing Save would replace ອັດຕະປື in
 * location_Location.name with "Attapeu", for every user and every language,
 * permanently.
 *
 * The middleware keeps the stored name as `nameLo` for exactly this. The dialog
 * edits that instead, so the box shows what is really in the database and Save
 * writes back what it read. Display is translated; the record is not.
 *
 * Only the dialog's own copy is changed, so the list behind it stays in the
 * interface language.
 *
 * `nameLo` is absent when the interface is in Lao, when the name is one this
 * deployment has no English for, and on every location added after the
 * dictionary was built -- so the fallback is the ordinary path, not the
 * exception.
 */
/*
 * Show prices in kip, on the two screens that print them raw.
 *
 * Medical Services and Medical Items list a Price column reading 400.00 and
 * 42000.00 -- two decimals the kip does not have, no thousands grouping, and no
 * currency at all. A four-hundred-kip consultation and a forty-two-thousand-kip
 * operation are hard to tell apart at a glance when neither is grouped.
 *
 * fe-core.numberOfDecimals is already 0 in this deployment's configuration and
 * makes no difference here, because these two searchers never ask for it. Their
 * formatter is the whole of:
 *
 *   function (ms) { return ms.price; }
 *
 * so what reaches the screen is whatever the API serialised the Decimal as.
 *
 * WHY THIS IS INLINED RATHER THAN CALLING fe-core
 *
 * fe-core exports formatAmount, which does exactly this and reads the same two
 * configuration keys. It cannot be called from here: fe-medical's ES bundle
 * imports fe-core by named import and formatAmount is not among the names it
 * imports, so a bare call would be a ReferenceError -- and a patch on a built
 * bundle cannot add an import. The CJS bundle never references it either.
 *
 * So the body below mirrors fe-core's formatAmount deliberately: the same
 * getConf keys with the same defaults, the same Intl call, the same currency
 * message. If upstream changes how amounts are formatted, this will not follow,
 * which is the cost of the copy and is recorded here so it is not a surprise.
 *
 * Both occurrences are replaced: one is the services searcher, one the items
 * searcher, and both columns are money.
 *
 * `currency` resolves through src/translations/ref.json, where it is LAK.
 * modulesManager and intl are both on props in each searcher, checked rather
 * than assumed.
 */
const PRICE_IN_KIP = {
  what: "prices in kip",
  find: "        return ms.price;",
  replace: [
    "        return _this.props.intl.formatMessage({ id: \"currency\" }) + \" \" +",
    "          new Intl.NumberFormat(",
    "            _this.props.modulesManager.getConf(\"fe-core\", \"thousandSeparator\", \"en\") || \"en\",",
    "            {",
    "              minimumFractionDigits: _this.props.modulesManager.getConf(\"fe-core\", \"numberOfDecimals\", 2),",
    "              maximumFractionDigits: _this.props.modulesManager.getConf(\"fe-core\", \"numberOfDecimals\", 2),",
    "            },",
    "          ).format(Number(ms.price) || 0);",
  ].join("\n"),
  whenMissing: [
    "could not format the medical price columns: fe-medical no longer returns",
    "ms.price raw from its searcher formatters. Either upstream now formats them",
    "-- check that Medical Services shows LAK 42,000 rather than 42000.00 -- or",
    "the patch needs rewriting.",
  ],
};

const REOPEN_AFTER_CLEAR = [
  {
    what: "onClear",
    find: [
      '"onClear", function (e) {',
      "      _this.setState({",
      "        value: null,",
      "        selected: null",
      "      }, function (e) {",
    ].join("\n"),
    replace: [
      '"onClear", function (e) {',
      "      _this.setState({",
      '        value: "",',
      "        selected: null",
      "      }, function (e) {",
    ].join("\n"),
  },
  {
    what: "componentDidUpdate",
    find: "value: props.value ? props.getSuggestionValue(props.value) : null,",
    replace: 'value: props.value ? props.getSuggestionValue(props.value) : "",',
  },
];

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
const reopenPatched = REOPEN_AFTER_CLEAR.map(() => 0);
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

  // Tracked per edit, not as one total. Both are needed: onClear alone leaves
  // the picker needing two clicks on the X, which is what shipped first.
  const reopenReport = [];
  REOPEN_AFTER_CLEAR.forEach((edit, i) => {
    if (source.includes(edit.replace)) {
      reopenPatched[i] += 1;
      reopenReport.push(`${edit.what}(already)`);
      return;
    }
    const hits = source.split(edit.find).length - 1;
    if (hits) source = source.split(edit.find).join(edit.replace);
    reopenPatched[i] += hits;
    reopenReport.push(`${edit.what}=${hits}`);
  });

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
      `keep-open ${openHits || (keptOpen ? "(already present)" : "NOT FOUND")}, ` +
      `reopen-after-clear ${reopenReport.join(" ")}`,
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

const reopenMissing = REOPEN_AFTER_CLEAR.filter((edit, i) => !reopenPatched[i]);
if (reopenMissing.length) {
  console.error("\ncould not fix the picker that will not reopen. Not found in any bundle:");
  reopenMissing.forEach((edit) => console.error(`  ${edit.what}`));
  console.error("fe-core's AutoSuggestion gates its dropdown on state.value !== state.selected,");
  console.error("and both of these set that pair. Either alone is not enough: with only onClear");
  console.error("patched, clearing a picker takes two clicks on the X to open; with only");
  console.error("componentDidUpdate patched, a programmatic reset strands it.");
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

/*
 * Keep the selected location highlighted until the next one is picked.
 *
 * fe-location marks the row whose children the next pane is showing:
 *
 *   <ListItem selected={location && location.id === l.id} ...>   (ResultPane)
 *
 * and LocationsPage passes the right thing down -- `location: this.state.l0`
 * for the provinces pane, l1 for the districts, and so on. But the component
 * in between throws it away:
 *
 *   var _excluded = ["classes", "rights", "title", "onRefresh", "onEdit",
 *                    "readOnly", "location"];
 *   ...
 *   var others = _objectWithoutProperties(this.props, _excluded);
 *   <StyledResultPane onEdit={...} rights={...} readOnly={...} {...others} />
 *
 * `location` is in the exclusion list and reaches ResultPane by no other route,
 * so it is always undefined there, `selected` is always false, and no row is
 * ever marked. Nothing in the interface then says which province you clicked --
 * the districts change and you are left to work it out. The pale wash that
 * looks like a highlight while browsing is MUI's hover: it follows the pointer
 * and is gone the moment it leaves the list.
 *
 * The only other consumer of `others` is ActionDialogs, which reads
 * `stateLocation` and never `location`, so letting this through affects the row
 * list alone.
 *
 * Upstream bug, worth reporting. Removing the one entry is the whole fix: the
 * styling in src/index.css was already written and had simply never had a
 * .Mui-selected to match.
 */
const LOCATION_PKG = path.join(__dirname, "..", "node_modules", "@openimis", "fe-location");
const KEEP_SELECTION = {
  what: "selection highlight",
  find: 'var _excluded = ["classes", "rights", "title", "onRefresh", "onEdit", "readOnly", "location"];',
  replace: 'var _excluded = ["classes", "rights", "title", "onRefresh", "onEdit", "readOnly"];',
  whenMissing: [
    "could not restore the location selection highlight: fe-location no longer",
    "builds TypeLocationsPaper's prop exclusion list that way. Either upstream has",
    "fixed it -- check that a clicked province stays highlighted -- or the patch",
    "needs rewriting.",
  ],
};

/*
 * Never let a translated place name be saved back as the place name.
 *
 * src/lao-language/locationNames.js rewrites location names to English when the
 * interface is in English, in a store middleware -- so every screen that names a
 * place is right without patching each one. The Locations screen, though, does
 * not only display those names: its edit dialog loads the location into a form
 * and writes what is in that form back to the database. Left alone, opening
 * Attapeu in English and pressing Save would replace ອັດຕະປື in
 * location_Location.name with "Attapeu", for every user and every language,
 * permanently.
 *
 * The middleware keeps the stored name beside it as `nameLo` for exactly this.
 * The dialog edits that instead, so the box shows what is really in the database
 * and Save writes back what it read. Display is translated; the record is not.
 *
 * Only the dialog's own copy of the location is changed, so the list behind it
 * stays in the interface language.
 *
 * `nameLo` is absent when the interface is in Lao, when the place is one this
 * deployment has no English name for, and on every location created after the
 * dictionary was built -- so falling through to props.location is the ordinary
 * path rather than the exception.
 */
const EDIT_UNTRANSLATED_NAME = {
  what: "untranslated name in the edit dialog",
  find: "            data: props.location",
  replace:
    "            data: props.location && props.location.nameLo\n" +
    "              ? Object.assign({}, props.location, { name: props.location.nameLo })\n" +
    "              : props.location",
  whenMissing: [
    "could not point the location edit dialog at the untranslated name:",
    "fe-location no longer loads the location into its form that way. WITHOUT THIS,",
    "editing a location while the interface is in English writes the ENGLISH name",
    "into location_Location.name and the Lao name is lost. Either fix the patch or",
    "remove the middlewares entry in src/lao-language/index.js.",
  ],
};

const LOCATION_EDITS = [KEEP_SELECTION, EDIT_UNTRANSLATED_NAME];
const locationPatched = LOCATION_EDITS.map(() => 0);

if (fs.existsSync(LOCATION_PKG)) {
  for (const rel of TARGETS) {
    const file = path.join(LOCATION_PKG, rel);
    if (!fs.existsSync(file)) continue;
    let src = fs.readFileSync(file, "utf-8");
    const report = [];
    LOCATION_EDITS.forEach((edit, i) => {
      if (src.includes(edit.replace)) {
        locationPatched[i] += 1;
        report.push(`${edit.what}(already)`);
        return;
      }
      const hits = src.split(edit.find).length - 1;
      if (hits) src = src.split(edit.find).join(edit.replace);
      locationPatched[i] += hits;
      report.push(`${edit.what}=${hits}`);
    });
    fs.writeFileSync(file, src, "utf-8");
    console.log(`  fe-location/${rel}: ${report.join(", ")}`);
  }
  const missingEdits = LOCATION_EDITS.filter((edit, i) => !locationPatched[i]);
  if (missingEdits.length) {
    missingEdits.forEach((edit) => {
      console.error("");
      edit.whenMissing.forEach((line) => console.error(line));
    });
    console.error("\nSee lao/apply-overrides.js.");
    process.exit(1);
  }
} else {
  console.error("\n@openimis/fe-location not found - did npm install run?");
  process.exit(1);
}

const MEDICAL_PKG = path.join(__dirname, "..", "node_modules", "@openimis", "fe-medical");
let pricePatched = 0;

if (fs.existsSync(MEDICAL_PKG)) {
  for (const rel of TARGETS) {
    const file = path.join(MEDICAL_PKG, rel);
    if (!fs.existsSync(file)) continue;
    let src = fs.readFileSync(file, "utf-8");
    if (src.includes(PRICE_IN_KIP.replace)) {
      pricePatched += 1;
      console.log(`  fe-medical/${rel}: ${PRICE_IN_KIP.what} (already present)`);
      continue;
    }
    // Both hits are wanted: one is the services searcher, one the items
    // searcher, and both columns are money.
    const hits = src.split(PRICE_IN_KIP.find).length - 1;
    if (hits) {
      src = src.split(PRICE_IN_KIP.find).join(PRICE_IN_KIP.replace);
      fs.writeFileSync(file, src, "utf-8");
      pricePatched += hits;
    }
    console.log(`  fe-medical/${rel}: ${PRICE_IN_KIP.what} ${hits || "NOT FOUND"}`);
  }
  if (pricePatched === 0) {
    console.error("");
    PRICE_IN_KIP.whenMissing.forEach((line) => console.error(line));
    console.error("See lao/apply-overrides.js.");
    process.exit(1);
  }
} else {
  console.error("\n@openimis/fe-medical not found - did npm install run?");
  process.exit(1);
}

const missing = Object.keys(overrides).filter((k) => !totals[k]);
if (missing.length) {
  console.error("\nThese keys were not found in fe-core - upstream may have renamed them:");
  missing.forEach((k) => console.error(`  ${k}`));
  process.exit(1);
}

console.log(`Lao login overrides applied: ${Object.keys(overrides).length} keys across ${filesPatched} bundle(s).`);
