import { ChangeEvent, KeyboardEvent, useRef, useState } from "react";
import Button from "~/components/Button";

type CollectionNameProps = {
  name: string,
  onSave: (name: string) => void,
}

export function CollectionName({ name, onSave }: CollectionNameProps) {
  const [newName, setNewName] = useState(name);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>();
  const inputRef = useRef<HTMLInputElement>(null);

  function isValid(name: string) {
    if (name == '') {
      setError('Collection name cannot be empty')
      return false;
    }

    setError(null)
    return true;
  }

  async function save() {
    if (isValid(newName)) {
      onSave(newName)
      setIsEditing(false)
    }
  }

  function cancel() {
    setError(null);
    setNewName(name);
    setIsEditing(false);
  }

  function acknowledgeError() {
    setNewName(name);
    setError(null)
    inputRef.current?.focus();
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    isValid(e.target.value)
    setNewName(e.target.value)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key == "Enter") {
      save();
    }

    if (e.key == "Escape") {
      cancel();
    }
  }

  function handleEdit() {
    setIsEditing(true)
    inputRef.current?.focus();
  }

  return (
    <>
      <div className="flex justify-between">
        <h1 className={`text-xl flex-1 ${isEditing ? 'hidden' : 'visible'}`}>{newName}</h1>
        <input
          aria-label="collection name"
          aria-hidden={!isEditing}
          className={`text-black mr-8 flex-1 ${isEditing ? 'visible' : 'hidden'}`}
          type="text"
          id="collectionName"
          value={newName}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          ref={inputRef}
        />
        {isEditing ? (
          <div className="flex gap-4">
            <Button type="button" onClick={cancel}>Cancel</Button>
            <Button
              type="button"
              onClick={save}
            >
              Save
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={handleEdit}>Edit</Button>
        )}
      </div>
      <div>
        {error && (
          <div className="bg-red-500 rounded">Errors</div>
        )}
        {error && (
          <div className="absolute bg-gray-200 mt-4 py-2 px-4 rounded flex flex-row">
            <p role="alert" className="text-black">{error}</p>
            <Button role="button" onClick={acknowledgeError}>Got it</Button>
          </div>
        )}
      </div>
    </>
  )
}

