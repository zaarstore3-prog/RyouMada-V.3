// =========================================================
// PLUGIN: RPG DEFENSE - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { formatMoney, sanitizeUserEconomy } from '../econ_utils.js';

export default {
  name: 'rpg_defense',
  version: '3.1.0',
  commands: ['belidefense', 'cekdefense'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    sanitizeUserEconomy(u);

    // ==================== BELI DEFENSE ====================
    if (cmd === 'belidefense') {
      let list = `🛡️ *TOKO PERTAHANAN RYOUMADA* 🛡️\n\nLindungi uangmu dari para perampok!\n\n` +
                 `1️⃣ *Gembok Berkarat* (1x Pakai) - Rp 15.000\n` +
                 `2️⃣ *CCTV Palsu* (3x Pakai) - Rp 45.000\n` +
                 `3️⃣ *Alarm Keamanan* (5x Pakai) - Rp 120.000\n` +
                 `4️⃣ *Sistem Laser* (10x Pakai) - Rp 350.000\n` +
                 `5️⃣ *🐕 Anjing Penjaga* (30x Pakai) - Rp 5.000.000\n\n` +
                 `Ketik: *${prefix}belidefense [nomor]*`;

      if (!args[0]) {
        await sock.sendMessage(from, { text: list });
        return true;
      }

      let pilihan = args[0];
      let item = {};
      if (pilihan === '1') item = { name: 'Gembok Berkarat', price: 15000n, uses: 1, block: 0.10 };
      else if (pilihan === '2') item = { name: 'CCTV Palsu', price: 45000n, uses: 3, block: 0.25 };
      else if (pilihan === '3') item = { name: 'Alarm Keamanan', price: 120000n, uses: 5, block: 0.45 };
      else if (pilihan === '4') item = { name: 'Sistem Laser', price: 350000n, uses: 10, block: 0.70 };
      else if (pilihan === '5') item = { name: '🐕 Anjing Penjaga', price: 5000000n, uses: 30, block: 0.85 };
      else {
        await sock.sendMessage(from, { text: "❌ Pilihan tidak valid." });
        return true;
      }

      if (u.uang < item.price) {
        await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup! Kamu butuh Rp ${formatMoney(item.price)} untuk membeli ${item.name}.` });
        return true;
      }

      if (u.defense && u.defense.uses > 0 && u.defense.blockRate > item.block) {
        await sock.sendMessage(from, { text: `⚠️ *Peringatan:* Kamu menimpa pertahanan lamamu yang lebih kuat (${u.defense.name}) dengan yang baru!` });
      }

      u.uang -= item.price;
      u.defense = { name: item.name, uses: item.uses, blockRate: item.block };
      saveDB(db);

      await sock.sendMessage(from, { text: `✅ *BERHASIL MEMBELI PERTAHANAN!*\n\nKamu telah memasang *${item.name}* di rumahmu.` });
      return true;
    }

    // ==================== CEK DEFENSE ====================
    if (cmd === 'cekdefense') {
      if (!u.defense || u.defense.uses <= 0) {
        await sock.sendMessage(from, { text: "⚠️ Rumahmu saat ini **TIDAK TERLINDUNGI**! Segera beli keamanan di toko." });
        return true;
      }
      await sock.sendMessage(from, {
        text: `🛡️ *STATUS KEAMANAN RUMAH* 🛡️\n\n🔹 *Alat Aktif:* ${u.defense.name}\n🔹 *Daya Tahan:* ${u.defense.uses} Kali Serangan Lagi\n🔹 *Efektivitas:* ${(u.defense.blockRate * 100)}%`
      });
      return true;
    }

    return false;
  }
};
