import { TRPCError } from "@trpc/server";
import { type Metadata } from "next";
import { notFound } from "next/navigation";

import CardDetail from "~/components/CardDetail";
import { appRouter } from "~/server/api/root";
import { createInnerTRPCContext } from "~/server/api/trpc";
import { prisma } from "~/server/db";

type CardPageProps = { params: Promise<{ id: string }> };

/** Card pages are public, so the server calls the router with no session. */
async function getCard(id: string) {
  const caller = appRouter.createCaller(createInnerTRPCContext({ session: null }));
  try {
    return await caller.card.byId({ id });
  } catch (err) {
    if (err instanceof TRPCError && (err.code === "NOT_FOUND" || err.code === "BAD_REQUEST")) {
      return null;
    }
    throw err;
  }
}

export async function generateMetadata({ params }: CardPageProps): Promise<Metadata> {
  const { id } = await params;
  // Just the name and type, so the title doesn't pay for the printings query.
  const card = await prisma.card.findUnique({
    where: { id },
    select: { name: true, type_line: true },
  });
  if (!card) return { title: "Card not found | Magic Vault" };

  return {
    title: `${card.name} | Magic Vault`,
    description: card.type_line
      ? `${card.name}, ${card.type_line}. Rules text, legality and printings.`
      : `${card.name}. Rules text, legality and printings.`,
  };
}

export default async function CardPage({ params }: CardPageProps) {
  const { id } = await params;
  const card = await getCard(id);
  if (!card) notFound();

  // Keyed so moving to another printing starts fresh (front face, rulings closed).
  return <CardDetail key={card.id} card={card} />;
}
