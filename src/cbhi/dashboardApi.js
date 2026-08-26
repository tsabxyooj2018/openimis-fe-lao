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

/** First day of the current month, as an ISO date. */
export const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

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
  return Array.isArray(rights) ? rights : [];
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
  }

  if (!parts.length) return { wants, counts: {}, since };

  const body = await graphql(`query {\n  ${parts.join("\n  ")}\n}`);
  const data = body?.data ?? {};

  const counts = {};
  Object.keys(data).forEach((key) => {
    const n = data[key]?.totalCount;
    if (typeof n === "number") counts[key] = n;
  });

  return { wants, counts, since };
}
