/*
 * Ripples that follow the pointer across the sign-in screen's dark half.
 *
 * WHERE IT RUNS, AND WHERE IT DELIBERATELY DOES NOT
 *
 * Only on the sign-in page -- tested by the absence of a header, the same test
 * index.css and sidebarMobile.js use to tell the two apart. Only above the
 * breakpoint, because below it the white panel is the whole page and there is
 * no dark area to ripple. Only where a real pointer exists, so a phone or a
 * tablet never runs the loop. And never when the viewer has asked for reduced
 * motion, which for movement behind a sign-in form is exactly what that setting
 * is for.
 *
 * Any of those failing means the layer is not created at all, rather than
 * created and hidden -- an element that exists costs a paint even when it is
 * invisible, and this page is loaded on whatever hardware a district office has.
 *
 * WHY TRANSFORM AND NOT A MOVING GRADIENT
 *
 * The obvious implementation is a full-screen repeating-radial-gradient whose
 * centre follows the cursor. It also repaints the entire layer on every frame,
 * because moving a gradient's centre changes every pixel of it.
 *
 * The rings here are painted ONCE into a fixed-size square, and the square is
 * moved with translate3d. That is a composited transform: no repaint, no layout,
 * and the work per frame is a matrix the compositor was going to apply anyway.
 *
 * WHY IT LAGS
 *
 * The centre eases toward the pointer at 12% of the remaining distance per
 * frame rather than snapping to it. Snapping reads as a cursor accessory --
 * something stuck to the mouse. Easing reads as water, and it is the difference
 * between an effect that looks considered and one that looks like a toy on a
 * page where people type their password.
 *
 * The loop stops when the centre has caught up and nothing is fading, so an
 * idle page costs nothing.
 */

const LAYER_ID = "lao-signin-waves";
const BREAKPOINT = "(min-width: 60.0625rem)";
const FINE_POINTER = "(pointer: fine)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/* Fraction of the remaining distance covered each frame. */
const EASE = 0.12;
/* Below this, the centre has arrived and the loop can stop. */
const SETTLED = 0.4;
const FADE = 0.06;

const isSignInPage = () => !document.querySelector("header");
const container = () =>
  document.querySelector(".App > div > [class*='MuiPaper']")?.parentElement ?? null;

export default function mountSignInWaves() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const wide = window.matchMedia(BREAKPOINT);
  const fine = window.matchMedia(FINE_POINTER);
  const still = window.matchMedia(REDUCED_MOTION);

  let layer = null;
  let frame = 0;
  // Current drawn position, target position, and opacity.
  let x = 0;
  let y = 0;
  let tx = 0;
  let ty = 0;
  let alpha = 0;
  let targetAlpha = 0;

  const allowed = () =>
    isSignInPage() && wide.matches && fine.matches && !still.matches;

  const draw = () => {
    frame = 0;
    x += (tx - x) * EASE;
    y += (ty - y) * EASE;
    alpha += (targetAlpha - alpha) * FADE;

    if (layer) {
      layer.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
      layer.style.opacity = alpha.toFixed(3);
    }

    const moving = Math.abs(tx - x) > SETTLED || Math.abs(ty - y) > SETTLED;
    const fading = Math.abs(targetAlpha - alpha) > 0.004;
    if (moving || fading) schedule();
  };

  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(draw);
  };

  const onMove = (event) => {
    if (!layer) return;
    tx = event.clientX;
    ty = event.clientY;
    targetAlpha = 1;
    schedule();
  };

  const onLeave = () => {
    targetAlpha = 0;
    schedule();
  };

  const create = () => {
    if (layer || !allowed()) return;
    const host = container();
    if (!host) return;

    layer = document.createElement("div");
    layer.id = LAYER_ID;
    layer.setAttribute("aria-hidden", "true");
    // First child, so it paints beneath the sign-in panel: the panel is opaque
    // and a later sibling, so the rings simply do not exist under the form.
    host.insertBefore(layer, host.firstChild);

    // Start centred in the dark area rather than at 0,0, so the first movement
    // is a drift from somewhere sensible instead of a sweep from the corner.
    x = tx = window.innerWidth * 0.7;
    y = ty = window.innerHeight * 0.5;
    alpha = targetAlpha = 0;

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    schedule();
  };

  const destroy = () => {
    if (!layer) return;
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("blur", onLeave);
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    layer.remove();
    layer = null;
  };

  const apply = () => (allowed() ? create() : destroy());

  /*
   * The sign-in panel is rendered by React after this module loads, and the
   * header appears on the way out, so this cannot run once. The observer is
   * cheap: apply() is two media queries and a lookup when nothing has changed.
   */
  const observer = new MutationObserver(apply);
  const start = () => {
    apply();
    observer.observe(document.body, { childList: true, subtree: true });
  };

  [wide, fine, still].forEach((q) => q.addEventListener?.("change", apply));
  window.addEventListener("resize", apply);

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
}
