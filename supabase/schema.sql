-- Vállalhatatlan v3 multi-user SaaS foundation
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free','paid','admin')),
  generation_credits integer not null default 3 check (generation_credits >= 0),
  character_slots integer not null default 0 check (character_slots >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  type text not null default 'user' check (type in ('system','user')),
  name text not null,
  description text not null default '',
  traits jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.character_images (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  storage_path text not null,
  image_type text not null default 'reference',
  created_at timestamptz not null default now()
);

create table if not exists public.generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('success','failed')),
  provider text not null default 'gemini',
  credits integer not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  character_id uuid references public.characters(id) on delete cascade,
  character_ids jsonb not null default '[]'::jsonb,
  generation_type text not null default 'character' check (generation_type in ('character', 'background')),
  storage_path text not null,
  prompt text,
  style text,
  camera text,
  aspect_ratio text,
  variant text,
  credit_cost integer not null default 1 check (credit_cost > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('free_grant','purchase','reserve','consume','refund','admin_adjustment')),
  amount integer not null,
  reference text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_payment_id text unique,
  package_id text not null,
  credits integer not null default 0 check (credits >= 0),
  character_slots integer not null default 0 check (character_slots >= 0),
  amount integer not null,
  currency text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists characters_owner_id_idx on public.characters(owner_id);
create index if not exists generated_images_owner_id_idx on public.generated_images(owner_id);
create index if not exists generated_images_character_id_idx on public.generated_images(character_id);
create index if not exists credit_transactions_user_id_idx on public.credit_transactions(user_id);
create index if not exists purchases_user_id_idx on public.purchases(user_id);
create index if not exists generation_events_user_id_idx on public.generation_events(user_id);

insert into storage.buckets (id, name, public)
values ('v3-media', 'v3-media', false)
on conflict (id) do nothing;

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

alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.character_images enable row level security;
alter table public.generation_events enable row level security;
alter table public.generated_images enable row level security;
alter table public.preset_catalog enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.purchases enable row level security;

insert into storage.buckets (id, name, public)
values ('v3-media', 'v3-media', false)
on conflict (id) do update set public = false;

create or replace function public.is_paid_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and plan in ('paid','admin'));
$$;

drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles for select using (id = auth.uid());

drop policy if exists "system_or_owned_characters_select" on public.characters;
create policy "system_or_owned_characters_select" on public.characters for select using (type = 'system' or owner_id = auth.uid());

drop policy if exists "owned_characters_insert" on public.characters;
create policy "owned_characters_insert" on public.characters for insert with check (type = 'user' and owner_id = auth.uid() and public.is_paid_user());

drop policy if exists "owned_characters_update" on public.characters;
create policy "owned_characters_update" on public.characters for update using (type = 'user' and owner_id = auth.uid()) with check (type = 'user' and owner_id = auth.uid());

drop policy if exists "owned_characters_delete" on public.characters;
create policy "owned_characters_delete" on public.characters for delete using (type = 'user' and owner_id = auth.uid());

drop policy if exists "owned_character_images_select" on public.character_images;
create policy "owned_character_images_select" on public.character_images for select using (exists (select 1 from public.characters c where c.id = character_id and (c.type = 'system' or c.owner_id = auth.uid())));

drop policy if exists "owned_character_images_insert" on public.character_images;
create policy "owned_character_images_insert" on public.character_images for insert with check (
  exists (select 1 from public.characters c where c.id = character_id and c.type = 'user' and c.owner_id = auth.uid())
);

drop policy if exists "owned_character_images_delete" on public.character_images;
create policy "owned_character_images_delete" on public.character_images for delete using (
  exists (select 1 from public.characters c where c.id = character_id and c.type = 'user' and c.owner_id = auth.uid())
);

drop policy if exists "own_generation_events_select" on public.generation_events;
create policy "own_generation_events_select" on public.generation_events for select using (user_id = auth.uid());

drop policy if exists "owned_generated_images_select" on public.generated_images;
create policy "owned_generated_images_select" on public.generated_images for select using (owner_id = auth.uid());
grant select, insert, update, delete on public.preset_catalog to authenticated;

drop policy if exists "preset_catalog_authenticated_select" on public.preset_catalog;
create policy "preset_catalog_authenticated_select" on public.preset_catalog for select to authenticated using (auth.uid() is not null);
drop policy if exists "preset_catalog_admin_insert" on public.preset_catalog;
create policy "preset_catalog_admin_insert" on public.preset_catalog for insert to authenticated with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'admin'));
drop policy if exists "preset_catalog_admin_update" on public.preset_catalog;
create policy "preset_catalog_admin_update" on public.preset_catalog for update to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'admin')) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'admin'));
drop policy if exists "preset_catalog_admin_delete" on public.preset_catalog;
create policy "preset_catalog_admin_delete" on public.preset_catalog for delete to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'admin'));


drop policy if exists "owned_generated_images_insert" on public.generated_images;
create policy "owned_generated_images_insert" on public.generated_images for insert with check (owner_id = auth.uid());

drop policy if exists "own_transactions_select" on public.credit_transactions;
create policy "own_transactions_select" on public.credit_transactions for select using (user_id = auth.uid());

drop policy if exists "own_purchases_select" on public.purchases;
create policy "own_purchases_select" on public.purchases for select using (user_id = auth.uid());

drop policy if exists "v3_media_select_own" on storage.objects;
create policy "v3_media_select_own" on storage.objects for select using (
  bucket_id = 'v3-media'
  and ((storage.foldername(name))[1] = auth.uid()::text or (storage.foldername(name))[1] = 'system')
);

drop policy if exists "v3_media_insert_own" on storage.objects;
create policy "v3_media_insert_own" on storage.objects for insert with check (bucket_id = 'v3-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "v3_media_update_own" on storage.objects;
create policy "v3_media_update_own" on storage.objects for update using (bucket_id = 'v3-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "v3_media_delete_own" on storage.objects;
create policy "v3_media_delete_own" on storage.objects for delete using (bucket_id = 'v3-media' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, plan, generation_credits, character_slots)
  values (new.id, new.email, 'free', 3, 0) on conflict (id) do nothing;
  insert into public.credit_transactions (user_id, type, amount, reference)
  values (new.id, 'free_grant', 3, 'signup');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.reserve_generation_credits(p_user_id uuid, p_cost integer default 1)
returns boolean language plpgsql security definer set search_path = public
as $$
declare affected integer;
begin
  if p_cost <= 0 then return false; end if;
  update public.profiles set generation_credits = generation_credits - p_cost, updated_at = now()
  where id = p_user_id and generation_credits >= p_cost;
  get diagnostics affected = row_count;
  if affected <> 1 then return false; end if;
  insert into public.credit_transactions (user_id, type, amount, reference) values (p_user_id, 'reserve', -p_cost, 'generation');
  return true;
end;
$$;

create or replace function public.refund_generation_credits(p_user_id uuid, p_cost integer, p_reference text default 'generation_error')
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then return false; end if;
  if p_cost <= 0 then return false; end if;
  update public.profiles set generation_credits = generation_credits + p_cost, updated_at = now() where id = p_user_id;
  if not found then return false; end if;
  insert into public.credit_transactions (user_id, type, amount, reference) values (p_user_id, 'refund', p_cost, p_reference);
  return true;
end;
$$;


create or replace function public.reserve_character_slot(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then return false; end if;

  update public.profiles
  set character_slots = character_slots - 1,
      updated_at = now()
  where id = p_user_id
    and plan in ('paid','admin')
    and character_slots > 0;

  get diagnostics affected = row_count;
  if affected <> 1 then return false; end if;

  return true;
end;
$$;

create or replace function public.refund_character_slot(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then return false; end if;

  update public.profiles
  set character_slots = character_slots + 1,
      updated_at = now()
  where id = p_user_id;

  return found;
end;
$$;


create or replace function public.apply_credit_purchase(
  p_user_id uuid,
  p_stripe_payment_id text,
  p_package_id text,
  p_credits integer,
  p_character_slots integer,
  p_amount integer,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    return false;
  end if;

  if p_user_id is null
    or p_stripe_payment_id is null
    or p_package_id is null
    or p_credits <= 0
    or p_character_slots < 0
    or p_amount <= 0
    or p_currency is null then
    return false;
  end if;

  if exists (
    select 1 from public.purchases
    where stripe_payment_id = p_stripe_payment_id
  ) then
    return true;
  end if;

  insert into public.purchases (
    user_id,
    stripe_payment_id,
    package_id,
    credits,
    character_slots,
    amount,
    currency,
    status
  ) values (
    p_user_id,
    p_stripe_payment_id,
    p_package_id,
    p_credits,
    p_character_slots,
    p_amount,
    p_currency,
    'completed'
  );

  update public.profiles
  set
    plan = 'paid',
    generation_credits = generation_credits + p_credits,
    character_slots = character_slots + p_character_slots,
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Profile not found for purchase';
  end if;

  insert into public.credit_transactions (
    user_id,
    type,
    amount,
    reference,
    metadata
  ) values (
    p_user_id,
    'purchase',
    p_credits,
    p_stripe_payment_id,
    jsonb_build_object('packageId', p_package_id, 'characterSlots', p_character_slots, 'amount', p_amount, 'currency', p_currency)
  );

  return true;
end;
$$;


-- Conversational image editing
alter table public.generated_images
  add column if not exists parent_generation_id uuid references public.generated_images(id) on delete set null,
  add column if not exists edit_session_id uuid,
  add column if not exists edit_instruction text,
  add column if not exists edit_response text,
  add column if not exists edit_index integer not null default 0,
  add column if not exists gemini_interaction_id text,
  add column if not exists edit_context jsonb;

create index if not exists generated_images_parent_generation_id_idx
  on public.generated_images(parent_generation_id);
create index if not exists generated_images_edit_session_id_idx
  on public.generated_images(edit_session_id);
create index if not exists generated_images_gemini_interaction_id_idx
  on public.generated_images(gemini_interaction_id);

create table if not exists public.image_edit_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  root_generation_id uuid references public.generated_images(id) on delete set null,
  current_generation_id uuid references public.generated_images(id) on delete set null,
  gemini_interaction_id text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.image_edit_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.image_edit_sessions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '',
  generation_id uuid references public.generated_images(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.generated_images
  drop constraint if exists generated_images_edit_session_id_fkey;
alter table public.generated_images
  add constraint generated_images_edit_session_id_fkey
  foreign key (edit_session_id) references public.image_edit_sessions(id) on delete set null;

create index if not exists image_edit_sessions_owner_id_idx on public.image_edit_sessions(owner_id);
create index if not exists image_edit_messages_session_id_idx on public.image_edit_messages(session_id);
create index if not exists image_edit_messages_owner_id_idx on public.image_edit_messages(owner_id);

alter table public.image_edit_sessions enable row level security;
alter table public.image_edit_messages enable row level security;

drop policy if exists "own_image_edit_sessions_select" on public.image_edit_sessions;
create policy "own_image_edit_sessions_select" on public.image_edit_sessions for select using (owner_id = auth.uid());

drop policy if exists "own_image_edit_sessions_insert" on public.image_edit_sessions;
create policy "own_image_edit_sessions_insert" on public.image_edit_sessions for insert with check (owner_id = auth.uid());

drop policy if exists "own_image_edit_sessions_update" on public.image_edit_sessions;
create policy "own_image_edit_sessions_update" on public.image_edit_sessions for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own_image_edit_messages_select" on public.image_edit_messages;
create policy "own_image_edit_messages_select" on public.image_edit_messages for select using (owner_id = auth.uid());

drop policy if exists "own_image_edit_messages_insert" on public.image_edit_messages;
create policy "own_image_edit_messages_insert" on public.image_edit_messages for insert with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.image_edit_sessions s
    where s.id = session_id and s.owner_id = auth.uid()
  )
);
