export function DogEar() {
  return (
    <div
      className="pointer-events-none absolute right-0 top-0 h-3 w-3 opacity-30"
      style={{
        background: "linear-gradient(-45deg, transparent 40%, rgba(0, 0, 0, 0.1) 50%, transparent 60%)",
        borderRadius: "0 0 0 100%",
        transform: "rotate(45deg) translate(2px, -2px)",
      }}
    />
  );
}
