// Legacy URL retained without public delivery capability. Welcome mail now
// comes only from a successfully committed captain registration.
export async function POST() {
  return Response.json({ error: "Welcome mail is sent during registration" }, { status: 410 });
}
