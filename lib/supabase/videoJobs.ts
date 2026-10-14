import { createSupabaseServerClient } from './server';
import { createSignedMediaUrl, createSignedMediaUrls } from './media';
import type { AnimationJob, AnimationStatus } from '../../types/animation';

type VideoJobRow = {
  id: string;
  user_id: string;
  character_id: string;
  character_ids: unknown;
  duo_key: string | null;
  source_image_url: string;
  last_frame_image_url: string | null;
  prompt: string;
  duration_seconds: number;
  provider: string;
  external_job_id: string | null;
  status: AnimationStatus;
  video_storage_path: string | null;
  provider_video_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

function normalizeCharacterIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

function toEpoch(value: string | null): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

export async function createVideoJob(input: {
  userId: string;
  characterId: string;
  characterIds?: string[];
  duoKey?: string;
  sourceImageUrl: string;
  lastFrameImageUrl?: string;
  prompt: string;
  durationSeconds: number;
  provider: string;
}): Promise<AnimationJob> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('create_video_job_if_available', {
    p_user_id: input.userId,
    p_character_id: input.characterId,
    p_character_ids: input.characterIds || [],
    p_duo_key: input.duoKey || null,
    p_source_image_url: input.sourceImageUrl,
    p_last_frame_image_url: input.lastFrameImageUrl || null,
    p_prompt: input.prompt,
    p_duration_seconds: input.durationSeconds,
    p_provider: input.provider,
    p_max_active: 2,
  });

  if (error) {
    if (String(error.message || '').includes('video_job_limit_reached')) {
      throw new Error('video_job_limit_reached');
    }
    throw new Error(error.message || 'Unable to reserve a video generation slot');
  }

  const row = (Array.isArray(data) ? data[0] : data) as VideoJobRow | null;
  if (!row) throw new Error('Unable to create video job');
  return toAnimationJob(row, undefined);
}

export async function getVideoJob(
  userId: string,
  characterId: string,
  jobId: string,
): Promise<VideoJobRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('video_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle<VideoJobRow>();

  if (error) throw new Error(error.message);
  return data || null;
}

export async function listVideoJobs(
  userId: string,
  characterId: string,
): Promise<VideoJobRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('video_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as VideoJobRow[];
}

export async function updateVideoJob(
  userId: string,
  characterId: string,
  jobId: string,
  updates: Partial<{
    external_job_id: string | null;
    status: AnimationStatus;
    video_storage_path: string | null;
    provider_video_url: string | null;
    error: string | null;
    started_at: string | null;
    completed_at: string | null;
  }>,
): Promise<VideoJobRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('video_jobs')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .select('*')
    .maybeSingle<VideoJobRow>();

  if (error) throw new Error(error.message);
  return data || null;
}

export async function toAnimationJob(
  row: VideoJobRow,
  signedVideoUrl?: string,
): Promise<AnimationJob> {
  const createdAt = toEpoch(row.created_at) || Date.now();
  const updatedAt = toEpoch(row.updated_at) || createdAt;
  const startedAt = toEpoch(row.started_at);

  return {
    jobId: row.id,
    characterId: row.character_id,
    characterIds: normalizeCharacterIds(row.character_ids),
    duoKey: row.duo_key || undefined,
    sourceImageUrl: row.source_image_url,
    sourceImagePath: row.source_image_url.startsWith('/api') ? row.source_image_url.replace('/api', '') : row.source_image_url,
    lastFrameImageUrl: row.last_frame_image_url || undefined,
    lastFrameImagePath: row.last_frame_image_url?.startsWith('/api')
      ? row.last_frame_image_url.replace('/api', '')
      : row.last_frame_image_url || undefined,
    prompt: row.prompt,
    motionPrompt: row.prompt,
    durationSeconds: row.duration_seconds,
    provider: row.provider as AnimationJob['provider'],
    status: row.status,
    externalJobId: row.external_job_id || undefined,
    videoUrl: signedVideoUrl || row.provider_video_url || undefined,
    error: row.error || undefined,
    createdAt,
    updatedAt,
    startedAt,
    completedAt: toEpoch(row.completed_at),
  };
}

export async function toClientAnimationJobs(rows: VideoJobRow[]): Promise<AnimationJob[]> {
  const storagePaths = rows
    .map((row) => row.video_storage_path)
    .filter((value): value is string => Boolean(value));

  const signed = await createSignedMediaUrls(storagePaths, 3600);

  return Promise.all(
    rows.map((row) => toAnimationJob(row, row.video_storage_path ? signed[row.video_storage_path] : undefined)),
  );
}

export async function getClientAnimationJob(row: VideoJobRow): Promise<AnimationJob> {
  let signedVideoUrl: string | undefined;
  if (row.video_storage_path) {
    try {
      signedVideoUrl = await createSignedMediaUrl(row.video_storage_path, 3600);
    } catch {
      signedVideoUrl = undefined;
    }
  }
  return toAnimationJob(row, signedVideoUrl);
}
