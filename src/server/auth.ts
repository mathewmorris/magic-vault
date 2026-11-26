import { PrismaAdapter } from "@next-auth/prisma-adapter";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import EmailProvider from "next-auth/providers/email";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { type Provider } from "next-auth/providers/index";

import { env } from "~/env";
import { prisma } from "~/server/db";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: DefaultSession["user"] & {
      id: string;
      // ...other properties
      // role: UserRole;
    };
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
      },
    }),
  },
  adapter: PrismaAdapter(prisma),
  providers: buildProviders(),
};

/**
 * Only turn on a provider when it has credentials. The homelab deploy signs in
 * by email alone, and a provider with empty credentials would still show a
 * sign-in button that can't work.
 */
function buildProviders(): Provider[] {
  const providers: Provider[] = [];

  if (env.EMAIL_SERVER && env.EMAIL_FROM) {
    providers.push(
      EmailProvider({
        server: env.EMAIL_SERVER,
        from: env.EMAIL_FROM,
      }),
    );
  }

  if (env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET) {
    providers.push(
      DiscordProvider({
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        // NextAuth's default Discord button puts the blurple logo from
        // authjs.dev on a blurple background, so the icon disappears. A white
        // button with Discord-colored text keeps the logo visible.
        style: {
          logo: "/discord.svg",
          bg: "#fff",
          text: "#5865F2",
        },
      }),
    );
  }

  if (env.GITHUB_ID && env.GITHUB_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: env.GITHUB_ID,
        clientSecret: env.GITHUB_SECRET,
      }),
    );
  }

  if (env.GOOGLE_ID && env.GOOGLE_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: env.GOOGLE_ID,
        clientSecret: env.GOOGLE_SECRET,
      }),
    );
  }

  return providers;
}

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = () => getServerSession(authOptions);
