import React from "react";

/*
 * Flag icons for the language switcher.
 *
 * Inline SVG rather than emoji: flag emoji (🇱🇦) render as bare letter pairs
 * ("LA") on Windows, which is what most ministry workstations run.
 *
 * Drawn at 24x16 (3:2) and scaled by the caller. A hairline border keeps the
 * white bands of the Lao and French flags from bleeding into a light row.
 */

const Frame = ({ children, title }) => (
  <svg
    width="22"
    height="15"
    viewBox="0 0 24 16"
    role="img"
    aria-label={title}
    style={{ display: "block", borderRadius: 2, boxShadow: "0 0 0 1px rgba(0,0,0,0.18)" }}
  >
    <title>{title}</title>
    {children}
  </svg>
);

// Laos: red band, blue band of double height, red band, white disc centred.
export const FlagLao = () => (
  <Frame title="ລາວ">
    <rect width="24" height="16" fill="#ce1126" />
    <rect y="4" width="24" height="8" fill="#002868" />
    <circle cx="12" cy="8" r="3" fill="#fff" />
  </Frame>
);

// United Kingdom: white saltire, red saltire, white cross, red cross.
export const FlagEnglish = () => (
  <Frame title="English">
    <rect width="24" height="16" fill="#012169" />
    <path d="M0,0 L24,16 M24,0 L0,16" stroke="#fff" strokeWidth="3.2" />
    <path d="M0,0 L24,16 M24,0 L0,16" stroke="#c8102e" strokeWidth="1.8" />
    <path d="M12,0 V16 M0,8 H24" stroke="#fff" strokeWidth="5.4" />
    <path d="M12,0 V16 M0,8 H24" stroke="#c8102e" strokeWidth="3.2" />
  </Frame>
);

// France: three equal vertical bands.
export const FlagFrench = () => (
  <Frame title="Français">
    <rect width="24" height="16" fill="#fff" />
    <rect width="8" height="16" fill="#002395" />
    <rect x="16" width="8" height="16" fill="#ed2939" />
  </Frame>
);

export const FLAGS = {
  lo: FlagLao,
  en: FlagEnglish,
  fr: FlagFrench,
};
