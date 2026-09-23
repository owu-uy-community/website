"use client";

import { useCallback, useEffect, useState } from "react";

import { isGoalId, isTopicId, type GoalId, type TopicId } from "lib/openspace/topics";

export type Interests = { topics: TopicId[]; goal: GoalId };

const STORAGE_KEY = "owu:openspace:interests";

/**
 * What the visitor told us they came for, kept in localStorage.
 *
 * No account and no server record on purpose: this is a public page somebody
 * opens once while standing in a hallway, the answers are only used to reorder
 * a list on their own phone, and nothing about it is worth asking them to log
 * in for — or worth us storing.
 *
 * Reading is deferred to an effect so the first client render matches the
 * server's (which has no localStorage); `ready` distinguishes "not answered"
 * from "not loaded yet" so the survey does not flash on every visit.
 */
export function useInterests() {
  const [interests, setInterests] = useState<Interests | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const { topics, goal } = parsed as { topics?: unknown; goal?: unknown };
          const validTopics = Array.isArray(topics) ? topics.filter((t): t is TopicId => typeof t === "string" && isTopicId(t)) : [];
          const validGoal = typeof goal === "string" && isGoalId(goal) ? goal : "todo";
          if (validTopics.length > 0) setInterests({ topics: validTopics, goal: validGoal });
        }
      }
    } catch {
      // Private mode, corrupted value — behave as if nothing was ever saved.
    }
    setReady(true);
  }, []);

  const save = useCallback((next: Interests) => {
    setInterests(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Still works for this session even if it cannot be persisted.
    }
  }, []);

  const clear = useCallback(() => {
    setInterests(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to do
    }
  }, []);

  return { interests, ready, save, clear };
}
