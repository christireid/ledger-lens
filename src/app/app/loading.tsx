import { Skeleton } from "@/components/ui/skeleton";

// §06.10: route-level loading state — the §03.5 skeleton, not a blank frame.
export default function AppLoading() {
  return (
    <div className="grid grid-cols-12 gap-6" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="col-span-3 h-28" />
      ))}
      <Skeleton className="col-span-8 h-72" />
      <Skeleton className="col-span-4 h-72" />
    </div>
  );
}
