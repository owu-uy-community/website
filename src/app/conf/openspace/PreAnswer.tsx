"use client";

import { useState } from "react";

import InterestSurvey from "./InterestSurvey";
import PersonaliseCard from "./PersonaliseCard";
import { useInterests } from "./use-interests";

/** «Para vos», answered ahead of time: on the day the board already knows what to mark. */
export default function PreAnswer() {
  const { interests, ready, save } = useInterests();
  const [open, setOpen] = useState(false);

  // Same height as the card, so nothing jumps once the saved answers are read
  if (!ready) return <div aria-hidden="true" className="h-[74px] border border-[#FBF5E7]/12" />;

  return (
    <>
      <PersonaliseCard answered={interests !== null} onOpen={() => setOpen(true)} />
      <InterestSurvey
        initial={interests}
        open={open}
        submitLabel="Guardar mis temas"
        onClose={() => setOpen(false)}
        onSave={(next) => {
          save(next);
          setOpen(false);
        }}
      />
    </>
  );
}
