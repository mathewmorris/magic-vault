import { type Session } from "next-auth";
import { type AppType } from "next/app";

import { SessionProvider } from "next-auth/react";
import Link from "next/link";
import Head from "next/head";
import Image from "next/image";
import { Analytics } from "@vercel/analytics/react";

import { api } from "~/utils/api";
import "~/styles/globals.css";
import AuthButton from "~/components/AuthButton";

const MagicVault: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <SessionProvider session={session}>
      <Head>
        <title>Magic Vault</title>
        <meta name="description" content="A web app for managing and playtesting your Magic the Gathering card collection." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="min-h-screen dark:bg-gray-900 dark:text-white">
        <nav className="p-4 dark:bg-gray-950">
          <div className="container mx-auto">
            <div className="flex justify-between items-center">
              <Link href="/" className="dark:hover:drop-shadow-glow">
                <div className="flex items-center gap-4">
                  <Image src="/magicvault-logo.png" alt="Logo: 8-bit image with a purple circle" width={50} height={50} />
                  <span className="text-2xl">Magic Vault</span>
                </div>
              </Link>
              <div className="flex items-center gap-2">
                <Link href="/about" className="dark:hover:drop-shadow-glow font-semibold">
                  <span className="mx-2">About</span>
                </Link>
                <AuthButton />
              </div>
            </div>
          </div>
        </nav>
        <div className="container mx-auto py-8">
          <Component {...pageProps} />
        </div>
        <Analytics />
      </main>
    </SessionProvider>
  );
};

export default api.withTRPC(MagicVault);

