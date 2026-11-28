// Shown the moment a collection link is clicked, while the page loads. Next
// prefetches this with the link, so the click never looks like it did nothing.
export default function Loading() {
  return (
    <p role="status" className="p-4">
      Loading collection...
    </p>
  );
}
