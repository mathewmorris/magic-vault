"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import Button from "~/components/Button";
import { useToast } from "~/components/toast";
import { api } from "~/utils/api";
import { collectionLabel, mutationErrorMessage } from "~/utils/toastMessages";

export default function Page() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data: collection } = api.collection.byId.useQuery({ id });
  const cards = api.card.findMany.useQuery({ cardIds: collection?.cards ?? [] });
  const toast = useToast();
  // Callbacks live on useMutation (not on mutate) so they still run after
  // router.back() unmounts this page. The toasts show on the page we land on.
  const { mutate: softDeleteCollection } =
    api.collection.softDelete.useMutation({
      onSuccess: (deleted) => {
        toast.success(
          `Deleted ${collectionLabel(deleted.name)}. You can recover it from Deleted Collections.`,
        );
      },
      onError: (error) => {
        toast.error(mutationErrorMessage("delete this collection", error));
      },
    });
  const { mutate: recoverCollection } = api.collection.recover.useMutation({
    onSuccess: (recovered) => {
      toast.success(`Recovered ${collectionLabel(recovered.name)}.`);
    },
    onError: (error) => {
      toast.error(mutationErrorMessage("recover this collection", error));
    },
  });
  const { mutate: destroyCollection } = api.collection.destroy.useMutation({
    onSuccess: (destroyed) => {
      toast.success(`Permanently deleted ${collectionLabel(destroyed.name)}.`);
    },
    onError: (error) => {
      toast.error(
        mutationErrorMessage("permanently delete this collection", error),
      );
    },
  });

  function onDeleteClick() {
    if (collection?.id) {
      softDeleteCollection({ collectionId: collection.id });
      router.back();
    }
  }

  function onDestroyClick() {
    if (collection?.id) {
      destroyCollection({ collectionId: collection.id });
      router.back();
    }
  }

  function onRecoverClick() {
    if (collection?.id) {
      recoverCollection({ collectionId: collection.id });
      router.back();
    }
  }

  return (
    <div>
      <h1>{collection?.name}</h1>
      {collection?.deletedAt == null ? (
        <Button type="button" onClick={onDeleteClick}>
          Delete
        </Button>
      ) : (
        <>
          <Button type="button" onClick={onRecoverClick}>
            Recover
          </Button>
          <Button type="button" onClick={onDestroyClick}>
            Delete Permanently
          </Button>
        </>
      )}
      {cards.data?.map((card) => {
        const images = card.image_uris as { small: string } | null;

        return (
          <div key={card.id}>
            <p>{card.name}</p>
            <Image
              src={images?.small ?? ""}
              width={100}
              height={200}
              alt={card.name}
            />
          </div>
        );
      })}
    </div>
  );
}
