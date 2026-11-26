-- Trigram indexes so ILIKE '%...%' name and rules text searches can use an index.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "Card_name_idx" ON "Card" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Card_oracle_text_idx" ON "Card" USING GIN ("oracle_text" gin_trgm_ops);
