import EmbeddedFormLayout from "components/Meetups/2024/EmbeddedFormLayout";
import { EXTERNAL_SERVICES } from "app/lib/constants";

export default function Intrest() {
  const url = EXTERNAL_SERVICES.googleForms.interest2024;

  return (
    <EmbeddedFormLayout title="¡Formulario de Interés!">
      <iframe
        className="iframeembed flex min-h-[70rem] w-full max-w-[750px] flex-1 flex-col md:min-h-[60rem]"
        src={url}
        title="form"
      >
        Cargando…
      </iframe>
    </EmbeddedFormLayout>
  );
}
