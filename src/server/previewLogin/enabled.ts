/**
 * The pick-a-test-user login only exists on Vercel preview deploys.
 *
 * Vercel sets NODE_ENV=production on previews too, so VERCEL_ENV is the only
 * reliable signal. Production (VERCEL_ENV=production), local dev, local
 * production builds and the homelab all leave it unset or set to something
 * else, so the login is off there.
 */
export function isPreviewLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "preview";
}
