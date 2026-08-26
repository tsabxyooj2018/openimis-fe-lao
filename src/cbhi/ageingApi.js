/*
 * GraphQL for the claim processing clock.
 *
 * Same footing as the cards and slips pages: talks to /api/graphql through
 * helpers/csrf rather than through fe-claim's action creators, which are module
 * internals. The filter names below ARE the schema and are the ones
 * fe-claim's own ClaimFilter sends -- dateClaimed_Gte, dateClaimed_Lte,
 * healthFacility_Location.
 */
import { graphql } from "../helpers/csrf";

/*
 * WHAT THIS CAN AND CANNOT MEASURE
 *
 * The NHI Strategy's indicator is "reimbursement delays less than 30 days from
 * central to provincial, district and health centre levels (% of facilities)",
 * baseline 15%, target 50%.
 *
 * Reimbursement means money reaching the facility, and that happens in the
 * treasury. openIMIS never sees it. What openIMIS does hold is the half of the
 * journey it owns: the claim arrives (dateClaimed) and is processed
 * (dateProcessed).
 *
 * So this measures the PROCESSING clock, which is a lower bound on the
 * reimbursement clock -- a claim cannot be paid before it is processed, and the
 * strategy's own situation analysis blames "recurrent delays in budget
 * execution" for much of the rest. Reported as what it is rather than dressed
 * up as the full indicator: a facility that looks fine here may still be
 * waiting for money.
 */
const PROJECTION = `
  uuid
  dateClaimed
  dateProcessed
  status
  healthFacility { uuid code name level }
`;

/*
 * PAGE is the server's own cap and is NOT negotiable: asking for more comes
 * back as "Requesting N records on the `claims` connection exceeds the `first`
 * limit of 100 records", which is a failed page rather than a short one. See
 * the note on PAGE in FilterExport.js, where the same wall was hit.
 *
 * MAX_CLAIMS is our ceiling on the whole sweep. A quarter of one district sits
 * well inside it; a year of a whole province does not, which is what the
 * truncation notice on the page is for.
 */
export const PAGE = 100;
export const MAX_CLAIMS = 5000;

/** Claim statuses. 8 Processed and 16 Valuated are the ones that stopped the clock. */
export const STATUS_ENTERED = 2;
export const STATUS_CHECKED = 4;
export const STATUS_PROCESSED = 8;
export const STATUS_VALUATED = 16;

const escape = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/*
 * A calendar date as the local calendar has it, YYYY-MM-DD.
 *
 * NOT `new Date(...).toISOString().slice(0, 10)`, which is the obvious version
 * and is wrong here. toISOString converts to UTC first, and Laos is UTC+7 -- so
 * local midnight on the 1st of a month becomes 17:00 on the LAST DAY OF THE
 * PREVIOUS MONTH, and the date comes back a day early. Anything between
 * midnight and 07:00 local has the same problem on any day.
 *
 * It is the same trap ContributionSlip.formatDate already documents from the
 * other direction, and it is silent: a filter one day wide of where it should
 * be still returns plausible rows.
 *
 * Reading the local parts and formatting them by hand never converts anything,
 * so there is no zone to be wrong about.
 */
export function isoLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Whole days between two ISO dates, or null if either is missing. */
export function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(to).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/*
 * Fetches claims made in a period, optionally within one location subtree.
 *
 * The date range is on dateClaimed rather than dateProcessed on purpose. Filter
 * on when a claim was PAID and the ones still waiting -- the ones the indicator
 * is actually about -- drop out of the answer entirely, and every facility looks
 * punctual. Asking "of the claims raised in this quarter, where have they got
 * to" keeps the unprocessed ones in view.
 */
export async function fetchClaimAgeing({ from, to, locationUuid, onProgress } = {}) {
  const filters = [`orderBy: ["dateClaimed"]`];
  if (from) filters.push(`dateClaimed_Gte: "${escape(from)}"`);
  if (to) filters.push(`dateClaimed_Lte: "${escape(to)}"`);
  if (locationUuid) filters.push(`healthFacility_Location_Uuid: "${escape(locationUuid)}"`);

  const claims = [];
  let cursor = null;
  let truncated = false;

  for (;;) {
    const args = [...filters, `first: ${PAGE}`];
    if (cursor) args.push(`after: "${escape(cursor)}"`);

    // eslint-disable-next-line no-await-in-loop
    const body = await graphql(`query {
      claims(${args.join(", ")}) {
        pageInfo { hasNextPage endCursor }
        edges { node { ${PROJECTION} } }
      }
    }`);

    const page = body?.data?.claims;
    (page?.edges ?? []).forEach((edge) => {
      if (edge?.node) claims.push(edge.node);
    });
    if (onProgress) onProgress(claims.length);

    if (!page?.pageInfo?.hasNextPage || claims.length >= MAX_CLAIMS) {
      truncated = !!page?.pageInfo?.hasNextPage;
      break;
    }
    cursor = page.pageInfo.endCursor;
  }

  return { claims: claims.slice(0, MAX_CLAIMS), truncated };
}

/*
 * Rolls claims up per facility.
 *
 * `median` rather than a mean, because one claim stuck for two years drags an
 * average past the point where it describes anything. The median says what a
 * typical claim at this facility did, which is the question being asked.
 *
 * `withinTarget` counts only SETTLED claims, and `pending` is reported beside it
 * rather than folded in. A facility with four claims processed in a week and
 * ninety still untouched would otherwise score 100%, which is exactly backwards.
 */
export function summariseByFacility(claims, targetDays = 30) {
  const byFacility = new Map();

  claims.forEach((claim) => {
    const hf = claim.healthFacility;
    if (!hf?.uuid) return;
    if (!byFacility.has(hf.uuid)) {
      byFacility.set(hf.uuid, {
        uuid: hf.uuid,
        code: hf.code,
        name: hf.name,
        level: hf.level,
        days: [],
        settled: 0,
        withinTarget: 0,
        pending: 0,
        oldestPending: null,
      });
    }
    const row = byFacility.get(hf.uuid);
    const days = daysBetween(claim.dateClaimed, claim.dateProcessed);

    if (days === null) {
      row.pending += 1;
      const waiting = daysBetween(claim.dateClaimed, isoLocalDate());
      if (waiting !== null && (row.oldestPending === null || waiting > row.oldestPending)) {
        row.oldestPending = waiting;
      }
      return;
    }

    row.settled += 1;
    row.days.push(days);
    if (days <= targetDays) row.withinTarget += 1;
  });

  const rows = [...byFacility.values()].map((row) => {
    const sorted = [...row.days].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return {
      ...row,
      total: row.settled + row.pending,
      median: sorted.length
        ? sorted.length % 2
          ? sorted[mid]
          : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : null,
      longest: sorted.length ? sorted[sorted.length - 1] : null,
      // Undefined rather than 0 when nothing has settled: a facility with no
      // settled claims has no rate, and printing 0% would read as a bad one.
      rate: row.settled ? row.withinTarget / row.settled : null,
    };
  });

  /*
   * The headline the strategy actually asks for: the share of FACILITIES
   * meeting the target, not the share of claims. A facility counts as meeting
   * it when the median claim settled within the target -- one slow claim should
   * not disqualify a facility that is otherwise punctual.
   *
   * Facilities with nothing settled are excluded from the denominator and
   * reported separately, because they have not met the target and have not
   * missed it either.
   */
  const scored = rows.filter((row) => row.median !== null);
  const meeting = scored.filter((row) => row.median <= targetDays).length;

  return {
    rows: rows.sort((a, b) => (b.median ?? -1) - (a.median ?? -1)),
    facilities: rows.length,
    scored: scored.length,
    meeting,
    facilityRate: scored.length ? meeting / scored.length : null,
    unscored: rows.length - scored.length,
    pending: rows.reduce((n, row) => n + row.pending, 0),
  };
}
