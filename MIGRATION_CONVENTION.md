# Migration Convention

Convention for database migration files in this repository.

## 1. Directory

- **Supabase projects** → `supabase/migrations/`
- **Other projects** (self-hosted Postgres, SQLite, etc.) → `db/migrations/`

All new migrations go into the migration directory of this repository.

## 2. File naming

```
NNN_verb_snake_case.sql
```

- `NNN` — three digits, starting at `001`, strictly incremental and globally unique. **No duplicates, no skips.**
- Description is English `snake_case`, verb first: `create_`, `add_`, `alter_`, `fix_`, `drop_`.
- One file = one change. Split multi-step changes into sequential files (e.g. `001_...`, `002_...`).

Examples:

```
001_create_profiles.sql
002_add_theme_preference.sql
003_fix_updated_at_trigger.sql
```

## 3. Header comment (required)

Every migration file MUST start with the following header. All comments are in English.

```sql
-- =====================================================
-- Migration 001: Add theme preference to profiles
-- File: 001_add_theme_preference.sql
-- Date: 2026-09-10 14:30
-- Depends on: 0XX_xxx.sql
-- Ref: https://prd/requirement/42
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: why this migration exists, background, impact.
-- -----------------------------------------------------
```

| Field | Required | Format |
|---|---|---|
| `-- Migration NNN:` | yes | `Migration 001: One-line title` |
| `-- File:` | yes | file name, must match the actual file |
| `-- Date:` | yes | `YYYY-MM-DD HH:mm`, 24-hour, minute precision |
| `-- Depends on:` | no | previous migration this one relies on; omit if none |
| `-- Ref:` | no | PRD / requirement / issue link |
| `-- Run:` | no | how to execute (Supabase SQL Editor, CLI, etc.) |
| `-- Note:` | recommended | background, reason, impact; multi-line allowed |

Rules:

- `-- Date:` is set **once** when the file is created and is never edited afterwards.
- Later amendments are appended in the `-- Note:` section as `-- Updated: <YYYY-MM-DD HH:mm> <reason>`.
- Obsolete migrations: keep the history file untouched; create a separate drop migration. If the file itself must be flagged, add `-- Obsoleted: YYYY-MM-DD HH:mm` at the top of the header.

## 4. SQL style

- **Idempotent** — use `IF NOT EXISTS` / `IF EXISTS` / `DROP ... IF EXISTS` so a migration can be re-run safely.
- Add `COMMENT ON` for every new column and table.
- Identifiers in `snake_case`; keep statements simple and readable.

## 5. Example

```sql
-- =====================================================
-- Migration 001: Add theme preference to profiles
-- File: 001_add_theme_preference.sql
-- Date: 2026-09-10 14:30
-- Depends on: none
-- Ref: https://prd/requirement/42
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: Persists cross-device theme preference, default
--       "glass". Aligns with word-base migration 009.
-- -----------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'glass';

COMMENT ON COLUMN profiles.theme_preference
  IS 'Page theme: glass/dark/light';
```

## 6. Do / Don't

| Do | Don't |
|---|---|
| Keep numbering strictly incremental | Reuse a number (e.g. two `002_` files) |
| Set `-- Date:` at creation, keep it unchanged | Edit the original date later |
| Make every statement idempotent | Assume the migration runs only once on a fresh DB |
| One change per file | Bundle unrelated changes into one file |
| Flag obsoletes in place or drop in a new file | Delete / rewrite history files |
