// POST /api/line-webhook  (set this URL as the Webhook URL in LINE Developers)
// - "jarvis id" in a group: saves the group as the team's handover group and replies with its id
// - "รับ" / "รับเวร" / "รับทราบ": records who acknowledged the latest brief
import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { admin, TEAM_ID } from "./_lib.js";

const ACK = /^\s*(รับ|รับเวร|รับทราบ|ok|โอเค)\b/i;

export async function POST(request) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!secret || !token) return new Response("not configured", { status: 503 });

  const raw = await request.text();
  const sig = request.headers.get("x-line-signature") || "";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return new Response("bad signature", { status: 401 });

  const { events = [] } = JSON.parse(raw);
  const a = admin();

  for (const ev of events) {
    const groupId = ev.source?.groupId;
    if (!groupId) continue;

    if (ev.type === "join") {
      await reply(token, ev.replyToken, "สวัสดีครับ Jarvis พร้อมส่งบรีฟเข้ากลุ่มนี้ พิมพ์ \"jarvis id\" เพื่อตั้งเป็นกลุ่มส่งเวร");
      continue;
    }
    if (ev.type !== "message" || ev.message?.type !== "text") continue;
    const text = ev.message.text.trim();

    if (/^jarvis\s*id$/i.test(text)) {
      if (a) await a.db.doc(`teams/${TEAM_ID}/meta/line`).set({ groupId }, { merge: true });
      await reply(token, ev.replyToken, a
        ? "ตั้งกลุ่มนี้เป็นกลุ่มส่งเวรแล้ว ✅"
        : `Group ID: ${groupId}\nนำไปใส่ LINE_GROUP_ID ใน Vercel`);
      continue;
    }

    if (ACK.test(text) && a) {
      const meta = await a.db.doc(`teams/${TEAM_ID}/meta/line`).get();
      const briefId = meta.exists && meta.data().lastBriefId;
      if (!briefId) continue;
      const name = await memberName(token, groupId, ev.source.userId);
      await a.db.doc(`teams/${TEAM_ID}/briefs/${briefId}`).set(
        { acks: FieldValue.arrayUnion({ name, at: Date.now(), via: "line" }) },
        { merge: true },
      );
      await reply(token, ev.replyToken, `รับทราบครับ ${name} รับเวรแล้ว ✅`);
    }
  }
  return new Response("ok");
}

async function memberName(token, groupId, userId) {
  if (!userId) return "สมาชิก";
  try {
    const r = await fetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (r.ok) return (await r.json()).displayName || "สมาชิก";
  } catch {}
  return "สมาชิก";
}

async function reply(token, replyToken, text) {
  if (!replyToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  }).catch(() => {});
}
