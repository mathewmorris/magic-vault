-- CreateIndex
CREATE INDEX "CardStash_data_idx" ON "CardStash" USING GIN ("data" jsonb_path_ops);
