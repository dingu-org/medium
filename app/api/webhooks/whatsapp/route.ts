export async function GET() {
  return Response.json({
    ok: true,
    route: 'whatsapp-webhook-placeholder',
    phase: 'bootstrap',
  });
}

export async function POST() {
  return Response.json({
    ok: true,
    route: 'whatsapp-webhook-placeholder',
    phase: 'bootstrap',
  });
}
