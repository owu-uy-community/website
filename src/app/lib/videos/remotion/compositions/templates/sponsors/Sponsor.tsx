import clsx from "clsx";

type Sponsor = {
  name: string;
  image: string;
  isEven: boolean;
};

export function Sponsor({ name, image, isEven }: Sponsor) {
  return (
    <div
      className={clsx(
        "relative flex max-w-[300px] min-w-[250px] flex-1 flex-col items-center justify-center rounded-md bg-white/10 p-[1px] transition-all",
        isEven ? "" : "-translate-x-[90rem]"
      )}
    >
      <div
        className={clsx(
          "flex w-full flex-1 flex-col items-center justify-center gap-2 rounded-md bg-[#000214]/50 px-6 py-2 transition"
        )}
      >
        <figure className="flex items-center justify-center">
          <img
            alt={name}
            className="h-48 w-56 rounded-md object-contain brightness-0 contrast-100 invert filter transition"
            loading="lazy"
            src={image}
          />
        </figure>
      </div>
    </div>
  );
}
