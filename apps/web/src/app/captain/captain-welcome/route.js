// captain-welcome route
import { sendEmail } from "@/app/api/utils/send-email";

export async function POST(request) {
  try {
    const { email, name, teamName, joinCode } = await request.json();

    if (!email || !name) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get league details from join code
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    await sendEmail({
      to: email,
      subject: `Welcome to NovaChrono — Your Team Is Registered!`,
      html: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body style="margin:0;padding:0;background:#091833;font-family:'Helvetica Neue',Arial,sans-serif;">
            <div style="max-width:520px;margin:40px auto;padding:20px;">

              <!-- Header -->
              <div style="text-align:center;margin-bottom:32px;">
                <div style="display:inline-block;background:rgba(0,245,212,0.08);border:2px solid rgba(0,245,212,0.4);border-radius:8px;padding:16px 32px;">
                  <p style="margin:0;font-size:22px;font-weight:900;color:#00F5D4;letter-spacing:6px;font-family:monospace;">NOVACHRONO</p>
                  <p style="margin:4px 0 0;font-size:9px;color:rgba(0,245,212,0.4);letter-spacing:4px;font-family:monospace;">// TIME PAUSES. YOUR LEAGUE NEVER DOES.</p>
                </div>
              </div>

              <!-- Main card -->
              <div style="background:#0D1B2E;border:1px solid rgba(0,255,156,0.2);border-radius:8px;overflow:hidden;">
                <div style="height:3px;background:linear-gradient(90deg,transparent,#00FF9C,transparent);"></div>
                <div style="padding:32px;">
                  <p style="margin:0 0 8px;font-size:10px;color:rgba(0,255,156,0.5);letter-spacing:4px;font-family:monospace;">// WELCOME CAPTAIN</p>
                  <h1 style="margin:0 0 20px;font-size:24px;font-weight:900;color:#F4F4F9;letter-spacing:2px;font-family:monospace;">YOUR TEAM IS IN!</h1>

                  <p style="margin:0 0 24px;font-size:15px;color:rgba(180,200,220,0.7);line-height:1.7;">
                    Hey ${name}, your team <strong style="color:#F4F4F9;">${teamName}</strong> has been successfully registered. You're ready to compete!
                  </p>

                  <!-- Details card -->
                  <div style="background:rgba(0,255,156,0.04);border:1px solid rgba(0,255,156,0.15);border-radius:6px;padding:20px;margin-bottom:28px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(0,255,156,0.08);">
                      <span style="font-size:10px;color:rgba(0,255,156,0.5);font-family:monospace;letter-spacing:3px;">TEAM</span>
                      <span style="font-size:14px;color:#F4F4F9;font-weight:700;font-family:monospace;">${teamName}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(0,255,156,0.08);">
                      <span style="font-size:10px;color:rgba(0,255,156,0.5);font-family:monospace;letter-spacing:3px;">CAPTAIN</span>
                      <span style="font-size:14px;color:#F4F4F9;font-weight:700;">${name}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
                      <span style="font-size:10px;color:rgba(0,255,156,0.5);font-family:monospace;letter-spacing:3px;">JOIN CODE</span>
                      <span style="font-size:16px;color:#00FF9C;font-weight:900;letter-spacing:4px;font-family:monospace;">${joinCode?.toUpperCase()}</span>
                    </div>
                  </div>

                  <!-- What's next -->
                  <div style="margin-bottom:28px;">
                    <p style="margin:0 0 12px;font-size:10px;color:rgba(0,255,156,0.5);letter-spacing:4px;font-family:monospace;">// WHAT'S NEXT</p>
                    <ul style="margin:0;padding:0 0 0 20px;color:rgba(180,200,220,0.6);font-size:14px;line-height:1.8;">
                      <li>Sign in to your captain portal to view your team</li>
                      <li>Check fixtures once your admin generates the schedule</li>
                      <li>You'll receive match reminders before each game</li>
                      <li>Confirm availability when reminders arrive</li>
                    </ul>
                  </div>

                  <!-- CTA -->
                  <div style="text-align:center;">
                    <a href="${appUrl}/account/signin" style="display:inline-block;background:linear-gradient(135deg,#00FF9C,#00CC78);color:#091833;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:3px;padding:16px 40px;border-radius:4px;text-decoration:none;">
                      GO TO CAPTAIN PORTAL →
                    </a>
                  </div>
                </div>
              </div>

              <!-- Footer -->
              <p style="text-align:center;margin-top:24px;font-size:9px;color:rgba(180,200,220,0.15);letter-spacing:3px;font-family:monospace;">
                © 2025 NOVACHRONO. ALL RIGHTS RESERVED.
              </p>
            </div>
          </body>
        </html>
      `,
      text: `Welcome ${name}! Your team ${teamName} has been registered on NovaChrono. Sign in at ${appUrl}/account/signin`,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Welcome email error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
