import React from "react";
import { useIntl } from "react-intl";
import { MainMenuContribution, FormattedMessage, formatMessage } from "@openimis/fe-core";
import CreditCardIcon from "@material-ui/icons/CreditCard";
import ReceiptIcon from "@material-ui/icons/Receipt";
import CropFreeIcon from "@material-ui/icons/CropFree";
import MembershipCardsPage from "./MembershipCardsPage";
import ScanCardPage from "./ScanCardPage";
import ContributionSlipsPage from "./ContributionSlipsPage";
import { InsureeExport, ClaimExport } from "./FilterExport";
import ClaimTotalsPage from "./ClaimTotalsPage";
import ClaimAgeingPage from "./ClaimAgeingPage";
import HomeDashboard from "./HomeDashboard";
import AssessmentIcon from "@material-ui/icons/Assessment";
import TimerIcon from "@material-ui/icons/Timer";
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
 * Insuree | Query Insurees, which is what the cards page actually does.
 * fe-insuree calls it RIGHT_INSUREE.
 *
 * The check is here rather than as a `filter` on the entry: MainMenuContribution
 * renders whatever `entries` it is handed, and it is the CONSUMING module that
 * applies entry.filter -- fe-insuree does it for contributions to its own worker
 * menu key. A filter on an entry passed to our own MainMenuContribution would be
 * silently ignored, and the group would appear for users whose first click would
 * be a permission error.
 */
const RIGHT_INSUREE = 101101;

/*
 * Contribution | Query Contributions, for the slips page. fe-contribution calls
 * it RIGHT_CONTRIBUTION.
 *
 * The slips page also reads policies (policiesByInsuree, right 101201) on the
 * insurance-number branch of its search. That branch fails softly -- the
 * receipt-number branch still answers -- so it is not required to see the
 * entry, only to search by member.
 */
const RIGHT_CONTRIBUTION = 101301;

const CardsMainMenu = (props) => {
  const intl = useIntl();
  const { rights } = props;
  /*
   * Hidden only when the rights are KNOWN and do not include this one. An empty
   * or absent list means they have not arrived from the store yet, and treating
   * that as "no permission" would hide the group on first paint and leave it
   * hidden if the prop never arrives -- the same silent disappearance that the
   * wrong contribution key already caused once. Showing it early costs a
   * permission error at worst; hiding it wrongly costs the whole feature.
   */
  const known = Array.isArray(rights) && rights.length;
  const maySeeCards = !known || rights.includes(RIGHT_INSUREE);
  const maySeeSlips = !known || rights.includes(RIGHT_CONTRIBUTION);
  // Nothing to show at all rather than an empty group header.
  if (!maySeeCards && !maySeeSlips) return null;

  return (
    <MainMenuContribution
      {...props}
      /*
       * Through the dictionary, like every other group, so it follows the user's
       * language instead of showing both at once. It was hardcoded as
       * "ບັດສະມາຊິກ / CBHI cards", which read as a bilingual oddity sitting under
       * nine groups that were all obeying the language setting.
       *
       * header is declared PropTypes.string, so this cannot be a
       * <FormattedMessage> element the way an entry's text may be -- it has to be
       * resolved to a string here.
       *
       * French falls back to English rather than to the key: withBaseLanguageFallback
       * in src/ModulesManager.js prepends the English messages under every
       * language that any module contributes, and this module contributes en.
       */
      header={formatMessage(intl, "cbhi", "mainMenu")}
      icon={<CreditCardIcon />}
      // The sidebar keys off this: apply-overrides stamps it onto the group as
      // data-menu-id so index.css can address groups without depending on the
      // translated header text, and fe-core uses it to decide which group stays
      // open. A group without one is styled by whatever its label happens to be.
      menuId="CbhiMainMenu"
      /*
       * EVERY ENTRY NEEDS AN `id`, AND IT IS NOT OPTIONAL.
       *
       * MainMenuContribution does not render `entries` as given. It passes them
       * through fetchSubmenuConfig, and when the fe-core `menus` configuration
       * is empty -- which it is here -- that ends in:
       *
       *     copyOfEntries.forEach(function (entry) {
       *       if (!uniqueEntriesFallback.has(entry.id)) {
       *         uniqueEntriesFallback.set(entry.id, entry);
       *       }
       *     });
       *
       * a de-duplication keyed on entry.id. With one entry that is harmless,
       * which is why the cards worked. Add a second without an id and both
       * collapse to the key `undefined`: the first is kept, the second is
       * dropped as its duplicate. No error, no warning -- the slips entry simply
       * never appeared, for every user and at every right level.
       *
       * This is why every upstream entry carries one; fe-contribution's is
       * id: 'insuree.contribution'.
       *
       * Rights are still applied here rather than through each entry's `filter`.
       * That fallback path never calls entry.filter -- only the configured path
       * does -- so a filter alone would not gate anything in this deployment.
       *
       * One deployment note that follows from the same function: if a `menus`
       * list is ever added to the fe-core ModuleConfiguration row, the other
       * branch is taken, and it builds its list from
       * modulesManager.getMenuEntries() rather than from these entries at all.
       * These two would then have to be contributed under a <module>.MainMenu
       * key and listed in that configuration, or they would disappear again.
       */
      entries={[
        maySeeCards && {
          id: "cbhi.membershipCards",
          text: formatMessage(intl, "cbhi", "menu.membershipCards"),
          icon: <CreditCardIcon />,
          route: "/cbhi/membership-cards",
        },
        maySeeCards && {
          id: "cbhi.scanCard",
          text: formatMessage(intl, "cbhi", "menu.scanCard"),
          icon: <CropFreeIcon />,
          route: "/cbhi/scan-card",
        },
        maySeeSlips && {
          id: "cbhi.contributionSlips",
          text: formatMessage(intl, "cbhi", "menu.contributionSlips"),
          icon: <ReceiptIcon />,
          route: "/cbhi/contribution-slips",
        },
      ].filter(Boolean)}
    />
  );
};

const CbhiModule = (cfg) => ({
  "core.Router": [
    { path: "cbhi/membership-cards", component: MembershipCardsPage },
    { path: "cbhi/scan-card", component: ScanCardPage },
    { path: "cbhi/contribution-slips", component: ContributionSlipsPage },
    { path: "cbhi/claim-totals", component: ClaimTotalsPage },
    { path: "cbhi/claim-ageing", component: ClaimAgeingPage },
  ],
  // { name, component } -- the shape MainMenuBar renders. See the note above.
  "core.MainMenu": [{ name: "CbhiMainMenu", component: CardsMainMenu }],
  /*
   * Excel export, contributed into the filter panes of openIMIS's own Insurees
   * and Claims searchers.
   *
   * This is the only place the export could go without forking. fe-core has
   * export machinery, but it is driven by props on a Searcher -- exportFetch,
   * exportFields -- and those Searchers are built inside fe-insuree and
   * fe-claim. It also wants a per-entity resolver on the backend; fe-invoice,
   * the one module that enables it, sends `{ billExport }`.
   *
   * Both filter panes, though, publish their live filter state to contributions:
   *
   *     <Contributions filters={filters} onChangeFilters={...}
   *                    contributionKey="insuree.Filter" />
   *
   * so a component contributed here is handed exactly what the operator
   * filtered on and can run the query itself. The export therefore cannot drift
   * from the search -- both are built from the same filter objects.
   */
  /*
   * Figures on the home page, which openIMIS leaves almost empty -- a welcome
   * message and a contract notice.
   *
   * home.HomePage.Blocks is a seam fe-home puts there on purpose: it renders
   * <Contributions contributionKey="home.HomePage.Blocks" user={user}> at the
   * END of its container, so this appends below upstream's content instead of
   * replacing it.
   *
   * The alternative, home.HomePage.customDashboard, replaces the container
   * entirely and only switches on with an fe-home configuration row. Additive
   * loses nothing and needs no configuration to survive a database restore.
   */
  "home.HomePage.Blocks": [HomeDashboard],
  "insuree.Filter": [InsureeExport],
  "claim.Filter": [ClaimExport],
  /*
   * An entry INSIDE openIMIS's own Claims group rather than in ours, because
   * that is where someone looking for a claim total will look.
   *
   * ClaimMainMenu collects this key and applies each entry's `filter` itself:
   *
   *     entries.push(...modulesManager.getContribs(CLAIM_MAIN_MENU_CONTRIBUTION_KEY)
   *       .filter(c => !c.filter || c.filter(rights)))
   *
   * so unlike our own group, a `filter` here is honoured and is the right place
   * for the rights check. `id` is not optional -- MainMenuContribution
   * de-duplicates on it, and an entry without one collides with fe-claim's own
   * entries and vanishes. That cost three rounds to find once already.
   */
  "claim.MainMenu": [
    {
      id: "cbhi.claimTotals",
      text: <FormattedMessage module="cbhi" id="menu.claimTotals" />,
      icon: <AssessmentIcon />,
      route: "/cbhi/claim-totals",
      /*
       * Any claim right at all, matching how fe-claim decides to show its own
       * entries. It does not test for one right; it tests a RANGE:
       *
       *   rights.filter(r => r >= RIGHT_ADD && r <= RIGHT_SUBMIT).length
       *   rights.filter(r => r >= RIGHT_CLAIMREVIEW && r <= RIGHT_PROCESS).length
       *
       * This first asked for 111005 exactly, which is stricter than anything
       * upstream requires: a user holding 111002 and 111007 but not 111005 sees
       * Health Facility Claims and would have found this entry missing, with no
       * way to tell that rights rather than the build were the reason.
       *
       * Totals are derived from claims the user can already list, so the right
       * to see any claim screen is the right to see their totals. 111002..111012
       * spans the module's whole range.
       */
      filter: (rights) => rights.some((r) => r >= 111002 && r <= 111012),
    },
    /*
     * How long claims take to be processed, per facility.
     *
     * Beside the totals rather than in our own group, for the same reason: a
     * question about claims is asked from the Claims menu. `id` is not optional
     * -- MainMenuContribution de-duplicates on it and an entry without one
     * collides with fe-claim's own and vanishes, which cost three rounds to
     * find the first time.
     *
     * Same rights range as the totals entry. Processing time is derived from
     * claims the user can already list, so the right to see any claim screen is
     * the right to see how long they took.
     */
    {
      id: "cbhi.claimAgeing",
      text: <FormattedMessage module="cbhi" id="menu.claimAgeing" />,
      icon: <TimerIcon />,
      route: "/cbhi/claim-ageing",
      filter: (rights) => rights.some((r) => r >= 111002 && r <= 111012),
    },
  ],
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
