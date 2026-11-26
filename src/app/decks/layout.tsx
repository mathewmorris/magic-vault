import { requireSession } from "~/server/requireSession";

export default async function DecksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession("/decks");

  return <>{children}</>;
}
