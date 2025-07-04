import { type Metadata } from "next";

import EmbeddedFormLayout from "components/Meetups/2024/EmbeddedFormLayout";

export const metadata: Metadata = {
  title: "Formulario de Interés | La Meetup III",
  description: "Formulario de interés para la tercera edición de La Meetup",
};

export default function Intrest() {
  const url =
    "https://docs.google.com/forms/d/e/1FAIpQLSf5c4z67ZcVvv7ONQYhlzaXXsRd0ZWyBrLKamtXanD3b1Bz4w/viewform?embedded=true";

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
