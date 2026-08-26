import { BarcodeFormat, EncodeHintType, MultiFormatWriter } from "@zxing/library";

/*
 * QR for the membership card.
 *
 * WHY THIS DOES NOT HAVE ITS OWN ENCODER, WHEN barcode.js DOES
 *
 * Code 128 is a table lookup: sixty lines, no arithmetic beyond a checksum, and
 * a dependency could not have been justified for it. QR is a different animal --
 * Reed-Solomon error correction over a Galois field, eight candidate masks
 * scored against four penalty rules, version and capacity selection. Nobody
 * should write that from memory to put a number on a card.
 *
 * It costs nothing here: @zxing/library is already a dependency for READING
 * cards, and the same package encodes. So this is a few lines over machinery
 * that is already in the bundle.
 *
 * WHAT THE QR CARRIES, AND WHAT IT DELIBERATELY DOES NOT
 *
 * The insurance number. Only that.
 *
 * Not a URL into openIMIS: that would print this deployment's hostname on every
 * card, so a change of domain orphans them all, and a card dropped in a market
 * would advertise where the system lives.
 *
 * Not the name or date of birth either. A QR is readable by anyone with a
 * phone, including someone who has found the card. The number is already
 * printed on the face in plain text, so encoding it exposes nothing new --
 * which is the test any addition here has to pass.
 *
 * The number is also what the system actually looks up, so a scan lands
 * somewhere useful rather than needing a second step.
 */

/**
 * The QR modules for a value, as a square boolean grid.
 *
 * Null when there is nothing to encode -- an insuree may have no insurance
 * number, `chfId` being nullable in openIMIS, and a QR of the empty string is a
 * valid symbol that scans as nothing at all. The same reasoning as barcode.js.
 *
 * @returns {{size: number, dark: boolean[][]} | null}
 */
export function qrMatrix(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  try {
    const hints = new Map();
    // No quiet zone from the writer: the card draws its own, so that the
    // margin is a layout decision here rather than baked into the symbol.
    hints.set(EncodeHintType.MARGIN, 0);
    const matrix = new MultiFormatWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, hints);

    const size = matrix.getWidth();
    const dark = [];
    for (let y = 0; y < size; y += 1) {
      const row = [];
      for (let x = 0; x < size; x += 1) row.push(matrix.get(x, y));
      dark.push(row);
    }
    return { size, dark };
  } catch (error) {
    // Better no QR than a broken one on a card that will be laminated.
    return null;
  }
}

/*
 * The quiet zone the QR specification asks for, in modules.
 *
 * Four on every side. Printed without it the finder patterns have no ground to
 * stand against and phones stop reading the symbol at an angle -- which is how
 * a card gets held.
 */
export const QR_QUIET = 4;
