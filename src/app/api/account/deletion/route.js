import { z } from "zod";
import { resolveCurrentUser } from "@/app/api/utils/auth";
import { rateLimit } from "@/app/api/utils/rate-limit";
import {
  accountLifecycleCompletionEnabled,
  accountLifecycleMutationsEnabled,
  LifecycleError,
  requestAccountDeletion,
} from "@/app/api/utils/account-lifecycle";
import { sameOriginOrBearer } from "@/app/api/utils/request-security";

const requestSchema = z.object({
  password: z.string().min(1).max(128),
}).strict();

export async function GET(request) {
  const user = await resolveCurrentUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({
    available: accountLifecycleMutationsEnabled() && accountLifecycleCompletionEnabled(),
  });
}

export async function POST(request) {
  try {
    if (!accountLifecycleMutationsEnabled() || !accountLifecycleCompletionEnabled()) {
      return Response.json(
        {
          error: "Account lifecycle requests are not currently available",
          code: accountLifecycleMutationsEnabled()
            ? "LIFECYCLE_COMPLETION_DISABLED"
            : "LIFECYCLE_DISABLED",
        },
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
