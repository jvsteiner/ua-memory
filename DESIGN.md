# ua-memory — design

> Status: design only. No code written.
> Date: 2026-09-09

## 1. What it is

A Claude Code plugin that is always on, like Hindsight memory.

Hindsight injects **remembered facts**. ua-memory injects **code structure**.

At the start of every session it puts a small "architecture card" into the
context window. The card says what the project is, what its layers are, and
which files live in each layer. The agent then knows where things are before
it opens a single file.

It does not build the map. Understand-Anything (UA) builds the map.
ua-memory only reads UA's output and forces it into the session.

## 2. What already exists — verified, not assumed

Checked against `/Users/jamie/Code/sif/dashboard/.ua` on 2026-09-09.

**The map is real and complete.**
`dashboard/.ua/knowledge-graph.json` — 445 nodes, 1221 edges, 10 layers,
157 files, 14 tour steps. Built at commit `9bc4a96`.

Node types: `file` 155, `function` 259, `endpoint` 28, `class` 1, `config` 2.
Edge types: `imports` 407, `contains` 296, `exports` 236, `calls` 260,
`related` 7, `depends_on` 10, `configures` 5.

A `file` node carries: `id`, `type`, `name`, `filePath`, `summary`, `tags`,
`complexity`, `languageNotes`. A `function` node adds `lineRange`.
A `layer` carries: `id`, `name`, `description`, `nodeIds`.
Every file node belongs to exactly one layer. Zero orphans.

**Size is the whole design constraint.** Measured, not guessed:

| Payload | Tokens | Use |
|---|---|---|
| Whole graph | ~101,000 | Never inject |
| Project blurb + 10 layer descriptions | ~720 | Always on |
| **+ file paths grouped by layer** | **~1,900** | **The card** |
| + one line per file | ~8,600 | On demand only |
| Tour (14 steps) | ~3,800 | On demand only |

**UA already solved freshness. We must not rebuild it.**

`packages/core/dist/fingerprint.js` stores a SHA-256 per file plus its
function, class, import and export signatures. `analyzeChanges()` grades each
changed file `NONE` / `COSMETIC` / `STRUCTURAL`. `classifyUpdate()` then picks
`SKIP` / `PARTIAL_UPDATE` / `ARCHITECTURE_UPDATE` / `FULL_UPDATE`.

UA's own `hooks/hooks.json` already has a SessionStart hook that compares
`meta.json.gitCommitHash` against `git rev-parse HEAD` and tells the agent to
refresh — but **only if `.ua/config.json` contains `"autoUpdate": true`**.

Jamie's `dashboard/.ua/config.json` is `{"outputLanguage": "en"}`.
So auto-update is **off** today. Turning it on is step zero, and it is free.

**The whole-repo map is not built.** `/Users/jamie/Code/sif/.ua` holds only
`intermediate/` and `tmp/`. There is no `knowledge-graph.json`. That run did
not finish. The SIF repo is 1329 tracked files (417 `.rs`, 268 `.tsx`).

**The SessionStart slot is crowded.** Jamie's `~/.claude/settings.json`
already runs 5 SessionStart hooks (context-mode, a2a, hindsight, herdr,
agent-mirror). A ~1,900 token card is a real but acceptable addition.
It must stay under 2,500 tokens, hard.

## 3. What ua-memory adds

Two things. Nothing else.

### 3.1 The architecture card (always on)

A `SessionStart` hook. It reads the graph, renders a card, prints it as
`additionalContext`. Deterministic. No LLM. No network. Should run in well
under 200 ms.

The output contract, confirmed from Hindsight's own hook at
`claude-sessionstart-hook.js:2356`:

```json
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}
```

Card contents, in order:

1. **Project line** — `project.name`, languages, frameworks, `description`.
2. **Freshness line** — map commit vs `HEAD`. If they differ, name the count
   of changed files and list up to 10 paths. This is the honest warning.
3. **Layer sections** — for each of the 10 layers: name, description, and the
   file paths inside it. Paths only. No per-file summaries.
4. **Footer** — one line telling the agent the `ua-memory` CLI exists, and the
   trust rule (see 3.3).

If no `.ua` graph is found, the hook prints nothing and exits 0. Silence is
the correct behaviour in a repo without a map.

### 3.2 The query CLI (on demand)

A single command, run through Bash. It costs zero tokens until the agent
calls it. That is why we chose this over an MCP server.

| Command | Returns |
|---|---|
| `ua-memory card` | The card. Same text the hook prints. |
| `ua-memory where <text>` | Nodes whose name, tags or summary match. Path + layer. |
| `ua-memory file <path>` | Summary, layer, tags, complexity, languageNotes, its functions. |
| `ua-memory impact <path>` | Reverse edges. Who imports or calls this, to depth N. |
| `ua-memory layer <name>` | One layer's description plus every file in it. |
| `ua-memory tour` | The 14 tour steps. ~3,800 tokens. Explicit ask only. |
| `ua-memory stale` | Files changed since the map was built. |

Every command takes `--json` for machine use and defaults to short text.
Every command caps its own output; nothing may dump the graph.

### 3.3 Trust model — carried in the card itself

The card must state this, because the agent cannot tell by looking:

- **Edges are ground truth.** tree-sitter made them. `imports` and `calls`
  are reproducible from source.
- **Summaries, tags and layer names are hints.** An LLM wrote them. They may
  be out of date or simply wrong. Verify before relying on one.

## 4. Multi-root handling

The SIF repo has two `.ua` directories, and will have more. The rule:

- Walk up from `cwd` to the git root. Collect every `.ua/knowledge-graph.json`.
- If one is found, render it.
- If several are found, render the nearest one in full, and list the others as
  one line each ("also mapped: dashboard/ — 10 layers, 157 files").
- Never merge two graphs. Node ids are only unique inside one map.

## 5. Repo layout

```
~/Code/ua-memory/
  DESIGN.md              this file
  package.json           bin: ua-memory
  src/graph.ts           load + index the JSON. One pass, held in memory.
  src/card.ts            render the card
  src/queries.ts         where / file / impact / layer / stale
  src/cli.ts             argument parsing
  hooks/session-start.mjs  the hook. Calls card.ts, prints the envelope.
  hooks/hooks.json       plugin hook registration
  test/                  fixtures cut from a real .ua run
  .claude-plugin/plugin.json
```

Node + TypeScript, to match UA and the dashboard.

Tests run against a **frozen copy of a real `.ua` run**, not a hand-written
fixture. UA's schema is not documented; the only safe contract is real output.
Pin the UA version the fixture came from (currently 2.9.6, graph schema 1.0.0).

## 6. Build order

Each step has a check. Do not start the next one until the check passes.

1. **Freeze a fixture.** Copy `dashboard/.ua` into `test/fixtures/`.
   *Check:* the copy loads and reports 445 nodes, 1221 edges, 10 layers.
2. **`src/graph.ts`.** Load, validate, index by id and by filePath.
   *Check:* a test fails loudly on a missing `layers` key or a dangling edge.
3. **`src/card.ts`.** Render the card.
   *Check:* a test asserts the card is under 2,500 tokens and names all 10
   layers. This test is the budget guard — it must fail if the card grows.
4. **The hook.** Wire `hooks/session-start.mjs`.
   *Check:* run it by hand in `dashboard/`, confirm valid JSON on stdout.
   Then run it in `/tmp` and confirm empty output and exit 0.
5. **Turn on UA `autoUpdate`.** Add `"autoUpdate": true` to
   `dashboard/.ua/config.json`.
   *Check:* make a structural edit, start a session, confirm UA's own hook
   reports the graph is stale.
6. **`src/queries.ts` + CLI.**
   *Check:* `ua-memory impact src/api/client.ts` names real importers, and the
   answer matches a `grep` for that import path.
7. **Measure it.** The real test, from the transcript: take 10 past fixes from
   git history. Run plan mode with the card and without it. Score whether the
   plan names the correct files to touch.
   *Check:* a number. If the card does not improve it, this project is wrong
   and should stop.

## 6a. What building it actually found

Three things only showed up once real queries ran against the real map.

**Layers do not hold every node.** Only `file`, `endpoint` and `config` nodes
carry layer membership. All 259 `function` nodes and the 1 `class` node carry
none — they inherit a layer from their file. `layerFor()` does that walk, and
two tests pin the rule.

**The graph beat hand-written grep three times.** Every disagreement between
`ua-memory impact` and a grep turned out to be the grep's fault: a relative
`./client` import, a `../../../src/api/client` import, and `react-dom/client`
as a false positive. The 32 importers of `src/api/client.ts` are exactly right.

**Two verified holes in UA's edges, both measured.** These matter more than
anything else here, because an empty result reads as "safe to change":

- *Dynamic imports.* `src/app/pages.ts` lazy-loads 47 route screens with
  `import()`. The graph records none of them. Every page looks unreferenced.
- *Barrel re-exports.* 13 files in `src/ui` have no cross-file edge at all,
  because consumers import the `src/ui` barrel, not the file.
  `src/ui/Modal.tsx` has 20 real users and zero recorded edges.

`NO_DEPENDENTS_CAVEAT` is printed on every empty `impact` and `file` result,
and two tests pin both holes so a future UA version closing them turns the
suite red rather than passing silently.

## 7. Risks, stated plainly

- **The whole-repo map does not exist yet.** The card only helps in
  `dashboard/` until the root `.ua` run finishes. That run covers 1329 files
  and will be slow and expensive. Do step 7 on `dashboard/` first, before
  paying for the big run.
- **Layer tags may be wrong.** Nobody has audited the 10 layers against
  Jamie's own mental model. Do that by eye before trusting the card.
- **The card can rot into noise.** 1,900 tokens on every session, in a slot
  that already holds 5 hooks. The token test in step 3 is what stops drift.
- **UA schema may change.** It is undocumented. Pin the version. A schema
  guard in step 2 turns a silent wrong answer into a loud failure.
- **`impact` under-reports, and always will while the two holes above stand.**
  It is a starting set, not a complete one. The caveat says so on every empty
  result, but a non-empty result carries the same risk and says less.

## 8. Explicitly out of scope

- No MCP server. The CLI is the query surface. MCP stays open for later; the
  query code would not change.
- No graph building. UA owns that.
- No prose knowledge base. The transcript's clearest finding is that
  LLM-maintained prose goes stale. Structure is regenerated, never edited.
- No agent-decides-project-structure loop. That is the genuinely novel idea in
  the transcript and it has no prior art. It is a separate project, and it
  needs this one working first.
