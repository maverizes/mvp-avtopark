// Tuzilmali log: har qator — bitta JSON. Shaxsiy ma'lumot (telefon, ism) yozilmaydi.

function write(level, msg, data) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...data });
  (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
}

export const log = {
  info: (msg, data = {}) => write('info', msg, data),
  warn: (msg, data = {}) => write('warn', msg, data),
  error: (msg, data = {}) => write('error', msg, data)
};

/** Testlarda jim log */
export const silentLog = { info() {}, warn() {}, error() {} };
