import { requireSession } from "~/server/requireSession";

export default async function CreateCollectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession("/collection/create");

  return <>{children}</>;
}
