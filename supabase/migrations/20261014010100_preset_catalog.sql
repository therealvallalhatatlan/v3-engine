-- Durable, shared preset catalog for Vercel/serverless deployments.
create table if not exists public.preset_catalog (
  id text primary key,
  preset_type text not null check (preset_type in ('location', 'camera', 'style')),
  preset_key text not null,
  label text not null,
  prompt text not null default '',
  negative text,
  builtin boolean not null default false,
  default_label text,
  default_prompt text,
  default_negative text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint preset_catalog_type_key_unique unique (preset_type, preset_key)
);

create index if not exists preset_catalog_type_key_idx
  on public.preset_catalog(preset_type, preset_key);

alter table public.preset_catalog enable row level security;
grant select, insert, update, delete on public.preset_catalog to authenticated;

drop policy if exists preset_catalog_authenticated_select on public.preset_catalog;
create policy preset_catalog_authenticated_select
  on public.preset_catalog for select to authenticated
  using (auth.uid() is not null);

drop policy if exists preset_catalog_admin_insert on public.preset_catalog;
create policy preset_catalog_admin_insert
  on public.preset_catalog for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'admin')
  );

drop policy if exists preset_catalog_admin_update on public.preset_catalog;
create policy preset_catalog_admin_update
  on public.preset_catalog for update to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'admin')
  );

drop policy if exists preset_catalog_admin_delete on public.preset_catalog;
create policy preset_catalog_admin_delete
  on public.preset_catalog for delete to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'admin')
  );
