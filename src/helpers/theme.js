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
    overrides: {
      MuiTableRow: {
        root: {
          "&$selected": {
            backgroundColor: selectedTableRowColor,
          },
        },
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
      fontWeightRegular: 300,
      fontWeightMedium: 400,
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
      variant: "AppBar",
      drawer: {
        width: 300,
        fontSize: 16,
        fontWeight: 400,
        backgroundColor: primaryColor,
      },
      appBar: {
        fontSize: 16,
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
        fontSize: 24,
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