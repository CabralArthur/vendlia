import { describe, expect, it } from "vitest";
import { fetchOsm, resolveCityArea, OSM_UNAVAILABLE } from "@/server/discovery/connectors";

const p = { city: "recife", state: "PE", segment: "barbearia" as const };
const ok = { elements: [{ type: "node", id: 1, tags: { name: "Barbearia X", shop: "hairdresser", phone: "81 99999-0000" } }] };
const nominatim = [
  { osm_type: "node", osm_id: 9, addresstype: "city" },
  { osm_type: "relation", osm_id: 303585, addresstype: "city", type: "administrative" },
];

function stub(overpass: (n: number, body: string) => Response) {
  const calls: { host: string; url: string; body?: string }[] = [];
  let n = 0;
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    calls.push({ host: u.host, url, body: init?.body ? decodeURIComponent(String(init.body)) : undefined });
    if (u.host === "nominatim.openstreetmap.org") return new Response(JSON.stringify(nominatim), { status: 200 });
    return overpass(n++, String(init?.body ?? ""));
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("OpenStreetMap search", () => {
  it("resolves the city to an Overpass area via Nominatim (state included)", async () => {
    const { f, calls } = stub(() => new Response("{}"));
    expect(await resolveCityArea(p, f)).toBe(3_600_303_585);
    expect(calls[0]!.url).toContain("state=Pernambuco");
    expect(calls[0]!.url).toContain("countrycodes=br");
  });

  it("queries only inside the resolved city and falls back across servers", async () => {
    const { f, calls } = stub((n) => (n === 0 ? new Response("busy", { status: 502 }) : new Response(JSON.stringify(ok))));
    const r = await fetchOsm(p, f, { retryDelayMs: 0 });
    expect(r).toHaveLength(1);
    const overpass = calls.filter((c) => c.host !== "nominatim.openstreetmap.org");
    expect(overpass).toHaveLength(2);
    expect(overpass[0]!.host).not.toBe(overpass[1]!.host);
    expect(overpass[1]!.body).toContain("area(id:3600303585)");
  });

  it("retries a second round and then shows a short message", async () => {
    const { f, calls } = stub(() => new Response("down", { status: 504 }));
    await expect(fetchOsm(p, f, { retryDelayMs: 0 })).rejects.toThrow(OSM_UNAVAILABLE);
    expect(calls.filter((c) => c.host !== "nominatim.openstreetmap.org")).toHaveLength(6);
  });
});
