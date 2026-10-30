import { requirePermission } from "app/lib/auth-helpers";

import EncuestaClient from "./EncuestaClient";

export default async function EncuestaPage() {
  await requirePermission("salarySurvey:manage");

  return <EncuestaClient />;
}
