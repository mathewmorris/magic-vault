import { ChangeEvent, KeyboardEvent, useRef, useState } from "react";
import Button from "~/components/Button";
import { api } from "~/utils/api";
import { motion } from "motion/react";

type CollectionNameProps = {
  name: string,
  onSave: (name: string) => void,
}

export function Notification({ message }: { message: string }) {
  return (
    <motion.div
      className="bg-pink-700 fixed bottom-1 end-1 rounded p-8 m-4"
    >
      <p>{message}</p>
    </motion.div>
  )
}

// TODO: Think about puttin this in a higher layer
export function Notifications() {
  return (
    <div>

    </div>
  )
}

export function CollectionName({ name, onSave }: CollectionNameProps) {
  const [newName, setNewName] = useState(name);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>();
  const inputRef = useRef<HTMLInputElement>(null);

  const ctx = api.useContext()

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
      ctx.collection.byId.invalidate()
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
    <div className="flex justify-between">
      <Notification message="Show message!" />
      <Notification message="Show message!" />
      <Notification message="Show message!" />
      <Notification message="Show message!" />
      <>
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
        {error ? (
          <div>
            <p role="alert">An error occurred: {error}</p>
            <Button role="button" onClick={acknowledgeError}>Acknowledge</Button>
          </div>
        ) : null}
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
      </>
    </div>
  )
}

