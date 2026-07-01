import { NextResponse } from 'next/server';
import { getPwaPtId } from '@/lib/pwa/auth';
import { getTodaySnapshot } from '@/lib/today/queries';

export const runtime = 'nodejs';

export async function GET() {
  const ptId = await getPwaPtId();
  if (!ptId)
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Pa autorizim' },
      { status: 401 },
    );
  return NextResponse.json(await getTodaySnapshot(ptId));
}
