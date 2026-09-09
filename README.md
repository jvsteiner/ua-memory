# ua-memory

Put the shape of the codebase in front of the agent **before** it starts looking.

A Claude Code plugin that is always on, like a memory plugin. A memory plugin
injects remembered facts. This injects **code structure**: at the start of every
session it adds a small architecture card saying what the project is, what its
layers are, and which files live in each layer.

It does not build the map. [Understand-Anything][ua] builds the map. ua-memory
reads what UA already committed and forces it into the session — the part UA
does not do, because its graph is context-on-request behind slash commands.

[ua]: https://github.com/Egonex-AI/Understand-Anything

## Why a card, and why this size

The whole graph is far too big to inject. These are measured on a real 157-file
map, not estimated:

| Payload | Tokens |
|---|---|
| Whole graph | ~101,000 |
| Project blurb + layer descriptions | ~720 |
| **+ file paths grouped by layer** | **~1,900** ← the card |
| + one line per file | ~8,600 |

`TOKEN_BUDGET` in `src/card.ts` caps the card at 2,500 tokens, and a test fails
if it grows past that. The session-start slot is shared with every other hook
you have installed, so silent growth would go unnoticed.

## Install

```bash
claude
/plugin marketplace add jvsteiner/ua-memory
/plugin install ua-memory@ua-memory
```

The repo ships its own `dist/`, so it runs straight from a clone with no build
step. CI proves that committed output still matches `src/`.

You also need a map. In the repo you want mapped:

```bash
/understand
```

That writes `.ua/knowledge-graph.json`. With no map, ua-memory prints nothing
and exits cleanly — silence is the right behaviour in an unmapped repo.

### Keep the map fresh

UA already does this, but it is off by default. Add to `.ua/config.json`:

```json
{ "autoUpdate": true }
```

UA then compares the map's commit against `HEAD` at session start and refreshes
when source structure actually changed. It grades each changed file
`NONE` / `COSMETIC` / `STRUCTURAL`, so a comment edit does not trigger a rebuild.

## The CLI

The card says where things live. The CLI answers the follow-up questions. It
runs through Bash, so it costs nothing until it is called — which is why it is
a CLI and not an MCP server, whose tool definitions would spend tokens in every
session whether used or not.

```
ua-memory card              the card itself
ua-memory where <text>      find nodes by name, tag or summary
ua-memory file <path>       what a file is, holds, and touches
ua-memory impact <path>     what would feel a change to this file
ua-memory layer <name>      one layer's description and its files
ua-memory stale             files changed since the map was built
ua-memory tour              the guided tour (~3,800 tokens)
ua-memory doctor            map location, freshness, data problems
```

Options: `--json`, `--depth <n>` (impact, max 3), `--limit <n>` (where),
`--root <path>`.

## What to trust

The card says this too, because an agent cannot tell by looking:

- **Import and call edges are facts.** tree-sitter parsed them. On the test
  repo, every disagreement between `ua-memory impact` and a hand-written grep
  turned out to be the grep's fault.
- **Summaries, tags and layer names are hints.** An LLM wrote them. Verify
  before relying on one.

## What it misses

Two holes in UA's edge extraction, both measured on the test map. They matter,
because an empty result reads as *"nothing uses this, safe to change"*:

- **Dynamic imports.** A route registry that lazy-loads 47 screens with
  `import()` produces zero edges. Every one of those screens looks unreferenced.
- **Barrel re-exports.** 13 files behind an `index.ts` barrel had no cross-file
  edge at all. One of them had 20 real users and zero recorded edges.

`impact` therefore **under-reports**. It gives a starting set, never a complete
one. Every empty result prints a caveat saying so, and tests pin both holes, so
a future UA version that closes one turns the suite red rather than passing
quietly.

## Development

```bash
npm install
npm test          # 36 tests
npm run typecheck
npm run build     # dist/ is committed; commit it after changing src/
```

Tests run against a frozen copy of a real UA run in `test/fixtures/`, not a
hand-written fixture. UA's graph schema is undocumented, so real output is the
only contract worth writing against. Pinned at UA 2.9.6, graph schema 1.0.0.

`DESIGN.md` has the reasoning, the measurements, and what building it found.

## Licence

MIT
