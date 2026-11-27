import { NextResponse } from 'next/server';
import { clearSession } from "@/lib/passwords";
import { sameOrigin, demo } from '@/lib/server';
export async function POST(request:Request) {
  if (!sameOrigin(request)) return new NextResponse(null,{status:403});
  if (!demo) await clearSession();
  return NextResponse.json({ok:true});
}
