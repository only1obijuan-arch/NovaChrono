import { requireRole } from "@/app/api/utils/auth";
import { UUID_RE } from "@/app/api/utils/ownership";
import {
  findCurrentMatchTeams,
  sendReminderForTeam,
} from "@/app/api/utils/match-reminders";

export async function POST(request) {
  const user = await requireRole(request, "venue_admin", "super_admin");
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { matchId } = await request.json();
    if (!UUID_RE.test(matchId)) {
      return Response.json({ error: "Invalid match ID" }, { status: 400 });
    }

    const teams = await findCurrentMatchTeams(matchId);
    if (!teams) return Response.json({ error: "Match not found" }, { status: 404 });

    const deliveries = [];
    for (const team of teams) {
      deliveries.push(await sendReminderForTeam({
        matchId,
        teamId: team.teamId,
        side: team.side,
        actorId: user.id,
      }));
    }

    if (deliveries.every((delivery) => delivery.reason === "forbidden")) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (deliveries.every((delivery) => delivery.reason === "unauthorized")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const sent = deliveries.filter((delivery) => delivery.status === "sent").length;
    const failed = deliveries.filter((delivery) => delivery.status === "email_failed").length;
    const skipped = deliveries.length - sent - failed;
    if (sent === 0 && failed === 0) {
      return Response.json(
        { error: "No eligible captain reminder recipients", sent, failed, skipped },
        { status: 409 },
      );
    }

    return Response.json({
      success: failed === 0,
      sent,
      failed,
      skipped,
    }, { status: failed > 0 && sent === 0 ? 502 : 200 });
  } catch (error) {
    console.error("Manual match reminder failed", { code: error?.code || "UNKNOWN" });
    return Response.json({ error: "The reminder operation failed" }, { status: 500 });
  }
}
