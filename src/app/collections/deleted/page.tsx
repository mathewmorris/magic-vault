"use client";

import { useRouter } from "next/navigation";
import Button from "~/components/Button";
import Spinner from "~/components/Spinner";
import { api } from "~/utils/api";

export default function DeletedCollections() {
  const { data: collections, isLoading } =
    api.collection.getDeletedCollections.useQuery();
  const router = useRouter();

  return (
    <div>
      <h1 className="text-2xl">Deleted Collections</h1>
      {isLoading && <Spinner label="Loading deleted collections" />}
      {collections?.map((collection) => {
        function onViewClick() {
          router.push(`/collection/${collection.id}`);
        }

        return (
          <div key={collection.id}>
            <h4 className="text-lg">{collection.name}</h4>
            <Button type="button" onClick={onViewClick}>
              View Collection
            </Button>
          </div>
        );
      })}
    </div>
  );
}
