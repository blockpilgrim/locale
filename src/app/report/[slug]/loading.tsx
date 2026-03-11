import { Container } from "@/components/Container";
import { Skeleton } from "@/components/Skeleton";

export default function ReportLoading() {
  return (
    <div className="min-h-screen pb-20">
      {/* Header skeleton */}
      <header className="relative overflow-hidden pb-12 pt-12 sm:pb-16 sm:pt-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "linear-gradient(180deg, #F5F0E8 0%, #FAF7F2 100%)",
          }}
        />
        <Container variant="content" className="relative z-10">
          <Skeleton width="w-24" height="h-4" className="mb-10" />
          <Skeleton width="w-32" height="h-3" className="mb-4" />
          <Skeleton width="w-full max-w-96" height="h-10" className="mb-3" />
          <Skeleton width="w-48" height="h-5" />
        </Container>
      </header>

      {/* Map skeleton */}
      <section className="pt-10 sm:pt-14">
        <Container variant="content">
          <Skeleton width="w-full" height="h-[300px] sm:h-[400px] md:h-[500px]" className="rounded-2xl" />
        </Container>
      </section>

      {/* Narrative skeleton */}
      <section className="pt-16 sm:pt-20">
        <Container variant="prose">
          <Skeleton width="w-32" height="h-3" className="mb-3" />
          <Skeleton width="w-64" height="h-8" className="mb-10" />
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
