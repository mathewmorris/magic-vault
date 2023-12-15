import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import Link from "next/link";
import { type AppType } from "next/app";

import { api } from "~/utils/api";

import "~/styles/globals.css";
import AuthButton from "~/components/AuthButton";
import Head from "next/head";

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
      <main className="min-h-screen dark:bg-purple-950 dark:text-white">
        <nav className="p-4 dark:bg-purple-500">
          <div className="container mx-auto">
            <div className="flex justify-between">
              <div className="font-bold">Magic Vault</div>
              <div>
                <Link href="/">
                    <span className="mx-2">Home</span>
                </Link>
                <Link href="/about">
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
