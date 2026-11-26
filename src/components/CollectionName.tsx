"use client";

import { type FormEvent, type KeyboardEvent, useState } from "react";
import Button from "./Button";

export const MAX_COLLECTION_NAME_LENGTH = 50;

type CollectionNameProps = {
  name: string;
  onSave: (name: string) => Promise<unknown>;
  editable?: boolean;
};

export function validateCollectionName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Collection name can't be empty";
  }
  if (trimmed.length > MAX_COLLECTION_NAME_LENGTH) {
    return `Collection name can be at most ${MAX_COLLECTION_NAME_LENGTH} characters`;
  }
  return null;
}

export default function CollectionName({ name, onSave, editable = true }: CollectionNameProps) {
  // The draft only exists while editing and starts from the latest saved
  // name, so it can never get stuck on a stale or empty value.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = draft !== null;

  function startEditing() {
    setDraft(name);
    setError(null);
  }

  function cancel() {
    setDraft(null);
    setError(null);
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (draft === null) return;

    const validationError = validateCollectionName(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (draft.trim() === name) {
      cancel();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(draft.trim());
      setDraft(null);
      setError(null);
    } catch {
      setError("Couldn't save the name. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      cancel();
    }
  }

  if (!isEditing) {
    return (
      <div className="flex items-center gap-4">
        <h1 className="text-2xl">{name}</h1>
        {editable && (
          <Button type="button" onClick={startEditing}>
            Rename
          </Button>
        )}
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => void save(e)}>
      <div className="flex items-center gap-4">
        <input
          aria-label="Collection name"
          aria-invalid={error != null}
          className="flex-1 rounded px-2 py-1 text-black"
          type="text"
          value={draft}
          autoFocus
          disabled={isSaving}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(validateCollectionName(e.target.value));
          }}
          onKeyDown={handleKeyDown}
        />
        <Button type="submit" disabled={isSaving || error != null}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
        <Button type="button" onClick={cancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      )}
    </form>
  );
}
