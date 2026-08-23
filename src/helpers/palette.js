/*
 * The deployment's palette, in one place.
 *
 * There were fifteen copies of the old blue scattered across theme.js, two
 * stylesheets and four components. Changing the brand colour meant finding all
 * of them, and missing one left the login page or the sidebar in the previous
 * colour with nothing to say why.
 *
 * Now: this file is the source, theme.js builds the Material-UI palette from
 * it, and index.js publishes the resolved values as CSS custom properties so
 * the stylesheets follow the same values rather than repeating them. A colour
 * appears once.
 *
 * THIS FILE IS THE DEFAULT, NOT THE LAST WORD
 *
 * fe-core.theme in the module configuration overrides any of these at runtime,
 * with no rebuild -- src/index.js reads it and hands it to createAppTheme. So a
 * shade can be adjusted from the database, and because the CSS properties are
 * published from the resolved theme rather than from this file, the stylesheets
 * follow that override too.
 */

/*
 * The brand teal. Read from the swatch supplied by the scheme; if it is a shade
 * out, this single value is the thing to change -- or set fe-core.theme in the
 * database and change nothing here at all.
 */
export const BRAND = "#016173";

/*
 * Derived shades, kept as constants rather than computed, because the gradients
 * they feed were tuned by eye and a generated ramp would not reproduce them.
 * Each is the teal equivalent of the blue it replaces.
 */
export const BRAND_DARKEST = "#04222A"; // was #071b30, the head of the gradients
export const BRAND_DARK = "#013C47";
export const BRAND_LIGHT = "#17798D"; // was #17456f, the tail of the gradients

/*
 * Neutrals carry a teal bias so they read as chosen rather than inherited: the
 * previous ones were biased toward the old blue and would look faintly wrong
 * beside the new primary.
 */
export const SURFACE = "#EDF4F5"; // page ground, was #EDF2F6
export const SURFACE_HEADER = "#D2E5E8"; // panel headers, was #D6E2EC
export const GREY = "#7A939A"; // muted labels, was #7C939F

/** Lao red, reserved for error states. Unchanged: it is not a brand colour. */
export const ERROR = "#C1272D";

export const defaultColors = {
  primaryColor: BRAND,
  errorColor: ERROR,
  whiteColor: "#fff",
  fontColor: BRAND,
  backgroundColor: SURFACE,
  headerColor: SURFACE_HEADER,
  greyColor: GREY,
  selectedTableRowColor: "rgba(0, 0, 0, 0.08)",
  hoveredTableRowColor: "rgba(0, 0, 0, 0.12)",
  toggledButtonColor: "#999999",
  lockedBackgroundPattern:
    "repeating-linear-gradient(45deg, #D3D3D3 1px, #D3D3D3 1px, #fff 10px, #fff 10px)",
};

/**
 * Publishes the resolved palette as CSS custom properties on :root.
 *
 * Called once with the theme that is actually in force, so the stylesheets
 * follow a database override as well as the defaults above. Every stylesheet
 * declares a fallback in var(), so the page is still correct in the moment
 * before this runs.
 *
 * @param {object} colors the resolved theme colours
 */
export function publishCssVariables(colors = {}) {
  const root = document.documentElement;
  const set = (name, value) => value && root.style.setProperty(name, value);

  set("--brand", colors.primaryColor ?? BRAND);
  set("--brand-darkest", colors.brandDarkest ?? BRAND_DARKEST);
  set("--brand-dark", colors.brandDark ?? BRAND_DARK);
  set("--brand-light", colors.brandLight ?? BRAND_LIGHT);
  set("--surface", colors.backgroundColor ?? SURFACE);
  set("--surface-header", colors.headerColor ?? SURFACE_HEADER);
  set("--error", colors.errorColor ?? ERROR);
}
