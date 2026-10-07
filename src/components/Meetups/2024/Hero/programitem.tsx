"use client";
import { type ProgramItem, ProgramBox, ProgramContent, ProgramFlex, ProgramStack, useProgram } from "planby";

export function Program({ program, ...rest }: ProgramItem) {
  const { styles, formatTime, set12HoursTimeFormat } = useProgram({
    program,
    ...rest,
  });

  const { data } = program;
  const { since, till, title } = data;

  const sinceTime = formatTime(since, set12HoursTimeFormat()).toLowerCase();
  const tillTime = formatTime(till, set12HoursTimeFormat()).toLowerCase();

  return (
    <ProgramBox className="relative" style={styles.position} width={styles.width}>
      <ProgramContent
        className="w-full px-3"
        isLive={false}
        style={{
          padding: "10px",
        }}
        width={styles.width}
      >
        <ProgramFlex>
          <ProgramStack>
            <p className="text-[10px] text-white">{title}</p>
            <p className="absolute bottom-2.5 left-2.5 mt-1 text-[10px] text-gray-400">Agustín Tornielli</p>
            <p className="absolute right-2.5 bottom-2.5 mt-1.5 text-[10px] text-gray-400">
              {sinceTime} - {tillTime}
            </p>
          </ProgramStack>
        </ProgramFlex>
      </ProgramContent>
    </ProgramBox>
  );
}
