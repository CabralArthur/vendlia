import type { SiteContent, TemplateId } from "@/server/db/schema";
import { THEMES, type Theme } from "./themes";
import { SiteMotion } from "./motion";
import { formatBrPhone } from "@/lib/phone";
import { fillPlaceholders } from "@/server/ai/sitedesign";
import { fontHrefs } from "./font-pairings";

type Props = { content: SiteContent; template: TemplateId; accent: string; demo: boolean; demoNote?: string };

function waLink(n: string | undefined, text: string) {
  if (!n) return undefined;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function inkOn(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}
const isDark = (hex: string) => inkOn(hex) === "#ffffff";

export function jsonLd(c: SiteContent) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: c.businessName,
    description: c.seo.description,
    telephone: c.contact.phone ? `+${c.contact.phone}` : undefined,
    email: c.contact.email,
    address: c.contact.address
      ? { "@type": "PostalAddress", streetAddress: c.contact.address, addressLocality: c.contact.city, addressRegion: c.contact.state, addressCountry: "BR" }
      : undefined,
    geo: c.contact.lat && c.contact.lng ? { "@type": "GeoCoordinates", latitude: c.contact.lat, longitude: c.contact.lng } : undefined,
    sameAs: c.contact.instagram ? [`https://instagram.com/${c.contact.instagram}`] : undefined,
  };
}

/** "Mo-Fr 11:00-15:00; Sa 11:00-16:00" (OpenStreetMap) → "Seg a Sex 11h–15h · Sáb 11h–16h". Human text passes through. */
export function humanHours(raw: string) {
  const days: Record<string, string> = { Mo: "Seg", Tu: "Ter", We: "Qua", Th: "Qui", Fr: "Sex", Sa: "Sáb", Su: "Dom", PH: "Feriados" };
  if (!/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b|\d{2}:\d{2}/.test(raw)) return raw;
  return raw
    .split(/\s*;\s*/)
    .map((part) =>
      part
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => days[d]!)
        .replace(/([A-Za-zá]{3})-([A-Za-zá]{3})/g, "$1 a $2")
        .replace(/(\d{2}):(\d{2})/g, (_, h: string, m: string) => `${Number(h)}h${m === "00" ? "" : m}`)
        .replace(/(\dh\d*)-(\d)/g, "$1–$2")
        .replace(/\boff\b/i, "fechado"),
    )
    .join(" · ");
}

const GENERIC = /^(barbearia|sal[aã]o|restaurante|bar|lanchonete|oficina|auto|studio|est[uú]dio|cl[ií]nica|espa[cç]o|casa|pizzaria|padaria|a|o|os|as|da|do|de)$/i;
function monogram(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  const w = words.find((x) => !GENERIC.test(x)) ?? words[0] ?? "?";
  return w.slice(0, 1).toUpperCase();
}

// Auto-generated items that only repeat the contact info: the layout already shows those facts.
const AUTO_FAQ = new Set(["Onde fica?", "Qual o horário de atendimento?", "Como entro em contato?"]);
const AUTO_HL = new Set(["Atendimento pelo WhatsApp", "Fácil de encontrar", "Horário de funcionamento", "Acompanhe no Instagram"]);

function css(t: Theme, a: string) {
  const [r, g, b] = hexToRgb(a);
  const up = t.uppercaseHeadings;
  const darkHero = isDark(t.heroBg);
  const pill = t.radius === "999px";
  return `
.vs{--bg:${t.bg};--fg:${t.fg};--mu:${t.muted};--sf:${t.surface};--ln:${t.line};--hb:${t.heroBg};--hf:${t.heroFg};--a:${a};--ai:${inkOn(a)};--a-rgb:${r},${g},${b};--r:${pill ? "18px" : t.radius};--d:${t.display};--b:${t.body};
  background:var(--bg);color:var(--fg);font-family:var(--b);font-size:17px;line-height:1.6;min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:clip;text-rendering:optimizeLegibility}
.vs *{box-sizing:border-box}
.vs a{color:inherit;text-decoration:none}
.vs img{max-width:100%;display:block}
.vs h1,.vs h2,.vs h3{font-family:var(--d);margin:0;font-weight:${t.displayWeight};line-height:1.02;letter-spacing:${up ? ".005em" : "-.025em"};text-transform:${up ? "uppercase" : "none"};text-wrap:balance}
.vs p{text-wrap:pretty}
.vs .wrap{width:min(1180px,100% - 40px);margin-inline:auto}
.vs .demo{position:relative;z-index:60;background:#14171a;color:#d7dbe0;font:500 12.5px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center}
.vs .demo b{color:#fff;font-weight:600}
.vs .kicker{font-size:12.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--mu);margin:0 0 18px}
.vs .kicker i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--a);margin-right:10px;vertical-align:1px}

/* Header */
.vs .top{position:sticky;top:0;z-index:50;color:var(--hf);transition:background .35s,box-shadow .35s,color .35s}
.vs .top.scrolled{background:color-mix(in srgb,var(--bg) 88%,transparent);color:var(--fg);backdrop-filter:saturate(1.5) blur(16px);-webkit-backdrop-filter:saturate(1.5) blur(16px);box-shadow:0 1px 0 var(--ln)}
.vs .top .wrap{display:flex;align-items:center;gap:28px;height:76px}
.vs .brand{font-family:var(--d);font-size:${up ? "21px" : "22px"};font-weight:${t.displayWeight};letter-spacing:${up ? ".04em" : "-.02em"};text-transform:${up ? "uppercase" : "none"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-right:auto;min-width:0}
.vs .nav{display:none;gap:30px;font-size:14.5px;font-weight:500}
.vs .nav a{opacity:.72;transition:opacity .2s}
.vs .nav a:hover{opacity:1}
@media(min-width:880px){.vs .nav{display:flex}}

/* Buttons */
.vs .btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;background:var(--a);color:var(--ai);font-weight:600;font-size:15.5px;padding:15px 24px;border-radius:${pill ? "999px" : "var(--r)"};transition:transform .25s cubic-bezier(.2,.8,.2,1),background .25s,box-shadow .25s;${up ? "text-transform:uppercase;letter-spacing:.07em;font-size:14px;" : ""}white-space:nowrap}
.vs .btn:hover{transform:translateY(-1px);box-shadow:0 10px 24px -14px rgba(var(--a-rgb),.9)}
.vs .btn.sm{padding:10px 18px;font-size:14px;${up ? "font-size:12.5px;" : ""}}
.vs .btn.line{background:transparent;color:inherit;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,currentColor 35%,transparent)}
.vs .btn.line:hover{box-shadow:inset 0 0 0 1.5px currentColor}
.vs .btn svg{width:19px;height:19px;flex:none}

/* Hero */
.vs .hero{position:relative;background:var(--hb);color:var(--hf);margin-top:-76px;padding-top:76px;isolation:isolate;overflow:hidden}
.vs .hero::before{content:"";position:absolute;inset:0;z-index:-1;opacity:${darkHero ? ".07" : ".045"};background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.vs .hero > .wrap{display:grid;gap:56px;align-items:center;padding:clamp(56px,9vw,120px) 0 clamp(48px,7vw,88px)}
.vs .hero .eyebrow{font-size:13px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;opacity:.75;margin:0 0 26px}
.vs .hero h1{font-size:clamp(46px,${up ? "8.4vw" : "7.2vw"},${up ? "128px" : "108px"});${up ? "line-height:.95;" : ""}}
.vs .hero .lead{font-size:clamp(17.5px,1.55vw,21px);line-height:1.55;opacity:.82;max-width:34em;margin:28px 0 38px}
.vs .ctas{display:flex;flex-wrap:wrap;gap:12px}
.vs .seal{width:min(360px,52vw);height:auto;justify-self:center;color:var(--hf)}
.vs .seal .ring{transform-origin:100px 100px;animation:vs-turn 60s linear infinite}
@keyframes vs-turn{to{transform:rotate(360deg)}}
@media(max-width:699px){.vs .seal{display:none}}
@media(min-width:920px){.vs .hero > .wrap{grid-template-columns:1.35fr .65fr}.vs .seal{justify-self:end}}
.vs .facts{position:relative;border-top:1px solid color-mix(in srgb,var(--hf) 16%,transparent)}
.vs .facts .wrap{display:grid;gap:0;padding:0}
.vs .facts .f{padding:22px 0;border-bottom:1px solid color-mix(in srgb,var(--hf) 12%,transparent)}
.vs .facts .f:last-child{border-bottom:0}
.vs .facts b{display:block;font-size:11.5px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;opacity:.6;margin-bottom:6px}
.vs .facts span,.vs .facts a{font-size:15.5px;line-height:1.45}
.vs .facts a:hover{text-decoration:underline;text-underline-offset:3px}
@media(min-width:760px){.vs .facts .wrap{grid-template-columns:repeat(var(--n),1fr)}.vs .facts .f{border-bottom:0;padding:26px 28px 30px 0}.vs .facts .f + .f{padding-left:28px;border-left:1px solid color-mix(in srgb,var(--hf) 12%,transparent)}}
/* Hero load-in (CSS only, runs once) */
.vs .in1,.vs .in2,.vs .in3,.vs .in4{animation:vs-up .9s cubic-bezier(.2,.8,.2,1) both}
.vs .in2{animation-delay:.08s}.vs .in3{animation-delay:.16s}.vs .in4{animation-delay:.26s}
@keyframes vs-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}

/* Cover photo hero */
.vs.has-cover .hero{--hf:#fff;color:#fff;min-height:min(92vh,860px);display:flex;flex-direction:column;justify-content:flex-end}
.vs.has-cover .hero::before{display:none}
.vs.has-cover .hero .bgimg{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover;animation:vs-zoom 14s ease-out both}
.vs.has-cover .hero::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,.1) 35%,rgba(0,0,0,.72) 100%)}
.vs.has-cover .hero > .wrap{grid-template-columns:1fr;padding-top:180px}
.vs.has-cover .top:not(.scrolled){color:#fff}
@keyframes vs-zoom{from{transform:scale(1.08)}to{transform:none}}

/* Sections */
.vs section.blk{padding:clamp(80px,11vw,140px) 0}
.vs h2{font-size:clamp(34px,4.4vw,58px)}
.vs .split{display:grid;gap:36px}
@media(min-width:920px){.vs .split{grid-template-columns:5fr 7fr;gap:64px}}
.vs .about p.big{font-size:clamp(19px,1.9vw,23px);line-height:1.6;margin:0}
.vs .notes{list-style:none;margin:36px 0 0;padding:0;display:grid;gap:0;border-top:1px solid var(--ln)}
.vs .notes li{display:grid;grid-template-columns:minmax(0,14em) 1fr;gap:20px;padding:16px 0;border-bottom:1px solid var(--ln);font-size:15.5px}
.vs .notes li b{font-weight:600}
.vs .notes li span{color:var(--mu)}
@media(max-width:560px){.vs .notes li{grid-template-columns:1fr;gap:2px}}
.vs .ig{display:inline-flex;align-items:center;gap:8px;margin-top:28px;font-weight:600;border-bottom:1.5px solid var(--a);padding-bottom:2px}

/* Services list */
.vs .svc-head{display:grid;gap:14px;margin-bottom:44px}
@media(min-width:920px){.vs .svc-head{grid-template-columns:1fr 1fr;align-items:end}.vs .svc-head p{justify-self:end;text-align:right}}
.vs .svc-head p{margin:0;color:var(--mu);max-width:30em}
.vs .rows{list-style:none;margin:0;padding:0;border-top:1px solid var(--ln)}
.vs .rows li{border-bottom:1px solid var(--ln)}
.vs .rows a{display:grid;grid-template-columns:1fr auto;gap:6px 28px;align-items:center;padding:clamp(22px,2.6vw,32px) 4px;transition:background .3s,padding .3s}
.vs .rows h3{font-size:clamp(26px,3vw,40px)}
.vs .rows p{grid-column:1;margin:0;color:var(--mu);max-width:44em}
.vs .rows .go{grid-row:1 / span 2;grid-column:2;display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:var(--a);opacity:.0;transform:translateX(-8px);transition:opacity .3s,transform .3s;${up ? "text-transform:uppercase;letter-spacing:.08em;font-size:12.5px;" : ""}}
.vs .rows a:hover{background:color-mix(in srgb,var(--a) 6%,transparent);padding-left:18px;padding-right:18px}
.vs .rows a:hover .go{opacity:1;transform:none}
@media(hover:none){.vs .rows .go{opacity:1;transform:none}}
.vs .grid{display:grid;gap:16px}
@media(min-width:720px){.vs .grid{grid-template-columns:repeat(var(--c),1fr)}}
.vs .tile{display:flex;flex-direction:column;gap:10px;min-height:220px;padding:32px;background:var(--bg);border:1px solid var(--ln);border-radius:var(--r);transition:transform .35s cubic-bezier(.2,.8,.2,1),border-color .35s,box-shadow .35s}
.vs .tile h3{font-size:clamp(25px,2.4vw,32px)}
.vs .tile p{margin:0;color:var(--mu)}
.vs .tile .go{margin-top:auto;padding-top:18px;font-size:14px;font-weight:600;color:var(--a);display:inline-flex;align-items:center;gap:8px}
.vs .tile:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--a) 50%,transparent);box-shadow:0 24px 50px -32px rgba(var(--a-rgb),.55)}
.vs .go svg{width:16px;height:16px;transition:transform .3s}
.vs a:hover .go svg{transform:translateX(3px)}

/* Gallery */
.vs .gal{display:grid;gap:12px;grid-template-columns:repeat(2,1fr)}
.vs .gal img{width:100%;height:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--r)}
@media(min-width:900px){.vs .gal{grid-template-columns:repeat(4,1fr)}.vs .gal img:nth-child(4n+1){aspect-ratio:auto;grid-row:span 2}}

/* CTA band */
.vs .band{background:var(--a);color:var(--ai);padding:clamp(64px,9vw,112px) 0}
.vs .band .wrap{display:grid;gap:28px;align-items:end}
@media(min-width:900px){.vs .band .wrap{grid-template-columns:1fr auto}}
.vs .band h2{font-size:clamp(38px,5.4vw,76px);max-width:14em}
.vs .band p{margin:14px 0 0;font-size:18px;opacity:.82}
.vs .band .btn{background:var(--ai);color:var(--a)}

/* Visit */
.vs .visit{display:grid;gap:40px}
@media(min-width:920px){.vs .visit{grid-template-columns:5fr 7fr;gap:56px;align-items:stretch}}
.vs .kv{list-style:none;margin:32px 0 0;padding:0;border-top:1px solid var(--ln)}
.vs .kv li{padding:18px 0;border-bottom:1px solid var(--ln);display:grid;grid-template-columns:7.5em 1fr;gap:16px;font-size:16px}
.vs .kv b{font-size:11.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--mu);padding-top:3px}
.vs .kv a:hover{color:var(--a)}
.vs .map{width:100%;min-height:380px;height:100%;border:0;border-radius:var(--r);background:var(--sf);filter:${isDark(t.bg) ? "invert(.92) hue-rotate(180deg) saturate(.5) brightness(.95)" : "grayscale(.35) contrast(1.02)"}}

/* FAQ */
.vs details{border-bottom:1px solid var(--ln);padding:24px 0}
.vs summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px;font-family:var(--d);font-size:clamp(20px,2.2vw,26px);font-weight:${t.displayWeight};text-transform:${up ? "uppercase" : "none"}}
.vs summary::-webkit-details-marker{display:none}
.vs summary::after{content:"+";color:var(--a);transition:transform .3s}
.vs details[open] summary::after{transform:rotate(45deg)}
.vs details p{color:var(--mu);margin:12px 0 0;max-width:46em}

/* Footer */
.vs footer{padding:72px 0 40px;border-top:1px solid var(--ln)}
.vs footer .mark{font-family:var(--d);font-weight:${t.displayWeight};font-size:clamp(40px,8vw,112px);line-height:.95;letter-spacing:${up ? ".01em" : "-.035em"};text-transform:${up ? "uppercase" : "none"};text-wrap:balance}
.vs footer .meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-top:40px;font-size:14px;color:var(--mu)}

/* WhatsApp: floating on desktop, bottom bar on phones */
.vs .fab{position:fixed;right:22px;bottom:22px;z-index:55;width:56px;height:56px;border-radius:50%;background:#25D366;color:#fff;display:none;place-items:center;box-shadow:0 10px 28px rgba(0,0,0,.25);transition:transform .25s}
.vs .fab:hover{transform:scale(1.06)}
.vs .fab svg{width:28px;height:28px}
.vs .bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:55;display:flex;align-items:center;justify-content:center;gap:10px;background:#25D366;color:#fff;font-weight:600;padding:15px;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.25)}
.vs .bar svg{width:20px;height:20px}
@media(min-width:760px){.vs .fab{display:grid}.vs .bar{display:none}}
@media(max-width:759px){.vs footer{padding-bottom:110px}}

/* Reveal on scroll (enabled by SiteMotion after hydration) */
.vs.anim .rv{opacity:0;transform:translateY(22px);transition:opacity .8s cubic-bezier(.2,.8,.2,1),transform .8s cubic-bezier(.2,.8,.2,1)}
.vs.anim .rv.in{opacity:1;transform:none}
.vs.anim .rv.d1{transition-delay:.07s}.vs.anim .rv.d2{transition-delay:.14s}.vs.anim .rv.d3{transition-delay:.21s}.vs.anim .rv.d4{transition-delay:.28s}

/* Layout: centered (estética) */
${
  t.layout === "center"
    ? `.vs .hero > .wrap{grid-template-columns:1fr !important;justify-items:center;text-align:center}
.vs .hero .lead{margin-inline:auto}.vs .hero .ctas{justify-content:center}
.vs .hero h1{font-style:italic;font-size:clamp(50px,8vw,116px)}
.vs .seal{order:-1;width:min(150px,40vw);justify-self:center !important;margin-bottom:-12px}
.vs .facts .wrap{text-align:center}`
    : ""
}
@media (prefers-reduced-motion: reduce){.vs *{animation:none!important;transition:none!important}}
`;
}

const WA_ICON = (
  <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden>
    <path d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.2.6 4.4 1.7 6.3L3 29l7.3-1.9c1.8 1 3.8 1.5 5.8 1.5h0c7 0 12.7-5.7 12.7-12.6C28.7 8.6 23 3 16 3zm0 23.2c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.3 1.1 1.2-4.2-.3-.4a10.4 10.4 0 0 1-1.6-5.5C5.3 9.8 10.1 5 16 5s10.6 4.8 10.6 10.6S21.9 26.2 16 26.2zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z" />
  </svg>
);
const ARROW = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 10h12M11 5l5 5-5 5" />
  </svg>
);
const PIN = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 18s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" /><circle cx="10" cy="8" r="2.2" />
  </svg>
);

/** A circular brand seal (name around the edge, monogram in the middle): reads as identity, not clip-art. */
function Seal({ name, place, accent, ink }: { name: string; place: string; accent: string; ink: string }) {
  const ring = `${name} · ${place || "Desde sempre no bairro"} · `.toUpperCase();
  const fs = Math.max(9, Math.min(15, 470 / (ring.length * 0.66)));
  return (
    <svg className="seal" viewBox="0 0 200 200" role="img" aria-label={name}>
      <defs>
        <path id="vs-ring" d="M100,100 m-77,0 a77,77 0 1,1 154,0 a77,77 0 1,1 -154,0" />
      </defs>
      <circle cx="100" cy="100" r="98" fill={accent} />
      <circle cx="100" cy="100" r="62" fill="none" stroke={ink} strokeOpacity=".35" strokeWidth=".8" />
      <g className="ring">
        <text fill={ink} fontSize={fs} fontWeight="600" letterSpacing="1" style={{ fontFamily: "var(--b)" }}>
          <textPath href="#vs-ring" textLength="482" lengthAdjust="spacing">{ring}</textPath>
        </text>
      </g>
      <text x="100" y="104" textAnchor="middle" dominantBaseline="middle" fill={ink} fontSize="76" style={{ fontFamily: "var(--d)", fontWeight: 600 }}>
        {monogram(name)}
      </text>
    </svg>
  );
}

/** Map embed + "open in maps" link for a site's contact info. */
export function mapUrls(c: SiteContent) {
  const place = [c.contact.city, c.contact.state].filter(Boolean).join(" - ");
  const fullAddress = c.contact.address ? `${c.contact.address}${place && !c.contact.address.includes(c.contact.city ?? "§") ? `, ${place}` : ""}` : undefined;
  const hasGeo = !!(c.contact.lat && c.contact.lng);
  const embed = hasGeo
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${c.contact.lng! - 0.005},${c.contact.lat! - 0.0035},${c.contact.lng! + 0.005},${c.contact.lat! + 0.0035}&layer=mapnik&marker=${c.contact.lat},${c.contact.lng}`
    : fullAddress
      ? `https://maps.google.com/maps?q=${encodeURIComponent(fullAddress)}&output=embed`
      : undefined;
  const link = fullAddress || hasGeo
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hasGeo && !fullAddress ? `${c.contact.lat},${c.contact.lng}` : `${c.businessName} ${fullAddress}`)}`
    : undefined;
  return { embed, link, fullAddress, place };
}

/** The chosen logo SVG when the operator turned it on, else null. */
export function activeLogo(c: SiteContent) {
  const l = c.logo;
  if (!l?.use || l.selected === null || l.selected === undefined) return null;
  return l.options[l.selected]?.svg ?? null;
}

const LOGO_CSS = `.vd-logo{text-transform:none;letter-spacing:normal;display:inline-flex;align-items:center;line-height:0}.vd-logo svg{height:clamp(30px,3.2vw,44px);width:auto;max-width:min(260px,52vw);display:block;overflow:visible}.vd-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}`;

/** Renders the AI design when there is one, otherwise the niche template. */
export function Site(props: Props) {
  return props.content.ai ? <AiSiteRender content={props.content} demo={props.demo} demoNote={props.demoNote} /> : <SiteRender {...props} />;
}

export function AiSiteRender({ content: c, demo, demoNote }: { content: SiteContent; demo: boolean; demoNote?: string }) {
  const ai = c.ai!;
  const m = mapUrls(c);
  const html = fillPlaceholders(ai.html, {
    whatsapp: c.contact.whatsapp,
    phone: c.contact.phone,
    email: c.contact.email,
    instagram: c.contact.instagram,
    mapsUrl: m.link,
    mapEmbed: m.embed,
    name: c.businessName,
    images: ai.images,
    fallbackColor: ai.palette?.[1],
  });
  const logo = activeLogo(c);
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const withLogo = logo
    ? html.replace(/(<(\w+)\b[^>]*\sdata-brand\b[^>]*>)([\s\S]*?)(<\/\2>)/g, (_m, open: string, _t: string, _inner: string, close: string) => `${open}<span class="vd-logo" aria-hidden="true">${logo}</span><span class="vd-sr">${esc(c.businessName)}</span>${close}`)
    : html;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="preconnect" href="https://api.fontshare.com" />
      <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
      {fontHrefs([...ai.fonts, ...(logo ? c.logo!.fonts : [])]).map((href) => <link key={href} rel="stylesheet" href={href} />)}
      <style dangerouslySetInnerHTML={{ __html: `html,body{margin:0;padding:0}.vai{min-height:100vh;overflow-x:clip}.vai *,.vai *::before,.vai *::after{box-sizing:border-box}.vai img{max-width:100%}#vd-demo{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147483000;background:rgba(20,23,26,.82)!important;color:#d7dbe0!important;font:500 11.5px/1.3 system-ui,sans-serif!important;padding:6px 12px!important;margin:0!important;border-radius:999px;backdrop-filter:blur(8px);white-space:nowrap;pointer-events:none;max-width:calc(100vw - 24px);overflow:hidden;text-overflow:ellipsis}#vd-demo b{color:#fff;font-weight:600}@media(max-width:560px){#vd-demo{top:auto;bottom:84px}}${LOGO_CSS}` }} />
      {demo && (
        <p id="vd-demo" role="note"><b>Prévia de demonstração</b> · não é o site oficial{demoNote ? ` · ${demoNote}` : ""}</p>
      )}
      <div className="vai" dangerouslySetInnerHTML={{ __html: withLogo }} />
      {ai.photoCredits?.length ? (
        <p style={{ margin: 0, padding: "10px 16px", textAlign: "center", font: "400 11px/1.4 system-ui,sans-serif", color: "#8a8f98", background: "#111316" }}>
          Fotos: {ai.photoCredits.slice(0, 4).join(", ")} · Google Maps
        </p>
      ) : null}
      <SiteMotion root=".vai" />
    </>
  );
}

export function SiteRender({ content: c, template, accent, demo, demoNote }: Props) {
  const t = THEMES[template] ?? THEMES.services;
  const a = /^#[0-9a-f]{6}$/i.test(accent) ? accent : t.accent;
  const tplLogo = activeLogo(c);
  const sec = { ...t.defaults, ...(c.sections ?? {}) };
  const hello = "Olá! Vi o site de vocês e gostaria de mais informações.";
  const wa = waLink(c.contact.whatsapp, hello);
  const place = [c.contact.city, c.contact.state].filter(Boolean).join(" - ");
  const fullAddress = c.contact.address ? `${c.contact.address}${place && !c.contact.address.includes(c.contact.city ?? "§") ? `, ${place}` : ""}` : undefined;
  const mapSrc =
    c.contact.lat && c.contact.lng
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${c.contact.lng - 0.005},${c.contact.lat - 0.0035},${c.contact.lng + 0.005},${c.contact.lat + 0.0035}&layer=mapnik&marker=${c.contact.lat},${c.contact.lng}`
      : fullAddress
        ? `https://maps.google.com/maps?q=${encodeURIComponent(fullAddress)}&output=embed`
        : undefined;
  const mapsLink = fullAddress || (c.contact.lat && c.contact.lng)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.contact.lat && c.contact.lng && !fullAddress ? `${c.contact.lat},${c.contact.lng}` : `${c.businessName} ${fullAddress}`)}`
    : undefined;
  const hours = c.contact.openingHours ? humanHours(c.contact.openingHours) : undefined;
  const services = c.services.filter((s) => s.name.trim()).slice(0, 10);
  const real = (c.placePhotos ?? []).filter((p) => /^\/api\/places\/photo\?/.test(p.url));
  const cover = c.coverImage && /^https:\/\//.test(c.coverImage) ? c.coverImage : real[0]?.url;
  const ownGallery = (c.gallery ?? []).filter((u) => /^https:\/\//.test(u)).slice(0, 8);
  const gallery = ownGallery.length ? ownGallery : real.slice(1, 5).map((p) => p.url);
  const credits = !c.coverImage || !ownGallery.length ? [...new Set(real.map((p) => p.author).filter(Boolean))].slice(0, 4) : [];
  const highlights = c.highlights.filter((h) => !AUTO_HL.has(h.title)).slice(0, 4);
  const faq = c.faq.filter((f) => !AUTO_FAQ.has(f.question));
  const aboutHeading = c.heroTitle && c.heroTitle.trim() !== c.businessName.trim() ? c.heroTitle : sec.aboutTitle;
  const dark = isDark(t.heroBg) && !cover;
  const ink = inkOn(a);
  const itemHref = (name: string) => waLink(c.contact.whatsapp, `Olá! Vi o site de vocês. ${t.itemCta === "Pedir" ? "Quero pedir" : t.itemCta === "Orçar" ? "Quero um orçamento de" : t.itemCta === "Agendar" ? "Quero agendar" : "Quero saber mais sobre"}: ${name}`);

  const facts = [
    hours && { k: "Horário", v: <span>{hours}</span> },
    fullAddress && { k: "Endereço", v: mapsLink ? <a href={mapsLink} target="_blank" rel="noopener">{c.contact.address}</a> : <span>{c.contact.address}</span> },
    c.contact.whatsapp
      ? { k: "WhatsApp", v: <a href={wa} target="_blank" rel="noopener">{formatBrPhone(c.contact.whatsapp)}</a> }
      : c.contact.phone && { k: "Telefone", v: <a href={`tel:+${c.contact.phone}`}>{formatBrPhone(c.contact.phone)}</a> },
    !hours && c.contact.instagram && { k: "Instagram", v: <a href={`https://instagram.com/${c.contact.instagram}`} target="_blank" rel="noopener">@{c.contact.instagram}</a> },
  ].filter(Boolean) as { k: string; v: React.ReactNode }[];

  // Few items read better as large tiles; long lists as an editorial list.
  const asTiles = services.length > 0 && (template === "aesthetics" || template === "services" || (services.length <= 3 && template === "auto"));

  return (
    <div className={`vs t-${template}${cover ? " has-cover" : ""}`}>
      {tplLogo && fontHrefs(c.logo!.fonts).map((href) => <link key={href} rel="stylesheet" href={href} />)}
      <style dangerouslySetInnerHTML={{ __html: css(t, a) + LOGO_CSS }} />
      {demo && (
        <div className="demo" role="note">
          <b>Prévia de demonstração.</b> Não é o site oficial do estabelecimento.{demoNote ? ` ${demoNote}` : ""}
        </div>
      )}

      <header className="top">
        <div className="wrap">
          <a href="#inicio" className="brand">
            {tplLogo ? (
              <>
                <span className="vd-logo" aria-hidden dangerouslySetInnerHTML={{ __html: tplLogo }} />
                <span className="vd-sr">{c.businessName}</span>
              </>
            ) : (
              c.businessName
            )}
          </a>
          <nav className="nav" aria-label="Seções">
            <a href="#sobre">{sec.aboutTitle}</a>
            {services.length > 0 && <a href="#servicos">{sec.servicesTitle}</a>}
            <a href="#visite">{fullAddress ? "Como chegar" : "Contato"}</a>
          </nav>
          {wa && <a className="btn sm" href={wa} target="_blank" rel="noopener">{c.ctaLabel}</a>}
        </div>
      </header>

      <section id="inicio" className="hero" style={dark ? { colorScheme: "dark" } : undefined}>
        {cover && <img className="bgimg" src={cover} alt="" fetchPriority="high" />}
        <div className="wrap">
          <div>
            <p className="eyebrow in1">{[c.tagline, c.contact.city].filter(Boolean).join(" · ")}</p>
            <h1 className="in2">{c.businessName}</h1>
            <p className="lead in3">{c.heroSubtitle}</p>
            <div className="ctas in4">
              {wa && <a className="btn" href={wa} target="_blank" rel="noopener">{WA_ICON}{c.ctaLabel}</a>}
              {services.length > 0 ? (
                <a className="btn line" href="#servicos">{sec.servicesTitle}</a>
              ) : mapsLink ? (
                <a className="btn line" href={mapsLink} target="_blank" rel="noopener">{PIN}Como chegar</a>
              ) : null}
            </div>
          </div>
          {!cover && <div className="in3" style={{ display: "contents" }}><Seal name={c.businessName} place={[c.contact.city, c.contact.state].filter(Boolean).join(" · ")} accent={a} ink={ink} /></div>}
        </div>
        {facts.length > 0 && (
          <div className="facts in4">
            <div className="wrap" style={{ ["--n" as string]: facts.length }}>
              {facts.map((f) => (
                <div className="f" key={f.k}><b>{f.k}</b>{f.v}</div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="blk about" id="sobre">
        <div className="wrap split">
          <div className="rv">
            <p className="kicker"><i aria-hidden />{sec.aboutTitle}</p>
            <h2>{aboutHeading}</h2>
          </div>
          <div className="rv d1">
            <p className="big">{c.about}</p>
            {highlights.length > 0 && (
              <ul className="notes">
                {highlights.map((h) => (
                  <li key={h.title}><b>{h.title}</b><span>{h.description}</span></li>
                ))}
              </ul>
            )}
            {c.contact.instagram && (
              <a className="ig" href={`https://instagram.com/${c.contact.instagram}`} target="_blank" rel="noopener">@{c.contact.instagram} no Instagram</a>
            )}
          </div>
        </div>
      </section>

      {services.length > 0 && (
        <section className="blk" id="servicos" style={{ background: "var(--sf)" }}>
          <div className="wrap">
            <div className="svc-head">
              <h2 className="rv">{sec.servicesTitle}</h2>
              <p className="rv d1">{sec.servicesIntro}</p>
            </div>
            {asTiles ? (
              <div className="grid" style={{ ["--c" as string]: Math.min(services.length, 3) }}>
                {services.map((s, i) => {
                  const href = itemHref(s.name);
                  const inner = (
                    <>
                      <h3>{s.name}</h3>
                      {s.description && <p>{s.description}</p>}
                      {href && <span className="go">{t.itemCta} {ARROW}</span>}
                    </>
                  );
                  return href ? (
                    <a key={s.name} className={`tile rv d${(i % 4) + 1}`} href={href} target="_blank" rel="noopener">{inner}</a>
                  ) : (
                    <div key={s.name} className={`tile rv d${(i % 4) + 1}`}>{inner}</div>
                  );
                })}
              </div>
            ) : (
              <ul className="rows">
                {services.map((s, i) => {
                  const href = itemHref(s.name);
                  const inner = (
                    <>
                      <h3>{s.name}</h3>
                      {s.description && <p>{s.description}</p>}
                      {href && <span className="go">{t.itemCta} {ARROW}</span>}
                    </>
                  );
                  return (
                    <li key={s.name} className={`rv d${(i % 4) + 1}`}>
                      {href ? <a href={href} target="_blank" rel="noopener">{inner}</a> : <a>{inner}</a>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="blk" style={{ paddingBottom: 0 }}>
          <div className="wrap gal">
            {gallery.map((src, i) => <img key={src} className={`rv d${(i % 4) + 1}`} src={src} alt={`${c.businessName}, foto ${i + 1}`} loading="lazy" />)}
          </div>
        </section>
      )}

      <section className="blk" id="visite">
        <div className="wrap visit">
          <div className="rv">
            <p className="kicker"><i aria-hidden />{fullAddress ? "Visite" : "Contato"}</p>
            <h2>{fullAddress ? "Como chegar" : "Fale com a gente"}</h2>
            <ul className="kv">
              {fullAddress && <li><b>Endereço</b>{mapsLink ? <a href={mapsLink} target="_blank" rel="noopener">{fullAddress}</a> : fullAddress}</li>}
              {hours && <li><b>Horário</b><span>{hours}</span></li>}
              {c.contact.whatsapp && <li><b>WhatsApp</b><a href={wa} target="_blank" rel="noopener">{formatBrPhone(c.contact.whatsapp)}</a></li>}
              {!c.contact.whatsapp && c.contact.phone && <li><b>Telefone</b><a href={`tel:+${c.contact.phone}`}>{formatBrPhone(c.contact.phone)}</a></li>}
              {c.contact.instagram && <li><b>Instagram</b><a href={`https://instagram.com/${c.contact.instagram}`} target="_blank" rel="noopener">@{c.contact.instagram}</a></li>}
              {c.contact.email && <li><b>E-mail</b><a href={`mailto:${c.contact.email}`}>{c.contact.email}</a></li>}
            </ul>
            <div className="ctas" style={{ marginTop: 32 }}>
              {mapsLink && <a className="btn line" href={mapsLink} target="_blank" rel="noopener">{PIN}Abrir no mapa</a>}
              {wa && <a className="btn" href={wa} target="_blank" rel="noopener">{WA_ICON}{c.ctaLabel}</a>}
            </div>
          </div>
          {mapSrc && <iframe className="map rv d1" src={mapSrc} title={`Mapa: ${c.businessName}`} loading="lazy" />}
        </div>
      </section>

      {faq.length > 0 && (
        <section className="blk" style={{ paddingTop: 0 }}>
          <div className="wrap" style={{ maxWidth: 880 }}>
            <p className="kicker rv"><i aria-hidden />Dúvidas</p>
            <h2 className="rv" style={{ marginBottom: 24 }}>Perguntas frequentes</h2>
            {faq.map((f) => (
              <details key={f.question} className="rv"><summary>{f.question}</summary><p>{f.answer}</p></details>
            ))}
          </div>
        </section>
      )}

      {wa && (
        <section className="band">
          <div className="wrap">
            <div className="rv">
              <h2>{sec.ctaTitle}</h2>
              <p>{sec.ctaText}</p>
            </div>
            <a className="btn rv d1" href={wa} target="_blank" rel="noopener">{WA_ICON}{c.ctaLabel}</a>
          </div>
        </section>
      )}

      <footer>
        <div className="wrap">
          <div className="mark">{c.businessName}</div>
          <div className="meta">
            <span>{[c.contact.address, place].filter(Boolean).join(" · ")}</span>
            <span>{credits.length ? `Fotos: ${credits.join(", ")} · Google Maps · ` : ""}© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>

      {wa && (
        <>
          <a className="fab" href={wa} target="_blank" rel="noopener" aria-label="Falar no WhatsApp">{WA_ICON}</a>
          <a className="bar" href={wa} target="_blank" rel="noopener">{WA_ICON}{c.ctaLabel}</a>
        </>
      )}
      <SiteMotion />
    </div>
  );
}
