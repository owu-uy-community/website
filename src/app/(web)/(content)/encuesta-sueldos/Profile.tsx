import { Stagger } from "components/community/reveal";
import { cardClassName } from "components/community/ui";
import type { ProfileDimension } from "lib/orpc/salary-survey/schemas";

const MARK = "#c98500";
const count = new Intl.NumberFormat("es-UY");
const percent = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** One question, as a bar per option: the label and the count in text, the bar for the eye */
function Dimension({ dimension }: { dimension: ProfileDimension }) {
  const rows = [
    ...dimension.groups,
    ...(dimension.other > 0 ? [{ key: "otros", label: "Otros", n: dimension.other }] : []),
  ];
  const max = Math.max(...rows.map((row) => row.n), 1);

  return (
    <figure className={cardClassName(false, "flex flex-col gap-4 p-5 sm:p-6")}>
      <figcaption className="flex items-baseline justify-between gap-3">
        <h3 className="font-title text-[17px] font-semibold text-zinc-50">{dimension.label}</h3>
        <span className="text-xs text-zinc-500 tabular-nums">{count.format(dimension.answered)} respuestas</span>
      </figcaption>
      <ol className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
            <span className={row.key === "otros" ? "truncate text-zinc-500" : "truncate text-zinc-300"}>
              {row.label}
            </span>
            <span className="text-right text-xs text-zinc-500 tabular-nums">
              <span className="text-zinc-200">{percent(row.n, dimension.answered)}%</span> · {count.format(row.n)}
            </span>
            <span className="col-span-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${(row.n / max) * 100}%`,
                  backgroundColor: MARK,
                  opacity: row.key === "otros" ? 0.35 : 0.85,
                }}
              />
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** Who answered: the closed questions, one card each; options under the threshold are folded into "Otros" */
export default function Profile({ dimensions }: { dimensions: ProfileDimension[] }) {
  return (
    <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {dimensions
        .filter((dimension) => dimension.groups.length > 0)
        .map((dimension) => (
          <Dimension key={dimension.key} dimension={dimension} />
        ))}
    </Stagger>
  );
}
