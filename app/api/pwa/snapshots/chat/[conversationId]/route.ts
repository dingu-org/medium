import { NextResponse } from 'next/server';
import { getPwaPtId } from '@/lib/pwa/auth';
import { getChatThreadSnapshot } from '@/lib/pwa/read-models';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const ptId = await getPwaPtId();
  if (!ptId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { conversationId } = await params;
  const snapshot = await getChatThreadSnapshot(ptId, conversationId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}
