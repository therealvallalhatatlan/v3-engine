-- Atomically reserve a video-job slot and insert the job while holding a per-user advisory lock.
create or replace function public.create_video_job_if_available(
  p_user_id uuid,
  p_character_id uuid,
  p_character_ids jsonb,
  p_duo_key text,
  p_source_image_url text,
  p_last_frame_image_url text,
  p_prompt text,
  p_duration_seconds integer,
  p_provider text default 'replicate',
  p_max_active integer default 2
)
returns setof public.video_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_duration_seconds not in (5, 8, 10, 15, 20) then
    raise exception using errcode = '22023', message = 'unsupported_video_duration';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if (
    select count(*)
    from public.video_jobs
    where user_id = p_user_id
      and status in ('queued', 'processing')
  ) >= greatest(1, least(coalesce(p_max_active, 2), 2)) then
    raise exception using errcode = 'P0001', message = 'video_job_limit_reached';
  end if;

  return query
    insert into public.video_jobs (
      user_id, character_id, character_ids, duo_key,
      source_image_url, last_frame_image_url, prompt,
      duration_seconds, provider, status, started_at
    )
    values (
      p_user_id, p_character_id, coalesce(p_character_ids, '[]'::jsonb), p_duo_key,
      p_source_image_url, p_last_frame_image_url, p_prompt,
      p_duration_seconds, coalesce(p_provider, 'replicate'), 'queued', now()
    )
    returning *;
end;
$$;

revoke all on function public.create_video_job_if_available(uuid, uuid, jsonb, text, text, text, text, integer, text, integer) from public;
grant execute on function public.create_video_job_if_available(uuid, uuid, jsonb, text, text, text, text, integer, text, integer) to authenticated;
