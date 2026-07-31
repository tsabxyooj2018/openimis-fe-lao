import React from "react";
import { MainMenuContribution } from "@openimis/fe-core";
import TranslateIcon from "@material-ui/icons/Translate";
import { Flag } from "./flags";
import LANGUAGES from "./languages.json";
import LanguageSwitchPage from "./LanguageSwitchPage";
import messages_lo from "./lo.json";
import mountHeaderSwitcher from "./headerSwitcher";
import mountChangePasswordCancel from "./changePasswordCancel";
import mountProfileLogout from "./profileLogout";

/*
 * Language switcher, contributed as an ordinary openIMIS module.
 *
 * Why a module and not a fork of fe-core: the sidebar variant of the main menu
 * does not render the language picker that the app bar had, so switching
 * language became unreachable. A module is additive -- upstream is untouched, so
 * openIMIS upgrades stay a version bump. Forking fe-core would mean merging the
 * most actively developed component every release, for a switcher.
 *
 * Languages come from tblLanguages in the database (lo / en / fr) and are listed
 * once in languages.json, which every consumer imports. Adding a language is a
 * row there plus a row in tblLanguages; nothing else in this module changes.
 *
 * Layout note: MainMenuContribution entries take a plain string `text`, so the
 * native name and the English name share one line separated by a middot rather
 * than stacking as two lines. Two-line entries would need a forked component.
 */

const LanguageMainMenu = (props) => (
  <MainMenuContribution
    {...props}
    header="ພາສາ / Language"
    icon={<TranslateIcon />}
    entries={LANGUAGES.map(({ code, native, english }) => ({
      text: native === english ? native : `${native} · ${english}`,
      icon: <Flag code={code} />,
      route: `/language/${code}`,
    }))}
  />
);

// Mount the toolbar switcher as the module loads. The shell requests menu
// contributions by module name from openimis.json, which a local module cannot
// appear in, so "language.MainMenu" is never asked for -- the group below never
// renders and the CSS that repositioned it had nothing to move.
mountHeaderSwitcher();
// Profile > Change Password ships with only a Submit button; see the module.
mountChangePasswordCancel();
// Logout lives in the toolbar in fe-core; this puts it with the other account
// actions, under Change Password.
mountProfileLogout();

const LaoLanguageModule = (cfg) => ({
  "core.Router": [{ path: "language/:code", component: LanguageSwitchPage }],
  // Kept so the switcher still appears if a future openIMIS release renders
  // contributions from modules it does not know by name.
  "language.MainMenu": [LanguageMainMenu],
  /*
   * Lao dictionary. App.js merges as { ...messages, ...moduleContributions },
   * filtered to the active language, so contributions win over the assembly's
   * root translations -- which is why this belongs here rather than in
   * src/translations/ref.json.
   *
   * Keys absent from lo.json fall back to English, so partial coverage is safe
   * and this file can grow module by module. That fallback is NOT something
   * openIMIS provides -- react-intl renders a missing key as the key itself,
   * which turned the menu into "mainMenu" and "appBar.enquiry" the first time
   * Lao was actually applied. It comes from withBaseLanguageFallback in
   * src/ModulesManager.js; without that, adding a language here is harmful
   * until it is complete.
   */
  translations: [{ key: "lo", messages: messages_lo }],
  ...cfg,
});

export default LaoLanguageModule;
export { LaoLanguageModule };
