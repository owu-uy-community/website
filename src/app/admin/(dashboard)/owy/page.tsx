import { redirect } from "next/navigation";

/** Bare /admin/owy would otherwise fall into the [communitySlug] catch-all. */
export default function OwyAdminIndex() {
  redirect("/admin/owy/scenes");
}
