import type { Metadata } from "next";

import PlayClient from "./PlayClient";

export const metadata: Metadata = {
  title: "Participá · OWU CONF",
  robots: { index: false, follow: false },
};

/** The phone side of the interactive scenes: follows the wall and asks for the right input. */
export default function OwyPlayPage() {
  return <PlayClient />;
}
