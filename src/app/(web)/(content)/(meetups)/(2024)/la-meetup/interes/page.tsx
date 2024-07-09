import Footer from "components/shared/Footer";

export default function Intrest() {
  const url = "";

  return (
    <section className="container flex w-full flex-col">
      <div className="flex h-full min-h-screen flex-col items-center justify-center gap-5 py-12">
        <h1 className="text-center text-5xl font-bold text-yellow-400">¡Regístrate para recibir Actualizaciones!</h1>
        <iframe
          className="flex min-h-[115rem] w-full max-w-[750px] flex-1 flex-col sm:min-h-[100rem] xl:min-h-[94rem]"
          src={url}
          title="form"
        >
          Cargando…
        </iframe>
      </div>
      <Footer />
    </section>
  );
}