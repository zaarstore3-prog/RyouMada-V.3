// =========================================================
// PLUGIN: ADMIN MAIN - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { resolveIdentity, resolveTarget, waTag, waTagNamed } from '../identity.js';
import { parseAmount, capMoney, sanitizeUserEconomy, formatMoney, toBigInt, calculateLevelUp } from '../econ_utils.js';

export default {
  name: 'admin_main',
  version: '3.1.0',
  commands: ['antispam', 'claimowner', 'setaccgroup', 'resetglobal',
             'setdata', 'add', 'delrole', 'delbadge', 'adddonate',
             'infostaff', 'buatredeem', 'fixekonomi', 'mute', 'unmute',
             'ev', '>', '=>', 'exec', 'syncid'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    const isOwner = config.isOwner;
    const isAdmin = config.isAdmin;
    const isOwnerUtama = config.isOwnerUtama;

    // Resolve target: mention / reply / me / phone number
    let target = resolveTarget(args, msg, sender);
    let cleanArgs = args.filter(a => !a.startsWith('@') && !/^[0-9]{10,15}$/.test(a.replace(/[^0-9]/g, '')));
    // Hapus keyword 'me' dari cleanArgs (sudah di-resolve oleh resolveTarget sebagai sender)
    cleanArgs = cleanArgs.filter(a => a.toLowerCase() !== 'me');

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

    // ==================== ANTISPAM ====================
    if (cmd === 'antispam') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      let status = args[0]?.toLowerCase();
      if (status === 'on') { db.global.antispam = true; await sock.sendMessage(from, { text: "✅ Sistem Anti-Spam DIAKTIFKAN." }); }
      else if (status === 'off') { db.global.antispam = false; await sock.sendMessage(from, { text: "✅ Sistem Anti-Spam DIMATIKAN." }); }
      else { await sock.sendMessage(from, { text: `❌ Format: ${prefix}antispam [on/off]` }); return true; }
      saveDB(db);
      return true;
    }

    // ==================== CLAIM OWNER ====================
    if (cmd === 'claimowner') {
      if (db.global.owner_utama && sender !== db.global.owner_utama) {
        await sock.sendMessage(from, { text: "❌ Tahta Owner Utama sudah diklaim oleh orang lain! Sistem menolak kudeta." });
        return true;
      }
      db.global.owner_utama = sender;
      u.role = 'owner';
      saveDB(db);
      await sock.sendMessage(from, { text: "👑 *KLAIM BERHASIL* 👑\n\nAnda sekarang menjabat sebagai *Owner Utama*. Anda memiliki kekebalan mutlak di dalam sistem." });
      return true;
    }

    // ==================== SET ACC GROUP ====================
    if (cmd === 'setaccgroup') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      db.global.acc_group = from;
      saveDB(db);
      await sock.sendMessage(from, { text: "✅ Grup ini telah ditetapkan sebagai pusat masuknya Request ACC Foto & Report." });
      return true;
    }

    // ==================== RESET GLOBAL ====================
    if (cmd === 'resetglobal') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      for (let id in db.users) {
        db.users[id].uang = 5000n;
        db.users[id].xp = 0n;
        db.users[id].level = 1n;
      }
      saveDB(db);
      await sock.sendMessage(from, { text: "⚠️ *WIPE OUT GLOBAL SELESAI* ⚠️\nSeluruh uang, level, dan XP player telah dikembalikan ke awal." });
      return true;
    }

    // ==================== MUTE / UNMUTE ====================
    if (cmd === 'mute') {
      let isStaff = (roleSender === 'admin bot' || roleSender === 'owner' || roleSender === 'manajer owner' || isOwnerUtama);
      if (!isStaff) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak. Hanya untuk Staff." });
        return true;
      }
      if (!from.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: "❌ Fitur ini hanya dapat digunakan di dalam Grup." });
        return true;
      }
      if (!db.global.muted_groups) db.global.muted_groups = {};
      if (db.global.muted_groups[from]) {
        await sock.sendMessage(from, { text: "⚠️ Bot sudah dalam status MUTE di grup ini." });
        return true;
      }
      db.global.muted_groups[from] = true;
      saveDB(db);
      await sock.sendMessage(from, { text: "🔇 *BOT DI-MUTE* 🔇\n\nBot telah dibisukan di grup ini." });
      return true;
    }

    if (cmd === 'unmute') {
      let isStaff = (roleSender === 'admin bot' || roleSender === 'owner' || roleSender === 'manajer owner' || isOwnerUtama);
      if (!isStaff) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak. Hanya untuk Staff." });
        return true;
      }
      if (!from.endsWith('@g.us')) {
        await sock.sendMessage(from, { text: "❌ Fitur ini hanya dapat digunakan di dalam Grup." });
        return true;
      }
      if (!db.global.muted_groups) db.global.muted_groups = {};
      if (!db.global.muted_groups[from]) {
        await sock.sendMessage(from, { text: "⚠️ Bot tidak sedang dalam status MUTE di grup ini." });
        return true;
      }
      db.global.muted_groups[from] = false;
      saveDB(db);
      await sock.sendMessage(from, { text: "🔊 *BOT DI-UNMUTE* 🔊\n\nBot kembali aktif dan siap merespon semua player." });
      return true;
    }

    // ==================== EVAL ====================
    if (cmd === 'ev' || cmd === '>' || cmd === '=>') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ *AKSES DITOLAK MUTLAK!*" });
        return true;
      }
      let evalCmd = args.join(" ");
      if (!evalCmd) {
        await sock.sendMessage(from, { text: `❌ Masukkan kode JavaScript! Contoh: ${prefix}> return 1+1` });
        return true;
      }
      try {
        const { format } = await import('util');
        let evaled = await eval(`(async () => { ${evalCmd} })()`);
        if (typeof evaled !== 'string') evaled = format(evaled);
        await sock.sendMessage(from, { text: `✅ *EVAL SUCCESS*\n\n\`\`\`javascript\n${evaled}\n\`\`\`` });
      } catch (err) {
        await sock.sendMessage(from, { text: `❌ *EVAL ERROR*\n\n\`\`\`javascript\n${err.message}\n\`\`\`` });
      }
      return true;
    }

    // ==================== EXEC ====================
    if (cmd === 'exec') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ *AKSES DITOLAK MUTLAK!*" });
        return true;
      }
      let execCmd = args.join(" ");
      if (!execCmd) {
        await sock.sendMessage(from, { text: `❌ Masukkan perintah bash! Contoh: ${prefix}exec ls -la` });
        return true;
      }
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const { stdout, stderr } = await execAsync(execCmd, { timeout: 30000, maxBuffer: 1024 * 1024 });
        let output = (stdout || '').toString();
        if (stderr) output += `\n[stderr]\n${stderr}`;
        if (!output.trim()) output = '(tidak ada output)';
        if (output.length > 3500) output = output.slice(0, 3500) + '\n... (dipotong)';
        await sock.sendMessage(from, { text: `✅ *EXEC SUCCESS*\n\n\`\`\`\n${output}\n\`\`\`` });
      } catch (err) {
        let errOutput = (err.stdout || '') + (err.stderr || '') || err.message || String(err);
        errOutput = errOutput.toString();
        if (errOutput.length > 3500) errOutput = errOutput.slice(0, 3500) + '\n... (dipotong)';
        await sock.sendMessage(from, { text: `❌ *EXEC ERROR*\n\n\`\`\`\n${errOutput}\n\`\`\`` });
      }
      return true;
    }

    // ==================== BUAT REDEEM ====================
    if (cmd === 'buatredeem') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: `❌ Khusus Owner!` });
        return true;
      }
      let argsString = args.join(" ");
      if (!argsString) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}buatredeem uang=1000|xp=500|limit=100|badge=VIP|doublexp=24|expired=7|code=KODEKU` });
        return true;
      }

      // Parsing parameter dengan BigInt untuk uang/xp
      let rUang = 0n, rXp = 0n, rKuota = 1, rDoubleXp = 0, rLimitCmd = 0, rBadge = "", rExpired = 7, rCode = "";
      let params = argsString.split('|');

      for (let p of params) {
        let [key, val] = p.split('=');
        if (!key || !val) continue;
        key = key.trim().toLowerCase();
        val = val.trim();

        if (key === 'uang') {
          // Parse langsung ke BigInt tanpa parseInt (tidak ada batas digit!)
          try { rUang = BigInt(val.replace(/[^0-9-]/g, '')) || 0n; } catch(e) { rUang = 0n; }
          if (rUang < 0n) rUang = 0n;
        } else if (key === 'xp') {
          try { rXp = BigInt(val.replace(/[^0-9-]/g, '')) || 0n; } catch(e) { rXp = 0n; }
          if (rXp < 0n) rXp = 0n;
        } else if (key === 'kuota' || key === 'limit') {
          rKuota = parseInt(val) || 1;
        } else if (key === 'doublexp') {
          rDoubleXp = parseInt(val) || 0;
        } else if (key === 'limitcmd') {
          rLimitCmd = parseInt(val) || 0;
        } else if (key === 'badge') {
          rBadge = val;
        } else if (key === 'expired') {
          rExpired = parseInt(val) || 7;
          if (rExpired < 1) rExpired = 1;
        } else if (key === 'code') {
          // Bersihkan: hanya huruf, angka, -, _
          rCode = val.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        }
      }

      // Validasi kode custom jika ada
      if (rCode) {
        if (rCode.length < 3 || rCode.length > 20) {
          await sock.sendMessage(from, { text: `❌ Kode redeem harus 3-20 karakter (hanya huruf/angka/-/_ saja).` });
          return true;
        }
        if (db.global.redeem_codes && db.global.redeem_codes[rCode]) {
          await sock.sendMessage(from, { text: `❌ Kode *${rCode}* sudah digunakan! Gunakan kode lain.` });
          return true;
        }
      }

      // Pakai kode custom, atau generate random 6 karakter
      const newCode = rCode || Math.random().toString(36).substring(2, 8).toUpperCase();

      let rwdObj = {};
      if (rUang > 0n) rwdObj.uang = rUang;
      if (rXp > 0n) rwdObj.xp = rXp;
      if (rDoubleXp > 0) rwdObj.double_xp_jam = rDoubleXp;
      if (rLimitCmd > 0) rwdObj.limit_cmd = rLimitCmd;
      if (rBadge) rwdObj.badge = rBadge;

      if (!db.global.redeem_codes) db.global.redeem_codes = {};
      db.global.redeem_codes[newCode] = {
        reward: rwdObj, limit: rKuota, used: 0, claimed_by: [],
        expired: Date.now() + (86400000 * rExpired), creator: sender
      };
      saveDB(db);

      // Format expired untuk tampilan
      let expiredTxt;
      if (rExpired >= 36500) {
        expiredTxt = `${Math.floor(rExpired / 365)} Tahun (${rExpired} Hari)`;
      } else if (rExpired >= 365) {
        let tahun = Math.floor(rExpired / 365);
        let hari = rExpired % 365;
        expiredTxt = `${tahun} Tahun${hari > 0 ? ` ${hari} Hari` : ''}`;
      } else {
        expiredTxt = `${rExpired} Hari`;
      }

      let rwdTxt = [];
      if (rUang > 0n) rwdTxt.push(`UANG (${formatMoney(rUang)})`);
      if (rXp > 0n) rwdTxt.push(`XP (${formatMoney(rXp)})`);
      if (rDoubleXp > 0) rwdTxt.push(`DOUBLE XP (${rDoubleXp} Jam)`);
      if (rLimitCmd > 0) rwdTxt.push(`LIMIT CMD (${rLimitCmd})`);
      if (rBadge) rwdTxt.push(`BADGE (${rBadge})`);

      await sock.sendMessage(from, {
        text: `✅ *KODE REDEEM SERVER DIBUAT*\n\n🎫 Kode: *${newCode}*\n🎁 Hadiah: ${rwdTxt.join(' & ')}\n👥 Kuota: ${rKuota} Player\n⏳ Expired: ${expiredTxt}\n\n_Silakan bagikan kode ini ke player._`
      });
      return true;
    }

    // ==================== SETDATA ====================
    if (cmd === 'setdata') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Hanya Owner / Manajer Owner." });
        return true;
      }
      if (!cleanArgs[0] || !target || !cleanArgs[1]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}setdata [me/@tag/nomor] [uang/xp/level/role/afk] [nilai]\nContoh: ${prefix}setdata 628xxx role owner` });
        return true;
      }
      let tipe = cleanArgs[0].toLowerCase();
      let value = cleanArgs.slice(1).join(' ');

      if (checkImmunity(target) && !isOwnerUtama) {
        await sock.sendMessage(from, { text: "❌ Ditolak! Owner Utama kebal terhadap rekayasa data." });
        return true;
      }
      if (!db.users[target]) db.users[target] = {};

      if (tipe === 'role') {
        if (roleSender === 'manajer owner' && !isOwnerUtama) {
          await sock.sendMessage(from, { text: "❌ Ditolak! Manajer Owner tidak punya hak untuk role." });
          return true;
        }
        let newRole = value.toLowerCase();
        if (!['admin bot', 'manajer owner', 'owner', 'player'].includes(newRole)) {
          await sock.sendMessage(from, { text: "❌ Role tidak valid! Pilih: admin bot, manajer owner, owner, atau player." });
          return true;
        }
        db.users[target].role = newRole;
        if (!db.users[target].badges) db.users[target].badges = [];
        let badgeAdd = "";
        if (newRole === 'admin bot') badgeAdd = "⚒️ Admin Bot 🛡️";
        if (newRole === 'manajer owner') badgeAdd = "💘 Owner Assistant ❤️";
        if (newRole === 'owner') badgeAdd = "🎗️ RyouMada Own 🎗️";
        if (badgeAdd && !db.users[target].badges.includes(badgeAdd)) {
          db.users[target].badges.push(badgeAdd);
          db.users[target].active_badge = badgeAdd;
        }
        saveDB(db);
        await sock.sendMessage(from, { text: `✅ Role ${waTagNamed(target, db)} diubah menjadi *${newRole.toUpperCase()}*` });
      } else {
        if (tipe === 'afk') {
          let valNum = parseInt(value);
          db.users[target].afk_time = valNum ? parseTime(value) + Date.now() : Date.now();
        } else if (tipe === 'limit' && value.toUpperCase() === 'UNLIMITED') {
          db.users[target][tipe] = 'UNLIMITED';
        } else if (tipe === 'uang' || tipe === 'xp' || tipe === 'level') {
          // LANGSUNG ke toBigInt tanpa parseInt! parseInt rusak untuk BigInt > 15 digit
          let val = toBigInt(value);
          db.users[target][tipe] = val;
          // Kalau set XP langsung, recalculate level biar gak spam level-up
          if (tipe === 'xp') {
            let { level: newLvl } = calculateLevelUp(val, db.users[target].level || 1n);
            db.users[target].level = newLvl;
          }
        } else {
          let valCheck = parseAmount(value, { min: 0n });
          if (!valCheck.valid) {
            await sock.sendMessage(from, { text: `❌ ${valCheck.error}` });
            return true;
          }
          db.users[target][tipe] = valCheck.value;
        }
        saveDB(db);
        await sock.sendMessage(from, { text: `✅ Berhasil mengatur ${tipe.toUpperCase()} ${waTagNamed(target, db)} menjadi ${value}` });
      }
      return true;
    }

    // ==================== ADD ====================
    if (cmd === 'add') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Hanya Owner / Manajer Owner." });
        return true;
      }
      if (!cleanArgs[0] || !target || !cleanArgs[1]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}add [me/@tag/nomor] [uang/xp/level/pts/inv_kode] [jml]` });
        return true;
      }
      if (checkImmunity(target) && !isOwnerUtama) {
        await sock.sendMessage(from, { text: "❌ Ditolak! Tidak bisa memodifikasi data Owner Utama." });
        return true;
      }
      let tipe = cleanArgs[0].toLowerCase();
      // LANGSUNG ke toBigInt tanpa parseInt! parseInt rusak untuk BigInt > 15 digit
      let val = toBigInt(cleanArgs[1]);
      if (!db.users[target]) db.users[target] = {};

      if (tipe === 'pts') {
        if (!db.users[target].pasangan) {
          await sock.sendMessage(from, { text: "❌ Player tidak memiliki pasangan." });
          return true;
        }
        db.users[target].pasangan.point_asmara = Number(db.users[target].pasangan.point_asmara || 0) + Number(val);
      } else if (tipe === 'uang' || tipe === 'xp') {
        if (!db.users[target][tipe]) db.users[target][tipe] = 0n;
        let newVal = capMoney(toBigInt(db.users[target][tipe]) + val);
        db.users[target][tipe] = newVal;
        // Kalau nambah XP langsung, recalculate level biar gak spam level-up
        if (tipe === 'xp') {
          let { level: newLvl } = calculateLevelUp(newVal, db.users[target].level || 1n);
          db.users[target].level = newLvl;
        }
      } else if (tipe.length === 3 || tipe === 'emas' || tipe === 'crypto') {
        if (!db.users[target].invest) db.users[target].invest = {};
        const key = tipe.toUpperCase();
        if (!db.users[target].invest[key]) db.users[target].invest[key] = 0n;
        db.users[target].invest[key] = capMoney(toBigInt(db.users[target].invest[key]) + val);
      } else {
        if (!db.users[target][tipe]) db.users[target][tipe] = 0n;
        db.users[target][tipe] = capMoney(toBigInt(db.users[target][tipe]) + val);
      }
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ Berhasil menambahkan ${formatMoney(val)} ${tipe.toUpperCase()} kepada ${waTagNamed(target, db)}` });
      return true;
    }

    // ==================== DELROLE ====================
    if (cmd === 'delrole') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak!" });
        return true;
      }
      if (roleSender === 'manajer owner' && !isOwnerUtama) {
        await sock.sendMessage(from, { text: "❌ Ditolak! Manajer Owner tidak bisa menghapus role staff." });
        return true;
      }
      if (!target) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}delrole [@tag/nomor]` });
        return true;
      }
      if (checkImmunity(target) && !isOwnerUtama) {
        await sock.sendMessage(from, { text: "❌ Ditolak! Owner Utama tidak bisa dihapus rolenya." });
        return true;
      }
      if (db.users[target]) {
        db.users[target].role = 'player';
        saveDB(db);
        await sock.sendMessage(from, { text: `🗑️ Role Staff ${waTagNamed(target, db)} telah dicabut. Status dikembalikan menjadi Player biasa.` });
      }
      return true;
    }

    // ==================== DELBADGE ====================
    if (cmd === 'delbadge') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      let idx = parseInt(cleanArgs[0]) - 1;
      if (!target || isNaN(idx)) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}delbadge [@tag/reply] [urutan angka]` });
        return true;
      }
      let bdgList = db.users[target]?.badges || [];
      if (idx < 0 || idx >= bdgList.length) {
        await sock.sendMessage(from, { text: "❌ Urutan angka badge tidak ditemukan." });
        return true;
      }
      let removed = bdgList.splice(idx, 1);
      db.users[target].badges = bdgList;
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ Badge [ ${removed[0]} ] berhasil dihapus dari koleksi ${waTagNamed(target, db)}` });
      return true;
    }

    // ==================== ADDDONATE ====================
    if (cmd === 'adddonate') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      if (!target || !cleanArgs[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}adddonate [@tag/reply/nomor] [jumlah]` });
        return true;
      }
      let val = toBigInt(cleanArgs[0]);
      if (val <= 0n) {
        await sock.sendMessage(from, { text: "❌ Jumlah donasi harus positif." });
        return true;
      }

      if (!db.global.donatur) db.global.donatur = {};
      let existing = db.global.donatur[target];
      let prevTotal = (existing && typeof existing === 'object') ? toBigInt(existing.total) : 0n;
      let namaDonatur = db.users[target]?.name || waTag(target);
      db.global.donatur[target] = { name: namaDonatur, total: capMoney(prevTotal + val) };
      saveDB(db);
      await sock.sendMessage(from, { text: `💖 Berhasil mencatat donasi sebesar Rp ${formatMoney(val)} dari ${waTagNamed(target, db)}. Terima kasih!` });
      return true;
    }

    // ==================== INFOSTAFF ====================
    if (cmd === 'infostaff') {
      let txt = `👑 *DAFTAR STAFF RYOUMADA* 👑\n\n`;
      let owners = [], manajers = [], admins = [];
      for (let jid in db.users) {
        let r = db.users[jid].role;
        if (jid === db.global.owner_utama) owners.push(`▸ ${waTagNamed(jid, db)} (Owner Utama)`);
        else if (r === 'owner') owners.push(`▸ ${waTagNamed(jid, db)}`);
        else if (r === 'manajer owner') manajers.push(`▸ ${waTagNamed(jid, db)}`);
        else if (r === 'admin bot') admins.push(`▸ ${waTagNamed(jid, db)}`);
      }
      txt += `🎗️ *OWNER:*\n${owners.length > 0 ? owners.join('\n') : '-\n'}\n\n`;
      txt += `❤️ *MANAJER OWNER:*\n${manajers.length > 0 ? manajers.join('\n') : '-\n'}\n\n`;
      txt += `🛡️ *ADMIN BOT:*\n${admins.length > 0 ? admins.join('\n') : '-'}`;
      await sock.sendMessage(from, { text: txt });
      return true;
    }

    // ==================== FIX EKONOMI ====================
    if (cmd === 'fixekonomi') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak. Hanya untuk Owner." });
        return true;
      }
      let fixedCount = 0;
      let checkedCount = 0;
      for (let jid in db.users) {
        checkedCount++;
        let player = db.users[jid];
        sanitizeUserEconomy(player);
        fixedCount++;
      }
      saveDB(db);
      await sock.sendMessage(from, {
        text: `🛠️ *PEMBERSIHAN DATA EKONOMI SELESAI*\n\n📋 Player dicek: ${checkedCount}\n✅ Semua data ekonomi telah diperbaiki ke BigInt format.`
      });
      return true;
    }

    return false;
  }
};
