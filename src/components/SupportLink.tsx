type SupportLinkProps = {
  /** Donation page URL. When missing or blank, nothing renders. */
  href?: string;
  className?: string;
};

function SupportLink({ href, className }: SupportLinkProps) {
  if (!href?.trim()) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "inline-flex items-center gap-1.5 dark:hover:drop-shadow-glow",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4 text-pink-500"
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
      <span>Support Magic Vault</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export default SupportLink;
