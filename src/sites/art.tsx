import type { TemplateId } from "@/server/db/schema";

/** Niche illustrations used when the client has no cover photo. Drawn with currentColor + CSS vars. */
export function HeroArt({ template }: { template: TemplateId }) {
  switch (template) {
    case "barber":
      return (
        <svg viewBox="0 0 400 460" className="art" aria-hidden>
          <defs>
            <pattern id="pole" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <rect width="17" height="34" fill="var(--a)" />
            </pattern>
            <clipPath id="pole-clip"><rect x="308" y="38" width="40" height="384" rx="20" /></clipPath>
          </defs>
          <rect x="300" y="30" width="56" height="400" rx="28" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" />
          <g clipPath="url(#pole-clip)"><rect x="308" y="-30" width="40" height="460" fill="url(#pole)" className="pole" /></g>
          <g fill="none" stroke="var(--a)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="110" cy="330" r="34" />
            <circle cx="190" cy="350" r="34" />
            <path d="M132 304 230 90M168 324 70 110" />
          </g>
          <g fill="none" stroke="currentColor" strokeOpacity=".9" strokeWidth="2.5" strokeLinecap="round">
            <path d="M40 200h150c18 0 30 10 30 22s-12 22-30 22H40z" />
            <path d="M190 222h70" />
          </g>
          <circle cx="60" cy="70" r="5" fill="var(--a)" />
          <circle cx="250" cy="420" r="4" fill="currentColor" fillOpacity=".5" />
        </svg>
      );
    case "aesthetics":
      return (
        <svg viewBox="0 0 400 400" className="art" aria-hidden>
          <circle cx="200" cy="200" r="150" fill="var(--a)" fillOpacity=".14" />
          <circle cx="200" cy="200" r="110" fill="none" stroke="var(--a)" strokeOpacity=".5" />
          <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M200 320c0-80 0-150 0-210" />
            <path d="M200 260c-50-10-80-45-86-95 50 4 80 40 86 95z" fill="var(--a)" fillOpacity=".18" />
            <path d="M200 215c45-12 70-48 72-92-46 6-70 42-72 92z" fill="var(--a)" fillOpacity=".12" />
            <path d="M200 170c-28-14-40-40-38-70 28 10 40 36 38 70z" />
          </g>
          <circle cx="300" cy="110" r="6" fill="var(--a)" />
          <circle cx="96" cy="300" r="4" fill="currentColor" fillOpacity=".4" />
        </svg>
      );
    case "food":
      return (
        <svg viewBox="0 0 400 400" className="art" aria-hidden>
          <circle cx="200" cy="215" r="160" fill="var(--a2)" />
          <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round">
            <path className="steam" d="M160 110c-14-18 14-28 0-48M200 104c-14-18 14-28 0-48M240 110c-14-18 14-28 0-48" />
          </g>
          <path d="M80 190h240c0 80-54 130-120 130S80 270 80 190z" fill="var(--a)" />
          <path d="M80 190h240" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          <ellipse cx="200" cy="190" rx="120" ry="18" fill="#fff" fillOpacity=".55" />
          <circle cx="150" cy="184" r="10" fill="var(--a2)" />
          <circle cx="205" cy="180" r="8" fill="#5b8c3a" />
          <circle cx="245" cy="186" r="9" fill="var(--a2)" />
          <path d="M150 336h100" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        </svg>
      );
    case "auto":
      return (
        <svg viewBox="0 0 420 380" className="art" aria-hidden>
          <g fill="none" stroke="var(--a)" strokeWidth="3" strokeLinejoin="round">
            <g className="gear" style={{ transformOrigin: "260px 170px" }}>
              <circle cx="260" cy="170" r="70" />
              <circle cx="260" cy="170" r="26" />
              {Array.from({ length: 10 }).map((_, i) => {
                const a = (i / 10) * Math.PI * 2;
                const x1 = 260 + Math.cos(a) * 70, y1 = 170 + Math.sin(a) * 70;
                const x2 = 260 + Math.cos(a) * 92, y2 = 170 + Math.sin(a) * 92;
                return <path key={i} d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`} strokeWidth="14" strokeLinecap="square" />;
              })}
            </g>
          </g>
          <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M70 300 190 180" strokeWidth="16" />
            <path d="M178 150a40 40 0 1 0 52 52l-24-6-10-22z" fill="currentColor" fillOpacity=".08" />
            <circle cx="70" cy="300" r="10" />
          </g>
          <g stroke="currentColor" strokeOpacity=".25">
            <path d="M20 40h120M20 60h80M300 330h100M340 350h60" />
          </g>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 420 380" className="art" aria-hidden>
          <rect x="40" y="70" width="220" height="150" rx="22" fill="#fff" stroke="currentColor" strokeOpacity=".12" />
          <rect x="64" y="96" width="90" height="12" rx="6" fill="var(--a)" />
          <rect x="64" y="122" width="160" height="10" rx="5" fill="currentColor" fillOpacity=".12" />
          <rect x="64" y="142" width="130" height="10" rx="5" fill="currentColor" fillOpacity=".12" />
          <rect x="64" y="176" width="70" height="26" rx="13" fill="var(--a)" fillOpacity=".18" />
          <rect x="170" y="170" width="210" height="160" rx="22" fill="var(--a)" className="float" />
          <path d="M210 250l26 26 58-58" fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="360" cy="80" r="26" fill="var(--a)" fillOpacity=".2" />
          <circle cx="60" cy="300" r="14" fill="var(--a)" fillOpacity=".35" />
        </svg>
      );
  }
}
