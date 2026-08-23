/*
 * User photographs: shows one in the toolbar, and lets a user change their own
 * from My Profile.
 *
 * openIMIS has no user photo. tblUsers has no image column, and neither
 * UserGQLType nor UpdateUserMutationInput exposes one, so a photo cannot be read
 * or written through its API at all. A small service runs alongside instead
 * (avatar-service/ in the deployment repository), reached at /avatars/ on this
 * same origin so session cookies apply and there is no CORS to configure.
 *
 * It degrades to nothing. If the service is not deployed -- which is its state
 * until the image is published and the compose entry uncommented -- every call
 * here fails, and failing means the generic icon stays and no controls appear.
 * The profile page and toolbar must not break because a sidecar is absent.
 *
 * Identity is never asserted here. The service asks openIMIS who the caller is
 * and trusts only that, so this cannot upload a photo for anyone else however
 * it is called.
 */

const API = "/avatars";
const PROFILE_ROUTE = "/profile/myProfile";
const CARD_ID = "lao-user-photo";
const AVATAR_MARK = "laoPhotoApplied";
const MAX_BYTES = 3 * 1024 * 1024;

const TOOLBAR_AVATAR =
  '.MuiDrawer-paperAnchorDockedLeft .MuiAccordion-root:has(> [data-menu-id="ProfileMainMenu"])' +
  " .MuiAccordionSummary-content > .MuiIconButton-root";

let me = null; // { id, username, hasPhoto, url } once known
let asked = false;

const bust = (url) => `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;

async function whoAmI() {
  if (asked) return me;
  asked = true;
  try {
    const res = await fetch(`${API}/me`, { credentials: "include" });
    if (!res.ok) return null;
    me = await res.json();
  } catch (e) {
    me = null; // service absent: stay silent
  }
  return me;
}

/* ---------------------------------------------------------------- toolbar -- */

function paintToolbar() {
  const el = document.querySelector(TOOLBAR_AVATAR);
  if (!el || !me) return;

  const url = me.hasPhoto ? bust(me.url) : null;
  if (el.dataset[AVATAR_MARK] === (url || "none")) return;
  el.dataset[AVATAR_MARK] = url || "none";

  const svg = el.querySelector("svg");
  if (url) {
    el.style.backgroundImage = `url("${url}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    if (svg) svg.style.visibility = "hidden";
  } else {
    el.style.backgroundImage = "";
    if (svg) svg.style.visibility = "";
  }
}

/* ------------------------------------------------------------ profile page -- */

const styles = {
  card: {
    display: "flex",
    alignItems: "center",
    gap: "1.25rem",
    margin: "0 0 1rem",
    padding: "1rem 1.25rem",
    background: "#fff",
    border: "1px solid #e4ebf0",
    borderRadius: "8px",
  },
  photo: {
    width: "96px",
    height: "96px",
    flex: "0 0 96px",
    borderRadius: "50%",
    background: "#eef2f6 center/cover no-repeat",
    border: "1px solid #d7e0e8",
  },
  button: {
    padding: "6px 16px",
    minHeight: "36px",
    border: "1px solid #BFD3D6",
    borderRadius: "6px",
    background: "transparent",
    color: "var(--brand, #016173)",
    font: "inherit",
    fontSize: "0.875rem",
    fontWeight: "500",
    cursor: "pointer",
  },
};

const el = (tag, style, html) => {
  const n = document.createElement(tag);
  if (style) Object.assign(n.style, style);
  if (html !== undefined) n.innerHTML = html;
  return n;
};

function buildCard() {
  const card = el("div", styles.card);
  card.id = CARD_ID;

  const photo = el("div", styles.photo);
  const side = el("div", { display: "flex", flexDirection: "column", gap: "0.5rem" });
  const title = el(
    "div",
    { fontSize: "0.95rem", fontWeight: "600", color: "var(--brand, #016173)" },
    "ຮູບຜູ້ໃຊ້ / Profile photo",
  );
  const hint = el(
    "div",
    { fontSize: "0.8rem", color: "#5b7385" },
    "JPEG, PNG ຫຼື WebP · ສູງສຸດ 3 MB / max 3 MB",
  );
  const status = el("div", { fontSize: "0.8rem", minHeight: "1.1em" });

  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/jpeg,image/png,image/webp";
  file.style.display = "none";

  const choose = el("button", styles.button, "ປ່ຽນຮູບ / Change photo");
  choose.type = "button";
  const remove = el("button", styles.button, "ລຶບຮູບ / Remove");
  remove.type = "button";

  const row = el("div", { display: "flex", gap: "0.5rem" });
  row.append(choose, remove);
  side.append(title, hint, row, status);
  card.append(photo, side, file);

  const setStatus = (text, ok) => {
    status.textContent = text || "";
    status.style.color = ok ? "#2e7d32" : "#c1272d";
  };

  const paint = () => {
    photo.style.backgroundImage = me && me.hasPhoto ? `url("${bust(me.url)}")` : "";
    remove.style.display = me && me.hasPhoto ? "" : "none";
  };

  choose.addEventListener("click", () => file.click());

  file.addEventListener("change", async () => {
    const f = file.files && file.files[0];
    file.value = ""; // so re-choosing the same file fires change again
    if (!f) return;

    // Checked here as a courtesy; the service validates properly by decoding.
    if (f.size > MAX_BYTES) {
      setStatus("ໄຟລ໌ໃຫຍ່ເກີນ 3 MB / file is larger than 3 MB", false);
      return;
    }

    setStatus("ກຳລັງອັບໂຫລດ… / uploading…", true);
    const body = new FormData();
    body.append("photo", f);
    try {
      const res = await fetch(`${API}/upload`, { method: "POST", credentials: "include", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error || `ອັບໂຫລດບໍ່ສຳເລັດ (${res.status})`, false);
        return;
      }
      me = { ...me, hasPhoto: true, url: data.url };
      paint();
      paintToolbar();
      setStatus("ບັນທຶກແລ້ວ / saved", true);
    } catch (e) {
      setStatus("ບໍ່ສາມາດຕິດຕໍ່ເຊີບເວີ / could not reach the service", false);
    }
  });

  remove.addEventListener("click", async () => {
    setStatus("ກຳລັງລຶບ… / removing…", true);
    try {
      const res = await fetch(`${API}/upload`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        setStatus(`ລຶບບໍ່ສຳເລັດ (${res.status})`, false);
        return;
      }
      me = { ...me, hasPhoto: false };
      paint();
      paintToolbar();
      setStatus("ລຶບແລ້ວ / removed", true);
    } catch (e) {
      setStatus("ບໍ່ສາມາດຕິດຕໍ່ເຊີບເວີ / could not reach the service", false);
    }
  });

  paint();
  return card;
}

function injectCard() {
  if (!window.location.pathname.endsWith(PROFILE_ROUTE)) {
    const stale = document.getElementById(CARD_ID);
    if (stale) stale.remove();
    return;
  }
  if (!me || document.getElementById(CARD_ID)) return;

  // Above the profile form rather than inside it: the form is fe-core's and
  // submits the user record, which has no photo field to carry.
  const host = document.querySelector("main");
  if (!host) return;
  host.insertBefore(buildCard(), host.firstChild);
}

export default function mountUserPhoto() {
  if (typeof document === "undefined") return;

  const tick = () => {
    if (!me) return;
    paintToolbar();
    injectCard();
  };

  whoAmI().then(() => {
    if (!me) return; // service absent, or nobody signed in: do nothing at all
    tick();
    const observer = new MutationObserver(tick);
    const start = () => observer.observe(document.body, { childList: true, subtree: true });
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start);
  });
}
