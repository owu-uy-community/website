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
        "flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-input px-6 py-12 text-center",
        className
      )}
      {...props}
    >
      {Icon ? (
        <div className="mb-1.5 flex size-9 items-center justify-center rounded-lg border border-input bg-raised shadow-edge">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
        </div>
      ) : null}
      <p className="text-ui font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-ui text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export { Empty };
