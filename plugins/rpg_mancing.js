// =========================================================
// PLUGIN: RPG MANCING - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { resolveIdentity, waTagNamed } from '../identity.js';
import { parseAmount, capMoney, sanitizeUserEconomy, formatMoney, toBigInt } from '../econ_utils.js';

const FISH_TYPES = {
  'lele': { nama: '🐟 Ikan Lele', rarity: 'Biasa', min: 10000n, max: 30000n, step: 2000n, updateTime: 300000 },
  'nila': { nama: '🐟 Ikan Nila', rarity: 'Biasa', min: 12000n, max: 32000n, step: 2000n, updateTime: 300000 },
  'bawal': { nama: '🐡 Ikan Bawal', rarity: 'Biasa', min: 15000n, max: 35000n, step: 2500n, updateTime: 300000 },
  'arwana': { nama: '🐠 Arwana', rarity: 'Langka', min: 100000n, max: 500000n, step: 20000n, updateTime: 900000 },
  'koi': { nama: '🎏 Ikan Koi', rarity: 'Langka', min: 120000n, max: 550000n, step: 25000n, updateTime: 900000 },
  'salmon': { nama: '🍣 Salmon', rarity: 'Langka', min: 150000n, max: 600000n, step: 30000n, updateTime: 900000 },
  'hiu': { nama: '🦈 Hiu Putih', rarity: 'Legendaris', min: 1000000n, max: 5000000n, step: 250000n, updateTime: 3600000 },
  'orca': { nama: '🐳 Paus Orca', rarity: 'Legendaris', min: 1500000n, max: 6000000n, step: 300000n, updateTime: 3600000 },
  'naga': { nama: '🐉 Naga Laut', rarity: 'Legendaris', min: 2000000n, max: 8000000n, step: 500000n, updateTime: 3600000 }
};

export default {
  name: 'rpg_mancing',
  version: '3.1.0',
  commands: ['mancing', 'pasarikan', 'koleksi', 'ikan', 'jualikan', 'tawarikan', 'terimaikan'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    sanitizeUserEconomy(u);
    if (!u.cd) u.cd = {};

    // ==================== MANCING ====================
    if (cmd === 'mancing') {
      let now = Date.now();
      if (u.cd.mancing && u.cd.mancing > now) {
        let sisaM = Math.ceil((u.cd.mancing - now) / 60000);
        await sock.sendMessage(from, { text: `⏳ Ikan sedang tidak lapar. Tunggu *${sisaM} Menit* lagi untuk memancing.` });
        return true;
      }

      let hasGear = (u.fishing_gear && u.fishing_gear.active_rod && u.fishing_gear.rod_uses > 0 && u.fishing_gear.active_bait && u.fishing_gear.bait_uses > 0);
      let chance = Math.random() * 100;
      let rarity = 'Biasa';

      if (hasGear) {
        let isPremiumBait = (u.fishing_gear.active_bait.includes("Serpihan") || u.fishing_gear.active_bait.includes("Kristal"));
        let isPremiumRod = (u.fishing_gear.active_rod.includes("Poseidon") || u.fishing_gear.active_rod.includes("Karbon"));
        let legChance = (isPremiumBait && isPremiumRod) ? 40 : 20;
        rarity = chance < legChance ? 'Legendaris' : 'Langka';
      } else {
        rarity = chance < 3 ? 'Legendaris' : chance < 15 ? 'Langka' : 'Biasa';
      }

      let possibleFish = Object.keys(FISH_TYPES).filter(k => FISH_TYPES[k].rarity === rarity);
      let caught = possibleFish[Math.floor(Math.random() * possibleFish.length)];

      if (!u.ikan) u.ikan = {};
      if (!u.ikan[caught]) u.ikan[caught] = 0n;
      u.ikan[caught] += 1n;
      u.cd.mancing = now + 300000;

      let extraMsg = ``;
      if (hasGear) {
        u.fishing_gear.rod_uses -= 1;
        u.fishing_gear.bait_uses -= 1;
        extraMsg = `\n\n_(Memakai ${u.fishing_gear.active_rod} & ${u.fishing_gear.active_bait})_\n➖ Sisa Joran: ${u.fishing_gear.rod_uses}/${u.fishing_gear.rod_max || 0}\n➖ Sisa Umpan: ${u.fishing_gear.bait_uses}/${u.fishing_gear.bait_max || 0}`;
        if (u.fishing_gear.rod_uses <= 0) { extraMsg += `\n⚠️ *CRACK! ${u.fishing_gear.active_rod} milikmu Patah!*`; u.fishing_gear.active_rod = null; }
        if (u.fishing_gear.bait_uses <= 0) { extraMsg += `\n⚠️ *Umpanmu habis!*`; u.fishing_gear.active_bait = null; }
      } else {
        extraMsg = `\n\n_(Memancing dengan tangan kosong)_\n💡 *Tips:* Beli Joran & Umpan di .shop untuk mendapat jaminan ikan Langka/Legendaris!`;
      }

      saveDB(db);

      let rarityIcons = { 'Biasa': '⚪', 'Langka': '🟡', 'Legendaris': '🔴' };
      await sock.sendMessage(from, { text: `🎣 *BERHASIL MEMANCING!* 🎣\n\nKamu mendapatkan:\n${rarityIcons[rarity]} *${FISH_TYPES[caught].nama}*\n└ Rarity: ${rarity}${extraMsg}\n\n_Cek tangkapanmu dengan ${prefix}koleksi_` });
      return true;
    }

    // ==================== PASAR IKAN ====================
    if (cmd === 'pasarikan') {
      if (!db.market_ikan) db.market_ikan = {};
      let txtIkan = `🐟 [ PASAR IKAN GLOBAL ] 🐟\n=========================\n\n`;
      let now = Date.now();

      for (let key in FISH_TYPES) {
        let item = FISH_TYPES[key];
        if (!db.market_ikan[key]) db.market_ikan[key] = { price: item.min, next_update: now + item.updateTime, trend: '📈 Naik' };

        if (now >= db.market_ikan[key].next_update) {
          let oldPrice = db.market_ikan[key].price;
          let range = Number((item.max - item.min) / item.step);
          let newPrice = item.min + (BigInt(Math.floor(Math.random() * (range + 1))) * item.step);
          db.market_ikan[key].price = newPrice;
          db.market_ikan[key].trend = (newPrice > oldPrice) ? '📈 Naik' : (newPrice < oldPrice) ? '📉 Turun' : '➡️ Stabil';
          db.market_ikan[key].next_update = now + item.updateTime;
        }
        let userAsset = (u.ikan && u.ikan[key]) ? u.ikan[key] : 0n;
        txtIkan += `[ Kode: ${key} ] ${item.nama}\n│ Rarity: ${item.rarity}\n│ Harga: Rp ${formatMoney(db.market_ikan[key].price)}\n│ Tren: ${db.market_ikan[key].trend}\n│ Punyamu: ${formatMoney(userAsset)} Ekor\n╰────────────────────────\n\n`;
      }
      saveDB(db);
      txtIkan += `_Jual ke kolektor NPC: ${prefix}jualikan [kode] [jumlah/all]_\n_Jual ke player asli: ${prefix}tawarikan [@tag] [kode] [jumlah] [harga]_`;
      await sock.sendMessage(from, { text: txtIkan });
      return true;
    }

    // ==================== KOLEKSI ====================
    if (cmd === 'koleksi' || cmd === 'ikan') {
      if (!u.ikan || Object.keys(u.ikan).length === 0) {
        await sock.sendMessage(from, { text: "📦 Koleksi ikanmu masih kosong. Pergi .mancing dulu sana!" });
        return true;
      }
      let txtKol = `🎒 *KOLEKSI IKANMU* 🎒\n\n`;
      let totalVal = 0n;
      if (!db.market_ikan) db.market_ikan = {};

      for (let key in u.ikan) {
        if (u.ikan[key] > 0n && FISH_TYPES[key]) {
          let mPrice = db.market_ikan[key]?.price || FISH_TYPES[key].min;
          txtKol += `▸ ${FISH_TYPES[key].nama}: ${formatMoney(u.ikan[key])} Ekor\n`;
          totalVal += u.ikan[key] * mPrice;
        }
      }
      txtKol += `\n💰 Estimasi Nilai Koleksi: Rp ${formatMoney(totalVal)}\n_Gunakan ${prefix}pasarikan untuk melihat harga pasar terbaru._`;
      await sock.sendMessage(from, { text: txtKol });
      return true;
    }

    // ==================== JUAL IKAN ====================
    if (cmd === 'jualikan') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}jualikan [kode_ikan] [jumlah/all]` });
        return true;
      }
      let kodeIkan = args[0].toLowerCase();
      if (!FISH_TYPES[kodeIkan]) {
        await sock.sendMessage(from, { text: "❌ Kode ikan tidak terdaftar di Pasar Ikan." });
        return true;
      }
      if (!u.ikan || !u.ikan[kodeIkan] || u.ikan[kodeIkan] <= 0n) {
        await sock.sendMessage(from, { text: "❌ Kamu tidak memiliki ikan jenis ini." });
        return true;
      }

      let qtyVal;
      if (args[1]?.toLowerCase() === 'all') qtyVal = u.ikan[kodeIkan];
      else qtyVal = toBigInt(parseInt(args[1]) || 1);

      if (qtyVal <= 0n || qtyVal > u.ikan[kodeIkan]) {
        await sock.sendMessage(from, { text: "❌ Jumlah ikan tidak valid." });
        return true;
      }
      if (!db.market_ikan) db.market_ikan = {};
      if (!db.market_ikan[kodeIkan]) db.market_ikan[kodeIkan] = { price: FISH_TYPES[kodeIkan].min };

      let totalHarga = db.market_ikan[kodeIkan].price * qtyVal;
      u.ikan[kodeIkan] -= qtyVal;
      u.uang += totalHarga;
      saveDB(db);

      await sock.sendMessage(from, { text: `🤝 *TERJUAL KE KOLEKTOR*\n\nKamu menjual ${formatMoney(qtyVal)}x ${FISH_TYPES[kodeIkan].nama}.\n💵 Pendapatan Bersih: Rp ${formatMoney(totalHarga)}` });
      return true;
    }

    // ==================== TAWAR IKAN ====================
    if (cmd === 'tawarikan') {
      let target = resolveIdentity(msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]);
      let cleanArgs = args.filter(a => !a.startsWith('@'));

      if (!target || cleanArgs.length < 3) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}tawarikan [@tag_pembeli] [kode_ikan] [jumlah] [harga_total]` });
        return true;
      }

      let kodeIkan = cleanArgs[0].toLowerCase();
      if (!FISH_TYPES[kodeIkan]) {
        await sock.sendMessage(from, { text: "❌ Kode ikan tidak valid." });
        return true;
      }
      let amountCheck = parseAmount(cleanArgs[1]);
      if (!amountCheck.valid) { await sock.sendMessage(from, { text: `❌ Jumlah: ${amountCheck.error}` }); return true; }
      let amount = amountCheck.value;

      let priceCheck = parseAmount(cleanArgs[2]);
      if (!priceCheck.valid) { await sock.sendMessage(from, { text: `❌ Harga: ${priceCheck.error}` }); return true; }
      let price = priceCheck.value;

      if (!u.ikan || (u.ikan[kodeIkan] || 0n) < amount) {
        await sock.sendMessage(from, { text: "❌ Ikan di koleksimu tidak cukup." });
        return true;
      }

      if (!global.trade_ikan) global.trade_ikan = {};
      let tradeId = Math.random().toString(36).substring(2, 8).toUpperCase();
      global.trade_ikan[tradeId] = { seller: sender, buyer: target, ikan: kodeIkan, jumlah: amount, harga: price, expired: Date.now() + 120000 };

      await sock.sendMessage(from, { text: `📢 *PENAWARAN IKAN DIBUAT*\n\nKepada: ${waTagNamed(target, db)}\nIkan: ${formatMoney(amount)}x ${FISH_TYPES[kodeIkan].nama}\nHarga Borongan: Rp ${formatMoney(price)}\n\n_Ketik ${prefix}terimaikan ${tradeId} untuk membeli._\n_Penawaran kadaluwarsa dalam 2 menit._` });
      return true;
    }

    // ==================== TERIMA IKAN ====================
    if (cmd === 'terimaikan') {
      let tradeId = args[0]?.toUpperCase();
      if (!tradeId) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}terimaikan [ID_Transaksi]` });
        return true;
      }
      if (!global.trade_ikan || !global.trade_ikan[tradeId]) {
        await sock.sendMessage(from, { text: "❌ Transaksi tidak ditemukan atau sudah kadaluwarsa." });
        return true;
      }
      let trade = global.trade_ikan[tradeId];

      if (Date.now() > trade.expired) { delete global.trade_ikan[tradeId]; await sock.sendMessage(from, { text: "❌ Waktu penawaran sudah habis." }); return true; }
      if (trade.buyer !== sender) { await sock.sendMessage(from, { text: "❌ Penawaran ini tidak ditujukan untukmu." }); return true; }
      if (u.uang < trade.harga) { await sock.sendMessage(from, { text: "❌ Uangmu tidak cukup." }); return true; }

      let seller = db.users[trade.seller];
      if (!seller.ikan || (seller.ikan[trade.ikan] || 0n) < trade.jumlah) {
        delete global.trade_ikan[tradeId];
        await sock.sendMessage(from, { text: "❌ Transaksi batal karena penjual sudah tidak memiliki ikan tersebut." });
        return true;
      }

      u.uang -= trade.harga;
      if (!u.ikan) u.ikan = {};
      if (!u.ikan[trade.ikan]) u.ikan[trade.ikan] = 0n;
      u.ikan[trade.ikan] += trade.jumlah;
      seller.uang += trade.harga;
      seller.ikan[trade.ikan] -= trade.jumlah;
      saveDB(db);
      delete global.trade_ikan[tradeId];

      await sock.sendMessage(from, { text: `🤝 *TRANSAKSI BERHASIL*\n\nKamu telah membeli ${formatMoney(trade.jumlah)}x ${FISH_TYPES[trade.ikan].nama} seharga Rp ${formatMoney(trade.harga)}.` });
      return true;
    }

    return false;
  }
};
