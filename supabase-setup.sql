-- Civil Master ERP - Supabase setup
-- Run in Supabase SQL Editor.

create table if not exists public.erp_portal_state (
  storage_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists erp_portal_state_updated_at_idx
  on public.erp_portal_state(updated_at desc);

alter table public.erp_portal_state enable row level security;

-- Recommended production policy: only signed-in users can use ERP data.
create policy "erp authenticated read"
on public.erp_portal_state for select
to authenticated
using (true);

create policy "erp authenticated insert"
on public.erp_portal_state for insert
to authenticated
with check (true);

create policy "erp authenticated update"
on public.erp_portal_state for update
to authenticated
using (true)
with check (true);

create policy "erp authenticated delete"
on public.erp_portal_state for delete
to authenticated
using (true);

-- IMPORTANT:
-- Do not add public/anon write policies on a production ERP.
-- Create users in Supabase Authentication and sign in before enabling cloud sync.
