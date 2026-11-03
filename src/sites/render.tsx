import type { SiteContent, TemplateId } from "@/server/db/schema";
import { THEMES, type Theme } from "./themes";
import { HeroArt } from "./art";
import { SiteMotion } from "./motion";
import { formatBrPhone } from "@/lib/phone";

type Props = { content: SiteContent; template: TemplateId; accent: string; demo: boolean; demoNote?: string };

function waLink(n: string | undefined, name: string) {
  if (!n) return undefined;
  return `https://wa.me/${n}?text=${encodeURIComponent(`Olá! Vi o site da ${name} e gostaria de mais informações.`)}`;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function inkOn(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}

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


function css(t: Theme, a: string) {
  const [r, g, b] = hexToRgb(a);
  const aInk = inkOn(a);
  const up = t.uppercaseHeadings;
  return `
.vs{--bg:${t.bg};--fg:${t.fg};--mu:${t.muted};--sf:${t.surface};--ln:${t.line};--hb:${t.heroBg};--hf:${t.heroFg};--a:${a};--ai:${aInk};--a-rgb:${r},${g},${b};--a2:${t.hero === "poster" ? "#f2b134" : `rgba(${r},${g},${b},.18)`};--r:${t.radius};--d:${t.display};--b:${t.body};
  background:var(--bg);color:var(--fg);font-family:var(--b);font-size:17px;line-height:1.65;min-height:100vh;-webkit-font-smoothing:antialiased;overflow-x:clip}
.vs *{box-sizing:border-box}
.vs a{color:inherit;text-decoration:none}
.vs img{max-width:100%;display:block}
.vs h1,.vs h2,.vs h3{font-family:var(--d);margin:0;font-weight:${t.hero === "poster" ? 800 : t.hero === "center" ? 600 : 700};line-height:1.05;letter-spacing:${up ? ".01em" : "-.02em"};text-transform:${up ? "uppercase" : "none"}}
.vs .wrap{width:min(1160px,100% - 40px);margin-inline:auto}
.vs .demo{position:relative;z-index:60;background:#102F29;color:#F7F8F4;font:600 13px/1.4 system-ui,sans-serif;padding:9px 16px;text-align:center}
.vs .demo b{color:#39D79B}

/* Header */
.vs .top{position:sticky;top:0;z-index:50;transition:background .3s,box-shadow .3s,backdrop-filter .3s;color:var(--hf)}
.vs .top.scrolled{background:color-mix(in srgb,var(--hb) 86%,transparent);backdrop-filter:saturate(1.4) blur(14px);box-shadow:0 1px 0 var(--ln)}
.vs .top .wrap{display:flex;align-items:center;gap:24px;height:72px}
.vs .brand{font-family:var(--d);font-size:22px;font-weight:700;letter-spacing:${up ? ".03em" : "-.02em"};text-transform:${up ? "uppercase" : "none"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-right:auto}
.vs .nav{display:none;gap:28px;font-size:15px;font-weight:500;opacity:.85}
.vs .nav a:hover{opacity:1;color:var(--a)}
@media(min-width:860px){.vs .nav{display:flex}}

/* Buttons */
.vs .btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;background:var(--a);color:var(--ai);font-weight:700;font-size:16px;padding:15px 26px;border-radius:${t.hero === "center" || t.hero === "mesh" ? "999px" : "var(--r)"};overflow:hidden;transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s;box-shadow:0 10px 30px -12px rgba(var(--a-rgb),.7);${up ? "text-transform:uppercase;letter-spacing:.06em;font-size:15px;" : ""}}
.vs .btn::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);transform:translateX(-120%);transition:transform .7s}
.vs .btn:hover{transform:translateY(-2px);box-shadow:0 16px 36px -12px rgba(var(--a-rgb),.8)}
.vs .btn:hover::after{transform:translateX(120%)}
.vs .btn.sm{padding:10px 18px;font-size:14px}
.vs .btn.ghost{background:transparent;color:inherit;box-shadow:none;border:1.5px solid currentColor;opacity:.9}
.vs .btn svg{width:20px;height:20px}

/* Hero */
.vs .hero{position:relative;background:var(--hb);color:var(--hf);overflow:hidden;margin-top:-72px;padding-top:72px}
.vs .hero .wrap{position:relative;display:grid;gap:48px;align-items:center;padding:72px 0 96px}
.vs .eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:14px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--a)}
.vs .eyebrow::before{content:"";width:28px;height:2px;background:currentColor}
.vs .hero h1{font-size:clamp(44px,7.4vw,${t.hero === "split" ? "104px" : "86px"});margin:22px 0 0}
.vs .hero p.lead{font-size:clamp(17px,1.6vw,20px);opacity:.82;max-width:560px;margin:24px 0 36px}
.vs .ctas{display:flex;flex-wrap:wrap;gap:14px}
.vs .art{width:100%;height:auto;color:var(--hf)}
.vs .cover{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--r)}
@media(min-width:900px){.vs .hero .wrap{grid-template-columns:1.15fr .85fr;padding:96px 0 128px}}

/* Sections */
.vs section.blk{padding:clamp(72px,10vw,128px) 0}
.vs .kicker{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--a);margin-bottom:14px}
.vs h2{font-size:clamp(34px,4.6vw,60px)}
.vs .intro{color:var(--mu);font-size:18px;max-width:620px;margin:18px 0 0}
.vs .head{display:grid;gap:12px;margin-bottom:48px}
@media(min-width:900px){.vs .head.side{grid-template-columns:1fr 1fr;align-items:end}.vs .head.side .intro{justify-self:end;text-align:right}}
.vs .about{display:grid;gap:40px}
.vs .about p{font-size:clamp(19px,2vw,24px);line-height:1.55;margin:0;max-width:820px}
@media(min-width:900px){.vs .about{grid-template-columns:.8fr 1.2fr}}

/* Services: menu */
.vs .menu{display:grid;gap:0;border-top:1px solid var(--ln)}
.vs .menu li{list-style:none;display:grid;grid-template-columns:auto 1fr;gap:6px 22px;padding:26px 0;border-bottom:1px solid var(--ln);transition:padding .3s}
.vs .menu li:hover{padding-left:12px}
.vs .menu .n{font-family:var(--d);color:var(--a);font-size:20px;grid-row:span 2}
.vs .menu h3{font-size:clamp(24px,2.6vw,34px)}
.vs .menu p{grid-column:2;margin:0;color:var(--mu)}
@media(min-width:900px){.vs .menu{grid-template-columns:1fr 1fr;column-gap:64px}}

/* Services: cards */
.vs .cards{display:grid;gap:20px}
@media(min-width:700px){.vs .cards{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1000px){.vs .cards{grid-template-columns:repeat(3,1fr)}}
.vs .card{background:var(--sf);border:1px solid var(--ln);border-radius:var(--r);padding:32px;transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s}
.vs .card:hover{transform:translateY(-6px);box-shadow:0 30px 60px -30px rgba(var(--a-rgb),.45)}
.vs .card .ic{width:48px;height:48px;border-radius:999px;display:grid;place-items:center;background:rgba(var(--a-rgb),.14);color:var(--a);margin-bottom:22px;font-family:var(--d);font-size:22px}
.vs .card h3{font-size:28px}
.vs .card p{color:var(--mu);margin:10px 0 0}

/* Services: bento */
.vs .bento{display:grid;gap:16px}
@media(min-width:800px){.vs .bento{grid-template-columns:repeat(6,1fr)}.vs .bento .card:nth-child(1){grid-column:span 4;grid-row:span 2}.vs .bento .card{grid-column:span 2}.vs .bento .card:nth-child(4),.vs .bento .card:nth-child(5){grid-column:span 3}}
.vs .bento .card:nth-child(1){background:var(--a);color:var(--ai);border-color:transparent}
.vs .bento .card:nth-child(1) p{color:inherit;opacity:.85}
.vs .bento .card:nth-child(1) .ic{background:rgba(255,255,255,.18);color:inherit}
.vs .bento .card:nth-child(1) h3{font-size:clamp(30px,3vw,42px)}

/* Services: numbered */
.vs .numbered{display:grid;gap:2px;background:var(--ln);border:1px solid var(--ln)}
@media(min-width:700px){.vs .numbered{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1000px){.vs .numbered{grid-template-columns:repeat(3,1fr)}}
.vs .numbered .card{border:0;border-radius:0;position:relative}
.vs .numbered .card::before{content:"";position:absolute;left:0;top:0;height:4px;width:0;background:var(--a);transition:width .4s}
.vs .numbered .card:hover::before{width:100%}
.vs .numbered .card .ic{border-radius:0;background:var(--fg);color:var(--a)}

/* Marquee */
.vs .marquee{overflow:hidden;background:var(--a);color:var(--ai);padding:18px 0;${t.hero === "poster" ? "transform:rotate(-1.6deg);margin:-14px -10px 0;" : ""}}
.vs .marquee .track{display:flex;gap:48px;width:max-content;animation:vs-mq 28s linear infinite;font-family:var(--d);font-size:clamp(22px,3vw,34px);text-transform:${up ? "uppercase" : "none"};white-space:nowrap}
.vs .marquee span::after{content:"✦";margin-left:48px;opacity:.7}
@keyframes vs-mq{to{transform:translateX(-50%)}}

/* Steps */
.vs .steps{display:grid;gap:20px;counter-reset:s}
@media(min-width:800px){.vs .steps{grid-template-columns:repeat(3,1fr)}}
.vs .step{counter-increment:s;padding:28px;border-radius:var(--r);background:var(--sf);border:1px solid var(--ln)}
.vs .step::before{content:counter(s,decimal-leading-zero);display:block;font-family:var(--d);font-size:44px;color:var(--a);line-height:1;margin-bottom:14px}
.vs .step h3{font-size:22px}
.vs .step p{color:var(--mu);margin:8px 0 0}

/* Highlights */
.vs .hl{display:grid;gap:28px}
@media(min-width:800px){.vs .hl{grid-template-columns:repeat(3,1fr)}}
.vs .hl div{border-top:2px solid var(--a);padding-top:22px}
.vs .hl h3{font-size:24px}
.vs .hl p{color:var(--mu);margin:8px 0 0}

/* CTA band */
.vs .band{position:relative;overflow:hidden;background:${t.hero === "mesh" || t.hero === "center" ? "var(--a)" : "var(--fg)"};color:${t.hero === "mesh" || t.hero === "center" ? "var(--ai)" : "var(--bg)"};border-radius:${t.hero === "split" || t.hero === "blueprint" ? "0" : "calc(var(--r) * 1.4)"};padding:clamp(48px,7vw,88px)}
.vs .band h2{max-width:760px}
.vs .band p{opacity:.8;font-size:19px;margin:16px 0 32px;max-width:560px}
.vs .band .btn{${t.hero === "mesh" || t.hero === "center" ? "background:var(--ai);color:var(--a);" : ""}}
.vs .band::after{content:"";position:absolute;right:-120px;bottom:-160px;width:420px;height:420px;border-radius:50%;background:rgba(var(--a-rgb),.35);filter:blur(10px)}

/* FAQ */
.vs details{border-bottom:1px solid var(--ln);padding:22px 0}
.vs summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:20px;font-family:var(--d);font-size:clamp(20px,2.2vw,26px);font-weight:600;text-transform:${up ? "uppercase" : "none"}}
.vs summary::-webkit-details-marker{display:none}
.vs summary::after{content:"+";color:var(--a);transition:transform .3s}
.vs details[open] summary::after{transform:rotate(45deg)}
.vs details p{color:var(--mu);margin:12px 0 0;max-width:720px}

/* Contact */
.vs .contact{display:grid;gap:40px}
@media(min-width:900px){.vs .contact{grid-template-columns:1fr 1.1fr;align-items:stretch}}
.vs .kv{margin:0;padding:0}
.vs .kv li{list-style:none;padding:18px 0;border-bottom:1px solid var(--ln)}
.vs .kv b{display:block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--mu);margin-bottom:4px}
.vs .kv a:hover{color:var(--a)}
.vs .map{width:100%;min-height:360px;height:100%;border:0;border-radius:var(--r);background:var(--sf);filter:${t.bg.startsWith("#0") ? "invert(.9) hue-rotate(180deg) saturate(.6)" : "saturate(.8)"}}

.vs footer{border-top:1px solid var(--ln);padding:36px 0;font-size:14px;color:var(--mu)}
.vs footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px}

.vs .fab{position:fixed;right:20px;bottom:20px;z-index:55;width:60px;height:60px;border-radius:50%;background:#25D366;display:grid;place-items:center;box-shadow:0 12px 30px rgba(0,0,0,.28);transition:transform .25s}
.vs .fab:hover{transform:scale(1.08)}
.vs .fab::before{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid #25D366;animation:vs-ping 2.4s ease-out infinite}
@keyframes vs-ping{from{transform:scale(1);opacity:.7}to{transform:scale(1.6);opacity:0}}
.vs .fab svg{width:30px;height:30px}

/* Reveal */
.vs.anim .rv{opacity:0;transform:translateY(28px);transition:opacity .9s cubic-bezier(.2,.8,.2,1),transform .9s cubic-bezier(.2,.8,.2,1)}
.vs.anim .rv.in{opacity:1;transform:none}
.vs.anim .rv.d1{transition-delay:.08s}.vs.anim .rv.d2{transition-delay:.16s}.vs.anim .rv.d3{transition-delay:.24s}.vs.anim .rv.d4{transition-delay:.32s}

/* ── Niche-specific ── */
${
  t.hero === "split"
    ? `.vs .hero{background:radial-gradient(1200px 600px at 85% 10%,rgba(var(--a-rgb),.16),transparent 60%),var(--hb)}
.vs .hero::before{content:"";position:absolute;inset:0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.05'/%3E%3C/svg%3E");pointer-events:none}
.vs .hero h1 em{font-style:normal;color:var(--a)}
.vs .pole{animation:vs-pole 3s linear infinite}
@keyframes vs-pole{to{transform:translateY(41.5px)}}`
    : ""
}
${
  t.hero === "center"
    ? `.vs .hero{text-align:center;background:var(--hb)}
.vs .hero .wrap{grid-template-columns:1fr !important;justify-items:center}
.vs .hero p.lead{margin-inline:auto}.vs .hero .ctas{justify-content:center}.vs .eyebrow::before{display:none}
.vs .hero h1{font-style:italic;font-weight:500}
.vs .blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.55;animation:vs-blob 18s ease-in-out infinite alternate}
.vs .blob.b1{width:520px;height:520px;background:rgba(var(--a-rgb),.55);top:-160px;left:-140px}
.vs .blob.b2{width:440px;height:440px;background:#f0d6c8;bottom:-200px;right:-120px;animation-delay:-6s}
@keyframes vs-blob{to{transform:translate(60px,40px) scale(1.12)}}
.vs .arch{width:min(360px,80%);aspect-ratio:3/4;border-radius:999px 999px 24px 24px;overflow:hidden;margin-top:12px;box-shadow:0 40px 80px -40px rgba(58,43,40,.5)}
.vs .arch img{width:100%;height:100%;object-fit:cover}
.vs .arch .art{background:rgba(var(--a-rgb),.08);height:100%}
.vs .card .ic{font-style:italic}`
    : ""
}
${
  t.hero === "poster"
    ? `.vs .hero{background:var(--hb)}
.vs .hero h1{font-size:clamp(52px,8.6vw,118px);letter-spacing:-.035em}
.vs .hero h1 em{font-style:italic;color:var(--a)}
.vs .sticker{position:absolute;right:6%;top:18%;width:150px;height:150px;border-radius:50%;background:var(--a2);color:var(--fg);display:grid;place-items:center;text-align:center;font-family:var(--d);font-weight:800;font-size:17px;line-height:1.1;padding:20px;animation:vs-spin 14s linear infinite;z-index:2}
@keyframes vs-spin{to{transform:rotate(360deg)}}
.vs .wave{display:block;width:100%;height:48px;color:var(--a)}
.vs .menu li{border-bottom-style:dashed}
.vs .steam{animation:vs-steam 2.6s ease-in-out infinite}
@keyframes vs-steam{50%{transform:translateY(-6px);opacity:.6}}`
    : ""
}
${
  t.hero === "blueprint"
    ? `.vs .hero{background:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px) 0 0/40px 40px,var(--hb)}
.vs .hero h1{font-stretch:75%;font-weight:900;letter-spacing:-.01em}
.vs .hazard{height:14px;background:repeating-linear-gradient(-45deg,var(--a) 0 18px,#0b1220 18px 36px)}
.vs .gear{animation:vs-gear 16s linear infinite}
@keyframes vs-gear{to{transform:rotate(360deg)}}
.vs h2{font-stretch:80%;font-weight:900}
.vs .step::before{color:var(--fg);-webkit-text-stroke:0;background:var(--a);display:inline-block;padding:6px 10px;font-size:28px}`
    : ""
}
${
  t.hero === "mesh"
    ? `.vs .hero{background:radial-gradient(800px 500px at 15% 20%,rgba(var(--a-rgb),.22),transparent 60%),radial-gradient(700px 500px at 85% 10%,rgba(56,189,248,.20),transparent 60%),radial-gradient(800px 600px at 60% 100%,rgba(244,114,182,.16),transparent 60%),var(--hb);background-size:140% 140%;animation:vs-mesh 16s ease-in-out infinite alternate}
@keyframes vs-mesh{to{background-position:100% 50%}}
.vs .hero h1{letter-spacing:-.045em;font-weight:800}
.vs .float{animation:vs-float 6s ease-in-out infinite}
@keyframes vs-float{50%{transform:translateY(-12px)}}
.vs .pill{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--ln);border-radius:999px;padding:6px 14px 6px 6px;font-size:14px;font-weight:600;box-shadow:0 6px 20px -10px rgba(15,23,42,.25)}
.vs .pill i{width:22px;height:22px;border-radius:50%;background:var(--a);display:inline-block}`
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

/** Emphasise the business name inside the headline when it appears there. */
function Headline({ text, name }: { text: string; name: string }) {
  const i = text.indexOf(name);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <em>{name}</em>
      {text.slice(i + name.length)}
    </>
  );
}

export function SiteRender({ content: c, template, accent, demo, demoNote }: Props) {
  const t = THEMES[template] ?? THEMES.services;
  const a = /^#[0-9a-f]{6}$/i.test(accent) ? accent : t.accent;
  const sec = { ...t.defaults, ...(c.sections ?? {}) };
  const wa = waLink(c.contact.whatsapp, c.businessName);
  const place = [c.contact.city, c.contact.state].filter(Boolean).join(" - ");
  const mapSrc =
    c.contact.lat && c.contact.lng
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${c.contact.lng - 0.004},${c.contact.lat - 0.003},${c.contact.lng + 0.004},${c.contact.lat + 0.003}&layer=mapnik&marker=${c.contact.lat},${c.contact.lng}`
      : c.contact.address
        ? `https://maps.google.com/maps?q=${encodeURIComponent(`${c.contact.address}, ${place}`)}&output=embed`
        : undefined;
  const mapsLink = c.contact.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.businessName} ${c.contact.address} ${place}`)}` : undefined;
  const services = c.services.slice(0, 8);
  const cover = c.coverImage && /^https:\/\//.test(c.coverImage) ? c.coverImage : undefined;

  const visual =
    t.hero === "center" ? (
      <div className="arch rv d2">{cover ? <img src={cover} alt={c.businessName} /> : <HeroArt template={template} />}</div>
    ) : cover ? (
      <img className="cover rv d2" src={cover} alt={c.businessName} />
    ) : (
      <div className="rv d2"><HeroArt template={template} /></div>
    );

  const ServicesBlock =
    t.servicesStyle === "menu" ? (
      <ul className="menu" style={{ padding: 0, margin: 0 }}>
        {services.map((s, i) => (
          <li key={s.name} className={`rv d${(i % 4) + 1}`}>
            <span className="n">{String(i + 1).padStart(2, "0")}</span>
            <h3>{s.name}</h3>
            {s.description && <p>{s.description}</p>}
          </li>
        ))}
      </ul>
    ) : (
      <div className={t.servicesStyle}>
        {services.map((s, i) => (
          <div key={s.name} className={`card rv d${(i % 4) + 1}`}>
            <span className="ic">{t.servicesStyle === "numbered" ? String(i + 1).padStart(2, "0") : s.name.slice(0, 1)}</span>
            <h3>{s.name}</h3>
            {s.description && <p>{s.description}</p>}
          </div>
        ))}
      </div>
    );

  return (
    <div className={`vs t-${template}`}>
      <style dangerouslySetInnerHTML={{ __html: css(t, a) }} />
      {demo && (
        <div className="demo" role="note">
          <b>Demonstração</b> — prévia independente criada para apresentação. Não é o site oficial e não foi aprovada pelo estabelecimento.{demoNote ? ` ${demoNote}` : ""}
        </div>
      )}

      <header className="top">
        <div className="wrap">
          <a href="#inicio" className="brand">{c.businessName}</a>
          <nav className="nav" aria-label="Seções">
            <a href="#sobre">Sobre</a>
            {services.length > 0 && <a href="#servicos">{sec.servicesTitle}</a>}
            <a href="#contato">Contato</a>
          </nav>
          {wa && <a className="btn sm" href={wa} target="_blank" rel="noopener">{c.ctaLabel}</a>}
        </div>
      </header>

      <section id="inicio" className="hero">
        {t.hero === "center" && (
          <>
            <span className="blob b1" aria-hidden />
            <span className="blob b2" aria-hidden />
          </>
        )}
        {t.hero === "poster" && wa && <a className="sticker" href={wa} target="_blank" rel="noopener">Peça pelo WhatsApp</a>}
        <div className="wrap">
          <div>
            {t.hero === "mesh" ? (
              <span className="pill rv"><i aria-hidden />{c.tagline}{c.contact.city ? ` em ${c.contact.city}` : ""}</span>
            ) : (
              <span className="eyebrow rv">{c.tagline}{c.contact.city ? ` · ${c.contact.city}` : ""}</span>
            )}
            <h1 className="rv d1"><Headline text={c.heroTitle} name={c.businessName} /></h1>
            <p className="lead rv d2">{c.heroSubtitle}</p>
            <div className="ctas rv d3">
              {wa && <a className="btn" href={wa} target="_blank" rel="noopener">{WA_ICON}{c.ctaLabel}</a>}
              {services.length > 0 && <a className="btn ghost" href="#servicos">{sec.servicesTitle}</a>}
            </div>
          </div>
          {visual}
        </div>
        {t.hero === "blueprint" && <div className="hazard" aria-hidden />}
      </section>

      {t.marquee && services.length > 0 && (
        <div className="marquee" aria-hidden>
          <div className="track">
            {[...services, ...services, ...services, ...services].map((s, i) => <span key={i}>{s.name}</span>)}
          </div>
        </div>
      )}

      <section className="blk" id="sobre">
        <div className="wrap about">
          <div className="rv">
            <div className="kicker">{sec.aboutTitle}</div>
            <h2>{c.businessName}</h2>
          </div>
          <p className="rv d1">{c.about}</p>
        </div>
      </section>

      {services.length > 0 && (
        <section className="blk" id="servicos" style={{ background: "var(--sf)" }}>
          <div className="wrap">
            <div className="head side">
              <div className="rv">
                <div className="kicker">{c.tagline}</div>
                <h2>{sec.servicesTitle}</h2>
              </div>
              <p className="intro rv d1">{sec.servicesIntro}</p>
            </div>
            {ServicesBlock}
          </div>
        </section>
      )}

      {t.steps && wa && (
        <section className="blk">
          <div className="wrap">
            <div className="head rv"><div className="kicker">Como pedir</div><h2>Simples e rápido</h2></div>
            <div className="steps">
              <div className="step rv d1"><h3>Chame no WhatsApp</h3><p>Toque no botão e mande uma mensagem.</p></div>
              <div className="step rv d2"><h3>Conte o que precisa</h3><p>Explique o serviço que você procura.</p></div>
              <div className="step rv d3"><h3>Combine o atendimento</h3><p>Acerte os detalhes e o melhor horário.</p></div>
            </div>
          </div>
        </section>
      )}

      {c.highlights.length > 0 && (
        <section className="blk">
          <div className="wrap">
            <div className="head rv"><div className="kicker">{c.businessName}</div><h2>{sec.highlightsTitle}</h2></div>
            <div className="hl">
              {c.highlights.slice(0, 3).map((h, i) => (
                <div key={h.title} className={`rv d${i + 1}`}><h3>{h.title}</h3><p>{h.description}</p></div>
              ))}
            </div>
          </div>
        </section>
      )}

      {wa && (
        <section className="blk" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="band rv">
              <h2>{sec.ctaTitle}</h2>
              <p>{sec.ctaText}</p>
              <a className="btn" href={wa} target="_blank" rel="noopener">{WA_ICON}{c.ctaLabel}</a>
            </div>
          </div>
        </section>
      )}

      {c.faq.length > 0 && (
        <section className="blk" style={{ paddingTop: 0 }}>
          <div className="wrap" style={{ maxWidth: 900 }}>
            <div className="head rv"><div className="kicker">Dúvidas</div><h2>Perguntas frequentes</h2></div>
            {c.faq.map((f) => (
              <details key={f.question} className="rv"><summary>{f.question}</summary><p>{f.answer}</p></details>
            ))}
          </div>
        </section>
      )}

      <section className="blk" id="contato" style={{ background: "var(--sf)" }}>
        <div className="wrap contact">
          <div className="rv">
            <div className="kicker">Contato</div>
            <h2>Fale com a gente</h2>
            <ul className="kv" style={{ marginTop: 28 }}>
              {c.contact.whatsapp && <li><b>WhatsApp</b><a href={wa} target="_blank" rel="noopener">{formatBrPhone(c.contact.whatsapp)}</a></li>}
              {!c.contact.whatsapp && c.contact.phone && <li><b>Telefone</b><a href={`tel:+${c.contact.phone}`}>{formatBrPhone(c.contact.phone)}</a></li>}
              {c.contact.address && <li><b>Endereço</b>{mapsLink ? <a href={mapsLink} target="_blank" rel="noopener">{c.contact.address}{place ? ` — ${place}` : ""}</a> : c.contact.address}</li>}
              {c.contact.openingHours && <li><b>Horário</b>{c.contact.openingHours}</li>}
              {c.contact.instagram && <li><b>Instagram</b><a href={`https://instagram.com/${c.contact.instagram}`} target="_blank" rel="noopener">@{c.contact.instagram}</a></li>}
              {c.contact.email && <li><b>E-mail</b><a href={`mailto:${c.contact.email}`}>{c.contact.email}</a></li>}
            </ul>
            {wa && <div style={{ marginTop: 28 }}><a className="btn" href={wa} target="_blank" rel="noopener">{WA_ICON}{c.ctaLabel}</a></div>}
          </div>
          {mapSrc && <iframe className="map rv d1" src={mapSrc} title={`Mapa — ${c.businessName}`} loading="lazy" />}
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span>© {new Date().getFullYear()} {c.businessName}</span>
          <span>{place}</span>
        </div>
      </footer>

      {wa && (
        <a className="fab" href={wa} target="_blank" rel="noopener" aria-label="Falar no WhatsApp" style={{ color: "#fff" }}>
          {WA_ICON}
        </a>
      )}
      <SiteMotion />
    </div>
  );
}
