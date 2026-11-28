"use client";

import Link from "next/link";
import { type Collection } from "@prisma/client";
import Spinner from "~/components/Spinner";
import { api, type RouterOutputs } from "~/utils/api";
import { formatUsd, unpricedLabel } from "~/utils/price";
import { usePrefetchCollection } from "~/utils/usePrefetchCollection";

type CollectionValues = RouterOutputs["collection"]["values"];

const ValueLabel = ({ value }: { value: CollectionValues[string] | undefined }) => {
  if (!value) return null;
  return (
    <span>
      {formatUsd(value.totalCents)}
      {value.unpriced > 0 && (
        <span className="text-gray-400"> ({unpricedLabel(value.unpriced)})</span>
      )}
    </span>
  );
};

const CollectionList = ({
  collections,
  values,
}: {
  collections: Collection[];
  values: CollectionValues | undefined;
}) => {
  const prefetchCollection = usePrefetchCollection(collections);

  if (collections.length < 1) {
    return (
      <>
        <p>No collections...</p>
      </>
    );
  }

  return collections.map((collection) => (
    <div key={collection.id} className="flex gap-2">
      <span>{collection.name}</span>
      <ValueLabel value={values?.[collection.id]} />
      <Link
        href={`/collection/${collection.id}`}
        onPointerEnter={() => prefetchCollection(collection)}
        onFocus={() => prefetchCollection(collection)}
      >
        View Collection
      </Link>
    </div>
  ));
};

export default function CollectionsIndex() {
  const { data: collections, isLoading } = api.collection.getAll.useQuery();
  // Loads on its own so the list shows right away and the totals follow.
  const { data: values } = api.collection.values.useQuery();

  return (
    <div>
      <Link href="collection/create">Create Collection</Link>
      <p>Your collections</p>
      {isLoading ? (
        <Spinner label="Loading collections" />
      ) : (
        <CollectionList collections={collections ?? []} values={values} />
      )}
    </div>
  );
}
