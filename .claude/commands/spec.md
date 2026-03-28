# Write a task spec

Read CLAUDE.md for project conventions and current product state.

I'm going to describe a task in plain English. Convert it into a structured spec using this exact format:

```markdown
## Task: [One-line description]

### Context
[What needs to be known about the project state]

### Goal
[What "done" looks like in plain English]

### Acceptance Criteria
- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]

### Constraints
- [Tech stack constraints from CLAUDE.md]
- [Patterns to follow]
- [Things NOT to do — reference MISTAKES.md]

### Files to Touch
- [Files to create or modify]

### Verify By
- [How to check without reading the code]
- [Tests, endpoints, UI checks]

### Model Routing
- [Suggested model: opus/sonnet/codex/flash]
- [Reason for routing choice]
```

Ask me clarifying questions if my description is too vague to write a good spec. Don't fill in gaps with assumptions — surface them as questions.
