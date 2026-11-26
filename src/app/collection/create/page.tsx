"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "~/components/Button";
import SearchBar from "~/components/SearchBar";
import { useToast } from "~/components/toast";
import { api } from "~/utils/api";
import { collectionLabel, mutationErrorMessage } from "~/utils/toastMessages";

export default function CreateCollectionPage() {
  const router = useRouter();
  const toast = useToast();
  const [collectionName, setCollectionName] = useState("");
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  const { mutate: collectionMutation } = api.collection.create.useMutation({
    onSuccess: (newCollection) => {
      toast.success(`Created ${collectionLabel(newCollection.name)}.`);
      router.replace(`/collection/${newCollection.id}`);
    },
    onError: (error) => {
      toast.error(mutationErrorMessage("create your collection", error));
    },
  });

  function createCollection(data: { name: string; cards: string[] }) {
    collectionMutation(data);
  }

  return (
    <div>
      <h1>Creating Collection</h1>
      <form>
        <div className="p-4">
          <label htmlFor="collectionName">Collection Name</label>
          <input
            className="text-black"
            type="text"
            id="collectionName"
            onChange={(e) => setCollectionName(e.target.value)}
            value={collectionName}
          />
        </div>
        <Button
          type="button"
          onClick={() =>
            createCollection({ name: collectionName, cards: selectedCards })
          }
        >
          Create Collection
        </Button>
        <div className="p-4">
          <SearchBar onSelectedChange={setSelectedCards} />
        </div>
      </form>
    </div>
  );
}
