// =========================================================
// PLUGIN: RPG ITEMS - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { parseAmount, calculateLevelUp, capMoney, sanitizeUserEconomy, formatMoney, toBigInt } from '../econ_utils.js';

const SHOP = {
  makanan: {
    'mierendang': { nama: "Mie Goreng Rendang", harga: 15000n, energi: 20 },
    'spaghetti': { nama: "Spaghetti Bolognese Pedas", harga: 25000n, energi: 40 },
    'sosis': { nama: "Sosis Smoked Bratwurst", harga: 45000n, energi: 75 }
  },
  minuman: {
    'americano': { nama: "Kopi Instant Americano", harga: 12000n, energi: 15 },
    'madulemon': { nama: "Minuman Karbonasi Madu Lemon", harga: 20000n, energi: 35 }
  },
  buff: {
    'buff1': { nama: "Double XP (1 Jam)", harga: 50000n, durasi: 3600000 },
    'buff6': { nama: "Double XP (6 Jam)", harga: 250000n, durasi: 21600000 },
    'buff12': { nama: "Double XP (12 Jam)", harga: 450000n, durasi: 43200000 },
    'buff24': { nama: "Double XP (24 Jam)", harga: 800000n, durasi: 86400000 }
  },
  umpan: {
    'bait1': { nama: "Cacing Emas", harga: 500000n, max_use: 3, desc: "Jaminan 100% ikan Langka/Legendaris" },
    'bait2': { nama: "Udang Kristal", harga: 2000000n, max_use: 3, desc: "Peluang besar menembus Legendaris" },
    'bait3': { nama: "Serpihan Bintang", harga: 5000000n, max_use: 3, desc: "Kombinasi jitu ikan Legendaris!" }
  },
  pancingan: {
    'rod1': { nama: "Joran Kayu Jati", harga: 1000000n, max_use: 10, desc: "Gunakan bersama umpan untuk jaminan Rarity" },
    'rod2': { nama: "Joran Karbon Fiber", harga: 3000000n, max_use: 10, desc: "Tingkat keberhasilan Legendaris lebih tinggi" },
    'rod3': { nama: "Joran Poseidon", harga: 10000000n, max_use: 10, desc: "Sultan Gear: Peluang Legendaris Maksimal!" }
  }
};

export default {
  name: 'rpg_items',
  version: '3.1.0',
  commands: ['shop', 'beliitem', 'inventory', 'tas', 'makan', 'minum', 'crredeem', 'redeem'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    sanitizeUserEconomy(u);
    if (!u.fishing_gear) u.fishing_gear = { active_bait: null, bait_uses: 0, bait_max: 0, active_rod: null, rod_uses: 0, rod_max: 0 };

    // ==================== SHOP ====================
    if (cmd === 'shop') {
      let txt = `🏪 *ANGKRINGAN SUSU DI NGEMILK* 🏪\n\n`;

      txt += `🍔 *MAKANAN (Pemulih Energi)*\n`;
      for (let k in SHOP.makanan) {
        txt += `▸ *${k}* - ${SHOP.makanan[k].nama}\n  Rp ${formatMoney(SHOP.makanan[k].harga)} | ⚡ +${SHOP.makanan[k].energi}\n`;
      }

      txt += `\n🍹 *MINUMAN (Pemulih Energi)*\n`;
      for (let k in SHOP.minuman) {
        txt += `▸ *${k}* - ${SHOP.minuman[k].nama}\n  Rp ${formatMoney(SHOP.minuman[k].harga)} | ⚡ +${SHOP.minuman[k].energi}\n`;
      }

      txt += `\n🎣 *UMPAN MANCING (Peningkat Rarity)*\n`;
      for (let k in SHOP.umpan) {
        txt += `▸ *${k}* - ${SHOP.umpan[k].nama} (${SHOP.umpan[k].max_use}x Pakai)\n  Rp ${formatMoney(SHOP.umpan[k].harga)} | _${SHOP.umpan[k].desc}_\n`;
      }

      txt += `\n🎣 *JORAN MANCING (Peningkat Rarity)*\n`;
      for (let k in SHOP.pancingan) {
        txt += `▸ *${k}* - ${SHOP.pancingan[k].nama} (${SHOP.pancingan[k].max_use}x Pakai)\n  Rp ${formatMoney(SHOP.pancingan[k].harga)} | _${SHOP.pancingan[k].desc}_\n`;
      }

      txt += `\n🌟 *PENGALAMAN (XP)*\n`;
      txt += `▸ *xp* - Beli XP sesukamu! (Rp 150/XP)\n  _(Contoh: ${prefix}beliitem xp 500)_\n`;

      txt += `\n🔥 *BUFF DOUBLE XP*\n`;
      for (let k in SHOP.buff) {
        txt += `▸ *${k}* - ${SHOP.buff[k].nama}\n  Rp ${formatMoney(SHOP.buff[k].harga)}\n`;
      }

      txt += `\n🛒 *Cara Beli:* ${prefix}beliitem [kode] [jumlah]`;
      await sock.sendMessage(from, { text: txt });
      return true;
    }

    // ==================== BELI ITEM ====================
    if (cmd === 'beliitem') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}beliitem [kode_barang] [jumlah/all]` });
        return true;
      }
      let itemCode = args[0].toLowerCase();
      let amountRaw = args[1] ? args[1].toLowerCase() : '1';

      // Umpan
      if (SHOP.umpan[itemCode]) {
        let gear = SHOP.umpan[itemCode];
        if (u.uang < gear.harga) {
          await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup! Butuh Rp ${formatMoney(gear.harga)}` });
          return true;
        }
        u.uang -= gear.harga;
        u.fishing_gear.active_bait = gear.nama;
        u.fishing_gear.bait_uses = gear.max_use;
        u.fishing_gear.bait_max = gear.max_use;
        saveDB(db);
        await sock.sendMessage(from, { text: `✅ Berhasil membeli dan memasang *${gear.nama}*!\nKini kamu memiliki ${gear.max_use}/${gear.max_use} kesempatan lemparan.` });
        return true;
      }

      // Joran
      if (SHOP.pancingan[itemCode]) {
        let gear = SHOP.pancingan[itemCode];
        if (u.uang < gear.harga) {
          await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup! Butuh Rp ${formatMoney(gear.harga)}` });
          return true;
        }
        u.uang -= gear.harga;
        u.fishing_gear.active_rod = gear.nama;
        u.fishing_gear.rod_uses = gear.max_use;
        u.fishing_gear.rod_max = gear.max_use;
        saveDB(db);
        await sock.sendMessage(from, { text: `✅ Berhasil membeli dan memasang *${gear.nama}*!\nJoran siap digunakan untuk ${gear.max_use}/${gear.max_use} tarikan.` });
        return true;
      }

      // XP
      if (itemCode === 'xp') {
        let xpPrice = 150n;
        let amount = 0n;
        if (amountRaw === 'all') {
          amount = u.uang / xpPrice;
          if (amount <= 0n) {
            await sock.sendMessage(from, { text: "❌ Uangmu tidak cukup untuk memborong XP." });
            return true;
          }
        } else {
          let amountCheck = parseAmount(amountRaw);
          if (!amountCheck.valid) {
            await sock.sendMessage(from, { text: `❌ ${amountCheck.error}` });
            return true;
          }
          amount = amountCheck.value;
        }

        let totalCost = amount * xpPrice;
        if (u.uang < totalCost) {
          await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup! Butuh Rp ${formatMoney(totalCost)}` });
          return true;
        }

        u.uang -= totalCost;
        u.xp += amount;

        let { level, xpReq, isLevelUp } = calculateLevelUp(u.xp, u.level);
        u.level = level;
        saveDB(db);

        let textBeli = `✅ *PEMBELIAN XP BERHASIL*\nKamu memborong ${formatMoney(amount)} XP seharga Rp ${formatMoney(totalCost)}.`;
        if (isLevelUp) textBeli += `\n\n🎉 *BAM! LEVEL UP!*\nKamu melesat ke *Level ${u.level}* (Sisa XP: ${u.xp}/${xpReq})`;

        await sock.sendMessage(from, { text: textBeli });
        return true;
      }

      // Buff
      if (SHOP.buff[itemCode]) {
        let buff = SHOP.buff[itemCode];
        let amount = parseInt(amountRaw);
        if (isNaN(amount) || amount <= 0) amount = 1;
        if (amount > 1) {
          await sock.sendMessage(from, { text: "❌ Buff hanya bisa dibeli 1 per 1." });
          return true;
        }
        if (u.uang < buff.harga) {
          await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup! Butuh Rp ${formatMoney(buff.harga)}` });
          return true;
        }
        u.uang -= buff.harga;
        let now = Date.now();
        u.exp_buff_until = (u.exp_buff_until > now ? u.exp_buff_until : now) + buff.durasi;
        u.exp_multiplier = 2;
        saveDB(db);
        await sock.sendMessage(from, { text: `✅ *BUFF DIAKTIFKAN*\nKamu berhasil membeli ${buff.nama}. Kumpulkan XP sebanyak-banyaknya!` });
        return true;
      }

      // Makanan/Minuman
      let itemData = SHOP.makanan[itemCode] || SHOP.minuman[itemCode];
      if (!itemData) {
        await sock.sendMessage(from, { text: "❌ Barang tidak ditemukan di toko." });
        return true;
      }

      let amount = parseInt(amountRaw);
      if (isNaN(amount) || amount <= 0) amount = 1;

      let totalCost = itemData.harga * BigInt(amount);
      if (u.uang < totalCost) {
        await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup! Butuh Rp ${formatMoney(totalCost)}` });
        return true;
      }

      u.uang -= totalCost;
      if (!u.inventory[itemCode]) u.inventory[itemCode] = 0;
      u.inventory[itemCode] += amount;
      saveDB(db);
      await sock.sendMessage(from, { text: `🛒 *BERHASIL DIBELI*\nKamu membeli ${amount}x ${itemData.nama} seharga Rp ${formatMoney(totalCost)}.\n_Barang telah disimpan, ketik ${prefix}inventory untuk mengecek tasmu._` });
      return true;
    }

    // ==================== INVENTORY ====================
    if (cmd === 'inventory' || cmd === 'tas') {
      let txt = `🎒 *INVENTORY PLAYER* 🎒\n\n`;
      let hasItem = false;

      txt += `🍔 *Makanan & Minuman:*\n`;
      for (let k in u.inventory) {
        if (u.inventory[k] > 0) {
          hasItem = true;
          let detail = SHOP.makanan[k] || SHOP.minuman[k];
          if (detail) {
            txt += `▸ ${detail.nama} (x${u.inventory[k]})\n  _Gunakan: ${prefix}${SHOP.makanan[k] ? 'makan' : 'minum'} ${k}_\n`;
          }
        }
      }
      if (!hasItem) txt += `_(Tas kamu masih kosong)_\n`;

      txt += `\n🎣 *Peralatan Mancing Aktif:*\n`;
      txt += `▸ Umpan: ${u.fishing_gear.active_bait || 'Kosong'} (${u.fishing_gear.bait_uses}/${u.fishing_gear.bait_max || 0})\n`;
      txt += `▸ Joran: ${u.fishing_gear.active_rod || 'Kosong'} (${u.fishing_gear.rod_uses}/${u.fishing_gear.rod_max || 0})\n`;

      txt += `\n⚡ *Energi Saat Ini:* ${u.energi}/100`;
      await sock.sendMessage(from, { text: txt });
      return true;
    }

    // ==================== MAKAN / MINUM ====================
    if (cmd === 'makan' || cmd === 'minum') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}${cmd} [kode_barang]` });
        return true;
      }
      let itemCode = args[0].toLowerCase();
      let itemData = SHOP.makanan[itemCode] || SHOP.minuman[itemCode];
      if (!itemData) {
        await sock.sendMessage(from, { text: "❌ Barang tidak bisa dikonsumsi." });
        return true;
      }
      if (!u.inventory[itemCode] || u.inventory[itemCode] <= 0) {
        await sock.sendMessage(from, { text: `❌ Kamu tidak memiliki ${itemData.nama} di dalam inventory.` });
        return true;
      }
      if (u.energi >= 100) {
        await sock.sendMessage(from, { text: "⚠️ Energi kamu sudah penuh maksimal (100/100)!" });
        return true;
      }

      u.inventory[itemCode] -= 1;
      u.energi += itemData.energi;
      if (u.energi > 100) u.energi = 100;
      saveDB(db);

      let emoji = SHOP.makanan[itemCode] ? '🍽️' : '🥤';
      let action = SHOP.makanan[itemCode] ? 'memakan' : 'meminum';
      await sock.sendMessage(from, { text: `${emoji} Kamu ${action} ${itemData.nama}.\n⚡ Energi memulih +${itemData.energi} (Total: ${u.energi}/100)` });
      return true;
    }

    // ==================== CRREDEEM ====================
    if (cmd === 'crredeem') {
      let argsString = args.join(" ").toLowerCase();
      if (!argsString) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}crredeem uang=10000 xp=500 limitcmd=5 doublexp=1 kuota=5` });
        return true;
      }

      let rUang = 0n, rXp = 0n, rKuota = 1n, rDoubleXp = 0n, rLimitCmd = 0n;
      let params = argsString.split(' ');

      function parseBigIntParam(str) {
        if (!str) return 0n;
        str = str.trim();
        if (!/^\d+$/.test(str)) return 0n;
        try { return BigInt(str); } catch(e) { return 0n; }
      }

      for (let p of params) {
        let parts = p.split('=');
        let val = parts[1] || '0';
        if (p.startsWith('uang=')) rUang = parseBigIntParam(val);
        if (p.startsWith('xp=')) rXp = parseBigIntParam(val);
        if (p.startsWith('kuota=')) rKuota = parseBigIntParam(val) || 1n;
        if (p.startsWith('doublexp=')) rDoubleXp = parseBigIntParam(val);
        if (p.startsWith('limitcmd=')) rLimitCmd = parseBigIntParam(val);
      }

      if (rUang <= 0n && rXp <= 0n && rDoubleXp <= 0n && rLimitCmd <= 0n) {
        await sock.sendMessage(from, { text: "❌ Tentukan minimal 1 jenis hadiah yang valid!" });
        return true;
      }
      if (rKuota <= 0n) {
        await sock.sendMessage(from, { text: "❌ Kuota pengguna minimal 1." });
        return true;
      }

      let costUang = rUang;
      let costXpToUang = rXp * 150n;
      let costDoubleXp = rDoubleXp * 50000n;
      let costLimitCmd = rLimitCmd * 5000n;
      let totalSatuan = costUang + costXpToUang + costDoubleXp + costLimitCmd;
      let totalCost = totalSatuan * rKuota;

      if (u.uang < totalCost) {
        await sock.sendMessage(from, { text: `❌ Saldo kamu tidak cukup membuat voucher ini!\n💳 Total Tagihan: Rp ${formatMoney(totalCost)}` });
        return true;
      }

      u.uang -= totalCost;
      const newCode = 'VCH-' + Math.random().toString(36).substring(2, 7).toUpperCase();
      let rwdObj = {};
      if (rUang > 0n) rwdObj.uang = rUang;
      if (rXp > 0n) rwdObj.xp = rXp;
      if (rDoubleXp > 0n) rwdObj.double_xp_jam = Number(rDoubleXp);
      if (rLimitCmd > 0n) rwdObj.limit_cmd = Number(rLimitCmd);

      if (!db.global.redeem_codes) db.global.redeem_codes = {};
      db.global.redeem_codes[newCode] = {
        reward: rwdObj, limit: Number(rKuota), used: 0, claimed_by: [],
        expired: Date.now() + (86400000 * 7), creator: sender
      };
      saveDB(db);

      let rwdTxt = [];
      if (rUang > 0n) rwdTxt.push(`💵 Uang (Rp ${formatMoney(rUang)})`);
      if (rXp > 0n) rwdTxt.push(`🌟 XP (${formatMoney(rXp)})`);
      if (rDoubleXp > 0n) rwdTxt.push(`🔥 Double XP (${rDoubleXp} Jam)`);
      if (rLimitCmd > 0n) rwdTxt.push(`⚡ Limit Command (${rLimitCmd})`);

      await sock.sendMessage(from, { text: `🎟️ *REDEEM CODE DIBUAT* 🎟️\n\nTagihan Rp ${formatMoney(totalCost)} telah dipotong.\n\nKode: *${newCode}*\nHadiah: ${rwdTxt.join(' & ')}\nKuota: ${rKuota} Pengguna\n\n_Segera bagikan kode ini ke player lain!_` });
      return true;
    }

    // ==================== REDEEM ====================
    if (cmd === 'redeem') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}redeem [kode]` });
        return true;
      }
      let code = args[0].toUpperCase();
      if (!db.global.redeem_codes || !db.global.redeem_codes[code]) {
        await sock.sendMessage(from, { text: "❌ Kode redeem tidak valid / tidak ditemukan." });
        return true;
      }

      let voucher = db.global.redeem_codes[code];
      if (voucher.expired < Date.now()) {
        await sock.sendMessage(from, { text: "❌ Kode redeem sudah kadaluwarsa." });
        return true;
      }
      if (voucher.used >= voucher.limit) {
        await sock.sendMessage(from, { text: "❌ Kuota kode redeem ini sudah habis." });
        return true;
      }
      if (voucher.claimed_by.includes(sender)) {
        await sock.sendMessage(from, { text: "❌ Kamu sudah pernah menukarkan kode ini." });
        return true;
      }

      voucher.used += 1;
      voucher.claimed_by.push(sender);

      let rwd = voucher.reward;
      let txt = `✅ *KLAIM REDEEM BERHASIL*\n\nKamu mendapatkan:\n`;

      if (rwd.uang) { u.uang += toBigInt(rwd.uang); txt += `💵 Rp ${formatMoney(rwd.uang)}\n`; }
      if (rwd.limit_cmd) {
        if (u.limit !== 'UNLIMITED') u.limit = (u.limit || 0) + rwd.limit_cmd;
        txt += `⚡ ${rwd.limit_cmd} Limit Command\n`;
      }
      if (rwd.double_xp_jam) {
        let now = Date.now();
        u.exp_buff_until = (u.exp_buff_until > now ? u.exp_buff_until : now) + (rwd.double_xp_jam * 3600000);
        u.exp_multiplier = 2;
        txt += `🔥 Double XP (${rwd.double_xp_jam} Jam)\n`;
      }
      if (rwd.badge) {
        if (!u.badges) u.badges = [];
        if (!u.badges.includes(rwd.badge)) {
          u.badges.push(rwd.badge);
          txt += `🏅 Badge Spesial: ${rwd.badge}\n`;
        } else {
          txt += `🏅 Badge Spesial: ${rwd.badge} (Sudah Dimiliki)\n`;
        }
      }
      if (rwd.xp) {
        u.xp += toBigInt(rwd.xp);
        txt += `🌟 ${formatMoney(rwd.xp)} XP\n`;
        let { level, xpReq, isLevelUp } = calculateLevelUp(u.xp, u.level);
        u.level = level;
        if (isLevelUp) txt += `\n🎉 *LEVEL UP ke Lv.${u.level}* (Sisa XP: ${u.xp}/${xpReq})\n`;
      }

      saveDB(db);
      await sock.sendMessage(from, { text: txt });
      return true;
    }

    return false;
  }
};
