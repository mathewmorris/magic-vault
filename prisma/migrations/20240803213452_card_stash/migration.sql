-- CreateTable
CREATE TABLE "CardStash" (
    "id" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3),

    CONSTRAINT "CardStash_pkey" PRIMARY KEY ("id")
);
