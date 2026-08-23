import React, { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import {
  Button,
  Checkbox,
  CircularProgress,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@material-ui/core";
import PrintIcon from "@material-ui/icons/Print";
import SearchIcon from "@material-ui/icons/Search";
import MembershipCard from "./MembershipCard";
import { fetchInsureesForCards, locationLine, MAX_CARDS } from "./api";
import "./cards.css";

/*
 * Issue CBHI membership cards.
 *
 * Search, tick the people whose cards are wanted, print. The cards render into
 * a container the print stylesheet makes the only visible thing on the page, so
 * printing is the browser's own -- no PDF service, no backend report, and what
 * is on screen is exactly what comes out of the printer.
 *
 * Why not a backend ReportBro report, which is how openIMIS prints a claim:
 * that route needs a new entry in ReportConfig.reports with a Python query,
 * which means changing the backend image. A card is a layout problem, not a
 * data-aggregation problem, and the browser already has both the data and a
 * layout engine.
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
    (id, fallback) => intl.formatMessage({ id: `cbhi.${id}`, defaultMessage: fallback }),
    [intl],
  );

  const labels = useMemo(
    () => ({
      scheme: t("card.scheme", "ປະກັນສຸຂະພາບຊຸມຊົນ"),
      schemeEn: t("card.schemeEn", "Community Based Health Insurance"),
      dob: t("card.dob", "ວັນເດືອນປີເກີດ"),
      gender: t("card.gender", "ເພດ"),
      location: t("card.location", "ທີ່ຢູ່"),
      noPhoto: t("card.noPhoto", "ບໍ່ມີຮູບ"),
      footer: t("card.footer", "ບັດນີ້ເປັນຂອງລະບົບປະກັນສຸຂະພາບແຫ່ງຊາດ"),
      verify: t("card.verify", "ກວດສອບດ້ວຍເລກປະກັນໄພ"),
      genders: {
        M: t("gender.M", "ຊາຍ"),
        F: t("gender.F", "ຍິງ"),
        O: t("gender.O", "ອື່ນ"),
      },
    }),
    [t],
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
      setState({ loading: false, error: error.message, searched: true });
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

  const field = (name, label) => (
    <Grid item xs={12} sm={4}>
      <TextField
        fullWidth
        label={label}
        value={filters[name]}
        onChange={(event) => setFilters({ ...filters, [name]: event.target.value })}
        // Enter is how anyone types into a search form.
        onKeyDown={(event) => {
          if (event.key === "Enter" && hasFilter) search();
        }}
      />
    </Grid>
  );

  return (
    <div style={{ padding: 16 }}>
      <Paper style={{ padding: 16, marginBottom: 16 }} className="cbhi-noprint">
        <Typography variant="h6" gutterBottom>
          {t("page.title", "ອອກບັດສະມາຊິກ")}
        </Typography>

        <Grid container spacing={2} alignItems="flex-end">
          {field("chfId", t("filter.chfId", "ເລກປະກັນໄພ"))}
          {field("lastName", t("filter.lastName", "ນາມສະກຸນ"))}
          {field("otherNames", t("filter.otherNames", "ຊື່ຕົວ"))}

          <Grid item xs={12}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SearchIcon />}
              onClick={search}
              // At least one filter: an empty form would ask for every insuree
              // in the country.
              disabled={state.loading || !hasFilter}
            >
              {t("action.search", "ຄົ້ນຫາ")}
            </Button>{" "}
            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              onClick={() => window.print()}
              disabled={!toPrint.length}
            >
              {t("action.print", "ພິມບັດ")} {toPrint.length ? `(${toPrint.length})` : ""}
            </Button>
          </Grid>
        </Grid>

        {state.loading && <CircularProgress size={24} style={{ marginTop: 16 }} />}

        {state.error && (
          <Typography color="error" style={{ marginTop: 16 }}>
            {state.error}
          </Typography>
        )}

        {state.searched && !state.loading && !state.error && !insurees.length && (
          <Typography style={{ marginTop: 16 }}>
            {t("empty", "ບໍ່ພົບຜູ້ເອົາປະກັນທີ່ກົງກັບເງື່ອນໄຂ")}
          </Typography>
        )}

        {insurees.length >= MAX_CARDS && (
          <Typography style={{ marginTop: 16 }} color="textSecondary">
            {t("truncated", `ສະແດງພຽງ ${MAX_CARDS} ລາຍການທຳອິດ. ກະລຸນາລະບຸເງື່ອນໄຂໃຫ້ແຄບລົງ.`)}
          </Typography>
        )}
      </Paper>

      {insurees.length > 0 && (
        <Paper style={{ marginBottom: 16 }} className="cbhi-noprint">
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
                <TableCell>{t("filter.chfId", "ເລກປະກັນໄພ")}</TableCell>
                <TableCell>{t("column.name", "ຊື່ ແລະ ນາມສະກຸນ")}</TableCell>
                <TableCell>{t("card.location", "ທີ່ຢູ່")}</TableCell>
                <TableCell>{t("column.photo", "ຮູບພາບ")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {insurees.map((insuree) => (
                <TableRow key={insuree.uuid} hover onClick={() => toggle(insuree.uuid)}>
                  <TableCell padding="checkbox">
                    <Checkbox checked={selected.has(insuree.uuid)} />
                  </TableCell>
                  <TableCell>{insuree.chfId}</TableCell>
                  <TableCell>
                    {[insuree.otherNames, insuree.lastName].filter(Boolean).join(" ")}
                  </TableCell>
                  <TableCell>{locationLine(insuree)}</TableCell>
                  {/* Flagged rather than blocked: a card without a photograph is
                      still a valid card, but whoever is issuing it should know
                      before it comes off the printer. */}
                  <TableCell>
                    {insuree.photo?.photo || insuree.photo?.filename
                      ? t("photo.yes", "ມີ")
                      : t("photo.no", "ບໍ່ມີ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* The print stylesheet hides everything except this container. */}
      <div className="cbhi-print">
        <div className="cbhi-cards">
          {toPrint.map((insuree) => (
            <MembershipCard key={insuree.uuid} insuree={insuree} labels={labels} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default MembershipCardsPage;
