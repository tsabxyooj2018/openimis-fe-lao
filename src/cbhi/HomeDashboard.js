import React, { useCallback, useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { Box, Grid, Paper, Typography } from "@material-ui/core";
import { CLAIM_STATUSES, fetchDashboard } from "./dashboardApi";

/*
 * Figures on the home page.
 *
 * WHY THIS IS A CONTRIBUTION AND NOT A FORK
 *
 * fe-home renders <Contributions contributionKey="home.HomePage.Blocks"> at the
 * end of its container, which is a seam openIMIS put there on purpose. Blocks
 * append BELOW the welcome message and the health-facility contract notice, so
 * upstream's content is kept rather than replaced.
 *
 * There is also home.HomePage.customDashboard, reached by setting
 * fe-home.HomePage.enableCustomDashboard. That one REPLACES the container
 * entirely -- welcome, notice and all -- and needs a database configuration row
 * to switch on. Additive is the better trade: nothing upstream is lost, and no
 * configuration has to survive a database restore for the page to be right.
 *
 * A LANDING PAGE MUST NOT BE ABLE TO FAIL
 *
 * If the query errors, this renders nothing at all and the home page is exactly
 * what it was before. Nobody should meet a red alert as the first thing after
 * signing in, over some counts. The error goes to the console, where a
 * developer will find it and a clerk will not.
 */

const formatCount = (value) =>
  typeof value === "number" ? new Intl.NumberFormat("en-US").format(value) : "—";

/** One number with its label. */
const Tile = ({ label, value, hint }) => (
  <Grid item xs={6} sm={4} md={3}>
    <Paper>
      {/*
        minWidth so a tile can never be squeezed narrower than its own label.
        Without it "Claims this month" stacked one word per line -- the label is
        the widest thing in the box, and a flex item with nothing to stand on
        will shrink under it.
      */}
      <Box p={2} display="flex" flexDirection="column" style={{ gap: 4, minWidth: 150 }}>
        <Typography variant="caption" color="textSecondary">
          {label}
        </Typography>
        <Typography variant="h5" style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatCount(value)}
        </Typography>
        {hint ? (
          <Typography variant="caption" color="textSecondary">
            {hint}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  </Grid>
);

/*
 * The claim pipeline, as proportional bars.
 *
 * Drawn with divs rather than a charting library. Nothing in this project's
 * dependencies does charts, and the precedent here is barcode.js -- written out
 * rather than adding a package to an image that is already slow to build. Five
 * bars do not justify a dependency.
 *
 * Scaled against the LARGEST bar, not the total. These are stages of a pipeline
 * rather than parts of a whole -- a claim is counted in exactly one of them,
 * but the interesting question is which stage is bigger than the others, and
 * that reads better against the biggest.
 */
const Funnel = ({ title, note, rows }) => {
  const largest = rows.reduce((max, row) => Math.max(max, row.value || 0), 0);
  return (
    <Grid item xs={12}>
      <Paper>
        <Box p={2}>
          <Typography variant="subtitle1">{title}</Typography>
          {note ? (
            <Typography variant="caption" color="textSecondary">
              {note}
            </Typography>
          ) : null}
          <Box mt={1.5} display="flex" flexDirection="column" style={{ gap: 10 }}>
            {rows.map((row) => (
              <Box key={row.key} display="flex" alignItems="center" style={{ gap: 12 }}>
                <Box width={110} flexShrink={0}>
                  <Typography variant="body2">{row.label}</Typography>
                </Box>
                <Box flexGrow={1} style={{ background: "rgba(0,0,0,0.06)", borderRadius: 3 }}>
                  <Box
                    style={{
                      // A stage with work in it always shows something, so "a
                      // few" and "none" never look the same.
                      width: largest ? `${Math.max(2, ((row.value || 0) / largest) * 100)}%` : "0%",
                      height: 12,
                      borderRadius: 3,
                      background: "var(--brand, #0e6e6b)",
                    }}
                  />
                </Box>
                <Box width={72} flexShrink={0} textAlign="right">
                  <Typography variant="body2" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatCount(row.value)}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Paper>
    </Grid>
  );
};

const HomeDashboard = ({ user }) => {
  const intl = useIntl();
  const t = useCallback(
    (id, fallback, values) =>
      intl.formatMessage({ id: `cbhi.${id}`, defaultMessage: fallback }, values),
    [intl],
  );

  const [state, setState] = useState({
    ready: false,
    failed: false,
    wants: {},
    counts: {},
    waitingDays: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetchDashboard(user)
      .then(({ wants, counts, waitingDays }) => {
        if (!cancelled) setState({ ready: true, failed: false, wants, counts, waitingDays });
      })
      .catch((error) => {
        // Deliberately quiet. See the note at the top of the file.
        console.error("[cbhi] home figures unavailable", error);
        if (!cancelled) {
          setState({ ready: true, failed: true, wants: {}, counts: {}, waitingDays: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Nothing until the answer arrives, and nothing if it never does: no spinner
  // on a landing page, and no empty frames that shift the layout underneath
  // somebody who has already started reading.
  if (!state.ready || state.failed) return null;

  const { wants, counts, waitingDays } = state;
  const tiles = [];

  if (wants.insurees) {
    tiles.push(
      <Tile key="insurees" label={t("home.members", "Members registered")} value={counts.insurees} />,
      <Tile key="families" label={t("home.families", "Families")} value={counts.families} />,
    );
  }
  if (wants.policies) {
    tiles.push(
      <Tile key="policies" label={t("home.policies", "Policies")} value={counts.policies} />,
    );
  }
  if (wants.contributions) {
    tiles.push(
      <Tile
        key="contributions"
        label={t("home.contributions", "Contributions this month")}
        value={counts.contributions}
        hint={t("home.countNotAmount", "count, not amount")}
      />,
    );
  }
  if (wants.claims) {
    tiles.push(
      <Tile
        key="claims"
        label={t("home.claimsThisMonth", "Claims this month")}
        value={counts.claimsThisMonth}
      />,
    );
    // Only when something is actually waiting. Nothing waiting is a real
    // answer, and a tile reading 0 days looks like a measurement rather than
    // an empty queue.
    if (typeof waitingDays === "number") {
      tiles.push(
        <Tile
          key="waiting"
          label={t("home.oldestWaiting", "Oldest claim awaiting processing")}
          value={waitingDays}
          hint={t("home.days", "days")}
        />,
      );
    }
  }

  const funnel = wants.claims
    ? CLAIM_STATUSES.map(({ key }) => ({
        key,
        label: t(`home.status.${key}`, key),
        value: counts[key],
      }))
    : [];

  if (!tiles.length && !funnel.length) return null;

  /*
   * The root is a Grid ITEM, not a Box.
   *
   * fe-home's HomePageContainer is itself a <Grid container>, and it renders
   * <Contributions contributionKey="home.HomePage.Blocks"> as a DIRECT CHILD of
   * it -- so whatever a block returns becomes a flex item in that container.
   * A plain Box has no basis there and shrinks to fit its contents, which is
   * how five tiles and a chart ended up in a 500px column with "Claims this
   * month" stacked one word per line.
   *
   * xs={12} takes the full row, the same way every child fe-home renders for
   * itself does.
   */
  return (
    <Grid item xs={12}>
      <Grid container spacing={2}>
        {tiles}
        {funnel.length ? (
          <Funnel
            title={t("home.pipeline", "Claims by stage")}
            note={t("home.pipelineNote", "All claims on record, not this month only.")}
            rows={funnel}
          />
        ) : null}
      </Grid>
    </Grid>
  );
};

export default HomeDashboard;
