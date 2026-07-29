// =========================================================
// PLUGIN: TICTACTOE - RyoMada V.3.1
// =========================================================
import { readDB, saveDB } from '../database.js';
import { resolveIdentity } from '../identity.js';
import { formatMoney } from '../econ_utils.js';

export default {
  name: 'tictactoe',
  version: '3.1.0',
  commands: ['tictactoe', 'ttt', 'ttc'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;
    if (!global.tictactoe) global.tictactoe = {};

    if (cmd === 'tictactoe' || cmd === 'ttt' || cmd === 'ttc') {
      let target = resolveIdentity(msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]);
      let arg1 = args[0]?.toLowerCase();

      // Panduan
      if (!arg1 && !target) {
        await sock.sendMessage(from, { text: `🎮 *PANDUAN TICTACTOE* 🎮\n\n1. ${prefix}ttt [@tag] ➔ Menantang player lain\n2. ${prefix}ttt terima ➔ Menerima tantangan\n3. ${prefix}ttt tolak ➔ Menolak tantangan\n4. ${prefix}ttt [1-9] ➔ Mengisi kotak\n5. ${prefix}ttt nyerah ➔ Menyerah` });
        return true;
      }

      // Nyerah
      if (arg1 === 'keluar' || arg1 === 'nyerah') {
        if (!global.tictactoe[from]) {
          await sock.sendMessage(from, { text: "❌ Tidak ada sesi TicTacToe di grup ini." });
          return true;
        }
        let game = global.tictactoe[from];
        if (game.p1 !== sender && game.p2 !== sender) {
          await sock.sendMessage(from, { text: "❌ Kamu tidak sedang bermain!" });
          return true;
        }
        delete global.tictactoe[from];
        await sock.sendMessage(from, { text: `🏳️ @${sender.split('@')[0]} menyerah. Permainan dibatalkan.`, mentions: [sender] });
        return true;
      }

      // Terima
      if (arg1 === 'terima') {
        if (!global.tictactoe[from] || global.tictactoe[from].state !== 'WAITING') {
          await sock.sendMessage(from, { text: "❌ Tidak ada tantangan yang tertunda." });
          return true;
        }
        if (global.tictactoe[from].p2 !== sender) {
          await sock.sendMessage(from, { text: "❌ Tantangan ini bukan untukmu." });
          return true;
        }
        let game = global.tictactoe[from];
        game.state = 'PLAYING';
        await sock.sendMessage(from, { text: `🎮 *TIC-TAC-TOE* 🎮\n\nPermainan dimulai!\n❌: @${game.p1.split('@')[0]}\n⭕: @${game.p2.split('@')[0]}\n\n1️⃣ 2️⃣ 3️⃣\n4️⃣ 5️⃣ 6️⃣\n7️⃣ 8️⃣ 9️⃣\n\nGiliran: @${game.p1.split('@')[0]} (X)`, mentions: [game.p1, game.p2] });
        return true;
      }

      // Tolak
      if (arg1 === 'tolak') {
        if (!global.tictactoe[from] || global.tictactoe[from].state !== 'WAITING') {
          await sock.sendMessage(from, { text: "❌ Tidak ada tantangan yang tertunda." });
          return true;
        }
        if (global.tictactoe[from].p2 !== sender) {
          await sock.sendMessage(from, { text: "❌ Tantangan ini bukan untukmu." });
          return true;
        }
        delete global.tictactoe[from];
        await sock.sendMessage(from, { text: `❌ @${sender.split('@')[0]} menolak tantangan TicTacToe.`, mentions: [sender] });
        return true;
      }

      // Isi kotak
      if (arg1 && ['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(arg1)) {
        if (!global.tictactoe[from]) {
          await sock.sendMessage(from, { text: "❌ Tidak ada permainan aktif." });
          return true;
        }
        let game = global.tictactoe[from];
        if (game.state !== 'PLAYING') {
          await sock.sendMessage(from, { text: "❌ Permainan belum dimulai." });
          return true;
        }

        let turnP = game.turn === 'X' ? game.p1 : game.p2;
        if (sender !== turnP) {
          await sock.sendMessage(from, { text: "❌ Sabar, ini bukan giliranmu!" });
          return true;
        }

        let move = parseInt(arg1) - 1;
        if (game.board[move] === 'X' || game.board[move] === 'O') {
          await sock.sendMessage(from, { text: "❌ Kotak tersebut sudah terisi!" });
          return true;
        }

        game.board[move] = game.turn;
        let winPatterns = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
        let isWin = winPatterns.some(p => game.board[p[0]] === game.turn && game.board[p[1]] === game.turn && game.board[p[2]] === game.turn);
        let isDraw = game.board.every(b => b === 'X' || b === 'O');

        const em = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
        let boardStr = `🎮 *TIC-TAC-TOE* 🎮\n\n`;
        for (let i = 0; i < 9; i++) {
          boardStr += game.board[i] === 'X' ? '❌' : (game.board[i] === 'O' ? '⭕' : em[i]);
          if ((i + 1) % 3 === 0) boardStr += '\n';
        }

        if (isWin) {
          let rewardUang = 70000, rewardXp = 200;
          u.uang = (u.uang || 0n) + BigInt(rewardUang);
          u.xp = (u.xp || 0n) + BigInt(rewardXp);
          saveDB(db);
          boardStr += `\n🎉 @${sender.split('@')[0]} MENANG!\n🎁 Rp ${formatMoney(rewardUang)} & ${rewardXp} XP`;
          delete global.tictactoe[from];
          await sock.sendMessage(from, { text: boardStr, mentions: [game.p1, game.p2] });
        } else if (isDraw) {
          boardStr += `\n🤝 PERMAINAN SERI!`;
          delete global.tictactoe[from];
          await sock.sendMessage(from, { text: boardStr, mentions: [game.p1, game.p2] });
        } else {
          game.turn = game.turn === 'X' ? 'O' : 'X';
          let nextTurn = game.turn === 'X' ? game.p1 : game.p2;
          boardStr += `\nGiliran: @${nextTurn.split('@')[0]} (${game.turn})`;
          await sock.sendMessage(from, { text: boardStr, mentions: [game.p1, game.p2] });
        }
        return true;
      }

      // Buat tantangan baru
      if (target) {
        if (global.tictactoe[from]) {
          await sock.sendMessage(from, { text: "❌ Masih ada sesi permainan di grup ini." });
          return true;
        }
        if (target === sender) {
          await sock.sendMessage(from, { text: "❌ Tidak bisa bermain dengan diri sendiri." });
          return true;
        }
        global.tictactoe[from] = { p1: sender, p2: target, state: 'WAITING', board: [1, 2, 3, 4, 5, 6, 7, 8, 9], turn: 'X' };
        await sock.sendMessage(from, { text: `🎮 *TIC-TAC-TOE* 🎮\n\n@${sender.split('@')[0]} menantang @${target.split('@')[0]}!\n\nKetik *${prefix}ttt terima* untuk mulai.`, mentions: [sender, target] });
        return true;
      }
      return true;
    }

    return false;
  }
};
