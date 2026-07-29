// =========================================================
// PLUGIN: RPG PINJOL - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { parseAmount, capMoney, sanitizeUserEconomy, formatMoney, toBigInt, PRACTICAL_MAX } from '../econ_utils.js';

export default {
  name: 'rpg_pinjol',
  version: '3.1.0',
  commands: ['pinjol', 'bayarpinjol', 'cekpinjol'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    sanitizeUserEconomy(u);

    // Sinkronisasi & perbaikan bug otomatis
    if (!u.pinjol) u.pinjol = { amount: 0n, due_time: 0, next_penalty: 0 };
    u.hutang = toBigInt(u.hutang);
    u.pinjol.amount = toBigInt(u.pinjol.amount);

    if (u.hutang < u.pinjol.amount && u.hutang >= 0n) {
      u.pinjol.amount = u.hutang;
    } else if (u.pinjol.amount === 0n && u.hutang > 0n) {
      u.pinjol.amount = u.hutang;
      if (!u.pinjol.due_time) u.pinjol.due_time = Date.now() + 3600000;
    } else if (u.pinjol.amount < 0n || u.hutang < 0n) {
      u.pinjol.amount = 0n;
      u.hutang = 0n;
    }
    u.hutang = u.pinjol.amount;

    // Auto-penalty system (bunga majemuk 2x lipat)
    if (u.pinjol.amount > 0n && u.pinjol.due_time > 0) {
      if (!u.pinjol.next_penalty || u.pinjol.next_penalty < u.pinjol.due_time) {
        u.pinjol.next_penalty = u.pinjol.due_time + 3600000;
      }
      let penaltyApplied = false;
      let currentNow = Date.now();
      let loopCount = 0;

      while (currentNow >= u.pinjol.next_penalty && loopCount < 1000 && u.pinjol.amount < PRACTICAL_MAX) {
        u.pinjol.amount *= 2n;
        if (u.pinjol.amount >= PRACTICAL_MAX) {
          u.pinjol.amount = PRACTICAL_MAX;
        }
        u.pinjol.next_penalty += 3600000;
        penaltyApplied = true;
        loopCount++;
      }

      if (penaltyApplied) {
        u.hutang = u.pinjol.amount;
        saveDB(db);
      }
    }

    // ==================== PINJOL ====================
    if (cmd === 'pinjol') {
      if (!args[0] || !args[1]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}pinjol [Nominal] [Waktu (Jam)]\nContoh: ${prefix}pinjol 500000 24` });
        return true;
      }

      let amountCheck = parseAmount(args[0], { max: PRACTICAL_MAX });
      if (!amountCheck.valid) { await sock.sendMessage(from, { text: `❌ ${amountCheck.error}` }); return true; }
      let amount = amountCheck.value;

      let hoursCheck = parseAmount(args[1], { max: 720n });
      if (!hoursCheck.valid) { await sock.sendMessage(from, { text: "❌ Waktu tidak valid (Maksimal 720 jam)." }); return true; }
      let hours = Number(hoursCheck.value);

      if (u.pinjol.amount > 0n) {
        await sock.sendMessage(from, { text: `❌ Kamu masih memiliki tagihan Pinjol sebesar *Rp ${formatMoney(u.pinjol.amount)}*!` });
        return true;
      }

      u.uang += amount;
      u.pinjol = {
        amount: amount,
        due_time: Date.now() + (hours * 3600000),
        next_penalty: Date.now() + (hours * 3600000) + 3600000
      };
      u.hutang = amount;
      saveDB(db);

      let dueString = new Date(u.pinjol.due_time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      await sock.sendMessage(from, {
        text: `🏦 *PINJOL CAIR!* 🏦\n\nKamu telah meminjam uang sebesar *Rp ${formatMoney(amount)}*.\n⏳ *Jatuh Tempo:* ${dueString} (${hours} Jam)\n\n⚠️ *PERINGATAN KERAS:*\nJika telat melunasi, hutangmu akan **DIKALIKAN 2x LIPAT SETIAP 1 JAM** setelah jatuh tempo.`
      });
      return true;
    }

    // ==================== BAYAR PINJOL ====================
    if (cmd === 'bayarpinjol') {
      let tagihan = u.pinjol.amount;
      if (tagihan <= 0n) {
        await sock.sendMessage(from, { text: "✅ Kamu tidak memiliki tagihan Pinjol saat ini." });
        return true;
      }
      if (u.uang < tagihan) {
        await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup!\n\n💳 *Tagihan:* Rp ${formatMoney(tagihan)}\n💵 *Uangmu:* Rp ${formatMoney(u.uang)}` });
        return true;
      }

      u.uang -= tagihan;
      u.pinjol = { amount: 0n, due_time: 0, next_penalty: 0 };
      u.hutang = 0n;
      saveDB(db);

      await sock.sendMessage(from, { text: `✅ *HUTANG LUNAS!*\n\nKamu telah membayar tagihan Pinjol sebesar *Rp ${formatMoney(tagihan)}*.\nSisa uangmu: Rp ${formatMoney(u.uang)}` });
      return true;
    }

    // ==================== CEK PINJOL ====================
    if (cmd === 'cekpinjol') {
      let tagihan = u.pinjol.amount;
      if (tagihan <= 0n) {
        await sock.sendMessage(from, { text: "✅ Catatan finansialmu bersih dari hutang Pinjol." });
        return true;
      }
      let dueString = new Date(u.pinjol.due_time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      let now = Date.now();
      let statusMsg = "";
      if (now > u.pinjol.due_time) {
        statusMsg = `🚨 *TELAT BAYAR!* Hutangmu sedang dilipatgandakan 2x setiap jam.`;
      } else {
        let sisaMs = u.pinjol.due_time - now;
        let sisaJam = Math.floor(sisaMs / 3600000);
        let sisaMenit = Math.floor((sisaMs % 3600000) / 60000);
        statusMsg = `⏳ *Sisa Waktu:* ${sisaJam} Jam ${sisaMenit} Menit`;
      }
      await sock.sendMessage(from, { text: `🏦 *INFORMASI TAGIHAN PINJOL* 🏦\n\n💳 *Total Tagihan:* Rp ${formatMoney(tagihan)}\n⏰ *Batas Pembayaran:* ${dueString}\n\n${statusMsg}` });
      return true;
    }

    return false;
  }
};
