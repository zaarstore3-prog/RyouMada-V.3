// =========================================================
// PLUGIN: MENU - RyoMada V.3.1
// =========================================================
import fs from 'fs';
import os from 'os';
import { readDB } from '../database.js';

export default {
  name: 'menu',
  version: '3.1.0',
  commands: ['menu', 'help', 'menuadmin'],
  
  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    
    if (cmd === 'menu' || cmd === 'help') {
      const txtMenu = `╔═══════════════════════╗\n` +
                      `║   🎮 RYOUMADA MENU 🎮  ║\n` +
                      `╚═══════════════════════╝\n\n` +
                      `╔ 👤 [ PROFIL & INFO ]\n` +
                      `╠ ├ ${prefix}profil ➔ Cek statistik & Profil Card\n` +
                      `╠ ├ ${prefix}uang ➔ Cek saldo, Bank & Energi\n` +
                      `╠ ├ ${prefix}setname ➔ Ubah nama\n` +
                      `╠ ├ ${prefix}setgender ➔ Ubah gender\n` +
                      `╠ ├ ${prefix}setstatus ➔ Ubah bio\n` +
                      `╠ ├ ${prefix}setlocation ➔ Ubah lokasi\n` +
                      `╠ ├ ${prefix}setbg ➔ Ubah background profil\n` +
                      `╠ ├ ${prefix}setsosmed ➔ Atur sosial media\n` +
                      `╠ ├ ${prefix}listbadge ➔ Cek koleksi badge\n` +
                      `╠ ├ ${prefix}setbadge ➔ Pasang badge\n` +
                      `╠ └ ${prefix}afk ➔ Mode AFK\n` +
                      `║\n` +
                      `╠ 💞 [ ASMARA & KELUARGA ]\n` +
                      `╠ ├ ${prefix}character ➔ Cari waifu/husbu\n` +
                      `╠ ├ ${prefix}lamar ➔ Lamar karakter\n` +
                      `╠ ├ ${prefix}pasangan ➔ Status Asmara\n` +
                      `╠ ├ ${prefix}setpfpasangan ➔ Ubah foto\n` +
                      `╠ ├ ${prefix}cerai ➔ Putuskan hubungan\n` +
                      `╠ ├ ${prefix}act ➔ Panel interaksi acak\n` +
                      `╠ ├ ${prefix}beriuang ➔ Beri uang saku\n` +
                      `╠ ├ ${prefix}namaianak ➔ Namai bayi lahir\n` +
                      `╠ └ ${prefix}listanak ➔ Cek daftar anak\n` +
                      `║\n` +
                      `╠ 💼 [ EKONOMI & RPG ]\n` +
                      `╠ ├ ${prefix}shop ➔ Toko Makanan, Alat, XP\n` +
                      `╠ ├ ${prefix}beliitem ➔ Beli barang di shop\n` +
                      `╠ ├ ${prefix}inventory / ${prefix}tas ➔ Cek tas itemmu\n` +
                      `╠ ├ ${prefix}makan / ${prefix}minum ➔ Konsumsi item\n` +
                      `╠ ├ ${prefix}listkerja ➔ Bursa pekerjaan\n` +
                      `╠ ├ ${prefix}kerja ➔ Mulai shift kerja\n` +
                      `╠ ├ ${prefix}investasi ➔ Bursa saham/aset\n` +
                      `╠ ├ ${prefix}beli / ${prefix}jual ➔ Trading aset\n` +
                      `╠ ├ ${prefix}nabung ➔ Tabung uang ke bank\n` +
                      `╠ ├ ${prefix}tarik ➔ Tarik tabungan bank\n` +
                      `╠ ├ ${prefix}pinjol ➔ Pinjam uang\n` +
                      `╠ ├ ${prefix}bayarpinjol ➔ Lunasi pinjaman\n` +
                      `╠ ├ ${prefix}distrik ➔ Info kota saat ini\n` +
                      `╠ ├ ${prefix}pindah ➔ Ganti kota\n` +
                      `╠ ├ ${prefix}tf ➔ Transfer uang\n` +
                      `╠ ├ ${prefix}tfsaham ➔ Transfer aset saham\n` +
                      `╠ ├ ${prefix}crredeem ➔ Buat kode redeem\n` +
                      `╠ ├ ${prefix}redeem ➔ Tukar kode voucher\n` +
                      `╠ ├ ${prefix}donasi / ${prefix}donatur\n` +
                      `╠ ├ ${prefix}listdonatur ➔ Cek donatur\n` +
                      `╠ ├ ${prefix}lbuang ➔ Top Global Uang\n` +
                      `╠ ├ ${prefix}lblevel ➔ Top Global Level\n` +
                      `╠ ├ ${prefix}daily ➔ Klaim hadiah harian\n` +
                      `╠ └ ${prefix}checkdaily ➔ Cek status daily\n` +
                      `║\n` +
                      `╠ 🥷 [ KRIMINAL & PERTAHANAN ]\n` +
                      `╠ ├ ${prefix}rampok ➔ Rampok uang player lain\n` +
                      `╠ ├ ${prefix}belidefense ➔ Beli alat keamanan\n` +
                      `╠ └ ${prefix}cekdefense ➔ Cek status keamanan\n` +
                      `║\n` +
                      `╠ 🎣 [ MANCING & PASAR IKAN ]\n` +
                      `╠ ├ ${prefix}mancing ➔ Tangkap ikan\n` +
                      `╠ ├ ${prefix}pasarikan ➔ Cek harga pasar\n` +
                      `╠ ├ ${prefix}koleksi ➔ Cek tas ikanmu\n` +
                      `╠ ├ ${prefix}jualikan ➔ Jual ke NPC\n` +
                      `╠ ├ ${prefix}tawarikan ➔ Jual ke player\n` +
                      `╠ └ ${prefix}terimaikan ➔ Beli dari player\n` +
                      `║\n` +
                      `╠ 🎮 [ MINIGAMES & JUDI ]\n` +
                      `╠ ├ ${prefix}ryou100 ➔ Game Ryou 100\n` +
                      `╠ ├ ${prefix}tebakkata ➔ Game susun kata\n` +
                      `╠ ├ ${prefix}math ➔ Game matematika\n` +
                      `╠ ├ ${prefix}tebakkimia ➔ Game tabel periodik\n` +
                      `╠ ├ ${prefix}tictactoe ➔ Game TicTacToe\n` +
                      `╠ └ ${prefix}judi ➔ Taruhan Uang 50/50\n` +
                      `║\n` +
                      `╠ 🎵 [ MEDIA & ALAT ]\n` +
                      `╠ ├ ${prefix}play ➔ Putar lagu/YouTube\n` +
                      `╠ ├ ${prefix}ytmp4 ➔ Download YouTube Video\n` +
                      `╠ ├ ${prefix}ytmp3 ➔ Download YouTube Audio\n` +
                      `╠ ├ ${prefix}tiktok ➔ Download TikTok\n` +
                      `╠ ├ ${prefix}ig ➔ Download IG\n` +
                      `╠ ├ ${prefix}fb ➔ Download Facebook\n` +
                      `╠ ├ ${prefix}tomp3 ➔ Convert ke MP3\n` +
                      `╠ ├ ${prefix}sticker ➔ Buat stiker\n` +
                      `╠ ├ ${prefix}hd ➔ Perhalus gambar (Upscale)\n` +
                      `╠ ├ ${prefix}dl ➔ All-in-One Downloader\n` +
                      `╠ └ ${prefix}rvo ➔ Buka pesan sekali lihat\n` +
                      `║\n` +
                      `╠ 📮 [ SISTEM & REPORT ]\n` +
                      `╠ ├ ${prefix}infostaff ➔ Cek Daftar Staff\n` +
                      `╠ ├ ${prefix}saran ➔ Kirim ide/saran ke Dev\n` +
                      `╠ ├ ${prefix}report ➔ Lapor bug ke Dev\n` +
                      `╠ ├ ${prefix}fitur ➔ Statistik bot & fitur\n` +
                      `╠ ├ ${prefix}bantuan ➔ Panduan dasar bot\n` +
                      `║\n` +
                      `╠ 🤖 [ MULTI BOT ]\n` +
                      `╠ ├ ${prefix}jadibot [nomor] ➔ Ajukan jadi sub-bot\n` +
                      `╚ └ ${prefix}listjadibot ➔ Status jadibot`;

      let imageToSend;
      if (fs.existsSync('./menu.jpg')) {
        imageToSend = fs.readFileSync('./menu.jpg');
      } else {
        imageToSend = { url: 'https://i.ibb.co/4Yy3p7f/default-bg.jpg' };
      }

      await sock.sendMessage(from, {
        image: imageToSend instanceof Buffer ? imageToSend : imageToSend,
        caption: txtMenu
      });
      return true;
    }

    if (cmd === 'menuadmin') {
      const isAdmin = config.isAdmin || false;
      if (!isAdmin) {
        await sock.sendMessage(from, { text: "❌ Akses ditolak. Hanya untuk Staff." });
        return true;
      }
      
      let txt = `👑 *[ MENU ADMIN & OWNER ]* 👑\n\n`;
      txt += `⚙️ *SISTEM & KEAMANAN*\n`;
      txt += `├ ${prefix}antispam [on/off]\n`;
      txt += `├ ${prefix}mute / ${prefix}unmute\n`;
      txt += `├ ${prefix}claimowner\n`;
      txt += `├ ${prefix}setaccgroup\n`;
      txt += `├ ${prefix}fixekonomi\n`;
      txt += `└ ${prefix}resetglobal\n\n`;
      txt += `👥 *MANAJEMEN PLAYER*\n`;
      txt += `├ ${prefix}addprem / ${prefix}delprem [@tag/reply]\n`;
      txt += `├ ${prefix}ban [@tag/reply] [10s/5m/1d] [Alasan]\n`;
      txt += `├ ${prefix}unban [@tag/reply]\n`;
      txt += `├ ${prefix}setdata [me/@tag] [uang/xp/limit/role/afk] [nilai]\n`;
      txt += `├ ${prefix}delrole [@tag]\n`;
      txt += `├ ${prefix}add [me/@tag] [uang/xp/pts/emas] [jml]\n`;
      txt += `├ ${prefix}delbadge [@tag/reply] [urutan angka]\n`;
      txt += `├ ${prefix}adddonate [@tag/reply] [jumlah]\n`;
      txt += `└ ${prefix}infostaff\n\n`;
      txt += `🎁 *REDEEM & ASMARA*\n`;
      txt += `├ ${prefix}buatredeem [uang=100|xp=50|limit=10|badge=VIP|expired=7]\n`;
      txt += `├ ${prefix}whitelistchar / ${prefix}delwhitelistchar [ID]\n`;
      txt += `├ ${prefix}cekwhitelistchar / ${prefix}cekblacklist [@tag/me]\n`;
      txt += `├ ${prefix}delblacklist [@tag/me] [ID Karakter]\n`;
      txt += `├ ${prefix}acc pf [Kode Unik]\n`;
      txt += `├ ${prefix}tolak pf [Kode Unik] [Alasan]\n\n`;
      txt += `🤖 *MULTI BOT*\n`;
      txt += `├ ${prefix}jadibotacc [ID] ➔ Setujui jadibot\n`;
      txt += `├ ${prefix}jadibotreject [ID] ➔ Tolak jadibot\n`;
      txt += `├ ${prefix}killjadibot [nomor/ID] ➔ Hentikan jadibot\n`;
      txt += `└ ${prefix}jadibotlist ➔ Status semua jadibot`;

      await sock.sendMessage(from, { text: txt });
      return true;
    }

    return false;
  }
};
