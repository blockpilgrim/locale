import Link from "next/link";
import { Container } from "@/components/Container";

export default function ReportNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Container variant="prose">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-warm-100">
            <span className="font-serif text-2xl font-bold text-ink-muted">?</span>
          </div>
          <p className="mb-3 text-xs font-semibold tracking-[0.2em] uppercase text-accent">
            404
          </p>
          <h1 className="mb-4">Report not found</h1>
          <p className="text-lg text-ink-muted leading-relaxed">
            We couldn&apos;t find a report at this address. It may have been
            removed or the link may be incorrect.
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-block rounded-xl bg-accent px-8 py-3.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-accent-light hover:shadow-md"
            >
              Generate a new report
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}
