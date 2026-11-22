// GET /api/config  ->  which server features are switched on (no secrets).
export function GET() {
  return Response.json(
    {
      ai: Boolean(process.env.ANTHROPIC_API_KEY),
      linePush: Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN),
      pin: Boolean(process.env.TEAM_PIN),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
