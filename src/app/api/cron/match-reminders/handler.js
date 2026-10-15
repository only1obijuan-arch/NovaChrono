import {
  findAutomaticReminderCandidates,
  sendMiddayUnconfirmedAlerts,
  sendReminderForTeam,
} from "@/app/api/utils/match-reminders";

export async function POST(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "reminders";
  if (!["reminders", "midday"].includes(type)) {
    return Response.json({ error: "Unsupported cron type" }, { status: 400 });
  }

  try {
    if (type === "midday") {
      const result = await sendMiddayUnconfirmedAlerts();
      return Response.json({ success: result.errors.length === 0, type, ...result });
    }

    const candidates = await findAutomaticReminderCandidates();
    const result = { sent: 0, skipped: 0, errors: [] };
    for (const candidate of candidates) {
      const delivery = await sendReminderForTeam({
        matchId: candidate.match_id,
        teamId: candidate.team_id,
        side: candidate.side,
        automatic: true,
      });
      if (delivery.status === "sent") {
        result.sent += 1;
      } else if (delivery.status === "email_failed") {
        result.errors.push({
          matchId: candidate.match_id,
          code: delivery.reason,
          retryable: delivery.retryable,
        });
      } else {
        result.skipped += 1;
      }
    }

    return Response.json({
      success: result.errors.length === 0,
      type,
      ...result,
    });
  } catch (error) {
    console.error("Cron reminder operation failed", { code: error?.code || "UNKNOWN" });
    return Response.json({ error: "The reminder operation failed" }, { status: 500 });
  }
}
