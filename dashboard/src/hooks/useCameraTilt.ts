import { useEffect, useRef } from "react";

/**
 * Point a camera at a panel.
 *
 * The Progress tab is laid out in 3D — panels sit at different `translateZ`
 * depths inside one `perspective`. This hook supplies the camera: it rotates
 * the whole deck a few degrees toward the pointer, and because the panels are
 * at different depths, the near ones sweep further than the far ones. That
 * parallax is what reads as a physical object rather than a picture of one.
 *
 * Three things it deliberately refuses to do:
 *
 * - **It does not attach under reduced motion.** The global block in index.css
 *   zeroes transition and animation durations, but this writes transforms
 *   directly — CSS would never see them. Checked here, not there.
 * - **It does not attach without a fine pointer.** There is no cursor to
 *   follow on a touch screen, and a tilt that only responds to taps is noise.
 * - **It flattens while you type.** A rotated text field is measurably worse
 *   to use, so focus inside the scene returns the camera to zero and holds it
 *   there until focus leaves.
 */

/**
 * The panels that behave as raised plates: they carry the key-light highlight
 * and sit above the base. Kept here so the hook and the stylesheet agree on
 * exactly one definition of "a card".
 */
export const LIFT_SELECTOR = ".stat-tile, .line-card, .tier-card, .aa-card";

/** Maximum rotation, in degrees. Past about 6° the type visibly shears. */
const MAX_TILT = 4;

/** Per-frame approach rate. Lower is heavier; 0.12 settles in ~150ms. */
const DAMPING = 0.12;

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

export function useCameraTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const scene = ref.current;
    if (!scene) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)");
    if (reduced.matches || !fine.matches) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;
    let lit: HTMLElement | null = null;

    /** Runs only while the camera is still settling, then stops itself. */
    function tick() {
      frame = 0;
      const el = ref.current;
      if (!el) return;

      currentX += (targetX - currentX) * DAMPING;
      currentY += (targetY - currentY) * DAMPING;

      el.style.setProperty("--cam-x", `${currentX.toFixed(3)}deg`);
      el.style.setProperty("--cam-y", `${currentY.toFixed(3)}deg`);

      if (Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
        frame = requestAnimationFrame(tick);
      }
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    function onMove(e: PointerEvent) {
      const el = ref.current;
      if (!el) return;

      // Typing wins over the camera, every time.
      if (isTypingTarget(document.activeElement)) {
        targetX = 0;
        targetY = 0;
        schedule();
        return;
      }

      const box = el.getBoundingClientRect();
      // −1 at one edge, +1 at the other.
      const nx = ((e.clientX - box.left) / box.width) * 2 - 1;
      const ny = ((e.clientY - box.top) / box.height) * 2 - 1;

      // Pushing the pointer down tips the top away, which is what a real panel
      // on a desk does — hence the negation on X.
      targetX = -ny * MAX_TILT;
      targetY = nx * MAX_TILT;
      schedule();

      // The key light is a single source travelling over the panel, so only
      // the panel under the pointer carries a highlight. One element written
      // per frame rather than all of them.
      const card = (e.target as Element | null)?.closest?.(LIFT_SELECTOR) as HTMLElement | null;
      if (card !== lit) {
        lit?.style.removeProperty("--gx");
        lit?.style.removeProperty("--gy");
        lit?.classList.remove("is-lit");
        lit = card;
        card?.classList.add("is-lit");
      }
      if (card) {
        const cb = card.getBoundingClientRect();
        card.style.setProperty("--gx", `${((e.clientX - cb.left) / cb.width) * 100}%`);
        card.style.setProperty("--gy", `${((e.clientY - cb.top) / cb.height) * 100}%`);
      }
    }

    function rest() {
      targetX = 0;
      targetY = 0;
      lit?.classList.remove("is-lit");
      lit?.style.removeProperty("--gx");
      lit?.style.removeProperty("--gy");
      lit = null;
      schedule();
    }

    scene.addEventListener("pointermove", onMove);
    scene.addEventListener("pointerleave", rest);
    // Focus can arrive by keyboard without the pointer ever moving.
    scene.addEventListener("focusin", rest);

    return () => {
      scene.removeEventListener("pointermove", onMove);
      scene.removeEventListener("pointerleave", rest);
      scene.removeEventListener("focusin", rest);
      if (frame) cancelAnimationFrame(frame);
      scene.style.removeProperty("--cam-x");
      scene.style.removeProperty("--cam-y");
      lit?.classList.remove("is-lit");
    };
  }, []);

  return ref;
}
