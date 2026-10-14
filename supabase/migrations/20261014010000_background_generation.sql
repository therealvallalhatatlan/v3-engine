-- Allow image generations that belong to an environment/background instead of a character.
-- Existing rows remain character generations; their character foreign key is preserved.

alter table public.generated_images
  alter column character_id drop not null;

alter table public.generated_images
  add column if not exists generation_type text not null default 'character';

update public.generated_images
set generation_type = case when character_id is null then 'background' else 'character' end
where generation_type is null
   or generation_type not in ('character', 'background');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'generated_images_generation_type_check'
      and conrelid = 'public.generated_images'::regclass
  ) then
    alter table public.generated_images
      add constraint generated_images_generation_type_check
      check (generation_type in ('character', 'background'));
  end if;
end
$$;

create index if not exists generated_images_owner_type_created_idx
  on public.generated_images(owner_id, generation_type, created_at desc);
