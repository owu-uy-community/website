export default function Introduction() {
  return (
    <div className="flex w-full max-w-[1200px] flex-col items-center gap-5" id="bienvenida">
      <span>
        <h2 className="text-center text-5xl font-bold text-yellow-400">¿De qué se trata?</h2>
        <p className="mt-2 text-center text-lg font-[400] text-white">¡Bienvenidos a la edición 2024 de La Meetup!</p>
      </span>
      <img alt="Bienvenidos" className="w-full max-w-[800px]" src="/welcome.svg" />
      <div className="flex max-w-[820px] flex-col gap-2">
        <p className="text-white xl:text-center">
          <b>La Meetup</b> ofrece un espacio para reunirnos en persona y conectar con comunidades de tecnología locales.
        </p>
        <p className="text-white xl:text-center">
          Este evento es un punto de encuentro para profesionales, estudiantes y entusiastas de la tecnología de todo el
          país. Es una gran oportunidad para intercambiar ideas, compartir experiencias y construir relaciones que
          fomenten el crecimiento y la unidad dentro de la comunidad tecnológica uruguaya.
        </p>
      </div>
    </div>
  );
}
