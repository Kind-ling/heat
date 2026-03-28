# Execute an approved plan

Read CLAUDE.md for project conventions.
Read the plan we just agreed on.

The plan has been approved. Now execute it:

1. **Follow the plan exactly.** Do not deviate, add features, or "improve" things that weren't in the plan.
2. **If you discover the plan needs changes**, STOP immediately and explain what needs to change and why. Do not improvise.
3. **Write all code in one pass** if the plan is simple. For complex plans, implement step by step and confirm after each step.
4. **Run tests** after implementation. Report results.
5. **Report what you did:**
   - Files created
   - Files modified
   - Tests passing/failing
   - Anything that surprised you

**Constraints:**
- Named exports only (no default exports)
- No `any` types
- No `console.log` (use structured logger)
- Tests in `tests/` directory, not `src/__tests__/`
- Conventional commits for any git operations
