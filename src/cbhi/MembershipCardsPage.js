import React, { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
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
import { useModulesManager } from "@openimis/fe-core";
import MembershipCard from "./MembershipCard";
import { fetchInsureesForCards, fetchPolicyDetails, locationLine, MAX_CARDS } from "./api";
import { TEMPLATES, DEFAULT_TEMPLATE, templateById } from "./templates";
import { downloadWorkbook, asDate } from "./xlsx";
import "./cards.css";

/*
 * The operator's last choice, so an office printing all day does not re-pick on
 * every search. Deliberately per-browser rather than per-user: it is a printing
 * preference, not something worth a round trip or a column.
 */
const TEMPLATE_KEY = "cbhi.cardTemplate";

const readStoredTemplate = () => {
  try {
    return window.localStorage.getItem(TEMPLATE_KEY);
  } catch (error) {
    return null; // private browsing
  }
};

const storeTemplate = (id) => {
  try {
    window.localStorage.setItem(TEMPLATE_KEY, id);
  } catch (error) {
    /* private browsing — the choice simply will not persist */
  }
};

/*
 * openIMIS holds LastName and OtherNames as varchar(100). Nothing longer can be
 * stored, so nothing longer can match -- the cap is a fact about the data, not a
 * house rule, and it comfortably exceeds any insurance number.
 *
 * The number is not trimmed to its own shorter limit as the box is typed in:
 * until the value is complete there is no telling whether it is a number or a
 * name, and cutting a name at twelve characters would be worse than searching
 * for a number that is too long and finding nothing. api.js applies the number
 * cap at query time, once the branch is known.
 */
const SEARCH_MAX_LENGTH = 100;

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

/*
 * Print, but not before the Lao font has actually arrived.
 *
 * index.css declares Noto Sans Lao with font-display: swap, which is right for
 * the application -- no screen should sit blank waiting on a font. It is wrong
 * for printing: swap means the browser draws a fallback face immediately and
 * replaces it when the woff2 lands, and window.print() captures whatever is on
 * the page at that instant. On a cold load that is a card printed in the wrong
 * font, and unlike a mis-rendered screen a laminated card cannot be re-drawn.
 *
 * document.fonts.ready resolves once font loading has settled. It is already
 * resolved in the ordinary case, so this costs nothing after the first visit.
 */
const printCards = async () => {
  try {
    await document.fonts?.ready;
  } catch (error) {
    // Not a reason to refuse to print -- worst case it prints in a fallback,
    // which is exactly what it did before this existed.
  }
  window.print();
};

const MembershipCardsPage = () => {
  const intl = useIntl();
  const modulesManager = useModulesManager();
  /*
   * The same setting the insuree form uses for its own number field, rather than
   * a 12 written here. A deployment that lengthens its insurance numbers changes
   * one configuration value and this page follows; hardcoding would leave a
   * search that silently truncates what the rest of the application accepts.
   */
  const chfIdMaxLength = modulesManager.getConf("fe-insuree", "insureeForm.chfIdMaxLength", 12);

  /*
   * Precedence: what this browser last chose, then the deployment's configured
   * default, then the faithful template. The configuration layer means a
   * deployment can change the house default without a rebuild, the same way the
   * sidebar and the currency are set.
   */
  const configuredDefault = modulesManager.getConf("cbhi", "cardTemplate", DEFAULT_TEMPLATE);
  const [template, setTemplate] = useState(
    () => templateById(readStoredTemplate() || configuredDefault).id,
  );

  const [term, setTerm] = useState("");
  const [insurees, setInsurees] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [state, setState] = useState({ loading: false, error: null, detail: null, searched: false });

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
   * To issue cards in another language, translate these values -- do not wire
   * them back to the UI language.
   *
   * The wording follows the card in circulation line for line, which is why the
   * labels read ເລກລະຫັດ rather than ເລກປະກັນໄພ and ວັນໝົດກຳນົດ rather than
   * ວັນທີໝົດອາຍຸ: a member comparing the two should not have to work out that
   * the same thing has been renamed.
   */
  const labels = useMemo(
    () => ({
      /*
       * Supplied by the scheme, not invented here. These three were placeholders
       * until then, and the wording on a document people keep in their wallet is
       * not something to approximate.
       *
       * The ministry and the organisation are separate lines because the card in
       * circulation sets them as two blocks with the abbreviation at the foot of
       * the band, not as one run of text.
       */
      title: "ບັດປະກັນສັງຄົມ",
      ministry: "ກະຊວງແຮງງານ ແລະ ສະຫວັດດີການສັງຄົມ",
      organisation: "ອົງການປະກັນສັງຄົມ ແຫ່ງລັດ",
      abbr: "(ອ.ປ.ລ)",
      name: "ຊື່ ແລະ ນາມສະກຸນ",
      number: "ເລກລະຫັດ",
      gender: "ເພດ",
      dob: "ວັນເດືອນປີເກີດ",
      // openIMIS has no entitlement category as such; the product is the
      // scheme someone is enrolled under, which answers the same question the
      // social security card answers with ລັດຖະກອນ and the like.
      category: "ປະເພດຜູ້ເກີດສິດ",
      facility: "ສະຖານທີ່ປິ່ນປົວ",
      expiry: "ວັນໝົດກຳນົດ",
      noPhoto: "ບໍ່ມີຮູບ",
      genders: { M: "ຊາຍ", F: "ຍິງ", O: "ອື່ນ" },
    }),
    [],
  );

  const search = async () => {
    setState({ loading: true, error: null, detail: null, searched: true });
    try {
      const rows = await fetchInsureesForCards(term, chfIdMaxLength);

      /*
       * The expiry date lives on the family's policy, so it is a second query.
       * Failures inside it are swallowed there: a card without the date is still
       * worth printing, and losing a whole batch over it would not be.
       */
      const policies = await fetchPolicyDetails(rows.map((row) => row.chfId));
      rows.forEach((row) => {
        const policy = policies[row.chfId];
        row.expiryDate = policy?.expiryDate ?? null;
        row.productName = policy?.productName ?? null;
      });

      setInsurees(rows);
      // Everything found is ticked: the common case is printing the whole
      // result, and unticking a few is less work than ticking ninety.
      setSelected(new Set(rows.map((row) => row.uuid)));
      setState({ loading: false, error: null, detail: null, searched: true });
    } catch (error) {
      setInsurees([]);
      setSelected(new Set());
      // eslint-disable-next-line no-console
      console.error("Membership card search failed:", error);

      /*
       * The first version showed one friendly sentence and kept the server's
       * words on the console. That read better and made the page impossible to
       * diagnose from a screenshot: "the search could not be completed" does not
       * distinguish a server that is down from a session that has lapsed from a
       * user who lacks a right.
       *
       * So both -- a sentence the person at the desk can act on, and the
       * server's own message underneath for whoever is fixing it. The
       * authorisation failure gets named outright, because it is not a fault at
       * all: it is a permission somebody has to grant.
       */
      const raw = String(error?.message ?? "");
      const friendly = /not authorized/i.test(raw)
        ? t(
            "error.notAuthorized",
            "This user is not allowed to search members. The page needs the Insuree | Query Insurees right (101101).",
          )
        : t("error.search", "The search could not be completed. Please try again, or narrow the criteria.");

      setState({ loading: false, error: friendly, detail: raw, searched: true });
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

  /*
   * The spreadsheet is a WORKING document, so unlike the card its headings
   * follow the operator's language. The card is fixed in Lao because a member
   * keeps it; this is a list a clerk opens, sorts and sends on.
   *
   * Every identifier goes out as text, not as a number. That is the entire
   * reason src/cbhi/xlsx.js exists -- see the note at the top of it.
   */
  const exportRows = useCallback(() => {
    const rows = (toPrint.length ? toPrint : insurees).map((insuree) => ({
      chfId: insuree.chfId ?? "",
      lastName: insuree.lastName ?? "",
      otherNames: insuree.otherNames ?? "",
      gender: labels.genders[insuree?.gender?.code] ?? insuree?.gender?.code ?? "",
      dob: asDate(insuree.dob),
      location: locationLine(insuree),
      facility: insuree?.healthFacility?.name ?? "",
      product: insuree.productName ?? "",
      expiry: asDate(insuree.expiryDate),
      cardIssued: insuree.cardIssued ? t("photo.yes", "Yes") : t("photo.no", "No"),
    }));

    downloadWorkbook(
      {
        name: t("export.sheet.members", "Members"),
        columns: [
          { key: "chfId", header: t("filter.chfId", "Insurance number"), width: 18 },
          { key: "lastName", header: t("export.column.lastName", "Family name"), width: 18 },
          { key: "otherNames", header: t("export.column.otherNames", "Given names"), width: 18 },
          { key: "gender", header: t("export.column.gender", "Gender"), width: 10 },
          { key: "dob", header: t("export.column.dob", "Date of birth"), width: 14 },
          { key: "location", header: t("card.location", "Address"), width: 32 },
          { key: "facility", header: t("export.column.facility", "Health facility"), width: 26 },
          { key: "product", header: t("export.column.product", "Product"), width: 24 },
          { key: "expiry", header: t("export.column.expiry", "Cover expires"), width: 14 },
          { key: "cardIssued", header: t("export.column.cardIssued", "Card issued"), width: 12 },
        ],
        rows,
      },
      // Dated, because these get mailed around and two of them in a folder with
      // the same name are indistinguishable.
      `members-${new Date().toISOString().slice(0, 10)}`,
    );
  }, [toPrint, insurees, labels, t]);
  const hasFilter = term.trim().length > 0;

  /*
   * Nothing left to validate. The three-field form had to reject digits typed
   * into a name box; with one box a digit simply means the value is a number,
   * so what was an error is now just the other branch of the search.
   */
  const withoutPhoto = toPrint.filter(
    (insuree) => !insuree.photo?.photo && !insuree.photo?.filename,
  ).length;

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
          <TextField
            fullWidth
            variant="outlined"
            size="small"
            autoFocus
            label={t("search.label", "Insurance number or name")}
            placeholder={t("search.placeholder", "e.g. 105000123456, or Phommavong")}
            helperText={t(
              "search.hint",
              "A value with digits is matched as an insurance number, starting from the front. Anything else is matched against both family and given names.",
            )}
            value={term}
            inputProps={{ maxLength: SEARCH_MAX_LENGTH }}
            onChange={(event) => setTerm(event.target.value)}
            // Enter is how anyone types into a search box.
            onKeyDown={(event) => {
              if (event.key === "Enter" && hasFilter && !state.loading) search();
            }}
          />

          <Box mt={2} display="flex" alignItems="center" style={{ gap: 8, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={state.loading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
              onClick={search}
              // At least one filter: an empty form would ask for every insuree
              // in the country. And nothing invalid, so a search cannot be sent
              // that could only ever return nothing.
              disabled={state.loading || !hasFilter}
            >
              {t("action.search", "Search")}
            </Button>

            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              onClick={printCards}
              disabled={!toPrint.length}
            >
              {toPrint.length
                ? t("action.printCount", "Print {count} cards", { count: toPrint.length })
                : t("action.print", "Print cards")}
            </Button>

            <Button
              variant="outlined"
              startIcon={<GetAppIcon />}
              onClick={exportRows}
              disabled={!insurees.length}
            >
              {t("export.action", "Export to Excel")}
            </Button>

            <TextField
              select
              size="small"
              variant="outlined"
              label={t("template.label", "Card design")}
              value={template}
              onChange={(event) => {
                setTemplate(event.target.value);
                storeTemplate(event.target.value);
              }}
              SelectProps={{ native: true }}
              style={{ minWidth: "16rem" }}
              InputLabelProps={{ shrink: true }}
            >
              {TEMPLATES.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(option.labelKey, option.fallback)}
                </option>
              ))}
            </TextField>

            {!hasFilter && (
              <Typography variant="body2" color="textSecondary">
                {t("hint.needFilter", "Enter at least one search criterion.")}
              </Typography>
            )}
          </Box>

          {state.error && (
            <Box mt={2}>
              <Alert severity="error">
                {state.error}
                {state.detail && (
                  <Typography
                    variant="caption"
                    component="div"
                    style={{ marginTop: 4, opacity: 0.8, wordBreak: "break-word" }}
                  >
                    {state.detail}
                  </Typography>
                )}
              </Alert>
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

          {/* Only worth saying when the chosen design shows a photograph. On the
              faithful template there is no photo box, so a missing photograph is
              not a defect and warning about it would be noise. */}
          {templateById(template).photo && withoutPhoto > 0 && (
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
            <MembershipCard
              key={insuree.uuid}
              insuree={insuree}
              labels={labels}
              template={template}
            />
          ))}
        </div>
      </div>
    </Box>
  );
};

export default MembershipCardsPage;
