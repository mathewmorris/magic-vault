"use client";

import Image from "next/image";
import { type ChangeEvent, useState } from "react";
import { api, type RouterOutputs } from "~/utils/api";
import {
  IMPORT_FORMAT_CHOICES,
  MAX_IMPORT_TEXT_LENGTH,
  type ImportFormatChoice,
} from "~/utils/import/types";
import { conditionLabel, languageLabel } from "~/utils/import/values";
import { finishLabel } from "~/utils/price";
import Button from "./Button";

type Preview = RouterOutputs["collection"]["previewImport"];
type MatchedLine = Preview["matched"][number];

export type ImportSummary = RouterOutputs["collection"]["applyImport"];

type ImportPanelProps = {
  collectionId: string;
  onClose: () => void;
  onImported: (summary: ImportSummary) => Promise<unknown>;
};

const FORMAT_LABELS: Record<ImportFormatChoice, string> = {
  auto: "Work it out",
  text: "Text list",
  csv: "CSV",
};

const PLACEHOLDER = [
  "4 Lightning Bolt",
  "1 Lightning Bolt (2ED) 162 *F*",
  "",
  "or a CSV export from Moxfield, Archidekt, ManaBox or Deckbox",
].join("\n");

const cardsLabel = (count: number) => `${count} ${count === 1 ? "card" : "cards"}`;

function printingLabel({ set, collectorNumber }: MatchedLine["card"]) {
  return [set?.toUpperCase(), collectorNumber].filter(Boolean).join(" ");
}

/**
 * Pasting or picking a card list, checking what it matched, then adding it.
 * Files are read here in the browser; only their text goes to the server.
 */
export default function ImportPanel({ collectionId, onClose, onImported }: ImportPanelProps) {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<ImportFormatChoice>("auto");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  // Line numbers the user took out of the import, and unmatched lines they
  // cleared from the list.
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [replace, setReplace] = useState(false);

  const preview = api.collection.previewImport.useMutation({
    onSuccess: () => {
      setExcluded(new Set());
      setDismissed(new Set());
      setReplace(false);
      setReviewing(true);
    },
  });
  const apply = api.collection.applyImport.useMutation({
    onSuccess: (summary) => onImported(summary),
  });

  async function readFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear the picker so picking the same file again still fires.
    e.target.value = "";
    if (!file) return;

    setFileError(null);
    if (file.size > MAX_IMPORT_TEXT_LENGTH) {
      setFileError("That file is too big for one import (the limit is about 1 MB).");
      return;
    }
    try {
      setText(await file.text());
      setFileName(file.name);
    } catch {
      setFileError("Couldn't read that file.");
    }
  }

  function toggle(set: Set<number>, lineNumber: number) {
    const next = new Set(set);
    if (next.has(lineNumber)) next.delete(lineNumber);
    else next.add(lineNumber);
    return next;
  }

  const tooLong = text.length > MAX_IMPORT_TEXT_LENGTH;
  const result = reviewing ? preview.data : undefined;

  if (result) {
    const included = result.matched.filter((line) => !excluded.has(line.lineNumber));
    const unmatched = result.unmatched.filter((line) => !dismissed.has(line.lineNumber));
    const total = included.reduce((sum, line) => sum + line.quantity, 0);

    return (
      <section className="flex flex-col gap-4 rounded-lg border border-gray-700 p-4" aria-label="Import cards">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl">Check the import</h2>
          <p className="text-sm text-gray-400">
            {result.matched.length} {result.matched.length === 1 ? "line" : "lines"} matched,{" "}
            {result.unmatched.length} didn&apos;t
          </p>
        </div>

        {result.matched.length > 0 && (
          <ul className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto">
            {result.matched.map((line) => {
              const include = !excluded.has(line.lineNumber);
              return (
                <li
                  key={line.lineNumber}
                  className={`flex items-center gap-3 ${include ? "" : "opacity-50"}`}
                >
                  <input
                    type="checkbox"
                    checked={include}
                    aria-label={`Import ${line.card.name} from line ${line.lineNumber}`}
                    onChange={() => setExcluded((current) => toggle(current, line.lineNumber))}
                  />
                  {line.card.image ? (
                    <Image
                      src={line.card.image}
                      width={49}
                      height={68}
                      alt={line.card.name}
                      className="rounded"
                    />
                  ) : (
                    <div className="h-[68px] w-[49px] rounded bg-gray-800" />
                  )}
                  <div className="flex flex-col">
                    <p>
                      {line.quantity} &times;{" "}
                      <a href={line.card.scryfallUri} target="_blank" rel="noreferrer" className="underline">
                        {line.card.name}
                      </a>{" "}
                      <span className="text-sm text-gray-400">{printingLabel(line.card)}</span>
                    </p>
                    <p className="text-sm text-gray-400">
                      {finishLabel(line.finish)} · {conditionLabel(line.condition)} · {languageLabel(line.language)}
                    </p>
                    {line.note && <p className="text-sm text-amber-400">{line.note}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {unmatched.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">These lines won&apos;t be imported</h3>
            <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto">
              {unmatched.map((line) => (
                <li key={line.lineNumber} className="flex items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <code className="text-sm">
                      Line {line.lineNumber}: {line.raw}
                    </code>
                    <span className="text-sm text-gray-400">{line.reason}</span>
                  </div>
                  <Button
                    type="button"
                    aria-label={`Drop line ${line.lineNumber}`}
                    onClick={() => setDismissed((current) => toggle(current, line.lineNumber))}
                  >
                    Drop
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          <span>Replace everything in this collection with these cards</span>
        </label>
        {replace && (
          <p className="text-sm text-amber-400">
            Every card already in this collection will be removed first.
          </p>
        )}

        {apply.error && (
          <p role="alert" className="text-red-500">
            Couldn&apos;t add the cards: {apply.error.message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={total === 0 || apply.isLoading}
            onClick={() =>
              apply.mutate({
                collectionId,
                replace,
                rows: included.map((line) => ({
                  cardId: line.card.id,
                  finish: line.finish,
                  condition: line.condition,
                  language: line.language,
                  quantity: line.quantity,
                })),
              })
            }
          >
            {apply.isLoading ? "Adding..." : `Add ${cardsLabel(total)}`}
          </Button>
          <Button type="button" disabled={apply.isLoading} onClick={() => setReviewing(false)}>
            Back
          </Button>
          <Button type="button" disabled={apply.isLoading} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-gray-700 p-4" aria-label="Import cards">
      <h2 className="text-xl">Import cards</h2>
      <p className="text-sm text-gray-400">
        Paste a card list, or pick a .csv or .txt file exported from Moxfield, Archidekt, ManaBox or Deckbox.
      </p>

      <textarea
        className="min-h-[12rem] rounded bg-gray-800 p-2 font-mono text-sm"
        aria-label="Card list"
        placeholder={PLACEHOLDER}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setFileName(null);
        }}
      />

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span>File</span>
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => void readFile(e)}
          />
        </label>
        {fileName && <span className="text-sm text-gray-400">Read {fileName}</span>}
        <label className="flex items-center gap-2 text-sm">
          <span>Format</span>
          <select
            className="rounded bg-gray-800 px-1 py-0.5"
            value={format}
            onChange={(e) => {
              const choice = IMPORT_FORMAT_CHOICES.find((option) => option === e.target.value);
              if (choice) setFormat(choice);
            }}
          >
            {IMPORT_FORMAT_CHOICES.map((option) => (
              <option key={option} value={option}>
                {FORMAT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tooLong && (
        <p role="alert" className="text-red-500">
          That&apos;s too much text for one import (the limit is about 1 MB). Split it into smaller imports.
        </p>
      )}
      {fileError && (
        <p role="alert" className="text-red-500">
          {fileError}
        </p>
      )}
      {preview.error && (
        <p role="alert" className="text-red-500">
          {preview.error.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={text.trim() === "" || tooLong || preview.isLoading}
          onClick={() => preview.mutate({ collectionId, text, format })}
        >
          {preview.isLoading ? "Matching cards..." : "Preview"}
        </Button>
        <Button type="button" disabled={preview.isLoading} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
