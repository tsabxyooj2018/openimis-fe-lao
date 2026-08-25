import React, { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  LinearProgress,
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
import TimerIcon from "@material-ui/icons/Timer";
import { downloadWorkbook } from "./xlsx";
import { fetchClaimAgeing, summariseByFacility, MAX_CLAIMS } from "./ageingApi";

/*
 * How long claims take to be processed, by health facility.
 *
 * WHY THIS PAGE EXISTS
 *
 * The NHI Strategy 2021-2025 carries this as a numbered indicator, with a
 * baseline and a target already published:
 *
 *   "Reimbursement delays less than 30 days from central to provincial,
 *    district and health centre levels (% of facilities)"   15% -> 50%
 *
 * It is unusual to be handed the acceptance criterion by the ministry. Most of
 * what this deployment builds is judged by whether it looks right; this is
 * judged against a number somebody already wrote down.
 *
 * WHAT IT MEASURES, AND WHAT IT DOES NOT
 *
 * Reimbursement is money arriving at a facility, and that happens in the
 * treasury -- openIMIS never sees it. What openIMIS holds is its own half:
 * dateClaimed to dateProcessed.
 *
 * So this is the PROCESSING clock, and it is a lower bound on the reimbursement
 * clock. A claim cannot be paid before it is processed, but it can certainly be
 * processed and then wait -- the strategy's own situation analysis blames
 * "recurrent delays in budget execution by the Ministry of Finance" for much of
 * the delay, and reimbursements "often delayed by several months".
 *
 * The page says so on its face. A facility reading green here may still be
 * waiting for money, and an operator who does not know that will draw the wrong
 * conclusion from a chart that looks authoritative.
 */

const TARGET_DAYS = 30;

/*
 * Grouped thousands, no decimals -- the same treatment amounts get on the slip
 * and for the same reason: the kip has no subunit in practice. Day counts are
 * small, but the claim counts beside them are not.
 */
const formatCount = (value) =>
  Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-US").format(Number(value)) : "—";

const formatRate = (rate) => (rate === null || rate === undefined ? "—" : `${Math.round(rate * 100)}%`);

/** Today, as an ISO date, for the default range. */
const isoDaysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

const ClaimAgeingPage = () => {
  const intl = useIntl();
  const t = useCallback(
    (id, fallback, values) =>
      intl.formatMessage({ id: `cbhi.${id}`, defaultMessage: fallback }, values),
    [intl],
  );

  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [state, setState] = useState({
    busy: false,
    ran: false,
    error: null,
    truncated: false,
    fetched: 0,
  });
  const [claims, setClaims] = useState([]);

  const summary = useMemo(() => summariseByFacility(claims, TARGET_DAYS), [claims]);

  const run = useCallback(async () => {
    setState({ busy: true, ran: false, error: null, truncated: false, fetched: 0 });
    setClaims([]);
    try {
      const { claims: found, truncated } = await fetchClaimAgeing({
        from: from || null,
        to: to || null,
        onProgress: (n) => setState((s) => ({ ...s, fetched: n })),
      });
      setClaims(found);
      setState({ busy: false, ran: true, error: null, truncated, fetched: found.length });
    } catch (error) {
      setClaims([]);
      // The server's own words rather than a generic failure -- the same choice
      // the other CBHI pages make, because "search failed" tells an operator
      // nothing they can act on.
      setState({
        busy: false,
        ran: true,
        error: String(error?.message ?? ""),
        truncated: false,
        fetched: 0,
      });
    }
  }, [from, to]);

  const exportRows = useCallback(() => {
    downloadWorkbook(
      {
        name: t("ageing.sheet", "Processing time"),
        columns: [
          { key: "code", label: t("ageing.col.code", "Facility code") },
          { key: "name", label: t("ageing.col.name", "Health facility") },
          { key: "total", label: t("ageing.col.claims", "Claims") },
          { key: "settled", label: t("ageing.col.settled", "Processed") },
          { key: "pending", label: t("ageing.col.pending", "Still open") },
          { key: "median", label: t("ageing.col.median", "Median days") },
          { key: "longest", label: t("ageing.col.longest", "Longest days") },
          { key: "withinTarget", label: t("ageing.col.within", "Within {days} days", { days: TARGET_DAYS }) },
          { key: "ratePct", label: t("ageing.col.rate", "% within target") },
          { key: "oldestPending", label: t("ageing.col.oldest", "Oldest still open (days)") },
        ],
        rows: summary.rows.map((row) => ({
          ...row,
          ratePct: row.rate === null ? "" : Math.round(row.rate * 100),
        })),
      },
      // Dated, like the other exports: these get mailed around, and two in a
      // folder with the same name are indistinguishable.
      `claim-processing-${from || "all"}-to-${to || "all"}-${new Date().toISOString().slice(0, 10)}`,
    );
  }, [summary.rows, from, to, t]);

  return (
    <Box p={2}>
      <Paper>
        <Box p={2} display="flex" alignItems="center">
          <TimerIcon style={{ marginRight: 8 }} />
          <Typography variant="h6">
            {t("ageing.title", "Claim processing time by facility")}
          </Typography>
        </Box>
        <Divider />

        <Box p={2} display="flex" flexWrap="wrap" alignItems="center" style={{ gap: 16 }}>
          <TextField
            type="date"
            label={t("ageing.from", "Claimed from")}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="date"
            label={t("ageing.to", "Claimed to")}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" color="primary" onClick={run} disabled={state.busy}>
            {state.busy ? (
              <CircularProgress size={20} />
            ) : (
              t("ageing.run", "Measure")
            )}
          </Button>
          {summary.rows.length ? (
            <Button startIcon={<GetAppIcon />} onClick={exportRows}>
              {t("export.action", "Export to Excel")}
            </Button>
          ) : null}
        </Box>

        {state.busy ? (
          <Box px={2} pb={2}>
            <LinearProgress />
            <Typography variant="caption">
              {t("ageing.fetching", "{count} claims read…", { count: formatCount(state.fetched) })}
            </Typography>
          </Box>
        ) : null}
      </Paper>

      {/*
        The range is on the CLAIMED date, not the processed date, and the page
        says so. Filtering on when a claim was processed drops every claim still
        waiting -- exactly the ones the indicator is about -- and every facility
        then looks punctual.
      */}
      <Box mt={1}>
        <Typography variant="caption" color="textSecondary">
          {t(
            "ageing.rangeNote",
            "Of the claims raised in this period, where have they got to. Claims still open are counted, not dropped.",
          )}
        </Typography>
      </Box>

      {state.error ? (
        <Box mt={2}>
          <Alert severity="error">{state.error}</Alert>
        </Box>
      ) : null}

      {state.truncated ? (
        <Box mt={2}>
          <Alert severity="warning">
            {t("ageing.truncated", "Showing the first {count} claims. Narrow the period to reach the rest.", {
              count: formatCount(MAX_CLAIMS),
            })}
          </Alert>
        </Box>
      ) : null}

      {state.ran && !state.error && !summary.rows.length ? (
        <Box mt={2}>
          <Alert severity="info">
            {t("ageing.empty", "No claims were raised in that period.")}
          </Alert>
        </Box>
      ) : null}

      {summary.rows.length ? (
        <>
          <Box mt={2}>
            <Paper>
              <Box p={2}>
                <Typography variant="subtitle1">
                  {t("ageing.headline", "{meeting} of {scored} facilities process the typical claim within {days} days", {
                    meeting: summary.meeting,
                    scored: summary.scored,
                    days: TARGET_DAYS,
                  })}
                  {"  "}
                  <strong>{formatRate(summary.facilityRate)}</strong>
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {t(
                    "ageing.baseline",
                    "The NHI Strategy 2021–2025 records a baseline of 15% and a target of 50% for this measure.",
                  )}
                </Typography>
                {summary.unscored ? (
                  <Typography variant="body2" color="textSecondary">
                    {t(
                      "ageing.unscored",
                      "{count} facility(s) have no processed claim in this period and are not scored.",
                      { count: summary.unscored },
                    )}
                  </Typography>
                ) : null}
                {summary.pending ? (
                  <Typography variant="body2" color="textSecondary">
                    {t("ageing.pending", "{count} claims are still open.", {
                      count: formatCount(summary.pending),
                    })}
                  </Typography>
                ) : null}
                <Box mt={1}>
                  <Typography variant="caption" color="textSecondary">
                    {t(
                      "ageing.caveat",
                      "This measures claim entry to processing, which openIMIS records. It does not measure money reaching the facility, which happens in the treasury — a facility that reads well here may still be waiting to be paid.",
                    )}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Box>

          <Box mt={2}>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("ageing.col.code", "Facility code")}</TableCell>
                    <TableCell>{t("ageing.col.name", "Health facility")}</TableCell>
                    <TableCell align="right">{t("ageing.col.claims", "Claims")}</TableCell>
                    <TableCell align="right">{t("ageing.col.settled", "Processed")}</TableCell>
                    <TableCell align="right">{t("ageing.col.pending", "Still open")}</TableCell>
                    <TableCell align="right">{t("ageing.col.median", "Median days")}</TableCell>
                    <TableCell align="right">{t("ageing.col.longest", "Longest days")}</TableCell>
                    <TableCell align="right">{t("ageing.col.rate", "% within target")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.rows.map((row) => (
                    <TableRow key={row.uuid}>
                      <TableCell>{row.code}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell align="right">{formatCount(row.total)}</TableCell>
                      <TableCell align="right">{formatCount(row.settled)}</TableCell>
                      <TableCell align="right">
                        {row.pending
                          ? `${formatCount(row.pending)}${
                              row.oldestPending !== null ? ` (${row.oldestPending}d)` : ""
                            }`
                          : "—"}
                      </TableCell>
                      <TableCell align="right">
                        {row.median === null ? "—" : row.median}
                      </TableCell>
                      <TableCell align="right">
                        {row.longest === null ? "—" : row.longest}
                      </TableCell>
                      <TableCell align="right">{formatRate(row.rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </>
      ) : null}
    </Box>
  );
};

export default ClaimAgeingPage;
