/*
 * The card templates.
 *
 * A registry rather than a switch statement, so adding one is a data change and
 * the picker, the default and the card renderer all stay in step automatically.
 *
 * `faithful` is the default because it is closest to the card people already
 * carry: same gold ground, same left authority band, same barcode, no
 * photograph. Someone holding both should see one scheme, not two.
 *
 * The default can be overridden per deployment without a rebuild --
 * getConf("cbhi", "cardTemplate") -- and an operator can pick a different one
 * for a single run.
 */
export const DEFAULT_TEMPLATE = "faithful";

export const TEMPLATES = [
  {
    id: "faithful",
    // Labels are resolved through the dictionary at render; these are the keys.
    labelKey: "template.faithful",
    fallback: "Faithful — as the current card",
    photo: false,
    barcode: true,
  },
  {
    id: "photo",
    labelKey: "template.photo",
    fallback: "With photograph",
    photo: true,
    // A photograph and a barcode do not both fit at this size, and of the two
    // the photograph is the one that changes what the card is for.
    barcode: false,
  },
  {
    id: "clean",
    labelKey: "template.clean",
    fallback: "Modernised",
    photo: false,
    barcode: true,
  },
  {
    id: "institutional",
    labelKey: "template.institutional",
    fallback: "Institutional blue",
    photo: false,
    barcode: true,
  },
];

export const templateById = (id) =>
  TEMPLATES.find((template) => template.id === id) ||
  TEMPLATES.find((template) => template.id === DEFAULT_TEMPLATE);
