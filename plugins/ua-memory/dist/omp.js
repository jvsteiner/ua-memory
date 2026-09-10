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
            // Unlike SessionStart, before_agent_start fires every turn. Appending
            // without this guard stacks a copy of the card per turn for the whole
            // session. Returning undefined leaves the prompt untouched.
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
