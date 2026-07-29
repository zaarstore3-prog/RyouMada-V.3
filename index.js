// =========================================================
// RYOUMADA V.3.1 - MAIN ENTRY POINT
// WhatsApp Bot dengan BigInt Economy & Plugin System
// =========================================================

process.env.TZ = 'Asia/Makassar';

// Safety net: cegah crash dari unhandled promise rejection
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Unhandled Rejection:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err?.message || err);
});

import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, downloadContentFromMessage, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'readline';
import fs from 'fs';
import { initDB, readDB, saveDB } from './database.js';
import { resolveIdentity } from './identity.js';
import { sanitizeUserEconomy, calculateLevelUp, formatMoney } from './econ_utils.js';
import { initPlugins } from './plugins/loader.js';
import { reconnectActiveJadibots } from './plugins/jadibot.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

let commandMap = new Map();

// Variabel Global Auth State (Mencegah Bad Session akibat multi-writer)
let globalAuthState;
let globalSaveCreds;

let reconnectAttempts = 0;
let reconnectTimer = null;
let stableTimer = null;
let hasReconnectedJadibotsOnce = false;
const RECONNECT_BASE_DELAY = 3000;    
const RECONNECT_MAX_DELAY = 300000;   
const STABLE_AFTER_MS = 60000;        

function nextMainReconnectDelay() {
  return Math.min(RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1), RECONNECT_MAX_DELAY);
}

const PRIVATE_ALLOWED_CMDS = new Set([
  'jadibot', 'jadibotacc', 'jadibotreject', 'killjadibot', 'jadibotlist', 'listjadibot',
  'report', 'saran', 'claimowner', 'acc', 'tolak'
]);

function getAFKString(ms) {
  let y = Math.floor(ms / 31536000000), d = Math.floor((ms % 31536000000) / 86400000);
  let h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  let s = Math.floor((ms % 60000) / 1000);
  let str = [];
  if (y > 0) str.push(`${y} Tahun`);
  if (d > 0) str.push(`${d} Hari`);
  if (h > 0) str.push(`${h} Jam`);
  if (m > 0) str.push(`${m} Menit`);
  if (s > 0) str.push(`${s} Detik`);
  return str.length > 0 ? str.join(', ') : "Baru saja";
}

async function startBot() {
  initDB();

  if (!global.games) global.games = {};
  if (!global.spamTracker) global.spamTracker = {};
  if (!global.trade_ikan) global.trade_ikan = {};
  if (!global.tictactoe) global.tictactoe = {};
  if (!global.activeJadibots) global.activeJadibots = {};
  if (!global.lastGroupResponse) global.lastGroupResponse = {};

  const { commandMap: cm } = await initPlugins();
  commandMap = cm;
  global.jadibotCommandMap = commandMap;
  global.mainBotSock = null;

  // 🔥 PERBAIKAN: Auth State dibuat SEKALI SAJA di awal
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');
  globalAuthState = state;
  globalSaveCreds = saveCreds;

  await connectToWhatsApp();
}

async function connectToWhatsApp() {
  const isAuth = fs.existsSync('./auth_session/creds.json');
  let noWa = '';

  if (!isAuth) {
    console.log("\n=======================================");
    noWa = await question('📱 Masukkan nomor WA bot (Cth: 628...):\n> ');
    noWa = noWa.replace(/[^0-9]/g, '');
    if (noWa.startsWith('0')) noWa = '62' + noWa.slice(1);
    console.log("=======================================");
  }

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Menggunakan WA Web Versi: ${version.join('.')}, isLatest: ${isLatest}`);

  // 🔥 Menggunakan globalAuthState yang aman
  const sock = makeWASocket({
    version,
    auth: globalAuthState,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    generateHighQualityLinkPreview: true
  });

  if (global.mainBotSock) {
    try {
      global.mainBotSock.ev.removeAllListeners('messages.upsert');
      global.mainBotSock.ev.removeAllListeners('connection.update');
      global.mainBotSock.ev.removeAllListeners('creds.update');
      global.mainBotSock.end(undefined);
    } catch (e) { }
  }

  if (!isAuth && noWa) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(noWa);
        let formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
        console.log(`\n🎟️ KODE PAIRING: ${formattedCode}\n`);
      } catch (err) { console.log(`❌ Gagal meminta kode:`, err); }
    }, 5000);
  }

  sock.ev.on('creds.update', globalSaveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      if (stableTimer) { clearTimeout(stableTimer); stableTimer = null; }
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log("❌ Sesi Logged Out. Hapus folder auth_session.");
        process.exit();
        return;
      }

      if (statusCode === DisconnectReason.badSession) {
        console.log("❌ Sesi rusak (bad session). Hapus folder auth_session lalu jalankan ulang bot untuk pairing baru.");
        process.exit();
        return;
      }

      if (reconnectTimer) return; 

      let delay;
      if (statusCode === DisconnectReason.restartRequired) {
        delay = 1500;
        console.log(`[MAIN] Restart diperlukan (normal setelah pairing). Menyambung ulang dalam ${delay / 1000}s...`);
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        reconnectAttempts += 1;
        delay = Math.max(nextMainReconnectDelay(), 30000);
        console.log(`⚠️ [MAIN] Koneksi diambil alih sesi lain. Coba lagi dalam ${Math.round(delay / 1000)}s...`);
      } else {
        reconnectAttempts += 1;
        delay = nextMainReconnectDelay();
        console.log(`[MAIN] Terputus (${statusCode || 'unknown'}). Reconnect percobaan ke-${reconnectAttempts} dalam ${Math.round(delay / 1000)}s...`);
      }

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectToWhatsApp().catch(err => console.error('FATAL saat reconnect:', err));
      }, delay);
    } else if (connection === 'open') {
      console.log("✅ BOT RYOUMADA V.3.1 STABIL TERHUBUNG!");
      global.mainBotSock = sock;

      if (stableTimer) clearTimeout(stableTimer);
      stableTimer = setTimeout(() => { reconnectAttempts = 0; }, STABLE_AFTER_MS);

      if (!hasReconnectedJadibotsOnce) {
        hasReconnectedJadibotsOnce = true;
        reconnectActiveJadibots(sock).catch(err => {
          console.error('[STARTUP] Gagal auto-reconnect jadibot:', err.message);
        });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    let db = readDB();
    
    if (!db.global) db.global = {
      antispam: false, klaim_pasangan: {}, pending_acc: {}, redeem_codes: {},
      owner_utama: null, donatur: {}, acc_group: "", last_uid: 100000,
      whitelist_karakter: [], muted_groups: {}, reports: {}, lid_map: {}
    };
    if (!db.global.lid_map) db.global.lid_map = {};

    let rawSender = msg.key.participant || from;
    let rawSenderAlt = msg.key.participant 
      ? (msg.key.participantPn || msg.key.participantAlt) 
      : (msg.key.senderPn || msg.key.remoteJidAlt);
    let sender = resolveIdentity(rawSender, db, rawSenderAlt);

    let text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";

    if (!db.users[sender]) {
      db.global.last_uid = (db.global.last_uid || 100000) + 1;
      db.users[sender] = { uid: db.global.last_uid };
    }
    const u = db.users[sender];
    if (!u.uid) { db.global.last_uid = (db.global.last_uid || 100000) + 1; u.uid = db.global.last_uid; }
    if (!u.name) u.name = msg.pushName || "Player";
    if (u.uang === undefined) u.uang = 5000n;
    if (u.level === undefined) u.level = 1n;
    if (u.xp === undefined) u.xp = 0n;
    if (!u.role) u.role = 'player';
    if (!u.status_hubungan) u.status_hubungan = 'lajang';
    if (u.point_asmara === undefined) u.point_asmara = 0;
    if (!u.status_profil) u.status_profil = 'Saya menggunakan RyouMada';
    if (!u.location) u.location = 'Belum diatur';
    if (!u.badges) u.badges = ["👾RyouMada First Generation👾"];
    if (!u.active_badge) u.active_badge = "👾RyouMada First Generation👾";
    if (!u.cd) u.cd = {};
    if (!u.anak) u.anak = [];
    if (!u.invest) u.invest = {};
    if (!u.blacklist_karakter) u.blacklist_karakter = [];
    if (!u.distrik) u.distrik = 'Awal';
    if (!u.gender) u.gender = 'Belum diatur';
    if (u.exp_multiplier === undefined) u.exp_multiplier = 1;
    if (u.exp_buff_until === undefined) u.exp_buff_until = 0;
    if (u.banned_until === undefined) u.banned_until = 0;
    if (!u.joined_at) u.joined_at = Date.now();
    if (!u.kehamilan) u.kehamilan = { status: false, waktu_mulai: 0 };
    if (u.afk_time === undefined) u.afk_time = 0;
    if (u.energi === undefined) u.energi = 100;
    if (!u.inventory) u.inventory = {};
    if (u.hutang === undefined) u.hutang = 0n;
    if (!u.pinjol) u.pinjol = { amount: 0n, due_time: 0 };
    if (!u.fishing_gear) u.fishing_gear = { active_bait: null, bait_uses: 0, bait_max: 0, active_rod: null, rod_uses: 0, rod_max: 0 };

    let today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (u.isPremium === undefined) u.isPremium = false;
    if (u.last_reset !== today) { if (!u.isPremium) u.limit = 50; u.last_reset = today; }
    if (u.isPremium) u.limit = 'UNLIMITED';

    if (u.exp_buff_until > 0 && Date.now() > u.exp_buff_until) {
      u.exp_multiplier = 1;
      u.exp_buff_until = 0;
    }

    u.xp += 5n * BigInt(u.exp_multiplier);
    let { level: newLevel, xpReq, isLevelUp } = calculateLevelUp(u.xp, u.level);
    u.level = newLevel;

    if (isLevelUp) {
      await sock.sendMessage(from, { text: `🎉 *LEVEL UP!*\nSelamat ${u.name}, kamu berhasil naik ke *Level ${u.level}!*\n🌟 XP Kamu: ${formatMoney(u.xp)}/${formatMoney(xpReq)}` });
    }

    if (u.afk_time > 0) {
      let afkDuration = Date.now() - u.afk_time;
      await sock.sendMessage(from, {
        text: `👋 *SELAMAT DATANG KEMBALI*\n\n@${sender.split('@')[0]} telah kembali dari AFK.\n⏱️ *Durasi AFK:* ${getAFKString(afkDuration)}`,
        mentions: [rawSender]
      });
      u.afk_time = 0;
      u.afk_reason = '';
      saveDB(db);
    }

    let isGameAnswered = false;
    if (global.games[from]) {
      let game = global.games[from];
      let userAnswer = text.trim().toLowerCase();
      if (game.type === 'ryou100') {
        if (game.answers.includes(userAnswer) && !game.answered.includes(userAnswer)) {
          game.answered.push(userAnswer);
          if (!game.players[sender]) game.players[sender] = 0;
          game.players[sender] += 1;
          let sisa = game.answers.length - game.answered.length;
          await sock.sendMessage(from, { text: `✅ *BENAR!* (@${sender.split('@')[0]})\nMenjawab: *${userAnswer.toUpperCase()}*\n_(Tersisa ${sisa})_`, mentions: [sender] });
          isGameAnswered = true;
          if (game.answered.length >= game.answers.length) {
            let highestScore = 0, winner = null;
            for (let p in game.players) { if (game.players[p] > highestScore) { highestScore = game.players[p]; winner = p; } }
            if (winner) {
              if (!db.users[winner]) db.users[winner] = {};
              db.users[winner].uang = (db.users[winner].uang || 0n) + BigInt(game.rewardUang);
              db.users[winner].xp = (db.users[winner].xp || 0n) + BigInt(game.rewardXp);
              saveDB(db);
              await sock.sendMessage(from, { text: `🎊 *RYOU 100 SELESAI!*\n🏆 *Juara:* @${winner.split('@')[0]}\n🎁 *Hadiah:* Rp ${formatMoney(game.rewardUang)} & ${game.rewardXp} XP`, mentions: [winner] });
            }
            delete global.games[from];
          }
        }
      } else {
        let isCorrect = false;
        if (Array.isArray(game.answer)) { if (game.answer.some(ans => ans.toLowerCase() === userAnswer)) isCorrect = true; }
        else if (game.answer.toLowerCase() === userAnswer) isCorrect = true;

        if (isCorrect) {
          u.uang += BigInt(game.rewardUang);
          u.xp += BigInt(game.rewardXp);
          saveDB(db);
          await sock.sendMessage(from, { text: `🎉 *JAWABAN BENAR!* (@${sender.split('@')[0]})\n🎁 Rp ${formatMoney(game.rewardUang)} & ${game.rewardXp} XP`, mentions: [sender] });
          delete global.games[from];
          isGameAnswered = true;
        }
      }
    }

    saveDB(db);
    if (isGameAnswered) return;

    let isReplyCmd = false, cmd = '', args = [], prefix = '.';
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedText = quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text || "";

    if ((quotedText.includes("Balas dengan angka") || quotedText.includes("Balas pesan ini dengan angka")) && /^[0-9]+$/.test(text.trim())) {
      const userReply = text.trim();
      isReplyCmd = true;
      if (quotedText.includes("PANEL INTERAKSI")) {
        if (userReply === '1') cmd = 'beriuang';
        else if (userReply === '2') cmd = 'act';
        else if (userReply === '3') cmd = 'makan';
      } else if (quotedText.includes("INTERAKSI ACAK")) {
        if (u.act_session && u.act_session[userReply]) cmd = u.act_session[userReply];
        else return sock.sendMessage(from, { text: "❌ Pilihan kadaluwarsa." });
      }
    }

    if (!isReplyCmd) {
      const isCmd = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.\/©^]/.test(text);
      if (!isCmd) return;

      prefix = text.charAt(0);
      args = text.slice(1).trim().split(/\s+/);
      let rawCmd = args.shift().toLowerCase();
      const aliases = {
        'ps': 'pasangan', 'inv': 'investasi', 'm': 'uang', 'p': 'ping',
        'k': 'kerja', 's': 'stiker', 'ikan': 'koleksi', 'buy': 'beli',
        'sell': 'jual', 'give': 'tfsaham'
      };
      cmd = aliases[rawCmd] || rawCmd;
    }

    if (cmd === 'rvo' || cmd === 'readviewonce') {
      if (!quotedMsg) return sock.sendMessage(from, { text: `❌ Balas pesan View Once dengan ${prefix}rvo` });
    }

    if (db.global.antispam && cmd) {
      if (db.global.owner_utama !== sender) {
        if (!global.spamTracker[sender]) {
          global.spamTracker[sender] = { count: 1, firstCmdTime: Date.now() };
        } else {
          let nowTime = Date.now();
          if (nowTime - global.spamTracker[sender].firstCmdTime <= 20000) {
            global.spamTracker[sender].count += 1;
            if (global.spamTracker[sender].count >= 4) {
              u.banned_until = nowTime + 1800000;
              u.banned_reason = "Spam";
              saveDB(db);
              delete global.spamTracker[sender];
              await sock.sendMessage(from, { text: `🚨 *SPAM DETECTED* 🚨\n🔨 *BLOKIR 30 MENIT*` });
              return;
            }
          } else { global.spamTracker[sender] = { count: 1, firstCmdTime: nowTime }; }
        }
      }
    }

    if (u.banned_until > Date.now()) {
      let timeLeft = u.banned_until - Date.now();
      await sock.sendMessage(from, { text: `🔨 *A K U N  D I B L O K I R*\n⏱️ Sisa: ${getAFKString(timeLeft)}\n📝 Alasan: ${u.banned_reason || "-"}` });
      return;
    } else if (u.banned_until > 0 && u.banned_until <= Date.now()) {
      u.banned_until = 0;
      u.banned_reason = "";
      saveDB(db);
    }

    const isOwnerUtama = (db.global.owner_utama === sender);
    const isOwner = u.role === 'owner' || u.role === 'manajer owner' || isOwnerUtama;
    const isAdmin = u.role === 'admin bot' || isOwner;

    if (cmd && !from.endsWith('@g.us') && !isOwnerUtama) {
      if (!PRIVATE_ALLOWED_CMDS.has(cmd)) return;
    }

    if (from.endsWith('@g.us') && db.global.muted_groups && db.global.muted_groups[from]) {
      if (!isAdmin && !isOwner) return;
    }

    if (cmd && commandMap.has(cmd) && from.endsWith('@g.us')) {
      let hasJadibot = false;
      if (global.activeJadibots) {
        for (const s of Object.values(global.activeJadibots)) {
          if (s && s.user?.id) { hasJadibot = true; break; }
        }
      }

      if (hasJadibot) {
        if (!global.messageClaim) global.messageClaim = {};
        if (!global.turnIndicator) global.turnIndicator = {};
        if (global.turnIndicator[from] === undefined) global.turnIndicator[from] = 'main';

        const msgId = msg.key.id;
        if (global.messageClaim[msgId]) return;

        if (global.turnIndicator[from] === 'main') {
          global.messageClaim[msgId] = 'main';
          global.turnIndicator[from] = 'jadibot'; 
          setTimeout(() => { delete global.messageClaim[msgId]; }, 60000);
        } else {
          return; 
        }
      }
    }

    if (cmd && !isOwner && !u.isPremium) {
      if (u.limit <= 0) {
        await sock.sendMessage(from, { text: `❌ Limit command harian kamu sudah habis! Beli limit di .shop atau upgrade ke Premium.` });
        return;
      }
      u.limit -= 1;
      saveDB(db);
    }

    let hasReplied = false;
    const sockProxy = {
      ...sock,
      sendMessage: async (jid, content, options = {}) => {
        if (!options.quoted && jid === from && !hasReplied) {
          options.quoted = msg;
          hasReplied = true;
        }
        return sock.sendMessage(jid, content, options);
      }
    };

    if (cmd && commandMap.has(cmd)) {
      const entry = commandMap.get(cmd);
      try {
        const config = { prefix, isOwner, isAdmin, isOwnerUtama };
        await entry.handler(sockProxy, msg, from, sender, cmd, args, u, db, config);
      } catch (err) {
        console.error(`[PLUGIN ERROR] ${entry.plugin}/${cmd}:`, err);
        await sock.sendMessage(from, { text: `❌ Terjadi kesalahan sistem: ${err.message}` });
      }
    }
  });
}

startBot().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
