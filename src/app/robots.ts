import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: ["/dashboard", "/leads", "/inbox", "/api/", "/settings", "/studio", "/discovery", "/onboarding"] }] };
}
