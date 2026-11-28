import { randomBytes } from "node:crypto";

import { type PrismaClient } from "@prisma/client";

import { isPreviewLoginEnabled } from "./enabled";
import { ensureTestUser, findTestUser } from "./testUsers";

/** Preview sessions last a week. */
export const PREVIEW_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * NextAuth's database-session cookie. NextAuth adds the __Secure- prefix
 * whenever the site runs on https, which every Vercel deploy does.
 */
export function sessionCookieName(secure: boolean): string {
  return `${secure ? "__Secure-" : ""}next-auth.session-token`;
}

export type PreviewSignInResult =
  | { status: "disabled" }
  | { status: "unknown-user" }
  | { status: "ok"; sessionToken: string; expires: Date };

/**
 * Sign in as one of the fixed test users by writing a NextAuth session row,
 * the same row NextAuth writes after a real sign-in. Does nothing unless the
 * preview login is on, and only accepts the ids in TEST_USERS.
 */
export async function previewSignIn(
  prisma: PrismaClient,
  userId: unknown,
  env: Record<string, string | undefined> = process.env,
): Promise<PreviewSignInResult> {
  if (!isPreviewLoginEnabled(env)) return { status: "disabled" };

  const testUser = findTestUser(userId);
  if (!testUser) return { status: "unknown-user" };

  await ensureTestUser(prisma, testUser);

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + PREVIEW_SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.session.create({ data: { sessionToken, userId: testUser.id, expires } });

  return { status: "ok", sessionToken, expires };
}
