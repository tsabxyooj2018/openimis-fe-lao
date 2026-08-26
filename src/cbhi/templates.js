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
    /*
     * Everything the counter can use: the photograph that identifies the
     * holder, the barcode a desk scanner reads, and a QR any phone reads.
     *
     * It fits because the three are stacked rather than shared across a row --
     * see the note in MembershipCard. The earlier photograph template chose
     * between a photograph and a barcode because side by side the barcode falls
     * below the module width ISO asks for; below the text, it has the whole
     * body width and is comfortable.
     */
    id: "complete",
    labelKey: "template.complete",
    fallback: "Photograph, barcode and QR",
    photo: true,
    barcode: true,
    qr: true,
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
