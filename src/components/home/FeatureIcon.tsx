import { type Feature } from "./features";

// Simple 24px outline icons, drawn with the current text color.
const PATHS: Record<Feature["id"], string[]> = {
  search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M20 20l-4-4"],
  collections: ["M4 7h16v12H4z", "M4 7l2-3h12l2 3", "M10 11h4"],
  prices: ["M12 3v18", "M16.5 7.5C16 6 14.3 5 12 5c-2.8 0-4.5 1.3-4.5 3.2 0 4.3 9 2.3 9 6.6 0 1.9-1.8 3.2-4.5 3.2-2.4 0-4.1-1-4.6-2.6"],
  decks: ["M7 3h10v14H7z", "M4 6v14h10", "M10 7h4"],
  import: ["M12 3v11", "M8 10l4 4 4-4", "M4 15v5h16v-5"],
  scan: ["M4 8V5h3", "M17 5h3v3", "M20 16v3h-3", "M7 19H4v-3", "M9 9h6v6H9z"],
};

export default function FeatureIcon({ id, className }: { id: Feature["id"]; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-6 w-6"}
    >
      {PATHS[id].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
