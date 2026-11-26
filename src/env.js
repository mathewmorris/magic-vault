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
    // OAuth creds are required on Vercel production only, so the homelab
    // deploy can sign in by email alone. They stay optional in preview/dev.
    DISCORD_CLIENT_ID: vercelProdRequired(z.string()),
    DISCORD_CLIENT_SECRET: vercelProdRequired(z.string()),
    GITHUB_ID: vercelProdRequired(z.string()),
    GITHUB_SECRET: vercelProdRequired(z.string()),
    GOOGLE_ID: vercelProdRequired(z.string()),
    GOOGLE_SECRET: vercelProdRequired(z.string()),
    // Email sign-in is optional everywhere. The magic-link provider only
    // turns on when both are set (see src/server/auth.ts).
    EMAIL_SERVER: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),

    // Affiliate buy links (see src/utils/buyLinks.ts). Off unless
    // AFFILIATE_LINKS is "on". While off, buy links still show and use
    // Scryfall's own store links. Each ID is optional: a store without one
    // keeps Scryfall's link even while the switch is on.
    AFFILIATE_LINKS: z.preprocess(
      (str) => (typeof str === "string" && str.trim() !== "" ? str.trim().toLowerCase() : undefined),
      z.enum(["on", "off"]).default("off")
    ),
    TCGPLAYER_AFFILIATE_URL: z.preprocess(
      (str) => (str === "" ? undefined : str),
      z
        .string()
        .url()
        .refine((url) => url.startsWith("https://"), {
          message: "TCGPLAYER_AFFILIATE_URL must be an https URL",
        })
        .optional()
    ),
    CARDKINGDOM_PARTNER_ID: z.preprocess(
      (str) => (str === "" ? undefined : str),
      z.string().regex(/^[\w-]+$/, "CARDKINGDOM_PARTNER_ID may only use letters, digits, _ and -").optional()
    ),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // Optional donation link (Ko-fi, GitHub Sponsors, etc). When unset, the
    // "Support Magic Vault" link is hidden. Blank counts as unset.
    NEXT_PUBLIC_DONATION_URL: z.preprocess(
      (str) => (str === "" ? undefined : str),
      z
        .string()
        .url()
        .refine((url) => url.startsWith("https://"), {
          message: "NEXT_PUBLIC_DONATION_URL must be an https URL",
        })
        .optional()
    ),
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
    AFFILIATE_LINKS: process.env.AFFILIATE_LINKS,
    TCGPLAYER_AFFILIATE_URL: process.env.TCGPLAYER_AFFILIATE_URL,
    CARDKINGDOM_PARTNER_ID: process.env.CARDKINGDOM_PARTNER_ID,
    NEXT_PUBLIC_DONATION_URL: process.env.NEXT_PUBLIC_DONATION_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
   * This is especially useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
