import { z } from "zod";
import { env } from "../env";
import { segmentById, UF_NAME, type SegmentId } from "./segments";

export type Candidate = {
  source: "osm" | "google_places" | "csv" | "manual";
  externalId: string;
  license: string;
  restrictions?: string;
  expiresAt?: Date;
  payload: unknown;
  name: string;
  segment: SegmentId;
  category?: string;
  cnpj?: string;
  phone?: string;
  email?: string;
  website?: string;
  instagram?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  openingHours?: string;
  active?: boolean;
};

export type LogFn = (msg: string, level?: "info" | "ok" | "warn" | "error") => void | Promise<void>;
const noop: LogFn = () => {};

export type DiscoveryParams = { city: string; state: string; segment: SegmentId; limit?: number; neighborhood?: string };

/** Default/maximum companies per search. Kept low on purpose: fewer, better leads and lower Google cost. */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 60;

/* ----------------------------- OpenStreetMap ----------------------------- */
// Data © OpenStreetMap contributors, ODbL 1.0 — storage and reuse allowed with attribution.

const ACCENTS: Record<string, string> = { a: "aáàâã", e: "eéèê", i: "iíì", o: "oóòôõ", u: "uúùü", c: "cç" };

/** Regex that matches the city name ignoring case and accents ("sao paulo" → São Paulo). */
export function cityRegex(city: string) {
  const base = city.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  const body = [...base]
    .map((ch) => {
      if (ACCENTS[ch]) return `[${ACCENTS[ch]}]`;
      if (/[a-z0-9 ]/.test(ch)) return ch;
      return "\\" + ch; // escape regex metacharacters (e.g. "-", "'", ".")
    })
    .join("");
  return `^${body}$`;
}

/**
 * Overpass query for one segment inside a city.
 * With `areaId` (resolved via Nominatim) the query is cheap; without it we fall back to a
 * name match on municipality boundaries (accent/case-insensitive).
 */
export function buildOverpassQuery(p: DiscoveryParams, areaId?: number, bbox?: [number, number, number, number]) {
  const seg = segmentById(p.segment);
  const limit = Math.min(p.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  if (bbox) {
    const b = bbox.map((n) => n.toFixed(5)).join(",");
    const parts = seg.osm.map((f) => `nwr${f}(${b});`).join("\n  ");
    return `[out:json][timeout:60];
(
  ${parts}
);
out center tags ${limit};`;
  }
  const parts = seg.osm.map((f) => `nwr${f}(area.a);`).join("\n  ");
  const area = areaId
    ? `area(id:${areaId})->.a;`
    : `area["boundary"="administrative"]["admin_level"="8"]["name"~"${cityRegex(p.city)}",i]->.a;`;
  return `[out:json][timeout:60];
${area}
(
  ${parts}
);
out center tags ${limit};`;
}

/** Bounding box (south, west, north, east) of a neighborhood, widened to at least ~1.5 km. */
export async function resolveNeighborhoodBox(p: DiscoveryParams, fetchImpl: typeof fetch = fetch): Promise<[number, number, number, number] | null> {
  if (!p.neighborhood?.trim()) return null;
  const uf = p.state.trim().toUpperCase();
  const q = `${p.neighborhood.trim()}, ${p.city.trim()}, ${UF_NAME[uf] ?? uf}, Brasil`;
  try {
    const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, countrycodes: "br", format: "jsonv2", limit: "1" })}`, {
      headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "pt-BR" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { boundingbox?: string[]; lat: string; lon: string }[];
    if (!hit) return null;
    let [s, n, w, e] = (hit.boundingbox ?? [hit.lat, hit.lat, hit.lon, hit.lon]).map(Number) as [number, number, number, number];
    const minHalf = 0.0075; // ~800 m each side
    const cy = (s + n) / 2, cx = (w + e) / 2;
    if (n - s < minHalf * 2) [s, n] = [cy - minHalf, cy + minHalf];
    if (e - w < minHalf * 2) [w, e] = [cx - minHalf, cx + minHalf];
    return [s, w, n, e];
  } catch {
    return null;
  }
}

const UA = "Vendlia/1.0 (prospeccao B2B; https://github.com/CabralArthur/vendlia)";

/** Finds the municipality's OSM relation and returns its Overpass area id (3600000000 + relation id). */
export async function resolveCityArea(p: DiscoveryParams, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const uf = p.state.trim().toUpperCase();
  const params = new URLSearchParams({ city: p.city.trim(), state: UF_NAME[uf] ?? uf, countrycodes: "br", format: "jsonv2", limit: "5" });
  try {
    const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "pt-BR" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const list = (await res.json()) as { osm_type: string; osm_id: number; addresstype?: string; type?: string }[];
    const hit =
      list.find((r) => r.osm_type === "relation" && ["city", "town", "municipality", "village"].includes(r.addresstype ?? "")) ??
      list.find((r) => r.osm_type === "relation" && r.type === "administrative");
    return hit ? 3_600_000_000 + Number(hit.osm_id) : null;
  } catch {
    return null;
  }
}

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export function mapOsmElements(elements: OsmElement[], p: DiscoveryParams): Candidate[] {
  const out: Candidate[] = [];
  for (const el of elements) {
    const t = el.tags ?? {};
    if (!t.name) continue;
    if (t["disused:shop"] || t["disused:amenity"]) continue;
    const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
    const insta = t["contact:instagram"] ?? t.instagram;
    out.push({
      source: "osm",
      externalId: `${el.type}/${el.id}`,
      license: "ODbL 1.0 — © OpenStreetMap contributors",
      restrictions: "Atribuição obrigatória; base derivada sob ODbL.",
      payload: { type: el.type, id: el.id, tags: t },
      name: t.name,
      segment: p.segment,
      category: t.shop ?? t.amenity ?? t.craft ?? t.healthcare,
      phone: t.phone ?? t["contact:phone"] ?? t["contact:whatsapp"] ?? t.mobile ?? t["contact:mobile"],
      email: t.email ?? t["contact:email"],
      website: t.website ?? t["contact:website"] ?? t.url,
      instagram: insta ? normalizeInstagram(insta) : undefined,
      address: street || undefined,
      neighborhood: t["addr:suburb"] ?? t["addr:neighbourhood"] ?? t["addr:district"],
      city: t["addr:city"] ?? p.city,
      state: t["addr:state"]?.length === 2 ? t["addr:state"] : p.state,
      lat: el.lat ?? el.center?.lat,
      lng: el.lon ?? el.center?.lon,
      openingHours: t.opening_hours,
    });
  }
  return out;
}

const OVERPASS_MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

export const OSM_UNAVAILABLE = "O OpenStreetMap está sobrecarregado agora. Tente de novo em alguns minutos.";

/** Queries Overpass, falling back across public mirrors when one is busy (429/5xx/timeouts). */
export async function fetchOsm(p: DiscoveryParams, fetchImpl: typeof fetch = fetch, opts: { retryDelayMs?: number; log?: LogFn } = {}): Promise<Candidate[]> {
  const log = opts.log ?? noop;
  let bbox: [number, number, number, number] | null = null;
  if (p.neighborhood?.trim()) {
    await log(`Localizando o bairro ${p.neighborhood} em ${p.city}/${p.state.toUpperCase()}…`);
    bbox = await resolveNeighborhoodBox(p, fetchImpl);
    await log(bbox ? "Bairro encontrado. Buscando empresas na região dele." : "Não achei o bairro; buscando na cidade inteira.", bbox ? "ok" : "warn");
  }
  let areaId: number | null = null;
  if (!bbox) {
    await log(`Localizando ${p.city}/${p.state.toUpperCase()} no mapa…`);
    areaId = await resolveCityArea(p, fetchImpl);
    await log(areaId ? "Cidade encontrada. Buscando empresas só dentro dela." : "Não achei a cidade exata; buscando pelo nome do município.", areaId ? "ok" : "warn");
  }
  const body = "data=" + encodeURIComponent(buildOverpassQuery(p, areaId ?? undefined, bbox ?? undefined));
  const mirrors = [...new Set([env().OVERPASS_URL, ...OVERPASS_MIRRORS])];
  // Two rounds across all mirrors, with a pause in between: public servers are often busy for a few seconds.
  const attempts = [...mirrors, ...mirrors];
  const errors: string[] = [];
  for (let n = 0; n < attempts.length; n++) {
    if (n === mirrors.length) {
      await log("Todos os servidores estão ocupados. Nova tentativa em alguns segundos…", "warn");
      await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 8_000));
    }
    const url = attempts[n]!;
    const host = new URL(url).host;
    await log(`Consultando o servidor ${host}…`);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": UA },
        body,
        signal: AbortSignal.timeout(75_000),
      });
      if (!res.ok) {
        errors.push(`${host}: HTTP ${res.status}`);
        await log(`${host} respondeu com erro (HTTP ${res.status}). Tentando outro servidor…`, "warn");
        continue;
      }
      const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
      if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark) && !json.elements?.length) {
        errors.push(`${host}: ${json.remark.slice(0, 120)}`);
        await log(`${host} não conseguiu concluir a consulta. Tentando outro servidor…`, "warn");
        continue;
      }
      const found = mapOsmElements(json.elements ?? [], p);
      await log(`${found.length} ${found.length === 1 ? "empresa recebida" : "empresas recebidas"} do OpenStreetMap.`, "ok");
      return found;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      errors.push(`${host}: ${m}`.slice(0, 160));
      await log(/abort|timeout/i.test(m) ? `${host} demorou demais para responder. Tentando outro servidor…` : `Falha ao falar com ${host}. Tentando outro servidor…`, "warn");
    }
  }
  console.error("[discovery] OpenStreetMap falhou", { city: p.city, state: p.state, areaId, errors });
  throw new Error(OSM_UNAVAILABLE);
}

/* --------------------------- Google Places (New) -------------------------- */
// Terms: place_id can be stored indefinitely; other content may be cached for at most 30 days.

const placeSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  internationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
  businessStatus: z.string().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  regularOpeningHours: z.object({ weekdayDescriptions: z.array(z.string()).optional() }).optional(),
  primaryTypeDisplayName: z.object({ text: z.string() }).optional(),
});

export function mapGooglePlaces(places: unknown[], p: DiscoveryParams): Candidate[] {
  const expiresAt = new Date(Date.now() + 30 * 86400_000);
  const out: Candidate[] = [];
  for (const raw of places) {
    const parsed = placeSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.displayName?.text) continue;
    const pl = parsed.data;
    out.push({
      source: "google_places",
      externalId: pl.id,
      license: "Google Maps Platform Terms",
      restrictions: "Conteúdo (exceto place_id) só pode ficar em cache por até 30 dias.",
      expiresAt,
      payload: { id: pl.id },
      name: pl.displayName!.text,
      segment: p.segment,
      category: pl.primaryTypeDisplayName?.text,
      phone: pl.internationalPhoneNumber ?? pl.nationalPhoneNumber,
      website: pl.websiteUri,
      address: pl.formattedAddress,
      city: p.city,
      state: p.state,
      lat: pl.location?.latitude,
      lng: pl.location?.longitude,
      openingHours: pl.regularOpeningHours?.weekdayDescriptions?.join("; "),
      active: pl.businessStatus ? pl.businessStatus === "OPERATIONAL" : true,
    });
  }
  return out;
}

export async function fetchGooglePlaces(p: DiscoveryParams, fetchImpl: typeof fetch = fetch, log: LogFn = noop): Promise<Candidate[]> {
  const key = env().GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY não configurada");
  const seg = segmentById(p.segment);
  const all: unknown[] = [];
  let pageToken: string | undefined;
  const max = Math.min(p.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  let page = 0;
  do {
    page++;
    await log(`Consultando o Google Maps (página ${page})…`);
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.businessStatus,places.location,places.regularOpeningHours.weekdayDescriptions,places.primaryTypeDisplayName,nextPageToken",
      },
      body: JSON.stringify({
        textQuery: `${seg.googleQuery} em ${p.neighborhood?.trim() ? `${p.neighborhood.trim()}, ` : ""}${p.city}, ${p.state}`,
        languageCode: "pt-BR",
        regionCode: "BR",
        pageSize: Math.min(20, max - all.length),
        ...(pageToken ? { pageToken } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error("[discovery] Google Places", res.status, detail);
      throw new Error(
        res.status === 403 || res.status === 401
          ? "O Google recusou a chave. Confira se a Places API (New) está ativada e se a chave tem permissão para ela."
          : res.status === 429
            ? "Limite de uso do Google atingido. Tente de novo mais tarde."
            : `O Google Maps respondeu com erro (${res.status}). Tente de novo em alguns minutos.`,
      );
    }
    const json = (await res.json()) as { places?: unknown[]; nextPageToken?: string };
    all.push(...(json.places ?? []));
    await log(`${json.places?.length ?? 0} empresas recebidas na página ${page}.`, "ok");
    pageToken = json.nextPageToken;
  } while (pageToken && all.length < max);
  return mapGooglePlaces(all.slice(0, max), p);
}

/* ---------------------------------- CSV ---------------------------------- */

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const delim = (text.split("\n")[0] ?? "").split(";").length > (text.split("\n")[0] ?? "").split(",").length ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  const keys = header.map((h) =>
    h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_"),
  );
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const pick = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (r[k]) return r[k];
  return undefined;
};

export function mapCsvRows(rows: Record<string, string>[], defaults: { city?: string; state?: string; segment: SegmentId }): Candidate[] {
  return rows
    .map((r, i): Candidate | null => {
      const name = pick(r, "nome", "name", "empresa", "razao_social", "nome_fantasia");
      if (!name) return null;
      const seg = pick(r, "segmento", "segment");
      const insta = pick(r, "instagram");
      return {
        source: "csv",
        externalId: pick(r, "cnpj", "id") ?? `${name}|${pick(r, "telefone", "phone", "whatsapp") ?? i}`,
        license: "Fornecido pelo operador (origem declarada na importação)",
        payload: r,
        name,
        segment: (seg && segmentById(seg).id === seg ? seg : defaults.segment) as SegmentId,
        cnpj: pick(r, "cnpj"),
        phone: pick(r, "whatsapp", "telefone", "phone", "celular"),
        email: pick(r, "email", "e-mail"),
        website: pick(r, "site", "website"),
        instagram: insta ? normalizeInstagram(insta) : undefined,
        address: pick(r, "endereco", "address"),
        neighborhood: pick(r, "bairro", "neighborhood"),
        city: pick(r, "cidade", "city", "municipio") ?? defaults.city,
        state: (pick(r, "uf", "estado", "state") ?? defaults.state)?.toUpperCase().slice(0, 2),
        openingHours: pick(r, "horario", "horarios"),
      };
    })
    .filter((c): c is Candidate => c !== null);
}

/* -------------------------------- Helpers -------------------------------- */

export function normalizeInstagram(v: string) {
  const m = v.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  const handle = (m?.[1] ?? v).replace(/^@/, "").replace(/\/$/, "").trim();
  return /^[A-Za-z0-9_.]{1,30}$/.test(handle) ? handle : undefined;
}

const SOCIAL = /(instagram\.com|facebook\.com|fb\.com|linktr\.ee|wa\.me|api\.whatsapp|whatsapp\.com|ifood\.com|tiktok\.com|goo\.gl|maps\.app|bio\.link|linkbio|beacons\.ai)/i;

export function classifyWebsite(url: string | null | undefined): "none_in_source" | "social_only" | "has_website" {
  if (!url || !url.trim()) return "none_in_source";
  return SOCIAL.test(url) ? "social_only" : "has_website";
}
