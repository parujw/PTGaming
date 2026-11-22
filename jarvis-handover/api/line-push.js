// POST /api/line-push  { text, briefId? }  ->  { ok: true }
// Sends a brief to the team's LINE group through a LINE Official Account (Messaging API).
import { admin, json, requireMember, TEAM_ID } from "./_lib.js";

export async function POST(request) {
  const who = await requireMember(request);
  if (who instanceof Response) return who;

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return json({ error: "ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN" }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  let text = String(body?.text || "").trim();
  if (!text) return json({ error: "ไม่มีข้อความ" }, 400);
  if (text.length > 4900) text = text.slice(0, 4880) + "\n…(ตัดเพราะยาวเกิน LINE)";

  const a = admin();
  let to = process.env.LINE_GROUP_ID || "";
  if (!to && a) {
    const meta = await a.db.doc(`teams/${TEAM_ID}/meta/line`).get();
    to = (meta.exists && meta.data().groupId) || "";
  }
  if (!to) return json({ error: "ยังไม่รู้จักกลุ่ม LINE เชิญบอทเข้ากลุ่มแล้วพิมพ์ \"jarvis id\"" }, 409);

  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!r.ok) {
    console.error("LINE push failed", r.status, await r.text());
    return json({ error: `LINE ไม่รับข้อความ (${r.status})` }, 502);
  }

  if (a && body?.briefId) {
    await a.db.doc(`teams/${TEAM_ID}/meta/line`).set({ lastBriefId: String(body.briefId) }, { merge: true });
  }
  return json({ ok: true });
}
