import { requireSession } from "~/server/requireSession";

export default async function CollectionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession("/collections");

  return <>{children}</>;
}
