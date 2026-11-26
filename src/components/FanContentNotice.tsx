/**
 * Credit for card data and images (Scryfall) and the Wizards of the Coast
 * Fan Content Policy notice. Shown on the home and about pages.
 */
export default function FanContentNotice({ className }: { className?: string }) {
  return (
    <div className={["space-y-2 text-xs text-gray-500", className].filter(Boolean).join(" ")}>
      <p>
        Card data and images come from{" "}
        <a href="https://scryfall.com" className="underline" target="_blank" rel="noreferrer">
          Scryfall
        </a>
        . Magic Vault isn&apos;t made or endorsed by Scryfall.
      </p>
      <p>
        Magic Vault is unofficial Fan Content permitted under the{" "}
        <a
          href="https://company.wizards.com/en/legal/fancontentpolicy"
          className="underline"
          target="_blank"
          rel="noreferrer"
        >
          Fan Content Policy
        </a>
        . Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards
        of the Coast. &copy;Wizards of the Coast LLC.
      </p>
    </div>
  );
}
