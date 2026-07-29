// =========================================================
// PLUGIN: RPG RAMPOK - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { resolveIdentity, waTag } from '../identity.js';
import { formatMoney, sanitizeUserEconomy, bigIntPercent, toBigInt } from '../econ_utils.js';

export default {
  name: 'rpg_rampok',
  version: '3.1.0',
  commands: ['rampok'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;

    // Tangkap target dari mention
    let target = resolveIdentity(msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]);
    if (!target) {
      await sock.sendMessage(from, { text: `❌ Format: ${prefix}rampok [@tag target]` });
      return true;
    }

    if (target === sender) {
      await sock.sendMessage(from, { text: "❌ Kamu tidak waras? Kamu tidak bisa merampok dirimu sendiri!" });
      return true;
    }
    if (!db.users[target]) {
      await sock.sendMessage(from, { text: "❌ Target tersebut tidak terdaftar di database RyouMada." });
      return true;
    }

    let tUser = db.users[target];
    sanitizeUserEconomy(tUser);

    if (!u.cd) u.cd = {};
    let now = Date.now();
    let cdRampok = 2 * 60 * 60 * 1000;

    if (u.cd.rampok && now < u.cd.rampok) {
      let sisa = Math.ceil((u.cd.rampok - now) / 60000);
      await sock.sendMessage(from, { text: `⏳ Polisi masih berpatroli mencarimu! Bersembunyilah selama *${sisa} Menit* sebelum merampok lagi.` });
      return true;
    }

    if (tUser.uang < 10000n) {
      await sock.sendMessage(from, { text: "❌ Target terlalu miskin! Target harus memiliki minimal Rp 10.000 untuk bisa dirampok." });
      return true;
    }
    if (u.uang < 5000n) {
      await sock.sendMessage(from, { text: "❌ Kamu butuh modal minimal Rp 5.000 untuk membeli perlengkapan rampok!" });
      return true;
    }

    let distrikTarget = (tUser.distrik || 'awal').toLowerCase();
    let security = { rate: 0.50, fine: 0.20, name: 'Normal' };

    if (distrikTarget.includes('awal')) {
      security = { rate: 0.65, fine: 0.15, name: 'Rendah' };
    } else if (distrikTarget.includes('shibuya')) {
      security = { rate: 0.40, fine: 0.30, name: 'Ketat' };
    } else if (distrikTarget.includes('akihabara') || distrikTarget.includes('ginza')) {
      security = { rate: 0.20, fine: 0.50, name: 'Maksimal' };
    }

    let defMsg = "";
    if (tUser.defense && tUser.defense.uses > 0) {
      security.rate -= tUser.defense.blockRate;
      if (security.rate < 0.05) security.rate = 0.05;
      defMsg = `\n⚠️ *Alat Pertahanan Target Bekerja!* (${tUser.defense.name} menghalangi jalanmu)`;
      tUser.defense.uses -= 1;
      if (tUser.defense.uses <= 0) {
        defMsg += `\n💥 *Pertahanan HANCUR! Target kini rentan.*`;
        tUser.defense = null;
      }
    }

    let roll = Math.random();
    let isSuccess = roll <= security.rate;
    u.cd.rampok = now + cdRampok;

    if (isSuccess) {
      // Curi 5% - 20% dengan BigInt
      let stealPercent = (Math.random() * 0.15) + 0.05;
      let stolenAmount = tUser.uang * BigInt(Math.floor(stealPercent * 100)) / 100n;

      tUser.uang -= stolenAmount;
      u.uang += stolenAmount;
      saveDB(db);

      await sock.sendMessage(from, {
        text: `🥷 *PERAMPOKAN BERHASIL!* 🥷${defMsg}\n\nKamu sukses membobol milik ${waTag(target)}!\n\n💰 *Uang Curian:* Rp ${formatMoney(stolenAmount)}\n💵 *Saldo Kamu:* Rp ${formatMoney(u.uang)}`
      });
    } else {
      let fineAmount = u.uang * BigInt(Math.floor(security.fine * 100)) / 100n;
      u.uang -= fineAmount;
      u.banned_until = now + (15 * 60 * 1000);
      u.banned_reason = `Tertangkap basah merampok di Distrik ${security.name}`;
      saveDB(db);

      await sock.sendMessage(from, {
        text: `🚨 *TERTANGKAP POLISI!* 🚨${defMsg}\n\nSistem keamanan ${waTag(target)} mendeteksi pergerakanmu!\n\n💸 *Denda Dibayar:* Rp ${formatMoney(fineAmount)}\n⛓️ *Hukuman:* Dipenjara 15 Menit!`
      });
    }
    return true;
  }
};
