import type { SiteContent, TemplateId } from "@/server/db/schema";
import { THEMES } from "./themes";
import { formatBrPhone } from "@/lib/phone";

type Props = { content: SiteContent; template: TemplateId; accent: string; demo: boolean; demoNote?: string };

function waLink(n: string | undefined, name: string) {
  if (!n) return undefined;
  return `https://wa.me/${n}?text=${encodeURIComponent(`Olá! Vi o site da ${name} e gostaria de mais informações.`)}`;
}

function ink(hex: string) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (r! * 299 + g! * 587 + b! * 114) / 1000 > 150 ? "#111111" : "#ffffff";
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

export function SiteRender({ content: c, template, accent, demo, demoNote }: Props) {
  const t = THEMES[template] ?? THEMES.services;
  const a = /^#[0-9a-f]{6}$/i.test(accent) ? accent : t.accent;
  const aInk = ink(a);
  const wa = waLink(c.contact.whatsapp, c.businessName);
  const place = [c.contact.city, c.contact.state].filter(Boolean).join(" - ");
  const mapSrc =
    c.contact.lat && c.contact.lng
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${c.contact.lng - 0.004},${c.contact.lat - 0.003},${c.contact.lng + 0.004},${c.contact.lat + 0.003}&layer=mapnik&marker=${c.contact.lat},${c.contact.lng}`
      : undefined;
  const mapsLink = c.contact.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.businessName} ${c.contact.address} ${place}`)}` : undefined;

  const css = `
  .vs{--bg:${t.bg};--fg:${t.fg};--mu:${t.muted};--sf:${t.surface};--hb:${t.heroBg};--hf:${t.heroFg};--a:${a};--ai:${aInk};--r:${t.radius};
    background:var(--bg);color:var(--fg);font-family:${t.bodyFont};line-height:1.6;min-height:100vh;-webkit-font-smoothing:antialiased}
  .vs *{box-sizing:border-box}
  .vs a{color:inherit}
  .vs h1,.vs h2,.vs h3{font-family:${t.headingFont};line-height:1.12;margin:0;letter-spacing:${t.headingTransform === "uppercase" ? "0.02em" : "-0.01em"};text-transform:${t.headingTransform ?? "none"}}
  .vs .wrap{max-width:1080px;margin:0 auto;padding:0 20px}
  .vs .demo{background:#102F29;color:#F7F8F4;font:600 13px/1.4 system-ui,sans-serif;padding:10px 16px;text-align:center}
  .vs .demo b{color:#39D79B}
  .vs .top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--hb) 92%,transparent);backdrop-filter:blur(8px);color:var(--hf);border-bottom:1px solid color-mix(in srgb,var(--hf) 10%,transparent)}
  .vs .top .wrap{display:flex;align-items:center;justify-content:space-between;height:64px;gap:12px}
  .vs .brand{font-family:${t.headingFont};font-weight:700;font-size:20px;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .vs .btn{display:inline-flex;align-items:center;gap:8px;background:var(--a);color:var(--ai);font-weight:700;text-decoration:none;padding:13px 22px;border-radius:var(--r);font-size:15px;transition:transform .15s,filter .15s;border:0}
  .vs .btn:hover{filter:brightness(1.06);transform:translateY(-1px)}
  .vs .btn.sm{padding:9px 16px;font-size:14px}
  .vs .btn.ghost{background:transparent;color:inherit;border:1.5px solid color-mix(in srgb,currentColor 35%,transparent)}
  .vs .hero{background:var(--hb);color:var(--hf);position:relative;overflow:hidden}
  .vs .hero .wrap{padding-top:72px;padding-bottom:80px}
  .vs .hero .eyebrow{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--a);margin-bottom:18px}
  .vs .hero h1{font-size:clamp(34px,6vw,62px);max-width:760px}
  .vs .hero p{font-size:clamp(16px,2vw,19px);opacity:.82;max-width:560px;margin:18px 0 30px}
  .vs .hero .ctas{display:flex;flex-wrap:wrap;gap:12px}
  .vs .hero.center .wrap{text-align:center}.vs .hero.center h1,.vs .hero.center p{margin-left:auto;margin-right:auto}.vs .hero.center .ctas{justify-content:center}
  .vs .hero.split .wrap{display:grid;gap:40px;align-items:center}
  @media(min-width:860px){.vs .hero.split .wrap{grid-template-columns:1.3fr 1fr}}
  .vs .hero .card{background:color-mix(in srgb,var(--hf) 6%,transparent);border:1px solid color-mix(in srgb,var(--hf) 14%,transparent);border-radius:var(--r);padding:26px}
  .vs .hero .card li{list-style:none;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--hf) 10%,transparent);display:flex;gap:10px}
  .vs .hero .card li:last-child{border:0}
  .vs .hero .card ul{margin:0;padding:0}
  .vs .dot{width:8px;height:8px;border-radius:50%;background:var(--a);margin-top:9px;flex:none}
  .vs .hero.banner:after{content:"";position:absolute;right:-120px;bottom:-160px;width:420px;height:420px;border-radius:50%;background:var(--a);opacity:.18}
  .vs section.blk{padding:72px 0}
  .vs .lbl{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--a);margin-bottom:10px}
  .vs h2{font-size:clamp(26px,3.6vw,38px);margin-bottom:14px}
  .vs .lead{color:var(--mu);font-size:17px;max-width:680px}
  .vs .grid{display:grid;gap:16px;margin-top:30px}
  @media(min-width:640px){.vs .grid{grid-template-columns:repeat(2,1fr)}}
  @media(min-width:960px){.vs .grid.g3{grid-template-columns:repeat(3,1fr)}}
  .vs .item{background:var(--sf);border:1px solid color-mix(in srgb,var(--fg) 9%,transparent);border-radius:var(--r);padding:22px}
  .vs .item h3{font-size:19px;font-family:${t.bodyFont};font-weight:700;text-transform:none;letter-spacing:0}
  .vs .item p{color:var(--mu);margin:6px 0 0;font-size:15px}
  .vs .alt{background:var(--sf)}
  .vs .alt .item{background:var(--bg)}
  .vs details{background:var(--sf);border:1px solid color-mix(in srgb,var(--fg) 9%,transparent);border-radius:var(--r);padding:16px 20px;margin-top:10px}
  .vs summary{cursor:pointer;font-weight:700}
  .vs .contact{display:grid;gap:24px}
  @media(min-width:860px){.vs .contact{grid-template-columns:1fr 1.2fr}}
  .vs .map{width:100%;height:320px;border:0;border-radius:var(--r);background:var(--sf)}
  .vs .kv{margin:0;padding:0}.vs .kv li{list-style:none;padding:12px 0;border-bottom:1px solid color-mix(in srgb,var(--fg) 10%,transparent)}
  .vs .kv b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mu)}
  .vs footer{background:var(--hb);color:var(--hf);padding:32px 0;font-size:14px}
  .vs footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;opacity:.8}
  .vs .fab{position:fixed;right:18px;bottom:18px;z-index:30;width:58px;height:58px;border-radius:50%;background:#25D366;display:grid;place-items:center;box-shadow:0 10px 30px rgba(0,0,0,.25)}
  .vs .fab svg{width:30px;height:30px}
  .vs :focus-visible{outline:3px solid var(--a);outline-offset:2px}
  `;

  return (
    <div className="vs">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {demo && (
        <div className="demo" role="note">
          <b>Demonstração</b> — prévia independente criada para apresentação. Não é o site oficial e não foi aprovada pelo estabelecimento.{demoNote ? ` ${demoNote}` : ""}
        </div>
      )}
      <header className="top">
        <div className="wrap">
          <a href="#inicio" className="brand">{c.businessName}</a>
          {wa && <a className="btn sm" href={wa} target="_blank" rel="noopener">{c.ctaLabel}</a>}
        </div>
      </header>

      <section id="inicio" className={`hero ${t.heroLayout}`}>
        <div className="wrap">
          <div>
            <span className="eyebrow">{c.tagline}{place ? ` · ${c.contact.city}` : ""}</span>
            <h1>{c.heroTitle}</h1>
            <p>{c.heroSubtitle}</p>
            <div className="ctas">
              {wa && <a className="btn" href={wa} target="_blank" rel="noopener">{c.ctaLabel}</a>}
              {c.services.length > 0 && <a className="btn ghost" href="#servicos">Ver serviços</a>}
            </div>
          </div>
          {t.heroLayout === "split" && c.highlights.length > 0 && (
            <div className="card">
              <ul>
                {c.highlights.slice(0, 4).map((h) => (
                  <li key={h.title}><span className="dot" /><span><b>{h.title}</b><br /><span style={{ opacity: 0.75, fontSize: 14 }}>{h.description}</span></span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {t.heroLayout !== "split" && c.highlights.length > 0 && (
        <section className="blk alt" aria-label="Destaques" style={{ padding: "36px 0" }}>
          <div className="wrap"><div className="grid g3" style={{ marginTop: 0 }}>
            {c.highlights.slice(0, 3).map((h) => <div className="item" key={h.title}><h3>{h.title}</h3><p>{h.description}</p></div>)}
          </div></div>
        </section>
      )}

      <section className="blk" id="sobre">
        <div className="wrap">
          <div className="lbl">Sobre</div>
          <h2>{c.businessName}</h2>
          <p className="lead">{c.about}</p>
        </div>
      </section>

      {c.services.length > 0 && (
        <section className="blk alt" id="servicos">
          <div className="wrap">
            <div className="lbl">Serviços</div>
            <h2>O que oferecemos</h2>
            <div className="grid g3">
              {c.services.map((s) => (
                <div className="item" key={s.name}><h3>{s.name}</h3>{s.description && <p>{s.description}</p>}</div>
              ))}
            </div>
            {wa && <div style={{ marginTop: 28 }}><a className="btn" href={wa} target="_blank" rel="noopener">{c.ctaLabel}</a></div>}
          </div>
        </section>
      )}

      {c.faq.length > 0 && (
        <section className="blk" id="duvidas">
          <div className="wrap" style={{ maxWidth: 820 }}>
            <div className="lbl">Dúvidas</div>
            <h2>Perguntas frequentes</h2>
            {c.faq.map((f) => <details key={f.question}><summary>{f.question}</summary><p style={{ margin: "10px 0 0", color: "var(--mu)" }}>{f.answer}</p></details>)}
          </div>
        </section>
      )}

      <section className="blk alt" id="contato">
        <div className="wrap contact">
          <div>
            <div className="lbl">Contato</div>
            <h2>Fale com a gente</h2>
            <ul className="kv">
              {c.contact.whatsapp && <li><b>WhatsApp</b><a href={wa} target="_blank" rel="noopener">{formatBrPhone(c.contact.whatsapp)}</a></li>}
              {!c.contact.whatsapp && c.contact.phone && <li><b>Telefone</b><a href={`tel:+${c.contact.phone}`}>{formatBrPhone(c.contact.phone)}</a></li>}
              {c.contact.address && <li><b>Endereço</b>{mapsLink ? <a href={mapsLink} target="_blank" rel="noopener">{c.contact.address}{place ? ` — ${place}` : ""}</a> : c.contact.address}</li>}
              {c.contact.openingHours && <li><b>Horário</b>{c.contact.openingHours}</li>}
              {c.contact.instagram && <li><b>Instagram</b><a href={`https://instagram.com/${c.contact.instagram}`} target="_blank" rel="noopener">@{c.contact.instagram}</a></li>}
              {c.contact.email && <li><b>E-mail</b><a href={`mailto:${c.contact.email}`}>{c.contact.email}</a></li>}
            </ul>
            {wa && <div style={{ marginTop: 22 }}><a className="btn" href={wa} target="_blank" rel="noopener">{c.ctaLabel}</a></div>}
          </div>
          {mapSrc ? <iframe className="map" src={mapSrc} title={`Mapa — ${c.businessName}`} loading="lazy" /> : <div className="map" aria-hidden />}
        </div>
      </section>

      <footer>
        <div className="wrap">
          <span>© {new Date().getFullYear()} {c.businessName}</span>
          <span>{place}</span>
        </div>
      </footer>

      {wa && (
        <a className="fab" href={wa} target="_blank" rel="noopener" aria-label="Falar no WhatsApp">
          <svg viewBox="0 0 32 32" fill="#fff" aria-hidden><path d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.2.6 4.4 1.7 6.3L3 29l7.3-1.9c1.8 1 3.8 1.5 5.8 1.5h0c7 0 12.7-5.7 12.7-12.6C28.7 8.6 23 3 16 3zm0 23.2c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.3 1.1 1.2-4.2-.3-.4a10.4 10.4 0 0 1-1.6-5.5C5.3 9.8 10.1 5 16 5s10.6 4.8 10.6 10.6S21.9 26.2 16 26.2zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.6-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.2 1.4 3.5c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.3 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>
        </a>
      )}
    </div>
  );
}
