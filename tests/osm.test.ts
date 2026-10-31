import { describe, expect, it } from "vitest";
import { fetchOsm } from "@/server/discovery/connectors";

const p = { city: "Recife", state: "PE", segment: "barbearia" as const };
const ok = { elements: [{ type: "node", id: 1, tags: { name: "Barbearia X", shop: "hairdresser", phone: "81 99999-0000" } }] };

describe("OpenStreetMap fallback", () => {
  it("falls back to the next server when one is busy", async () => {
    const hits: string[] = [];
    const f = (async (url: string) => {
      hits.push(new URL(url).host);
      if (hits.length === 1) return new Response("busy", { status: 429 });
      return new Response(JSON.stringify(ok), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await fetchOsm(p, f);
    expect(r).toHaveLength(1);
    expect(hits).toHaveLength(2);
    expect(hits[0]).not.toBe(hits[1]);
  });
  it("explains when every server fails", async () => {
    const f = (async () => new Response("down", { status: 504 })) as unknown as typeof fetch;
    await expect(fetchOsm(p, f)).rejects.toThrow(/indisponível/);
  });
});
