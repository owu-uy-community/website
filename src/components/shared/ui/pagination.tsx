import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "app/lib/utils";
import { type ButtonProps, buttonVariants } from "components/shared/ui/button";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      role="navigation"
      {...props}
    />
  );
}
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn("flex flex-row items-center gap-1", className)} {...props} />
  )
);
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<ButtonProps, "size"> &
  React.ComponentProps<"a">;

function PaginationLink({ className, isActive, size = "icon", ...props }: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        className
      )}
      {...props}
    />
  );
}
PaginationLink.displayName = "PaginationLink";

function PaginationPrevious({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink aria-label="Ir a la página anterior" className={cn("gap-1 pl-2.5", className)} size="default" {...props}>
      <ChevronLeft className="h-4 w-4" />
      <span>Anterior</span>
    </PaginationLink>
  );
}
PaginationPrevious.displayName = "PaginationPrevious";

function PaginationNext({ className, ...props }: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink aria-label="Ir a la página siguiente" className={cn("gap-1 pr-2.5", className)} size="default" {...props}>
      <span>Siguiente</span>
      <ChevronRight className="h-4 w-4" />
    </PaginationLink>
  );
}
PaginationNext.displayName = "PaginationNext";

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span aria-hidden className={cn("flex h-9 w-9 items-center justify-center", className)} {...props}>
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">Más páginas</span>
    </span>
  );
}
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
