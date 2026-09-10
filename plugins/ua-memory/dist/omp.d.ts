/**
 * The omp / Pi adapter.
 *
 * omp (`@oh-my-pi/pi-coding-agent`) borrows a great deal from Claude Code — it
 * loads `.claude/skills`, `.claude/commands`, `.claude/settings.json` and even
 * hooks from Claude Code marketplace plugins. It does not load SessionStart
 * hooks: its Claude hook bridge covers tool hooks, and the string
 * "SessionStart" appears nowhere in the omp binary. Asked directly whether the
 * card was in its context, omp answered NO.
 *
 * The equivalent seam is `before_agent_start`, where an extension may return a
 * replacement `systemPrompt`. That is how `pi-output-styles` swaps the
 * personality slot, and it is the shape this follows.
 *
 * Everything above the delivery seam — finding the map, rendering the card,
 * trimming it — is the same code the Claude Code hook runs. Only the last step
 * differs.
 */
/** The card's own heading, used to detect a card already in the prompt. */
export declare const CARD_MARKER = "# Codebase map \u2014 ";
interface AgentEvent {
    systemPrompt?: string | string[];
}
interface AgentContext {
    cwd?: string;
}
interface PiHost {
    on(event: string, handler: (event: AgentEvent, ctx: AgentContext) => unknown): void;
}
export default function createExtension(pi: PiHost): void;
export {};
