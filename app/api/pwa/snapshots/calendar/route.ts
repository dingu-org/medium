import { NextResponse } from 'next/server';
import { getPwaPtId } from '@/lib/pwa/auth';
import { getCalendarSnapshot } from '@/lib/pwa/read-models';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const ptId = await getPwaPtId();
  if (!ptId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const snapshot = await getCalendarSnapshot(ptId, {
    date: url.searchParams.get('date') ?? undefined,
    view: url.searchParams.get('view') ?? undefined,
  });
  return NextResponse.json(snapshot);
}
