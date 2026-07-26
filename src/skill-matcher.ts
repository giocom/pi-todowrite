/**
 * Skill–todo matcher: recommends relevant loaded skills for each incomplete
 * todo item based on keyword overlap between the skill's name/description
 * and the todo's content text.
 *
 * Pure logic — no dependency on Pi extension API — so it can be unit-tested
 * in isolation alongside the existing store tests.
 */

import type { Skill } from "@earendil-works/pi-coding-agent";
import type { Todo } from "./store.js";

// ─── Types ────────────────────────────────────────────────────────────────

export interface MatchedSkill {
  /** The loaded skill that matched. */
  skill: Skill;
  /** The todo item the skill is recommended for. */
  todo: Todo;
  /** Relevance score from 0.0 to 1.0 (higher = stronger match). */
  relevanceScore: number;
  /** The actual tokens that overlapped between skill and todo. */
  matchedKeywords: string[];
}

export interface SkillMatcherOptions {
  /** Maximum recommendations to return across all todos (default 5). */
  maxRecommendations?: number;
  /** Minimum relevance score to include a match (default 0.05). */
  minScore?: number;
  /** Minimum token length to consider (default 3). Excludes short noise. */
  minTokenLength?: number;
  /** Optional list of stop words to filter out. */
  stopWords?: Set<string>;
}

// ─── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_RECOMMENDATIONS = 5;
const DEFAULT_MIN_SCORE = 0.05;
const DEFAULT_MIN_TOKEN_LENGTH = 2;
const DEFAULT_STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "has", "had", "how", "its", "may",
  "see", "the", "use", "way", "who", "will", "with", "about", "been",
  "each", "from", "have", "into", "like", "more", "must", "only",
  "over", "some", "than", "that", "them", "then", "this", "very",
  "what", "when", "which", "your", "should", "could", "would",
]);

// ─── Matcher ───────────────────────────────────────────────────────────────

export class SkillMatcher {
  private maxRecs: number;
  private minScore: number;
  private minTokenLen: number;
  private stopWords: Set<string>;

  constructor(options: SkillMatcherOptions = {}) {
    this.maxRecs = options.maxRecommendations ?? DEFAULT_MAX_RECOMMENDATIONS;
    this.minScore = options.minScore ?? DEFAULT_MIN_SCORE;
    this.minTokenLen = options.minTokenLength ?? DEFAULT_MIN_TOKEN_LENGTH;
    this.stopWords = options.stopWords ?? DEFAULT_STOP_WORDS;
  }

  // ── Tokenizer ──────────────────────────────────────────────────────────

  /**
   * Split text into a set of lower-cased, meaningful tokens.
   * Keeps hyphenated compounds (e.g. "react-hook-form") intact.
   */
  tokenize(text: string): Set<string> {
    const tokens = new Set<string>();
    // Split on whitespace and non-alphanumeric characters except hyphens
    // that join compound words.
    const raw = text.toLowerCase();
    // First pass: split on whitespace to keep hyphens in compounds
    for (const word of raw.split(/[\s_]+/)) {
      // Strip leading/trailing non-alphanumeric chars
      const cleaned = word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
      if (cleaned.length < this.minTokenLen) continue;
      if (this.stopWords.has(cleaned)) continue;
      // Also add individual parts of hyphenated compounds
      tokens.add(cleaned);
      if (cleaned.includes("-")) {
        for (const part of cleaned.split("-")) {
          if (part.length >= this.minTokenLen && !this.stopWords.has(part)) {
            tokens.add(part);
          }
        }
      }
    }
    return tokens;
  }

  // ── Scoring ────────────────────────────────────────────────────────────

  /**
   * Compute a simple Jaccard-like similarity between two token sets.
   * Returns |intersection| / max(|a|, |b|).
   * This gives more weight to the smaller set matching a larger portion
   * of the larger set, which works well for short texts like todo items.
   */
  private score(a: Set<string>, b: Set<string>): number {
    const denom = Math.max(a.size, b.size);
    if (denom === 0) return 0;
    let intersection = 0;
    // Iterate over the smaller set for better perf
    const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
    for (const token of smaller) {
      if (larger.has(token)) intersection++;
    }
    return intersection / denom;
  }

  // ── Matching ───────────────────────────────────────────────────────────

  /**
   * Match loaded skills against incomplete todo items.
   * Returns up to `maxRecommendations` matches, sorted by relevance
   * descending, with at most one match per skill–todo pair.
   */
  matchSkillsToTodos(todos: Todo[], skills: Skill[]): MatchedSkill[] {
    if (todos.length === 0 || skills.length === 0) return [];

    // Pre-tokenize skills
    const skillEntries = skills.map((skill) => ({
      skill,
      tokens: this.tokenize(`${skill.name} ${skill.description}`),
    }));

    const results: MatchedSkill[] = [];

    for (const todo of todos) {
      // Skip completed items — no need to recommend skills for done work
      if (todo.status === "completed") continue;

      const todoTokens = this.tokenize(todo.content);

      for (const { skill, tokens: skillTokens } of skillEntries) {
        const matchedKeywords = [...todoTokens].filter((t) =>
          skillTokens.has(t),
        );
        if (matchedKeywords.length === 0) continue;

        const relevanceScore = this.score(todoTokens, skillTokens);
        if (relevanceScore < this.minScore) continue;

        results.push({ skill, todo, relevanceScore, matchedKeywords });
      }
    }

    // Sort by score descending, then deduplicate (one skill per todo max)
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const seen = new Set<string>();
    const deduped: MatchedSkill[] = [];
    for (const r of results) {
      const key = `${r.skill.name}::${r.todo.content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }

    return deduped.slice(0, this.maxRecs);
  }

  // ── Formatting ─────────────────────────────────────────────────────────

  /**
   * Format matched skills as an XML <skill-recommendations> block suitable
   * for injection into the system prompt.
   *
   * Returns an empty string when there are no matches (caller can skip
   * appending).
   */
  formatSkillRecommendations(matched: MatchedSkill[]): string {
    if (matched.length === 0) return "";

    const lines: string[] = [
      "",
      "<skill-recommendations>",
      `Available skills relevant to current tasks (${matched.length} found):`,
      "",
    ];

    for (const m of matched) {
      const todoPreview =
        m.todo.content.length > 50
          ? m.todo.content.slice(0, 47) + "..."
          : m.todo.content;
      lines.push(
        `- Todo "${todoPreview}" → try skill \`${m.skill.name}\`: ${m.skill.description}`,
      );
    }

    lines.push(
      "",
      "Before starting each todo item, consider whether the suggested skill",
      "applies. If so, load it via the skill tool and follow its instructions",
      "during implementation.",
      "</skill-recommendations>",
    );

    return "\n" + lines.join("\n");
  }
}
