"use client";
import { useEffect } from "react";

/**
 * Reveal-on-scroll + sticky header state. Runs after hydration (as an effect) so the
 * classes it adds never clash with the server HTML. Content stays visible without JS
 * and when the visitor prefers reduced motion.
 */
export function SiteMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".vs");
    if (!root) return;
    const header = root.querySelector(".top");
    const onScroll = () => header?.classList.toggle("scrolled", window.scrollY > 16);
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let io: IntersectionObserver | undefined;
    if (!reduce && "IntersectionObserver" in window) {
      const vh = window.innerHeight;
      const els = [...root.querySelectorAll<HTMLElement>(".rv")];
      // What is already on screen stays put; only content below the fold animates in.
      els.forEach((e) => e.getBoundingClientRect().top < vh && e.classList.add("in"));
      root.classList.add("anim");
      io = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io?.unobserve(e.target))),
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
      );
      els.forEach((e) => !e.classList.contains("in") && io!.observe(e));
    }
    return () => {
      removeEventListener("scroll", onScroll);
      io?.disconnect();
    };
  }, []);
  return null;
}
