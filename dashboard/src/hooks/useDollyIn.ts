import { useEffect, type RefObject } from "react";

/**
 * Bring panels forward as they come into view — the camera moving over the
 * object rather than the object assembling itself.
 *
 * Each panel reveals once and is then forgotten. A reveal that replays every
 * time you scroll past stops reading as arrival and starts reading as a twitch.
 *
 * **Why a scroll listener rather than IntersectionObserver.** The observer only
 * reports when an element's intersection *changes*. Jump the scroll straight
 * past a panel — End, a restored position, a fast flick — and it goes from
 * below the viewport to above it without ever intersecting, so no callback
 * fires and the panel stays at opacity 0 permanently. That is a decorative
 * effect hiding real figures, which is not a trade worth making. A position
 * check on scroll has no such blind spot, and it unbinds itself as soon as
 * every panel is up, so it does not linger.
 *
 * Silent under reduced motion: everything is revealed immediately and nothing
 * is ever bound.
 */
export function useDollyIn(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const pending = new Set(root.querySelectorAll<HTMLElement>(".dolly"));
    if (!pending.size) return;

    function reveal(el: HTMLElement) {
      el.classList.add("is-in");
      pending.delete(el);
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pending.forEach(reveal);
      return;
    }

    let frame = 0;

    function unbind() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    function sweep() {
      frame = 0;
      // Anything at or above the fold line is revealed — including anything
      // already scrolled past, whose top is negative.
      const line = window.innerHeight * 0.92;
      for (const el of [...pending]) {
        if (el.getBoundingClientRect().top < line) reveal(el);
      }
      if (!pending.size) unbind();
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(sweep);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    sweep();

    return unbind;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
