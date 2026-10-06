#!/bin/bash
# JoyBor'ni kompyuterda ishga tushirish: Finder'da ikki marta bosing.
# To'xtatish — shu oynada Ctrl+C. Server ishlab turganda Mac uyquga ketmaydi.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js topilmadi. https://nodejs.org dan o'rnating (22.13 yoki yangisi)."
  read -r -p "Yopish uchun Enter bosing..." _
  exit 1
fi

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "  Sayt:             http://localhost:3000"
echo "  Operator paneli:  http://localhost:3000/admin   (parol — .env faylida)"
[ -n "$IP" ] && echo "  Telefondan:       http://$IP:3000   (telefon shu Wi-Fi'da bo'lsin)"
echo "  To'xtatish:       Ctrl+C"
echo ""

(sleep 2 && open "http://localhost:3000") &
exec caffeinate -i npm start
