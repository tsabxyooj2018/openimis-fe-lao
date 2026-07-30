import { loadModules, packages } from "./modules";
import { memoize } from "lodash";
import pkg from "../package.json";
import { ensureArray } from "@openimis/fe-core";

const TRANSLATION_CONTRIBUTION_KEY = "translations";
const BASE_LANGUAGE = "en";

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
    this.cfg = cfg;
    try {
      this.modules = loadModules(cfg);
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

  getModulesVersions() {
    return packages.map((name) => `${name}@${pkg.dependencies[name] ?? "?"}`);
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
