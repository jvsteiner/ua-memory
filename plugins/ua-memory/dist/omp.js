import { buildCardFor } from "./session.js";
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
export const CARD_MARKER = "# Codebase map — ";
export default function createExtension(pi) {
    // One card per working directory, computed once. buildCardFor reads a 2 MB
    // JSON in the worst case, and before_agent_start runs on every turn.
    let cachedCwd;
    let cachedCard = null;
    pi.on("before_agent_start", (event, ctx) => {
        try {
            const cwd = ctx?.cwd ?? process.cwd();
            if (cwd !== cachedCwd) {
                cachedCwd = cwd;
                cachedCard = buildCardFor(cwd);
            }
            if (!cachedCard)
                return;
            const incoming = event?.systemPrompt;
            // Measured, because the guess was wrong: `before_agent_start` fires once
            // per user message — not once per agent step — and omp rebuilds the
            // system prompt from base each time. Two probes, one registered before
            // this adapter and one after, showed a two-tool-call turn firing the
            // event exactly once, with zero cards in the incoming prompt.
            //
            // So nothing accumulates and this check never fires today. It stays as
            // one cheap line of insurance against omp changing that, and because
            // appending twice would be invisible rather than loud. It is not load
            // bearing, and a comment claiming otherwise sent someone chasing a
            // problem that did not exist.
            if (typeof incoming === "string") {
                if (incoming.includes(CARD_MARKER))
                    return;
                return { systemPrompt: `${incoming}\n\n${cachedCard}` };
            }
            if (Array.isArray(incoming)) {
                if (incoming.some((part) => typeof part === "string" && part.includes(CARD_MARKER)))
                    return;
                return { systemPrompt: [...incoming, cachedCard] };
            }
            // Some other shape — omp returns string[], Pi a string, and anything
            // else is a version we do not understand. Change nothing.
            return;
        }
        catch {
            // An extension that throws here costs the user their turn. The card is
            // a convenience; failing to add it must never be worse than not having
            // installed it at all.
            return;
        }
    });
}
