"use client";

import { useState } from "react";
import { api } from "~/utils/api";
import { type ExportFormat } from "~/utils/import/export";
import Button from "./Button";

const OPTIONS: { format: ExportFormat; label: string; type: string }[] = [
  { format: "csv", label: "CSV (Moxfield)", type: "text/csv;charset=utf-8" },
  { format: "text", label: "Text list", type: "text/plain;charset=utf-8" },
];

/** Downloads a collection as a CSV or text file, built on the server. */
export default function ExportMenu({ collectionId }: { collectionId: string }) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download({ format, type }: (typeof OPTIONS)[number]) {
    setPending(true);
    setError(null);
    try {
      // Always ask again, so cards added a moment ago are in the file.
      const { text, filename } = await utils.collection.exportCsv.fetch(
        { collectionId, format },
        { staleTime: 0 },
      );
      const url = URL.createObjectURL(new Blob([text], { type }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Let the browser start the download before the URL goes away.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch {
      setError("Couldn't export this collection. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((current) => !current)}
      >
        {pending ? "Exporting..." : "Export"}
      </Button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-10 mt-2 flex min-w-max flex-col rounded-lg bg-gray-800 py-1 shadow-lg"
        >
          {OPTIONS.map((option) => (
            <li key={option.format} role="none">
              <button
                type="button"
                role="menuitem"
                className="w-full px-4 py-2 text-left hover:bg-gray-700 focus:bg-gray-700"
                disabled={pending}
                onClick={() => void download(option)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="absolute right-0 mt-2 w-max text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
