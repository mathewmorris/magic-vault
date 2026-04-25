import { z } from "zod";
import { createEnv } from "@t3-oss/env-nextjs";

const isProd = process.env.NODE_ENV === "production";

/**
 * Mark a schema as required only in production, optional in preview/dev.
 * Mirrors the t3-env pattern that lets non-prod builds skip credentials.
 *
 * @template {z.ZodTypeAny} T
 * @param {T} schema
 * @returns {T | z.ZodOptional<T>}
 */
const prodRequired = (schema) => (isProd ? schema : schema.optional());

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z.enum(["development", "test", "production"]),
    NEXTAUTH_SECRET: prodRequired(z.string().min(1)),
    NEXTAUTH_URL: z.preprocess(
      // This makes Vercel deployments not fail if you don't set NEXTAUTH_URL
      // Since NextAuth.js automatically uses the VERCEL_URL if present.
      (str) => process.env.VERCEL_URL ?? str,
      // VERCEL_URL doesn't include `https` so it cant be validated as a URL
      process.env.VERCEL ? z.string().min(1) : z.string().url()
    ),
    // OAuth + email creds are required in production but optional in preview/dev
    // so PR previews don't need real credentials wired up to build.
    DISCORD_CLIENT_ID: prodRequired(z.string()),
    DISCORD_CLIENT_SECRET: prodRequired(z.string()),
    GITHUB_ID: prodRequired(z.string()),
    GITHUB_SECRET: prodRequired(z.string()),
    GOOGLE_ID: prodRequired(z.string()),
    GOOGLE_SECRET: prodRequired(z.string()),
    EMAIL_SERVER: prodRequired(z.string()),
    EMAIL_FROM: prodRequired(z.string().email()),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string().min(1),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
    GITHUB_ID: process.env.GITHUB_ID,
    GITHUB_SECRET: process.env.GITHUB_SECRET,
    GOOGLE_ID: process.env.GOOGLE_ID,
    GOOGLE_SECRET: process.env.GOOGLE_SECRET,
    EMAIL_SERVER: process.env.EMAIL_SERVER,
    EMAIL_FROM: process.env.EMAIL_FROM,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
   * This is especially useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
