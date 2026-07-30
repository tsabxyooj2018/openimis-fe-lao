import React from "react";
import { MainMenuContribution } from "@openimis/fe-core";
import TranslateIcon from "@material-ui/icons/Translate";
import { FlagLao, FlagEnglish, FlagFrench } from "./flags";
import LanguageSwitchPage from "./LanguageSwitchPage";

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

const LaoLanguageModule = (cfg) => ({
  "core.Router": [{ path: "language/:code", component: LanguageSwitchPage }],
  "language.MainMenu": [LanguageMainMenu],
  ...cfg,
});

export default LaoLanguageModule;
export { LaoLanguageModule };
