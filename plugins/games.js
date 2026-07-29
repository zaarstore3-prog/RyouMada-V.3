// =========================================================
// PLUGIN: GAMES - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { formatMoney } from '../econ_utils.js';

export default {
  name: 'games',
  version: '3.1.0',
  commands: ['tebakkata', 'math', 'tebakkimia', 'ryou100'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;

    // ==================== TEBAK KATA ====================
    if (cmd === 'tebakkata') {
      if (global.games[from]) {
        await sock.sendMessage(from, { text: "❌ Masih ada sesi permainan yang belum diselesaikan di grup ini!" });
        return true;
      }
      const listKata = [
        { s: 'R_O_M_D_', a: 'ryoumada' },
        { s: 'A_N_M_', a: 'anime' },
        { s: 'P_S_N_A_N', a: 'pasangan' },
        { s: 'D_N_T_R', a: 'donatur' },
        { s: 'B_D_E', a: 'badge' }
      ];
      let pick = listKata[Math.floor(Math.random() * listKata.length)];
      let sessionId = Date.now();
      global.games[from] = { id: sessionId, type: 'tebak', answer: pick.a, rewardUang: 50000, rewardXp: 100 };
      await sock.sendMessage(from, { text: `🎮 *TEBAK KATA* 🎮\n\nLengkapi kata berikut:\n*${pick.s}*\n\n💰 Hadiah: Rp 50.000 & 100 XP` });

      setTimeout(async () => {
        if (global.games[from] && global.games[from].id === sessionId) {
          await sock.sendMessage(from, { text: `⏳ *WAKTU HABIS!*\nJawaban: *${pick.a.toUpperCase()}*` });
          delete global.games[from];
        }
      }, 60000);
      return true;
    }

    // ==================== MATH ====================
    if (cmd === 'math') {
      if (global.games[from]) {
        await sock.sendMessage(from, { text: "❌ Masih ada sesi permainan yang berjalan!" });
        return true;
      }
      let types = ['fungsi', 'turunan', 'aljabar'];
      let type = types[Math.floor(Math.random() * types.length)];
      let soal = "", jawaban = "";

      if (type === 'fungsi') {
        let a = Math.floor(Math.random() * 10) + 1, b = Math.floor(Math.random() * 20) + 1, c = Math.floor(Math.random() * 5) + 1;
        soal = `Diketahui f(x) = ${a}x + ${b}. Berapakah f(${c})?`;
        jawaban = (a * c + b).toString();
      } else if (type === 'turunan') {
        let a = Math.floor(Math.random() * 5) + 2, b = Math.floor(Math.random() * 10) + 1, c = Math.floor(Math.random() * 3) + 1;
        soal = `Diketahui f(x) = ${a}x² + ${b}x. Berapa turunan pertama f'(${c})?`;
        jawaban = ((2 * a * c) + b).toString();
      } else if (type === 'aljabar') {
        let a = Math.floor(Math.random() * 10) + 2, b = Math.floor(Math.random() * 10) + 2;
        soal = `Jika x=${a} dan y=${b}, berapa (x+y)² - 2xy?`;
        jawaban = (Math.pow(a + b, 2) - (2 * a * b)).toString();
      }

      let sessionId = Date.now();
      global.games[from] = { id: sessionId, type: 'math', answer: jawaban, rewardUang: 50000, rewardXp: 1000 };
      await sock.sendMessage(from, { text: `📐 *UJIAN MATEMATIKA SMA* 📐\n\n${soal}\n\n💰 *Hadiah:* Rp 50.000 & 1.000 XP` });

      setTimeout(async () => {
        if (global.games[from] && global.games[from].id === sessionId) {
          await sock.sendMessage(from, { text: `⏳ *WAKTU HABIS!*\nJawaban: *${jawaban}*` });
          delete global.games[from];
        }
      }, 60000);
      return true;
    }

    // ==================== TEBAK KIMIA ====================
    if (cmd === 'tebakkimia') {
      if (global.games[from]) {
        await sock.sendMessage(from, { text: "❌ Selesaikan dulu game yang sedang berjalan." });
        return true;
      }
      const elements = [
        { s: 'H', a: 'hidrogen' }, { s: 'O', a: 'oksigen' }, { s: 'Fe', a: 'besi' },
        { s: 'Au', a: 'emas' }, { s: 'Ag', a: 'perak' }, { s: 'Na', a: 'natrium' }
      ];
      let pick = elements[Math.floor(Math.random() * elements.length)];
      let sessionId = Date.now();
      global.games[from] = { id: sessionId, type: 'kimia', answer: pick.a, rewardUang: 150000, rewardXp: 300 };
      await sock.sendMessage(from, { text: `🧪 *TEBAK UNSUR KIMIA* 🧪\n\nApakah nama unsur dari simbol *${pick.s}*?\n\n💰 Hadiah: Rp 150.000 & 300 XP` });

      setTimeout(async () => {
        if (global.games[from] && global.games[from].id === sessionId) {
          await sock.sendMessage(from, { text: `⏳ *WAKTU HABIS!*\nJawaban: *${pick.a.toUpperCase()}*` });
          delete global.games[from];
        }
      }, 60000);
      return true;
    }

    // ==================== RYOU 100 ====================
    if (cmd === 'ryou100') {
      if (global.games[from]) {
        await sock.sendMessage(from, { text: "❌ Selesaikan dulu game yang ada." });
        return true;
      }
      const dbRyou = [
        { q: "Sebutkan genre Anime yang paling populer", a: ['shounen', 'isekai', 'romance', 'slice of life', 'mecha'] },
        { q: "Hal yang sering dilakukan otaku di kamar", a: ['nonton', 'main game', 'tidur', 'baca manga', 'koleksi figure'] },
        { q: "Item yang sering dibeli di RyouMada", a: ['badge', 'potion', 'saham', 'cincin', 'rumah'] }
      ];
      let pick = dbRyou[Math.floor(Math.random() * dbRyou.length)];
      let sessionId = Date.now();
      global.games[from] = { id: sessionId, type: 'ryou100', answers: pick.a, answered: [], players: {}, rewardUang: 100000, rewardXp: 500 };

      await sock.sendMessage(from, { text: `🎙️ *FAMILY RYOU 100* 🎙️\n\nPertanyaan: *${pick.q}?*\n\nTerdapat *${pick.a.length}* Jawaban Tersembunyi!\n💰 Hadiah Akhir: Rp 100.000 & 500 XP` });

      setTimeout(async () => {
        if (global.games[from] && global.games[from].id === sessionId) {
          let game = global.games[from];
          let highestScore = 0, winner = null;
          for (let p in game.players) { if (game.players[p] > highestScore) { highestScore = game.players[p]; winner = p; } }

          if (winner) {
            let dbLocal = readDB();
            if (!dbLocal.users[winner]) dbLocal.users[winner] = {};
            if (!dbLocal.users[winner].uang) dbLocal.users[winner].uang = 0n;
            dbLocal.users[winner].uang += BigInt(game.rewardUang);
            if (!dbLocal.users[winner].xp) dbLocal.users[winner].xp = 0n;
            dbLocal.users[winner].xp += BigInt(game.rewardXp);
            saveDB(dbLocal);
            await sock.sendMessage(from, { text: `⏳ *WAKTU HABIS!* (RYOU 100)\n\n🏆 *Pemenang:* @${winner.split('@')[0]} (${highestScore} Jawaban)\n🎁 *Hadiah:* Rp ${formatMoney(game.rewardUang)} & ${game.rewardXp} XP\n\n📜 *Jawaban:*\n- ${game.answers.join('\n- ')}`, mentions: [winner] });
          } else {
            await sock.sendMessage(from, { text: `⏳ *WAKTU HABIS!* (RYOU 100)\nTidak ada yang menebak dengan benar.\n\n📜 *Jawaban:*\n- ${game.answers.join('\n- ')}` });
          }
          delete global.games[from];
        }
      }, 60000);
      return true;
    }

    return false;
  }
};
