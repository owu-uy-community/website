import EmbeddedFormLayout from "components/Meetups/2024/EmbeddedFormLayout";

export const metadata = {
  title: "Sponsors | OWU Uruguay",
  description: "Te invitamos a formar parte de la comunidad de sponsors de La Meetup II",
};

export default function Sponsors() {
  const url =
    "https://docs.google.com/forms/d/e/1FAIpQLSemC7vrDw38LTWcBUhIYjarqMMVUfE-dSnBPUAsNzBWd6uqcQ/viewform?embedded=true";

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
