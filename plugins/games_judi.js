// =========================================================
// PLUGIN: GAMES JUDI - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { parseAmount, capMoney, sanitizeUserEconomy, formatMoney } from '../econ_utils.js';

export default {
  name: 'games_judi',
  version: '3.1.0',
  commands: ['judi'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    sanitizeUserEconomy(u);

    if (cmd === 'judi') {
      if (!u.cd) u.cd = {};
      let now = Date.now();

      if (u.cd.judi && u.cd.judi > now) {
        let sisa = Math.ceil((u.cd.judi - now) / 60000);
        await sock.sendMessage(from, { text: `⏳ *SABAR BOS!*\nTunggu *${sisa} Menit* lagi.` });
        return true;
      }

      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}judi [jumlah / all]` });
        return true;
      }

      let taruhan = 0n;
      if (args[0].toLowerCase() === 'all') {
        taruhan = u.uang;
        if (taruhan <= 0n) {
          await sock.sendMessage(from, { text: "❌ Uangmu Rp 0, tidak bisa judi all!" });
          return true;
        }
      } else {
        let taruhanCheck = parseAmount(args[0]);
        if (!taruhanCheck.valid) { await sock.sendMessage(from, { text: `❌ ${taruhanCheck.error}` }); return true; }
        taruhan = taruhanCheck.value;
      }

      if (u.uang < taruhan) {
        await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup. 💰 Uangmu: Rp ${formatMoney(u.uang)}` });
        return true;
      }

      u.cd.judi = now + 300000;
      let win = Math.random() < 0.45;

      if (win) {
        u.uang += taruhan;
        saveDB(db);
        await sock.sendMessage(from, { text: `🎰 *KASINO RYOUMADA* 🎰\n\n🎉 *JACKPOT! KAMU MENANG!* 🎉\n\n💸 *Taruhan:* Rp ${formatMoney(taruhan)}\n🎁 *Keuntungan:* Rp ${formatMoney(taruhan)}\n\n💰 *Total Uangmu:* Rp ${formatMoney(u.uang)}` });
      } else {
        u.uang -= taruhan;
        saveDB(db);
        await sock.sendMessage(from, { text: `🎰 *KASINO RYOUMADA* 🎰\n\n📉 *YAHH... KAMU KALAH!* 📉\n\n💸 *Taruhan:* Rp ${formatMoney(taruhan)}\n🔥 *Uang Melayang:* Rp ${formatMoney(taruhan)}\n\n💰 *Sisa Uangmu:* Rp ${formatMoney(u.uang)}` });
      }
      return true;
    }

    return false;
  }
};
