import { env } from "~/env";
import { type AffiliateConfig } from "~/utils/buyLinks";

/** The affiliate switch and store IDs from the environment (see src/env.js). */
export function affiliateConfig(): AffiliateConfig {
  return {
    enabled: env.AFFILIATE_LINKS === "on",
    tcgplayerUrl: env.TCGPLAYER_AFFILIATE_URL,
    cardKingdomPartner: env.CARDKINGDOM_PARTNER_ID,
  };
}
