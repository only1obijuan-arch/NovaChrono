export function unconfirmedAlertEmail({
  adminName = "Admin",
  unconfirmedTeams,
  homeTeamName,
  awayTeamName,
  matchDate,
  timeSlot,
  fieldNumber,
}) {
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:520px;margin:40px auto;padding:20px;">
      <p style="margin:0 0 24px;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;text-align:center;">NOVACHRONO</p>
      <div style="background:#0D1B2E;border:1px solid rgba(255,200,0,0.3);border-radius:8px;overflow:hidden;">
        <div style="height:3px;background:#FFD700;"></div>
        <div style="padding:32px;">
          <p style="margin:0 0 8px;font-size:10px;color:#FFD700;letter-spacing:4px;font-family:monospace;">// ⚠️ URGENT — ACTION REQUIRED</p>
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">UNCONFIRMED TEAMS</h1>
          <p style="margin:0 0 20px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">
            Hi ${adminName},<br><br>
            It is now 12:00 and the following team(s) have <strong style="color:#FFD700;">not confirmed their availability</strong> for today's match:
          </p>
          <div style="background:rgba(255,200,0,0.06);border:1px solid rgba(255,200,0,0.2);border-radius:6px;padding:20px;margin-bottom:20px;">
            ${unconfirmedTeams.map((t) => `<p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#F4F4F9;">⚠️ ${t}</p>`).join("")}
            <p style="margin:8px 0 0;font-size:13px;color:rgba(180,200,220,0.5);">${homeTeamName} vs ${awayTeamName}</p>
            <p style="margin:4px 0 0;font-size:13px;color:rgba(180,200,220,0.5);">${matchDate} at ${timeSlot} — Field ${fieldNumber}</p>
          </div>
          <p style="margin:0;font-size:14px;color:rgba(180,200,220,0.6);line-height:1.6;">
            Please contact the team captain(s) directly to confirm whether they will be attending.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
