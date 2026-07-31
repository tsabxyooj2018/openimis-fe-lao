/*
 * Lets an administrator change the site emblem from the interface.
 *
 * There was already a way -- fe-core.logo.value in the module configuration --
 * but no form behind it. ModuleConfiguration is exposed as a GraphQL query with
 * no mutation, so a screen inside openIMIS would mean forking the backend; the
 * only route today is Django admin, pasting a base64 data URI into a JSON
 * textarea. That is a web form, not something to hand a ministry administrator.
 *
 * So the upload goes to the sidecar that already serves user photographs, and
 * src/index.js prefers what it holds over the configured value.
 *
 * Authorisation is not decided here. The control is only drawn when
 * /avatars/me reports isAdmin, and that flag is a rendering hint: the service
 * re-reads the caller's rights from openIMIS on every write, so hiding or
 * showing this changes nothing about who may actually do it.
 */

const API = "/avatars";
const LOGO_URL = `${API}/branding/logo`;
const PROFILE_ROUTE = "/profile/myProfile";
const CARD_ID = "lao-site-logo";
const MAX_BYTES = 3 * 1024 * 1024;

let me = null;
let asked = false;

const bust = (url) => `${url}?t=${Date.now()}`;

async function whoAmI() {
  if (asked) return me;
  asked = true;
  try {
    const res = await fetch(`${API}/me`, { credentials: "include" });
    me = res.ok ? await res.json() : null;
  } catch (e) {
    me = null; // sidecar absent: draw nothing
  }
  return me;
}

const el = (tag, style, html) => {
  const n = document.createElement(tag);
  if (style) Object.assign(n.style, style);
  if (html !== undefined) n.innerHTML = html;
  return n;
};

const BUTTON = {
  padding: "6px 16px",
  minHeight: "36px",
  border: "1px solid #c3d0da",
  borderRadius: "6px",
  background: "transparent",
  color: "#123b63",
  font: "inherit",
  fontSize: "0.875rem",
  fontWeight: "500",
  cursor: "pointer",
};

function build() {
  const card = el("div", {
    display: "flex",
    alignItems: "center",
    gap: "1.25rem",
    margin: "0 0 1rem",
    padding: "1rem 1.25rem",
    background: "#fff",
    border: "1px solid #e4ebf0",
    borderRadius: "8px",
  });
  card.id = CARD_ID;

  const preview = el("div", {
    width: "96px",
    height: "96px",
    flex: "0 0 96px",
    borderRadius: "8px",
    // Dark, because the emblem is transparent and is shown against the dark
    // sign-in panel. On white its outline would be invisible here and a surprise
    // there.
    background: "#123b63 center/contain no-repeat",
    border: "1px solid #d7e0e8",
  });

  const side = el("div", { display: "flex", flexDirection: "column", gap: "0.5rem" });
  const title = el(
    "div",
    { fontSize: "0.95rem", fontWeight: "600", color: "#123b63" },
    "ຮູບສັນຍາລັກຂອງລະບົບ / Site emblem",
  );
  const hint = el(
    "div",
    { fontSize: "0.8rem", color: "#5b7385" },
    "PNG, JPEG ຫຼື WebP · ສູງສຸດ 3 MB / max 3 MB · " +
      "ໃຊ້ໃນໜ້າເຂົ້າສູ່ລະບົບ ແລະ ແຖບເມນູ / used on the sign-in page and the sidebar",
  );
  const status = el("div", { fontSize: "0.8rem", minHeight: "1.1em" });

  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/webp";
  file.style.display = "none";

  const choose = el("button", BUTTON, "ປ່ຽນສັນຍາລັກ / Change emblem");
  choose.type = "button";
  const reset = el("button", BUTTON, "ກັບຄືນຄ່າເດີມ / Reset");
  reset.type = "button";

  const row = el("div", { display: "flex", gap: "0.5rem" });
  row.append(choose, reset);
  side.append(title, hint, row, status);
  card.append(preview, side, file);

  const setStatus = (text, ok) => {
    status.textContent = text || "";
    status.style.color = ok ? "#2e7d32" : "#c1272d";
  };

  const paint = (hasLogo) => {
    preview.style.backgroundImage = hasLogo ? `url("${bust(LOGO_URL)}")` : "";
    reset.style.display = hasLogo ? "" : "none";
  };

  // A changed emblem must appear everywhere at once: the sidebar and the
  // sign-in watermark read this property, and the toolbar image is React's.
  // Without this the sidebar would still show the old one until a reload.
  const republish = (hasLogo) => {
    if (!hasLogo) return; // reverting needs a reload to recover the built-in
    document.documentElement.style.setProperty("--lao-emblem", `url("${bust(LOGO_URL)}")`);
  };

  choose.addEventListener("click", () => file.click());

  file.addEventListener("change", async () => {
    const f = file.files && file.files[0];
    file.value = "";
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setStatus("ໄຟລ໌ໃຫຍ່ເກີນ 3 MB / file is larger than 3 MB", false);
      return;
    }

    setStatus("ກຳລັງອັບໂຫລດ… / uploading…", true);
    const body = new FormData();
    body.append("logo", f);
    try {
      const res = await fetch(LOGO_URL, { method: "POST", credentials: "include", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(
          res.status === 403
            ? "ບໍ່ມີສິດປ່ຽນສັນຍາລັກ / not permitted to change the emblem"
            : data.error || `ອັບໂຫລດບໍ່ສຳເລັດ (${res.status})`,
          false,
        );
        return;
      }
      me = { ...me, hasLogo: true };
      paint(true);
      republish(true);
      setStatus("ບັນທຶກແລ້ວ / saved", true);
    } catch (e) {
      setStatus("ບໍ່ສາມາດຕິດຕໍ່ເຊີບເວີ / could not reach the service", false);
    }
  });

  reset.addEventListener("click", async () => {
    setStatus("ກຳລັງກັບຄືນ… / resetting…", true);
    try {
      const res = await fetch(LOGO_URL, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        setStatus(`ບໍ່ສຳເລັດ (${res.status})`, false);
        return;
      }
      me = { ...me, hasLogo: false };
      paint(false);
      setStatus("ກັບຄືນຄ່າເດີມແລ້ວ — ໂຫລດໜ້າໃໝ່ເພື່ອເຫັນຜົນ / reset — reload to see it", true);
    } catch (e) {
      setStatus("ບໍ່ສາມາດຕິດຕໍ່ເຊີບເວີ / could not reach the service", false);
    }
  });

  paint(!!me.hasLogo);
  return card;
}

function inject() {
  if (!window.location.pathname.endsWith(PROFILE_ROUTE)) {
    const stale = document.getElementById(CARD_ID);
    if (stale) stale.remove();
    return;
  }
  if (!me || !me.isAdmin || document.getElementById(CARD_ID)) return;

  const host = document.querySelector("main");
  if (!host) return;
  // After the user's own photo card, which is the more personal of the two.
  const photo = document.getElementById("lao-user-photo");
  if (photo && photo.parentNode === host) photo.insertAdjacentElement("afterend", build());
  else host.insertBefore(build(), host.firstChild);
}

export default function mountSiteLogo() {
  if (typeof document === "undefined") return;

  whoAmI().then(() => {
    if (!me || !me.isAdmin) return;
    inject();
    const observer = new MutationObserver(inject);
    const start = () => observer.observe(document.body, { childList: true, subtree: true });
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start);
  });
}
