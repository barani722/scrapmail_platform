import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { clientEnv } from "@/env/client";

import { applyRememberChoice, REMEMBER_COOKIE } from "./cookies";

/** Pages that work without signing in. */
const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * signed-out visitors to /login. This is only a convenience redirect:
 * real authorization is enforced by server checks and RLS in the database.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value;

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(
              name,
              value,
              applyRememberChoice(options, remember),
            );
          }
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Validates the session and refreshes it if needed. Do not remove.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (signedIn && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
