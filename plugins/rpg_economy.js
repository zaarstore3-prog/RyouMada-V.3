// =========================================================
// PLUGIN: RPG ECONOMY - RyoMada V.3.1
// =========================================================
import { readDB, saveDB, JOBS, DISTRIK } from '../database.js';
import { resolveIdentity, waTagNamed } from '../identity.js';
import { parseAmount, capMoney, sanitizeUserEconomy, formatMoney, toBigInt } from '../econ_utils.js';

export default {
  name: 'rpg_economy',
  version: '3.1.0',
  commands: ['tf', 'transfer', 'listkerja', 'kerja', 'k', 'distrik', 'pindah'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    if (!u.cd) u.cd = {};

    // ==================== TRANSFER ====================
    if (cmd === 'tf' || cmd === 'transfer') {
      let target = resolveIdentity(msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]);
      let cleanArgs = args.filter(a => !a.startsWith('@'));

      if (!target) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}tf [@tag] [nominal]` });
        return true;
      }
      let amountCheck = parseAmount(cleanArgs[0]);
      if (!amountCheck.valid) {
        await sock.sendMessage(from, { text: `❌ ${amountCheck.error}` });
        return true;
      }
      let amount = amountCheck.value;

      if (u.uang < amount) {
        await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup! Saldo: Rp ${formatMoney(u.uang)}` });
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

      u.uang -= amount;
      if (!db.users[target].uang) db.users[target].uang = 0n;
      db.users[target].uang += amount;
      saveDB(db);
      await sock.sendMessage(from, { text: `💸 *TRANSFER BERHASIL*\nKamu mengirim Rp ${formatMoney(amount)} kepada ${waTagNamed(target, db)}` });
      return true;
    }

    // ==================== LIST KERJA ====================
    if (cmd === 'listkerja') {
      let txtK = `╔════════════════════════╗\n║ 💼  *B U R S A  K E R J A* 💼 ║\n╚════════════════════════╝\n\n`;
      for (let k in JOBS) {
        let j = JOBS[k];
        txtK += `[ ${j.icon} ] *${j.nama}*\n▸ Min Lvl: ${j.minLvl} | Ilegal: ${j.ilegal ? 'Ya' : 'Tidak'}\n▸ Gaji Pokok : Rp ${formatMoney(j.gaji)} / shift\n▸ Code : ${k}\n\n`;
      }
      await sock.sendMessage(from, { text: txtK });
      return true;
    }

    // ==================== KERJA ====================
    if (cmd === 'kerja' || cmd === 'k') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}kerja [code pekerjaan]` });
        return true;
      }
      let jobCode = args[0].toLowerCase();
      if (!JOBS[jobCode]) {
        await sock.sendMessage(from, { text: `❌ Pekerjaan tidak ditemukan. Cek ${prefix}listkerja` });
        return true;
      }

      let j = JOBS[jobCode];
      if (u.level < j.minLvl) {
        await sock.sendMessage(from, { text: `❌ Levelmu belum cukup untuk bekerja sebagai ${j.nama} (Min Lv. ${j.minLvl})` });
        return true;
      }
      if (u.energi < 20) {
        await sock.sendMessage(from, { text: `❌ Energi kamu terlalu rendah (${u.energi}/100).\nKamu tidak kuat untuk bekerja! Silakan *${prefix}makan* atau *${prefix}minum* terlebih dahulu.` });
        return true;
      }

      let now = Date.now();
      if (u.cd.kerja && u.cd.kerja > now) {
        let sisaM = Math.ceil((u.cd.kerja - now) / 60000);
        await sock.sendMessage(from, { text: `⏳ Kamu sedang kelelahan. Istirahatlah selama ${sisaM} Menit lagi.` });
        return true;
      }

      let pinjolAlert = "";
      if (u.pinjol && u.pinjol.amount > 0n && now > u.pinjol.due_time) {
        let denda = u.pinjol.amount * 2n;
        u.hutang = (u.hutang || 0n) + denda;
        u.pinjol = { amount: 0n, due_time: 0, next_penalty: 0 };
        pinjolAlert = `\n\n🚨 *DEBT COLLECTOR DATANG!* 🚨\nKamu melewati batas waktu Pinjol! Hutang pinjolmu dilipatgandakan menjadi Rp ${formatMoney(denda)}.`;
      }

      let currentDistrik = DISTRIK[u.distrik] || DISTRIK['Awal'];
      let gajiPokok = j.gaji;
      let bonusGaji = gajiPokok * BigInt(Math.floor(currentDistrik.bonus * 100)) / 100n;
      let totalGaji = gajiPokok + bonusGaji;
      let pajak = currentDistrik.pajak || 0n;
      let ongkos = currentDistrik.transport || 0n;
      let potongan = pajak + ongkos;

      if (j.ilegal && Math.random() < 0.3) {
        let dendaTertangkap = u.uang * 10n / 100n;
        u.uang -= dendaTertangkap;
        u.cd.kerja = now + 900000;
        saveDB(db);
        await sock.sendMessage(from, { text: `🚨 *TERTANGKAP POLISI!* Kamu digrebek saat bekerja ilegal di ${u.distrik}.\n💸 Denda dibayar: -Rp ${formatMoney(dendaTertangkap)}` });
        return true;
      }

      if (currentDistrik.resiko > 0 && Math.random() < currentDistrik.resiko) {
        let dendaRazia = u.uang * BigInt(Math.floor(currentDistrik.denda * 100)) / 100n;
        u.uang -= dendaRazia;
        u.cd.kerja = now + 900000;
        saveDB(db);
        await sock.sendMessage(from, { text: `⚠️ *TERKENA RAZIA DI ${u.distrik.toUpperCase()}!*\n💸 Uang disita: -Rp ${formatMoney(dendaRazia)}` });
        return true;
      }

      let gajiBersih = totalGaji - potongan;
      let potonganHutang = 0n;

      if (u.hutang > 0n && gajiBersih > 0n) {
        if (gajiBersih >= u.hutang) {
          potonganHutang = u.hutang;
          u.hutang = 0n;
        } else {
          potonganHutang = gajiBersih;
          u.hutang -= gajiBersih;
        }
        gajiBersih -= potonganHutang;
      }

      u.uang += gajiBersih;
      u.energi -= 20;
      u.cd.kerja = now + 300000;
      saveDB(db);

      let bonusTxt = bonusGaji > 0n ? `\n📈 Bonus Distrik: +Rp ${formatMoney(bonusGaji)}` : "";
      let hutangTxt = potonganHutang > 0n ? `\n💳 *Potongan Hutang:* -Rp ${formatMoney(potonganHutang)}` : "";

      await sock.sendMessage(from, {
        text: `✅ Kerja ${j.nama} selesai!${pinjolAlert}${bonusTxt}\n💰 Gaji Pokok: Rp ${formatMoney(gajiPokok)}\n🚕 Ongkos & Pajak: -Rp ${formatMoney(potongan)}${hutangTxt}\n⚡ Energi Terkuras: -20\n💵 *Bersih Diterima:* Rp ${formatMoney(gajiBersih)}`
      });
      return true;
    }

    // ==================== DISTRIK ====================
    if (cmd === 'distrik') {
      let txtDist = `🏙️ *INFORMASI DISTRIK* 🏙️\n\nKamu saat ini berada di: *${u.distrik}*\n\n`;
      for (let d in DISTRIK) {
        let info = DISTRIK[d];
        txtDist += `📍 *Distrik ${d}*\n├ Pajak Kerja: Rp ${formatMoney(info.pajak)}\n├ Ongkos Pindah: Rp ${formatMoney(info.ongkos_pindah)}\n└ Info: ${info.desc}\n\n`;
      }
      txtDist += `_Cara pindah distrik, ketik: ${prefix}pindah [Nama Distrik]_`;
      await sock.sendMessage(from, { text: txtDist });
      return true;
    }

    // ==================== PINDAH ====================
    if (cmd === 'pindah') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}pindah [Nama Distrik]` });
        return true;
      }
      let reqDistrik = args[0].charAt(0).toUpperCase() + args[0].slice(1).toLowerCase();
      if (!DISTRIK[reqDistrik]) {
        await sock.sendMessage(from, { text: "❌ Distrik tidak ditemukan." });
        return true;
      }
      if (u.distrik === reqDistrik) {
        await sock.sendMessage(from, { text: `❌ Kamu sudah berada di distrik ${reqDistrik} saat ini.` });
        return true;
      }
      let biayaPindah = DISTRIK[reqDistrik].ongkos_pindah || 0n;
      if (u.uang < biayaPindah) {
        await sock.sendMessage(from, { text: `❌ Uangmu tidak cukup untuk ongkos pindah ke ${reqDistrik}.\nDiperlukan: Rp ${formatMoney(biayaPindah)}` });
        return true;
      }
      u.uang -= biayaPindah;
      u.distrik = reqDistrik;
      saveDB(db);
      let txtBiaya = biayaPindah > 0n ? `\n🚕 Biaya Pindah: -Rp ${formatMoney(biayaPindah)}` : "\n🚕 Biaya Pindah: Gratis";
      await sock.sendMessage(from, { text: `✅ Berhasil pindah ke distrik ${reqDistrik}.${txtBiaya}` });
      return true;
    }

    return false;
  }
};
