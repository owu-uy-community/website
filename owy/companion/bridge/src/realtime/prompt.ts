import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * System instruction for the voice session = Owy's own persona + a voice
 * addendum + the public knowledge pack, all read from the agent folder so the
 * companion never drifts from the Slack/Telegram Owy.
 *
 * Layout (relative to this file):
 *   ../../../../agent/instructions.md
 *   ../../../../agent/sandbox/workspace/knowledge/*.md
 *   ../../prompts/companion.md
 */

const HERE = import.meta.dirname;
export const AGENT_DIR = path.resolve(HERE, "../../../../agent");
export const KNOWLEDGE_DIR = path.join(AGENT_DIR, "sandbox/workspace/knowledge");
export const COMPANION_PROMPT_PATH = path.resolve(HERE, "../../prompts/companion.md");

export interface PromptBundle {
  instructions: string;
  companion: string;
  knowledge: { file: string; content: string }[];
  /** Fully assembled system instruction. */
  system: string;
}

export interface PromptVariables {
  /** Public URL of the open-space grid, shown/announced when relevant. */
  gridUrl?: string;
  eventName?: string;
  deviceId?: string;
}

export async function loadPromptBundle(vars: PromptVariables = {}): Promise<PromptBundle> {
  const [instructions, companionRaw, files] = await Promise.all([
    readFile(path.join(AGENT_DIR, "instructions.md"), "utf8"),
    readFile(COMPANION_PROMPT_PATH, "utf8"),
    readdir(KNOWLEDGE_DIR),
  ]);

  const knowledge = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .sort()
      .map(async (file) => ({ file, content: await readFile(path.join(KNOWLEDGE_DIR, file), "utf8") }))
  );

  const companion = interpolate(companionRaw, vars);
  return { instructions, companion, knowledge, system: assemble(instructions, companion, knowledge) };
}

export function assemble(
  instructions: string,
  companion: string,
  knowledge: { file: string; content: string }[]
): string {
  const knowledgeBlock = knowledge
    .map(({ file, content }) => `<archivo nombre="${file}">\n${content.trim()}\n</archivo>`)
    .join("\n\n");

  return [
    "# Instrucciones base de Owy",
    instructions.trim(),
    "",
    "# Modo companion (voz, dispositivo físico)",
    "Las reglas de esta sección tienen prioridad sobre las instrucciones base cuando se contradicen.",
    companion.trim(),
    "",
    "# Conocimiento",
    "Todo el contenido de /workspace/knowledge/ ya está acá abajo: no intentes leer archivos ni usar herramientas para eso.",
    knowledgeBlock,
  ].join("\n");
}

function interpolate(template: string, vars: PromptVariables): string {
  return template
    .replaceAll("{{gridUrl}}", vars.gridUrl ?? "https://owu.uy/conf")
    .replaceAll("{{eventName}}", vars.eventName ?? "OWU Conf 2026")
    .replaceAll("{{deviceId}}", vars.deviceId ?? "companion");
}
