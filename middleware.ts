import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/auth')) {
    return response;
  }

  const isProtectedPage =
    pathname.startsWith('/character') ||
    pathname.startsWith('/presets');

  const isProtectedApi =
    pathname.startsWith('/api/generate') ||
    pathname.startsWith('/api/animations') ||
    (pathname.startsWith('/api/credits') && pathname !== '/api/credits/packages') ||
    pathname.startsWith('/api/characters') ||
    pathname.startsWith('/api/generated') ||
    pathname.startsWith('/api/presets') ||
    pathname.startsWith('/api/generation-presets');

  if ((isProtectedPage || isProtectedApi) && !user) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/character/:path*',
    '/presets/:path*',
    '/api/generate/:path*',
    '/api/animations/:path*',
    '/api/credits/:path*',
    '/api/characters/:path*',
    '/api/generated/:path*',
    '/api/presets/:path*',
    '/api/generation-presets/:path*',
  ],
};
