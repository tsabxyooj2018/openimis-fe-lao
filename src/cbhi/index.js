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
 * The menu group is contributed under "insuree.MainMenu", not a key of its own.
 * fe-core builds the sidebar by asking for "<module>.MainMenu" for each module
 * named in openimis.json, and a local module cannot appear there: load-config
 * rewrites package.json from that file and npm would try to resolve this from
 * the registry. A key nobody asks for is never rendered -- which is exactly why
 * the language module's own "language.MainMenu" does not appear, and why its
 * switcher had to be mounted onto the toolbar by hand. Contributing to a key
 * that IS requested avoids repeating that.
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
  const rights = props.rights ?? [];
  if (!rights.includes(RIGHT_INSUREE)) return null;

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
  "insuree.MainMenu": [CardsMainMenu],
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
