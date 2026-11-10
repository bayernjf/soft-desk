-- =====================================================
-- Migration 010: Tighten shares public read to token-gated RPC
-- File: 010_tighten_shares_public_read.sql
-- Date: 2026-11-03 02:30
-- Depends on: 001_community_share_schema.sql
-- Run: Supabase SQL Editor, execute once
-- =====================================================
-- Note: The "public read active shares" policy (001) let anyone holding
--       the shipped anon key enumerate every active share row — payloads,
--       owner nicknames — without knowing any share token. Share links are
--       meant to be unguessable (softdesk://share/<10-char token>), so the
--       enumerable policy is dropped and preview goes through a
--       security-definer RPC that returns at most one row for a valid
--       token. Owners keep full access via "owner manage own shares".
-- -----------------------------------------------------

-- 1. Drop the enumerable public read policy. After this, direct table
--    SELECT is owner-only ("owner manage own shares" from 001 remains).
drop policy if exists "public read active shares" on public.shares;

-- 2. Token-gated preview RPC: returns the single active share for an
--    unguessable token, nothing otherwise. security definer so it can read
--    past RLS; search_path pinned empty to block search-path hijack, all
--    references fully qualified.
create or replace function public.get_share_by_token(p_token text)
returns table (
  id bigint,
  share_token text,
  owner_nickname text,
  kind text,
  title text,
  description text,
  payload jsonb,
  view_count integer,
  import_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Tokens are exactly 10 lowercase alphanumerics (see generateToken in
  -- src/services/shares.service.ts); reject anything else before touching
  -- the table.
  if p_token is null or p_token !~ '^[0-9a-z]{10}$' then
    return;
  end if;
  return query
    select s.id, s.share_token, s.owner_nickname, s.kind, s.title,
           s.description, s.payload, s.view_count, s.import_count,
           s.created_at
    from public.shares s
    where s.share_token = p_token
      and s.is_revoked = false
      and s.is_archived = false
      and (s.expires_at is null or s.expires_at > now());
end;
$$;

comment on function public.get_share_by_token(text)
  is 'Preview one active share by its unguessable 10-char token (anon-safe).';

-- 3. Scope EXECUTE to the Supabase client roles; direct table SELECT on
--    shares stays owner-only via RLS.
revoke all on function public.get_share_by_token(text) from public;
grant execute on function public.get_share_by_token(text) to anon, authenticated;
