import { z } from "zod";
import { createEnv } from "@t3-oss/env-nextjs";

// Vercel sets NODE_ENV=production for both preview and production builds,
// so VERCEL_ENV is the only reliable way to distinguish them. Outside Vercel
// (local builds, docker), fall back to NODE_ENV.
const isProdDeploy =
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL && process.env.NODE_ENV === "production");

/**
 * Mark a schema as required only in the production deploy, optional in
 * preview/dev. Lets PR previews build without real OAuth/email credentials.
 *
 * @template {z.ZodTypeAny} T
 * @param {T} schema
 * @returns {T | z.ZodOptional<T>}
 */
const prodRequired = (schema) => (isProdDeploy ? schema : schema.optional());

// OAuth apps only exist for the Vercel deploy. A self-hosted production
// deploy (the homelab, compose.homelab.yaml) signs in by email and only turns
// on the OAuth providers whose credentials it was given.
const isVercelProd = process.env.VERCEL_ENV === "production";

/**
 * Required on the Vercel production deploy, optional everywhere else.
 *
 * @template {z.ZodTypeAny} T
 * @param {T} schema
 * @returns {T | z.ZodOptional<T>}
 */
const vercelProdRequired = (schema) =>
  isVercelProd ? schema : schema.optional();

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
    // OAuth creds are required on Vercel production only. Email creds are
    // required on any production deploy, since email is the sign-in that
    // always works. Both stay optional in preview/dev.
    DISCORD_CLIENT_ID: vercelProdRequired(z.string()),
    DISCORD_CLIENT_SECRET: vercelProdRequired(z.string()),
    GITHUB_ID: vercelProdRequired(z.string()),
    GITHUB_SECRET: vercelProdRequired(z.string()),
    GOOGLE_ID: vercelProdRequired(z.string()),
    GOOGLE_SECRET: vercelProdRequired(z.string()),
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
