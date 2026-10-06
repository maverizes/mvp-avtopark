# JoyBor — bo‘sh turargoh joylarini haydovchilar bilan ulash

Haydovchi xaritada qaysi turargohda nechta joy bo‘shligini ko‘radi, joyni tanlaydi va
**faqat ism va telefon** bilan band qiladi. Joy darhol boshqalar uchun band bo‘lib ko‘rinadi,
operatorga Telegram xabar boradi, operator panelda tasdiqlaydi.

- Server: Node.js 24 (ichidagi SQLite bilan) — **npm paketlari yo‘q**, o‘rnatish kerak emas.
- Sayt: oddiy HTML, CSS va JS modullari — framework va bundler yo‘q.
- Operator paneli: `/admin`.

## Tuzilma

```
server/          HTTP server, API, ma'lumotlar bazasi
  index.js       kirish nuqtasi
  app.js         marshrutlar (API) va statik fayllar
  service.js     biznes-mantiq: bandlik, bronlar, turargohlar
  db.js          SQLite sxemasi va migratsiyalar
  auth.js        sessiyalar (cookie)
  http.js        marshrutlash, JSON, xavfsizlik sarlavhalari
shared/          joy turlari — server ham, sayt ham ishlatadi
public/          sayt: index.html, admin.html, styles.css, js/
  js/content.js  sayt matnlari va sozlamalari (tahrirlash shu yerda)
seed/lots.json   birinchi ishga tushirishdagi turargohlar
test/            avtomatik testlar
```

## Kompyuterda ishga tushirish (server kerak emas)

Node.js 22.13 yoki yangisi kerak (`node --version`).

**Eng oson yo‘l:** Finder’da `JoyBor.command` faylini ikki marta bosing. Terminal oynasi ochiladi,
server ishga tushadi va brauzerda sayt ochiladi. To‘xtatish — o‘sha oynada `Ctrl+C`.
Server ishlab turganda Mac uyquga ketmaydi.

Yoki terminalda:

```bash
npm start
```

- Sayt: http://localhost:3000, operator paneli: http://localhost:3000/admin.
- Operator paroli — `.env` faylidagi `ADMIN_PASSWORD`. `.env` bo‘lmasa, server terminalga vaqtinchalik parol chiqaradi.
- Ma’lumotlar `data/joybor.db` faylida: server o‘chib-yonsa ham bronlar va turargohlar saqlanadi.
- Lokal rejimda bazaga **namuna turargohlar** qo‘shiladi. Toza boshlash uchun `.env` da `SEED_DEMO=false` qiling,
  `data/` papkasini o‘chiring va qayta ishga tushiring.

Kod o‘zgarganda server o‘zi qayta ishga tushishi uchun: `npm run dev`. Testlar: `npm test`.

### Telefondan ochish (bitta Wi-Fi tarmog‘ida)

Server ishga tushganda terminalda `Telefondan: http://192.168.x.x:3000` manzili chiqadi — telefon brauzerida oching.
macOS kiruvchi ulanishga ruxsat so‘rasa — ruxsat bering.
Brauzer joylashuvni faqat https saytga beradi, shuning uchun bu usulda «Menga yaqinlari» o‘rniga xaritada o‘z joyingizni bosasiz.

### Vaqtincha internetga ochish (boshqalarga ko‘rsatish)

Server bo‘lmasa ham, Mac’dagi saytni vaqtincha internetga chiqarish mumkin — bepul, ro‘yxatdan o‘tmasdan.
Bir marta o‘rnating:

```bash
brew install cloudflared
```

Server ishlab turganda, ikkinchi terminal oynasida:

```bash
cloudflared tunnel --url http://localhost:3000
```

Terminalda `https://….trycloudflare.com` havolasi chiqadi — shuni yuboring. Bu https, shuning uchun
telefonda «Menga yaqinlari» ham ishlaydi. Havola har safar o‘zgaradi va faqat Mac yoqiq paytda ishlaydi.
Doimiy sayt uchun — pastdagi “Serverga joylash”.

## Sozlamalar (`.env`)

`.env.example` dan nusxa oling: `cp .env.example .env`.

| O‘zgaruvchi | Nima uchun |
|---|---|
| `ADMIN_PASSWORD` | Operator paneli paroli. Production’da majburiy, kamida 12 belgi |
| `PUBLIC_ORIGIN` | Sayt manzili, masalan `https://joybor.uz` |
| `DOMAIN` | Caddy uchun domen (docker-compose) |
| `TRUST_PROXY` | Server Caddy/Nginx ortida bo‘lsa `true` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Yangi bron haqida operatorga xabar |
| `SEED_DEMO` | `true` — bo‘sh bazaga namuna turargohlar (faqat sinov uchun) |
| `DB_PATH` | Baza fayli (standart: `data/joybor.db`) |
| `PORT` | Standart: 3000 |

Sayt matnlari, telefon va Telegram havolasi: `public/js/content.js` (`CONFIG.phone`, `CONFIG.telegram`).
To‘ldirilmagan aloqa havolalari saytda ko‘rsatilmaydi.

### Telegram xabarlarini ulash

1. Telegramda @BotFather → `/newbot` → token oling (`TELEGRAM_BOT_TOKEN`).
2. Botga yoki bot qo‘shilgan guruhga biror xabar yozing.
3. `https://api.telegram.org/bot<TOKEN>/getUpdates` ni oching — `chat.id` qiymati `TELEGRAM_CHAT_ID`.

Har bir yangi bron va so‘rov operatorga keladi: tur (`#ssenariy_tungi` tegi bilan), turargoh va joy,
muddat, ism, telefon, mashina raqami. Mijoz bronni bekor qilsa ham xabar keladi.

## Operator qo‘llanmasi (`/admin`)

**Bronlar.** Yangilari “Yangi” bo‘limida (sarlavhada soni ko‘rinadi, har 20 soniyada yangilanadi).
Mijozga qo‘ng‘iroq qiling → **Tasdiqlash** yoki **Rad etish**. Kutilayotgan va tasdiqlangan bron joyni ushlab turadi;
rad etilgan yoki bekor qilingan bron joyni bo‘shatadi.

**Turargohlar.** “+ Yangi turargoh”:
- **ID** — havola uchun qisqa nom (`chilonzor-maktab-1`), keyin o‘zgarmaydi;
- **Koordinata** — Yandex yoki Google xaritada nuqtani bosing, chiqqan ikki raqam;
- **Joy turlari va narx** — turargoh qachon ishlaydi (tunda/kunduzi) va bir birlik narxi (so‘m). Narx kiritilmasa, saytda “Kelishiladi” deb chiqadi;
- **Joylar sxemasi** — har qatorga joy nomlari, masalan:
  ```
  A1 A2 A3 A4 A5
  B1 B2 B3 B4 B5
  ```
  Sxema bo‘lmasa, faqat **joylar sonini** yozing — operator joyni o‘zi beradi;
- **Saytda ko‘rinadi** — belgini olib qo‘ysangiz, turargoh yashiriladi.

**Bandlik.** Turargoh sahifasida joyni bosing — saytda “band” bo‘lib ko‘rinadi (masalan, doimiy ijarachi).
Yana bosing — bo‘shaydi. Bron qilingan joylar bron raqami bilan ko‘rsatiladi.

**Statistika.** Har bir joy turiga nechta so‘rov kelgani — qaysi xizmatni birinchi ochishni shu ko‘rsatadi.

## Serverga joylash (VPS + Docker)

Ubuntu serverda Docker o‘rnatilgan bo‘lsin. Domenning A yozuvi server IP manziliga qaratilgan bo‘lsin.

```bash
git clone https://github.com/maverizes/mvp-avtopark.git joybor
cd joybor
cp .env.example .env
nano .env
docker compose up -d --build
```

`.env` da kamida `ADMIN_PASSWORD`, `DOMAIN` va `PUBLIC_ORIGIN` ni to‘ldiring.
Caddy HTTPS sertifikatini avtomatik oladi va yangilaydi. Baza `./data` papkasida saqlanadi.

Yangilash:

```bash
git pull
docker compose up -d --build
```

Zaxira nusxa (har kuni cron bilan):

```bash
sqlite3 data/joybor.db ".backup 'backup-$(date +%F).db'"
```

Docker’siz: Node.js 22.13+ o‘rnating, `.env` ni to‘ldiring va `npm start` ni systemd xizmati sifatida ishga tushiring;
oldiga HTTPS beradigan proksi (Caddy yoki Nginx) qo‘ying va `TRUST_PROXY=true` qiling.

## Xavfsizlik

- **Telefon tasdiqlanmaydi** (SMS pullik). Shuning uchun telefon — aloqa ma’lumoti, kirish kaliti emas:
  hisob qurilmadagi sessiyaga bog‘langan. Begona raqamni yozib, birovning bronlarini ko‘rib yoki bekor qilib bo‘lmaydi.
  Keyinroq SMS kod qo‘shilsa, raqam bilan istalgan qurilmadan kirish mumkin bo‘ladi.
- Sessiya: tasodifiy token `HttpOnly` cookie’da, bazada faqat uning xeshi.
- Boshqa saytdan so‘rov (CSRF): `Origin` tekshiriladi va faqat JSON qabul qilinadi.
- So‘rovlar soni cheklangan (ro‘yxatdan o‘tish, bron, operator paroli).
- Bir kishida ko‘pi bilan 5 ta faol bron.
- `Content-Security-Policy` va boshqa himoya sarlavhalari. Loglarga ism va telefon yozilmaydi.
- Bitta joyni bir vaqtda ikki kishi band qila olmaydi (tranzaksiya ichida tekshiriladi).

## API

| Usul | Manzil | Nima qiladi |
|---|---|---|
| GET | `/api/lots` | Faol turargohlar va hozirgi bandlik (tun/kun) |
| POST | `/api/auth/register` | `{ name, phone }` — ro‘yxatdan o‘tish (sessiya bo‘lsa — yangilash) |
| GET / PATCH | `/api/me` | Joriy foydalanuvchi |
| POST | `/api/auth/logout` | Chiqish |
| GET | `/api/bookings` | Mening bronlarim |
| POST | `/api/bookings` | Bron (`lotId`, `spot`, `startDate`, `qty`) yoki so‘rov (`scenarioId`, `address`, `date` …) |
| POST | `/api/bookings/:id/cancel` | Bronni bekor qilish |
| POST | `/api/admin/login` | Operator kirishi |
| GET | `/api/admin/bookings?status=` | Bronlar |
| POST | `/api/admin/bookings/:id/status` | Holatni o‘zgartirish |
| GET / PUT | `/api/admin/lots`, `/api/admin/lots/:id` | Turargohlar |
| POST | `/api/admin/lots/:id/blocks` | Joyni qo‘lda band/bo‘sh qilish |
| GET | `/api/admin/stats` | Statistika |

## Keyingi qadamlar

- SMS kod bilan telefonni tasdiqlash (Eskiz.uz yoki shunga o‘xshash xizmat).
- Onlayn to‘lov (Payme / Click).
- Bandlikni turargohdagi kamera yoki shlagbaum tizimidan avtomatik olish.
- OpenStreetMap plitkalari kichik trafik uchun bepul. Foydalanuvchilar ko‘paysa, kalitli xizmatga
  o‘ting (MapTiler, Stadia): `public/js/content.js` dagi `map.tileUrl` va `attribution`.
