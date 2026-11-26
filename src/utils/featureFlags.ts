/**
 * Feature flags, read from environment variables so a flag can be flipped
 * per environment (Vercel project settings, .env, homelab .env) without a
 * code change.
 *
 * Flags are off unless the variable is exactly "true", "1", "on" or "yes"
 * (any case). `NEXT_PUBLIC_` flags are inlined into the client bundle at
 * build time, so on Vercel changing one needs a redeploy to take effect.
 *
 * Add new flags to FLAG_ENV below so they're listed in one place.
 */

const FLAG_ENV = {
  /** AI card recognition on /scan (camera -> card detection -> image embedding match). */
  aiScan: "NEXT_PUBLIC_FEATURE_AI_SCAN",
} as const;

export type FeatureFlag = keyof typeof FLAG_ENV;

const TRUE_VALUES = new Set(["true", "1", "on", "yes"]);

export function parseFlag(value: string | undefined | null): boolean {
  return value != null && TRUE_VALUES.has(value.trim().toLowerCase());
}

// Next.js only inlines NEXT_PUBLIC_ variables that are written out literally,
// so each one has to be read by name here rather than via process.env[name].
function rawFlagValues(): Record<FeatureFlag, string | undefined> {
  return {
    aiScan: process.env.NEXT_PUBLIC_FEATURE_AI_SCAN,
  };
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return parseFlag(rawFlagValues()[flag]);
}

export function flagEnvName(flag: FeatureFlag): string {
  return FLAG_ENV[flag];
}
