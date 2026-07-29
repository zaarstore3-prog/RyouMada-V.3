// =========================================================
// PLUGIN: ADMIN MODERATION - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { resolveTarget, waTag, waTagNamed } from '../identity.js';

export default {
  name: 'admin_moderation',
  version: '3.1.0',
  commands: ['addprem', 'delprem', 'ban', 'banned', 'unban'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    const isOwner = config.isOwner;
    const isAdmin = config.isAdmin;
    const isOwnerUtama = config.isOwnerUtama;

    // Resolve targets: mention / reply / me / phone number
    let targets = [];
    let cleanArgs = args.filter(a => !a.startsWith('@') && !/^[0-9]{10,15}$/.test(a.replace(/[^0-9]/g, '')));
    // Hapus keyword 'me' dari cleanArgs (sudah di-resolve oleh resolveTarget sebagai sender)
    cleanArgs = cleanArgs.filter(a => a.toLowerCase() !== 'me');

    let target = resolveTarget(args, msg, sender);
    if (target) targets.push(target);

    let roleSender = u.role || 'player';

    const checkImmunity = (targetJid) => {
      return targetJid === db.global.owner_utama;
    };

    const parseTime = (timeStr) => {
      if (!timeStr) return null;
      const regex = /^(\d+)([smhdy])$/i;
      const match = timeStr.match(regex);
      if (!match) return null;
      const val = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, y: 31536000000 };
      return val * multipliers[unit];
    };

    // ==================== ADDPREM ====================
    if (cmd === 'addprem') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      if (targets.length === 0) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}addprem [@tag/reply/nomor]` });
        return true;
      }

      let displayTarget = targets[0];
      for (let t of targets) {
        if (roleSender === 'manajer owner' && checkImmunity(t) && !isOwnerUtama) continue;
        if (!db.users[t]) db.users[t] = {};
        db.users[t].isPremium = true;
        db.users[t].limit = 'UNLIMITED';
        if (!db.users[t].badges) db.users[t].badges = [];
        if (!db.users[t].badges.includes("💎 Premium User🎗️")) {
          db.users[t].badges.push("💎 Premium User🎗️");
          db.users[t].active_badge = "💎 Premium User🎗️";
        }
      }
      saveDB(db);
      await sock.sendMessage(from, { text: `🌟 ${waTagNamed(displayTarget, db)} sekarang adalah Player Premium!\n🎁 Badge [ 💎 Premium User🎗️ ] ditambahkan otomatis.` });
      return true;
    }

    // ==================== DELPREM ====================
    if (cmd === 'delprem') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      if (targets.length === 0) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}delprem [@tag/reply/nomor]` });
        return true;
      }

      let displayTarget = targets[0];
      for (let t of targets) {
        if (roleSender === 'manajer owner' && checkImmunity(t) && !isOwnerUtama) continue;
        if (db.users[t]) {
          db.users[t].isPremium = false;
          db.users[t].limit = 50;
          let badgeIdx = db.users[t].badges?.indexOf("💎 Premium User🎗️");
          if (badgeIdx > -1) db.users[t].badges.splice(badgeIdx, 1);
        }
      }
      saveDB(db);
      await sock.sendMessage(from, { text: `❌ Status Premium ${waTagNamed(displayTarget, db)} telah dicabut.` });
      return true;
    }

    // ==================== BAN ====================
    if (cmd === 'ban' || cmd === 'banned') {
      if (!isAdmin) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak. Hanya untuk Staff." });
        return true;
      }
      if (targets.length === 0) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}ban [@tag/reply/nomor] [waktu:10s/5m/1d] [alasan]` });
        return true;
      }

      let hasValidTarget = false;
      let displayTarget = targets[0];
      let timeStr = cleanArgs[0];
      let banTimeMs = parseTime(timeStr);
      let reason = "";

      if (banTimeMs) {
        reason = cleanArgs.slice(1).join(" ") || "Melanggar aturan yang ditetapkan.";
      } else {
        banTimeMs = parseTime("1y");
        reason = cleanArgs.join(" ") || "Melanggar aturan yang ditetapkan.";
      }

      for (let t of targets) {
        if (!db.users[t]) continue;
        if (checkImmunity(t)) continue;
        let targetRole = db.users[t]?.role || 'player';
        if ((targetRole === 'owner' || targetRole === 'manajer owner') && !isOwnerUtama) continue;
        db.users[t].banned_until = Date.now() + banTimeMs;
        db.users[t].banned_reason = reason;
        hasValidTarget = true;
      }

      if (!hasValidTarget) {
        await sock.sendMessage(from, { text: "❌ Gagal! Nomor tersebut tidak terdaftar atau memiliki kekebalan hukum." });
        return true;
      }
      saveDB(db);
      await sock.sendMessage(from, { text: `🔨 ${waTagNamed(displayTarget, db)} telah di-BANNED.\n⏳ Durasi: ${timeStr || '1y'}\n📝 Alasan: ${reason}` });
      return true;
    }

    // ==================== UNBAN ====================
    if (cmd === 'unban') {
      if (!isAdmin) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      if (targets.length === 0) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}unban [@tag/reply/nomor]` });
        return true;
      }

      let hasValidTarget = false;
      let displayTarget = targets[0];
      for (let t of targets) {
        if (db.users[t]) {
          db.users[t].banned_until = 0;
          db.users[t].banned_reason = "";
          hasValidTarget = true;
        }
      }
      if (!hasValidTarget) {
        await sock.sendMessage(from, { text: "❌ Gagal! Nomor tersebut tidak ditemukan di database." });
        return true;
      }
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ ${waTagNamed(displayTarget, db)} telah di-UNBAN dan dapat bermain kembali.` });
      return true;
    }

    return false;
  }
};
