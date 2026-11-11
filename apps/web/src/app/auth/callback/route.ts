import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Email confirmation links land here: exchange the code for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const target = new URL("/pending", request.url);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(target);
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
