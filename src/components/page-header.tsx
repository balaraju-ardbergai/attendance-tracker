import { cn } from "@/lib/utils";

// One consistent page header everywhere: title + description on the left,
// actions aligned right. Used by every module page.
export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description != null && (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children != null && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">{children}</div>
      )}
    </div>
  );
}
