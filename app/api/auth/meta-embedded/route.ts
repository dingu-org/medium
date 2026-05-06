export async function GET() {
  return Response.json({
    ok: true,
    route: 'meta-embedded-placeholder',
    phase: 'bootstrap',
  });
}
