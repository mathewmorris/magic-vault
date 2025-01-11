import { useRouter } from "next/router";
import Button from "~/components/Button";
import { api } from "~/utils/api";

export default function DeletedCollections({ }) {
  const { data: collections } = api.collection.getDeletedCollections.useQuery();
  const router = useRouter();

  return (
    <div>
      <h1 className="text-2xl">Deleted Collections</h1>
      {collections?.map(collection => {
        function onViewClick() {
          router.push(`/collection/${collection.id}`);
        }

        return (
          <div>
            <h4 className="text-lg">{collection.name}</h4>
            <Button type="button" onClick={onViewClick}>View Collection</Button>
          </div>
        )
      })}
    </div>
  );
}


