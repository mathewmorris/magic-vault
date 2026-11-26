type SpinnerProps = {
  /** Text read out by screen readers. It isn't shown on screen. */
  label?: string;
};

export default function Spinner({ label = "Loading" }: SpinnerProps) {
  return (
    <div role="status" className="flex items-center justify-center p-4">
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-4 border-purple-400 border-t-pink-500"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
