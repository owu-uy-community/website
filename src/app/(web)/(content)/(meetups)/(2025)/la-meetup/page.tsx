import { type Metadata } from "next";

import Hero from "components/Meetups/2025/Hero";
import Footer from "components/shared/Footer";

export const metadata: Metadata = {
  title: "La Meetup 2025 | OWU Uruguay",
  description:
    "Tercera edición de La Meetup, el encuentro anual que reúne a las comunidades tecnológicas de Uruguay para estrechar lazos, colaborar e impulsar la cultura del software.",
};

export default function LaMeetup2025() {
  return (
    <div className="container flex w-full flex-col items-center justify-center gap-2 self-center">
      <Hero />
      <Footer />
    </div>
  );
}
