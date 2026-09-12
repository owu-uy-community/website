// Local-only visual test host for the SAME admin workbench component. No admin
// shell, auth bypass, server API, credentials, or production fixture effects.
import { createRoot } from "react-dom/client";
import CompanionWorkbench from "../../../src/components/Companion/CompanionWorkbench";
createRoot(document.getElementById("root")!).render(<CompanionWorkbench />);
