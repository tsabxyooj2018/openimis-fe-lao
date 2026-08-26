/*
 * Reading a membership card's barcode.
 *
 * Three ways in, because a counter is not a laboratory:
 *
 *   1. a handheld scanner, which is a keyboard and needs no permission
 *   2. the device camera, for a phone or a laptop with no scanner
 *   3. a photograph of the card, for a card that arrived by message
 *
 * All three end in the same place: the insurance number the barcode carries,
 * handed to the same lookup the cards page already uses.
 *
 * NO DECODING LIBRARY
 *
 * The browser has one. BarcodeDetector is a platform API that reads Code 128 --
 * which is what src/cbhi/barcode.js prints -- from a video frame, a canvas or an
 * uploaded image, with nothing added to the bundle.
 *
 * Writing our own was right for the ENCODER: sixty lines of table lookup, and a
 * dependency in an image that is already slow to build could not be justified.
 * A decoder is not the mirror of that. It means thresholding a photograph taken
 * in whatever light a district office has, finding the bars, correcting for
 * angle and blur, and doing it fast enough to track a moving card. That is a
 * library's worth of work and getting it subtly wrong means scanning the wrong
 * member, which is worse than not scanning at all.
 *
 * WHERE IT IS NOT AVAILABLE
 *
 * BarcodeDetector is in Chromium -- Chrome and Edge, desktop and Android. It is
 * not in Firefox, and not in Safari. So the camera and upload paths are OFFERED
 * ONLY where they will work, and the handheld scanner and typing, which work
 * everywhere, are never hidden behind them. A button that opens a camera and
 * then cannot read anything is worse than no button.
 */

/** The one format the membership card prints. See barcode.js. */
const FORMAT = "code_128";

let cached = null;

/**
 * Whether this browser can decode a barcode, and a detector if it can.
 *
 * Asks the API which formats it actually supports rather than trusting that the
 * constructor exists: a browser may ship BarcodeDetector without Code 128.
 */
export async function detector() {
  if (cached !== null) return cached;
  try {
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
      cached = false;
      return cached;
    }
    const formats = await window.BarcodeDetector.getSupportedFormats();
    if (!formats || !formats.includes(FORMAT)) {
      cached = false;
      return cached;
    }
    cached = new window.BarcodeDetector({ formats: [FORMAT] });
  } catch (error) {
    // A browser that throws on any of this cannot decode; fall back quietly.
    cached = false;
  }
  return cached;
}

export const canDecode = async () => Boolean(await detector());

/*
 * The camera needs a secure context, and says so unhelpfully when it does not
 * have one. Checked up front so the message can be about the cause.
 */
export const isSecure = () =>
  typeof window !== "undefined" &&
  (window.isSecureContext || window.location.hostname === "localhost");

/** Reads a barcode from anything the detector accepts. Null when there is none. */
export async function readFrom(source) {
  const det = await detector();
  if (!det) return null;
  try {
    const found = await det.detect(source);
    const hit = (found || []).find((b) => b.rawValue);
    return hit ? String(hit.rawValue).trim() : null;
  } catch (error) {
    // detect() throws on a frame that is not ready yet, which happens
    // constantly while a camera warms up. Not an error worth surfacing.
    return null;
  }
}

/** Reads a barcode from an uploaded image file. */
export async function readFromFile(file) {
  if (!file) return null;
  const bitmap = await createImageBitmap(file);
  try {
    return await readFrom(bitmap);
  } finally {
    // Bitmaps hold real memory until closed, and a clerk may try several
    // photographs before one reads.
    if (bitmap.close) bitmap.close();
  }
}

/*
 * A handheld scanner, told apart from a person typing.
 *
 * A scanner is a keyboard: it types the digits and sends Enter. What
 * distinguishes it is SPEED -- a dozen characters inside a tenth of a second,
 * which no one can do by hand. So keystrokes are collected while they keep
 * arriving faster than a person could produce them, and the burst is accepted
 * only if it ends in Enter and is long enough to be an insurance number.
 *
 * Nothing is swallowed. Keys still reach the page, and anything typed into a
 * field is ignored outright: capturing while somebody is filling in a form
 * would make the scanner steal their address.
 */
const MAX_GAP_MS = 60; // between characters, well under human typing
const MIN_LENGTH = 4;

const inField = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};

/**
 * Calls `onScan(value)` when a handheld scanner fires, anywhere on the page.
 *
 * @returns {function} stop listening
 */
export function listenForScanner(onScan) {
  if (typeof document === "undefined") return () => {};

  let buffer = "";
  let last = 0;

  const onKeyDown = (event) => {
    if (inField(event.target)) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    const now = Date.now();
    if (now - last > MAX_GAP_MS) buffer = "";
    last = now;

    if (event.key === "Enter") {
      const value = buffer;
      buffer = "";
      if (value.length >= MIN_LENGTH) onScan(value);
      return;
    }
    // Single printable characters only: a card number has no punctuation and
    // this must not collect Shift, Tab or an arrow key.
    if (event.key.length === 1 && /[A-Za-z0-9]/.test(event.key)) buffer += event.key;
  };

  document.addEventListener("keydown", onKeyDown, true);
  return () => document.removeEventListener("keydown", onKeyDown, true);
}
