/**
 * Prompt templates for the unified analyzer.
 * All static text lives here; functions accept only the dynamic variables
 * they need for interpolation.
 */

/** Static system prompt — no variables needed. */
export const SYSTEM_PROMPT = `You are a time-tracking assistant. Your job is to allocate work hours to TargetProcess tasks based on activity signals.

RULES:
1. Output ONLY valid JSON — no prose, no markdown fences, no explanations.
2. The sum of all "inferredHours" MUST equal the "oreTarget" value exactly (rounded to 2 decimal places).
3. Use signals (calendar events, Teams messages, git/SVN commits) to infer which tasks were worked on and for how long.
4. When signals are scarce, distribute hours proportionally across active tasks weighted by recent activity.
5. For recurring activities (standup etc.) that are pre-seeded, keep their hours as-is and distribute the remainder.
6. Return a JSON array of ProposalEntry objects.`;

/** Builds the user instruction string with interpolated variables. */
export function userInstruction(remainingHours: number, oreTarget: number): string {
    return `Allocate exactly ${remainingHours.toFixed(2)}h across the active tasks. ` +
        `Return a JSON array of ProposalEntry objects (include the pre-seeded entries). ` +
        `Total must equal ${oreTarget.toFixed(2)}h.`;
}
