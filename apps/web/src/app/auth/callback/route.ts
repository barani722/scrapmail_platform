import { type NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Email confirmation links land here: exchange the code for a session. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const login = new URL("/login", request.url);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/pending", request.url));
    // Supabase confirmed the address before sending the user here; signing in
    // automatically only works in the browser used to register.
    login.searchParams.set("notice", "confirmed");
  } else if (params.get("error")) {
    // Expired or already used link.
    login.searchParams.set("notice", "link_invalid");
  }

  return NextResponse.redirect(login);
}
