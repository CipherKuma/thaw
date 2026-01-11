---
description: Execute a prompt from prompts/ directory
argument: <number(s)> e.g., "1" or "1-3" or "1 2 3"
---

# Run Prompt

Execute prompt(s): $ARGUMENTS

**Format:** `/run-prompt <number(s)>`
- Single: `/run-prompt 1` → Execute `prompts/1.md`
- Range: `/run-prompt 1-3` → Execute `prompts/1.md`, `2.md`, `3.md`
- Multiple: `/run-prompt 1 2 3` → Execute all three

**Steps:**
1. Parse the number(s) from arguments
2. Read the specified prompt file(s) from `prompts/`
3. **Check relevant learnings in `docs/issues/`** based on task type:
   - Move/contracts → `docs/issues/move/README.md`
   - UI/frontend → `docs/issues/ui/README.md`
   - Indexer → `docs/issues/indexer/README.md`
   - Movement network → `docs/issues/movement/README.md`
4. Activate the skill specified in each prompt
5. Execute ALL requirements in the prompt
6. Verify using the verification steps
7. Delete the prompt file after successful completion
8. Report what was accomplished
9. List remaining prompts in `prompts/`
