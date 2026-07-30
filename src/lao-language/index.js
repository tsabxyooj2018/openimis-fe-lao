import React from "react";
import { MainMenuContribution } from "@openimis/fe-core";
import TranslateIcon from "@material-ui/icons/Translate";
import { FlagLao, FlagEnglish, FlagFrench } from "./flags";
import LanguageSwitchPage from "./LanguageSwitchPage";
import messages_lo from "./lo.json";
import mountHeaderSwitcher from "./headerSwitcher";

/*
 * Language switcher, contributed as an ordinary openIMIS module.
 *
 * Why a module and not a fork of fe-core: the sidebar variant of the main menu
 * does not render the language picker that the app bar had, so switching
 * language became unreachable. A module is additive -- upstream is untouched, so
 * openIMIS upgrades stay a version bump. Forking fe-core would mean merging the
 * most actively developed component every release, for a switcher.
 *
 * Languages come from tblLanguages in the database (lo / en / fr). The entries
 * below must stay in step with that table: adding a row there does not add a row
 * here.
 *
 * Layout note: MainMenuContribution entries take a plain string `text`, so the
 * native name and the English name share one line separated by a middot rather
 * than stacking as two lines. Two-line entries would need a forked component.
 */

const LANGUAGES = [
  { code: "lo", native: "ພາສາລາວ", english: "Lao", Flag: FlagLao },
  { code: "en", native: "English", english: "English", Flag: FlagEnglish },
  { code: "fr", native: "Français", english: "French", Flag: FlagFrench },
];

const LanguageMainMenu = (props) => (
  <MainMenuContribution
    {...props}
    header="ພາສາ / Language"
    icon={<TranslateIcon />}
    entries={LANGUAGES.map(({ code, native, english, Flag }) => ({
      text: native === english ? native : `${native} · ${english}`,
      icon: <Flag />,
      route: `/language/${code}`,
    }))}
  />
);

// Mount the toolbar switcher as the module loads. The shell requests menu
// contributions by module name from openimis.json, which a local module cannot
// appear in, so "language.MainMenu" is never asked for -- the group below never
// renders and the CSS that repositioned it had nothing to move.
mountHeaderSwitcher();

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
   * Keys absent from lo.json fall back to English, so partial coverage is safe:
   * the file can grow module by module without anything breaking.
   */
  translations: [{ key: "lo", messages: messages_lo }],
  ...cfg,
});

export default LaoLanguageModule;
export { LaoLanguageModule };
