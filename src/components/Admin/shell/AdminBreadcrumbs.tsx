"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "components/shared/ui/breadcrumb";

import { BREADCRUMB_LABELS } from "./nav-config";

function labelFor(segment: string): string {
  return BREADCRUMB_LABELS[segment] ?? decodeURIComponent(segment);
}

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const segments = (pathname ?? "/admin").split("/").filter(Boolean);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {segments.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join("/")}`;
          const isLast = index === segments.length - 1;

          return (
            <React.Fragment key={href}>
              {index > 0 ? <BreadcrumbSeparator className="hidden md:block" /> : null}
              <BreadcrumbItem className={isLast ? "min-w-0" : "hidden shrink-0 md:inline-flex"}>
                {isLast ? (
                  <BreadcrumbPage className="truncate">{labelFor(segment)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{labelFor(segment)}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
