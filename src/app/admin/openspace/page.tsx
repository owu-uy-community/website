import { requireAdmin } from "app/lib/auth-helpers";
import OpenSpaceClient from "./OpenSpaceClient";

export default async function OpenSpacePage() {
  // Validate admin access
  await requireAdmin();

  // Render the client component
  return <OpenSpaceClient />;
}
