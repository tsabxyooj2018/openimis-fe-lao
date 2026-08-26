import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";

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
 * WHY A LIBRARY, WHEN barcode.js WAS WRITTEN BY HAND
 *
 * The first attempt used BarcodeDetector, the browser's own barcode API, on the
 * grounds that a platform feature beats a dependency. That was wrong here, and
 * wrong in a way worth recording so nobody tries it again.
 *
 * BarcodeDetector is not implemented by the browser -- it is a shim over the
 * host operating system: ML Kit on Android, Vision on macOS, and a barcode
 * service on ChromeOS. WINDOWS AND LINUX DESKTOP HAVE NO SUCH SERVICE, so
 * Chrome and Edge on Windows report no supported formats at all. Every clerk in
 * this deployment is on Windows. The feature degraded politely to "your browser
 * cannot do this", which was true and useless.
 *
 * Writing our own decoder was the other option and is not the mirror of writing
 * the encoder. The encoder is sixty lines of table lookup against a fixed
 * alphabet -- which is exactly why barcode.js does not use a package. A decoder
 * has to threshold a photograph taken in whatever light a district office has,
 * find the bars through blur and skew, and recover the modules. Getting that
 * subtly wrong does not fail; it returns a DIFFERENT VALID NUMBER, and the
 * clerk serves the wrong member. ZXing has a checksum, years of hardening, and
 * is the reference implementation this card's format came from.
 *
 * So: hand-rolled where the alternative was sixty lines, a library where the
 * alternative is image processing that must not be subtly wrong.
 */

/** The one format the membership card prints. See barcode.js. */
const FORMAT = BarcodeFormat.CODE_128;

let reader = null;

function getReader() {
  if (reader) return reader;
  reader = new MultiFormatReader();
  const hints = new Map();
  // Only Code 128. Narrowing the formats makes it both faster and less likely
  // to read something else in the frame as a different symbology.
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [FORMAT]);
  // Worth the extra passes: the input is a phone photograph, not a scanner bed.
  hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  return reader;
}

/*
 * RGBA to one byte a pixel.
 *
 * RGBLuminanceSource does NOT take RGBA, despite the name. It takes either an
 * Int32Array of packed ARGB, or a Uint8ClampedArray that is ALREADY luminance,
 * one byte per pixel -- and it tells the two apart by BYTES_PER_ELEMENT, so a
 * Uint8ClampedArray of RGBA is accepted without complaint and read as four
 * pixels' brightness per pixel. It does not throw. It just never finds a
 * barcode, which reads as "this photograph was not good enough".
 *
 * The weighting is ZXing's own cheap green-favouring average, so the values
 * here match what it computes internally for the Int32Array path.
 */
function toLuminance(rgba, width, height) {
  const grey = new Uint8ClampedArray(width * height);
  for (let p = 0, i = 0; p < grey.length; p += 1, i += 4) {
    grey[p] = (rgba[i] + 2 * rgba[i + 1] + rgba[i + 2]) / 4;
  }
  return grey;
}

/**
 * Decodes RGBA pixels. Null when there is no readable barcode.
 *
 * @param {Uint8ClampedArray} data RGBA, four bytes per pixel
 */
export function decodeImageData(data, width, height) {
  try {
    const source = new RGBLuminanceSource(toLuminance(data, width, height), width, height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const result = getReader().decode(bitmap);
    const text = result && result.getText();
    return text ? String(text).trim() : null;
  } catch (error) {
    // NotFoundException is the ordinary answer for a frame with no barcode in
    // it, which is most frames. Not an error worth surfacing.
    return null;
  } finally {
    // The reader keeps state between calls and will otherwise carry a previous
    // frame's guesses into the next one.
    getReader().reset();
  }
}

/** Draws anything with intrinsic dimensions to a canvas and decodes it. */
function decodeDrawable(source, width, height) {
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return decodeImageData(data, width, height);
}

/** Reads a barcode from a live <video>. Null while there is nothing to read. */
export function readFromVideo(video) {
  if (!video || video.readyState < 2) return null;
  return decodeDrawable(video, video.videoWidth, video.videoHeight);
}

/*
 * Reads a barcode from an uploaded image.
 *
 * Large photographs are scaled down first. A modern phone camera produces
 * something like 4000x3000, and decoding at that size is slow without being
 * more accurate -- the bars are hundreds of pixels wide. 1600 across is far
 * more than the format needs and keeps a card photograph inside a second.
 */
const MAX_WIDTH = 1600;

export async function readFromFile(file) {
  if (!file) return null;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    return decodeDrawable(bitmap, width, height);
  } finally {
    // Bitmaps hold real memory until closed, and a clerk may try several
    // photographs before one reads.
    if (bitmap.close) bitmap.close();
  }
}

/*
 * The camera needs a secure context, and says so unhelpfully when it does not
 * have one. Checked up front so the message can be about the cause.
 */
export const isSecure = () =>
  typeof window !== "undefined" &&
  (window.isSecureContext || window.location.hostname === "localhost");

export const hasCamera = () =>
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices &&
  !!navigator.mediaDevices.getUserMedia;

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
