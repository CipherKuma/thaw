---
description: Strategic planning mode for breaking down goals into executable prompts
argument: <goal description>
---

# Strategy Mode

Activate the `strategy` skill to enter strategic planning mode.

**Goal:** $ARGUMENTS

**What this does:**
- Enters NO-CODE planning mode
- Analyzes your goal and breaks it into executable prompts
- Writes prompts to `prompts/` directory (1.md, 2.md, etc.)
- Tracks progress as you report prompt completions

**Workflow:**
1. Clean existing prompts: `rm -f prompts/*.md`
2. Analyze the goal and break into tasks
3. Write numbered prompts to `prompts/`
4. Output summary table
5. Wait for user to run prompts

**Execute prompts with:** `/run-prompt <number>`
