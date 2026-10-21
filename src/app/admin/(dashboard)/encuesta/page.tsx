import { requireAdmin } from "app/lib/auth-helpers";

import EncuestaClient from "./EncuestaClient";

export default async function EncuestaPage() {
  await requireAdmin();

  return <EncuestaClient />;
}
