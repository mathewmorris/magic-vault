"use client";

import { type FormEvent, type KeyboardEvent, useState } from "react";
import Button from "~/components/Button";
import { DECK_FORMATS, FORMAT_LABELS, isDeckFormat, type DeckFormat } from "~/utils/deck/checkDeck";

export const MAX_DECK_NAME_LENGTH = 50;

export function validateDeckName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Deck name can't be empty";
  }
  if (trimmed.length > MAX_DECK_NAME_LENGTH) {
    return `Deck name can be at most ${MAX_DECK_NAME_LENGTH} characters`;
  }
  return null;
}

type DeckFormatSelectProps = {
  value: string;
  onChange: (format: DeckFormat) => void;
  disabled?: boolean;
};

export function DeckFormatSelect({ value, onChange, disabled }: DeckFormatSelectProps) {
  return (
    <label className="flex items-center gap-2">
      Format
      <select
        className="rounded px-2 py-1 text-black"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          if (isDeckFormat(e.target.value)) onChange(e.target.value);
        }}
      >
        {DECK_FORMATS.map((format) => (
          <option key={format} value={format}>
            {FORMAT_LABELS[format]}
          </option>
        ))}
      </select>
    </label>
  );
}

type DeckNameProps = {
  name: string;
  onSave: (name: string) => Promise<unknown>;
  editable?: boolean;
};

/** The deck's name as a heading, with a Rename button that swaps in a form. */
export default function DeckName({ name, onSave, editable = true }: DeckNameProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function cancel() {
    setDraft(null);
    setError(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (draft === null) return;

    const validationError = validateDeckName(draft);
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
      cancel();
    } catch {
      setError("Couldn't save the name. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") cancel();
  }

  if (draft === null) {
    return (
      <div className="flex items-center gap-4">
        <h1 className="text-2xl">{name}</h1>
        {editable && (
          <Button type="button" onClick={() => setDraft(name)}>
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
          aria-label="Deck name"
          aria-invalid={error != null}
          className="flex-1 rounded px-2 py-1 text-black"
          type="text"
          value={draft}
          autoFocus
          disabled={isSaving}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(validateDeckName(e.target.value));
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
