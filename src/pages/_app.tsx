import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import Link from "next/link";
import { type AppType } from "next/app";

import { api } from "~/utils/api";

import "~/styles/globals.css";
import AuthButton from "~/components/AuthButton";
import Head from "next/head";
import Image from "next/image";

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <SessionProvider session={session}>
      <Head>
        <title>magicvault</title>
        <meta name="description" content="A web app for managing and playtesting your Magic the Gathering card collection." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="min-h-screen dark:bg-gray-900 dark:text-white">
        <nav className="p-4 dark:bg-gray-950">
          <div className="container mx-auto">
            <div className="flex justify-between items-center">
              <Link href="/" className="dark:hover:drop-shadow-glow">
                <Image src="/magicvault-logo.png" alt="Logo: 8-bit image with a purple circle"  width={50} height={50} />
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
        <Component {...pageProps} />
      </main>
    </SessionProvider>
  );
};

export default api.withTRPC(MyApp);
