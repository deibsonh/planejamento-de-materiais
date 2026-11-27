import { NextResponse } from 'next/server';
import { authClient } from '@/lib/server';
export async function GET(request:Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const result = await (await authClient()).auth.exchangeCodeForSession(code);
    if (!result.error) return NextResponse.redirect(new URL('/',process.env.SITE_URL || url.origin));
  }
  return NextResponse.redirect(new URL('/?login=erro',process.env.SITE_URL || url.origin));
}
