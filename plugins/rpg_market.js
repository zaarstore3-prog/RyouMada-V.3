// =========================================================
// PLUGIN: RPG MARKET - RyoMada V.3.1
// =========================================================
import { readDB, saveDB, INVESTMENTS } from '../database.js';
import { resolveIdentity, waTagNamed } from '../identity.js';
import { parseAmount, capMoney, sanitizeUserEconomy, formatMoney, toBigInt } from '../econ_utils.js';

export default {
  name: 'rpg_market',
  version: '3.1.0',
  commands: ['tfsaham', 'giveitem', 'give', 'investasi', 'inv', 'beli', 'buy', 'jual', 'sell'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    sanitizeUserEconomy(u);

    // ==================== TRANSFER SAHAM ====================
    if (cmd === 'tfsaham' || cmd === 'giveitem' || cmd === 'give') {
      let target = resolveIdentity(msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]);
      let cleanArgs = args.filter(a => !a.startsWith('@'));
      let kodeSaham = cleanArgs[0]?.toUpperCase();

      if (!target || !kodeSaham) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}tfsaham [@tag] [kode_saham] [jumlah]` });
        return true;
      }
      let amountCheck = parseAmount(cleanArgs[1]);
      if (!amountCheck.valid) {
        await sock.sendMessage(from, { text: `❌ ${amountCheck.error}` });
        return true;
      }
      let amount = amountCheck.value;

      if (!INVESTMENTS[kodeSaham]) {
        await sock.sendMessage(from, { text: `❌ Kode saham tidak valid! Gunakan kode seperti BTC, ETH, dsb.` });
        return true;
      }
      if (!u.invest || toBigInt(u.invest[kodeSaham] || 0n) < amount) {
        await sock.sendMessage(from, { text: `❌ Aset ${INVESTMENTS[kodeSaham].nama} milikmu tidak cukup!` });
        return true;
      }
      if (target === sender) {
        await sock.sendMessage(from, { text: "❌ Tidak bisa transfer ke diri sendiri." });
        return true;
      }
      if (!db.users[target]) {
        await sock.sendMessage(from, { text: "❌ Player tujuan tidak terdaftar di database." });
        return true;
      }

      u.invest[kodeSaham] -= amount;
      if (!db.users[target].invest) db.users[target].invest = {};
      if (!db.users[target].invest[kodeSaham]) db.users[target].invest[kodeSaham] = 0n;
      db.users[target].invest[kodeSaham] += amount;
      saveDB(db);
      await sock.sendMessage(from, { text: `📈 *TRANSFER SAHAM BERHASIL*\nKamu memberikan ${formatMoney(amount)} Unit ${INVESTMENTS[kodeSaham].nama} kepada ${waTagNamed(target, db)}` });
      return true;
    }

    // ==================== INVESTASI ====================
    if (cmd === 'investasi' || cmd === 'inv') {
      if (args[0] === 'reset' && db.global.owner_utama === sender) { db.market = {}; saveDB(db); await sock.sendMessage(from, { text: "✅ Bursa Efek direset!" }); return true; }
      if (!db.market) db.market = {};
      let invT = `📊 [ BURSA EFEK NEXUS ] 📊\n=========================\n\n`;
      let now = Date.now();
      let sortedInvestKeys = Object.keys(INVESTMENTS).sort((a, b) => {
        if (INVESTMENTS[a].min > INVESTMENTS[b].min) return 1;
        if (INVESTMENTS[a].min < INVESTMENTS[b].min) return -1;
        return 0;
      });

      sortedInvestKeys.forEach((key, index) => {
        let item = INVESTMENTS[key];
        if (!db.market[key]) db.market[key] = { price: item.min, next_update: now + item.updateTime, trend: '📈 Naik' };
        if (now >= db.market[key].next_update) {
          let oldPrice = db.market[key].price;
          let range = Number((item.max - item.min) / item.step);
          let newPrice = item.min + (BigInt(Math.floor(Math.random() * (range + 1))) * item.step);
          db.market[key].price = newPrice;
          db.market[key].trend = (newPrice > oldPrice) ? '📈 Naik' : (newPrice < oldPrice) ? '📉 Turun' : '➡️ Stabil';
          db.market[key].next_update = now + item.updateTime;
        }
        let userAsset = u.invest?.[key] || 0n;
        invT += `[ ${index + 1} ] ${item.icon} *${item.nama}*\n│ Harga: Rp ${formatMoney(db.market[key].price)}\n│ Tren: ${db.market[key].trend}\n│ Asetmu: ${formatMoney(userAsset)} Unit\n╰────────────────────────\n\n`;
      });
      saveDB(db);
      invT += `Gunakan ${prefix}beli [angka_urutan] [jumlah/all] atau ${prefix}jual [angka_urutan] [jumlah/all]`;
      await sock.sendMessage(from, { text: invT });
      return true;
    }

    // ==================== BELI ====================
    if (cmd === 'beli' || cmd === 'buy') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}beli [angka_urutan] [jumlah/all]` });
        return true;
      }
      let sortedInvestKeys = Object.keys(INVESTMENTS).sort((a, b) => {
        if (INVESTMENTS[a].min > INVESTMENTS[b].min) return 1;
        if (INVESTMENTS[a].min < INVESTMENTS[b].min) return -1;
        return 0;
      });
      let idxB = parseInt(args[0]) - 1;
      let itemB = sortedInvestKeys[idxB];
      if (!itemB || !INVESTMENTS[itemB]) {
        await sock.sendMessage(from, { text: "❌ Kode urutan investasi tidak valid." });
        return true;
      }
      if (!db.market) db.market = {};
      if (!db.market[itemB]) db.market[itemB] = { price: INVESTMENTS[itemB].min, next_update: Date.now() + INVESTMENTS[itemB].updateTime, trend: '📈 Naik' };

      let currentPriceB = db.market[itemB].price;
      let qtyB_val;

      if (args[1]?.toLowerCase() === 'all') {
        qtyB_val = u.uang / currentPriceB;
        if (qtyB_val <= 0n) {
          await sock.sendMessage(from, { text: "❌ Uangmu tidak cukup untuk membeli 1 unit pun." });
          return true;
        }
      } else {
        let qtyCheck = parseAmount(args[1] || '1');
        if (!qtyCheck.valid) {
          await sock.sendMessage(from, { text: `❌ ${qtyCheck.error}` });
          return true;
        }
        qtyB_val = qtyCheck.value;
      }

      let priceB = currentPriceB * qtyB_val;
      if (u.uang < priceB) {
        await sock.sendMessage(from, { text: `❌ Uang tidak cukup. Butuh Rp ${formatMoney(priceB)}` });
        return true;
      }

      u.uang -= priceB;
      if (!u.invest) u.invest = {};
      if (!u.invest[itemB]) u.invest[itemB] = 0n;
      u.invest[itemB] += qtyB_val;
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ Berhasil membeli ${formatMoney(qtyB_val)} Unit ${INVESTMENTS[itemB].nama} seharga Rp ${formatMoney(priceB)}` });
      return true;
    }

    // ==================== JUAL ====================
    if (cmd === 'jual' || cmd === 'sell') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}jual [angka_urutan] [jumlah/all]` });
        return true;
      }
      let sortedInvestKeys = Object.keys(INVESTMENTS).sort((a, b) => {
        if (INVESTMENTS[a].min > INVESTMENTS[b].min) return 1;
        if (INVESTMENTS[a].min < INVESTMENTS[b].min) return -1;
        return 0;
      });
      let idxJ = parseInt(args[0]) - 1;
      let itemJ = sortedInvestKeys[idxJ];
      if (!itemJ || !INVESTMENTS[itemJ]) {
        await sock.sendMessage(from, { text: "❌ Kode urutan investasi tidak valid." });
        return true;
      }
      if (!u.invest) u.invest = {};

      let qtyJ_val;
      if (args[1]?.toLowerCase() === 'all') {
        qtyJ_val = u.invest[itemJ] || 0n;
        if (qtyJ_val <= 0n) {
          await sock.sendMessage(from, { text: "❌ Kamu tidak memiliki aset ini untuk dijual." });
          return true;
        }
      } else {
        let qtyCheck = parseAmount(args[1] || '1');
        if (!qtyCheck.valid) {
          await sock.sendMessage(from, { text: `❌ ${qtyCheck.error}` });
          return true;
        }
        qtyJ_val = qtyCheck.value;
      }

      if (toBigInt(u.invest[itemJ] || 0n) < qtyJ_val) {
        await sock.sendMessage(from, { text: "❌ Asetmu tidak cukup untuk dijual!" });
        return true;
      }

      if (!db.market) db.market = {};
      if (!db.market[itemJ]) db.market[itemJ] = { price: INVESTMENTS[itemJ].min, next_update: Date.now() + INVESTMENTS[itemJ].updateTime, trend: '📈 Naik' };

      let priceJ = db.market[itemJ].price * qtyJ_val;
      u.uang += priceJ;
      u.invest[itemJ] -= qtyJ_val;
      saveDB(db);
      await sock.sendMessage(from, { text: `📉 *PENJUALAN SAHAM*\nBerhasil menjual ${formatMoney(qtyJ_val)} Unit ${INVESTMENTS[itemJ].nama}.\n💵 Pendapatan: Rp ${formatMoney(priceJ)}` });
      return true;
    }

    return false;
  }
};
