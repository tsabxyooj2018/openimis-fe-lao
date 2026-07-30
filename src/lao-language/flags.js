import React from "react";
import LANGUAGES from "./languages.json";

/*
 * Flag icons for the language switcher.
 *
 * The geometry lives in languages.json, not here. Two consumers need it in two
 * forms -- this module renders React elements, headerSwitcher writes plain DOM
 * because it mounts outside the app's render tree -- and it used to be written
 * out twice, once as JSX and once as a string. Adding a language then meant
 * editing four files, and the two copies could drift.
 *
 * So the JSON holds the *inner* markup of each flag as a plain SVG string and
 * each consumer wraps it in the frame below. Being markup rather than JSX, it
 * uses HTML attribute names ("stroke-width", not "strokeWidth").
 *
 * Inline SVG rather than emoji: flag emoji render as bare letter pairs ("LA")
 * on Windows, which is what most ministry workstations run.
 *
 * Drawn at 24x16 (3:2) and scaled by the caller. A hairline border keeps the
 * white bands of the Lao and French flags from bleeding into a light row.
 */

const VIEWBOX = "0 0 24 16";
const WIDTH = 22;
const HEIGHT = 15;
const BORDER = "0 0 0 1px rgba(0,0,0,0.18)";

const byCode = (code) => LANGUAGES.find((l) => l.code === code);

/** The plain-DOM form: a complete <svg> element as a string. */
export const flagMarkup = (code) => {
  const lang = byCode(code);
  if (!lang) return "";
  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="${VIEWBOX}">${lang.flag}</svg>`;
};

/*
 * The React form. dangerouslySetInnerHTML is safe here by construction: the
 * markup is a build-time constant from languages.json and never touches user
 * input or anything fetched at runtime.
 */
export const Flag = ({ code }) => {
  const lang = byCode(code);
  if (!lang) return null;
  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={VIEWBOX}
      role="img"
      aria-label={lang.english}
      style={{ display: "block", borderRadius: 2, boxShadow: BORDER }}
      dangerouslySetInnerHTML={{ __html: lang.flag }}
    />
  );
};

export default Flag;
