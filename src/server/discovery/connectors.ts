import { z } from "zod";
import { env } from "../env";
import { segmentById, type SegmentId } from "./segments";

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

export type DiscoveryParams = { city: string; state: string; segment: SegmentId; limit?: number };

/* ----------------------------- OpenStreetMap ----------------------------- */
// Data © OpenStreetMap contributors, ODbL 1.0 — storage and reuse allowed with attribution.

export function buildOverpassQuery(p: DiscoveryParams) {
  const seg = segmentById(p.segment);
  const city = p.city.replace(/"/g, "");
  const parts = seg.osm.map((f) => `nwr${f}(area.a);`).join("\n  ");
  return `[out:json][timeout:90];
area["name"="${city}"]["boundary"="administrative"]["admin_level"="8"]->.a;
(
  ${parts}
);
out center tags ${Math.min(p.limit ?? 300, 1000)};`;
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

export async function fetchOsm(p: DiscoveryParams, fetchImpl: typeof fetch = fetch): Promise<Candidate[]> {
  const res = await fetchImpl(env().OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Vendlia/1.0 (prospecção B2B)" },
    body: "data=" + encodeURIComponent(buildOverpassQuery(p)),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Overpass respondeu ${res.status}`);
  const json = (await res.json()) as { elements?: OsmElement[] };
  return mapOsmElements(json.elements ?? [], p);
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

export async function fetchGooglePlaces(p: DiscoveryParams, fetchImpl: typeof fetch = fetch): Promise<Candidate[]> {
  const key = env().GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY não configurada");
  const seg = segmentById(p.segment);
  const all: unknown[] = [];
  let pageToken: string | undefined;
  const max = Math.min(p.limit ?? 60, 60);
  do {
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.businessStatus,places.location,places.regularOpeningHours.weekdayDescriptions,places.primaryTypeDisplayName,nextPageToken",
      },
      body: JSON.stringify({
        textQuery: `${seg.googleQuery} em ${p.city}, ${p.state}`,
        languageCode: "pt-BR",
        regionCode: "BR",
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Google Places respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { places?: unknown[]; nextPageToken?: string };
    all.push(...(json.places ?? []));
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
