import { NextRequest, NextResponse } from 'next/server';
import { getAnimationProvider } from '../../../../lib/animationProviders';
import { createSupabaseServerClient, getCurrentUser } from '../../../../lib/supabase/server';
import { getAppCharacterById } from '../../../../lib/supabase/characters';
import { createVideoJob, updateVideoJob } from '../../../../lib/supabase/videoJobs';

function normalizeDuration(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 5;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.round(parsed);
  return [5, 8, 10, 15, 20].includes(normalized) && normalized === parsed ? normalized : null;
}

function isOwnedGeneratedImageUrl(value: unknown, userId: string): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!configuredSupabaseUrl) return false;

  try {
    const candidate = new URL(value);
    const trustedOrigin = new URL(configuredSupabaseUrl).origin;
    const decodedPath = decodeURIComponent(candidate.pathname);
    const requiredPrefix = `/storage/v1/object/sign/v3-media/${userId}/generated/`;
    return candidate.origin === trustedOrigin
      && decodedPath.startsWith(requiredPrefix)
      && Boolean(candidate.searchParams.get('token'));
  } catch {
    return false;
  }
}

function resolveLocalSourceToDataUrl(sourceImageUrl: string): string {
  // Legacy/local image URLs are still accepted for backwards compatibility.
  // Current Gallery images use signed Supabase URLs and pass through unchanged.
  if (!sourceImageUrl.startsWith('/api/generated/')) {
    return sourceImageUrl;
  }

  throw new Error('Legacy local source images are no longer available on this deployment.');
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: 'Unable to load user profile' }, { status: 500 });
  }

  if (!profile || (profile.plan !== 'paid' && profile.plan !== 'admin')) {
    return NextResponse.json(
      { error: 'A videó generálás a fizetős csomagban érhető el.' },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const {
      characterId,
      characterIds,
      duoKey,
      sourceImageUrl,
      lastFrameImageUrl,
      prompt,
      motionPrompt,
      durationSeconds,
    } = body;

    const normalizedCharacterId = String(characterId || '').trim();
    const resolvedPrompt = typeof prompt === 'string' ? prompt : motionPrompt;

    if (!normalizedCharacterId || !sourceImageUrl || !resolvedPrompt) {
      return NextResponse.json(
        { error: 'characterId, sourceImageUrl and prompt are required' },
        { status: 400 },
      );
    }

    if (typeof resolvedPrompt !== 'string' || resolvedPrompt.trim().length < 4) {
      return NextResponse.json({ error: 'prompt is too short' }, { status: 400 });
    }

    if (!isOwnedGeneratedImageUrl(sourceImageUrl, user.id)) {
      return NextResponse.json({ error: 'A videó forrása csak a saját generált képeid közül választható.' }, { status: 403 });
    }
    if (lastFrameImageUrl && !isOwnedGeneratedImageUrl(lastFrameImageUrl, user.id)) {
      return NextResponse.json({ error: 'A záróképkockának is a saját generált képeid közül kell származnia.' }, { status: 403 });
    }

    if (lastFrameImageUrl !== undefined && typeof lastFrameImageUrl !== 'string') {
      return NextResponse.json(
        { error: 'lastFrameImageUrl must be a string when provided' },
        { status: 400 },
      );
    }

    const character = await getAppCharacterById(normalizedCharacterId, false);
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const duration = normalizeDuration(durationSeconds);
    if (duration === null) {
      return NextResponse.json({ error: 'A videó hossza 5, 8, 10, 15 vagy 20 másodperc lehet.' }, { status: 400 });
    }

    const { count: activeJobs, error: activeJobsError } = await supabase
      .from('video_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['queued', 'processing']);
    if (activeJobsError) {
      console.error('Video concurrency check failed:', activeJobsError);
      return NextResponse.json({ error: 'Nem sikerült ellenőrizni a futó videófeladatokat.' }, { status: 500 });
    }
    if ((activeJobs || 0) >= 2) {
      return NextResponse.json({ error: 'Egyszerre legfeljebb két videógenerálás futhat. Várd meg, amíg az egyik befejeződik.' }, { status: 429 });
    }

    const providerName = 'replicate';
    const provider = getAnimationProvider(providerName);
    const normalizedCharacterIds = Array.isArray(characterIds)
      ? Array.from(
          new Set(
            characterIds
              .map((id: unknown) => String(id || '').trim())
              .filter(Boolean),
          ),
        )
      : [normalizedCharacterId];

    let job = await createVideoJob({
      userId: user.id,
      characterId: normalizedCharacterId,
      characterIds: normalizedCharacterIds,
      duoKey: typeof duoKey === 'string' ? duoKey.trim() || undefined : undefined,
      sourceImageUrl: String(sourceImageUrl),
      lastFrameImageUrl:
        typeof lastFrameImageUrl === 'string' && lastFrameImageUrl.trim()
          ? lastFrameImageUrl.trim()
          : undefined,
      prompt: resolvedPrompt.trim(),
      durationSeconds: duration,
      provider: providerName,
    });

    try {
      const providerSourceImage = resolveLocalSourceToDataUrl(String(sourceImageUrl));
      const providerLastFrameImage =
        typeof lastFrameImageUrl === 'string' && lastFrameImageUrl.trim()
          ? resolveLocalSourceToDataUrl(lastFrameImageUrl.trim())
          : undefined;

      const created = await provider.createAnimation({
        sourceImageUrl: providerSourceImage,
        lastFrameImageUrl: providerLastFrameImage,
        prompt: resolvedPrompt.trim(),
        durationSeconds: duration,
      });

      const updated = await updateVideoJob(
        user.id,
        normalizedCharacterId,
        job.jobId,
        {
          external_job_id: created.externalJobId,
          status: created.status,
          started_at: new Date().toISOString(),
        },
      );

      if (!updated) {
        throw new Error('Video job disappeared after provider creation');
      }

      job = await import('../../../../lib/supabase/videoJobs').then(({ toAnimationJob }) =>
        toAnimationJob(updated),
      );

      return NextResponse.json(
        {
          jobId: job.jobId,
          characterId: job.characterId,
          status: job.status,
          externalJobId: job.externalJobId,
        },
        { status: 202 },
      );
    } catch (providerError: any) {
      await updateVideoJob(
        user.id,
        normalizedCharacterId,
        job.jobId,
        {
          status: 'failed',
          error: providerError?.message || 'Failed to create provider job',
          completed_at: new Date().toISOString(),
        },
      ).catch(() => undefined);

      throw providerError;
    }
  } catch (e: any) {
    const status = Number(e?.status);
    const message = String(e?.message || 'Failed to create animation');

    if (status === 402 || /insufficient credit|api error 402/i.test(message)) {
      return NextResponse.json(
        {
          error:
            'Replicate credit elfogyott. Toltse fel a billing egyenleget: https://replicate.com/account/billing#billing',
        },
        { status: 402 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
