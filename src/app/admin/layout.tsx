import type React from "react";

// Pass-through: the dashboard chrome lives in (dashboard)/layout.tsx so a
// fullscreen admin surface can opt out of it by sitting outside that group.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
