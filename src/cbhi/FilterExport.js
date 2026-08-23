import React, { useCallback, useState } from "react";
import { useIntl } from "react-intl";
import { Box, Button, CircularProgress, Typography } from "@material-ui/core";
import GetAppIcon from "@material-ui/icons/GetApp";
import { graphql } from "../helpers/csrf";
import { downloadWorkbook } from "./xlsx";

/*
 * Export a searcher's results to Excel, honouring the filters on screen.
 *
 * WHERE THIS RENDERS, AND WHY THAT IS THE WHOLE TRICK
 *
 * openIMIS's own export machinery cannot be reached from a local module. It is
 * driven by props on a Searcher -- exportFetch, exportFields -- and those
 * Searchers are constructed inside fe-insuree and fe-claim, which this
 * deployment does not fork. It also expects a per-entity export resolver on the
 * backend; fe-invoice, the only module that enables it, sends `{ billExport }`.
 *
 * But both filter panes publish their live filter state to contributions:
 *
 *     React.createElement(Contributions, {
 *       filters: filters,
 *       onChangeFilters: onChangeFilters,
 *       contributionKey: INSUREE_FILTER_CONTRIBUTION_KEY,   // "insuree.Filter"
 *     })
 *
 * So a component contributed to "insuree.Filter" or "claim.Filter" is handed
 * exactly what the operator has filtered on, and can run the query itself. No
 * fork, no backend change, and the export cannot drift from the search: both
 * are built from the same filter objects.
 *
 * HOW A FILTER BECOMES A QUERY
 *
 * Each filter carries a ready-made GraphQL fragment, and the searchers collect
 * them like this (fe-insuree, filtersToQueryParams):
 *
 *     Object.keys(state.filters)
 *       .filter(k => !!state.filters[k]["filter"])
 *       .map(k => state.filters[k]["filter"])
 *
 * This does the same, so what is exported is what is listed.
 */

/* The server rejects a larger page on these connections:
 *   "Requesting 200 records on the `insurees` connection exceeds the `first`
 *    limit of 100 records." */
export const PAGE = 100;

/*
 * A ceiling on the whole export. Without one, an operator who clears every
 * filter asks for the entire register: tens of thousands of rows, a hundred at
 * a time, building a workbook in a tab that will stop responding. The number is
 * generous for any real working list and small enough to stay in memory.
 */
export const MAX_ROWS = 5000;

export const filtersToParams = (filters) =>
  Object.keys(filters ?? {})
    .filter((key) => !!filters[key]?.filter)
    .map((key) => filters[key].filter);

/**
 * Builds an export button bound to one connection.
 *
 * @param {object} spec
 * @param {string} spec.query       the GraphQL connection, e.g. "insurees"
 * @param {string} spec.projection  fields to select on each node
 * @param {Function} spec.columns   (t) => column definitions for the workbook
 * @param {Function} spec.mapRow    (node, ctx) => a flat row object
 * @param {string} spec.fileStem    download name, before the date
 * @param {string} spec.sheetKey    message id for the worksheet tab name
 */
export function createFilterExport(spec) {
  const FilterExport = ({ filters }) => {
    const intl = useIntl();
    const [state, setState] = useState({ busy: false, count: 0, error: null, truncated: false });

    const t = useCallback(
      (id, fallback, values) =>
        intl.formatMessage({ id: `cbhi.${id}`, defaultMessage: fallback }, values),
      [intl],
    );

    const run = useCallback(async () => {
      setState({ busy: true, count: 0, error: null, truncated: false });
      const params = filtersToParams(filters);
      const nodes = [];
      let cursor = null;

      try {
        // Paged rather than asked for in one go, because the server caps the
        // page and because it lets the count on screen move while it works.
        for (;;) {
          const args = [...params, `first: ${PAGE}`];
          if (cursor) args.push(`after: "${cursor}"`);

          // eslint-disable-next-line no-await-in-loop
          const body = await graphql(`query {
            ${spec.query}(${args.join(", ")}) {
              pageInfo { hasNextPage endCursor }
              edges { node { ${spec.projection} } }
            }
          }`);

          const page = body?.data?.[spec.query];
          (page?.edges ?? []).forEach((edge) => {
            if (edge?.node) nodes.push(edge.node);
          });
          setState((s) => ({ ...s, count: nodes.length }));

          if (!page?.pageInfo?.hasNextPage || nodes.length >= MAX_ROWS) {
            setState((s) => ({ ...s, truncated: !!page?.pageInfo?.hasNextPage }));
            break;
          }
          cursor = page.pageInfo.endCursor;
        }

        const detail = nodes.slice(0, MAX_ROWS).map((node) => spec.mapRow(node, { t }));

        const sheets = [
          { name: t(spec.sheetKey, spec.fileStem), columns: spec.columns(t), rows: detail },
        ];

        // The totals sheet goes FIRST in the tab order once it exists: it is
        // what most readers open the file for, and the detail is the backing
        // evidence rather than the headline.
        if (spec.summaryMeasures) {
          sheets.unshift({
            name: t("export.sheet.summary", "Totals by location"),
            columns: summaryColumns(t, spec.summaryMeasures),
            rows: summariseByLocation(detail, spec.summaryMeasures, t),
          });
        }

        downloadWorkbook(
          { sheets },
          // Dated: these get mailed around, and two in a folder with the same
          // name are indistinguishable.
          `${spec.fileStem}-${new Date().toISOString().slice(0, 10)}`,
        );
        setState((s) => ({ ...s, busy: false }));
      } catch (error) {
        setState({
          busy: false,
          count: 0,
          // The server's own words, not a generic failure. Hiding them is what
          // turned a CSRF fault on the cards page into an unexplained blank.
          error: String(error?.message ?? ""),
          truncated: false,
        });
      }
    }, [filters, t]);

    return (
      <Box mt={1} ml={1} mb={1}>
        <Button
          variant="outlined"
          size="small"
          startIcon={state.busy ? <CircularProgress size={16} /> : <GetAppIcon />}
          onClick={run}
          disabled={state.busy}
        >
          {state.busy
            ? t("export.working", "Exporting… {count}", { count: state.count })
            : t("export.action", "Export to Excel")}
        </Button>

        {state.truncated ? (
          <Typography variant="caption" color="textSecondary" display="block">
            {t("export.truncated", "Stopped at {count} rows. Narrow the filters for the rest.", {
              count: MAX_ROWS,
            })}
          </Typography>
        ) : null}

        {state.error ? (
          <Typography variant="caption" color="error" display="block">
            {t("export.failed", "The export failed.")} {state.error}
          </Typography>
        ) : null}
      </Box>
    );
  };

  return FilterExport;
}

/** dd/mm/yyyy as text, so Excel cannot re-read it in the machine's locale. */
const date = (value) => {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : "";
};


/*
 * The location chain, one column per level.
 *
 * openIMIS nests locations as a parent chain rather than as named fields, so
 * four levels means three `parent` hops from the village:
 *
 *     ບ້ານ -> ກຸ່ມບ້ານ -> ເມືອງ -> ແຂວງ
 *
 * Emitted as SEPARATE columns rather than one joined string, because the whole
 * point is to group by them. "Rachla, Achi, District 1" in a single cell cannot
 * be pivoted; four columns can.
 *
 * This is the PATIENT's residence. The claims searcher can only filter by the
 * health facility's location, and only down to district, because a facility is
 * attached at district level and has nothing below it. Carrying the member's
 * own village here is what makes tracking below district possible at all --
 * in the spreadsheet rather than in the filter.
 *
 * currentVillage is preferred over the family's location: an insuree who has
 * moved has the newer address there, and the family's is where they were
 * enrolled.
 */
export const LOCATION_CHAIN = `
  currentVillage { name parent { name parent { name parent { name } } } }
  family { location { name parent { name parent { name parent { name } } } } }
`;

export const locationLevels = (insuree) => {
  const v = insuree?.currentVillage ?? insuree?.family?.location;
  return {
    village: v?.name ?? "",
    municipality: v?.parent?.name ?? "",
    district: v?.parent?.parent?.name ?? "",
    region: v?.parent?.parent?.parent?.name ?? "",
  };
};

export const locationColumns = (t) => [
  { key: "region", header: t("export.column.region", "Region"), width: 16 },
  { key: "district", header: t("export.column.district", "District"), width: 16 },
  { key: "municipality", header: t("export.column.municipality", "Municipality"), width: 18 },
  { key: "village", header: t("export.column.village", "Village"), width: 18 },
];


/*
 * Totals by location, as a second sheet.
 *
 * The claims searcher can only filter down to district, and only by the health
 * facility's location. Row-level export plus a pivot table answers the rest --
 * but "how much was claimed in this village" should not require the reader to
 * know how to build a pivot table, so the totals are computed here.
 *
 * ONE TABLE, NOT FOUR. Each row is one place at one level, and the ລະດັບ column
 * says which level it is. That way a reader who wants districts filters the
 * column, and a reader who wants everything sees the hierarchy in one place --
 * where four separate tables would have to be scrolled between and could not be
 * sorted against each other.
 *
 * Every level is grouped on its FULL PATH, not its own name. Two districts in
 * different provinces can share a name, and a village name repeats often; keyed
 * on the name alone their totals would silently merge into one wrong figure.
 */
export const LEVELS = ["region", "district", "municipality", "village"];

export const summariseByLocation = (rows, measures, t) => {
  const out = [];

  LEVELS.forEach((level, depth) => {
    const path = LEVELS.slice(0, depth + 1);
    const groups = new Map();

    rows.forEach((row) => {
      // A row with nothing recorded at this level is counted at the levels it
      // does have and skipped here, rather than being pooled under a blank.
      if (!row[level]) return;
      const key = path.map((p) => row[p] ?? "").join(" › ");
      if (!groups.has(key)) {
        const seed = { level: t(`export.column.${level}`, level), count: 0 };
        path.forEach((p) => { seed[p] = row[p] ?? ""; });
        measures.forEach((m) => { seed[m] = 0; });
        groups.set(key, seed);
      }
      const g = groups.get(key);
      g.count += 1;
      measures.forEach((m) => {
        const v = Number(row[m]);
        if (Number.isFinite(v)) g[m] += v;
      });
    });

    out.push(...[...groups.values()].sort((a, b) =>
      path.map((p) => a[p]).join().localeCompare(path.map((p) => b[p]).join()),
    ));
  });

  return out;
};

export const summaryColumns = (t, measures) => [
  { key: "level", header: t("export.column.level", "Level"), width: 14 },
  ...locationColumns(t),
  { key: "count", header: t("export.column.claimCount", "Claims"), width: 11 },
  ...measures.map((m) => ({
    key: m,
    header: t(`export.column.${m}`, m),
    width: 17,
  })),
];


/*
 * Totals per member.
 *
 * The claims searcher can already filter to ONE member -- insuree_ChfId, the
 * ເລກຜູ້ເອົາປະກັນ box -- so finding a person's claims was never the gap. What
 * was missing is the other direction: across a period, which members claimed,
 * how often, and for how much. That is the question behind "track by insuree",
 * and it is also how over-utilisation shows itself.
 *
 * Grouped on chfId rather than on the name. Two members can share a name, and
 * this deployment has no unique constraint on the insurance number either -- so
 * where a number HAS been duplicated, their claims merge into one row. That is
 * a fault worth seeing rather than hiding: a member row whose name column
 * disagrees with itself is the duplicate showing up in daily work.
 */
export const summariseByInsuree = (rows, measures) => {
  const groups = new Map();

  rows.forEach((row) => {
    const key = row.chfId;
    if (!key) return; // a claim with no insurance number cannot be attributed
    if (!groups.has(key)) {
      groups.set(key, {
        chfId: key,
        insuree: row.insuree ?? "",
        region: row.region ?? "",
        district: row.district ?? "",
        municipality: row.municipality ?? "",
        village: row.village ?? "",
        count: 0,
        ...Object.fromEntries(measures.map((m) => [m, 0])),
      });
    }
    const g = groups.get(key);
    g.count += 1;
    measures.forEach((m) => {
      const v = Number(row[m]);
      if (Number.isFinite(v)) g[m] += v;
    });
  });

  // Heaviest first: a totals-by-member list is read from the top.
  return [...groups.values()].sort((a, b) => (b[measures[0]] ?? 0) - (a[measures[0]] ?? 0));
};

export const insureeSummaryColumns = (t, measures) => [
  { key: "chfId", header: t("filter.chfId", "Insurance number"), width: 18 },
  { key: "insuree", header: t("slips.column.member", "Member"), width: 24 },
  ...locationColumns(t),
  { key: "count", header: t("export.column.claimCount", "Records"), width: 11 },
  ...measures.map((m) => ({ key: m, header: t(`export.column.${m}`, m), width: 17 })),
];

/* --- Insurees ------------------------------------------------------------- */

export const InsureeExport = createFilterExport({
  query: "insurees",
  projection: `
    chfId lastName otherNames dob cardIssued
    gender { code }
    healthFacility { code name }
    ${LOCATION_CHAIN}
  `,
  fileStem: "insurees",
  sheetKey: "export.sheet.members",
  // Members have no amount, so the totals sheet counts them per place. Still
  // the question most often asked of a member list: how many, and where.
  summaryMeasures: [],
  columns: (t) => [
    { key: "chfId", header: t("filter.chfId", "Insurance number"), width: 18 },
    { key: "lastName", header: t("export.column.lastName", "Family name"), width: 18 },
    { key: "otherNames", header: t("export.column.otherNames", "Given names"), width: 18 },
    { key: "gender", header: t("export.column.gender", "Gender"), width: 10 },
    { key: "dob", header: t("export.column.dob", "Date of birth"), width: 14 },
    ...locationColumns(t),
    { key: "facility", header: t("export.column.facility", "Health facility"), width: 26 },
    { key: "cardIssued", header: t("export.column.cardIssued", "Card issued"), width: 12 },
  ],
  mapRow: (n, { t }) => {
    return {
      ...locationLevels(n),
      // Text, always. An insurance number that loses its leading zero in Excel
      // no longer matches the member it belongs to -- see xlsx.js.
      chfId: n.chfId ?? "",
      lastName: n.lastName ?? "",
      otherNames: n.otherNames ?? "",
      gender: n?.gender?.code ?? "",
      dob: date(n.dob),
      facility: n?.healthFacility?.name ?? "",
      cardIssued: n.cardIssued ? t("photo.yes", "Yes") : t("photo.no", "No"),
    };
  },
});

/* --- Claims --------------------------------------------------------------- */

export const ClaimExport = createFilterExport({
  query: "claims",
  projection: `
    code dateClaimed dateProcessed status reviewStatus feedbackStatus
    claimed approved
    healthFacility { code name }
    insuree { chfId lastName otherNames ${LOCATION_CHAIN} }
  `,
  fileStem: "claims",
  sheetKey: "export.sheet.claims",
  // Summed per place, at all four levels. Both figures, because the gap between
  // them is what a reviewer is looking at.
  summaryMeasures: ["claimed", "approved"],
  columns: (t) => [
    { key: "code", header: t("export.column.claimCode", "Claim number"), width: 18 },
    { key: "chfId", header: t("filter.chfId", "Insurance number"), width: 18 },
    { key: "insuree", header: t("slips.column.member", "Member"), width: 24 },
    // The member's own residence, which the searcher cannot filter on. This is
    // what allows tracking below district -- by pivoting, not by filtering.
    ...locationColumns(t),
    { key: "facility", header: t("export.column.facility", "Health facility"), width: 26 },
    { key: "dateClaimed", header: t("export.column.dateClaimed", "Claimed on"), width: 13 },
    { key: "dateProcessed", header: t("export.column.dateProcessed", "Processed on"), width: 13 },
    { key: "status", header: t("export.column.status", "Status"), width: 12 },
    { key: "reviewStatus", header: t("export.column.reviewStatus", "Review"), width: 12 },
    { key: "feedbackStatus", header: t("export.column.feedbackStatus", "Feedback"), width: 12 },
    { key: "claimed", header: t("export.column.claimed", "Claimed (LAK)"), width: 15 },
    { key: "approved", header: t("export.column.approved", "Approved (LAK)"), width: 15 },
  ],
  mapRow: (n) => ({
    ...locationLevels(n?.insuree),
    code: n.code ?? "",
    chfId: n?.insuree?.chfId ?? "",
    insuree: [n?.insuree?.otherNames, n?.insuree?.lastName].filter(Boolean).join(" "),
    facility: n?.healthFacility?.name ?? "",
    dateClaimed: date(n.dateClaimed),
    dateProcessed: date(n.dateProcessed),
    // Numeric codes as openIMIS stores them. Translating them here would mean
    // keeping a second copy of the status vocabulary in step with fe-claim's.
    status: n.status ?? "",
    reviewStatus: n.reviewStatus ?? "",
    feedbackStatus: n.feedbackStatus ?? "",
    // Numbers, so the columns can be summed -- a total is the first thing
    // anyone does with a claims export.
    claimed: num(n.claimed),
    approved: num(n.approved),
  }),
});
