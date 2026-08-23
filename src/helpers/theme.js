import { createTheme } from "@material-ui/core/styles";
import { alpha } from "@material-ui/core/styles/colorManipulator";

// Lao deployment palette. Institutional blue leads; Lao red is reserved for
// error states only. See NOTICE.md for the openIMIS attribution requirements
// that accompany this rebrand.
const defaultColors = {
  primaryColor: "#123B63",
  errorColor: "#C1272D",
  whiteColor: "#fff",
  fontColor: "#123B63",
  backgroundColor: "#EDF2F6",
  headerColor: "#D6E2EC",
  greyColor: "#7C939F",
  selectedTableRowColor: "rgba(0, 0, 0, 0.08)",
  hoveredTableRowColor: "rgba(0, 0, 0, 0.12)",
  toggledButtonColor: "#999999",
  lockedBackgroundPattern:
    "repeating-linear-gradient(45deg, #D3D3D3 1px, #D3D3D3 1px, #fff 10px, #fff 10px)",
};

const createAppTheme = (colorOverrides = {}) => {
  const {
    primaryColor,
    errorColor,
    whiteColor,
    fontColor,
    backgroundColor,
    headerColor,
    greyColor,
    selectedTableRowColor,
    hoveredTableRowColor,
    toggledButtonColor,
    lockedBackgroundPattern,
  } = { ...defaultColors, ...colorOverrides };
  return createTheme({
    // Default props. MUI v4 supports this alongside `overrides`, so app-wide
    // component defaults need no component changes.
    props: {
      MuiButton: { disableElevation: true },
      MuiTooltip: { arrow: true },
    },
    // Pass 1 of the visual refresh: typography, buttons, surfaces, tables.
    // openIMIS ships Material-UI 4.9 (2019, Material Design 2, now end of life),
    // which is why the stock UI reads as dated: uppercase buttons, flat grey
    // elevation, hairline-free tables. These are theme-level only -- no component
    // is forked, and every screen picks them up.
    //
    // Deliberately NOT included yet: switching MuiTextField to the outlined
    // variant. It changes field height and label position, and openIMIS has very
    // dense data-entry forms (claims, insuree registration) that need checking
    // screen by screen before that lands.
    overrides: {
      MuiTableRow: {
        root: {
          "&$selected": {
            backgroundColor: selectedTableRowColor,
          },
        },
      },
      MuiButton: {
        root: {
          // Uppercase is the most dated thing about MD2 buttons, and Lao has no
          // case, so it only ever distorted the Latin half of a bilingual label.
          textTransform: "none",
          borderRadius: 6,
          fontWeight: 500,
          letterSpacing: "0.01em",
          padding: "6px 16px",
        },
        contained: {
          boxShadow: "none",
          "&:hover": { boxShadow: "0 2px 8px -2px rgba(18, 59, 99, 0.35)" },
        },
      },
      MuiPaper: {
        rounded: { borderRadius: 8 },
        // Two-part shadows: a tight contact shadow plus a wide soft one. MD2's
        // single diffuse shadow is what makes surfaces look like grey slabs.
        elevation1: {
          boxShadow: "0 1px 2px rgba(11, 31, 42, 0.06), 0 8px 24px -12px rgba(11, 31, 42, 0.18)",
        },
        elevation2: {
          boxShadow: "0 1px 2px rgba(11, 31, 42, 0.06), 0 10px 28px -14px rgba(11, 31, 42, 0.2)",
        },
      },
      MuiTableCell: {
        root: {
          borderBottom: "1px solid #E4EBF0",
          padding: "10px 12px",
        },
        head: {
          fontWeight: 600,
          color: primaryColor,
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
        },
      },
      MuiTableHead: {
        root: { backgroundColor: headerColor },
      },
      MuiDialog: {
        paper: { borderRadius: 10 },
      },
      MuiTooltip: {
        tooltip: {
          fontSize: "0.78rem",
          fontWeight: 400,
          backgroundColor: "#0B1F2A",
          padding: "6px 10px",
        },
        arrow: { color: "#0B1F2A" },
      },
      MuiChip: {
        root: { borderRadius: 6, fontWeight: 500 },
      },
    },
    palette: {
      primary: { main: primaryColor },
      secondary: { main: whiteColor },
      error: { main: errorColor },
      text: {
        primary: fontColor,
        secondary: fontColor,
        second: whiteColor,
        error: errorColor,
      },
      toggledButton: toggledButtonColor,
    },
    typography: {
      useNextVariants: true,
      // Lao script (U+0E80-0EFF) is not covered by Rubik or Roboto, which makes
      // tone marks stack incorrectly. "Noto Sans Lao" is bundled by index.css;
      // Phetsarath OT and Saysettha OT are the fallbacks present on most Lao
      // desktops. Latin faces stay after them so Latin text is unaffected.
      fontFamily: [
        '"Noto Sans Lao"',
        '"Phetsarath OT"',
        '"Saysettha OT"',
        "Rubik",
        "Roboto",
        '"Helvetica Neue"',
        "sans-serif",
      ].join(","),
      fontSize: 14,
      // Was 300/400. Weight 300 is a display weight: at 14px body size it reads
      // washed out on light backgrounds, and Lao tone marks in particular get
      // thin enough to lose definition. 400/500 is the conventional body pairing.
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      title: {
        fontSize: 20,
        fontWeight: 300,
      },
      label: {
        color: greyColor,
      },
    },
    jrnlDrawer: {
      open: {
        width: 500,
      },
      close: {
        width: 80,
      },
      itemDetail: {
        marginLeft: 8,
      },
      iconSize: 24,
    },
    menu: {
      // Sidebar instead of the horizontal app bar. fe-core evaluates
      //   theme.menu.variant.toUpperCase() === "APPBAR"
      // and renders its Sidebar variant for any other value, so this is a
      // supported switch rather than a hack. Every module contributes the same
      // menu entries and every feature stays reachable -- they are grouped
      // vertically instead of wrapping across two rows.
      //
      // The horizontal bar could not carry this deployment: nine top-level menus
      // plus a Lao service name wrapped onto three lines and doubled the header
      // height.
      variant: "Drawer",
      drawer: {
        width: 288,
        fontSize: 15,
        fontWeight: 400,
        backgroundColor: primaryColor,
      },
      appBar: {
        fontSize: 15,
      },
    },
    page: {
      padding: 16,
      locked: {
        background: lockedBackgroundPattern,
      },
    },
    paper: {
      paper: {
        margin: 10,
        backgroundColor: backgroundColor,
      },
      header: {
        color: primaryColor,
        backgroundColor: headerColor,
      },
      message: {
        backgroundColor: headerColor,
      },
      title: {
        padding: 10,
        // Was 24. A panel title is not a page title, and 24px could not share a
        // column with the buttons beside it: on Locations, four SearcherPanes
        // sit in a third of the page each, and the header is title + add +
        // a Search button whose label is a word. At 24 the title crowded them
        // out and was clipped to "Reg", "Dis", "Mu". 18 is still clearly a
        // heading, and leaves the header room to breathe on the tightest screen
        // in the product.
        fontSize: 18,
        fontWeight: 600,
        color: primaryColor,
        backgroundColor: headerColor,
      },
      action: {
        padding: 5,
      },
      divider: {
        padding: 0,
        margin: 0,
      },
      body: {
        marginTop: 10,
        backgroundColor: backgroundColor,
      },
      item: {
        padding: 10,
      },
    },
    table: {
      title: {
        padding: 10,
        fontWeight: 500,
        color: primaryColor,
        backgroundColor: headerColor,
      },
      header: {
        color: primaryColor,
      },
      headerAction: {
        padding: 5,
      },
      row: {
        color: primaryColor,
        align: "center",
        "&:hover": {
          background: hoveredTableRowColor + " !important",
        },
      },
      cell: {
        padding: 5,
      },
      lockedRow: {
        background: lockedBackgroundPattern,
      },
      lockedCell: {},
      highlightedRow: {},
      highlightedCell: {
        fontWeight: 500,
        align: "center",
      },
      secondaryHighlightedRow: {
        backgroundColor: "#cbedf2",
      },
      secondaryHighlightedCell: {},
      highlightedAltRow: {},
      highlightedAltCell: {
        fontStyle: "italic",
        align: "center",
      },
      disabledRow: {},
      disabledCell: {
        color: greyColor,
        align: "center",
      },
      footer: {
        color: primaryColor,
      },
      pager: {
        color: primaryColor,
      },
    },
    form: {
      spacing: 10,
    },
    formTable: {
      table: {
        color: primaryColor,
      },
      actions: {
        color: primaryColor,
      },
      header: {
        color: primaryColor,
        align: "center",
      },
    },
    dialog: {
      title: {
        fontWeight: 500,
        color: greyColor,
      },
      content: {
        padding: 0,
      },
      primaryButton: {
        backgroundColor: primaryColor,
        color: whiteColor,
        fontWeight: "bold",
        "&:hover": {
          backgroundColor: alpha(primaryColor, 0.5),
          color: primaryColor,
        },
      },
      secondaryButton: {},
    },
    tooltipContainer: {
      position: "fixed",
      bottom: 15,
      right: 8,
      zIndex: 2000,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
    },
    flexTooltip: {
      marginBottom: 5,
    },
    fab: {
      position: "fixed",
      bottom: 20,
      right: 8,
      zIndex: 2000,
    },
    fakeInput: {},
    bigAvatar: {
      width: 160,
      height: 160,
    },
    buttonContainer: {
      horizontal: {
        display: "flex",
        flexWrap: "nowrap",
        overflowX: "auto",
        justifyContent: "flex-end",
      },
    },
  });
};

export default createAppTheme;