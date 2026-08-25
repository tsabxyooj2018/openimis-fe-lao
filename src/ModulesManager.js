// `packages` is no longer imported: it fed getModulesVersions() below, which is
// now empty. Leaving the import would fail the build, since Create React App
// treats an unused binding as an error when CI is set, as it is in Actions.
import { loadModules } from "./modules";
import { memoize } from "lodash";
import pkg from "../package.json";
import { ensureArray } from "@openimis/fe-core";

const TRANSLATION_CONTRIBUTION_KEY = "translations";
const BASE_LANGUAGE = "en";

/*
 * Module configuration this deployment sets differently from openIMIS, baked
 * into the image.
 *
 * The database is the other way to set these -- a core_ModuleConfiguration row,
 * read by the browser through the moduleConfigurations query -- and for most
 * settings it is the right one, because it applies on a refresh with no rebuild.
 * These are here instead for the same reason the theme is: the value only makes
 * sense together with something that already ships in the image, and splitting
 * one behaviour across two repositories lets the halves drift.
 *
 * AutoSuggestion.limitDisplay is exactly that case. fe-core stops listing after
 * `limitDisplay` options and replaces the rest with "... other options matching
 * search, please refine". The default is 10, and there are 18 provinces -- so
 * the province picker showed ten and hid the rest behind a message telling the
 * user to type, with nothing on screen to say that Xekong or Attapeu existed.
 * Refining towards a name you cannot see is not something a clerk can do.
 *
 * Raising it alone would have replaced one fault with another: fe-core gives the
 * dropdown no max-height and no overflow, so twenty provinces render as an
 * 800px column running off the bottom of the window. The height and the scroll
 * live in src/index.css, keyed on the same component. Number and box are one
 * change, and they belong in one repository.
 *
 * 200, not unlimited. AutoSuggestion backs only bounded reference lists here --
 * the location pickers, and professions, relations, education, identification
 * types, insuree officers, authorities. Record searches use a different
 * component. So 200 shows every list this deployment has in full, while leaving
 * the cap standing as a backstop rather than removing it.
 *
 * MERGED PER KEY, and the database still wins. Same semantics as the backend's
 * ModuleConfiguration.get_or_default, which returns {**defaults, **db_row}: a
 * row that sets one key leaves every other default alone, so adding an fe-core
 * row for something else cannot silently revert these.
 */
const DEPLOYMENT_DEFAULTS = {
  "fe-core": {
    "AutoSuggestion.limitDisplay": 200,
  },
};

function withDeploymentDefaults(cfg) {
  const out = { ...(cfg || {}) };
  Object.entries(DEPLOYMENT_DEFAULTS).forEach(([module, defaults]) => {
    out[module] = { ...defaults, ...(out[module] || {}) };
  });
  return out;
}

/*
 * Falls back to English for any string a language has not translated yet.
 *
 * Without this, a partly translated language is worse than no translation at
 * all. fe-core builds the dictionary as
 *
 *   getContribs("translations").filter(m => m.key === lang)
 *     .reduce((all, m) => Object.assign(all, m.messages), {})
 *
 * so only the active language's messages are present, and react-intl renders a
 * missing key as the key itself. Switching to Lao with 92 of ~2,900 strings
 * translated turned the menu into "mainMenu", "tasksMainMenu", "appBar.enquiry".
 *
 * The fix is to prepend one English entry per language rather than merging
 * English into each contribution. Order is what makes this safe: the reduce
 * above lets later contributions win, so the base sits at the front and every
 * real translation still overrides it. Merging into each contribution instead
 * would break languages that several modules translate -- the second module's
 * English base would overwrite the first module's translations.
 *
 * This also covers French, where a module that upstream has not translated now
 * shows English instead of a raw key.
 */
function withBaseLanguageFallback(translations) {
  const base = translations
    .filter((t) => t?.key === BASE_LANGUAGE)
    .reduce((acc, t) => Object.assign(acc, t.messages), {});

  // No English to fall back to: leave the contributions exactly as they were.
  if (!Object.keys(base).length) return translations;

  const languages = [...new Set(translations.map((t) => t?.key))].filter(
    (key) => key && key !== BASE_LANGUAGE,
  );

  return [...languages.map((key) => ({ key, messages: base })), ...translations];
}

class ModulesManager {
  constructor(cfg) {
    // Before loadModules, not after: modules are handed their own slice of the
    // configuration as they load, so a default applied afterwards would reach
    // getConf and miss every module that read its config at construction.
    this.cfg = withDeploymentDefaults(cfg);
    try {
      this.modules = loadModules(this.cfg);
    } catch (error) {
      throw new Error(
        "Loading modules failed in ModulesManager.js. This might be caused by duplicated modules in /src/modules.js. \n ORIGINAL ERROR: " +
          error,
      );
    }
    this.contributionsCache = {};
    this.controlsCache = this.buildControlsCache();
    this.refsCache = this.buildRefsCache();
    this.reportsCache = this.buildReportsCache();
  }

  buildControlsCache() {
    const ctrls = {};
    for (var k in this.cfg) {
      if (!!this.cfg[k].controls) {
        for (var i in this.cfg[k].controls) {
          var c = this.cfg[k].controls[i];
          ctrls[k + "." + c["field"]] = c["usage"];
        }
      }
    }
    return ctrls;
  }

  buildRefsCache() {
    return this.getContribs("refs").reduce((refs, r) => {
      refs[r.key] = r.ref;
      return refs;
    }, {});
  }

  buildReportsCache() {
    return this.getContribs("reports").reduce((acc, report) => {
      if (!report.getParams) {
        console.error(`Report ${report.key} has no getParams function.`);
      }
      if (!report.isValid) {
        console.error(`Report ${report.key} has no isValid function.`);
      }
      acc[report.key] = report;
      return acc;
    }, {});
  }

  getOpenIMISVersion() {
    return pkg.version;
  }

  /*
   * Deliberately empty.
   *
   * fe-core hangs a tooltip off the version caption under the logo:
   *
   *   <Tooltip title={modulesManager.getModulesVersions().join(", ")}>
   *     <Typography variant="caption">{getOpenIMISVersion()}</Typography>
   *
   * so hovering "26.04" dumped all thirty-one packages and their exact
   * versions over the sidebar. It is unreadable, it is not information a user
   * of a health insurance system has any use for, and it tells anyone who
   * hovers precisely which component versions this deployment runs.
   *
   * MUI renders no tooltip when the title is an empty string, so returning
   * nothing removes it without touching fe-core. The version caption itself
   * stays. The module versions are still in package.json and in the image's
   * OCI labels, where support can read them.
   */
  getModulesVersions() {
    return [];
  }

  hideField(module, key) {
    return this.controlsCache["fe-" + module + "." + key] & 1;
  }

  getRef(key) {
    return this.refsCache[key];
  }

  getReport(ref) {
    return this.reportsCache[ref];
  }

  getProjection(key) {
    const proj = this.getRef(key);
    return !!proj ? `{${proj.join(", ")}}` : "";
  }

  getContribs = memoize((key) => {
    const contributions = this.modules.reduce(
      (acc, module) => [...acc, ...ensureArray(module[key])],
      [],
    );
    return key === TRANSLATION_CONTRIBUTION_KEY ? withBaseLanguageFallback(contributions) : contributions;
  });

  getConf(module, key, defaultValue = null) {
    const moduleCfg = this.cfg[module] || {};
    return moduleCfg[key] !== undefined ? moduleCfg[key] : defaultValue;
  }

  getMenuEntries() {
    return this.modules.reduce((menuEntries, module) => {
      const mainMenuKeys = Object.keys(module).filter(
        (key) => key.includes(".MainMenu") && key !== "core.MainMenu"
      );
      mainMenuKeys.forEach((key) => {
        menuEntries.push(...ensureArray(module[key]));
      });
      return menuEntries;
    }, []);
  }
}

export default ModulesManager;
