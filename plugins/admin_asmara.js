// =========================================================
// PLUGIN: ADMIN ASMARA - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { resolveIdentity, resolveTarget, waTag } from '../identity.js';
import fs from 'fs';

export default {
  name: 'admin_asmara',
  version: '3.1.0',
  commands: ['whitelistchar', 'wlchar', 'wl', 'delwhitelistchar', 'delwlchar',
             'cekwhitelistchar', 'cekwlchar', 'cekblacklist', 'cekbl',
             'delblacklist', 'delbl', 'acc', 'tolak'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    const isAdmin = config.isAdmin;

    const getTarget = () => {
      let tagTarget = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      let replyTarget = msg.message?.extendedTextMessage?.contextInfo?.participant;
      return resolveIdentity(tagTarget || replyTarget);
    };

    // ==================== WHITELIST CHAR ====================
    if (cmd === 'whitelistchar' || cmd === 'wlchar' || cmd === 'wl') {
      if (!isAdmin) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      let id = args[0];
      if (!id) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}whitelistchar [ID AniList]` });
        return true;
      }
      if (!db.global.whitelist_karakter) db.global.whitelist_karakter = [];
      if (db.global.whitelist_karakter.includes(id)) {
        await sock.sendMessage(from, { text: "❌ Karakter ini sudah ada di Whitelist." });
        return true;
      }
      db.global.whitelist_karakter.push(id);
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ Karakter ID AniList ${id} berhasil ditambahkan ke Whitelist Global.` });
      return true;
    }

    if (cmd === 'delwhitelistchar' || cmd === 'delwlchar') {
      if (!isAdmin) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      let id = args[0];
      if (!id) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}delwhitelistchar [ID AniList]` });
        return true;
      }
      if (!db.global.whitelist_karakter) db.global.whitelist_karakter = [];
      let idx = db.global.whitelist_karakter.indexOf(id);
      if (idx === -1) {
        await sock.sendMessage(from, { text: "❌ Karakter tidak ditemukan di Whitelist." });
        return true;
      }
      db.global.whitelist_karakter.splice(idx, 1);
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ Karakter ID AniList ${id} berhasil dihapus dari Whitelist Global.` });
      return true;
    }

    if (cmd === 'cekwhitelistchar' || cmd === 'cekwlchar') {
      if (!isAdmin) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      let wList = db.global.whitelist_karakter || [];
      if (wList.length === 0) {
        await sock.sendMessage(from, { text: "📜 Daftar Whitelist Global kosong." });
        return true;
      }
      await sock.sendMessage(from, { text: "🔍 Sedang memuat daftar karakter dari AniList... (Mohon tunggu sebentar)" });
      let txt = `📜 *DAFTAR WHITELIST GLOBAL*\n\n`;
      for (let id of wList) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const query = `query ($id: Int) { Character(id: $id) { name { full } } }`;
          let res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { id: parseInt(id) } })
          });
          let json = await res.json();
          let name = json?.data?.Character?.name?.full || "Nama Tidak Diketahui";
          txt += `▸ ID AniList: ${id} - ${name}\n`;
        } catch (e) {
          txt += `▸ ID AniList: ${id} - Nama Tidak Diketahui\n`;
        }
      }
      await sock.sendMessage(from, { text: txt });
      return true;
    }

    // ==================== CEK BLACKLIST ====================
    if (cmd === 'cekblacklist' || cmd === 'cekbl') {
      if (!isAdmin) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      let target = getTarget() || (args[0] === 'me' ? sender : null);
      if (!target || !db.users[target]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}cekblacklist [@tag/me]` });
        return true;
      }
      let bList = db.users[target].blacklist_karakter || [];
      if (bList.length === 0) {
        await sock.sendMessage(from, { text: `📜 @${target.split('@')[0]} tidak memiliki karakter di Blacklist.`, mentions: [target] });
        return true;
      }
      await sock.sendMessage(from, { text: "🔍 Sedang memuat daftar karakter blacklist..." });
      let txt = `📜 *DAFTAR BLACKLIST (${waTag(target)})*\n\n`;
      for (let id of bList) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const query = `query ($id: Int) { Character(id: $id) { name { full } } }`;
          let res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { id: parseInt(id) } })
          });
          let json = await res.json();
          let name = json?.data?.Character?.name?.full || "Nama Tidak Diketahui";
          txt += `▸ ID AniList: ${id} - ${name}\n`;
        } catch (e) {
          txt += `▸ ID AniList: ${id} - Nama Tidak Diketahui\n`;
        }
      }
      await sock.sendMessage(from, { text: txt, mentions: [target] });
      return true;
    }

    // ==================== DEL BLACKLIST ====================
    if (cmd === 'delblacklist' || cmd === 'delbl') {
      if (!isAdmin) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      let target = getTarget() || (args[0] === 'me' ? sender : null);
      let targetId = args[args.length - 1];
      if (!target || !db.users[target] || !targetId || isNaN(targetId)) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}delblacklist [@tag/me] [ID AniList]` });
        return true;
      }
      let bList = db.users[target].blacklist_karakter || [];
      let idx = bList.indexOf(targetId);
      if (idx === -1) {
        await sock.sendMessage(from, { text: "❌ ID Karakter tidak ada di blacklist player tersebut." });
        return true;
      }
      bList.splice(idx, 1);
      db.users[target].blacklist_karakter = bList;
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ ID AniList ${targetId} berhasil dihapus dari blacklist @${target.split('@')[0]}`, mentions: [target] });
      return true;
    }

    // ==================== ACC PF ====================
    if (cmd === 'acc') {
      if (!isAdmin) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      if (args[0]?.toLowerCase() === 'pf') {
        let code = args[1]?.toUpperCase();
        if (!code) {
          await sock.sendMessage(from, { text: `❌ Format: ${prefix}acc pf [Kode]` });
          return true;
        }
        let req = db.global.pending_acc?.[code];
        if (!req || req.type !== 'pf') {
          await sock.sendMessage(from, { text: "❌ Kode pengajuan tidak ditemukan." });
          return true;
        }
        fs.renameSync(`./media/pending_pf_${code}.jpg`, `./media/pf_${req.uid}.jpg`);
        delete db.global.pending_acc[code];
        saveDB(db);
        await sock.sendMessage(from, { text: `✅ *PENGAJUAN DITERIMA*\nFoto pasangan untuk ${req.playerName} telah di-ACC.` });
        await sock.sendMessage(req.sender, { text: `🎉 *SELAMAT!*\nPengajuan Foto Pasanganmu (Karakter: ${req.charName}) telah *DITERIMA* oleh Admin.\nCek profil pasanganmu dengan .pasangan` });
      }
      return true;
    }

    // ==================== TOLAK PF ====================
    if (cmd === 'tolak') {
      if (!isAdmin) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak." });
        return true;
      }
      if (args[0]?.toLowerCase() === 'pf') {
        let code = args[1]?.toUpperCase();
        let reason = args.slice(2).join(" ") || "Tidak ada alasan spesifik.";
        if (!code) {
          await sock.sendMessage(from, { text: `❌ Format: ${prefix}tolak pf [Kode] [Alasan]` });
          return true;
        }
        let req = db.global.pending_acc?.[code];
        if (!req || req.type !== 'pf') {
          await sock.sendMessage(from, { text: "❌ Kode pengajuan tidak ditemukan." });
          return true;
        }
        if (fs.existsSync(`./media/pending_pf_${code}.jpg`)) fs.unlinkSync(`./media/pending_pf_${code}.jpg`);
        delete db.global.pending_acc[code];
        saveDB(db);
        await sock.sendMessage(from, { text: `❌ *PENGAJUAN DITOLAK*\nFoto pasangan untuk ${req.playerName} ditolak.` });
        await sock.sendMessage(req.sender, { text: `⚠️ *MOHON MAAF*\nPengajuan Foto Pasanganmu (Karakter: ${req.charName}) *DITOLAK* oleh Admin.\n📝 *Alasan:* ${reason}` });
      }
      return true;
    }

    return false;
  }
};
