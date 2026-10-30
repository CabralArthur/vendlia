import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteRender, jsonLd } from "@/sites/render";
import { canonicalFor, countView, resolveBySlug } from "@/sites/load";

type P = { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string; embed?: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const { slug } = await params;
  const { k } = await searchParams;
  const r = await resolveBySlug(slug, k);
  if (!r) return { title: "Página não encontrada", robots: { index: false } };
  return {
    title: { absolute: r.content.seo.title },
    description: r.content.seo.description,
    robots: r.demo ? { index: false, follow: false } : { index: true, follow: true },
    alternates: r.demo ? undefined : { canonical: canonicalFor(r) },
    openGraph: { title: r.content.seo.title, description: r.content.seo.description, type: "website", locale: "pt_BR" },
  };
}

export default async function SitePage({ params, searchParams }: P) {
  const { slug } = await params;
  const { k, embed } = await searchParams;
  const r = await resolveBySlug(slug, k);
  if (!r) notFound();
  if (!embed) await countView(r.siteId);
  return (
    <>
      {!r.demo && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(r.content)).replace(/</g, "\\u003c") }} />}
      <SiteRender content={r.content} template={r.template} accent={r.accent} demo={r.demo} />
    </>
  );
}
