import { type Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Analytics } from "@vercel/analytics/react";

import AuthButton from "~/components/AuthButton";
import SupportLink from "~/components/SupportLink";
import { env } from "~/env";
import { getServerAuthSession } from "~/server/auth";
import "~/styles/globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Magic Vault",
  description:
    "A web app for managing and playtesting your Magic the Gathering card collection.",
  icons: { icon: "/favicon.ico" },
};

type NavLink = { href: string; label: string };

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  // Signed-out users only see public pages plus the Sign in button. New
  // signed-in pages (like Scan) get added to the signed-in list.
  const navLinks: NavLink[] = session
    ? [
        { href: "/", label: "Home" },
        { href: "/search", label: "Search" },
        { href: "/collections", label: "My Collections" },
        { href: "/scan", label: "Scan" },
        { href: "/about", label: "About" },
      ]
    : [
        { href: "/", label: "Home" },
        { href: "/search", label: "Search" },
        { href: "/about", label: "About" },
      ];

  return (
    <html lang="en">
      <body>
        <Providers session={session}>
          <main className="min-h-screen dark:bg-gray-900 dark:text-white">
            <nav className="p-4 dark:bg-gray-950">
              <div className="container mx-auto flex flex-wrap items-center justify-between gap-4">
                <Link href="/" className="dark:hover:drop-shadow-glow">
                  <div className="flex items-center gap-3">
                    <Image
                      src="/magicvault-logo.png"
                      alt="Logo: 8-bit image with a purple circle"
                      width={40}
                      height={40}
                    />
                    <span className="text-xl sm:text-2xl">Magic Vault</span>
                  </div>
                </Link>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold sm:text-base">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="dark:hover:drop-shadow-glow"
                    >
                      {link.label}
                    </Link>
                  ))}
                  <AuthButton />
                </div>
              </div>
            </nav>
            <div className="container mx-auto py-8">{children}</div>
            {env.NEXT_PUBLIC_DONATION_URL && (
              <footer className="p-4 text-sm font-semibold dark:bg-gray-950">
                <div className="container mx-auto flex justify-center">
                  <SupportLink href={env.NEXT_PUBLIC_DONATION_URL} />
                </div>
              </footer>
            )}
            <Analytics />
          </main>
        </Providers>
      </body>
    </html>
  );
}
