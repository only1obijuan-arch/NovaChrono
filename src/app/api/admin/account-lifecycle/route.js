import { z } from "zod";
import { requireRole } from "@/app/api/utils/auth";
import {
  accountLifecycleCompletionEnabled,
  accountLifecycleMutationsEnabled,
  cancelPendingDeletion,
  completeAccountDeidentification,
  LifecycleError,
  listPendingLifecycleRequests,
  resolveRefereeResponsibility,
  resolveTeamResponsibility,
} from "@/app/api/utils/account-lifecycle";
import { sameOriginOrBearer } from "@/app/api/utils/request-security";

const reason = z.string().trim().min(10).max(500);
const uuid = () => z.string().uuid();
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete"), userId: uuid(), reason }).strict(),
  // Assisted withdrawal follows an external identity check, so the operator must
  // attest to it explicitly; the request is rejected without the attestation.
  z.object({ action: z.literal("cancel"), userId: uuid(), reason, identityVerified: z.literal(true) }).strict(),
  z.object({ action: z.literal("resolve_team"), userId: uuid(), teamId: uuid(), successorUserId: uuid().nullable().optional(), reason }).strict(),
  z.object({ action: z.literal("resolve_fixture"), userId: uuid(), matchId: uuid(), successorUserId: uuid().nullable().optional(), reason }).strict(),
]);

export async function GET(request) {
  try {
    const actor = await requireRole(request, "venue_admin", "super_admin");
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 403 });
    return Response.json({ requests: await listPendingLifecycleRequests({ actorId: actor.id }) });
  } catch (error) {
    if (error instanceof LifecycleError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[admin-account-lifecycle-list]", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
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

    const actor = await requireRole(request, "venue_admin", "org_admin", "super_admin");
    if (!actor) return Response.json({ error: "Unauthorized" }, { status: 403 });

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid lifecycle action" }, { status: 400 });
    }
    const { action, userId } = parsed.data;

    if (String(userId).toLowerCase() === String(actor.id).toLowerCase()) {
      return Response.json({ error: "Self-administration is not permitted" }, { status: 400 });
    }

    if (action === "cancel") {
      if (actor.role !== "super_admin") return Response.json({ error: "Forbidden" }, { status: 403 });
      const result = await cancelPendingDeletion({
        actorId: actor.id,
        targetUserId: userId,
        reason: parsed.data.reason,
        identityVerified: parsed.data.identityVerified,
      });
      return Response.json(result);
    }

    if (action === "resolve_team") {
      const result = await resolveTeamResponsibility({
        actorId: actor.id,
        targetUserId: userId,
        teamId: parsed.data.teamId,
        successorUserId: parsed.data.successorUserId ?? null,
        reason: parsed.data.reason,
      });
      return Response.json(result);
    }

    if (action === "resolve_fixture") {
      const result = await resolveRefereeResponsibility({
        actorId: actor.id,
        targetUserId: userId,
        matchId: parsed.data.matchId,
        successorUserId: parsed.data.successorUserId ?? null,
        reason: parsed.data.reason,
      });
      return Response.json(result);
    }

    if (actor.role !== "super_admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    if (!accountLifecycleCompletionEnabled()) {
      return Response.json(
        { error: "Account deletion completion is not currently authorised", code: "LIFECYCLE_COMPLETION_DISABLED" },
        { status: 503 },
      );
    }

    const result = await completeAccountDeidentification({
      actorId: actor.id,
      targetUserId: userId,
      reason: parsed.data.reason,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof LifecycleError) {
      return Response.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status },
      );
    }
    console.error("[admin-account-lifecycle]", error);
    return Response.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
