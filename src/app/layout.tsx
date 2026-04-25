import { type Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Analytics } from "@vercel/analytics/react";

import AuthButton from "~/components/AuthButton";
import { getServerAuthSession } from "~/server/auth";
import "~/styles/globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Magic Vault",
  description:
    "A web app for managing and playtesting your Magic the Gathering card collection.",
  icons: { icon: "/favicon.ico" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  return (
    <html lang="en">
      <body>
        <Providers session={session}>
          <main className="min-h-screen dark:bg-gray-900 dark:text-white">
            <nav className="p-4 dark:bg-gray-950">
              <div className="container mx-auto">
                <div className="flex justify-between items-center">
                  <Link href="/" className="dark:hover:drop-shadow-glow">
                    <div className="flex items-center gap-4">
                      <Image
                        src="/magicvault-logo.png"
                        alt="Logo: 8-bit image with a purple circle"
                        width={50}
                        height={50}
                      />
                      <span className="text-2xl">Magic Vault</span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/about"
                      className="dark:hover:drop-shadow-glow font-semibold"
                    >
                      <span className="mx-2">About</span>
                    </Link>
                    <AuthButton />
                  </div>
                </div>
              </div>
            </nav>
            <div className="container mx-auto py-8">{children}</div>
            <Analytics />
          </main>
        </Providers>
      </body>
    </html>
  );
}
