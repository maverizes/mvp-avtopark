# mvp-avtopark — JoyBor

Bo‘sh turargoh joylarini haydovchilar bilan ulaydigan sahifa. Backend yo‘q:
har bir ariza Telegram orqali operatorga boradi.

## Fayllar

| Fayl | Nima bor |
|---|---|
| `index.html` | Sahifa tuzilishi (matn yo‘q, faqat joylar) |
| `styles.css` | Dizayn |
| `script.js` | Ssenariy almashuvi, xarita, yaqin turargohlar, joylar sxemasi, forma, Telegram |
| `data.js` | **Hamma ma'lumot shu yerda** — faqat shu faylni tahrirlaysiz |

## Ishga tushirish

`index.html` faylini brauzerda ikki marta bosib oching. Hech narsa o‘rnatish shart emas.

Lokal server kerak bo‘lsa (masalan, telefonda sinash uchun):

```bash
python3 -m http.server 8000
```

So‘ng `http://localhost:8000` ni oching.

## data.js ni to‘ldirish

Kvadrat qavsdagi qiymatlar (`[MANZIL]`, `[NARX]`, `[N]`, `[TELEGRAM]`, `[TELEFON]`)
hali noma'lum — ularni haqiqiy qiymat bilan almashtiring. O‘ylab topilgan raqam yozmang.

### 1. CONFIG — eng birinchi shu

```js
telegram: 'joybor_operator',   // @ belgisisiz
phone: '+998901234567',
demo: false,                   // namuna turargohlarni yashirish
```

- `telegram` to‘ldirilmaguncha forma Telegramni ochmaydi — faqat nusxalash uchun matn ko‘rsatadi.
- `demo: true` bo‘lsa, sahifada `DEMO_LOCATIONS` dagi **namuna** turargohlar ham chiqadi
  (“Namuna” belgisi bilan). Haqiqiy ishga chiqishdan oldin `false` qiling.
- `periods` — “Tunda” va “Kunduzi” davrlari. Bandlik shu ikki davr uchun alohida yoziladi.
- `map.center`, `map.zoom` — turargohlarda koordinata bo‘lmasa xarita shu nuqtani ko‘rsatadi (hozir Toshkent).
- `map.dark` — xaritani qorong‘i rangda ko‘rsatish.
- `walkSpeed` — piyoda yurish tezligi (metr/daqiqa), “≈ N daq piyoda” shundan hisoblanadi.
- `lowSpots` — bo‘sh joy shu sondan oshmasa, turargoh “Kam qoldi” (sariq) deb ko‘rsatiladi.

### 2. LOCATIONS — turargoh qo‘shish

```js
{
  id: 'chilonzor-1',
  title: 'Maktab hovlisi',
  address: 'Chilonzor, 9-kvartal',
  scenarioIds: ['tungi'],               // qaysi turlar uchun ochiq
  price: { tungi: '300 000' },          // birligi ssenariydan olinadi (oy/kun/soat)
  lat: 41.2856, lng: 69.2034,           // xaritadagi nuqta
  rows: [                               // joylar sxemasi: har bir qator — bitta ro'yxat
    ['A1', 'A2', 'A3', 'A4'],
    ['B1', 'B2', 'B3', 'B4']
  ],
  busy: {                               // band joylar
    night: ['A2', 'B1'],
    day: []
  },
  updatedAt: '24.09, 18:30'             // bandlik qachon yangilangani
}
```

- `rows` berilsa, sahifada turargoh sxemasi chiziladi: bo‘sh joylar yashil, band joylarda
  mashina belgisi. Qatorlar orasiga “yo‘lak” qo‘yiladi. Joylar soni o‘zi hisoblanadi.
- `rows: null` bo‘lsa, sxema o‘rniga “sxema hali kiritilmagan” yozuvi chiqadi, `slots` ko‘rsatiladi.
- **Bandlikni yangilash**: joy band bo‘lsa, uning nomini `busy.night` yoki `busy.day` ga qo‘shing,
  bo‘shasa — olib tashlang, `updatedAt` ni o‘zgartiring va faylni qayta joylang.
  Backend yo‘q, shuning uchun bu qo‘lda qilinadi.
- Koordinatani olish: Yandex yoki Google xaritada nuqtani bosing — ikki raqam chiqadi
  (birinchisi `lat`, ikkinchisi `lng`). Bilmasangiz `null` qoldiring.

Turargoh “Tunda” yoki “Kunduzi” ochiqmi — `scenarioIds` dagi ssenariylarning `timeWindow`
qiymatidan avtomatik hisoblanadi. Yopiq turargoh ro‘yxat oxirida “Bu vaqtda yopiq” deb turadi.

### 3. SCENARIOS — joy turlari

- `active: false` — “tez orada” belgisi chiqadi, ariza “talab ro‘yxati” deb yuboriladi.
  Tur ochilganda `true` qiling.
- `unit` — `'soat'`, `'kun'` yoki `'oy'`.
- `timeWindow` — `{ from: '19:00', to: '08:00' }`; vaqt kelishilsa `null`.
- `fields` — formada qo‘shimcha chiqadigan maydonlar:
  `startDate`, `date`, `timeFrom`, `timeTo`, `cars`.

Yangi ssenariy qo‘shsangiz, u tablarda, formada, narx blokida va xaritada o‘zi paydo bo‘ladi.

### 4. TEXT — sahifa matnlari

“Tanish holat” kartalari, “Qanday ishlaydi” qadamlari, FAQ va kichik yozuvlar (`TEXT.ui`).

## Foydalanuvchi uchun qanday ishlaydi

1. “Qayerda joy bor” bo‘limida vaqtni tanlaydi: Hozir / Tunda / Kunduzi.
2. **Xaritada** har bir turargoh marker bilan ko‘rinadi, markerda — bo‘sh joylar soni:
   yashil — joy bor, sariq — kam qoldi, qizil — to‘la, kulrang — bu vaqtda yopiq.
3. **“Menga yaqinlari”** tugmasini bosadi — brauzer joylashuvni so‘raydi. Keyin:
   - ko‘k nuqta — foydalanuvchi turgan joy;
   - ro‘yxat masofa bo‘yicha tartiblanadi (“770 m”, “1,8 km”);
   - eng yaqin bo‘sh turargoh avtomatik tanlanadi: “Eng yaqin bo‘sh joy: … — 770 m, ≈ 10 daq piyoda”;
   - foydalanuvchi yurganda masofalar yangilanib turadi.
   Joylashuvga ruxsat berilmasa, foydalanuvchi xaritani bosib o‘z joyini belgilaydi.
4. Turargohni tanlaydi (markerdan yoki ro‘yxatdan) — kartada masofa, ish vaqti, narx,
   **Yandex / Google orqali yo‘l ko‘rsatish** va joylar sxemasi chiqadi.
5. Bo‘sh joyni bosadi → “Arizaga o‘tish”. Tanlangan joy formada ko‘rinadi.
6. Formani to‘ldiradi → Telegram ochiladi, xabarda ssenariy, tanlangan joy,
   sana/vaqt va aloqa ma'lumotlari bo‘ladi. Mashina raqami o‘zi `01 A 234 BC` ko‘rinishiga keltiriladi.

Xarita: sichqoncha yoki barmoq bilan suriladi, ikki barmoq / Ctrl + g‘ildirak / “+ −” tugmalari
bilan kattalashtiriladi. Klaviaturada: strelkalar — surish, `+` / `−` — kattalashtirish.

### Joylashuv haqida

- Brauzer joylashuvni faqat **https** saytda yoki `localhost` da beradi. `index.html` ni
  to‘g‘ridan-to‘g‘ri ochganda ishlamasligi mumkin — shunda xaritani bosib belgilash ishlaydi.
- Joylashuv faqat foydalanuvchi brauzerida hisoblanadi, hech qayerga yuborilmaydi.
  Yo‘l ko‘rsatish havolalariga ham faqat turargoh nuqtasi qo‘yiladi.

## Havola bilan ochish

Har bir tur o‘z havolasiga ega — reklamada to‘g‘ridan-to‘g‘ri ishlating:

```
https://sizning-sayt.uz/?ssenariy=tungi
https://sizning-sayt.uz/?ssenariy=tadbir
```

## Arizalarni sanash

Telegram xabarida `#ssenariy_tungi` kabi teg bor. Operator chatida shu tegni
qidirib, har bir tur bo‘yicha nechta ariza kelganini sanaysiz.

## Joylashtirish (bepul)

Sayt oddiy statik fayllar — istalgan statik hostingga qo‘yiladi:

- **GitHub Pages**: repozitoriy → Settings → Pages → `main` branch, `/ (root)`.
- **Netlify Drop**: app.netlify.com/drop sahifasiga papkani sudrab tashlang.
- **Cloudflare Pages / Vercel**: papkani yuklang, build buyrug‘i kerak emas.

## Tashqi bog‘liqliklar

- Google Fonts (Fraunces, Public Sans).
- Xarita — JS kutubxonasiz, `script.js` ichida yozilgan. Faqat OpenStreetMap plitka
  rasmlari yuklanadi (`CONFIG.map.tileUrl`). Kerak bo‘lmasa `CONFIG.map.enabled = false` —
  xarita yashiriladi, ro‘yxat va sxema ishlashda davom etadi.
- OpenStreetMap plitkalari kichik trafik uchun bepul. Foydalanuvchilar ko‘paysa,
  kalitli plitka xizmatiga o‘ting (masalan, MapTiler yoki Stadia Maps): `tileUrl`,
  `attribution` va `attributionUrl` ni almashtirish kifoya.

## Keyingi qadam

Hozir bandlik (`busy`) qo‘lda yangilanadi. Real vaqtda ko‘rsatish uchun turargohdagi
kamera yoki shlagbaum tizimidan (raqamni taniydigan ANPR) “ichida N ta mashina” ma'lumotini
olib, `busy` ni avtomatik to‘ldiradigan kichik backend kerak bo‘ladi.
