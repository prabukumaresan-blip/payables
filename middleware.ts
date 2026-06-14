import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Define public paths that do not require authentication
  const isPublicPath = path === '/login';

  // Check for mock session first
  const hasMockSession = request.cookies.has('mock-auth-session');

  if (hasMockSession) {
    if (isPublicPath) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // If supabase is configured, use its server client session check
  if (isSupabaseConfigured()) {
    try {
      const { createServerClient } = await import('@supabase/ssr');
      let response = NextResponse.next({
        request: {
          headers: request.headers,
        },
      });

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) =>
                request.cookies.set(name, value)
              );
              response = NextResponse.next({
                request,
              });
              cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options)
              );
            },
          },
        }
      );

      const { data: { user } } = await supabase.auth.getUser();

      if (!user && !isPublicPath) {
        return NextResponse.redirect(new URL('/login', request.url));
      }

      if (user && isPublicPath) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }

      return response;
    } catch (e) {
      console.error('Middleware Supabase error:', e);
    }
  }

  // Fallback Mock Authentication using Cookie (if no Supabase, and no mock session)
  if (!isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
