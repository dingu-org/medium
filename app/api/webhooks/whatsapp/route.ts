import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // These are the exact names Meta sends in the query string
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // 1. Check if the mode is 'subscribe'
  // 2. Check if the token matches your 'xxx' (use an env variable for security)
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook Verified!');
    // IMPORTANT: Return the challenge as plain text, NOT JSON
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log('Incoming Message:', JSON.stringify(body, null, 2));
  return new Response('EVENT_RECEIVED', { status: 200 });
}
