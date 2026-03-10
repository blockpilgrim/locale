export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <main className="max-w-(--container-prose) text-center">
        <p className="mb-4 text-sm font-medium tracking-widest uppercase text-accent">
          Neighborhood Intelligence
        </p>
        <h1 className="mb-6">
          Know the neighborhood
          <br />
          before you move in.
        </h1>
        <p className="text-lg text-ink-muted">
          Enter any US address and get an AI-powered, data-driven portrait of
          what it&apos;s actually like to live there.
        </p>

        <div className="mt-12 rounded-xl border border-border bg-surface p-8 shadow-sm">
          <p className="font-serif text-ink-light italic">
            Address input coming soon...
          </p>
        </div>
      </main>
    </div>
  );
}
