-- Durable, per-user generation recipes for reusable scene/camera/style configurations.
create table if not exists public.generation_presets (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('global', 'character')),
  character_id uuid references public.characters(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generation_presets_scope_character_check
    check ((scope = 'global' and character_id is null) or (scope = 'character' and character_id is not null))
);

create index if not exists generation_presets_user_scope_idx
  on public.generation_presets(user_id, scope, updated_at desc);

create index if not exists generation_presets_character_idx
  on public.generation_presets(user_id, character_id, updated_at desc);

alter table public.generation_presets enable row level security;
grant select, insert, update, delete on public.generation_presets to authenticated;

drop policy if exists generation_presets_owner_select on public.generation_presets;
create policy generation_presets_owner_select
  on public.generation_presets for select to authenticated using (user_id = auth.uid());

drop policy if exists generation_presets_owner_insert on public.generation_presets;
create policy generation_presets_owner_insert
  on public.generation_presets for insert to authenticated with check (user_id = auth.uid());

drop policy if exists generation_presets_owner_update on public.generation_presets;
create policy generation_presets_owner_update
  on public.generation_presets for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists generation_presets_owner_delete on public.generation_presets;
create policy generation_presets_owner_delete
  on public.generation_presets for delete to authenticated using (user_id = auth.uid());
