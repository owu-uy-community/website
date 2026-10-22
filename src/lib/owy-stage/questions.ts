import type { Moderation, StageInput } from "./scenes";

export type RankedQuestion = StageInput & { votes: number };

const RANK: Record<Moderation, number> = { pinned: 0, "": 1, answered: 2, hidden: 3 };

/**
 * Every question of a round with its votes (`up:<id>` inputs), in the order the wall shows them:
 * pinned first, then the open ones, then the answered ones — each group by votes, then oldest
 * first. Hidden ones come last, for the desk that can bring them back.
 */
export function rankQuestions(inputs: StageInput[]): RankedQuestion[] {
  const votes = new Map<string, number>();
  for (const input of inputs) {
    if (input.key.startsWith("up:")) votes.set(input.key.slice(3), (votes.get(input.key.slice(3)) ?? 0) + 1);
  }

  return inputs
    .filter((input) => input.key === "question")
    .map((question) => ({ ...question, votes: votes.get(question.id) ?? 0 }))
    .sort(
      (a, b) => RANK[a.moderation] - RANK[b.moderation] || b.votes - a.votes || a.createdAt.localeCompare(b.createdAt)
    );
}

/** What the wall and the phones list: the same order, without the hidden ones. */
export const visibleQuestions = (inputs: StageInput[]) =>
  rankQuestions(inputs).filter((question) => question.moderation !== "hidden");
