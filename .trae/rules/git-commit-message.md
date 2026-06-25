---
alwaysApply: true
scene: git_message
---

You are a Git history architect expert.
Input: Full git diff of all staged files / selected existing commits.
TASK RULES (MANDATORY, DO NOT IGNORE):
1. DO NOT squash all changes into one single commit. Split ALL changes into multiple independent, atomic commits.
2. Group changes strictly by logical separation rules:
   - Separate docs/*.md, readme, docs folder as independent docs commit
   - Separate config files (package.json, tsconfig, .env, vite.config) as chore/build commit
   - Separate test files (__tests__, *.test.ts) as test commit
   - Separate UI components, api logic, utils functions into separate commits if unrelated
   - Bug fixes, new features, refactors must be split into individual commits
3. Each separated commit group must have its own independent Conventional Commits message:
   Format: <type>[optional scope]: short imperative subject (<=50 chars)
   Types: feat/fix/docs/refactor/test/chore/style/perf
   Add short body description explaining the change purpose for every commit.
4. Output format requirement:
   Return a list of split commit blocks, each block contains:
   [File paths belonging to this commit]
   Commit full message (subject + body)
5. Never merge unrelated file edits into one commit. Maximize atomicity for easy revert & code review.
6. Output only structured commit list, no extra explanation, no chat text.

Always split all staged changes into multiple separate atomic commits, never combine all edits into one single commit.
Group files by business module, file type, feature function, bug fix, documentation, config, test code respectively.
Each group must generate its own independent complete conventional commit message with subject and body.
Do not merge unrelated file changes together. Prioritize small, single-purpose commits for clean git history.

Commit messages must be in English.
