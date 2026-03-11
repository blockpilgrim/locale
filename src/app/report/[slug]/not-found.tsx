import Link from "next/link";
import { Container } from "@/components/Container";

export default function ReportNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <Container variant="prose">
        <div className="text-center">
          <p className="mb-4 text-sm font-medium tracking-widest uppercase text-accent">
            404
          </p>
          <h1 className="mb-4">Report not found</h1>
          <p className="text-lg text-ink-muted">
            We couldn&apos;t find a report at this address. It may have been
            removed or the link may be incorrect.
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-block rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-light"
            >
              Generate a new report
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}
