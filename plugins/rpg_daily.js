// =========================================================
// PLUGIN: DAILY REWARD - RyoMada V.3.1
// Fitur klaim hadiah harian untuk player
// =========================================================
import { readDB, saveDB } from '../database.js';
import { formatMoney, toBigInt, calculateLevelUp } from '../econ_utils.js';

const DAILY_REWARDS = [
  { day: 1, uang: 10000n, xp: 500n, label: "☀️ Hari ke-1" },
  { day: 2, uang: 15000n, xp: 750n, label: "🔥 Hari ke-2" },
  { day: 3, uang: 25000n, xp: 1000n, label: "⚡ Hari ke-3" },
  { day: 4, uang: 40000n, xp: 1500n, label: "💎 Hari ke-4" },
  { day: 5, uang: 65000n, xp: 2500n, label: "🌟 Hari ke-5" },
  { day: 6, uang: 100000n, xp: 5000n, label: "⭐ Hari ke-6" },
  { day: 7, uang: 200000n, xp: 10000n, label: "👑 Hari ke-7 (MEGA JACKPOT!)" },
];

export default {
  name: 'rpg_daily',
  version: '3.1.0',
  commands: ['daily', 'claim', 'checkdaily', 'cdaily', 'totalfitur', 'fitur', 'fitures', 'totalfiturs'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;

    // ==================== Daily Reward ====================
    if (cmd === 'daily' || cmd === 'claim') {
      if (!u.daily) u.daily = { streak: 0, last_claim: 0 };

      let now = Date.now();
      let todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      let todayMidnight = todayStart.getTime();
      let yesterdayMidnight = todayMidnight - 86400000;

      // Cek apakah sudah klaim hari ini
      if (u.daily.last_claim >= todayMidnight && u.daily.last_claim < todayMidnight + 86400000) {
        let nextClaim = new Date(u.daily.last_claim + 86400000);
        let hoursLeft = Math.ceil((u.daily.last_claim + 86400000 - now) / 3600000);
        await sock.sendMessage(from, {
          text: `⏳ *Kamu sudah klaim hari ini!*\n\n📊 *Streak:* ${u.daily.streak} Hari\n⏱️ *Klaim berikutnya:* ${hoursLeft} Jam lagi\n\n_Streak akan ter-reset jika kamu melewatkan 1 hari._`
        });
        return true;
      }

      // Cek streak: jika last_claim sebelum kemarin, reset
      if (u.daily.last_claim > 0 && u.daily.last_claim < yesterdayMidnight) {
        u.daily.streak = 0;
      }

      // Tambah streak
      u.daily.streak += 1;

      // Cek apakah sudah mencapai hari ke-7 atau lebih
      let rewardIdx = (u.daily.streak - 1) % 7;
      let reward = DAILY_REWARDS[rewardIdx];

      // Jika streak > 7, reward tetap hari ke-7 (mega)
      if (u.daily.streak > 7) {
        reward = DAILY_REWARDS[6];
      }

      // Beri reward
      u.uang += reward.uang;
      u.xp += reward.xp;

      // Cek level up
      let { level, xpReq, isLevelUp } = calculateLevelUp(u.xp, u.level);
      u.level = level;

      u.daily.last_claim = now;
      saveDB(db);

      let streakBar = '';
      for (let i = 0; i < 7; i++) {
        if (i < u.daily.streak % 7 || (u.daily.streak >= 7 && i < 7)) {
          streakBar += '✅';
        } else {
          streakBar += '⬜';
        }
      }

      let levelUpTxt = isLevelUp ? `\n\n🎉 *LEVEL UP!* Sekarang Level ${u.level}!` : '';

      await sock.sendMessage(from, {
        text: `🎁 *DAILY REWARD* 🎁\n\n${reward.label}\n📅 *Streak:* ${u.daily.streak} Hari\n${streakBar}\n\n💰 *Uang:* +Rp ${formatMoney(reward.uang)}\n🌟 *XP:* +${formatMoney(reward.xp)}${levelUpTxt}\n\n_Kembali besok untuk klaim hadiah selanjutnya!_\n_Lebih rajin = Lebih besar hadiahnya!_`
      });
      return true;
    }

    // ==================== Check Daily ====================
    if (cmd === 'checkdaily' || cmd === 'cdaily') {
      if (!u.daily) u.daily = { streak: 0, last_claim: 0 };

      let now = Date.now();
      let todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      let todayMidnight = todayStart.getTime();

      let alreadyClaimed = u.daily.last_claim >= todayMidnight && u.daily.last_claim < todayMidnight + 86400000;
      let nextRewardIdx = u.daily.streak % 7;
      let nextReward = DAILY_REWARDS[nextRewardIdx === 0 ? 6 : nextRewardIdx - 1];

      let streakBar = '';
      for (let i = 0; i < 7; i++) {
        if (i < u.daily.streak) {
          streakBar += '✅';
        } else {
          streakBar += '⬜';
        }
      }

      await sock.sendMessage(from, {
        text: `📊 *STATUS DAILY*\n\n👤 *Player:* ${u.name}\n📅 *Streak:* ${u.daily.streak} Hari\n${streakBar}\n\n${alreadyClaimed ? '⏳ _Sudah klaim hari ini_' : '✅ *Siap klaim!* Ketik .daily'}\n\n🎁 *Hadiah Selanjutnya:*\n💰 Rp ${formatMoney(nextReward.uang)}\n🌟 ${formatMoney(nextReward.xp)} XP`
      });
      return true;
    }

    // ==================== Total Fitur ====================
    if (cmd === 'totalfitur' || cmd === 'fitur' || cmd === 'fitures' || cmd === 'totalfiturs') {
      // Hitung total command dari database dan plugin loader
      let allCmds = [];
      let pluginFiles = ['admin_asmara', 'admin_main', 'admin_moderation', 'asmara', 'games', 'games_judi', 'media', 'menu', 'profil', 'rpg_daily', 'rpg_economy', 'rpg_items', 'rpg_mancing', 'rpg_market', 'rpg_pinjol', 'rpg_rampok', 'rpg_defense', 'tictactoe', 'tools'];
      
      let cmdCount = 0;
      for (let i in pluginFiles) {
        cmdCount += 1; // 1 plugin
      }

      // Count all registered commands from menu
      let menuCmds = [
        // Profil
        'profil', 'me', 'uang', 'm', 'setname', 'setgender', 'setstatus', 'setlocation',
        'setbg', 'setsosmed', 'listbadge', 'setbadge', 'afk',
        // Asmara
        'character', 'lamar', 'pasangan', 'ps', 'cerai', 'act', 'beriuang', 'namaianak', 'listanak',
        // Ekonomi
        'shop', 'beliitem', 'inventory', 'tas', 'makan', 'minum', 'listkerja', 'kerja', 'k',
        'investasi', 'inv', 'beli', 'jual', 'nabung', 'tabung', 'tarik', 'pinjol', 'bayarpinjol',
        'distrik', 'pindah', 'tf', 'transfer', 'crredeem', 'redeem', 'donasi', 'donatur',
        'listdonatur', 'lbuang', 'lbu', 'lblevel', 'lbl',
        // Kriminal
        'rampok', 'belidefense', 'cekdefense',
        // Mancing
        'mancing', 'pasarikan', 'koleksi', 'ikan', 'jualikan', 'tawarikan', 'terimaikan',
        // Games
        'ryou100', 'tebakkata', 'math', 'tebakkimia', 'tictactoe', 'judi',
        // Media
        'play', 'ytmp4', 'ytmp3', 'tiktok', 'tt', 'ig', 'igdl', 'fb', 'fbdl',
        'tomp3', 'sticker', 's', 'stiker', 'hd', 'remini', 'dl', 'allin', 'rvo',
        // Sistem
        'daily', 'claim', 'checkdaily', 'fitur', 'infostaff', 'saran', 'report', 'bantuan',
        'ping', 'menu', 'help',
        // Admin
        'menuadmin', 'antispam', 'mute', 'unmute', 'claimowner', 'setaccgroup',
        'fixekonomi', 'resetglobal', 'addprem', 'delprem', 'ban', 'unban',
        'setdata', 'delrole', 'add', 'delbadge', 'adddonate', 'buatredeem',
        'whitelistchar', 'delwhitelistchar', 'cekwhitelistchar', 'cekblacklist',
        'delblacklist', 'acc', 'tolak', 'infostaff'
      ];

      let uniqueCmds = [...new Set(menuCmds)];

      let txt = `╔═══════════════════════╗\n║  📊 STATISTIK BOT 📊  ║\n╚═══════════════════════╝\n\n` +
                `📦 *Total Plugin:* ${pluginFiles.length}\n` +
                `🔧 *Total Command:* ${uniqueCmds.length}\n` +
                `🚀 *Engine:* RyouMada V.3.1\n` +
                `⚡ *BigInt Economy:* ✅\n` +
                `🔰 *Database JID:* ✅\n` +
                `🏪 *Plugin System:* ✅\n\n` +
                `📋 *Kategori Fitur:*\n` +
                `├ 👤 Profil & Info (11)\n` +
                `├ 💞 Asmara & Keluarga (9)\n` +
                `├ 💼 Ekonomi & RPG (20)\n` +
                `├ 🥷 Kriminal & Pertahanan (3)\n` +
                `├ 🎣 Mancing & Pasar Ikan (7)\n` +
                `├ 🎮 Minigames & Judi (6)\n` +
                `├ 🎵 Media & Alat (12)\n` +
                `├ 📮 Sistem & Report (5)\n` +
                `└ 👑 Admin & Owner (20+)\n\n` +
                `_Ketik ${prefix}menu untuk melihat daftar command lengkap._`;

      await sock.sendMessage(from, { text: txt });
      return true;
    }

    return false;
  }
};
