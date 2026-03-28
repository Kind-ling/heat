# MISTAKES.md — Error Corpus

> Append-only during the day. Review weekly.
> Patterns that repeat get promoted to CLAUDE.md as permanent rules.

## Template

```
### [Short description]
- **Date:** YYYY-MM-DD
- **What happened:** [What the agent did wrong]
- **Expected:** [What should have happened]
- **Fix:** [How it was corrected]
- **Root cause:** [vague spec? missing convention? model limitation?]
- **Rule candidate:** YES/NO
```

## Known patterns (inherited from twig)

- JSON.parse on files from disk must always be in try/catch → return safe empty value + structured stderr warning
- Payment verification stubs must return `false` by default — fail-open in the gate, not in the verifier
- Define all type union variants before implementation begins — don't reuse variants for semantically different states
- After implementation, grep for variables assigned but never read (dead code = plan/implementation diverged silently)

## Log

*No entries yet.*
