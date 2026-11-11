/** Skeleton shown instantly while a page loads its data. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-64 rounded-lg bg-muted" />
      <div className="mt-3 h-5 w-96 max-w-full rounded-lg bg-muted" />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-36 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="mt-8 h-80 rounded-xl bg-muted" />
    </div>
  );
}
