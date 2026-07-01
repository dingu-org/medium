import { NextResponse } from 'next/server';
import { getClientDirectory } from '@/lib/clients/queries';
import { getPwaPtId } from '@/lib/pwa/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const ptId = await getPwaPtId();
  if (!ptId)
    return NextResponse.json(
      { code: 'UNAUTHORIZED', error: 'Pa autorizim' },
      { status: 401 },
    );
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return NextResponse.json(await getClientDirectory(ptId, query));
}
