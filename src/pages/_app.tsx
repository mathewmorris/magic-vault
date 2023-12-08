import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import Link from "next/link";
import { type AppType } from "next/app";

import { api } from "~/utils/api";

import "~/styles/globals.css";
import AuthButton from "~/components/AuthButton";

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <SessionProvider session={session}>
      
    <div className="dark:bg-slate-800 min-h-screen dark:text-slate-50">
      <nav className="bg-violet-800 p-4">
        <div className="container mx-auto">
          <div className="flex justify-between">
            <div className="text-white font-bold">Magic Vault</div>
            <div>
              <Link href="/">
                  <span className="text-white mx-2">Home</span>
              </Link>
              <Link href="/about">
                  <span className="text-white mx-2">About</span>
              </Link>
              <AuthButton />
            </div>
          </div>
        </div>
      </nav>
      <Component {...pageProps} />
    </div>
    </SessionProvider>
  );
};

export default api.withTRPC(MyApp);
