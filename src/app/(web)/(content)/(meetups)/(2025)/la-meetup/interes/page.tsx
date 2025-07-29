import { type Metadata } from "next";

import EmbeddedFormLayout from "components/Meetups/2024/EmbeddedFormLayout";
import { EXTERNAL_SERVICES } from "app/lib/constants";

export const metadata: Metadata = {
  title: "Formulario de Interés | La Meetup III",
  description: "Formulario de interés para la tercera edición de La Meetup",
};

export default function Interest() {
  const url = EXTERNAL_SERVICES.googleForms.interest2025;

  return (
    <EmbeddedFormLayout title="¡Formulario de Interés!">
      <iframe
        className="iframeembed flex min-h-[65rem] w-full max-w-[750px] flex-1 flex-col md:min-h-[46rem]"
        src={url}
        title="form"
      >
        Cargando…
      </iframe>
    </EmbeddedFormLayout>
  );
}
