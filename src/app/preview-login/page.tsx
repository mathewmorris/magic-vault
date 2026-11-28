import { type Metadata } from "next";
import { notFound } from "next/navigation";

import { mutedText, panel, primaryAction } from "~/components/home/styles";
import { isPreviewLoginEnabled } from "~/server/previewLogin/enabled";
import { TEST_USERS } from "~/server/previewLogin/testUsers";

// Reads VERCEL_ENV on every request, never at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pick a test user | Magic Vault preview",
  robots: { index: false, follow: false },
};

/** Preview deploys only: sign in as one of four test users with one tap. */
export default function PreviewLoginPage() {
  if (!isPreviewLoginEnabled()) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Pick a test user</h1>
        <p className={mutedText}>
          This is a preview build, so real sign-in is off. Pick someone and you&apos;ll land on their dashboard.
          Production never shows this page.
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {TEST_USERS.map((user) => (
          <li key={user.id} className={panel}>
            <form method="post" action="/api/preview-login" className="flex h-full flex-col gap-3">
              <input type="hidden" name="userId" value={user.id} />
              <div className="flex-1 space-y-1">
                <h2 className="text-xl font-semibold">{user.name}</h2>
                <p className={`text-sm ${mutedText}`}>{user.blurb}</p>
              </div>
              <button type="submit" className={primaryAction}>
                Sign in as {user.name.split(" ")[0]}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
