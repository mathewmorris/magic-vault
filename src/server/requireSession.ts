import { redirect } from "next/navigation";

import { getServerAuthSession } from "~/server/auth";

/**
 * For server components on signed-in-only pages. Sends signed-out visitors to
 * the sign-in page, then back to `callbackUrl` once they've signed in.
 */
export async function requireSession(callbackUrl: string) {
  const session = await getServerAuthSession();

  if (!session) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return session;
}
