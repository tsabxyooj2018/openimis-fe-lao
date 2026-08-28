/*
 * Language switcher mounted directly into the application toolbar.
 *
 * Why not a menu contribution: the shell asks for menu contributions by module
 * name taken from openimis.json (getContribs("<name>.MainMenu")). A local module
 * cannot be listed there -- load-config resolves those entries from npm and
 * strips unpublished ones -- so "language.MainMenu" is never requested and the
 * group never renders. Repositioning it with CSS therefore had nothing to move.
 *
 * fe-core exposes no contribution point for the toolbar either; the only keys are
 * *.MainMenu, core.Router, refs, translations, reducers and middlewares. So this
 * mounts itself.
 *
 * Deliberately plain DOM, not React: the toolbar sits outside this module's
 * render tree, so a React root mounted here would have no ThemeProvider, no
 * store and no router context. Plain nodes with inline styles have none of those
 * dependencies and cannot break the host app.
 */

import { applyLanguage, LANGUAGE_STORAGE_KEY as STORAGE_KEY } from "./switchLanguage";
import { flagMarkup } from "./flags";
import LANGUAGES from "./languages.json";

const ROOT_ID = "lao-language-switcher";

/*
 * The language this browser last recorded. A hint for the first paint only --
 * see syncWithServer below for what actually decides.
 */
const currentCode = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "en";
  } catch (e) {
    return "en";
  }
};

/*
 * The language the interface is actually in.
 *
 * It lives on the user record, not in this browser: openIMIS renders whatever
 * tblUsers.LanguageID says. Showing localStorage instead meant the switcher
 * could read "English" over a Lao interface -- on a machine where the change
 * was never made, or after the storage was cleared, the cache was simply absent
 * and the widget fell back to "en" while the menus were in Lao.
 *
 * i_user.language is a plain code ("lo") in the same payload the avatar service
 * already uses to identify a caller.
 */
const SERVER_LANGUAGE = "/api/core/users/current_user/";

async function serverLanguage() {
  try {
    const res = await fetch(SERVER_LANGUAGE, { credentials: "include" });
    if (!res.ok) return null;
    const body = await res.json();
    const code = body && body.i_user && body.i_user.language;
    return typeof code === "string" && code ? code : null;
  } catch (e) {
    return null; // signed out, or offline: leave the hint in place
  }
}

const el = (tag, styles, html) => {
  const n = document.createElement(tag);
  Object.assign(n.style, styles);
  if (html !== undefined) n.innerHTML = html;
  return n;
};

function build() {
  const wrap = el("div", {
    position: "relative",
    display: "flex",
    alignItems: "center",
    marginRight: "8px",
  });
  wrap.id = ROOT_ID;
  // Recorded so syncWithServer can tell whether a rebuild is needed.
  wrap.dataset.code = (LANGUAGES.find((l) => l.code === currentCode()) || LANGUAGES[1]).code;

  const button = el("button", {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    height: "38px",
    padding: "0 10px",
    border: "0",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.12)",
    color: "#fff",
    font: "inherit",
    fontSize: "0.85rem",
    cursor: "pointer",
    /* One line, always. ພາສາລາວ broke after ພາສາ on a narrow toolbar, and a
       language name split across two lines reads as two options rather than
       one. Lao has no spaces between words, so the break landed mid-name. */
    whiteSpace: "nowrap",
  });
  button.type = "button";
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");
  button.title = "ປ່ຽນພາສາ / Change language";

  const active = LANGUAGES.find((l) => l.code === currentCode()) || LANGUAGES[1];
  button.innerHTML =
    `<span style="display:flex;border-radius:2px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.2)">${flagMarkup(
      active.code
    )}</span>` +
    `<span>${active.native}</span>` +
    `<span style="opacity:.7;font-size:.7rem">&#9662;</span>`;

  const menu = el("div", {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: "0",
    minWidth: "220px",
    background: "#10345a",
    borderRadius: "8px",
    boxShadow: "0 12px 32px -8px rgba(0,0,0,.55)",
    overflow: "hidden",
    display: "none",
    zIndex: "1500",
  });

  LANGUAGES.forEach((lang) => {
    const row = el("button", {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      width: "100%",
      padding: "10px 14px",
      border: "0",
      background: "transparent",
      color: "#fff",
      font: "inherit",
      fontSize: "0.85rem",
      textAlign: "left",
      cursor: "pointer",
    });
    row.type = "button";
    const isActive = lang.code === active.code;
    row.innerHTML =
      `<span style="display:flex;border-radius:2px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.2)">${flagMarkup(
        lang.code
      )}</span>` +
      `<span style="display:flex;flex-direction:column;line-height:1.3;flex:1">` +
      `<span>${lang.native}</span>` +
      `<span style="opacity:.6;font-size:.72rem">${lang.english}</span>` +
      `</span>` +
      (isActive
        ? `<span style="color:#7fd1a6;font-size:1rem;line-height:1">&#10003;</span>`
        : "");
    if (isActive) row.style.background = "rgba(255,255,255,.08)";
    row.addEventListener("mouseenter", () => (row.style.background = "rgba(255,255,255,.10)"));
    row.addEventListener("mouseleave", () => {
      row.style.background = isActive ? "rgba(255,255,255,.08)" : "transparent";
    });
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isActive) return close();

      /*
       * Applied in place, then a single reload.
       *
       * This used to navigate to /front/language/<code>, which is a full page
       * load, and that page then reloaded again -- booting an 8MB SPA twice for
       * one setting. openIMIS builds its dictionaries at startup, so one reload
       * is unavoidable; two were not.
       */
      const label = row.innerHTML;
      row.innerHTML = `<span style="opacity:.75">ກຳລັງປ່ຽນ… / switching…</span>`;
      row.disabled = true;

      applyLanguage(lang.code)
        .then(() => window.location.reload())
        .catch((err) => {
          row.disabled = false;
          row.innerHTML = label;
          // eslint-disable-next-line no-alert
          window.alert(`Could not change language: ${err.message}`);
        });
    });
    menu.appendChild(row);
  });

  const close = () => {
    menu.style.display = "none";
    button.setAttribute("aria-expanded", "false");
  };
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.style.display === "none";
    menu.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", close);
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());

  wrap.appendChild(button);
  wrap.appendChild(menu);
  return wrap;
}

function mount() {
  if (document.getElementById(ROOT_ID)) return true;
  const toolbar = document.querySelector("header .MuiToolbar-root");
  if (!toolbar) return false;

  // Sit immediately left of the last icon button (the documentation "?").
  const buttons = toolbar.querySelectorAll(":scope > button");
  const anchor = buttons[buttons.length - 1];
  if (anchor) toolbar.insertBefore(build(), anchor);
  else toolbar.appendChild(build());
  return true;
}

/*
 * Reconcile once per page with the user record.
 *
 * The widget paints immediately from the stored hint -- a flag that appears and
 * then corrects itself is worse than one that appears slightly late -- and is
 * rebuilt only when the two disagree.
 */
let synced = false;
function syncWithServer() {
  if (synced) return;
  synced = true;
  serverLanguage().then((code) => {
    if (!code) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch (e) {
      /* private mode: the hint stays wrong, the interface does not */
    }
    const existing = document.getElementById(ROOT_ID);
    if (existing && existing.dataset.code !== code) {
      existing.remove();
      mount();
    }
  });
}

export default function mountHeaderSwitcher() {
  if (typeof document === "undefined") return;
  if (mount()) {
    syncWithServer();
    return;
  }
  // The toolbar only exists after sign-in, and the shell re-renders, so keep
  // watching rather than mounting once.
  const observer = new MutationObserver(() => {
    if (mount()) syncWithServer();
  });
  const start = () => observer.observe(document.body, { childList: true, subtree: true });
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
}
