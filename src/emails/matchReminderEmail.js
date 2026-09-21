import { escapeHtml } from "@/utils/escape-html";
export function matchReminderEmail({
  captainName = "Captain",
  teamName,
  opponentName,
  matchDate,
  timeSlot,
  fieldNumber,
  urgencyColor,
  urgencyLabel,
  confirmUrl,
  declineUrl,
}) {
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:520px;margin:40px auto;padding:20px;">
      <div style="text-align:center;margin-bottom:32px;">
        <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
      </div>
      <div style="background:#0D1B2E;border:1px solid ${urgencyColor}40;border-radius:8px;overflow:hidden;">
        <div style="height:3px;background:${urgencyColor};"></div>
        <div style="padding:32px;">
          <p style="margin:0 0 8px;font-size:10px;color:${urgencyColor};letter-spacing:4px;font-family:monospace;">// ${escapeHtml(urgencyLabel)}</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">ARE YOU IN?</h1>
          <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">
            Hi ${escapeHtml(captainName)},<br><br>
            Please confirm <strong style="color:#F4F4F9;">${escapeHtml(teamName)}</strong>'s availability for your upcoming match.
          </p>
          <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 6px;font-size:11px;color:rgba(180,200,220,0.5);font-family:monospace;">MATCH DETAILS</p>
            <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#F4F4F9;">${escapeHtml(teamName)} vs ${escapeHtml(opponentName)}</p>
            <p style="margin:0 0 4px;font-size:14px;color:rgba(180,200,220,0.6);">${escapeHtml(matchDate)}</p>
            <p style="margin:0;font-size:14px;color:rgba(180,200,220,0.6);">${escapeHtml(timeSlot)} — Field ${escapeHtml(fieldNumber)}</p>
          </div>
          <div style="display:flex;gap:12px;">
            <a href="${escapeHtml(confirmUrl)}" style="flex:1;display:block;background:linear-gradient(135deg,#00FF9C,#00CC78);color:#091833;font-family:monospace;font-size:14px;font-weight:900;letter-spacing:2px;padding:16px;border-radius:4px;text-decoration:none;text-align:center;">
              ✅ YES, WE'RE IN
            </a>
            <a href="${escapeHtml(declineUrl)}" style="flex:1;display:block;background:rgba(255,0,204,0.1);border:1px solid rgba(255,0,204,0.4);color:#FF00CC;font-family:monospace;font-size:14px;font-weight:900;letter-spacing:2px;padding:16px;border-radius:4px;text-decoration:none;text-align:center;">
              ❌ CAN'T MAKE IT
            </a>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
