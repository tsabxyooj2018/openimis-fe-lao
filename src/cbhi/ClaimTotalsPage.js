import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import {
  Checkbox,
  Box,
  Button,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";
import GetAppIcon from "@material-ui/icons/GetApp";
import AssessmentIcon from "@material-ui/icons/Assessment";
import { graphql } from "../helpers/csrf";
import { downloadWorkbook } from "./xlsx";
import {
  LEVELS,
  LOCATION_CHAIN,
  MAX_ROWS,
  PAGE,
  insureeSummaryColumns,
  locationLevels,
  summariseByInsuree,
  summariseByLocation,
  summaryColumns,
} from "./FilterExport";

/*
 * Claim totals by region, district, municipality and village.
 *
 * The Export button in the claims filter panel already produces these totals,
 * but it is a filter-panel affordance: you have to know it is there. A total by
 * place is a question people ask directly -- "how much was claimed in Xaythany
 * last month" -- so it gets its own entry under ຄຳຮ້ອງເບີກຈ່າຍ and answers on
 * screen, with the spreadsheet as an option rather than the only route.
 *
 * WHY THE MEMBER'S ADDRESS AND NOT THE FACILITY'S
 *
 * openIMIS can only filter claims by the treating facility's location, and only
 * down to district: a facility hangs off a district and has nothing beneath it.
 * Totals here are grouped by the MEMBER's registered address instead, which is
 * what reaches ກຸ່ມບ້ານ and ບ້ານ. The two answer different questions and will
 * not agree -- a resident of one district treated in another counts under their
 * home district here, and under the hospital's district in the searcher.
 *
 * The filters below are the ones fe-claim's own searcher sends, verified
 * against it rather than guessed:
 *
 *   dateClaimed_Gte / dateClaimed_Lte     the claimed date range
 *   status                                the pipeline status
 */

const STATUSES = [2, 4, 8, 16, 1];

/*
 * Filters carried in the address, so the home page can link straight to an
 * answer instead of to an empty form.
 *
 * openIMIS's own searchers cannot do this -- their filters live in component
 * state and nothing reads the query string -- which is why the home page's
 * claim tiles point here rather than at the claims searcher. This page is ours,
 * so it can be linked into.
 *
 * Only the three that a link would want. Anything else is left to the form.
 */
const paramsFromUrl = () => {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const out = {};
  ["from", "to", "status"].forEach((key) => {
    const value = q.get(key);
    if (value) out[key] = value;
  });
  return out;
};

const ClaimTotalsPage = () => {
  const intl = useIntl();
  // Read once, at mount. A later edit in the form must not be undone by the
  // address bar still carrying what it was opened with.
  const [initial] = useState(paramsFromUrl);
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const [status, setStatus] = useState(initial.status ?? "");
  const [level, setLevel] = useState("district");
  const [groupBy, setGroupBy] = useState("location");
  const [chfId, setChfId] = useState("");
  const [rows, setRows] = useState([]);
  const [byInsuree, setByInsuree] = useState([]);
  const [state, setState] = useState({
    busy: false,
    count: 0,
    error: null,
    ran: false,
    truncated: false,
  });

  const t = useCallback(
    (id, fallback, values) =>
      intl.formatMessage({ id: `cbhi.${id}`, defaultMessage: fallback }, values),
    [intl],
  );

  const run = useCallback(async () => {
    setState({ busy: true, count: 0, error: null, ran: false, truncated: false });

    const params = [];
    if (from) params.push(`dateClaimed_Gte: "${from}"`);
    if (to) params.push(`dateClaimed_Lte: "${to}"`);
    if (status) params.push(`status: ${status}`);
    // The same filter the claims searcher's ເລກຜູ້ເອົາປະກັນ box sends, so one
    // member's totals here and their claim list there cannot disagree.
    if (chfId.trim()) params.push(`insuree_ChfId: "${chfId.trim().replace(/"/g, "")}"`);

    const nodes = [];
    let cursor = null;

    try {
      for (;;) {
        const args = [...params, `first: ${PAGE}`];
        if (cursor) args.push(`after: "${cursor}"`);

        // eslint-disable-next-line no-await-in-loop
        const body = await graphql(`query {
          claims(${args.join(", ")}) {
            pageInfo { hasNextPage endCursor }
            edges { node {
              claimed approved
              insuree { chfId lastName otherNames ${LOCATION_CHAIN} }
            } }
          }
        }`);

        const page = body?.data?.claims;
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

      const detail = nodes.slice(0, MAX_ROWS).map((n) => ({
        ...locationLevels(n?.insuree),
        chfId: n?.insuree?.chfId ?? "",
        insuree: [n?.insuree?.otherNames, n?.insuree?.lastName].filter(Boolean).join(" "),
        claimed: Number(n.claimed) || 0,
        approved: Number(n.approved) || 0,
      }));

      // Both groupings from the one fetch: switching between them is a question
      // about the same claims, and re-querying to answer it would be wasteful
      // and could return a different set if data changed in between.
      setRows(summariseByLocation(detail, ["claimed", "approved"], t));
      setByInsuree(summariseByInsuree(detail, ["claimed", "approved"]));
      setState((s) => ({ ...s, busy: false, ran: true }));
    } catch (error) {
      setRows([]);
      setByInsuree([]);
      setState({
        busy: false,
        count: 0,
        // The server's own words rather than a generic failure.
        error: String(error?.message ?? ""),
        ran: true,
        truncated: false,
      });
    }
  }, [from, to, status, chfId, t]);

  /*
   * Run straight away when the page was opened with filters in the address.
   *
   * Someone arriving from a tile on the home page has already said what they
   * want; making them press Search again to see it would be asking the same
   * question twice. Opened without filters, this does nothing and the page
   * waits, as it did before -- an unfiltered run would sweep every claim on
   * record for somebody who has not asked for anything yet.
   *
   * The ref, not the dependency list, is what keeps it to once. `run` is
   * rebuilt whenever a filter changes, so depending on it would re-run the
   * whole query on every keystroke in the date box.
   */
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    if (!initial.from && !initial.to && !initial.status) return;
    autoRan.current = true;
    run();
  }, [initial, run]);

  // The level names are translated inside summariseByLocation, so the on-screen
  // filter compares against the same translated value rather than the key.
  const levelLabel = (key) => t(`export.column.${key}`, key);
  const shown = useMemo(
    () =>
      groupBy === "insuree" ? byInsuree : rows.filter((r) => r.level === levelLabel(level)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, byInsuree, groupBy, level, intl],
  );

  /*
   * Which places are counted in the Total.
   *
   * The identity is the one the table already used for its React key -- the
   * full location path, or the insurance number when grouped by member -- so a
   * tick follows a row rather than its position, and re-sorting or recalculating
   * cannot transfer a selection from one place to another.
   */
  const rowKey = useCallback(
    (r) => (groupBy === "insuree" ? r.chfId : LEVELS.map((k) => r[k]).join("|")),
    [groupBy],
  );

  const [picked, setPicked] = useState(() => new Set());

  /*
   * Everything on screen starts ticked.
   *
   * So the page behaves exactly as it did until somebody chooses to narrow it,
   * and narrowing is subtraction from a complete answer rather than assembling
   * one from an empty table. Starting empty would show a Total of zero beside a
   * table full of figures, which reads as a broken page.
   *
   * Re-ticks whenever the visible set changes -- a new calculation, a different
   * level, a different grouping -- because those are different rows, and
   * carrying a selection across them would silently keep or drop places nobody
   * chose.
   */
  useEffect(() => {
    setPicked(new Set(shown.map(rowKey)));
  }, [shown, rowKey]);

  const chosen = useMemo(
    () => shown.filter((r) => picked.has(rowKey(r))),
    [shown, picked, rowKey],
  );

  const allPicked = shown.length > 0 && chosen.length === shown.length;
  const somePicked = chosen.length > 0 && !allPicked;

  const toggleRow = (key) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = () =>
    setPicked(allPicked ? new Set() : new Set(shown.map(rowKey)));

  const totals = useMemo(
    () =>
      chosen.reduce(
        (a, r) => ({
          count: a.count + r.count,
          claimed: a.claimed + r.claimed,
          approved: a.approved + r.approved,
        }),
        { count: 0, claimed: 0, approved: 0 },
      ),
    [chosen],
  );

  const money = (n) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

  /*
   * Export exactly what is on screen.
   *
   * This used to write both groupings and every level, whatever the view was
   * set to, on the reasoning that the file is the record and the extra half
   * costs nothing. That reasoning was wrong twice over.
   *
   * It surprised people. A button labelled "Export to Excel" sitting beside a
   * filtered table means "export this table". Someone looking at three
   * villages and receiving four levels plus a by-member sheet has to work out
   * what they are holding before they can use it.
   *
   * And it was inconsistent with the rest of the deployment. The export on
   * openIMIS's own insuree and claim searchers gives you precisely what the
   * filters produced. Two exports in one application should not mean two
   * different things.
   *
   * `shown` is the same array the table renders, so the sheet and the screen
   * cannot disagree.
   */
  const exportAll = () => {
    const byMember = groupBy === "insuree";
    downloadWorkbook(
      {
        sheets: [
          {
            name: byMember
              ? t("export.sheet.byInsuree", "Totals by member")
              : t("export.sheet.summary", "Totals by location"),
            columns: byMember
              ? insureeSummaryColumns(t, ["claimed", "approved"])
              : summaryColumns(t, ["claimed", "approved"]),
            rows: chosen,
          },
        ],
      },
      // The level is in the filename, so two exports taken minutes apart at
      // different levels do not overwrite each other in the downloads folder.
      `claim-totals-${byMember ? "by-member" : level}-${new Date().toISOString().slice(0, 10)}`,
    );
  };

  return (
    <Box p={2}>
      <Paper elevation={1}>
        <Box p={2}>
          <Typography variant="h6">
            {t("totals.page.title", "Claim totals by location")}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {t(
              "totals.page.description",
              "Totalled by the member's registered address, which is what reaches municipality and village. The claims list can only filter by the treating facility, and only to district.",
            )}
          </Typography>

          <Box mt={2} display="flex" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <TextField
              type="date"
              label={t("totals.from", "Claimed from")}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="date"
              label={t("totals.to", "Claimed to")}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              select
              label={t("totals.status", "Status")}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ minWidth: 170 }}
            >
              <MenuItem value="">{t("totals.anyStatus", "Any")}</MenuItem>
              {STATUSES.map((code) => (
                <MenuItem key={code} value={code}>
                  {intl.formatMessage({
                    id: `claim.claimStatus.${code}`,
                    defaultMessage: String(code),
                  })}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label={t("filter.chfId", "Insurance number")}
              placeholder={t("totals.chfIdHint", "One member, or leave blank for all")}
              value={chfId}
              onChange={(e) => setChfId(e.target.value)}
              style={{ minWidth: 210 }}
            />

            <Button
              variant="contained"
              color="primary"
              startIcon={
                state.busy ? <CircularProgress size={18} color="inherit" /> : <AssessmentIcon />
              }
              onClick={run}
              disabled={state.busy}
            >
              {state.busy
                ? t("export.working", "Exporting… {count}", { count: state.count })
                : t("totals.calculate", "Calculate")}
            </Button>

            <Button
              variant="outlined"
              startIcon={<GetAppIcon />}
              onClick={exportAll}
              // shown, not rows: the button now exports the visible table, so
              // it should be dead exactly when that table is empty. Keyed on
              // rows it stayed live at a level with no places and handed back
              // a workbook with nothing but headings in it.
              disabled={!chosen.length}
            >
              {t("export.action", "Export to Excel")}
            </Button>
          </Box>

          {state.error ? (
            <Box mt={2}>
              <Alert severity="error">
                {t("export.failed", "The export failed.")} {state.error}
              </Alert>
            </Box>
          ) : null}

          {state.truncated ? (
            <Box mt={2}>
              <Alert severity="info">
                {t("export.truncated", "Stopped at {count} rows.", { count: MAX_ROWS })}
              </Alert>
            </Box>
          ) : null}
        </Box>
      </Paper>

      {state.ran && !state.error ? (
        <Box mt={2}>
          <Paper elevation={1}>
            <Box p={2} pb={1} display="flex" style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <TextField
                select
                label={t("totals.groupBy", "Group by")}
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
                style={{ minWidth: 190 }}
              >
                <MenuItem value="location">{t("totals.byLocation", "Location")}</MenuItem>
                <MenuItem value="insuree">{t("totals.byInsuree", "Member")}</MenuItem>
              </TextField>

              {/* Only meaningful for the location grouping: a member is a member
                  at every level. */}
              {groupBy === "location" ? (
                <TextField
                  select
                  label={t("totals.level", "Level")}
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  style={{ minWidth: 170 }}
                >
                  {LEVELS.map((key) => (
                    <MenuItem key={key} value={key}>
                      {levelLabel(key)}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
              <Typography variant="body2" color="textSecondary">
                {/* Two strings that already exist in both languages: the
                     plain count while everything is ticked, and the
                     found/selected pair once it has been narrowed. */}
                {allPicked
                  ? t("totals.places", "{count} places", { count: shown.length })
                  : t("results.count", "{found} found · {selected} selected", {
                      found: shown.length,
                      selected: chosen.length,
                    })}
              </Typography>
            </Box>
            <Divider />

            {shown.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          color="primary"
                          checked={allPicked}
                          indeterminate={somePicked}
                          onChange={toggleAll}
                          inputProps={{ "aria-label": t("slips.selectAll", "Select all") }}
                        />
                      </TableCell>
                      {groupBy === "insuree" ? (
                        <>
                          <TableCell>{t("filter.chfId", "Insurance number")}</TableCell>
                          <TableCell>{t("slips.column.member", "Member")}</TableCell>
                          <TableCell>{levelLabel("village")}</TableCell>
                          <TableCell>{levelLabel("district")}</TableCell>
                        </>
                      ) : (
                        LEVELS.slice(0, LEVELS.indexOf(level) + 1).map((key) => (
                          <TableCell key={key}>{levelLabel(key)}</TableCell>
                        ))
                      )}
                      <TableCell align="right">
                        {t("export.column.claimCount", "Records")}
                      </TableCell>
                      <TableCell align="right">
                        {t("export.column.claimed", "Claimed (LAK)")}
                      </TableCell>
                      <TableCell align="right">
                        {t("export.column.approved", "Approved (LAK)")}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shown.map((r) => {
                      const key = rowKey(r);
                      return (
                      <TableRow key={key} hover>
                        <TableCell padding="checkbox">
                          <Checkbox
                            color="primary"
                            checked={picked.has(key)}
                            onChange={() => toggleRow(key)}
                          />
                        </TableCell>
                        {groupBy === "insuree" ? (
                          <>
                            <TableCell>{r.chfId}</TableCell>
                            <TableCell>{r.insuree}</TableCell>
                            <TableCell>{r.village}</TableCell>
                            <TableCell>{r.district}</TableCell>
                          </>
                        ) : (
                          LEVELS.slice(0, LEVELS.indexOf(level) + 1).map((key) => (
                            <TableCell key={key}>{r[key]}</TableCell>
                          ))
                        )}
                        <TableCell align="right">{r.count}</TableCell>
                        <TableCell align="right">{money(r.claimed)}</TableCell>
                        <TableCell align="right">{money(r.approved)}</TableCell>
                      </TableRow>
                      );
                    })}
                    {/* The total of what is on screen. At region level it is the
                        grand total; at deeper levels it is lower whenever a
                        member has no village recorded, and that gap is worth
                        seeing rather than hiding. */}
                    <TableRow>
                      {/* +1 for the checkbox column. */}
                      <TableCell colSpan={(groupBy === "insuree" ? 4 : LEVELS.indexOf(level) + 1) + 1}>
                        <b>{t("totals.total", "Total")}</b>
                      </TableCell>
                      <TableCell align="right"><b>{totals.count}</b></TableCell>
                      <TableCell align="right"><b>{money(totals.claimed)}</b></TableCell>
                      <TableCell align="right"><b>{money(totals.approved)}</b></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box p={2}>
                <Typography variant="body2">
                  {t("totals.empty", "No claim in that range has a member with an address recorded.")}
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      ) : null}
    </Box>
  );
};

export default ClaimTotalsPage;
