// =========================================================
// PLUGIN: PROFIL - RyoMada V.3.1
// =========================================================
import fs from 'fs';
import { readDB, saveDB } from '../database.js';
import { resolveIdentity, waTag } from '../identity.js';
import { capMoney, sanitizeUserEconomy, formatMoney, calculateLevelUp, toBigInt } from '../econ_utils.js';
import { createRequire } from 'module';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const require = createRequire(import.meta.url);
const Jimp = require('jimp');

export default {
  name: 'profil',
  version: '3.1.0',
  commands: ['profil', 'me', 'profile', 'uang', 'm', 'nabung', 'tabung', 'tarik',
             'setname', 'setnama', 'setgender', 'setstatus', 'setlocation',
             'afk', 'listbadge', 'listbg', 'setbadge', 'setbd', 'setbad',
             'donatur', 'listdonatur', 'lbuang', 'lbu', 'lblevel', 'lbl',
             'ping', 'donasi', 'setbg', 'setsosmed', 'setmedsos',
             'report', 'saran'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;

    if (cmd === 'profil' || cmd === 'me' || cmd === 'profile') {
      let tProfil = sender;
      const ctxP = msg.message?.extendedTextMessage?.contextInfo;
      if (ctxP?.participant) { tProfil = resolveIdentity(ctxP.participant); }
      else if (ctxP?.mentionedJid?.length > 0) { tProfil = resolveIdentity(ctxP.mentionedJid[0]); }

      if (!db.users[tProfil]) {
        await sock.sendMessage(from, { text: "❌ Player tersebut belum terdaftar di database RyouMada." });
        return true;
      }
      let pU = db.users[tProfil];

      let now = new Date();
      let joinD = new Date(pU.joined_at || Date.now());
      let todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let joinMidnight = new Date(joinD.getFullYear(), joinD.getMonth(), joinD.getDate());
      let daysPassed = Math.floor((todayMidnight - joinMidnight) / 86400000);
      if (daysPassed < 0) daysPassed = 0;

      let pName = (pU.pasangan && pU.pasangan.nama) ? pU.pasangan.nama : "Belum Punya";
      let premiumStatus = pU.isPremium ? "Premium User 🌟" : "Free User 🆓";

      let txtProfil = "```Informasi Profil Player```\n" +
                      `👤 *Nama:* ${pU.name}\n` +
                      `⚧️ *Gender:* ${pU.gender || "Belum diatur"}\n` +
                      `🔰 *Badge:* [ ${pU.active_badge || "Belum Ada"} ]\n` +
                      `🌍 *Lokasi:* ${pU.location || "Belum diatur"}\n` +
                      `💍 *Pasangan:* ${pName}\n\n` +
                      `┌───「 *SOSIAL MEDIA* 」\n` +
                      `│ 📸 *IG:* ${pU.ig || "-"}\n` +
                      `│ 🎵 *TikTok:* ${pU.tiktok || "-"}\n` +
                      `│ 📘 *FB:* ${pU.fb || "-"}\n` +
                      `│ 📺 *YouTube:* ${pU.youtube || "-"}\n` +
                      `└──────────────\n\n` +
                      `📅 *Bergabung:* ${joinD.toLocaleDateString('id-ID')} (${daysPassed} Hari yang lalu)\n` +
                      `👾 *Status User:* ${premiumStatus}\n` +
                      `💬 *Status:* "${pU.status_profil || "Saya menggunakan RyouMada"}"\n\n` +
                      `┌──────────────\n│ 🆔 *UID:* ${pU.uid}\n└──────────────`;

      await sock.sendMessage(from, { text: "⏳ *Memuat Profil Card...*" });

      try {
        let ppUrl;
        try { ppUrl = await sock.profilePictureUrl(tProfil, 'image'); }
        catch (e) { ppUrl = 'https://i.ibb.co/1ZxjMwH/default-avatar.png'; }

        let remoteFallbackBg = 'https://i.ibb.co/4Yy3p7f/default-bg.jpg';
        let localDefaultBg = './profil.jpg';
        let defaultBg = fs.existsSync(localDefaultBg) ? localDefaultBg : remoteFallbackBg;
        let bgPath = pU.bg_path && fs.existsSync(pU.bg_path) ? pU.bg_path : defaultBg;

        let [bgImage, ppImage] = await Promise.all([
          Jimp.read(bgPath).catch(() => Jimp.read(remoteFallbackBg)),
          Jimp.read(ppUrl)
        ]);

        let w = bgImage.bitmap.width;
        let h = bgImage.bitmap.height;
        let ratio = w / h;
        const MAX_RATIO = 16 / 9;

        if (ratio > MAX_RATIO) {
          bgImage.cover(640, Math.round(640 / MAX_RATIO));
        } else {
          bgImage.resize(640, Jimp.AUTO);
        }

        let origH = bgImage.bitmap.height;
        const AVATAR_SIZE = 160;
        const POP_OUT = 80;
        const AVATAR_X = 30;
        const AVATAR_Y = origH - POP_OUT;

        ppImage.resize(AVATAR_SIZE, AVATAR_SIZE);
        ppImage.circle();

        let finalCanvas = await new Jimp(640, origH + POP_OUT, 0x00000000);
        finalCanvas.composite(bgImage, 0, 0);

        let border = await new Jimp(AVATAR_SIZE + 8, AVATAR_SIZE + 8, 0xFFFFFFFF);
        border.circle();
        finalCanvas.composite(border, AVATAR_X - 4, AVATAR_Y - 4);
        finalCanvas.composite(ppImage, AVATAR_X, AVATAR_Y);

        let imageBuffer = await finalCanvas.getBufferAsync(Jimp.MIME_PNG);
        await sock.sendMessage(from, { image: imageBuffer, caption: txtProfil });
      } catch (err) {
        await sock.sendMessage(from, { text: txtProfil });
      }
      return true;
    }

    // ===================== UANG / AKUN =====================
    if (cmd === 'uang' || cmd === 'm') {
      let buffTxtU = u.exp_multiplier > 1 ? `\n🔥 *Buff Aktif:* ${u.exp_multiplier}x EXP` : "";

      let rawDonaturU = db.global.donatur?.[sender];
      let totalDonasiU = typeof rawDonaturU === 'bigint' ? rawDonaturU : (rawDonaturU?.total || 0n);
      totalDonasiU = capMoney(totalDonasiU);

      let limitTxtU = u.isPremium ? "UNLIMITED ♾️" : `${u.limit} / 50`;
      let xpReq = calculateLevelUp(u.xp, u.level).xpReq;
      let energiVal = u.energi !== undefined ? u.energi : 100;

      let totalAsetIkan = 0n;
      if (u.ikan) {
        for (let k in u.ikan) {
          let price = toBigInt(db.market_ikan?.[k]?.price || 15000);
          totalAsetIkan += toBigInt(u.ikan[k]) * price;
        }
      }
      let totalAsetInvest = 0n;
      if (u.invest) {
        for (let k in u.invest) {
          let price = toBigInt(db.market?.[k]?.price || 50000);
          totalAsetInvest += toBigInt(u.invest[k]) * price;
        }
      }

      if (!u.bank) u.bank = { tabungan: 0n, last_interest: Date.now() };
      let nowTime = Date.now();
      let timeDiff = nowTime - u.bank.last_interest;
      let hoursPassed = Math.floor(timeDiff / (1000 * 60 * 60));

      if (hoursPassed >= 1 && u.bank.tabungan > 0n) {
        const rate = 1001n; // 1.001 * 1000
        const divisor = 1000n;
        let base = u.bank.tabungan;
        for (let i = 0; i < hoursPassed; i++) {
          base = (base * rate) / divisor;
        }
        u.bank.tabungan = capMoney(base);
        u.bank.last_interest = nowTime - (timeDiff % (60 * 60 * 1000));
        saveDB(db);
      }

      let pinjolTxt = (u.pinjol && u.pinjol.amount > 0n) ? `\n\n🏦 *Pinjol Aktif:* Rp ${formatMoney(u.pinjol.amount)}\n⏳ *Jatuh Tempo:* ${new Date(u.pinjol.due_time).toLocaleString('id-ID')}` : "";

      let donasiSection = totalDonasiU > 0n
        ? `┌───「 *S T A T U S  D O N A S I* 」\n│ 🎀 *Total Donasi:* Rp ${formatMoney(totalDonasiU)}\n│ 🏅 *Status:* Sahabat RyouMada\n└──────────────\n\n`
        : "";

      let txtUang = `💰 \`\`\`I N F O  K E U A N G A N\`\`\`\n` +
                    `👤 *Player:* ${u.name}\n` +
                    `🌟 *Level:* ${u.level} (${formatMoney(u.xp)}/${formatMoney(xpReq)} XP)\n` +
                    `💵 *Uang:* Rp ${formatMoney(u.uang)}${buffTxtU}\n` +
                    `🏙️ *Distrik:* ${u.distrik || 'Belum ada'}\n\n` +
                    `⚡ *Limit:* ${limitTxtU}\n` +
                    `🪫 *Energi:* ${energiVal}/100\n\n` +
                    donasiSection +
                    `┌───「 *B A N K* 」\n│ 🐟 *Aset Ikan:* Rp ${formatMoney(totalAsetIkan)}\n│ 📊 *Aset Investasi:* Rp ${formatMoney(totalAsetInvest)}\n│ 💳 *Tabungan:* Rp ${formatMoney(u.bank.tabungan)}\n└──────────────${pinjolTxt}`;

      let imageToSend;
      if (fs.existsSync('./RyouMada bank.jpg')) {
        imageToSend = fs.readFileSync('./RyouMada bank.jpg');
      } else {
        imageToSend = { url: 'https://i.ibb.co/C037yK1/default-bank.jpg' };
      }

      await sock.sendMessage(from, {
        image: imageToSend instanceof Buffer ? imageToSend : imageToSend,
        caption: txtUang
      });
      return true;
    }

    // ===================== NABUNG =====================
    if (cmd === 'nabung' || cmd === 'tabung') {
      let amount;
      if (args[0]?.toLowerCase() === 'all') {
        amount = u.uang;
      } else {
        let check = parseAmount(args[0], { min: 1 });
        if (!check.valid) {
          await sock.sendMessage(from, { text: `❌ ${check.error}\nFormat: ${prefix}nabung [jumlah/all]` });
          return true;
        }
        amount = check.value;
      }
      if (amount <= 0n || u.uang < amount) {
        await sock.sendMessage(from, { text: "❌ Uang di tanganmu tidak cukup!" });
        return true;
      }

      u.uang -= amount;
      if (!u.bank) u.bank = { tabungan: 0n, last_interest: Date.now() };
      u.bank.tabungan += amount;
      saveDB(db);

      await sock.sendMessage(from, { text: `✅ *BERHASIL MENABUNG*\nUang senilai Rp ${formatMoney(amount)} telah masuk ke RyouMada Bank!\n_Tabunganmu akan menghasilkan bunga otomatis._` });
      return true;
    }

    // ===================== TARIK =====================
    if (cmd === 'tarik') {
      let amount;
      if (args[0]?.toLowerCase() === 'all') {
        amount = u.bank?.tabungan || 0n;
      } else {
        let check = parseAmount(args[0], { min: 1 });
        if (!check.valid) {
          await sock.sendMessage(from, { text: `❌ ${check.error}\nFormat: ${prefix}tarik [jumlah/all]` });
          return true;
        }
        amount = check.value;
      }
      if (!u.bank || u.bank.tabungan < amount) {
        await sock.sendMessage(from, { text: "❌ Saldo tabungan di bankmu tidak mencukupi!" });
        return true;
      }

      u.bank.tabungan -= amount;
      u.uang += amount;
      saveDB(db);

      await sock.sendMessage(from, { text: `✅ *PENARIKAN BERHASIL*\nUang senilai Rp ${formatMoney(amount)} telah ditarik dari bank ke dompetmu!` });
      return true;
    }

    // ===================== SET NAME =====================
    if (cmd === 'setname' || cmd === 'setnama') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}setname [Nama Baru]` });
        return true;
      }
      let newName = args.join(" ");
      if (newName.length > 25) {
        await sock.sendMessage(from, { text: "❌ Nama terlalu panjang! Maksimal 25 karakter." });
        return true;
      }
      u.name = newName;
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ Berhasil! Nama profilmu telah diubah menjadi: *${newName}*` });
      return true;
    }

    if (cmd === 'setgender') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}setgender [Pria/Wanita/Rahasia]` });
        return true;
      }
      u.gender = args.join(" ");
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ Gender berhasil diatur menjadi: ${u.gender}` });
      return true;
    }

    if (cmd === 'setstatus') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}setstatus [Kata-kata statusmu]` });
        return true;
      }
      u.status_profil = args.join(" ");
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ Status profil berhasil diubah:\n"${u.status_profil}"` });
      return true;
    }

    if (cmd === 'setlocation') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}setlocation [Nama Kota/Negara]` });
        return true;
      }
      u.location = args.join(" ");
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ Lokasi berhasil diatur menjadi: ${u.location}` });
      return true;
    }

    // ===================== AFK =====================
    if (cmd === 'afk') {
      let reason = args.length > 0 ? args.join(" ") : "Tanpa alasan";
      u.afk_time = Date.now();
      u.afk_reason = reason;
      saveDB(db);
      await sock.sendMessage(from, {
        text: `💤 *MODE AFK AKTIF*\n\n👤 Player: @${sender.split('@')[0]}\n📝 Alasan: ${reason}\n\n_Bot akan memberi tahu siapapun yang men-tag kamu._`,
        mentions: [sender]
      });
      return true;
    }

    // ===================== BADGE =====================
    if (cmd === 'listbadge' || cmd === 'listbg') {
      let badgeList = u.badges.map((b, i) => `[ ${i + 1} ] ${b}`).join('\n');
      await sock.sendMessage(from, { text: `🎖️ *BADGE MILIKMU:*\n${badgeList}\n\n*Badge Aktif:* ${u.active_badge}\n_Gunakan ${prefix}setbadge [angka] untuk memakai_` });
      return true;
    }

    if (cmd === 'setbadge' || cmd === 'setbd' || cmd === 'setbad') {
      let idxBadge = parseInt(args[0]) - 1;
      if (isNaN(idxBadge) || !u.badges[idxBadge]) {
        await sock.sendMessage(from, { text: "❌ Angka tidak valid!" });
        return true;
      }
      u.active_badge = u.badges[idxBadge];
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ Badge aktif berhasil diubah ke: [ ${u.active_badge} ]` });
      return true;
    }

    // ===================== DONATUR =====================
    if (cmd === 'donatur') {
      let rawDonatur = db.global.donatur || {};
      let normalizedDonatur = {};
      for (let jid in rawDonatur) {
        let val = rawDonatur[jid];
        if (typeof val === 'bigint') {
          normalizedDonatur[jid] = { name: db.users[jid]?.name || jid.split('@')[0], total: capMoney(val) };
        } else if (val && typeof val === 'object') {
          normalizedDonatur[jid] = { name: val.name || db.users[jid]?.name || jid.split('@')[0], total: capMoney(val.total || 0n) };
        }
      }

      let donaturList = Object.entries(normalizedDonatur).sort((a, b) => {
        if (b[1].total > a[1].total) return 1;
        if (b[1].total < a[1].total) return -1;
        return 0;
      }).slice(0, 10);

      let totalSemua = Object.values(normalizedDonatur).reduce((acc, curr) => acc + curr.total, 0n);
      if (donaturList.length === 0) {
        await sock.sendMessage(from, { text: "❌ Belum ada data donatur di server ini." });
        return true;
      }
      let lbDonatur = `╔════════════════════════╗\n║ 🏆 *LEADERBOARD DONATUR* 🏆 ║\n╚════════════════════════╝\n\n`;
      donaturList.forEach((d, i) => { lbDonatur += `*${i + 1}.* ${d[1].name}\n 💎 Rp ${formatMoney(d[1].total)}\n`; });
      lbDonatur += `\n🌟 *Total Keseluruhan Donasi:* Rp ${formatMoney(totalSemua)}\n_Terima kasih kepada para Sahabat RyouMada!_`;
      await sock.sendMessage(from, { text: lbDonatur });
      return true;
    }

    if (cmd === 'listdonatur') {
      let allDonatur = Object.values(db.global.donatur || {});
      let totalSemuaList = allDonatur.reduce((acc, curr) => acc + (curr.total || 0n), 0n);
      if (allDonatur.length === 0) {
        await sock.sendMessage(from, { text: "❌ Belum ada data donatur." });
        return true;
      }
      let listTxt = `📜 *DAFTAR LENGKAP DONATUR*\n\n`;
      allDonatur.forEach((d, i) => { listTxt += `• ${d.name}: Rp ${formatMoney(d.total)}\n`; });
      listTxt += `\n🌟 *Total Keseluruhan Donasi:* Rp ${formatMoney(totalSemuaList)}`;
      await sock.sendMessage(from, { text: listTxt });
      return true;
    }

    // ===================== LEADERBOARD =====================
    if (cmd === 'lbuang' || cmd === 'lbu') {
      let sortedUang = Object.entries(db.users)
        .sort((a, b) => {
          const valA = toBigInt(b[1].uang);
          const valB = toBigInt(a[1].uang);
          if (valA > valB) return 1;
          if (valA < valB) return -1;
          return 0;
        })
        .slice(0, 10);

      let lbTxt = `🏆 \`\`\`T O P  1 0  S U L T A N\`\`\` 🏆\n\n`;

      sortedUang.forEach(([jid, usr], i) => {
        lbTxt += `┌───「 *${i + 1}.* ${usr.name} 」\n│ 📱 *Kontak:* ${waTag(jid)}\n│ 💵 *Uang:* Rp ${formatMoney(usr.uang)}\n└──────────────\n\n`;
      });

      let imageToSend;
      if (fs.existsSync('./Top 10 sultan.jpg')) {
        imageToSend = fs.readFileSync('./Top 10 sultan.jpg');
      } else {
        imageToSend = { url: 'https://i.ibb.co/4Yy3p7f/default-bg.jpg' };
      }

      await sock.sendMessage(from, {
        image: imageToSend instanceof Buffer ? imageToSend : imageToSend,
        caption: lbTxt.trim()
      });
      return true;
    }

    if (cmd === 'lblevel' || cmd === 'lbl') {
      let sortedLvl = Object.entries(db.users)
        .sort((a, b) => {
          const valA = toBigInt(b[1].level);
          const valB = toBigInt(a[1].level);
          if (valA > valB) return 1;
          if (valA < valB) return -1;
          return 0;
        })
        .slice(0, 10);

      let lbLvlTxt = `🏆 \`\`\`T O P  1 0  L E V E L\`\`\` 🏆\n\n`;

      sortedLvl.forEach(([jid, usr], i) => {
        lbLvlTxt += `┌───「 *${i + 1}.* ${usr.name} 」\n│ 📱 *Kontak:* ${waTag(jid)}\n│ 🌟 *Level:* ${usr.level} (${formatMoney(usr.xp)} XP)\n└──────────────\n\n`;
      });

      let imageToSendLvl;
      if (fs.existsSync('./Top 10 level.jpg')) {
        imageToSendLvl = fs.readFileSync('./Top 10 level.jpg');
      } else {
        imageToSendLvl = { url: 'https://i.ibb.co/4Yy3p7f/default-bg.jpg' };
      }

      await sock.sendMessage(from, {
        image: imageToSendLvl instanceof Buffer ? imageToSendLvl : imageToSendLvl,
        caption: lbLvlTxt.trim()
      });
      return true;
    }

    // ===================== PING =====================
    if (cmd === 'ping') {
      let uptime = process.uptime();
      let d = Math.floor(uptime / (3600 * 24));
      let h = Math.floor(uptime % (3600 * 24) / 3600);
      let m = Math.floor(uptime % 3600 / 60);
      let s = Math.floor(uptime % 60);
      let upStr = `${d} Hari, ${h} Jam, ${m} Menit, ${s} Detik`;
      let start = Date.now();
      const pingMsg = await sock.sendMessage(from, { text: "Menghitung ping..." });
      let end = Date.now();
      await sock.sendMessage(from, {
        text: `🏓 *PONG!*\n⏱️ Speed: ${end - start} ms\n⏳ Uptime: ${upStr}\n📊 RAM: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB\n🚀 Engine: RyouMada V.3.1`,
        edit: pingMsg.key
      });
      return true;
    }

    // ===================== DONASI =====================
    if (cmd === 'donasi') {
      let donasiTxt = `🎀 S U P P O R T  R Y O U M A D A 🎀\n\nHai, Sahabat RyouMada! 👋\nTerima kasih sudah meramaikan dunia virtual ini. Biaya server dan kopi admin butuh dukungan dari kalian agar bot ini aktif 24/7 tanpa henti!`;
      if (fs.existsSync('./qris.jpg')) {
        await sock.sendMessage(from, { image: fs.readFileSync('./qris.jpg'), caption: donasiTxt });
      } else {
        await sock.sendMessage(from, { text: donasiTxt });
      }
      return true;
    }

    // ===================== SET SOSMED =====================
    if (cmd === 'setsosmed' || cmd === 'setmedsos') {
      if (!args[0] || !args[1]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}setsosmed [ig/tiktok/fb/youtube] [Username/Link]` });
        return true;
      }
      let platform = args[0].toLowerCase();
      let valSosmed = args.slice(1).join(" ");
      if (['ig', 'tiktok', 'fb', 'youtube'].includes(platform)) {
        u[platform] = valSosmed;
        saveDB(db);
        await sock.sendMessage(from, { text: `✅ Berhasil menyimpan profil ${platform.toUpperCase()} kamu!` });
      } else {
        await sock.sendMessage(from, { text: `❌ Platform tidak valid! Pilihan: ig, tiktok, fb, youtube` });
      }
      return true;
    }

    // ===================== SET BG =====================
    if (cmd === 'setbg') {
      let q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
      let mime = (q?.imageMessage || q?.videoMessage || q?.documentMessage) ? Object.keys(q)[0] : null;
      if (mime !== 'imageMessage') {
        await sock.sendMessage(from, { text: `❌ Silakan balas/reply gambar dengan caption *${prefix}setbg*` });
        return true;
      }
      await sock.sendMessage(from, { text: "⏳ *Sedang menyimpan Background Profil...*" });
      try {
        let stream = await downloadContentFromMessage(q[mime], 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
        let bgName = `./bg_profil_${u.uid}.jpg`;
        fs.writeFileSync(bgName, buffer);
        u.bg_path = bgName;
        saveDB(db);
        await sock.sendMessage(from, { text: "✅ *Background Profil berhasil diubah!*\nSilakan ketik .profil untuk melihat hasilnya." });
      } catch (err) {
        await sock.sendMessage(from, { text: `❌ Gagal menyimpan background: ${err.message}` });
      }
      return true;
    }

    // ===================== REPORT & SARAN =====================
    if (cmd === 'report' || cmd === 'saran') {
      let textMsg = args.join(" ");
      if (!textMsg) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}${cmd} [Isi pesan yang ingin disampaikan]` });
        return true;
      }

      let targetGroup = db.global.acc_group || db.global.owner_utama;
      if (!targetGroup) {
        await sock.sendMessage(from, { text: "❌ Saat ini sistem belum memiliki grup penerima. Hubungi Owner secara langsung." });
        return true;
      }

      let msgType = cmd === 'report' ? '🚨 LAPORAN PLAYER 🚨' : '💡 SARAN PLAYER 💡';
      let surat = `╔════════════════════════╗\n║ ${msgType} ║\n╚════════════════════════╝\n\n` +
                  `👤 *Pengirim:* ${u.name}\n🆔 *UID:* ${u.uid}\n📱 *Kontak:* ${waTag(sender)}\n\n📝 *Pesan:*\n"${textMsg}"`;

      await sock.sendMessage(targetGroup, { text: surat });
      await sock.sendMessage(from, { text: `✅ *TERKIRIM!*\n${cmd === 'report' ? 'Laporan' : 'Saran'} milikmu telah berhasil dikirimkan ke meja Admin. Terima kasih!` });
      return true;
    }

    return false;
  }
};
