import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

function Skeleton({ className }: SkeletonProps) {
  return (
    <div data-slot="skeleton" className={cn("bg-muted animate-pulse rounded-md", className)} />
  );
}

export { Skeleton };
