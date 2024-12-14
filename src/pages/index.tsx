import { type Collection } from "@prisma/client";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "~/utils/api";

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
      <Link href={`/collection/${collection.id}`}>View Collection</Link>
    </div>
  )))
}

const App = () => {
  const { data: sessionData } = useSession();
  const { data: collections } = api.collection.getAll.useQuery();
  const create = api.collection.create.useMutation();
  console.log(create)

  return (
    <div className="container mx-auto grid justify-items-stretch">
      <h1 className="text-5xl flex-row justify-self-center py-4">Magic Vault</h1>
      {sessionData && (
        <div>
          <button className="rounded-full dark:bg-purple-950 px-4 py-2 font-semibold no-underline transition dark:hover:bg-pink-800 dark:focus:bg-pink-800 dark:hover:drop-shadow-glow dark:focus:drop-shadow-glow" onClick={() => create.mutate({ name: "My New Collection" })}>Create Collection</button>
          <p>Your collections</p>
          <CollectionList collections={collections ?? []} />
        </div>
      )}
    </div>
  )

};

export default App;

