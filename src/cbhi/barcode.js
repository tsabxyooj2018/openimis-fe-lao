/*
 * Code 128 (subset B), because the card in circulation carries a barcode and a
 * card that cannot be scanned at the counter is a card that has to be typed.
 *
 * Written out rather than pulled from a package: the alternative is a
 * dependency in an image that is already slow to build, for about sixty lines.
 *
 * HOW IT IS CHECKED
 *
 * Every Code 128 symbol is eleven modules wide -- six alternating bar and space
 * runs whose widths sum to 11 -- except the stop pattern, which is thirteen
 * across seven runs. That is a strong structural invariant: almost any typo in
 * the table below breaks it. PATTERNS is verified against it at module load, and
 * throws rather than silently emitting a barcode that looks plausible and scans
 * as nothing. See the test in the page's console output.
 *
 * A structurally valid symbology is still not a scanned one. Before a real batch
 * is printed, one card must be read with the scanner the counters actually use.
 */

// Widths of the alternating bar/space runs for values 0..106.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

/*
 * Runs at module load. A table this shape is exactly the kind of thing that is
 * copied with one digit wrong and then produces barcodes nobody can read until
 * a batch has already been laminated.
 */
(function verifyPatternTable() {
  if (PATTERNS.length !== 107) {
    throw new Error(`Code 128 table has ${PATTERNS.length} entries, expected 107`);
  }
  PATTERNS.forEach((pattern, value) => {
    const modules = pattern.split("").reduce((sum, digit) => sum + Number(digit), 0);
    const expected = value === STOP ? 13 : 11;
    const runs = value === STOP ? 7 : 6;
    if (modules !== expected || pattern.length !== runs) {
      throw new Error(
        `Code 128 pattern ${value} is ${modules} modules over ${pattern.length} runs, expected ${expected} over ${runs}`,
      );
    }
  });
})();

/**
 * Bar widths for a Code 128B barcode, as alternating bar/space run lengths
 * starting with a bar.
 *
 * @param {string} value the text to encode
 * @returns {number[]} run lengths in modules
 */
export function code128Runs(value) {
  const text = String(value ?? "");
  const codes = [START_B];

  for (const character of text) {
    const point = character.codePointAt(0);
    // Subset B covers ASCII 32..126. Anything else -- a Lao character pasted
    // into the number, say -- cannot be represented, and a wrong barcode is
    // worse than none.
    if (point < 32 || point > 126) return [];
    codes.push(point - 32);
  }

  // Modulo-103 checksum, weighted by position, start character weighted once.
  const checksum = codes.reduce(
    (total, code, index) => total + code * (index === 0 ? 1 : index),
    0,
  ) % 103;

  codes.push(checksum, STOP);

  return codes
    .map((code) => PATTERNS[code])
    .join("")
    .split("")
    .map(Number);
}

/**
 * The same barcode as SVG rectangles, sized to a viewBox of the total module
 * width so it can be stretched to any width the card gives it.
 *
 * Returns null when the value cannot be encoded, so a caller can leave the space
 * empty rather than print something meaningless.
 */
export function code128Svg(value, height = 40) {
  const runs = code128Runs(value);
  if (!runs.length) return null;

  const bars = [];
  let x = 0;
  runs.forEach((width, index) => {
    // Even indices are bars, odd are spaces; only bars are drawn.
    if (index % 2 === 0) bars.push({ x, width });
    x += width;
  });

  return { totalWidth: x, height, bars };
}
