import { z } from "zod";
import { requireRole } from "@/app/api/utils/auth";
import {
  accountLifecycleMutationsEnabled,
  LifecycleError,
  listPendingLifecycleRequests,
  resolveRefereeResponsibility,
  resolveTeamResponsibility,
} from "@/app/api/utils/account-lifecycle";
import { sameOriginOrBearer } from "@/app/api/utils/request-security";

const uuid = () => z.string().uuid();
const reason = z.string().trim().min(10).max(500);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resolve_team"), userId: uuid(), teamId: uuid(), successorUserId: uuid().nullable().optional(), reason }).strict(),
  z.object({ action: z.literal("resolve_fixture"), userId: uuid(), matchId: uuid(), successorUserId: uuid().nullable().optional(), reason }).strict(),
]);

function lifecycleErrorResponse(error) {
  if (error instanceof LifecycleError) {
    return Response.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }
  console.error("[org-admin-account-lifecycle]", error);
  return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
}

export async function GET(request) {
  try {
    const actor = await requireRole(request, "org_admin", "super_admin");
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 403 });
    return Response.json({ requests: await listPendingLifecycleRequests({ actorId: actor.id }) });
  } catch (error) {
    return lifecycleErrorResponse(error);
  }
}

export async function PATCH(request) {
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

    const actor = await requireRole(request, "org_admin", "super_admin");
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 403 });

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid lifecycle action" }, { status: 400 });
    if (String(parsed.data.userId).toLowerCase() === String(actor.id).toLowerCase()) {
      return Response.json({ error: "Self-administration is not permitted" }, { status: 400 });
    }

    if (parsed.data.action === "resolve_team") {
      return Response.json(await resolveTeamResponsibility({
        actorId: actor.id,
        targetUserId: parsed.data.userId,
        teamId: parsed.data.teamId,
        successorUserId: parsed.data.successorUserId ?? null,
        reason: parsed.data.reason,
      }));
    }

    return Response.json(await resolveRefereeResponsibility({
      actorId: actor.id,
      targetUserId: parsed.data.userId,
      matchId: parsed.data.matchId,
      successorUserId: parsed.data.successorUserId ?? null,
      reason: parsed.data.reason,
    }));
  } catch (error) {
    return lifecycleErrorResponse(error);
  }
}
