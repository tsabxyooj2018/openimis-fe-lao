/*
 * GraphQL for the contribution paid slip.
 *
 * Same footing as the membership card page: talks to /api/graphql directly
 * through helpers/csrf rather than through fe-contribution's action creators,
 * which are module internals. The query and filter names below ARE the schema
 * and are the ones fe-contribution's own searcher sends.
 */
import { graphql } from "../helpers/csrf";

/*
 * A contribution carries everything a receipt needs except the member's name,
 * which hangs off the policy:
 *
 *   receipt payDate amount payType   the payment itself
 *   payer                            who handed the money over, when recorded
 *   policy.product                   what was bought
 *   policy.startDate/expiryDate      the period it covers
 *   policy.family.headInsuree        who it covers
 *
 * isPhotoFee is fetched because a photo fee is NOT cover -- it is a separate
 * charge that happens to be recorded as a premium, and a receipt that called it
 * a contribution would be wrong. The slip labels it differently.
 */
const PROJECTION = `
  uuid
  receipt
  payDate
  amount
  payType
  isPhotoFee
  payer { id uuid name }
  policy {
    uuid
    startDate
    expiryDate
    value
    product { code name }
    family { uuid headInsuree { chfId lastName otherNames dob } }
  }
`;

/*
 * The same server-side cap the insurees connection applies. A day's receipts
 * for one collector is well inside it; a whole district's is not, which is what
 * the truncation notice on the page is for.
 */
export const MAX_SLIPS = 100;

const escape = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/*
 * One box again, and this time both kinds of input are digits, so the trick the
 * cards page uses -- letters mean a name, digits mean a number -- cannot
 * separate them. A receipt number and an insurance number are not
 * distinguishable by shape.
 *
 * So both are searched and the results merged, rather than asking the operator
 * to declare which one they are holding. Two aliases in a single request:
 *
 *   byReceipt   premiums(receipt_Icontains:)   direct
 *   the number  policiesByInsuree -> premiums(policyUuids:)  two hops, because
 *               `premiums` has no filter that reaches the insuree
 *
 * The second genuinely needs two round trips: the policy uuids are not known
 * until the first answers.
 */
export async function fetchSlips(term, limit = MAX_SLIPS) {
  const trimmed = String(term ?? "").trim();
  if (!trimmed) return { slips: [], truncated: false };

  const value = trimmed.replace(/[^0-9A-Za-z-]/g, "");
  if (!value) return { slips: [], truncated: false };

  /*
   * Settled independently, so a receipt search still works when the two-hop
   * member search fails and the other way about.
   *
   * They used to be caught SILENTLY, and that was wrong in a way that took a
   * while to see. This page reports failures properly -- it shows the server's
   * own words, which is what turned an unexplained blank into a diagnosable
   * CSRF error on the cards page -- but it can only report what it is told, and
   * swallowing both rejections here meant a refused `premiums` query and a
   * receipt number that genuinely does not exist produced the same empty
   * result. There is no way to tell a bad test value from a broken query.
   *
   * So: each failure is named in the console, and if BOTH fail the error is
   * rethrown, because then there is no partial answer to preserve and the page
   * should say so rather than claim it found nothing.
   */
  const [receiptResult, memberResult] = await Promise.allSettled([
    graphql(`query {
      premiums(receipt_Icontains: "${escape(value)}", first: ${limit}, orderBy: ["-payDate"]) {
        edges { node { ${PROJECTION} } }
      }
    }`),
    fetchByInsuranceNumber(value, limit),
  ]);

  [
    ["by receipt number", receiptResult],
    ["by insurance number", memberResult],
  ].forEach(([which, result]) => {
    if (result.status === "rejected") {
      // eslint-disable-next-line no-console
      console.error(`[cbhi] slip search ${which} failed`, result.reason);
    }
  });

  if (receiptResult.status === "rejected" && memberResult.status === "rejected") {
    throw receiptResult.reason;
  }

  const receiptBody = receiptResult.status === "fulfilled" ? receiptResult.value : null;
  const memberNodes = memberResult.status === "fulfilled" ? memberResult.value : null;

  /*
   * Keyed on uuid. A search for "070707" can legitimately match both a receipt
   * number and a member's policies, and the same payment must not be printed
   * twice because it arrived down two paths.
   */
  const seen = new Map();
  (receiptBody?.data?.premiums?.edges ?? []).forEach((edge) => {
    if (edge?.node?.uuid) seen.set(edge.node.uuid, edge.node);
  });
  (memberNodes ?? []).forEach((node) => {
    if (node?.uuid && !seen.has(node.uuid)) seen.set(node.uuid, node);
  });

  const slips = [...seen.values()].sort((a, b) =>
    String(b.payDate ?? "").localeCompare(String(a.payDate ?? "")),
  );

  return { slips: slips.slice(0, limit), truncated: slips.length > limit };
}

/*
 * `premiums` can be filtered by policyUuids but not by anything that reaches
 * the insuree, so the member's policies have to be found first.
 */
async function fetchByInsuranceNumber(chfId, limit) {
  /*
   * activeOrLastExpiredOnly: false, said EXPLICITLY.
   *
   * This query was sending only chfId and taking whatever the server defaults
   * to, which is not something to leave to chance here. fe-policy's own
   * searcher always sends the flag -- it is the "only active" checkbox on the
   * policies panel -- so the parameter exists and the default is the backend's
   * business, not ours.
   *
   * False is the right value for a RECEIPT: somebody at the counter asking for
   * a duplicate slip is usually asking about cover that has already ended. A
   * true here would quietly hide every historical policy, and the page would
   * report "no payment matches that number" for a member who has paid for
   * years -- indistinguishable, from the outside, from a member who never paid.
   */
  const policies = await graphql(`query {
    policiesByInsuree(chfId: "${escape(chfId)}", activeOrLastExpiredOnly: false, first: 50) {
      edges { node { policyUuid } }
    }
  }`);

  const uuids = (policies?.data?.policiesByInsuree?.edges ?? [])
    .map((edge) => edge?.node?.policyUuid)
    .filter(Boolean);

  if (!uuids.length) return [];

  const list = uuids.map((uuid) => `"${escape(uuid)}"`).join(", ");
  const body = await graphql(`query {
    premiums(policyUuids: [${list}], first: ${limit}, orderBy: ["-payDate"]) {
      edges { node { ${PROJECTION} } }
    }
  }`);

  return (body?.data?.premiums?.edges ?? []).map((edge) => edge?.node).filter(Boolean);
}
