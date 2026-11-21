const background =
  "linear-gradient(90deg, rgba(0, 0, 0, 0) 0%, rgba(255, 255, 255, 0.0) 0%, rgba(143, 143, 143, 0.67) 50%, rgba(0, 0, 0, 0) 100%)";

export function Card() {
  return (
    <div className="border-slate-6 relative flex flex-col gap-4 rounded-3xl border border-b-0">
      <div
        aria-hidden="true"
        className="user-select-none center pointer-events-none absolute top-0 left-1/2 h-px w-[150px] max-w-full -translate-x-1/2 -translate-y-1/2"
        style={{ background }}
      />
      <div
        aria-hidden="true"
        className="user-select-none pointer-events-none absolute -top-0.5 -left-0.5 -z-1 h-[calc(100%_+_4px)] w-[calc(100%_+_4px)]"
        style={{ background: "linear-gradient(180deg, #00000000 0%, #000 50%, #000 100%)" }}
      />
    </div>
  );
}
