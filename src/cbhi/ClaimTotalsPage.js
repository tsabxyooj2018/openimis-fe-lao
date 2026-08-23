import React, { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import {
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
  locationLevels,
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

const ClaimTotalsPage = () => {
  const intl = useIntl();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [level, setLevel] = useState("district");
  const [rows, setRows] = useState([]);
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
              insuree { ${LOCATION_CHAIN} }
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
        claimed: Number(n.claimed) || 0,
        approved: Number(n.approved) || 0,
      }));

      setRows(summariseByLocation(detail, ["claimed", "approved"], t));
      setState((s) => ({ ...s, busy: false, ran: true }));
    } catch (error) {
      setRows([]);
      setState({
        busy: false,
        count: 0,
        // The server's own words rather than a generic failure.
        error: String(error?.message ?? ""),
        ran: true,
        truncated: false,
      });
    }
  }, [from, to, status, t]);

  // The level names are translated inside summariseByLocation, so the on-screen
  // filter compares against the same translated value rather than the key.
  const levelLabel = (key) => t(`export.column.${key}`, key);
  const shown = useMemo(
    () => rows.filter((r) => r.level === levelLabel(level)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, level, intl],
  );

  const totals = useMemo(
    () =>
      shown.reduce(
        (a, r) => ({
          count: a.count + r.count,
          claimed: a.claimed + r.claimed,
          approved: a.approved + r.approved,
        }),
        { count: 0, claimed: 0, approved: 0 },
      ),
    [shown],
  );

  const money = (n) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

  const exportAll = () => {
    downloadWorkbook(
      {
        sheets: [
          {
            name: t("export.sheet.summary", "Totals by location"),
            columns: summaryColumns(t, ["claimed", "approved"]),
            // Every level, not only the one on screen: the sheet is the record,
            // and the level column makes the others one filter away.
            rows,
          },
        ],
      },
      `claim-totals-${new Date().toISOString().slice(0, 10)}`,
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
              disabled={!rows.length}
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
              <Typography variant="body2" color="textSecondary">
                {t("totals.places", "{count} places", { count: shown.length })}
              </Typography>
            </Box>
            <Divider />

            {shown.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {LEVELS.slice(0, LEVELS.indexOf(level) + 1).map((key) => (
                        <TableCell key={key}>{levelLabel(key)}</TableCell>
                      ))}
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
                    {shown.map((r) => (
                      <TableRow key={LEVELS.map((k) => r[k]).join("|")} hover>
                        {LEVELS.slice(0, LEVELS.indexOf(level) + 1).map((key) => (
                          <TableCell key={key}>{r[key]}</TableCell>
                        ))}
                        <TableCell align="right">{r.count}</TableCell>
                        <TableCell align="right">{money(r.claimed)}</TableCell>
                        <TableCell align="right">{money(r.approved)}</TableCell>
                      </TableRow>
                    ))}
                    {/* The total of what is on screen. At region level it is the
                        grand total; at deeper levels it is lower whenever a
                        member has no village recorded, and that gap is worth
                        seeing rather than hiding. */}
                    <TableRow>
                      <TableCell colSpan={LEVELS.indexOf(level) + 1}>
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
