import Dashboard from "~/components/home/Dashboard";
import Landing from "~/components/home/Landing";
import { getServerAuthSession } from "~/server/auth";
import { prisma } from "~/server/db";
import { getCardCount, getFeaturedCards } from "~/server/featuredCards";

export default async function Home() {
  const session = await getServerAuthSession();

  if (session) {
    return <Dashboard name={session.user.name} />;
  }

  const [featuredCards, cardCount] = await Promise.all([
    getFeaturedCards(prisma),
    getCardCount(prisma),
  ]);

  return <Landing featuredCards={featuredCards} cardCount={cardCount} />;
}
