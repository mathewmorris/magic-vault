"use client";

import Link from "next/link";
import { type Collection } from "@prisma/client";
import Spinner from "~/components/Spinner";
import { api } from "~/utils/api";

const CollectionList = ({ collections }: { collections: Collection[] }) => {
  if (collections.length < 1) {
    return (
      <>
        <p>No collections...</p>
      </>
    );
  }

  return collections.map((collection) => (
    <div key={collection.id}>
      <span>{collection.name}</span>
      <Link href={`/collection/${collection.id}`}>View Collection</Link>
    </div>
  ));
};

export default function CollectionsIndex() {
  const { data: collections, isLoading } = api.collection.getAll.useQuery();

  return (
    <div>
      <Link href="collection/create">Create Collection</Link>
      <p>Your collections</p>
      {isLoading ? (
        <Spinner label="Loading collections" />
      ) : (
        <CollectionList collections={collections ?? []} />
      )}
    </div>
  );
}
