import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), send: vi.fn(), push: vi.fn(), auth: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ Pool: class { query(...a) { return mocks.query(...a); } } }));
vi.mock("@/app/api/utils/send-email", () => ({ sendEmail: mocks.send }));
vi.mock("@/app/api/utils/send-push", () => ({ sendPush: mocks.push }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
import { escapeHtml } from "@/utils/escape-html";
import { GET as availability } from "@/app/api/auth/confirm-availability/route";
import { POST as captainMessage } from "@/app/admin/captain-message/route";
import { verifyEmail } from "@/emails/verifyEmail";
import { inviteOrgAdminEmail } from "@/emails/inviteOrgAdminEmail";
import { inviteVenueAdminEmail } from "@/emails/inviteVenueAdminEmail";
import { matchReminderEmail } from "@/emails/matchReminderEmail";
import { unconfirmedAlertEmail } from "@/emails/unconfirmedAlertEmail";
import { sendCaptainWelcome } from "@/app/api/utils/captain-welcome";
import { printCredentials } from "@/utils/printCredentials";
const payload = "\"><img src=x onerror=\"alert(1)\"> & <script>alert(2)</script> O'Neil";
const UUID = "00000000-0000-4000-8000-000000000001";
const TOKEN = "a".repeat(64);
let responded, captainPushToken;
beforeEach(() => {
  vi.clearAllMocks(); responded = false; captainPushToken = null; mocks.send.mockResolvedValue({});
  mocks.push.mockResolvedValue({ status: "accepted", accepted: true });
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "venue_admin", venue_id: "venue" } });
  mocks.query.mockImplementation(async q => {
    let rows = [];
    if (q.includes("FROM availability_responses")) rows = [{ team_name: payload, opponent_name: payload, match_date_label: "Tuesday, 1 January 2030", time_slot: payload, match_status: "scheduled", league_status: "active", team_status: "active", is_current_participant: true, expiry_matches_schedule: true, before_expiry: true, before_match_start: true, response: responded ? "yes" : null, responded_at: responded ? "2030-01-01" : null }];
    else if (q.includes("SELECT * FROM auth_users WHERE id")) rows = [{ id: "admin", role: "venue_admin", venue_id: "venue" }];
    else if (q.includes("SELECT email, name FROM auth_users")) rows = [{ email: "admin@example.test" }];
    else if (q.includes("FROM leagues")) rows = [{ id: UUID, name: payload, venue_id: "venue" }];
    else if (q.includes("SELECT DISTINCT au")) rows = [{ id: "captain", email: "captain@example.test", push_token: captainPushToken }];
    return { rows, rowCount: rows.length };
  });
});
afterEach(() => vi.unstubAllGlobals());
function safe(html) {
  expect(html).not.toContain("<img"); expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;img"); expect(html).toContain("&amp;"); expect(html).toContain("O&#39;Neil");
}
describe("D6 HTML output boundaries", () => {
  it("escapes all five HTML metacharacters and preserves plain text", () => { expect(escapeHtml("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#39;"); expect(escapeHtml("City Rovers")).toBe("City Rovers"); expect(escapeHtml(null)).toBe(""); });
  it("encodes malicious stored team data in the read-only availability preview", async () => {
    const response = await availability(new Request(`https://example.test/api/auth/confirm-availability?token=${TOKEN}&response=no`));
    expect(response.status).toBe(200); safe(await response.text()); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("also keeps an existing-response page non-actionable", async () => { responded = true; const response = await availability(new Request(`https://example.test/api/auth/confirm-availability?token=${TOKEN}&response=yes`)); expect(response.status).toBe(410); expect((await response.text()).toLowerCase()).not.toContain("<img"); expect(mocks.send).not.toHaveBeenCalled(); });
  it.each([
    ["verification", () => verifyEmail({ name: payload, verifyUrl: 'https://example.test/verify?a=1&b="x"' })],
    ["organisation invite", () => inviteOrgAdminEmail({ orgName: payload, inviteUrl: "https://example.test/invite" })],
    ["venue invite", () => inviteVenueAdminEmail({ inviterName: payload, venueName: payload, orgName: payload, inviteUrl: "https://example.test/invite" })],
    ["match reminder", () => matchReminderEmail({ captainName: payload, teamName: payload, opponentName: payload, matchDate: "Tuesday", timeSlot: payload, fieldNumber: 1, urgencyColor: "#00FF9C", urgencyLabel: "Reminder", confirmUrl: "https://example.test/yes", declineUrl: "https://example.test/no" })],
    ["unconfirmed alert", () => unconfirmedAlertEmail({ adminName: payload, unconfirmedTeams: [payload], homeTeamName: payload, awayTeamName: payload, matchDate: "Tuesday", timeSlot: payload, fieldNumber: 1 })],
  ])("encodes %s template without removing layout", (_name, render) => { const html = render(); safe(html); expect(html).toContain("<html>"); expect(html).toContain("style="); });
  it("encodes quoted URL attributes", () => { const html = verifyEmail({ name: "Name", verifyUrl: 'https://example.test/verify?a=1&b="x"' }); expect(html).toContain('href="https://example.test/verify?a=1&amp;b=&quot;x&quot;"'); });
  it("encodes welcome HTML while preserving text mail", async () => { await sendCaptainWelcome({ email: "captain@example.test", name: payload, teamName: payload, joinCode: "ABC12345" }); safe(mocks.send.mock.calls[0][0].html); expect(mocks.send.mock.calls[0][0].text).toContain(payload); });
  it("encodes actual captain-message free text", async () => { const response = await captainMessage(new Request("https://example.test/admin/captain-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ league_id: UUID, message: payload }) })); expect(response.status).toBe(200); safe(mocks.send.mock.calls[0][0].html); expect(mocks.send.mock.calls[0][0].text).toBe(payload); });
  it("keeps admin email and in-app delivery truthful when optional push fails", async () => { captainPushToken = "ExpoPushToken[fixture]"; mocks.push.mockRejectedValue(new Error("temporary push failure")); const response = await captainMessage(new Request("https://example.test/admin/captain-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ league_id: UUID, message: "Operational update" }) })); const body = await response.json(); expect(response.status).toBe(200); expect(body.success).toBe(false); expect(body.channels).toMatchObject({ inApp: { sent: 1, failed: 0 }, push: { sent: 0, failed: 1 }, email: { sent: 1, failed: 0 } }); expect(mocks.send).toHaveBeenCalledOnce(); });
  it("encodes actual referee print document while preserving print operation", () => { const write = vi.fn(), print = vi.fn(); vi.stubGlobal("window", { open: () => ({ document: { write, close: vi.fn() }, print }) }); printCredentials({ venueName: payload, fieldNumber: 1, email: payload, password: payload }); safe(write.mock.calls[0][0]); expect(print).toHaveBeenCalledOnce(); });
});
