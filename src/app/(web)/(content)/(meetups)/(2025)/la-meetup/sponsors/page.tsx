import { type Metadata } from "next";

import EmbeddedFormLayout from "components/Meetups/2024/EmbeddedFormLayout";
import { EXTERNAL_SERVICES } from "app/lib/constants";

export const metadata: Metadata = {
  title: "Sponsors | La Meetup III",
  description:
    "Formulario de declaración de interés para ser sponsor de la tercera edición de La Meetup, el encuentro anual que reúne a las comunidades tecnológicas de Uruguay para estrechar lazos, colaborar e impulsar la cultura del software.",
};

export default function SponsorsForm() {
  const url = EXTERNAL_SERVICES.googleForms.sponsors2025;

  return (
    <EmbeddedFormLayout title="¡Formulario de Sponsors!">
      <iframe
        className="iframeembed flex min-h-[135rem] w-full max-w-[750px] flex-1 flex-col sm:min-h-[126rem] md:min-h-[130rem]"
        src={url}
        title="form"
      >
        Cargando…
      </iframe>
    </EmbeddedFormLayout>
  );
}
