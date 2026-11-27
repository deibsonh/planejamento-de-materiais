import { NextResponse } from 'next/server';
import { sameOrigin, authClient, demo } from '@/lib/server';
export async function POST(request:Request) {
  if (!sameOrigin(request)) return new NextResponse(null,{status:403});
  if (!demo) await (await authClient()).auth.signOut();
  return NextResponse.json({ok:true});
}
