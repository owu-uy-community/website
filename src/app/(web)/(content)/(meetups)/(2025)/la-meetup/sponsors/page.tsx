import { type Metadata } from "next";

import EmbeddedFormLayout from "components/Meetups/2024/EmbeddedFormLayout";

export const metadata: Metadata = {
  title: "Sponsors | La Meetup III",
  description:
    "Formulario de declaración de interés para ser sponsor de la tercera edición de La Meetup, el encuentro anual que reúne a las comunidades tecnológicas de Uruguay para estrechar lazos, colaborar e impulsar la cultura del software.",
};

export default function Sponsors() {
  const url =
    "https://docs.google.com/forms/d/e/1FAIpQLSeZGSpB95IZH6Texu2CqjHNw27pJye1nzEtJn5Y90gJiD0orA/viewform?embedded=true";

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
