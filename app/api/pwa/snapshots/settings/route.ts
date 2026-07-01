import { NextResponse } from 'next/server';
import { getPwaPtId } from '@/lib/pwa/auth';
import { getSettingsSnapshot } from '@/lib/pwa/read-models';

export const runtime = 'nodejs';

export async function GET() {
  const ptId = await getPwaPtId();
  if (!ptId)
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Pa autorizim' },
      { status: 401 },
    );
  return NextResponse.json(await getSettingsSnapshot(ptId));
}
