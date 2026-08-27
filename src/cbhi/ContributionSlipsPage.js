import React, { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
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
import PrintIcon from "@material-ui/icons/Print";
import SearchIcon from "@material-ui/icons/Search";
import ContributionSlip from "./ContributionSlip";
import { fetchSlips, MAX_SLIPS } from "./slipApi";
import { downloadWorkbook, asDate } from "./xlsx";
import "./slips.css";

/*
 * Issue contribution paid slips.
 *
 * Find the payments a receipt is wanted for, tick them, print. The slips render
 * into a container the print stylesheet makes the only visible thing on the
 * page, so printing is the browser's own -- no PDF service and no backend
 * report, and what is on screen is what comes out of the printer. Same approach
 * as the membership cards, and for the same reason: a receipt is a layout
 * problem, not a data-aggregation one.
 */

const SEARCH_MAX_LENGTH = 50;

/*
 * Print, but not before the Lao font has arrived. index.css declares Noto Sans
 * Lao with font-display:swap, which is right for the application and wrong for
 * printing: window.print() captures whatever is drawn at that instant. A receipt
 * printed in a fallback font goes into a file and cannot be redrawn.
 */
const printSlips = async () => {
  try {
    await document.fonts?.ready;
  } catch (error) {
    // Not a reason to refuse to print.
  }
  window.print();
};

const formatDate = (value) => {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
};

const ContributionSlipsPage = () => {
  const intl = useIntl();

  const [term, setTerm] = useState("");
  const [slips, setSlips] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [bothCopies, setBothCopies] = useState(true);
  const [state, setState] = useState({
    loading: false,
    error: null,
    detail: null,
    searched: false,
    truncated: false,
  });

  const t = useCallback(
    (id, fallback, values) =>
      intl.formatMessage({ id: `cbhi.${id}`, defaultMessage: fallback }, values),
    [intl],
  );

  /*
   * The SLIP is fixed in Lao, for the same reason the card is: it is a document
   * issued to a citizen and filed by the office, not a screen. A clerk working
   * in English must not hand out an English receipt while the desk next door
   * hands out a Lao one for the same payment.
   *
   * The wording follows terms already in the application's Lao dictionary --
   * ເລກທີໃບຮັບເງິນ, ວັນທີຊຳລະເງິນ, ປະເພດການຊຳລະ, ຜູ້ຈ່າຍເງິນ, ຈຳນວນເງິນ -- so
   * the receipt and the screens an officer reconciles it against use the same
   * words for the same things.
   */
  const labels = useMemo(
    () => ({
      // As on the membership card. Supplied by the scheme.
      ministry: "ກະຊວງແຮງງານ ແລະ ສະຫວັດດີການສັງຄົມ",
      organisation: "ອົງການປະກັນສັງຄົມ ແຫ່ງລັດ",
      title: "ໃບຮັບເງິນສົມທົບ",
      // A photo fee is not cover, so it is not described as a contribution.
      titlePhotoFee: "ໃບຮັບເງິນຄ່າຖ່າຍຮູບ",
      receipt: "ເລກທີໃບຮັບເງິນ",
      payDate: "ວັນທີຊຳລະເງິນ",
      member: "ຊື່ຜູ້ເອົາປະກັນ",
      chfId: "ເລກປະກັນ",
      payer: "ຜູ້ຈ່າຍເງິນ",
      product: "ຜະລິດຕະພັນ",
      period: "ໄລຍະຄຸ້ມຄອງ",
      payType: "ປະເພດການຊຳລະ",
      amount: "ຈຳນວນເງິນ",
      currency: "ກີບ",
      payerSignature: "ລາຍເຊັນຜູ້ຈ່າຍເງິນ",
      collectorSignature: "ລາຍເຊັນຜູ້ຮັບເງິນ",
      copyPayer: "ສະບັບຜູ້ຈ່າຍເງິນ",
      copyOffice: "ສະບັບຫ້ອງການ",
      /*
       * The scheme's own codes, taken from the dictionary openIMIS already
       * ships for its premium collection report, so the receipt says what the
       * screens say.
       */
      payTypes: {
        C: "ເງິນສົດ",
        B: "ໂອນຜ່ານທະນາຄານ",
        M: "ໂທລະສັບມືຖື",
      },
    }),
    [],
  );

  const search = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null, detail: null }));
    try {
      const { slips: found, truncated } = await fetchSlips(term);
      setSlips(found);
      // Everything found is ticked: the common case is printing all of it.
      setSelected(new Set(found.map((slip) => slip.uuid)));
      setState({ loading: false, error: null, detail: null, searched: true, truncated });
    } catch (error) {
      setSlips([]);
      setSelected(new Set());
      setState({
        loading: false,
        error: "search",
        // The server's own words. Hiding them is what turned a CSRF failure on
        // the cards page into an unexplained blank result.
        detail: String(error?.message ?? ""),
        searched: true,
        truncated: false,
      });
    }
  }, [term]);

  /*
   * Tick or untick everything at once.
   *
   * Its absence is why the export had a fallback that ignored the ticks
   * entirely: with no way back to "all", unticking a few rows and then wanting
   * the whole list again meant clicking every row. The fallback papered over a
   * missing control rather than a missing preference.
   *
   * With this here, both things the operator might want are one click apart --
   * everything, or the few they chose -- so the buttons can simply mean what
   * they say.
   */
  const allSelected = slips.length > 0 && selected.size === slips.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(slips.map((slip) => slip.uuid)));
  };

  const toggle = (uuid) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const toPrint = useMemo(
    () => slips.filter((slip) => selected.has(slip.uuid)),
    [slips, selected],
  );

  /*
   * Headings follow the operator's language: a spreadsheet is a working
   * document a clerk sorts and forwards, unlike the slip itself, which is fixed
   * in Lao because it is issued and filed.
   *
   * The amount goes out as a NUMBER so the column can be summed -- a
   * reconciliation total is the first thing anyone does with this. Receipt and
   * insurance numbers go out as text, so Excel cannot eat a leading zero.
   */
  const exportRows = useCallback(() => {
    // The ticked rows, full stop. This used to fall back to every result when
    // nothing was ticked, so unticking the lot -- which is a deliberate act,
    // since everything arrives ticked -- was answered with everything. Print
    // never did that, and two buttons over one set of checkboxes should not
    // disagree about what a tick means.
    const rows = toPrint.map((slip) => {
      const head = slip?.policy?.family?.headInsuree;
      const amount = Number(slip.amount);
      return {
        receipt: slip.receipt ?? "",
        payDate: asDate(slip.payDate),
        amount: Number.isFinite(amount) ? amount : "",
        payType: labels.payTypes[slip.payType] ?? slip.payType ?? "",
        chfId: head?.chfId ?? "",
        member: [head?.otherNames, head?.lastName].filter(Boolean).join(" "),
        payer: slip?.payer?.name ?? "",
        product: slip?.policy?.product?.name ?? "",
        start: asDate(slip?.policy?.startDate),
        expiry: asDate(slip?.policy?.expiryDate),
        photoFee: slip.isPhotoFee ? t("slips.export.yes", "Yes") : "",
      };
    });

    downloadWorkbook(
      {
        name: t("slips.export.sheet", "Contributions"),
        columns: [
          { key: "receipt", header: t("slips.column.receipt", "Receipt"), width: 16 },
          { key: "payDate", header: t("slips.column.payDate", "Paid on"), width: 13 },
          { key: "amount", header: t("slips.column.amount", "Amount (LAK)"), width: 15 },
          { key: "payType", header: t("slips.export.payType", "Payment type"), width: 18 },
          { key: "chfId", header: t("filter.chfId", "Insurance number"), width: 18 },
          { key: "member", header: t("slips.column.member", "Member"), width: 24 },
          { key: "payer", header: t("slips.export.payer", "Payer"), width: 24 },
          { key: "product", header: t("slips.column.product", "Product"), width: 24 },
          { key: "start", header: t("slips.export.start", "Cover from"), width: 13 },
          { key: "expiry", header: t("slips.export.expiry", "Cover to"), width: 13 },
          { key: "photoFee", header: t("slips.export.photoFee", "Photo fee"), width: 11 },
        ],
        rows,
      },
      `contributions-${new Date().toISOString().slice(0, 10)}`,
    );
  }, [toPrint, labels, t]);

  const hasTerm = term.trim().length > 0;

  return (
    <Box p={2}>
      <Paper elevation={1} className="cbhi-noprint">
        <Box p={2}>
          <Typography variant="h6">
            {t("slips.page.title", "Issue contribution paid slips")}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {t(
              "slips.page.description",
              "Find the payments a receipt is needed for, then print. Slips print at A5, two to an A4 sheet.",
            )}
          </Typography>

          <Box mt={2} display="flex" alignItems="flex-start" style={{ gap: 12, flexWrap: "wrap" }}>
            <TextField
              label={t("slips.search.label", "Receipt number or insurance number")}
              placeholder={t("slips.search.placeholder", "e.g. 0012345, or 105000123456")}
              value={term}
              onChange={(event) => setTerm(event.target.value.slice(0, SEARCH_MAX_LENGTH))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && hasTerm && !state.loading) search();
              }}
              helperText={t(
                "slips.search.hint",
                "Both are digits, so both are searched and the results merged.",
              )}
              style={{ minWidth: 300 }}
            />

            <Button
              variant="contained"
              color="primary"
              startIcon={
                state.loading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />
              }
              onClick={search}
              disabled={state.loading || !hasTerm}
            >
              {t("action.search", "Search")}
            </Button>

            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              onClick={printSlips}
              disabled={!toPrint.length}
            >
              {toPrint.length
                ? t("slips.action.printCount", "Print {count} slips", { count: toPrint.length })
                : t("slips.action.print", "Print slips")}
            </Button>

            <Button
              variant="outlined"
              startIcon={<GetAppIcon />}
              onClick={exportRows}
              disabled={!toPrint.length}
            >
              {t("export.action", "Export to Excel")}
              {toPrint.length && !allSelected ? ` (${toPrint.length})` : ""}
            </Button>

            <FormControlLabel
              control={
                <Checkbox
                  color="primary"
                  checked={bothCopies}
                  onChange={() => setBothCopies((v) => !v)}
                />
              }
              label={t("slips.bothCopies", "Payer copy and office copy")}
            />
          </Box>

          {state.error ? (
            <Box mt={2}>
              <Alert severity="error">
                {t("slips.error.search", "The search could not be completed. Please try again.")}
                {state.detail ? ` — ${state.detail}` : null}
              </Alert>
            </Box>
          ) : null}

          {state.truncated ? (
            <Box mt={2}>
              <Alert severity="info">
                {t("slips.truncated", "Showing the first {count} payments.", { count: MAX_SLIPS })}
              </Alert>
            </Box>
          ) : null}
        </Box>
      </Paper>

      {state.searched && !state.error ? (
        <Box mt={2}>
          <Paper elevation={1} className="cbhi-noprint">
            <Box p={2} pb={1}>
              <Typography variant="subtitle1">
                {t("slips.results.title", "Payments found")}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {t("slips.results.count", "{found} found · {selected} selected", {
                  found: slips.length,
                  selected: toPrint.length,
                })}
              </Typography>
            </Box>
            <Divider />
            {slips.length ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          color="primary"
                          checked={allSelected}
                          indeterminate={someSelected}
                          onChange={toggleAll}
                          inputProps={{
                            // The phrase openIMIS already uses for this control
                            // on its own price list screens, taken from the
                            // dictionary rather than invented here.
                            "aria-label": t("slips.selectAll", "Select all"),
                          }}
                        />
                      </TableCell>
                      <TableCell>{t("slips.column.receipt", "Receipt")}</TableCell>
                      <TableCell>{t("slips.column.payDate", "Paid on")}</TableCell>
                      <TableCell>{t("slips.column.member", "Member")}</TableCell>
                      <TableCell>{t("slips.column.product", "Product")}</TableCell>
                      <TableCell align="right">{t("slips.column.amount", "Amount (LAK)")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {slips.map((slip) => {
                      const head = slip?.policy?.family?.headInsuree;
                      return (
                        <TableRow key={slip.uuid} hover>
                          <TableCell padding="checkbox">
                            <Checkbox
                              color="primary"
                              checked={selected.has(slip.uuid)}
                              onChange={() => toggle(slip.uuid)}
                            />
                          </TableCell>
                          <TableCell>{slip.receipt}</TableCell>
                          <TableCell>{formatDate(slip.payDate)}</TableCell>
                          <TableCell>
                            {[head?.otherNames, head?.lastName].filter(Boolean).join(" ")}
                          </TableCell>
                          <TableCell>{slip?.policy?.product?.name}</TableCell>
                          <TableCell align="right">
                            {new Intl.NumberFormat("en-US", {
                              maximumFractionDigits: 0,
                            }).format(Number(slip.amount) || 0)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box p={2}>
                <Typography variant="body2">
                  {t("slips.empty", "No payment matches that number.")}
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      ) : null}

      {toPrint.length ? (
        <Box mt={2} className="cbhi-noprint">
          <Typography variant="subtitle2">
            {t("preview.title", "Preview — this is what will be printed")}
          </Typography>
        </Box>
      ) : null}

      {/* The print stylesheet hides everything except this container. */}
      <div className="cbhi-print">
        <div className="cbhi-slips cbhi-slips--preview">
          {toPrint.map((slip) => (
            <React.Fragment key={slip.uuid}>
              <ContributionSlip
                contribution={slip}
                labels={labels}
                copyLabel={bothCopies ? labels.copyPayer : null}
              />
              {/* The office copy is a second identical slip, marked. Printed as
                  a pair so one A4 sheet carries both and the cut separates
                  them -- which is how a receipt book already works. */}
              {bothCopies ? (
                <ContributionSlip
                  contribution={slip}
                  labels={labels}
                  copyLabel={labels.copyOffice}
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>
      </div>
    </Box>
  );
};

export default ContributionSlipsPage;
