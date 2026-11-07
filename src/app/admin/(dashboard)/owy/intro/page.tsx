import type { Metadata, Viewport } from "next";

import { requirePermission } from "app/lib/auth-helpers";
import { IntroPresenter } from "components/Admin/intro/IntroPresenter";

/** The open space intro's presenter view: a USB clicker on this laptop moves the wall. */
export const metadata: Metadata = { title: "Intro open space" };

export const viewport: Viewport = { themeColor: "#0b0b0d" };

export default async function IntroPresenterPage() {
  await requirePermission("stage:operate");

  return <IntroPresenter />;
}
