import Link from "next/link";

type ConductCodeProps = {
  title: string;
  subtitle: string;
  introduction: string;
  expectations: string;
  unacceptableBehaviors: string[];
  consequences: string;
  participationAgreement: string;
  scope: string;
};

export default function CoductCode({
  title,
  subtitle,
  introduction,
  expectations,
  unacceptableBehaviors,
  consequences,
  participationAgreement,
  scope,
}: ConductCodeProps) {
  return (
    <section
      className="relative flex w-full max-w-[800px] flex-1 flex-col items-center justify-center gap-4 py-[64px]"
      id="codigo-conducta"
    >
      <span>
        <h2 className="text-center text-4xl font-bold text-yellow-400">{title}</h2>
        <p className="mt-1.5 text-base font-[400] text-white">{subtitle}</p>
      </span>
      <div className="flex max-w-[800px] flex-col gap-2 text-white">
        <p>{introduction}</p>
        <p>{expectations}</p>
        <h2 className="mb-2 text-lg font-semibold">Comportamientos inaceptables:</h2>
        <ul className="mb-4 list-disc pl-6">
          {unacceptableBehaviors.map((behavior) => (
            <li key={behavior}>{behavior}</li>
          ))}
        </ul>
        <h2 className="mb-2 text-lg font-semibold">Consecuencias de comportamientos inaceptables:</h2>
        <p className="mb-4">{consequences}</p>
        <p className="mb-4">{participationAgreement}</p>
        <p>{scope}</p>
        <p className="mt-4 text-sm text-zinc-400">
          Hoy rige un código para toda la comunidad:{" "}
          <Link className="text-yellow-400 underline underline-offset-4" href="/codigo-de-conducta">
            owu.uy/codigo-de-conducta
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
