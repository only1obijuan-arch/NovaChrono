export async function GET() {
  return Response.json(
    { error: "Legacy token exchange is permanently disabled" },
    { status: 410 },
  );
}
