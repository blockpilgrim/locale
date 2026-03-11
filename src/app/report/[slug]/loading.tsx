import { Container } from "@/components/Container";
import { Skeleton } from "@/components/Skeleton";

export default function ReportLoading() {
  return (
    <div className="min-h-screen pb-20">
      {/* Header skeleton */}
      <header className="border-b border-border-light bg-surface pb-10 pt-12 sm:pt-16">
        <Container variant="content">
          <Skeleton width="w-24" height="h-4" className="mb-8" />
          <Skeleton width="w-32" height="h-3" className="mb-4" />
          <Skeleton width="w-full max-w-96" height="h-9" className="mb-2" />
          <Skeleton width="w-48" height="h-5" />
        </Container>
      </header>

      {/* Map skeleton */}
      <section className="pt-8 sm:pt-12">
        <Container variant="content">
          <Skeleton width="w-full" height="h-[300px] sm:h-[400px] md:h-[500px]" className="rounded-xl" />
        </Container>
      </section>

      {/* Narrative skeleton */}
      <section className="pt-16 sm:pt-20">
        <Container variant="prose">
          <Skeleton width="w-32" height="h-3" className="mb-2" />
          <Skeleton width="w-64" height="h-8" className="mb-8" />
          <div className="space-y-3">
            <Skeleton width="w-full" height="h-5" />
            <Skeleton width="w-full" height="h-5" />
            <Skeleton width="w-11/12" height="h-5" />
            <Skeleton width="w-3/4" height="h-5" />
          </div>
        </Container>
      </section>
    </div>
  );
}
