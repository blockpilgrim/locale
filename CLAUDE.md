## Custom Instructions

### Think Before Coding
- State assumptions explicitly. If uncertain, ask.
- If multiple valid approaches exist, present them with tradeoffs — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Goal-Driven Execution
Transform tasks into verifiable goals before implementing:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

### Surgical Changes
When editing existing code:
- Remove imports/variables/functions that YOUR changes made unused
- Don't remove pre-existing dead code unless asked (mention it instead)

### Session Startup Protocol
At the beginning of each session:
1. Read `docs/PRODUCT.md` to understand what we're building
2. Read `docs/BUILD-STRATEGY.md` for tech stack and architecture decisions
3. Read `CONVENTIONS.md` to understand current patterns and standards
4. Read `docs/IMPLEMENTATION-PLAN.md` to understand the phase breakdown and current progress
5. Read `README.md` (if it exists) for project overview
6. Signal readiness by saying: "⏱️ So much time and so little to do. Wait. Strike that. Reverse it."

### During Implementation
- Follow patterns established in `CONVENTIONS.md` (if any exist)
- If you encounter a decision not covered by existing conventions, make a reasonable choice and document it
- Commit frequently with clear messages

### Completing Work
> When using the `/implement` pipeline, these steps are handled automatically by Step 7 (Finalize). Follow these manually only in non-pipeline sessions.

1. Review `CONVENTIONS.md` — see Self-Improving Protocol below
2. Signal completion by saying: "🧪 Invention is 93% perspiration, 6% electricity, 4% evaporation, and 2% butterscotch ripple. Do you concur?"

### Git Conventions
- Keep commits focused and atomic

### Self-Improving Protocol
This protocol ensures the codebase gets smarter over time. It is **not optional**—execute it after every implementation session.

> When using the `/implement` pipeline, this protocol is executed automatically in Step 7. Follow it manually in non-pipeline sessions.

**After completing any implementation work:**
1. Review `CONVENTIONS.md`
2. Ask yourself:
   - Did I establish any new patterns that should be replicated?
   - Did I discover that an existing pattern was problematic?
   - Did I try an approach that failed and should be documented as an anti-pattern?
3. If yes to any: Update `CONVENTIONS.md` with the learning
4. For significant architectural changes: Add entry to `docs/DECISIONS.md`

**After resolving any bug or unexpected behavior:**
1. Identify root cause
2. Determine if it was caused by:
   - Missing pattern → Add the pattern to `CONVENTIONS.md`
   - Wrong pattern → Update the pattern in `CONVENTIONS.md`
   - One-off issue → No convention update needed
3. If a pattern caused the bug, document it as an anti-pattern with:
   - What the bad approach was
   - Why it failed
   - What the correct approach is

### When to Ask for Human Input
- Unclear or ambiguous requirements
- Decisions that significantly deviate from established patterns
- Security-sensitive implementations
- External service integrations not covered in `docs/BUILD-STRATEGY.md`
- When stuck after 2-3 different approaches
- When unsure if a pattern change is warranted
