import { NextResponse } from "next/server";

import { prisma } from "~/server/db";
import { isPreviewLoginEnabled } from "~/server/previewLogin/enabled";
import { previewSignIn, sessionCookieName } from "~/server/previewLogin/signIn";

// Reads VERCEL_ENV on every request, never at build time.
export const dynamic = "force-dynamic";

const notFound = () => new NextResponse("Not Found", { status: 404 });

/** Visiting the API directly goes to the picker on previews, 404 elsewhere. */
export function GET(req: Request) {
  if (!isPreviewLoginEnabled()) return notFound();
  return NextResponse.redirect(new URL("/preview-login", req.url), 303);
}

/** Signs in as the picked test user and lands on their dashboard. */
export async function POST(req: Request) {
  if (!isPreviewLoginEnabled()) return notFound();

  let userId: unknown;
  try {
    userId = (await req.formData()).get("userId");
  } catch {
    userId = undefined;
  }

  const result = await previewSignIn(prisma, userId);
  if (result.status === "disabled") return notFound();
  if (result.status === "unknown-user") return new NextResponse("Unknown test user", { status: 400 });

  const url = new URL("/", req.url);
  const response = NextResponse.redirect(url, 303);
  const secure = url.protocol === "https:";
  response.cookies.set(sessionCookieName(secure), result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires: result.expires,
  });
  return response;
}
