import Link from "next/link"
import { type Collection } from "@prisma/client"
import { api } from "~/utils/api"

const CollectionList = ({ collections }: { collections: Collection[] }) => {
  if (collections.length < 1) {
    return (
      <>
        <p>No collections...</p>
      </>
    )
  }

  return (collections.map(collection => (
    <div key={collection.id}>
      <span>{collection.name}</span>
      <Link href={`/collections/${collection.id}`}>View Collection</Link>
    </div>
  )))
}

export default function CollectionsIndex() {
  const { data: collections } = api.collection.getAll.useQuery();

  return (
    <div>
      <Link href="collections/create">Create Collection</Link>
      <p>Your collections</p>
      <CollectionList collections={collections ?? []} />
    </div>
  )
}

