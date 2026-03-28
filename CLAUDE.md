# CLAUDE.md — Kindling

> This file is the agent's permanent memory for this project.
> Every convention, mistake pattern, and architectural decision lives here.
> Update this file whenever the agent does something wrong so it never happens again.

---

## Identity

**Project:** Kindling — agent SEO for the agent economy
**Owner:** Zoz / Permanent Upper Class (PUC)
**Brand:** @zozDOTeth / Kindling (github.com/Kind-ling)
**Agent router:** OpenClaw (multi-model, gateway at localhost)

## Current Product State

| Product | Status | npm | Repo |
|---------|--------|-----|------|
| **Twig** | Shipped v0.1.0 | `@kind-ling/twig` | github.com/Kind-ling/twig |
| **Heat** | Shipped v0.1.0 | `@kind-ling/heat` | github.com/Kind-ling/heat |
| **Flint** | Built, private beta | — | github.com/Kind-ling/flint |
| **Igniter** | Shipped v0.1.0 | `@kind-ling/igniter` | github.com/Kind-ling/igniter |
| **KindSoul** | Active Moltbook persona | — | (private) |

## Non-Build List

Do NOT build any of these. They are explicitly out of scope:
- MCPay (exists already — compose with it, don't replace it)
- ERC-8004 identity standard (not our problem)
- x402-discovery index (someone else's lane — we read it, we don't build it)
- AgentScore / SlinkyLayer (competitor territory)
- A social network (Moltbook exists — Flint optimizes for it)

## What Was Actually Built (vs. Original Spec)

### Twig (v0.1.0)
- **Spec called for:** Monorepo, `packages/twig-core/`, 5 scoring dimensions (clarity, specificity, agent-readability, keyword density, action-orientation)
- **What shipped:** Flat repo structure, 3 dimensions (Intent Match 40%, Specificity 35%, Differentiation 25%), CLI (`twig analyze`, `twig optimize`)
- **Scoring:** Grade system A/B/C/D/F, composite 0-100
- **Optimizer:** 3 variant styles (functional, structured, contextual); preserves good descriptions (specificity ≥ 45 && length > 80)
- **Tests:** 12 passing (Vitest)

### Heat (v0.1.0)
- **What shipped:** Express API, dual-graph reputation oracle (Moltbook social + x402 economic)
- **Endpoints:** `/heat/score` (free), `/heat/route` ($0.001), `/heat/trust` ($0.001), `/heat/compose` ($0.005)
- **Combined rank:** 70% Heat score + 30% Twig description score
- **Anti-sybil:** karma farming, upvote clusters, burst activity, wash trading detection
- **Tests:** 24 passing (Vitest)

### Igniter (v0.1.0)
- **What shipped:** x402 + MCP + A2A scaffolding middleware
- **Tests:** 16 passing (Vitest)

## Tech Stack

- **Language:** TypeScript (Node.js)
- **Package manager:** npm (not pnpm — repos were scaffolded with npm)
- **Repo structure:** Flat repos per product (NOT monorepo — do not restructure)
- **Testing:** Vitest
- **CI:** GitHub Actions
- **Deployment:** npm packages + Cloudflare Workers (planned for Heat API)
- **Payments:** x402 protocol on Base (USDC)
- **Agent protocols:** MCP (Model Context Protocol) + A2A (Agent-to-Agent)

## Design System

- **Typeface (display):** Anybody
- **Typeface (mono):** IBM Plex Mono
- **Typeface (serif):** Source Serif 4
- **Primary color (ember):** #E8652A
- **Background (void):** #08080B

## Code Conventions

### Exports
- Always use **named exports**. Never use default exports.
- Exception: CLI entry points if the runtime requires it.

### File Structure (flat repo, not monorepo)
```
src/
  [domain]/
    types.ts        # Types for this domain
    [module].ts     # Implementation
  index.ts          # Public API (named exports)
tests/              # Mirror src/ structure
  [domain]/
    [module].test.ts
```

### Tests
- Tests go in the `tests/` directory at the repo root, mirroring `src/` structure.
- Never put tests in `src/__tests__/`.
- Every new function with non-trivial logic gets a test.
- Use `describe`/`it` blocks, not `test()`.
- Prefer concrete assertions over snapshot tests.

### Naming
- Files: `kebab-case.ts`
- Types/interfaces: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- API routes: `kebab-case`

### Error Handling
- Never swallow errors silently.
- Use custom error classes extending a base `KindlingError`.
- Always include context: what was being attempted, what failed, what the input was.
- Log errors with structured JSON (not string interpolation).

### API Design
- All endpoints return `{ data, error, meta }` envelope.
- Use HTTP status codes correctly (don't 200 everything).
- Version APIs in the URL path: `/v1/audit`, `/v1/route`.
- Include `X-Kindling-Request-Id` header on all responses.

### TypeScript
- `strict: true` always
- No `any`. Use `unknown` and narrow.
- No `console.log` in production code. Use structured logger.

### Git
- Commit messages: `type(scope): description` (conventional commits)
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `chore`
- Scopes: `twig`, `heat`, `flint`, `igniter`, `shared`, `infra`
- One logical change per commit. Don't bundle unrelated changes.
- Branch naming: `feat/twig-monitor-x402`, `fix/heat-route-timeout`

### Dependencies
- Prefer zero-dependency solutions for scoring/analysis logic (pure functions).
- Pin exact versions (no `^` or `~`).
- Document why every non-obvious dependency exists.

## npm Scope

All packages publish under `@kind-ling/` (with hyphen). Do not use `@kindling/` (no hyphen).

## Agent Instructions

### Planning Phase
When asked to plan something:
1. Think step by step about the architecture.
2. Identify ALL files that need to change.
3. Identify risks and edge cases.
4. Present the plan as a numbered list of steps.
5. Wait for approval before writing any code.
6. Do NOT write code during the planning phase.

### Execution Phase
When a plan is approved:
1. Follow the plan exactly. Don't deviate.
2. If the plan needs changes, STOP and explain. Don't improvise.
3. Write all code in one pass if possible.
4. Run tests after implementation.
5. Report what was created, modified, and what tests pass.

### Review Phase
When asked to review code:
1. Check against the original spec/acceptance criteria.
2. Check against the conventions in this file.
3. Flag security issues, especially around payment handling and auth.
4. Don't suggest style changes that contradict this file's conventions.
5. Be specific: file, line, what's wrong, what to do instead.

### Things You Must Never Do
- Never use `any` type. Use `unknown` and narrow.
- Never commit secrets, API keys, or wallet private keys.
- Never install a dependency without checking if we already have something that does the job.
- Never restructure the repos into a monorepo without explicit approval.
- Never create files outside the established directory structure.
- Never use `console.log` for production logging.
- Never make assumptions about wallet addresses or payment amounts. Always parameterize.
- Never publish to npm scope `@kindling/` — always `@kind-ling/`.

---

## Mistakes Log Reference

See `MISTAKES.md` for the running error corpus.
Patterns that repeat get promoted to this file as permanent rules.

---

*Last updated: 2026-03-28*
*This file is append-only for rules. Remove rules only during monthly cleanup.*
