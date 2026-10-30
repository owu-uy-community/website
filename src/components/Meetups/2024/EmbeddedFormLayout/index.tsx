import { type ReactNode } from "react";
import Footer from "components/shared/Footer";

type EmbeddedFormProps = {
  title: string;
  children?: ReactNode;
};

export default function EmbeddedFormLayout({ title, children }: EmbeddedFormProps) {
  return (
    <section className="flex w-full flex-col md:container">
      <div className="flex h-full min-h-screen flex-col items-center justify-center gap-5 py-12">
        <h1 className="text-center text-5xl font-bold text-yellow-400">{title}</h1>
        <div className="flex w-full flex-col items-center justify-center" style={{ filter: "invert(1)" }}>
          <div
            className="flex w-full flex-col items-center justify-center"
            style={{ filter: "hue-rotate(189.73deg) saturate(18.61%)" }}
          >
            {children}
          </div>
        </div>
      </div>
      <Footer />
    </section>
  );
}
