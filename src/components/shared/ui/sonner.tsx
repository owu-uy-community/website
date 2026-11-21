"use client";

import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from "lucide-react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const TOAST_BOTTOM = (gap: string) =>
  `calc(max(var(--admin-tabbar-h, 0px) + var(--admin-savebar-h, 0px), var(--admin-sheet-footer-h, 0px)) + ${gap})`;

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      // The site is dark only; following the OS turned toasts white on light-mode machines.
      theme="dark"
      // A modal sets pointer-events: none on <body> and toasts inherit it: their actions
      // (Deshacer) must stay pressable while a dialog or a panel is open.
      className="toaster group pointer-events-auto"
      // Above whatever the admin has at the bottom: the phone tab bar and the save bar, or an open
      // editor panel's footer (it covers the other two); the default spacing everywhere else.
      mobileOffset={{ bottom: TOAST_BOTTOM("16px") }}
      offset={{ bottom: TOAST_BOTTOM("24px") }}
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          // Neutral surface; the state is carried by the icon color, not a loud fill.
          toast:
            "group toast pointer-events-auto group-[.toaster]:rounded-[10px] group-[.toaster]:border-input group-[.toaster]:bg-popover group-[.toaster]:text-ui group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-overlay",
          title: "group-[.toast]:text-foreground group-[.toast]:font-medium",
          description: "group-[.toast]:text-meta group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:!bg-transparent group-[.toast]:!font-medium group-[.toast]:!text-primary group-[.toast]:hover:!bg-primary/10",
          cancelButton:
            "group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground group-[.toast]:hover:bg-secondary/80",
          success: "group-[.toast]:[&_svg]:text-success-foreground",
          error: "group-[.toast]:[&_svg]:text-live-foreground",
          warning: "group-[.toast]:[&_svg]:text-warning-foreground",
          info: "group-[.toast]:[&_svg]:text-info-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
