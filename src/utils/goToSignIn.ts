import { signInHref } from "~/utils/signInHref";

type SignInLocation = Pick<Location, "href" | "assign">;

/**
 * Send the browser to the sign-in page and come back here afterwards.
 *
 * next-auth's client `signIn()` does the same thing when there are providers,
 * but with none configured (Vercel previews) it gives up and opens the error
 * page instead. Going through /api/auth/signin works either way: production
 * gets the normal sign-in page and previews get the test user picker.
 */
export function goToSignIn(location: SignInLocation = window.location): void {
  location.assign(signInHref(location.href));
}
