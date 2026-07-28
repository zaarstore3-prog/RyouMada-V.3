// =========================================================
// PLUGIN: ASMARA - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { formatMoney, toBigInt } from '../econ_utils.js';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import fs from 'fs';

export default {
  name: 'asmara',
  version: '3.1.0',
  commands: ['character', 'char', 'lamar', 'pasangan', 'ps', 'act',
             'beriuang', 'jalan', 'suapi', 'cium', 'nikah', 'segss',
             'buatanak', 'namaianak', 'listanak', 'cerai', 'putus',
             'setpfpasangan', 'setps'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    if (!u.cd) u.cd = {};

    const fetchCharData = async (query) => {
      try {
        let graphqlQuery = '';
        let variables = {};
        if (/^\d+$/.test(query)) {
          graphqlQuery = `query ($id: Int) { Character(id: $id) { id name { full } image { large } } }`;
          variables = { id: parseInt(query) };
        } else {
          graphqlQuery = `query ($search: String) { Page(page: 1, perPage: 1) { characters(search: $search) { id name { full } image { large } } } }`;
          variables = { search: query };
        }
        let res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query: graphqlQuery, variables })
        });
        let json = await res.json();
        if (/^\d+$/.test(query)) {
          let char = json?.data?.Character;
          if (!char) return null;
          return { mal_id: char.id, name: char.name.full, images: { jpg: { image_url: char.image?.large } } };
        } else {
          let char = json?.data?.Page?.characters?.[0];
          if (!char) return null;
          return { mal_id: char.id, name: char.name.full, images: { jpg: { image_url: char.image?.large } } };
        }
      } catch (e) { return null; }
    };

    const checkCD = (cooldownLimit) => {
      let now = Date.now();
      if (u.cd.interaksi && u.cd.interaksi > now) {
        let sisa = Math.ceil((u.cd.interaksi - now) / 60000);
        sock.sendMessage(from, { text: `⏳ Pasanganmu sedang butuh waktu. Tunggu *${sisa} Menit* lagi untuk berinteraksi.` });
        return false;
      }
      u.cd.interaksi = now + cooldownLimit;
      return true;
    };

    // ==================== CHARACTER ====================
    if (cmd === 'character' || cmd === 'char') {
      let query = args.join(" ");
      if (!query) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}character [ID atau Nama Karakter]` });
        return true;
      }
      await sock.sendMessage(from, { text: "🔍 Sedang mencari data karakter di AniList..." });

      try {
        const queryGraphQL = `query ($search: String) {
          Page(page: 1, perPage: 1) {
            characters(search: $search) { id name { full native } image { large } description }
          }
        }`;
        let res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query: queryGraphQL, variables: { search: query } })
        });
        let json = await res.json();
        let charData = json?.data?.Page?.characters?.[0];
        if (!charData) {
          await sock.sendMessage(from, { text: "❌ Karakter tidak ditemukan di database AniList." });
          return true;
        }

        let cleanDesc = charData.description ? charData.description.replace(/<[^>]*>?/gm, '').slice(0, 300) : 'Tidak ada deskripsi.';
        let txt = `🌸 D A T A  K A R A K T E R 🌸\n\n🆔 ID AniList: ${charData.id}\n👤 Nama: ${charData.name.full}\n🇯🇵 Nama Asli: ${charData.name.native || '-'}\n\n📝 Deskripsi:\n${cleanDesc}\n\n_Gunakan .lamar ${charData.id} untuk menjadikan dia pasanganmu!_`;

        if (charData.image?.large) {
          await sock.sendMessage(from, { image: { url: charData.image.large }, caption: txt });
        } else {
          await sock.sendMessage(from, { text: txt });
        }
      } catch (err) {
        await sock.sendMessage(from, { text: `❌ Gagal mengambil data: ${err.message}` });
      }
      return true;
    }

    // ==================== LAMAR ====================
    if (cmd === 'lamar') {
      let query = args.join(" ");
      if (!query) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}lamar [ID atau Nama Karakter]` });
        return true;
      }
      if (u.status_hubungan !== 'lajang') {
        await sock.sendMessage(from, { text: "❌ Kamu sudah memiliki pasangan! Ceraikan dulu jika ingin menikah lagi." });
        return true;
      }

      let charData = await fetchCharData(query);
      if (!charData) {
        await sock.sendMessage(from, { text: "❌ Karakter tidak ditemukan." });
        return true;
      }

      let bList = u.blacklist_karakter || [];
      if (bList.includes(charData.mal_id.toString())) {
        await sock.sendMessage(from, { text: "❌ Karakter ini sudah kamu blacklist karena perceraian masa lalumu! Move on!" });
        return true;
      }

      let wList = db.global.whitelist_karakter || [];
      let isWhitelisted = wList.includes(charData.mal_id.toString()) || wList.some(name => name.toLowerCase() === charData.name.toLowerCase());
      if (isWhitelisted) {
        await sock.sendMessage(from, { text: `❌ *LAMARAN DITOLAK MUTLAK!*\nKarakter "${charData.name}" berada di dalam *Daftar Whitelist (Perlindungan Khusus Sistem)*.` });
        return true;
      }

      for (let userId in db.users) {
        if (db.users[userId].pasangan && db.users[userId].pasangan.id === charData.mal_id) {
          await sock.sendMessage(from, { text: `❌ Karakter ini sudah dinikahi oleh @${userId.split('@')[0]}!`, mentions: [userId] });
          return true;
        }
      }

      u.status_hubungan = 'pacaran';
      u.pasangan = { id: charData.mal_id, nama: charData.name, point_asmara: 0, uang: 0n, kehamilan: false, waktu_mulai: 0 };
      saveDB(db);

      let txtLamar = `💞 *BERHASIL LAMAR!* 💞\nSelamat! Kamu resmi berpacaran dengan *${charData.name}!*`;
      if (charData.images?.jpg?.image_url) {
        await sock.sendMessage(from, { image: { url: charData.images.jpg.image_url }, caption: txtLamar });
      } else {
        await sock.sendMessage(from, { text: txtLamar });
      }
      return true;
    }

    // ==================== PASANGAN ====================
    if (cmd === 'pasangan' || cmd === 'ps') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Kamu masih lajang." });
        return true;
      }
      let anakCount = u.anak ? u.anak.length : 0;
      let pointAsmara = u.pasangan.point_asmara || 0;
      let uangPasangan = u.pasangan.uang || 0n;
      let statusHamil = "Tidak";

      if (u.pasangan.kehamilan) {
        let months = Math.floor((Date.now() - u.pasangan.waktu_mulai) / 3600000);
        if (months >= 9) {
          if (!u.pasangan.gender_anak) {
            u.pasangan.gender_anak = Math.random() < 0.5 ? 'Laki-Laki' : 'Perempuan';
            saveDB(db);
          }
          statusHamil = `Siap Melahirkan (${u.pasangan.gender_anak})`;
        } else {
          statusHamil = `Ya (${months} Bulan)`;
        }
      }

      let txtPasangan = `╔═══════════════════════╗\n║ 💞 S T A T U S  A S M A R A 💞 ║\n╚═══════════════════════╝\n\n` +
                        `╔\n│ 👤 User     : ${u.name}\n│ 💍 Pasangan : ${u.pasangan.nama}\n│ 💌 Status   : ${u.status_hubungan.toUpperCase()}\n│ 💖 Point    : ${pointAsmara} Pts\n│ 💰 Uang     : Rp ${formatMoney(uangPasangan)}\n│ 👶 Anak     : ${anakCount} Orang\n│ 🤰 Hamil    : ${statusHamil}\n╚════════════════════════╝`;

      let txtPanel = `🎮 *PANEL INTERAKSI* 🎮\n\nPilih interaksi cepat dengan pasanganmu:\n\n[ 1 ] 💸 Beri Uang\n[ 2 ] 🎭 Action\n[ 3 ] 🍽️ Beri Makan\n\n_Balas pesan ini dengan angka_`;

      let pfPath = `./media/pf_${u.uid}.jpg`;
      if (fs.existsSync(pfPath)) {
        await sock.sendMessage(from, { image: fs.readFileSync(pfPath), caption: txtPasangan });
      } else {
        let charData = u.pasangan.id ? await fetchCharData(u.pasangan.id.toString()) : null;
        if (charData && charData.images?.jpg?.image_url) {
          await sock.sendMessage(from, { image: { url: charData.images.jpg.image_url }, caption: txtPasangan });
        } else {
          await sock.sendMessage(from, { text: txtPasangan });
        }
      }
      await sock.sendMessage(from, { text: txtPanel });
      return true;
    }

    // ==================== ACT ====================
    if (cmd === 'act') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Punya pasangan aja belum!" });
        return true;
      }
      let allActs = ['jalan', 'suapi', 'cium', 'segss', 'buatanak'];
      let shuffled = allActs.sort(() => 0.5 - Math.random());
      let picked = shuffled.slice(0, 3);
      const actLabels = { 'jalan': '🚶‍♂️ Jalan Bersama', 'suapi': '🍽️ Beri Makan', 'cium': '💋 Cium', 'segss': '💦 Hubungan Intim', 'buatanak': '👶 Buat Anak' };

      u.act_session = { '1': picked[0], '2': picked[1], '3': picked[2] };
      saveDB(db);

      await sock.sendMessage(from, {
        text: `🎭 *INTERAKSI ACAK* 🎭\n\nSilakan pilih aktivitas di bawah ini:\n\n[ 1 ] ${actLabels[picked[0]]}\n[ 2 ] ${actLabels[picked[1]]}\n[ 3 ] ${actLabels[picked[2]]}\n\n_Balas pesan ini dengan angka_`
      });
      return true;
    }

    // ==================== BERI UANG ====================
    if (cmd === 'beriuang') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Kamu masih lajang." });
        return true;
      }
      if (!args[0]) {
        await sock.sendMessage(from, { text: `💸 *BERI UANG PASANGAN*\n\n${prefix}beriuang [nominal]\nContoh: ${prefix}beriuang 50000` });
        return true;
      }
      let nominal = toBigInt(args[0]);
      if (nominal <= 0n || u.uang < nominal) {
        await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup. Uangmu saat ini: Rp ${formatMoney(u.uang)}` });
        return true;
      }
      u.uang -= nominal;
      if (!u.pasangan.uang) u.pasangan.uang = 0n;
      u.pasangan.uang += nominal;
      saveDB(db);
      await sock.sendMessage(from, { text: `✅ *BERHASIL*\nKamu memberikan uang saku sebesar Rp ${formatMoney(nominal)} kepada ${u.pasangan.nama}.` });
      return true;
    }

    // ==================== JALAN ====================
    if (cmd === 'jalan') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Punya pasangan aja belum!" });
        return true;
      }
      if (!checkCD(300000)) return true;
      if (!u.pasangan.point_asmara) u.pasangan.point_asmara = 0;
      u.pasangan.point_asmara += 10;
      saveDB(db);
      await sock.sendMessage(from, { text: `💞 Kamu menggenggam tangan ${u.pasangan.nama} dan mengajaknya jalan-jalan.\n\n*${u.pasangan.nama}:* _"Wah, udaranya segar sekali! Terima kasih sudah meluangkan waktu bersamaku hari ini, sayang..."_\n\n💖 Poin Asmara: +10 Pts` });
      return true;
    }

    // ==================== SUAPI ====================
    if (cmd === 'suapi') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Punya pasangan aja belum!" });
        return true;
      }
      if (!checkCD(300000)) return true;
      if (!u.pasangan.point_asmara) u.pasangan.point_asmara = 0;
      u.pasangan.point_asmara += 20;
      saveDB(db);
      await sock.sendMessage(from, { text: `🍽️ Kamu menyuapkan makanan favorit ke mulut ${u.pasangan.nama}.\n\n*${u.pasangan.nama}:* _"Nyam nyam... Enaaak! Masakan seenak apapun rasanya jauh lebih nikmat kalau disuapi olehmu hihi..."_\n\n💖 Poin Asmara: +20 Pts` });
      return true;
    }

    // ==================== CIUM ====================
    if (cmd === 'cium') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Punya pasangan aja belum!" });
        return true;
      }
      if ((u.pasangan.point_asmara || 0) < 30) {
        await sock.sendMessage(from, { text: "❌ Poin asmaramu belum cukup! Kumpulkan minimal 30 Pts untuk bisa mencium pasangan." });
        return true;
      }
      if (!checkCD(300000)) return true;
      u.pasangan.point_asmara += 30;
      saveDB(db);
      await sock.sendMessage(from, { text: `💋 Kamu menatap mata ${u.pasangan.nama} dalam-dalam, lalu mencium bibirnya dengan lembut.\n\n*${u.pasangan.nama}:* _"Mmmh... Ciumanmu manis sekali... Aku sangat mencintaimu..."_ (Wajahnya memerah)\n\n💖 Poin Asmara: +30 Pts` });
      return true;
    }

    // ==================== NIKAH ====================
    if (cmd === 'nikah') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Punya pasangan aja belum!" });
        return true;
      }
      if (u.status_hubungan === 'menikah') {
        await sock.sendMessage(from, { text: "❌ Kamu sudah menikah!" });
        return true;
      }
      if ((u.pasangan.point_asmara || 0) < 100) {
        await sock.sendMessage(from, { text: "❌ Poin asmaramu belum cukup! Kumpulkan minimal 100 Pts." });
        return true;
      }
      u.status_hubungan = 'menikah';
      saveDB(db);
      await sock.sendMessage(from, { text: `💍 *SAH!* Kamu meletakkan cincin di jari manis ${u.pasangan.nama}.\n\n*${u.pasangan.nama}:* _"A-aku resmi menjadi milikmu sekarang? Aku berjanji akan menjadi pendamping terbaik untukmu seumur hidup!"_\n\nSelamat menempuh hidup baru!` });
      return true;
    }

    // ==================== SEGSS ====================
    if (cmd === 'segss') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Cari pasangan dulu!" });
        return true;
      }
      if (u.status_hubungan !== 'menikah') {
        await sock.sendMessage(from, { text: "❌ Haram! Harus nikah dulu!" });
        return true;
      }
      if ((u.pasangan.point_asmara || 0) < 50) {
        await sock.sendMessage(from, { text: "❌ Poin asmaramu belum cukup! Kumpulkan minimal 50 Pts." });
        return true;
      }
      if (!checkCD(1800000)) return true;
      u.pasangan.point_asmara += 50;
      saveDB(db);
      await sock.sendMessage(from, { text: `💦 Di bawah redup lampu kamar, kamu memeluk hangat tubuh ${u.pasangan.nama} dan melakukan hubungan intim.\n\n*${u.pasangan.nama}:* _"Ahh... Sayang, pelan-pelan... ahh... ini terasa luar biasa... Aku milikmu seutuhnya..."_\n\n💖 Poin Asmara: +50 Pts` });
      return true;
    }

    // ==================== BUAT ANAK ====================
    if (cmd === 'buatanak') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Cari pasangan dulu!" });
        return true;
      }
      if (u.status_hubungan !== 'menikah') {
        await sock.sendMessage(from, { text: "❌ Haram! Harus nikah dulu!" });
        return true;
      }
      if (u.pasangan.kehamilan) {
        await sock.sendMessage(from, { text: "❌ Pasanganmu sedang hamil!" });
        return true;
      }
      if (!checkCD(3600000)) return true;
      u.pasangan.kehamilan = true;
      u.pasangan.waktu_mulai = Date.now();
      saveDB(db);
      await sock.sendMessage(from, { text: `👶 Setelah malam yang panjang, beberapa waktu berlalu dan hasil tes menunjukkan garis dua.\n\n*${u.pasangan.nama}:* _"Sayang... A-aku hamil! Ya ampun, kita akan menjadi orang tua! Aku sangat bahagia!"_ (Menangis terharu)\n\n_Kandungan akan bertambah 1 Bulan setiap 1 Jam. Gunakan .namaianak setelah 9 Bulan._` });
      return true;
    }

    // ==================== NAMAI ANAK ====================
    if (cmd === 'namaianak') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Cari pasangan dulu!" });
        return true;
      }
      if (!u.pasangan.kehamilan) {
        await sock.sendMessage(from, { text: "❌ Pasanganmu tidak sedang hamil!" });
        return true;
      }
      let months = Math.floor((Date.now() - u.pasangan.waktu_mulai) / 3600000);
      if (months < 9) {
        await sock.sendMessage(from, { text: `❌ Usia kandungan baru ${months} Bulan. Belum saatnya melahirkan!` });
        return true;
      }
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}namaianak [nama anak]` });
        return true;
      }
      if (!u.anak) u.anak = [];
      let namaAnak = args.join(" ");
      let genderAnak = u.pasangan.gender_anak || (Math.random() < 0.5 ? 'Laki-Laki' : 'Perempuan');
      u.anak.push({ nama: namaAnak, gender: genderAnak });
      u.pasangan.kehamilan = false;
      u.pasangan.waktu_mulai = 0;
      delete u.pasangan.gender_anak;
      saveDB(db);
      await sock.sendMessage(from, { text: `🎉 *KELAHIRAN* 🎉\nSelamat! ${u.pasangan.nama} telah melahirkan bayi ${genderAnak} dengan sehat.\nAnakmu diberi nama: *${namaAnak}*` });
      return true;
    }

    // ==================== LIST ANAK ====================
    if (cmd === 'listanak') {
      if (!u.anak || u.anak.length === 0) {
        await sock.sendMessage(from, { text: "❌ Kamu belum memiliki anak." });
        return true;
      }
      let txtAnak = `👶 *DAFTAR ANAKMU*\n\n` + u.anak.map((a, i) => {
        if (typeof a === 'string') return `*${i + 1}.* ${a} ⚥ (Tidak Diketahui)`;
        return `*${i + 1}.* ${a.nama} ⚥ ${a.gender}`;
      }).join('\n');
      await sock.sendMessage(from, { text: txtAnak });
      return true;
    }

    // ==================== CERAI ====================
    if (cmd === 'cerai' || cmd === 'putus') {
      if (u.status_hubungan === 'lajang' || !u.pasangan) {
        await sock.sendMessage(from, { text: "❌ Kamu masih lajang." });
        return true;
      }
      let namaMantan = u.pasangan.nama;
      let idMantan = u.pasangan.id;
      if (!u.blacklist_karakter) u.blacklist_karakter = [];
      if (idMantan && !u.blacklist_karakter.includes(idMantan.toString())) {
        u.blacklist_karakter.push(idMantan.toString());
      }
      u.status_hubungan = 'lajang';
      delete u.pasangan;
      delete u.anak;
      let pfPath = `./media/pf_${u.uid}.jpg`;
      if (fs.existsSync(pfPath)) { try { fs.unlinkSync(pfPath); } catch (e) {} }
      saveDB(db);
      await sock.sendMessage(from, { text: `💔 *HUBUNGAN BERAKHIR*\nKamu telah resmi berpisah dengan *${namaMantan}*.\n\n🚫 Karakter ini telah dimasukkan ke daftar Blacklist-mu.\n🔄 Data keluarga dan foto pasangan telah di-reset.` });
      return true;
    }

    // ==================== SET PF PASANGAN ====================
    if (cmd === 'setpfpasangan' || cmd === 'setps') {
      if (u.status_hubungan === 'lajang') {
        await sock.sendMessage(from, { text: "❌ Kamu masih lajang." });
        return true;
      }
      let qMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!qMsg || !qMsg.imageMessage) {
        await sock.sendMessage(from, { text: "❌ Reply foto yang ingin diajukan sebagai profil pasangan!" });
        return true;
      }
      try {
        const genCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const stream = await downloadContentFromMessage(qMsg.imageMessage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }
        fs.writeFileSync(`./media/pending_pf_${genCode}.jpg`, buffer);
        if (!db.global.pending_acc) db.global.pending_acc = {};

        db.global.pending_acc[genCode] = {
          type: 'pf', sender: sender, uid: u.uid,
          playerName: u.name, charName: u.pasangan.nama, charId: u.pasangan.id || "Tidak Diketahui"
        };
        saveDB(db);

        await sock.sendMessage(from, { text: `✅ *PENGAJUAN TERKIRIM*\n\nAjuan Foto Pasanganmu sedang ditinjau oleh Admin.\n🎟️ *Kode Pengajuan:* ${genCode}\n\n_Bot akan mengirim pesan pribadi (PM) kepadamu jika ajuan ini Diterima atau Ditolak._` });

        let targetAdminGroup = db.global.acc_group || db.global.owner_utama;
        if (targetAdminGroup) {
          let reqMessage = `🔔 *PENGAJUAN FOTO PASANGAN* 🔔\n\n👤 *Pemohon:* ${u.name}\n📛 *Karakter:* ${u.pasangan.nama}\n🆔 *ID:* ${u.pasangan.id || '-'}\n🎟️ *Kode:* ${genCode}\n\n✅ *Terima:* ${prefix}acc pf ${genCode}\n❌ *Tolak:* ${prefix}tolak pf ${genCode} [Alasan]`;
          await sock.sendMessage(targetAdminGroup, { image: buffer, caption: reqMessage });
        }
      } catch (err) {
        await sock.sendMessage(from, { text: "❌ Gagal memproses gambar." });
      }
      return true;
    }

    return false;
  }
};
