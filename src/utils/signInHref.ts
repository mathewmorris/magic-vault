/**
 * Link to the sign-in page that comes back to `callbackUrl` afterwards, the
 * same way requireSession sends signed-out visitors on server pages.
 */
export function signInHref(callbackUrl: string): string {
  return `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
