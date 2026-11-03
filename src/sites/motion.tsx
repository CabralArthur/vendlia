"use client";
import { useEffect } from "react";

/**
 * Scroll effects for sites, run after hydration so the classes never clash with the server HTML.
 * Hooks available to templates and AI designs:
 *  - .rv / [data-reveal]  → gets "in" when it enters the viewport (root gets "anim" to enable hiding)
 *  - [data-parallax="0.15"] → translateY proportional to its distance from the viewport center
 *  - root gets "scrolled" after 40px (sticky header styling); template header .top too
 * Everything stays visible and static without JS or with prefers-reduced-motion.
 */
export function SiteMotion({ root: rootSel = ".vs" }: { root?: string } = {}) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(rootSel);
    if (!root) return;
    const header = root.querySelector(".top");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const par = reduce ? [] : [...root.querySelectorAll<HTMLElement>("[data-parallax]")];
    const speeds = par.map((el) => Math.max(-0.5, Math.min(0.5, Number(el.dataset.parallax) || 0.15)));
    par.forEach((el) => (el.style.willChange = "transform"));

    // Reveal by geometry on scroll (IntersectionObserver ignores elements hidden with clip-path).
    let pending = reduce ? [] : [...root.querySelectorAll<HTMLElement>(".rv, [data-reveal]")];
    const reveal = (vh: number) => {
      if (!pending.length) return;
      pending = pending.filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.88 && r.bottom > 0) {
          el.classList.add("in");
          return false;
        }
        return true;
      });
    };

    let ticking = false;
    const frame = () => {
      ticking = false;
      const y = window.scrollY;
      root.classList.toggle("scrolled", y > 40);
      header?.classList.toggle("scrolled", y > 16);
      const vh = window.innerHeight;
      reveal(vh);
      par.forEach((el, i) => {
        const host = el.parentElement ?? el;
        const r = host.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const offset = r.top + r.height / 2 - vh / 2;
        el.style.transform = `translate3d(0, ${(-offset * speeds[i]!).toFixed(1)}px, 0)`;
      });
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(frame);
      }
    };
    // Content already on screen is shown at once; the rest animates in while scrolling.
    if (!reduce) {
      reveal(window.innerHeight);
      root.classList.add("anim");
    }
    frame();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, [rootSel]);
  return null;
}
