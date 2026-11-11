import { z } from "zod";
import { resolveCurrentUser } from "@/app/api/utils/auth";
import { rateLimit } from "@/app/api/utils/rate-limit";
import {
  accountLifecycleMutationsEnabled,
  LifecycleError,
  requestAccountDeletion,
} from "@/app/api/utils/account-lifecycle";

const requestSchema = z.object({
  password: z.string().min(1).max(128),
}).strict();

function sameOriginOrBearer(request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    if (!accountLifecycleMutationsEnabled()) {
      return Response.json(
        { error: "Account lifecycle requests are not currently available", code: "LIFECYCLE_DISABLED" },
        { status: 503 },
      );
    }

    if (!sameOriginOrBearer(request)) {
      return Response.json({ error: "Invalid request origin" }, { status: 403 });
    }

    const user = await resolveCurrentUser(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { allowed } = await rateLimit(`account-deletion:${user.id}`, {
      max: 3,
      windowMinutes: 60,
    });
    if (!allowed) {
      return Response.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Password confirmation is required" }, { status: 400 });
    }

    const result = await requestAccountDeletion({
      userId: user.id,
      password: parsed.data.password,
    });
    return Response.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof LifecycleError) {
      return Response.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status },
      );
    }
    console.error("[account-deletion]", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
