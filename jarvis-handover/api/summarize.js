// POST /api/summarize  { text, hintCat? }  ->  { items: [...] }
// Turns a spoken Front Office handover into structured items with Claude.
import Anthropic from "@anthropic-ai/sdk";
import { json, requireMember } from "./_lib.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const CATS = ["vip", "room", "complaint", "maint", "billing", "lost", "other"];

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          room: { type: "string" },
          guest: { type: "string" },
          cat: { type: "string", enum: CATS },
          pri: { type: "string", enum: ["urgent", "follow", "info"] },
          summary: { type: "string" },
          action: { type: "string" },
          due: { type: "string" },
        },
        required: ["room", "guest", "cat", "pri", "summary", "action", "due"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const SYSTEM = `คุณคือผู้ช่วยส่งเวรแผนก Front Office ของโรงแรม 5 ดาวในกรุงเทพฯ
ผู้ใช้พูดเล่าเรื่องที่ต้องส่งต่อให้กะถัดไป เป็นภาษาไทยปนอังกฤษ อาจมีคำฟุ่มเฟือยหรือคำที่ระบบถอดเสียงผิด
ให้แยกเป็นรายการ 1 เรื่องต่อ 1 รายการ

ฟิลด์:
- room: เลขห้องเป็นตัวเลข ถ้าไม่มีให้ "—"
- guest: ชื่อแขกแบบย่อ เช่น "คุณ T." ใส่ "(VIP)" ต่อท้ายถ้าเป็น VIP ถ้าไม่มีให้ ""
  ตาม PDPA ห้ามใส่ชื่อเต็ม เบอร์โทร อีเมล เลขพาสปอร์ต หรือเลขบัตร แม้ผู้ใช้จะพูดมา
- cat: vip (VIP, arrival, special request ก่อนเข้าพัก) | room (ห้อง, housekeeping, late check-out, upgrade) | complaint | maint (ซ่อมบำรุง) | billing (บิล มัดจำ ชำระเงิน) | lost (Lost & Found) | other
- pri: urgent = ต้องทำทันทีในกะถัดไป หรือแขกไม่พอใจอยู่ | follow = ต้องติดตามให้จบ | info = แจ้งให้ทราบ ไม่ต้องทำอะไร
- summary: สถานการณ์ 1 ประโยคสั้น
- action: สิ่งที่กะถัดไปต้องทำ ขึ้นต้นด้วยคำกริยา ถ้าไม่มีให้ ""
- due: เวลาแบบ HH:MM (24 ชม.) ถ้ามีเส้นตาย เช่น "บ่ายสาม" = "15:00" ถ้าไม่มีให้ ""

ห้ามแต่งข้อมูลที่ผู้ใช้ไม่ได้พูด ถ้าข้อความไม่มีเรื่องส่งเวรเลย ให้ items เป็น []`;

export async function POST(request) {
  const who = await requireMember(request);
  if (who instanceof Response) return who;

  let body;
  try { body = await request.json(); } catch { return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400); }
  const text = String(body?.text || "").trim();
  const hintCat = CATS.includes(body?.hintCat) ? body.hintCat : null;
  if (!text) return json({ error: "ยังไม่มีข้อความ" }, 400);
  if (text.length > 8000) return json({ error: "ข้อความยาวเกินไป แบ่งพูดเป็นช่วง ๆ" }, 413);

  const user = (hintCat ? `หมวดที่ผู้ใช้เลือกไว้: ${hintCat} (ใช้เมื่อไม่ชัดเจน)\n\n` : "") + `ข้อความ:\n"""${text}"""`;

  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Short extraction: low effort keeps the wait at the counter short.
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      // If a request is declined by a safety classifier, the API retries it on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: user }],
    });

    if (res.stop_reason === "refusal") return json({ error: "Claude ไม่สรุปข้อความนี้ ลองพิมพ์ใหม่" }, 422);
    if (res.stop_reason === "max_tokens") return json({ error: "ข้อความยาวเกินไป แบ่งพูดเป็นช่วง ๆ" }, 413);
    const out = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(out);
    return json({ items: Array.isArray(parsed.items) ? parsed.items : [] });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "ใช้งานถี่เกินไป รอสักครู่" }, 429);
    if (e instanceof Anthropic.APIError) {
      console.error("Claude API error", e.status, e.message);
      return json({ error: "Claude ไม่ตอบในครั้งนี้" }, 502);
    }
    console.error(e);
    return json({ error: "สรุปไม่สำเร็จ" }, 500);
  }
}
