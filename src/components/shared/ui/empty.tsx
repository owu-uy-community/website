import * as React from "react";
import { type LucideIcon } from "lucide-react";

import { cn } from "app/lib/utils";

type EmptyProps = React.HTMLAttributes<HTMLDivElement> & {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

function Empty({ icon: Icon, title, description, action, className, ...props }: EmptyProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className
      )}
      {...props}
    >
      {Icon ? (
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted/50">
          <Icon aria-hidden className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export { Empty };
