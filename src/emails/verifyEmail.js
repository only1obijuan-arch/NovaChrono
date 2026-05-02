export function verifyEmail({ name, verifyUrl }) {
  return `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
    <div style="max-width:520px;margin:40px auto;padding:20px;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-block;background:rgba(0,245,212,0.08);border:2px solid rgba(0,245,212,0.4);border-radius:8px;padding:16px 24px;">
          <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
          <p style="margin:4px 0 0;font-size:9px;color:rgba(0,245,212,0.4);letter-spacing:4px;font-family:monospace;">// TIME PAUSES. YOUR LEAGUE NEVER DOES.</p>
        </div>
      </div>
      <div style="background:#0D1B2E;border:1px solid rgba(0,245,212,0.2);border-radius:8px;overflow:hidden;">
        <div style="height:3px;background:linear-gradient(90deg,transparent,#00F5D4,transparent);"></div>
        <div style="padding:32px;">
          <p style="margin:0 0 8px;font-size:10px;color:rgba(0,245,212,0.5);letter-spacing:4px;font-family:monospace;">// ACTION REQUIRED</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">VERIFY YOUR EMAIL</h1>
          <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.6;">
            Hi ${name}, welcome to NovaChrono! Click the button below to verify your email and activate your captain account.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,rgba(0,245,212,0.2),rgba(0,245,212,0.1));border:1px solid rgba(0,245,212,0.5);color:#00F5D4;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:3px;padding:16px 40px;border-radius:4px;text-decoration:none;">
              VERIFY EMAIL →
            </a>
          </div>
          <div style="border-top:1px solid rgba(0,245,212,0.08);padding-top:20px;">
            <p style="margin:0;font-size:12px;color:rgba(180,200,220,0.4);line-height:1.8;">
              ⏱ This link expires in <strong style="color:rgba(0,245,212,0.6);">24 hours</strong>.<br>
              🔒 If you didn't create this account, you can safely ignore this email.
            </p>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
