// Operatorga Telegram xabari. Sozlanmagan bo'lsa — jim o'tkazib yuboriladi.
// Xabar yuborilmasa ham bron saqlanadi: bildirishnoma asosiy jarayonni to'xtatmaydi.

export function createNotifier({ token, chatId }, log) {
  if (!token || !chatId) {
    return { enabled: false, send: async () => false };
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  return {
    enabled: true,
    async send(text) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
            signal: AbortSignal.timeout(8000)
          });
          if (res.ok) return true;
          log.warn('telegram_failed', { status: res.status, attempt });
          if (res.status < 500 && res.status !== 429) return false;   // qayta urinish foydasiz
        } catch (err) {
          log.warn('telegram_error', { error: err.message, attempt });
        }
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
      return false;
    }
  };
}
