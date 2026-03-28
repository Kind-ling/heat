# Review code against spec

Read CLAUDE.md for project conventions.
Read MISTAKES.md for known pitfalls.

Review the code that was just written. Check against:

1. **Original spec/acceptance criteria** — does it do what was asked?
2. **CLAUDE.md conventions** — does it follow all project rules?
3. **MISTAKES.md patterns** — does it repeat any known mistakes?
4. **Security** — especially around:
   - Payment handling (x402, wallet addresses)
   - Auth/authorization
   - Input validation
   - Error leakage (don't expose internals)
5. **Edge cases** — what happens with empty inputs, nulls, timeouts, rate limits?

**Output format:**
- 🟢 **Pass:** [thing that's correct]
- 🟡 **Warning:** [thing that works but could be better]
- 🔴 **Fail:** [thing that's wrong and must be fixed]

For each 🔴, provide the file, the problem, and the fix.

**Do NOT fix anything.** Review only. I'll route fixes to the appropriate agent.
