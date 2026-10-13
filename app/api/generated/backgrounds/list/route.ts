import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getCurrentUser } from '../../../../../lib/supabase/server';
import { createSignedMediaUrls } from '../../../../../lib/supabase/media';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('generated_images')
    .select('id, storage_path, prompt, style, camera, aspect_ratio, variant, credit_cost, created_at')
    .eq('owner_id', user.id)
    .eq('generation_type', 'background')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Background library query error:', error);
    return NextResponse.json({ error: 'A háttérkönyvtár nem tölthető be. Ellenőrizd a háttérgenerálási adatbázis-migrációt.' }, { status: 500 });
  }

  const rows = data || [];
  const signedUrls = await createSignedMediaUrls(rows.map((item) => item.storage_path), 3600);
  const images = rows.map((item) => {
    const url = signedUrls[item.storage_path];
    if (!url) return null;
    return {
      id: item.id,
      filename: item.storage_path.split('/').pop() || item.id,
      url,
      created: new Date(item.created_at).getTime(),
      meta: {
        generationType: 'background',
        prompt: item.prompt,
        style: item.style,
        camera: item.camera,
        aspectRatio: item.aspect_ratio,
        variant: item.variant,
        creditCost: item.credit_cost,
      },
    };
  }).filter(Boolean);

  return NextResponse.json({ images });
}
