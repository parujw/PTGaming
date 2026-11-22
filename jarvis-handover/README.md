# Jarvis ส่งเวร

พูดครั้งเดียว ทั้งกะรู้เรื่อง: แอปส่งเวร Front Office ที่ฟังเสียง แยกเป็นรายการด้วย Claude แล้วส่งบรีฟเข้ากลุ่ม LINE พร้อมบันทึกว่าใครตอบ "รับ" แล้ว

## ทำอะไรได้
- **พูดส่งเวร** แตะปุ่มทองแล้วเล่าได้หลายห้องในครั้งเดียว (Chrome/Android/Edge และ Safari บน iOS ที่รองรับการฟังเสียง) เบราว์เซอร์ที่ฟังเองไม่ได้ ใช้ปุ่มไมค์บนคีย์บอร์ดแทน
- **Jarvis สรุป** Claude แยกเป็น ห้อง · แขก (ย่อตาม PDPA) · หมวด · ความด่วน · สิ่งที่ต้องทำ · เวลา แล้วให้ตรวจก่อนเพิ่มเข้าบอร์ด
- **บอร์ด** แบ่งตามแผนก (VIP & Arrival, Housekeeping, Complaint, ซ่อม, Billing, Lost & Found) กรองเรื่องค้าง/ด่วน ค้นหาเลขห้อง แก้ไข ปิดเรื่อง
- **บรีฟ LINE** บรรทัดแรกบอกจำนวนเรื่องด่วน เรียงด่วนก่อน ส่งได้ 3 แบบ: ส่งเข้ากลุ่มอัตโนมัติ (LINE OA), เปิดหน้าแชร์ของ LINE, หรือคัดลอก
- **รับเวร** เพื่อนพิมพ์ "รับ" ในกลุ่ม LINE หรือกด "ฉันรับเวรแล้ว" ในแอป ชื่อจะขึ้นใต้บรีฟนั้น
- **ติดตั้งบนมือถือ** เป็นแอป (PWA) เปิดได้แม้สัญญาณหลุด

แอปทำงานได้ 3 ระดับ เปิดเพิ่มทีละขั้นได้:

| ระดับ | ต้องตั้ง | ได้อะไร |
|---|---|---|
| 0 | ไม่ต้องตั้งอะไร | บอร์ดในเครื่อง, ตัวแยกข้อความแบบพื้นฐาน, แชร์/คัดลอกเข้า LINE |
| 1 | `ANTHROPIC_API_KEY` + `TEAM_PIN` | Claude สรุปเสียง (ใส่ PIN ในหน้าตั้งค่า) |
| 2 | Firebase | บอร์ดเดียวกันทั้งทีมแบบเรียลไทม์ เข้าสู่ระบบด้วย Google |
| 3 | LINE OA | ส่งเข้ากลุ่มอัตโนมัติ และนับคนตอบ "รับ" |

## โครงสร้าง
```
index.html          หน้าแอปทั้งหมด (ไม่มีขั้นตอน build)
config.js           ตั้งค่าฝั่งหน้าเว็บ: teamId และ Firebase web config
api/summarize.js    POST: ข้อความ → รายการส่งเวร (Claude)
api/line-push.js    POST: ส่งบรีฟเข้ากลุ่ม LINE
api/line-webhook.js LINE webhook: "jarvis id" ตั้งกลุ่ม, "รับ" บันทึกคนรับเวร
api/config.js       GET: บอกหน้าเว็บว่าเปิดฟีเจอร์ไหนไว้
firestore.rules     ให้เฉพาะอีเมลในรายชื่อทีมอ่าน/เขียนได้
```
แก้สีแบรนด์ที่ตัวแปร `--gold`, `--gold-hi`, `--night` บนสุดของ `<style>` ใน `index.html`

## Deploy

### 1. GitHub
โฟลเดอร์นี้อยู่ใน repo `PTGaming` ตอนนี้ จะใช้ต่อในนี้หรือย้ายไป repo ใหม่ก็ได้ (คัดลอกทั้งโฟลเดอร์ `jarvis-handover/` ไปไว้ที่ root ของ repo ใหม่)

### 2. Vercel
1. New Project → เลือก repo
2. ถ้าใช้ repo `PTGaming` ตั้ง **Root Directory** เป็น `jarvis-handover`
3. Framework Preset: **Other** ไม่ต้องมี Build Command
4. Environment Variables (ดู `.env.example`):
   - `ANTHROPIC_API_KEY` จาก platform.claude.com
   - `TEAM_ID` = `fo`
   - `TEAM_PIN` ตั้งเลขที่ทีมรู้กัน (ถ้ายังไม่ใช้ Firebase)
5. Deploy แล้วเปิดเว็บ → ตั้งค่า → ใส่ชื่อและ PIN

### 3. Firebase (บอร์ดร่วมทั้งทีม)
1. สร้างโปรเจกต์ที่ console.firebase.google.com
2. **Authentication** → Sign-in method → เปิด Google และเพิ่มโดเมน Vercel ใน Authorized domains
3. **Firestore** → Create database (production mode, region `asia-southeast1`)
4. สร้างเอกสาร `teams/fo` มีฟิลด์ `members` (array) ใส่อีเมล Google ของทีมเป็นตัวพิมพ์เล็ก
5. Project settings → Your apps → Web → คัดลอก config ไปวางใน `config.js` (ค่านี้ไม่ใช่ความลับ)
6. Project settings → Service accounts → Generate new private key → วาง JSON ทั้งก้อนใน Vercel เป็น `FIREBASE_SERVICE_ACCOUNT`
7. Deploy rules:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use --add          # เลือกโปรเจกต์
   firebase deploy --only firestore:rules
   ```

### 4. LINE Official Account (ส่งอัตโนมัติ)
LINE Notify ปิดบริการแล้ว จึงใช้ Messaging API
1. สร้าง LINE Official Account และเปิด Messaging API ที่ developers.line.biz
2. ในหน้า Messaging API: เปิด **Allow bot to join group chats**, ปิด Auto-reply
3. Webhook URL: `https://<โดเมน-vercel>/api/line-webhook` แล้วเปิด Use webhook
4. ใส่ใน Vercel: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`
5. เชิญบอทเข้ากลุ่มส่งเวร แล้วพิมพ์ `jarvis id`
   - ถ้าตั้ง Firebase แล้ว บอทจำกลุ่มให้เอง
   - ถ้ายังไม่ตั้ง บอทจะตอบ Group ID ให้นำไปใส่ `LINE_GROUP_ID`
6. Redeploy บน Vercel ปุ่ม "ส่งเข้ากลุ่มทีม" จะขึ้นแทน "เปิดใน LINE"

## ความปลอดภัยและ PDPA
- API ทุกตัวต้องมี Firebase ID token ของสมาชิกทีม หรือ PIN ทีม ถ้าไม่ได้ตั้งทั้งสองอย่าง API จะปฏิเสธ
- Webhook ตรวจลายเซ็น `x-line-signature` ทุกครั้ง
- AI ถูกสั่งให้ย่อชื่อแขก ไม่ใส่เบอร์โทร อีเมล เลขพาสปอร์ต หรือเลขบัตร แต่ยังควรตรวจก่อนส่งทุกครั้ง
- ข้อความที่พูดถูกส่งไปประมวลผลที่ Anthropic API และบรีฟถูกส่งผ่าน LINE ควรตรวจนโยบาย IT ของโรงแรมก่อนใช้กับข้อมูลแขกจริง

## ทดสอบในเครื่อง
```bash
npm install
npx vercel dev      # เปิด http://localhost:3000 พร้อม API
```
