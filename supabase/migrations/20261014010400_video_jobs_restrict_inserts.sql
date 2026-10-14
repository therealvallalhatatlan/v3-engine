-- Prevent direct client inserts into video_jobs. New jobs must go through
-- create_video_job_if_available(), which atomically enforces the per-user limit.
drop policy if exists "own_video_jobs_insert" on public.video_jobs;
