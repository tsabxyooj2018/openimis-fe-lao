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

/*
 * The formats a membership card can carry.
 *
 * Code 128 is on every card this deployment has ever printed. QR is on the
 * template that carries a photograph and both symbols, and both encode the SAME
 * thing -- the insurance number -- so either scan resolves to the same member
 * and it does not matter which one the clerk happens to catch.
 *
 * Both are listed rather than one, because a card in a wallet may be either.
 * The list stays short on purpose: every extra format is another way for a
 * blurred frame to be read as something it is not.
 *
 * Worth knowing for the camera. A phone reads QR far more easily than Code 128:
 * a QR carries three finder patterns and can be decoded at an angle, whereas a
 * 1D barcode needs a scan line that crosses every bar cleanly. If a card will
 * usually be read with a phone, the QR template is the one to print.
 */
const FORMATS = [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE];

let reader = null;

function getReader() {
  if (reader) return reader;
  reader = new MultiFormatReader();
  const hints = new Map();
  // Narrowed to the two the card can carry: faster, and less likely to read
  // something else in the frame as a different symbology.
  hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
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
 * One attempt at one orientation. Null when there is no readable barcode.
 *
 * @param {Uint8ClampedArray} data RGBA, four bytes per pixel
 * @param {boolean} inverted read light bars on a dark ground
 */
export function decodeImageData(data, width, height, inverted = false) {
  try {
    let source = new RGBLuminanceSource(toLuminance(data, width, height), width, height);
    if (inverted) source = source.invert();
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

/**
 * Turns RGBA pixels a quarter turn clockwise.
 *
 * RGBLuminanceSource says plainly that it does not support rotation, so the
 * pixels are turned here rather than asking it to.
 */
export function rotateRgba(data, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      const to = (x * height + (height - 1 - y)) * 4;
      out[to] = data[from];
      out[to + 1] = data[from + 1];
      out[to + 2] = data[from + 2];
      out[to + 3] = data[from + 3];
    }
  }
  return { data: out, width: height, height: width };
}

/*
 * Every orientation, and both polarities.
 *
 * A photograph does not arrive the way it was framed. A phone records the
 * orientation in EXIF and leaves the pixels sideways, and not every path into
 * the browser applies it -- so a card photographed in portrait reaches the
 * decoder rotated a quarter turn. ZXing reads horizontal scan lines; a sideways
 * barcode is simply not there as far as it is concerned.
 *
 * Both of these were reproduced before being fixed: rendering the encoder's own
 * output rotated, and inverted, and watching a decoder that reads every other
 * shape return nothing at all.
 *
 * The upright reading is tried first and costs one pass, which is what a
 * screenshot or a straight photograph will take. The rest only run when that
 * fails, so the common case is not slowed by the awkward one.
 */
export function decodeThorough(data, width, height) {
  let image = { data, width, height };
  for (let turn = 0; turn < 4; turn += 1) {
    if (turn > 0) image = rotateRgba(image.data, image.width, image.height);
    for (const inverted of [false, true]) {
      const hit = decodeImageData(image.data, image.width, image.height, inverted);
      if (hit) return hit;
    }
  }
  return null;
}

/** Draws anything with intrinsic dimensions to a canvas and returns its pixels. */
function pixelsOf(source, width, height) {
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/** Reads a barcode from a live <video>. Null while there is nothing to read. */
export function readFromVideo(video) {
  if (!video || video.readyState < 2) return null;
  const pixels = pixelsOf(video, video.videoWidth, video.videoHeight);
  if (!pixels) return null;
  /*
   * Upright and inverted only -- no rotation. The operator is holding the card
   * and can turn it, and this runs four times a second on office hardware. The
   * thorough search belongs to the upload path, where there is one image and
   * nobody can reframe it.
   */
  return (
    decodeImageData(pixels.data, pixels.width, pixels.height, false) ||
    decodeImageData(pixels.data, pixels.width, pixels.height, true)
  );
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
    const pixels = pixelsOf(bitmap, width, height);
    return pixels ? decodeThorough(pixels.data, pixels.width, pixels.height) : null;
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
