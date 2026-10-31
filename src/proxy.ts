import { NextResponse, type NextRequest } from "next/server";

/**
 * Multi-tenant routing: requests whose Host is not the app's own host are customer sites
 * (wildcard <slug>.SITES_BASE_DOMAIN or a custom domain) and get rewritten to /hosted/<host>.
 */
export function proxy(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase().split(",")[0]!.trim();
  const appHost = (() => {
    try {
      return new URL(process.env.APP_URL ?? "http://localhost:3000").host.toLowerCase();
    } catch {
      return "localhost:3000";
    }
  })();
  const isApp =
    host === appHost ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".up.railway.app") ||
    host.endsWith(".railway.internal") ||
    !host;
  const { pathname } = req.nextUrl;
  // Health checks (Railway probes with its own Host) and webhooks must work on any host.
  if (isApp || pathname.startsWith("/api/")) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/icon.svg" || pathname === "/robots.txt") return NextResponse.next();
  if (pathname === "/" || pathname === "") {
    const url = req.nextUrl.clone();
    url.pathname = `/hosted/${encodeURIComponent(host)}`;
    return NextResponse.rewrite(url);
  }
  return new NextResponse("Not found", { status: 404 });
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
