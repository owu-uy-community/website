import { useLayoutEffect, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { beforeAll, describe, expect, test } from "vitest";

import { EditorPanel } from "./panel";

/** Opens the panel and, when asked, closes it again in the same commit (a guess that a layout effect corrects). */
function Harness() {
  const [open, setOpen] = useState(false);
  const [bounce, setBounce] = useState(false);
  useLayoutEffect(() => {
    if (bounce && open) {
      setBounce(false);
      setOpen(false);
    }
  }, [bounce, open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setBounce(true);
          setOpen(true);
        }}
      >
        Abrir y cerrar
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <EditorPanel open={open} title="Panel" onOpenChange={setOpen}>
        <p>Contenido</p>
      </EditorPanel>
    </>
  );
}

/** Two panels that open independently: whichever opens last must cover the other. */
function Stack({ first, second }: { first: boolean; second: boolean }) {
  return (
    <>
      <EditorPanel open={second} title="Segundo" onOpenChange={() => undefined}>
        <p>Abajo en el árbol, arriba en pantalla</p>
      </EditorPanel>
      <EditorPanel open={first} title="Primero" onOpenChange={() => undefined}>
        <p>Primero</p>
      </EditorPanel>
    </>
  );
}

describe(EditorPanel, () => {
  // happy-dom's Web Animations reject when motion cancels them; the bug is in the bookkeeping, not the timing.
  beforeAll(() => {
    MotionGlobalConfig.skipAnimations = true;
  });

  test("a panel closed in the same commit it opened leaves the screen, and the page still opens it again", async () => {
    render(<Harness />);

    act(() => fireEvent.click(screen.getByRole("button", { name: "Abrir y cerrar" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    await expect(screen.findByRole("dialog", { name: "Panel" })).resolves.toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("the panel opened last sits on top, whatever their order in the page", async () => {
    const { rerender } = render(<Stack first second={false} />);
    await screen.findByRole("dialog", { name: "Primero" });
    rerender(<Stack first second />);

    const second = await screen.findByRole("dialog", { name: "Segundo" });
    // The second modal hides the first from assistive tech; it's still there, under it.
    const first = screen.getByText("Primero", { selector: "h2" }).closest("[role=dialog]");
    // Both are z-50 and fixed: the later one in the document paints over the other.
    expect(first?.compareDocumentPosition(second)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
