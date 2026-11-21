import { encode } from "uqr";

/** A QR code as crisp SVG, black on white so any phone (and any printer) reads it. */
export function QrCode({
  value,
  size,
  title,
  className,
}: {
  value: string;
  size: number;
  title: string;
  className?: string;
}) {
  const qr = encode(value, { border: 2, ecc: "M" });
  const path = qr.data.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ""))).join("");

  return (
    <svg
      className={className}
      height={size}
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      width={size}
    >
      <title>{title}</title>
      <rect fill="#fff" height={qr.size} width={qr.size} />
      <path d={path} fill="#000" />
    </svg>
  );
}
