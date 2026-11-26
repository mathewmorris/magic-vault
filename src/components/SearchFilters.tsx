"use client";

import { useState } from "react";
import Button from "~/components/Button";
import {
  EMPTY_FILTERS,
  filterTerms,
  type ColorMode,
  type SearchFilters as Filters,
} from "~/utils/search/filterTerms";
import { COLOR_ORDER, FORMATS, RARITY_ORDER, type Color } from "~/utils/search/parseQuery";

const COLOR_LABELS: Record<Color, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  including: "Including these colors",
  exactly: "Exactly these colors",
  atMost: "At most these colors",
};

const inputClass = "rounded border border-gray-600 px-2 py-1 text-black";

type ColorPickerProps = {
  legend: string;
  name: string;
  value: Color[];
  onChange: (colors: Color[]) => void;
};

function ColorPicker({ legend, name, value, onChange }: ColorPickerProps) {
  return (
    <fieldset>
      <legend className="mb-1 font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-3">
        {COLOR_ORDER.map((color) => (
          <label key={color} className="flex items-center gap-1">
            <input
              type="checkbox"
              name={name}
              checked={value.includes(color)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...value, color] : value.filter((picked) => picked !== color),
                )
              }
            />
            {COLOR_LABELS[color]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type SearchFiltersProps = {
  /** Called with the search terms for the picked filters, e.g. ["c:r", "mv<=2"]. */
  onApply: (terms: string[]) => void;
};

/** Pick filters and add them to the search as typed terms. */
export default function SearchFilters({ onApply }: SearchFiltersProps) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const update = (changes: Partial<Filters>) => setFilters((current) => ({ ...current, ...changes }));
  const terms = filterTerms(filters);

  return (
    <form
      className="grid gap-4 rounded-lg border border-gray-700 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (terms.length === 0) return;
        onApply(terms);
        setFilters(EMPTY_FILTERS);
      }}
    >
      <div className="grid gap-2">
        <ColorPicker
          legend="Colors"
          name="colors"
          value={filters.colors}
          onChange={(colors) => update({ colors })}
        />
        <select
          aria-label="How to match colors"
          className={inputClass}
          value={filters.colorMode}
          onChange={(e) => update({ colorMode: e.target.value as ColorMode })}
        >
          {(Object.keys(COLOR_MODE_LABELS) as ColorMode[]).map((mode) => (
            <option key={mode} value={mode}>
              {COLOR_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>

      <ColorPicker
        legend="Color identity (within)"
        name="identity"
        value={filters.identity}
        onChange={(identity) => update({ identity })}
      />

      <label className="grid gap-1">
        <span className="font-semibold">Type</span>
        <input
          type="text"
          className={inputClass}
          placeholder="creature, goblin, legendary..."
          value={filters.type}
          onChange={(e) => update({ type: e.target.value })}
        />
      </label>

      <label className="grid gap-1">
        <span className="font-semibold">Rarity</span>
        <select
          className={inputClass}
          value={filters.rarity}
          onChange={(e) => update({ rarity: e.target.value as Filters["rarity"] })}
        >
          <option value="">Any</option>
          {RARITY_ORDER.map((rarity) => (
            <option key={rarity} value={rarity}>
              {rarity[0]?.toUpperCase()}
              {rarity.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1">
        <span className="font-semibold">Set code</span>
        <input
          type="text"
          className={inputClass}
          placeholder="e.g. lea, dmu"
          value={filters.set}
          onChange={(e) => update({ set: e.target.value })}
        />
      </label>

      <label className="grid gap-1">
        <span className="font-semibold">Legal in format</span>
        <select
          className={inputClass}
          value={filters.format}
          onChange={(e) => update({ format: e.target.value as Filters["format"] })}
        >
          <option value="">Any</option>
          {FORMATS.map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="grid gap-1">
        <legend className="mb-1 font-semibold">Mana value</legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            aria-label="Lowest mana value"
            placeholder="min"
            className={`${inputClass} w-20`}
            value={filters.mvMin}
            onChange={(e) => update({ mvMin: e.target.value })}
          />
          <span>to</span>
          <input
            type="number"
            min={0}
            aria-label="Highest mana value"
            placeholder="max"
            className={`${inputClass} w-20`}
            value={filters.mvMax}
            onChange={(e) => update({ mvMax: e.target.value })}
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
        <Button type="submit" disabled={terms.length === 0}>
          Add to search
        </Button>
        <Button type="button" onClick={() => setFilters(EMPTY_FILTERS)}>
          Clear filters
        </Button>
        {terms.length > 0 && (
          <code className="text-sm text-gray-400">{terms.join(" ")}</code>
        )}
      </div>
    </form>
  );
}
