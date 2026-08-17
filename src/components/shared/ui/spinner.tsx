import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { cn } from "app/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<typeof LoaderCircle>) {
  return <LoaderCircle aria-label="Cargando" className={cn("h-4 w-4 animate-spin", className)} role="status" {...props} />;
}

export { Spinner };
