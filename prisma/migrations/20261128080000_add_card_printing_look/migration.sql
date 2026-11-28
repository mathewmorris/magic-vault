-- How a printing looks, from Scryfall's card object, so the AI scanner can
-- compare what it sees (border colour, set symbol) against each candidate
-- printing. Existing rows get the values on the next Scryfall sync, which
-- rewrites every card once because the hashed columns changed.

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "border_color" TEXT,
ADD COLUMN     "frame" TEXT,
ADD COLUMN     "frame_effects" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "illustration_id" TEXT,
ADD COLUMN     "promo_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "security_stamp" TEXT;
