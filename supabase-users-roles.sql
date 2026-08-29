-- Civil Master ERP - Users, Roles & Module Permissions
-- Run this ONCE in Supabase SQL Editor after the main ERP setup.

create table if not exists public.erp_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text not null unique,
  role text not null default 'Viewer' check (role in ('Admin','HR','Accounts','Payroll','Manager','Viewer')),
  allowed_modules text[] not null default array['employee','leave','client','subcontractor','salary']::text[],
  write_modules text[] not null default array[]::text[],
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.erp_user_profiles enable row level security;

grant usage on schema public to authenticated;
grant select, update on public.erp_user_profiles to authenticated;

create or replace function public.erp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.erp_user_profiles p
    where p.user_id = auth.uid() and p.active = true and p.role = 'Admin'
  );
$$;

create or replace function public.erp_module_for_key(p_key text)
returns text
language sql
immutable
as $$
  select case p_key
    when 'cm_employee_portal_v3' then 'employee'
    when 'cm_leave_portal_v1' then 'leave'
    when 'cm_client_portal_v2' then 'client'
    when 'cm_subcontractor_simple_v1' then 'subcontractor'
    when 'cm_salary_portal_v1' then 'salary'
    else null
  end;
$$;

create or replace function public.erp_can_access(p_key text, p_write boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.erp_user_profiles%rowtype;
  m text;
begin
  select * into p from public.erp_user_profiles where user_id = auth.uid();
  if p.user_id is null or not p.active then return false; end if;
  if p.role = 'Admin' then return true; end if;
  m := public.erp_module_for_key(p_key);
  if m is null then return false; end if;
  if p_write then return m = any(p.write_modules); end if;
  return m = any(p.allowed_modules);
end;
$$;

-- Profiles: user can read own profile; Admin can read/update all profiles.
drop policy if exists "profile own or admin read" on public.erp_user_profiles;
create policy "profile own or admin read"
on public.erp_user_profiles for select
to authenticated
using (user_id = auth.uid() or public.erp_is_admin());

drop policy if exists "profile admin update" on public.erp_user_profiles;
create policy "profile admin update"
on public.erp_user_profiles for update
to authenticated
using (public.erp_is_admin())
with check (public.erp_is_admin());

-- Replace broad ERP-state policies with module-aware role policies.
drop policy if exists "erp authenticated read" on public.erp_portal_state;
drop policy if exists "erp authenticated insert" on public.erp_portal_state;
drop policy if exists "erp authenticated update" on public.erp_portal_state;
drop policy if exists "erp authenticated delete" on public.erp_portal_state;
drop policy if exists "erp role read" on public.erp_portal_state;
drop policy if exists "erp role insert" on public.erp_portal_state;
drop policy if exists "erp role update" on public.erp_portal_state;
drop policy if exists "erp role delete" on public.erp_portal_state;

create policy "erp role read"
on public.erp_portal_state for select
to authenticated
using (public.erp_can_access(storage_key,false));

create policy "erp role insert"
on public.erp_portal_state for insert
to authenticated
with check (public.erp_can_access(storage_key,true));

create policy "erp role update"
on public.erp_portal_state for update
to authenticated
using (public.erp_can_access(storage_key,true))
with check (public.erp_can_access(storage_key,true));

create policy "erp role delete"
on public.erp_portal_state for delete
to authenticated
using (public.erp_can_access(storage_key,true));

-- Automatically create a Viewer profile whenever a new Auth user is created.
create or replace function public.handle_new_erp_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
begin
  base_username := lower(coalesce(nullif(split_part(new.email,'@',1),''), 'user_' || substr(new.id::text,1,8)));
  final_username := base_username;
  if exists(select 1 from public.erp_user_profiles where username = final_username) then
    final_username := base_username || '_' || substr(new.id::text,1,4);
  end if;
  insert into public.erp_user_profiles(user_id,email,username,role,allowed_modules,write_modules,active)
  values(new.id,coalesce(new.email,''),final_username,'Viewer',
         array['employee','leave','client','subcontractor','salary']::text[],
         array[]::text[],true)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_erp_profile on auth.users;
create trigger on_auth_user_created_erp_profile
after insert on auth.users
for each row execute procedure public.handle_new_erp_user();

-- Backfill profiles for existing Auth users.
insert into public.erp_user_profiles(user_id,email,username,role,allowed_modules,write_modules,active)
select u.id, coalesce(u.email,''),
       lower(coalesce(nullif(split_part(u.email,'@',1),''),'user_'||substr(u.id::text,1,8))) ||
       case when exists(
          select 1 from public.erp_user_profiles p
          where p.username = lower(coalesce(nullif(split_part(u.email,'@',1),''),'user_'||substr(u.id::text,1,8)))
       ) then '_'||substr(u.id::text,1,4) else '' end,
       'Viewer',
       array['employee','leave','client','subcontractor','salary']::text[],
       array[]::text[], true
from auth.users u
where not exists(select 1 from public.erp_user_profiles p where p.user_id=u.id);

-- Make the oldest existing Auth user the first ERP Admin.
update public.erp_user_profiles p
set role='Admin',
    allowed_modules=array['employee','leave','client','subcontractor','salary']::text[],
    write_modules=array['employee','leave','client','subcontractor','salary']::text[],
    updated_at=now()
where p.user_id = (select id from auth.users order by created_at asc limit 1);

-- Role defaults helper. Admin UI uses the same defaults.
create or replace function public.erp_role_modules(p_role text)
returns jsonb
language sql
immutable
as $$
select case p_role
  when 'Admin' then jsonb_build_object('allowed',array['employee','leave','client','subcontractor','salary'],'write',array['employee','leave','client','subcontractor','salary'])
  when 'HR' then jsonb_build_object('allowed',array['employee','leave'],'write',array['employee','leave'])
  when 'Accounts' then jsonb_build_object('allowed',array['employee','leave','client','salary'],'write',array['leave','client','salary'])
  when 'Payroll' then jsonb_build_object('allowed',array['employee','leave','salary'],'write',array['salary'])
  when 'Manager' then jsonb_build_object('allowed',array['employee','leave','client','subcontractor'],'write',array['leave'])
  else jsonb_build_object('allowed',array['employee','leave','client','subcontractor','salary'],'write',array[]::text[])
end;
$$;
