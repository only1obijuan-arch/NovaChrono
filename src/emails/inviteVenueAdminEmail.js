import { escapeHtml } from "@/utils/escape-html";
export function inviteVenueAdminEmail({ inviterName, orgName, venueName, inviteUrl }) {
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:520px;margin:40px auto;padding:20px;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:rgba(0,245,212,0.08);border:2px solid rgba(0,245,212,0.4);border-radius:8px;padding:16px 32px;">
          <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
        </div>
      </div>
      <div style="background:#0D1B2E;border:1px solid rgba(255,0,204,0.2);border-radius:8px;overflow:hidden;">
        <div style="height:3px;background:linear-gradient(90deg,transparent,#FF00CC,transparent);"></div>
        <div style="padding:32px;">
          <p style="margin:0 0 8px;font-size:10px;color:rgba(255,0,204,0.5);letter-spacing:4px;font-family:monospace;">// VENUE ADMIN INVITE</p>
          <h1 style="margin:0 0 20px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">YOU'VE BEEN INVITED</h1>
          <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.7;">
            You've been invited by <strong style="color:#F4F4F9;">${escapeHtml(inviterName)}</strong> to manage
            <strong style="color:#F4F4F9;"> ${escapeHtml(venueName)}</strong> at
            <strong style="color:#F4F4F9;"> ${escapeHtml(orgName)}</strong>.
          </p>
          <div style="background:rgba(255,0,204,0.04);border:1px solid rgba(255,0,204,0.15);border-radius:6px;padding:20px;margin-bottom:28px;">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,0,204,0.08);">
              <span style="font-size:10px;color:rgba(255,0,204,0.5);font-family:monospace;letter-spacing:3px;">ORGANISATION</span>
              <span style="font-size:14px;color:#F4F4F9;font-weight:700;">${escapeHtml(orgName)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,0,204,0.08);">
              <span style="font-size:10px;color:rgba(255,0,204,0.5);font-family:monospace;letter-spacing:3px;">VENUE</span>
              <span style="font-size:14px;color:#F4F4F9;font-weight:700;">${escapeHtml(venueName)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;">
              <span style="font-size:10px;color:rgba(255,0,204,0.5);font-family:monospace;letter-spacing:3px;">ROLE</span>
              <span style="font-size:14px;color:#FF00CC;font-weight:700;">Venue Admin</span>
            </div>
          </div>
          <div style="text-align:center;margin-bottom:20px;">
            <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:linear-gradient(135deg,#FF00CC,#AA0088);color:#F4F4F9;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:3px;padding:16px 40px;border-radius:4px;text-decoration:none;">
              ACCEPT INVITE →
            </a>
          </div>
          <p style="margin:0;font-size:11px;color:rgba(180,200,220,0.3);text-align:center;font-family:monospace;">
            This link expires in 24 hours.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
