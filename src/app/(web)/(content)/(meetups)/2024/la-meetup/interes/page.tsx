import EmbeddedFormLayout from "components/Meetups/2024/EmbeddedFormLayout";

export default function Intrest() {
  const url =
    "https://docs.google.com/forms/d/e/1FAIpQLSe7QPkYcoz1tZ-j4N-BvqNfkLMtp9Oq8vQ285mTR7EuJPDVnw/viewform?embedded=true";

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
