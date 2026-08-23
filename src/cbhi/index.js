import React from "react";
import { MainMenuContribution } from "@openimis/fe-core";
import CreditCardIcon from "@material-ui/icons/CreditCard";
import MembershipCardsPage from "./MembershipCardsPage";
import messages from "./messages.json";

/*
 * CBHI customisations, contributed as an ordinary openIMIS module.
 *
 * First feature: membership cards, which openIMIS has no equivalent of. It
 * tracks whether a card was issued -- `cardIssued` is a field on the insuree --
 * but has nothing that prints one.
 *
 * THE MENU KEY IS "core.MainMenu", AND THE SHAPE MATTERS
 *
 * openIMIS uses ".MainMenu" keys for two different things, and putting the wrong
 * thing under the wrong one fails silently -- which it did here on the first
 * attempt, rendering nothing at all with no error anywhere:
 *
 *   core.MainMenu       a TOP-LEVEL GROUP, as { name, component }. This is the
 *                       list fe-core's MainMenuBar actually renders
 *                       (MAIN_MENU_CONTRIBUTION_KEY). fe-insuree, fe-claim,
 *                       fe-tools, fe-invoice, fe-admin and fe-profile each
 *                       register their group here.
 *
 *   <module>.MainMenu   ENTRIES to add INSIDE somebody else's group, as
 *                       { text, icon, route }. fe-policy and fe-contribution put
 *                       entries into insuree.MainMenu this way, and fe-insuree's
 *                       own component collects them.
 *
 * A React component handed to insuree.MainMenu is treated as an entry object,
 * finds no `text` or `route` on it, and quietly contributes nothing.
 *
 * One deployment note. getMenus reads getConf("fe-core", "menus", []) and, when
 * that configuration is NOT empty, filterNoConfig drops every menu whose name is
 * absent from it. This deployment does not set it, so nothing is filtered -- but
 * if a `menus` list is ever added to the fe-core ModuleConfiguration row, this
 * group must be listed in it by the name below or it will disappear.
 */

/*
 * Insuree | Query Insurees, which is what the page actually does. fe-insuree
 * calls it RIGHT_INSUREE.
 *
 * The check is here rather than as a `filter` on the entry: MainMenuContribution
 * renders whatever `entries` it is handed, and it is the CONSUMING module that
 * applies entry.filter -- fe-insuree does it for contributions to its own worker
 * menu key. A filter on an entry passed to our own MainMenuContribution would be
 * silently ignored, and the group would appear for users whose first click would
 * be a permission error.
 */
const RIGHT_INSUREE = 101101;

const CardsMainMenu = (props) => {
  const { rights } = props;
  /*
   * Hidden only when the rights are KNOWN and do not include this one. An empty
   * or absent list means they have not arrived from the store yet, and treating
   * that as "no permission" would hide the group on first paint and leave it
   * hidden if the prop never arrives -- the same silent disappearance that the
   * wrong contribution key already caused once. Showing it early costs a
   * permission error at worst; hiding it wrongly costs the whole feature.
   */
  if (Array.isArray(rights) && rights.length && !rights.includes(RIGHT_INSUREE)) {
    return null;
  }

  return (
    <MainMenuContribution
      {...props}
      header="ບັດສະມາຊິກ / CBHI cards"
      icon={<CreditCardIcon />}
      // The sidebar keys off this: apply-overrides stamps it onto the group as
      // data-menu-id so index.css can address groups without depending on the
      // translated header text, and fe-core uses it to decide which group stays
      // open. A group without one is styled by whatever its label happens to be.
      menuId="CbhiMainMenu"
      entries={[
        {
          text: "ອອກບັດສະມາຊິກ / Issue membership cards",
          icon: <CreditCardIcon />,
          route: "/cbhi/membership-cards",
        },
      ]}
    />
  );
};

const CbhiModule = (cfg) => ({
  "core.Router": [{ path: "cbhi/membership-cards", component: MembershipCardsPage }],
  // { name, component } -- the shape MainMenuBar renders. See the note above.
  "core.MainMenu": [{ name: "CbhiMainMenu", component: CardsMainMenu }],
  /*
   * This module's own strings. Contributions are merged as
   * { ...messages, ...contributed } per language, so these sit alongside the Lao
   * dictionary rather than competing with it -- the keys are namespaced cbhi.*
   * and appear in no openIMIS module.
   *
   * English is contributed too. Every component here passes a defaultMessage, so
   * an absent key degrades to English rather than to the key itself, but a user
   * on English should get English from the dictionary rather than from a
   * fallback path that only exists for mistakes.
   */
  translations: [
    { key: "en", messages: messages.en },
    { key: "lo", messages: messages.lo },
  ],
  ...cfg,
});

export default CbhiModule;
export { CbhiModule };
