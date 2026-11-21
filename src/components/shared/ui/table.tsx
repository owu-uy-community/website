import * as React from "react";

import { cn } from "app/lib/utils";

/**
 * No scroll wrapper of its own: an `overflow` box around the table would trap the sticky header.
 * Put the table in the element that scrolls (a card with `overflow-auto`, or the page).
 */
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn("w-full caption-bottom border-separate border-spacing-0 text-ui", className)}
      {...props}
    />
  )
);

Table.displayName = "Table";

/** Sticky by default; the bottom hairline is an inset shadow so it stays visible while stuck. */
const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn("sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]", className)}
      {...props}
    />
  )
);

TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child_td]:border-0", className)} {...props} />
  )
);

TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("bg-card font-medium [&_td]:border-t [&_td]:border-border", className)} {...props} />
  )
);

TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "transition-colors hover:bg-white/[0.02] data-[state=selected]:bg-primary/[0.04] [&>td]:border-b [&>td]:border-border",
        className
      )}
      {...props}
    />
  )
);

TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-[34px] px-3 text-left align-middle text-meta font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:w-9 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
);

TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("h-11 px-3 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  )
);

TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-meta text-muted-foreground", className)} {...props} />
  )
);

TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
