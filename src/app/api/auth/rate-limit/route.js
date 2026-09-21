import { loginLimitStatus } from "@/app/api/utils/login-limit";

async function status(email) {
  if (typeof email !== "string" || !email.trim() || email.length > 254) {
    return Response.json({ error: "Invalid identifier" }, { status: 400 });
  }
  try {
    return Response.json(await loginLimitStatus(email));
  } catch {
    return Response.json({ allowed: false, error: "Service unavailable", message: "Sign-in is temporarily unavailable. Please try again." }, { status: 503 });
  }
}

// Retain the old client's POST contract as read-only feedback. Only credentials
// authentication can reserve an attempt or clear it after verified success.
export async function POST(request) {
  try {
    const { email } = await request.json();
    return status(email);
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET(request) {
  const email = new URL(request.url).searchParams.get("email");
  if (!email) return Response.json({ allowed: true });
  return status(email);
}
