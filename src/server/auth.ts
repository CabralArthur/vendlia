import { TRIAL_DAYS } from "@/lib/plans";
import { env } from "./env";
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db, sessions, users, memberships, organizations } from "./db";
import { randomToken } from "@/lib/text";
import { defaultOrgSettings } from "./org";

const COOKIE = "vendlia_session";
const SESSION_DAYS = 30;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}

export async function createSession(userId: string, orgId: string) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id: hash(token), userId, orgId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, hash(token)));
  jar.delete(COOKIE);
}

export type SessionCtx = {
  userId: string;
  orgId: string;
  role: "owner" | "admin" | "operator";
  user: { name: string; email: string };
  org: { name: string; slug: string };
};

export const getSession = cache(async (): Promise<SessionCtx | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({
      userId: sessions.userId,
      orgId: sessions.orgId,
      role: memberships.role,
      userName: users.name,
      email: users.email,
      orgName: organizations.name,
      orgSlug: organizations.slug,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(memberships, and(eq(memberships.userId, sessions.userId), eq(memberships.orgId, sessions.orgId)))
    .innerJoin(organizations, eq(organizations.id, sessions.orgId))
    .where(and(eq(sessions.id, hash(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    userId: r.userId,
    orgId: r.orgId,
    role: r.role,
    user: { name: r.userName, email: r.email },
    org: { name: r.orgName, slug: r.orgSlug },
  };
});

export async function requireSession(): Promise<SessionCtx> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireRole(...roles: SessionCtx["role"][]) {
  const s = await requireSession();
  if (!roles.includes(s.role)) throw new Error("Permissão insuficiente");
  return s;
}

export async function verifyLogin(email: string, password: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  if (!u) {
    await bcrypt.compare(password, "$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
    return null;
  }
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return null;
  const [m] = await db.select().from(memberships).where(eq(memberships.userId, u.id)).limit(1);
  if (!m) return null;
  return { userId: u.id, orgId: m.orgId };
}

export async function registerOwner(input: { name: string; email: string; password: string; orgName: string }) {
  const email = input.email.toLowerCase().trim();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw new Error("Este e-mail já está cadastrado.");
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ email, name: input.name.trim(), passwordHash, termsAcceptedAt: new Date() }).returning();
    const owner = env()
      .OWNER_EMAILS.split(",")
      .map((x) => x.trim().toLowerCase())
      .includes(email);
    const slugBase = input.orgName.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const [o] = await tx
      .insert(organizations)
      .values({
        name: input.orgName.trim(),
        slug: `${slugBase || "org"}-${randomToken(3).toLowerCase()}`,
        settings: defaultOrgSettings(),
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        ...(owner ? { unlimited: true, plan: "agencia" as const, billingStatus: "active" as const } : {}),
      })
      .returning();
    await tx.insert(memberships).values({ userId: u!.id, orgId: o!.id, role: "owner" });
    return { userId: u!.id, orgId: o!.id };
  });
}
