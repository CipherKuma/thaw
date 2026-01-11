---
description: Document a debugging issue as a learning for future reference
---

# Document Learning

Analyze this conversation and document the issue we just debugged.

## Instructions

1. **Identify the issue** from this conversation:
   - What was the root problem?
   - What caused repeated debugging cycles?
   - What was the non-obvious fix?

2. **Check if it meets the quality bar:**
   - Did it waste time with back-and-forth?
   - Is it non-obvious (would happen again)?
   - Is it reusable for future projects?
   - NOT in official docs?

   If NO to any → Tell user "This doesn't meet the documentation bar" and explain why.

3. **Determine category:**
   - `ui/` → Frontend, React, Next.js, React Native, styling, i18n
   - `move/` → Move language, Aptos SDK, contract deployment
   - `indexer/` → GraphQL, Prisma, Apollo, data fetching
   - `movement/` → Movement network, Privy auth, wallet integration

4. **Read existing issues** in `docs/issues/{category}/README.md`

5. **Create the new issue** following this format:
   ```markdown
   ## [CATEGORY-XXX] Short Title

   **Problem:** One sentence describing what went wrong

   ---

   ### Pitfall: [Name]

   [Explain the non-obvious trap]

   ```typescript
   // ❌ BAD - what we did wrong

   // ✅ GOOD - the fix
   ```

   **Fix:** One sentence solution

   ---

   **Tags:** `tag1`, `tag2`
   ```

6. **Add to the README.md** in the correct folder (`docs/issues/{category}/`)

7. **Update the Quick Reference table** at the top

8. **Confirm with user** what was documented

## Quality Check

Before documenting, ask: *"If I started fresh and didn't read this, would I make the same mistake?"*

- YES → Document it
- NO → Don't clutter, tell user why
