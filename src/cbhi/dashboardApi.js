import { graphql } from "../helpers/csrf";

/*
 * Numbers for the home page.
 *
 * THIS RUNS ON EVERY LOGIN, WHICH DECIDES EVERYTHING BELOW
 *
 * The home page is the first thing every user loads, every day, including at
 * health centres -- the level the country's connectivity funding explicitly
 * excludes, where the link is worst and the electricity least reliable. A home
 * page that fetches rows to count them would be slow exactly where slow hurts.
 *
 * So every figure here is a `totalCount` on a connection with `first: 1`. The
 * server counts; nothing is transferred to be counted here. And the whole set
 * is ONE request using GraphQL aliases rather than nine, because nine round
 * trips over a bad link is nine chances to hang.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * Money. Totals of contributions collected or amounts claimed cannot come from
 * totalCount -- they need the rows, summed. On a page that loads this often
 * that is the wrong trade, and the claim totals page already answers it
 * properly for anyone who asks. Counts here, amounts there.
 */

/** Claim pipeline statuses, in the order work moves through them. */
export const CLAIM_STATUSES = [
  { key: "entered", status: 2 },
  { key: "checked", status: 4 },
  { key: "processed", status: 8 },
  { key: "valuated", status: 16 },
  { key: "rejected", status: 1 },
];

/*
 * Rights, matching what each module requires of its own screens rather than a
 * stricter rule invented here.
 *
 *   101101  Insuree | Query Insurees          (fe-insuree RIGHT_INSUREE)
 *   101201  Policy  | Query Policies
 *   101301  Contribution | Query Contributions (fe-contribution)
 *   111002..111012  the claim module's whole range, the same span fe-claim
 *                   tests before showing its own menu entries
 */
const RIGHT_INSUREE = 101101;
const RIGHT_POLICY = 101201;
const RIGHT_CONTRIBUTION = 101301;

const maySeeClaims = (rights) => rights.some((r) => r >= 111002 && r <= 111012);

/*
 * First day of the current month, as the local calendar has it.
 *
 * Built from the local year and month rather than via toISOString, which
 * converts to UTC and, seven hours behind Vientiane, hands back the LAST DAY OF
 * THE PREVIOUS MONTH. That made "this month" quietly one day too wide. See
 * isoLocalDate in ageingApi.js.
 */
export const startOfMonth = (today = new Date()) =>
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;

/**
 * Reads the caller's rights off the user record.
 *
 * The REST payload for the current user nests them under i_user, which is the
 * same place the avatar sidecar reads them from. An absent list is treated as
 * "nothing known yet" and returns an empty array, so the caller shows nothing
 * rather than everything.
 */
export const rightsOf = (user) => {
  const rights = user?.i_user?.rights ?? user?.rights;
  if (!Array.isArray(rights)) return [];
  /*
   * Coerced to numbers, because they do not always arrive as numbers.
   *
   * This bit once already: with rights delivered as strings, a range test like
   * `r >= 111002 && r <= 111012` coerces and PASSES, while `includes(101101)`
   * compares a string to a number and FAILS. So the claim pipeline appeared on
   * the home page while the insuree, policy and contribution tiles silently did
   * not, for a user who plainly had those rights -- two checks over one array
   * disagreeing because only one of them coerced.
   */
  return rights.map(Number).filter(Number.isFinite);
};

/**
 * One request for every figure the caller is allowed to see.
 *
 * Blocks the user has no right to are not merely hidden -- they are never
 * asked for, so a permission error cannot be what greets somebody at login.
 */
export async function fetchDashboard(user) {
  const rights = rightsOf(user);
  const since = startOfMonth();

  const parts = [];
  const wants = { insurees: false, policies: false, contributions: false, claims: false };

  if (rights.includes(RIGHT_INSUREE)) {
    wants.insurees = true;
    parts.push(`insurees: insurees(first: 1) { totalCount }`);
    parts.push(`families: families(first: 1) { totalCount }`);
  }
  if (rights.includes(RIGHT_POLICY)) {
    wants.policies = true;
    parts.push(`policies: policies(first: 1) { totalCount }`);
  }
  if (rights.includes(RIGHT_CONTRIBUTION)) {
    wants.contributions = true;
    parts.push(`contributions: premiums(payDate_Gte: "${since}", first: 1) { totalCount }`);
  }
  if (maySeeClaims(rights)) {
    wants.claims = true;
    parts.push(`claimsThisMonth: claims(dateClaimed_Gte: "${since}", first: 1) { totalCount }`);
    CLAIM_STATUSES.forEach(({ key, status }) => {
      parts.push(`${key}: claims(status: ${status}, first: 1) { totalCount }`);
    });
    /*
     * The oldest claim not yet through the pipeline.
     *
     * The bars say where work has piled up; this says how long the pile has
     * been there, which is the part that decides whether anyone needs to act
     * today. A stage holding forty claims for two days and a stage holding
     * forty for eight months draw the same bar.
     *
     * Still cheap: ONE row, ordered by the server, not a scan. Entered and
     * Checked are asked separately because `status` takes a single value and
     * both are "not processed yet" -- the caller takes whichever is older.
     */
    parts.push(
      `oldestEntered: claims(status: 2, orderBy: ["dateClaimed"], first: 1) { edges { node { dateClaimed } } }`,
    );
    parts.push(
      `oldestChecked: claims(status: 4, orderBy: ["dateClaimed"], first: 1) { edges { node { dateClaimed } } }`,
    );
  }

  if (!parts.length) return { wants, counts: {}, since };

  const body = await graphql(`query {\n  ${parts.join("\n  ")}\n}`);
  const data = body?.data ?? {};

  const counts = {};
  Object.keys(data).forEach((key) => {
    const n = data[key]?.totalCount;
    if (typeof n === "number") counts[key] = n;
  });

  return { wants, counts, since, waitingDays: oldestWaitingDays(data) };
}

/** The claim date of the first edge, or null when the alias returned nothing. */
const firstClaimDate = (node) => node?.edges?.[0]?.node?.dateClaimed ?? null;

/*
 * How long the oldest unprocessed claim has been waiting, in whole days.
 *
 * Null when nothing is waiting, which is a real answer and not a missing one --
 * the caller shows no tile rather than a zero that reads like a measurement.
 */
export function oldestWaitingDays(data, today = new Date()) {
  const dates = [firstClaimDate(data?.oldestEntered), firstClaimDate(data?.oldestChecked)]
    .filter(Boolean)
    .map((d) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`))
    .filter((t) => Number.isFinite(t));

  if (!dates.length) return null;

  const then = Math.min(...dates);
  const now = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Math.round((now - then) / 86400000);
  // A claim dated in the future is a data-entry slip, not a negative wait.
  return days >= 0 ? days : null;
}
