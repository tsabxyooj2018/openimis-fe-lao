import React, { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Grid,
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
import PrintIcon from "@material-ui/icons/Print";
import SearchIcon from "@material-ui/icons/Search";
import MembershipCard from "./MembershipCard";
import { fetchInsureesForCards, locationLine, MAX_CARDS } from "./api";
import "./cards.css";

/*
 * Issue CBHI membership cards.
 *
 * Search, tick the people whose cards are wanted, print. The cards render into a
 * container the print stylesheet makes the only visible thing on the page, so
 * printing is the browser's own -- no PDF service and no backend report, and
 * what is on screen is what comes out of the printer.
 *
 * Why not a backend ReportBro report, which is how openIMIS prints a claim: that
 * needs a new entry in ReportConfig.reports with a Python query, so a backend
 * image rebuild. A card is a layout problem, not a data-aggregation one, and the
 * browser already has both the data and a layout engine.
 */

const emptyFilters = { chfId: "", lastName: "", otherNames: "" };

const MembershipCardsPage = () => {
  const intl = useIntl();
  const [filters, setFilters] = useState(emptyFilters);
  const [insurees, setInsurees] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [state, setState] = useState({ loading: false, error: null, searched: false });

  // Falls back to the English so the page still reads if a key is ever missing,
  // rather than rendering the key itself the way react-intl does by default.
  const t = useCallback(
    (id, fallback, values) =>
      intl.formatMessage({ id: `cbhi.${id}`, defaultMessage: fallback }, values),
    [intl],
  );

  /*
   * The CARD is fixed in Lao. Deliberately not translated, and the one place on
   * this page that ignores the language setting.
   *
   * The page around it is a tool for staff and follows whatever language they
   * work in. The card is not a screen -- it is a document issued by the Lao
   * Ministry of Health to a Lao citizen, who keeps it. If it took the operator's
   * language, a clerk working in English would hand out English cards, and two
   * people enrolled on the same day would carry different cards for no reason
   * anyone could see afterwards.
   *
   * The English line under the scheme name stays, so the card reads as bilingual
   * by design rather than by accident. To issue cards in another language,
   * translate these values -- do not wire them back to the UI language.
   */
  const labels = useMemo(
    () => ({
      scheme: "ປະກັນສຸຂະພາບຊຸມຊົນ",
      schemeEn: "Community Based Health Insurance",
      dob: "ວັນເດືອນປີເກີດ",
      gender: "ເພດ",
      location: "ທີ່ຢູ່",
      noPhoto: "ບໍ່ມີຮູບ",
      footer: "ບັດນີ້ເປັນຂອງລະບົບປະກັນສຸຂະພາບແຫ່ງຊາດ",
      verify: "ກວດສອບດ້ວຍເລກປະກັນໄພ",
      genders: { M: "ຊາຍ", F: "ຍິງ", O: "ອື່ນ" },
    }),
    [],
  );

  const search = async () => {
    setState({ loading: true, error: null, searched: true });
    try {
      const rows = await fetchInsureesForCards(filters);
      setInsurees(rows);
      // Everything found is ticked: the common case is printing the whole
      // result, and unticking a few is less work than ticking ninety.
      setSelected(new Set(rows.map((row) => row.uuid)));
      setState({ loading: false, error: null, searched: true });
    } catch (error) {
      setInsurees([]);
      setSelected(new Set());
      /*
       * Server wording is not shown. GraphQL speaks in connections, cursors and
       * `first` limits, which describe our query rather than anything the person
       * at the desk did or can act on. The original is kept on the console for
       * whoever is debugging.
       */
      // eslint-disable-next-line no-console
      console.error("Membership card search failed:", error);
      setState({ loading: false, error: t("error.search", "The search could not be completed. Please try again, or narrow the criteria."), searched: true });
    }
  };

  const toggle = (uuid) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const allSelected = insurees.length > 0 && selected.size === insurees.length;
  const toPrint = insurees.filter((insuree) => selected.has(insuree.uuid));
  const hasFilter = Object.values(filters).some((value) => value.trim());
  const withoutPhoto = toPrint.filter(
    (insuree) => !insuree.photo?.photo && !insuree.photo?.filename,
  ).length;

  const field = (name, label, placeholder) => (
    <Grid item xs={12} sm={4}>
      <TextField
        fullWidth
        variant="outlined"
        size="small"
        label={label}
        placeholder={placeholder}
        value={filters[name]}
        onChange={(event) => setFilters({ ...filters, [name]: event.target.value })}
        // Enter is how anyone types into a search form.
        onKeyDown={(event) => {
          if (event.key === "Enter" && hasFilter && !state.loading) search();
        }}
      />
    </Grid>
  );

  return (
    <Box p={2}>
      <Paper elevation={1} className="cbhi-noprint">
        <Box p={2} pb={1}>
          <Typography variant="h6" color="primary">
            {t("page.title", "Issue membership cards")}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {t(
              "page.description",
              "Find the members whose cards are needed, then print. Cards print at bank-card size, several to a page.",
            )}
          </Typography>
        </Box>

        <Divider />

        <Box p={2}>
          <Grid container spacing={2}>
            {field("chfId", t("filter.chfId", "Insurance number"), t("filter.chfId.hint", "starts with"))}
            {field("lastName", t("filter.lastName", "Last name"), t("filter.contains.hint", "contains"))}
            {field("otherNames", t("filter.otherNames", "Given names"), t("filter.contains.hint", "contains"))}
          </Grid>

          <Box mt={2} display="flex" alignItems="center" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={state.loading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
              onClick={search}
              // At least one filter: an empty form would ask for every insuree
              // in the country.
              disabled={state.loading || !hasFilter}
            >
              {t("action.search", "Search")}
            </Button>

            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              onClick={() => window.print()}
              disabled={!toPrint.length}
            >
              {toPrint.length
                ? t("action.printCount", "Print {count} cards", { count: toPrint.length })
                : t("action.print", "Print cards")}
            </Button>

            {!hasFilter && (
              <Typography variant="body2" color="textSecondary">
                {t("hint.needFilter", "Enter at least one search criterion.")}
              </Typography>
            )}
          </Box>

          {state.error && (
            <Box mt={2}>
              <Alert severity="error">{state.error}</Alert>
            </Box>
          )}

          {state.searched && !state.loading && !state.error && !insurees.length && (
            <Box mt={2}>
              <Alert severity="info">
                {t("empty", "No member matches those criteria.")}
              </Alert>
            </Box>
          )}

          {insurees.length >= MAX_CARDS && (
            <Box mt={2}>
              <Alert severity="warning">
                {t(
                  "truncated",
                  "Showing the first {count} matches. Narrow the criteria to reach the rest.",
                  { count: MAX_CARDS },
                )}
              </Alert>
            </Box>
          )}

          {/* Flagged rather than blocked: a card without a photograph is still a
              valid card, but whoever is issuing it should know before it comes
              off the printer rather than after. */}
          {withoutPhoto > 0 && (
            <Box mt={2}>
              <Alert severity="warning">
                {t(
                  "warn.noPhoto",
                  "{count} of the selected members have no photograph. Their cards will print with an empty photo box.",
                  { count: withoutPhoto },
                )}
              </Alert>
            </Box>
          )}
        </Box>
      </Paper>

      {insurees.length > 0 && (
        <Box mt={2}>
          <Paper elevation={1} className="cbhi-noprint">
            <Box p={2} display="flex" alignItems="center" style={{ gap: 12 }}>
              <Typography variant="subtitle1">
                {t("results.title", "Search results")}
              </Typography>
              <Chip
                size="small"
                label={t("results.count", "{found} found · {selected} selected", {
                  found: insurees.length,
                  selected: selected.size,
                })}
              />
            </Box>

            <Divider />

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={selected.size > 0 && !allSelected}
                        onChange={() =>
                          setSelected(
                            allSelected ? new Set() : new Set(insurees.map((row) => row.uuid)),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>{t("filter.chfId", "Insurance number")}</TableCell>
                    <TableCell>{t("column.name", "Name")}</TableCell>
                    <TableCell>{t("card.location", "Address")}</TableCell>
                    <TableCell>{t("column.photo", "Photo")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {insurees.map((insuree) => {
                    const hasPhoto = !!(insuree.photo?.photo || insuree.photo?.filename);
                    return (
                      <TableRow
                        key={insuree.uuid}
                        hover
                        selected={selected.has(insuree.uuid)}
                        onClick={() => toggle(insuree.uuid)}
                        style={{ cursor: "pointer" }}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox checked={selected.has(insuree.uuid)} />
                        </TableCell>
                        <TableCell>{insuree.chfId}</TableCell>
                        <TableCell>
                          {[insuree.otherNames, insuree.lastName].filter(Boolean).join(" ")}
                        </TableCell>
                        <TableCell>{locationLine(insuree)}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            variant="outlined"
                            color={hasPhoto ? "primary" : "default"}
                            label={hasPhoto ? t("photo.yes", "Yes") : t("photo.no", "No")}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}

      {toPrint.length > 0 && (
        <Box mt={2} className="cbhi-noprint">
          <Typography variant="subtitle2" color="textSecondary">
            {t("preview.title", "Preview — this is what will be printed")}
          </Typography>
        </Box>
      )}

      {/* The print stylesheet hides everything except this container. */}
      <div className="cbhi-print">
        <div className="cbhi-cards">
          {toPrint.map((insuree) => (
            <MembershipCard key={insuree.uuid} insuree={insuree} labels={labels} />
          ))}
        </div>
      </div>
    </Box>
  );
};

export default MembershipCardsPage;
