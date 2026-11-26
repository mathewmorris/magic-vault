-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "CardEmbedding" (
    "cardId" TEXT NOT NULL,
    "face" INTEGER NOT NULL DEFAULT 0,
    "modelId" TEXT NOT NULL,
    "embedding" halfvec(256) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardEmbedding_pkey" PRIMARY KEY ("cardId","face","modelId")
);

-- CreateIndex
CREATE INDEX "CardEmbedding_modelId_idx" ON "CardEmbedding"("modelId");

-- AddForeignKey
ALTER TABLE "CardEmbedding" ADD CONSTRAINT "CardEmbedding_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Approximate nearest-neighbour index for cosine distance (the <=> operator).
-- Prisma can't describe an HNSW index in schema.prisma, so it lives here only.
-- If a later `prisma migrate dev` generates a DROP INDEX for it, delete that
-- line from the new migration before applying it.
CREATE INDEX "CardEmbedding_embedding_hnsw_idx" ON "CardEmbedding" USING hnsw ("embedding" halfvec_cosine_ops);
