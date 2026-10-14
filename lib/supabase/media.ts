import { createSupabaseServerClient } from './server';

export const MEDIA_BUCKET = 'v3-media';

function extensionFromDataUrl(dataUrl: string): string {
  const match = String(dataUrl || '').match(/^data:(image\/[^;]+);base64,/i);
  const mime = match?.[1]?.toLowerCase() || 'image/png';
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mime] || 'png';
}

export function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string; extension: string } {
  const match = String(dataUrl || '').match(/^data:(image\/[^;]+);base64,(.+)$/i);
  if (!match) throw new Error('Invalid image data URL');
  const contentType = match[1].toLowerCase();
  return { buffer: Buffer.from(match[2], 'base64'), contentType, extension: extensionFromDataUrl(dataUrl) };
}

export async function uploadMedia(path: string, data: Buffer, contentType: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, data, { contentType, upsert: false });
  if (error) throw new Error(`Media upload failed: ${error.message}`);
  return path;
}

export async function uploadDataUrl(path: string, dataUrl: string): Promise<string> {
  const { buffer, contentType } = dataUrlToBuffer(dataUrl);
  return uploadMedia(path, buffer, contentType);
}

export async function downloadAsDataUrl(path: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path);
  if (error || !data) throw new Error(`Media download failed: ${error?.message || 'empty file'}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  return `data:${data.type || 'image/png'};base64,${buffer.toString('base64')}`;
}

export async function createSignedMediaUrl(path: string, expiresIn = 3600): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(`Unable to sign media URL: ${error?.message || 'unknown error'}`);
  return data.signedUrl;
}

export async function createSignedMediaUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  const uniquePaths = Array.from(new Set(paths.map((path) => String(path || '').trim()).filter(Boolean)));
  if (!uniquePaths.length) return {};

  const supabase = await createSupabaseServerClient();
  const result: Record<string, string> = {};
  // Storage's signed-URL endpoint can fail for large batches. Keep requests small
  // so a character with hundreds of generated images still gets a usable gallery.
  const batchSize = 50;

  for (let offset = 0; offset < uniquePaths.length; offset += batchSize) {
    const batch = uniquePaths.slice(offset, offset + batchSize);
    try {
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(batch, expiresIn);
      if (error) {
        console.error('Unable to sign media URL batch:', {
          offset,
          count: batch.length,
          message: error.message,
        });
        continue;
      }

      const signedInBatch = new Set<string>();
      for (const item of data || []) {
        if (item?.path && item?.signedUrl) {
          const path = String(item.path);
          result[path] = String(item.signedUrl);
          signedInBatch.add(path);
        }
      }

      if (signedInBatch.size < batch.length) {
        console.warn('Some media URLs could not be signed:', {
          offset,
          requested: batch.length,
          signed: signedInBatch.size,
        });
      }
    } catch (error: any) {
      console.error('Unable to sign media URL batch:', {
        offset,
        count: batch.length,
        message: error?.message || 'Unknown storage error',
      });
    }
  }

  return result;
}

export async function deleteMedia(path: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  if (error) throw new Error(`Media delete failed: ${error.message}`);
}
