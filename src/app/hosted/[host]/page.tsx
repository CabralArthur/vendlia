import "@/sites/fonts.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteRender, jsonLd } from "@/sites/render";
import { canonicalFor, countView, resolveByHost } from "@/sites/load";

type P = { params: Promise<{ host: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { host } = await params;
  const r = await resolveByHost(decodeURIComponent(host));
  if (!r) return { title: "Site não encontrado", robots: { index: false } };
  return {
    title: { absolute: r.content.seo.title },
    description: r.content.seo.description,
    alternates: { canonical: canonicalFor(r) },
    openGraph: { title: r.content.seo.title, description: r.content.seo.description, type: "website", locale: "pt_BR" },
  };
}

export default async function HostedSite({ params }: P) {
  const { host } = await params;
  const r = await resolveByHost(decodeURIComponent(host));
  if (!r || r.demo) notFound();
  await countView(r.siteId);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(r.content)).replace(/</g, "\\u003c") }} />
      <SiteRender content={r.content} template={r.template} accent={r.accent} demo={false} />
    </>
  );
}
