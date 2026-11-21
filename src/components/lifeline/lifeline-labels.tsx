export const LIFELINE_LABEL_COLUMN_WIDTH = 56;
export const LIFELINE_LABEL_GAP = 16;
export const LIFELINE_STICKY_SHIELD_WIDTH = LIFELINE_LABEL_COLUMN_WIDTH + LIFELINE_LABEL_GAP;
export const LIFELINE_STICKY_LEFT = 20;

export function LifelineStickyLabels() {
  return (
    <div className="relative" style={{ width: LIFELINE_LABEL_COLUMN_WIDTH }} aria-hidden="true">
      <div className="flex flex-col items-start text-left">
        <p className="mb-5 h-4 text-[11px] leading-4 font-medium tracking-[0.08em] text-zinc-500 uppercase transition-colors duration-300 dark:text-zinc-400">
          Eventos
        </p>
        <p className="mb-6 h-5 text-[11px] leading-5 font-medium tracking-[0.08em] text-zinc-500 uppercase transition-colors duration-300 dark:text-zinc-400">
          Año
        </p>
      </div>
    </div>
  );
}
