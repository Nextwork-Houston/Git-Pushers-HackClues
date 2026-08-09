import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Routes anyone may reach without a session. The Orbit showcase is marketing,
 * so it stays open — signed-in users are not bounced away from it.
 */
const PUBLIC_ROUTES = ['/', '/login', '/orbit']

/** Routes that only make sense when signed out. */
const AUTH_ROUTES = ['/login']

/** The signed-in landing page. */
const HOME_ROUTE = '/companion'

function isPublic(path: string) {
  return PUBLIC_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  )
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // API routes authenticate themselves and answer with 401 JSON rather than a
  // redirect, so they must never be caught by the HTML redirect logic below.
  if (path.startsWith('/api/')) return response

  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  if (user && AUTH_ROUTES.includes(path)) {
    const url = request.nextUrl.clone()
    url.pathname = HOME_ROUTE
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
