import { requireSession } from "~/server/requireSession";

export default async function DeckLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSession(`/deck/${encodeURIComponent(id)}`);

  return <>{children}</>;
}
