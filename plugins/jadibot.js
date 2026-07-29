// =========================================================
// PLUGIN: JADIBOT - RyoMada V.3.1 Multi-Bot System
// VERSI RINGAN — Dioptimasi untuk spesifikasi rendah
//
// Semua logika "menyalakan/menyambungkan ulang sebuah sesi jadibot" ada di
// SATU fungsi (startJadibotSession) yang dipakai baik oleh persetujuan
// .jadibotacc maupun auto-reconnect saat bot utama baru nyala
// (reconnectActiveJadibots). Sebelumnya ini 2 salinan terpisah — риsiko
// perbaikan cuma kena di satu tempat dan lupa di tempat lain sudah
// terbukti terjadi, jadi sekarang disatukan.
// =========================================================
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import { readDB, saveDB } from '../database.js';
import { resolveIdentity, waTagNamed } from '../identity.js';

// =========================================================
// SHARED GLOBAL STATE (satu proses, tanpa overhead)
// =========================================================
if (!global.activeJadibots) global.activeJadibots = {};
if (!global.lastGroupResponse) global.lastGroupResponse = {};
if (!global.messageClaim) global.messageClaim = {};
if (!global.turnIndicator) global.turnIndicator = {};
// Status reconnect per nomor -- { attempts, cancelled, timer }. Dipakai supaya
// .killjadibot bisa BENAR-BENAR membatalkan reconnect yang sudah terjadwal,
// dan supaya retry ada batasnya (tidak selamanya tiap 3 detik).
if (!global.jadibotReconnect) global.jadibotReconnect = {};

// Logger super ringan: disabled total
const noLogger = pino({ level: 'fatal', enabled: false });

// Maksimal jadibot aktif bersamaan.
const MAX_JADIBOT = 5;

// Retry minta pairing code (percobaan pertama saat device belum pernah
// ter-pairing sama sekali) — beda dengan retry RECONNECT di bawah.
const PAIR_RETRY_DELAYS = [3000, 4500, 6000];

// Retry RECONNECT setelah sempat tersambung lalu putus (bukan logout).
// Pakai backoff bertahap dan ADA BATAS MAKSIMAL — sebelumnya retry setiap
// 3 detik TANPA BATAS SELAMANYA, yang di host resource kecil bisa membuat
// satu nomor bermasalah menyedot CPU/network terus-menerus tanpa henti.
const RECONNECT_BASE_DELAY = 3000;   // 3 detik
const RECONNECT_MAX_DELAY = 60000;   // naik bertahap, dibatasi maks 60 detik
const RECONNECT_MAX_ATTEMPTS = 8;    // ~±4.5 menit total sebelum menyerah

function nextReconnectDelay(attempt) {
  return Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempt - 1), RECONNECT_MAX_DELAY);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// =========================================================
// Normalisasi nomor WA -- WhatsApp/Baileys WAJIB format internasional
// TANPA angka 0 di depan (mis. 6281234567890, BUKAN 081234567890).
//
// Ini penyebab paling umum "kode pairing terkirim tapi tidak ada
// notifikasi apapun yang muncul di HP tujuan": kalau user mengetik nomor
// dalam format lokal Indonesia yang biasa dipakai sehari-hari (diawali
// 0), requestPairingCode() diminta untuk STRING YANG SALAH (081234567890
// alih-alih 6281234567890). WhatsApp tidak selalu menolak permintaan itu
// dengan error yang jelas -- kadang tetap mengembalikan SEBUAH kode,
// tapi kode itu tidak pernah terhubung ke perangkat manapun karena
// "081234567890" bukan representasi valid dari akun manapun di sisi
// mereka. Makanya kode "terkirim" (tidak error) tapi HP tujuan tidak
// pernah dapat notifikasi apa pun.
// =========================================================
function normalizeWaNumber(raw) {
  let n = (raw || '').replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  return n;
}

// Alias command (satu objek, reuse)
const CMD_ALIASES = {
  'ps':'pasangan','inv':'investasi','m':'uang','p':'ping',
  'k':'kerja','s':'stiker','ikan':'koleksi','buy':'beli',
  'sell':'jual','give':'tfsaham'
};

// Command yang hanya dihandle main bot (skip di jadibot)
const OWNER_CMDS = new Set([
  'jadibot','jadibotacc','jadibotreject','killjadibot','jadibotlist','listjadibot',
  'claimowner','resetglobal','fixekonomi','setaccgroup','antispam',
  'ev','>','=>','exec','syncid','buatredeem'
]);

const ADMIN_CMDS = new Set([
  'menuadmin','setdata','add','delrole','delbadge','adddonate','infostaff',
  'mute','unmute','addprem','delprem','ban','unban',
  'whitelistchar','delwhitelistchar','cekwhitelistchar','cekblacklist',
  'delblacklist','acc','tolak'
]);

const CMD_REGEX = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.\/©^]/;

// Command yang tetap boleh dipakai NON-owner_utama lewat private chat (DM).
// Sama seperti daftar di index.js (main bot) -- dijaga konsisten manual
// karena jadibot child punya message handler terpisah dari main bot.
const PRIVATE_ALLOWED_CMDS = new Set([
  'jadibot', 'jadibotacc', 'jadibotreject', 'killjadibot', 'jadibotlist', 'listjadibot',
  'report', 'saran', 'claimowner', 'acc', 'tolak'
]);

// =========================================================
// Cache versi Baileys — sebelumnya fetchLatestBaileysVersion() dipanggil
// (network request) di SETIAP percobaan reconnect. Kalau satu sesi retry
// terus-menerus, itu jadi network request tanpa henti juga. Sekarang cukup
// diambil sekali lalu dipakai ulang beberapa jam, dan tetap ada fallback
// version tetap kalau fetch-nya sendiri gagal (mis. lagi tidak ada internet).
// =========================================================
let cachedVersion = null;
let cachedVersionAt = 0;
const VERSION_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 jam

async function getCachedBaileysVersion() {
  const now = Date.now();
  if (cachedVersion && (now - cachedVersionAt) < VERSION_CACHE_TTL) return cachedVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    cachedVersion = version;
    cachedVersionAt = now;
  } catch (e) {
    if (!cachedVersion) cachedVersion = [6, 7, 9];
  }
  return cachedVersion;
}

// =========================================================
// Registry status reconnect per nomor
// =========================================================
function getReconnectState(nomor) {
  if (!global.jadibotReconnect[nomor]) {
    global.jadibotReconnect[nomor] = { attempts: 0, cancelled: false, timer: null };
  }
  return global.jadibotReconnect[nomor];
}
function resetReconnectState(nomor) {
  const old = global.jadibotReconnect[nomor];
  if (old?.timer) clearTimeout(old.timer);
  global.jadibotReconnect[nomor] = { attempts: 0, cancelled: false, timer: null };
}
// Dipanggil oleh .killjadibot (dan saat logout) supaya reconnect yang SUDAH
// TERJADWAL tidak ikut menghidupkan lagi sesi yang baru saja dimatikan.
function cancelReconnect(nomor) {
  const st = global.jadibotReconnect[nomor];
  if (st) {
    st.cancelled = true;
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  }
}
// Jadwalkan satu percobaan reconnect dengan backoff + batas maksimal.
// Dipakai dari 2 tempat (connection.update close, dan catch setup gagal) --
// disatukan di sini supaya keduanya tidak bisa saling dobel menjadwalkan.
function scheduleReconnect(nomor, attemptFn, onGiveUp) {
  const reconn = getReconnectState(nomor);
  if (reconn.cancelled) return;
  if (reconn.timer) return; // sudah ada percobaan terjadwal, jangan dobel
  if (reconn.attempts >= RECONNECT_MAX_ATTEMPTS) {
    onGiveUp();
    return;
  }
  reconn.attempts += 1;
  const delay = nextReconnectDelay(reconn.attempts);
  console.log(`[JADIBOT ${nomor}] Reconnect percobaan ${reconn.attempts}/${RECONNECT_MAX_ATTEMPTS} dalam ${Math.round(delay / 1000)}s...`);
  reconn.timer = setTimeout(() => {
    reconn.timer = null;
    if (!reconn.cancelled) attemptFn();
  }, delay);
}

// =========================================================
// Helper: bersihkan socket + (opsional) folder sesi jadibot
// =========================================================
function cleanupJadibotSession(jadibotSock, nomor, sessionDir, removeFolder) {
  try {
    if (jadibotSock) {
      jadibotSock.ev.removeAllListeners('messages.upsert');
      jadibotSock.ev.removeAllListeners('connection.update');
      jadibotSock.ev.removeAllListeners('creds.update');
      jadibotSock.end(undefined);
    }
  } catch (e) { /* socket mungkin sudah setengah mati, abaikan */ }
  delete global.activeJadibots[nomor];
  if (removeFolder) {
    try { fs.rmSync(`./${sessionDir}`, { recursive: true, force: true }); } catch (e) {}
  }
}

// Bebaskan slot "active" di database untuk sebuah nomor jadibot, apapun
// alasan terputusnya.
function freeActiveSlot(nomor) {
  let dbr = readDB();
  if (!dbr.global?.jadibot?.active) return;
  let removedKey = null;
  for (let jid in dbr.global.jadibot.active) {
    if (dbr.global.jadibot.active[jid].number === nomor) { removedKey = jid; break; }
  }
  if (removedKey) {
    delete dbr.global.jadibot.active[removedKey];
    saveDB(dbr);
  }
}

// =========================================================
// startJadibotSession — satu-satunya tempat yang benar-benar membuat &
// mengelola koneksi Baileys untuk sebuah sesi jadibot (dipakai baik oleh
// .jadibotacc maupun reconnectActiveJadibots).
//
// params:
//   requester     JID player pemilik jadibot ini (WAJIB)
//   nomor         nomor WA yang di-jadibot-kan
//   sessionDir    folder auth_state untuk nomor ini
//   requesterName nama tampilan pemilik
//   sid           ID request (boleh kosong utk reconnect setelah restart)
//   notifyJids    array JID TAMBAHAN yang juga perlu dikirimi kode pairing
//                 (mis. chat tempat .jadibotacc dijalankan, & owner_utama)
// =========================================================
async function startJadibotSession(mainSock, params) {
  const { requester, nomor, sessionDir, requesterName, sid, notifyJids } = params;
  if (!requester || !nomor || !sessionDir) {
    console.error('[JADIBOT] startJadibotSession dipanggil dengan parameter tidak lengkap, dibatalkan.');
    return;
  }
  const reconn = getReconnectState(nomor);
  let hasRequestedPairing = false;

  const attemptConnect = async () => {
    let jadibotSock = null;
    try {
      // Bersihkan sisa sesi yang KELIHATANNYA "registered" tapi sebenarnya
      // tidak lengkap (mis. gagal di tengah proses pairing sebelumnya).
      // Ini penyebab paling umum kode pairing baru ditolak "invalid" oleh
      // WhatsApp -- kuncinya harus mulai dari folder sesi yang bersih.
      try {
        let credsRaw = fs.readFileSync(`./${sessionDir}/creds.json`, 'utf-8');
        let creds = JSON.parse(credsRaw);
        if (creds?.registered && !creds?.me?.id) {
          console.log(`[JADIBOT ${nomor}] Sesi lama tidak lengkap, membersihkan dulu...`);
          fs.rmSync(`./${sessionDir}`, { recursive: true, force: true });
        }
      } catch (e) { /* belum ada folder/creds sama sekali -> memang belum pernah, wajar */ }

      const version = await getCachedBaileysVersion();
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

      jadibotSock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, noLogger)
        },
        logger: noLogger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('RyouMada'),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        shouldSyncHistoryMessage: () => false,
        downloadHistory: false,
        defaultQueryTimeoutMs: undefined,
        getMessage: () => null
      });

      // -----------------------------------------------------------------
      // Minta pairing code (hanya percobaan PERTAMA sesi ini, tidak diulang
      // lagi di reconnect-reconnect berikutnya). Tunggu dulu beberapa detik
      // sebelum minta -- WebSocket belum tentu selesai handshake sesaat
      // setelah socket dibuat, itu penyebab umum "Connection Closed".
      // -----------------------------------------------------------------
      if (!jadibotSock.authState.creds.registered && !hasRequestedPairing) {
        hasRequestedPairing = true;
        let pairingCodeStr = null;
        for (let i = 0; i < PAIR_RETRY_DELAYS.length; i++) {
          await sleep(PAIR_RETRY_DELAYS[i]);
          if (jadibotSock.authState.creds.registered) break;
          try {
            pairingCodeStr = await jadibotSock.requestPairingCode(nomor);
            break;
          } catch (err) {
            console.error(`[JADIBOT] Pairing ${nomor} percobaan ${i + 1}/${PAIR_RETRY_DELAYS.length} gagal:`, err.message);
            if (i === PAIR_RETRY_DELAYS.length - 1) {
              cleanupJadibotSession(jadibotSock, nomor, sessionDir, true);
              await mainSock.sendMessage(requester, { text: `❌ Gagal pairing ${nomor} setelah beberapa kali percobaan: ${err.message}\n\n_Biasanya koneksi server sedang padat. Minta Owner ulangi .jadibot beberapa saat lagi._` }).catch(() => {});
              return;
            }
          }
        }

        if (pairingCodeStr) {
          const codeMsg = `🎟️ *KODE PAIRING JADIBOT* 🎟️\n\n📱 *Nomor:* ${nomor}\n🎟️ *Kode:* ${pairingCodeStr}\n\n_Buka WhatsApp > 3 titik > Perangkat Tertaut > Hubungkan Perangkat_\n_Masukkan kode di atas untuk menghubungkan bot. Kode berlaku sekitar 1 menit — buruan!_`;
          const targets = new Set([requester, ...(notifyJids || [])].filter(Boolean));
          for (const jid of targets) {
            await mainSock.sendMessage(jid, { text: codeMsg }).catch(() => {});
          }
        } else if (jadibotSock.authState.creds.registered) {
          await mainSock.sendMessage(requester, { text: `♻️ Nomor ${nomor} sudah pernah tertaut sebelumnya, menyambungkan ulang tanpa kode baru...` }).catch(() => {});
        }
      }

      jadibotSock.ev.on('creds.update', saveCreds);

      jadibotSock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          console.log(`[JADIBOT ${nomor}] Terputus (${isLoggedOut ? 'logout' : (statusCode || 'unknown')})`);
          try {
            jadibotSock.ev.removeAllListeners('messages.upsert');
            jadibotSock.ev.removeAllListeners('connection.update');
            jadibotSock.ev.removeAllListeners('creds.update');
          } catch (e) {}
          delete global.activeJadibots[nomor];
          freeActiveSlot(nomor);

          if (isLoggedOut) {
            try { fs.rmSync(`./${sessionDir}`, { recursive: true, force: true }); } catch (e) {}
            cancelReconnect(nomor);
            return;
          }

          scheduleReconnect(nomor, attemptConnect, () => {
            console.log(`[JADIBOT ${nomor}] Menyerah setelah ${RECONNECT_MAX_ATTEMPTS}x percobaan reconnect berturut-turut.`);
            mainSock.sendMessage(requester, { text: `⚠️ Jadibot ${nomor} berkali-kali gagal tersambung ulang dan berhenti mencoba otomatis (supaya tidak membebani server terus-menerus). Minta Owner jalankan .jadibot lagi kalau masih perlu.` }).catch(() => {});
          });
        } else if (connection === 'open') {
          console.log(`✅ JADIBOT ${nomor} TERHUBUNG!`);
          resetReconnectState(nomor);
          global.activeJadibots[nomor] = jadibotSock;
          let dbr2 = readDB();
          if (!dbr2.global.jadibot) dbr2.global.jadibot = { requests: {}, active: {} };
          if (!dbr2.global.jadibot.active) dbr2.global.jadibot.active = {};
          if (sid && dbr2.global.jadibot.requests?.[sid]) dbr2.global.jadibot.requests[sid].status = 'active';
          dbr2.global.jadibot.active[requester] = {
            sessionId: sid || dbr2.global.jadibot.active[requester]?.sessionId || null,
            number: nomor,
            sessionDir,
            started_at: Date.now(),
            requester,
            requesterName
          };
          saveDB(dbr2);
          mainSock.sendMessage(requester, { text: `✅ *JADIBOT ${nomor} BERHASIL TERHUBUNG!*\n\nSekarang bot sudah aktif dan siap merespon perintah.` }).catch(() => {});
        }
      });

      // ===== MESSAGE HANDLER SUPER RINGAN =====
      jadibotSock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const rawSender = msg.key.participant || from;
        const rawSenderAlt = msg.key.participant
          ? (msg.key.participantPn || msg.key.participantAlt)
          : (msg.key.senderPn || msg.key.remoteJidAlt);

        const text = msg.message.conversation ||
                     msg.message.extendedTextMessage?.text ||
                     msg.message.imageMessage?.caption ||
                     msg.message.videoMessage?.caption ||
                     "";
        if (!CMD_REGEX.test(text)) return;

        const prefix = text.charAt(0);
        const args = text.slice(1).trim().split(/\s+/);
        let rawCmd = args.shift().toLowerCase();
        const cmd = CMD_ALIASES[rawCmd] || rawCmd;

        // Anti-duplicate + round-robin GROUP
        if (from.endsWith('@g.us')) {
          const now = Date.now();
          const last = global.lastGroupResponse[from] || 0;
          if (now - last < 800) return;
          global.lastGroupResponse[from] = now;

          if (global.turnIndicator[from] === undefined) global.turnIndicator[from] = 'main';
          const msgId = msg.key.id;
          if (global.messageClaim[msgId]) return;

          if (global.turnIndicator[from] === 'jadibot') {
            global.messageClaim[msgId] = 'jadibot';
            global.turnIndicator[from] = 'main';
            setTimeout(() => { delete global.messageClaim[msgId]; }, 60000);
          } else {
            return;
          }
        }

        if (!cmd || !global.jadibotCommandMap?.has(cmd)) return;

        try {
          const dbr = readDB();
          if (!dbr.global) return;

          const sender = resolveIdentity(rawSender, dbr, rawSenderAlt);

          if (OWNER_CMDS.has(cmd)) return;

          if (ADMIN_CMDS.has(cmd)) {
            const isOU = dbr.global.owner_utama === sender;
            const uRole = dbr.users[sender]?.role || '';
            if (!isOU && uRole !== 'owner' && uRole !== 'manajer owner') return;
          }

          if (!dbr.users[sender]) dbr.users[sender] = {};
          const u = dbr.users[sender];
          if (!u.name) u.name = msg.pushName || 'Player';

          const isOwnerUtama = dbr.global.owner_utama === sender;
          const role = u.role || 'player';
          const isOwner = isOwnerUtama || role === 'owner' || role === 'manajer owner';
          const isAdmin = role === 'admin bot' || isOwner;

          if (from.endsWith('@g.us') && dbr.global.muted_groups?.[from] && !isAdmin && !isOwner) return;

          // Blokir private chat untuk non-Owner Utama
          if (!from.endsWith('@g.us') && !isOwnerUtama) {
            if (!PRIVATE_ALLOWED_CMDS.has(cmd)) return;
          }

          const entry = global.jadibotCommandMap.get(cmd);
          const config = { prefix, isOwner, isAdmin, isOwnerUtama };

          let hasReplied = false;
          const sockProxy = {
            sendMessage: async (jid, content, opts = {}) => {
              if (!opts.quoted && jid === from && !hasReplied) {
                opts.quoted = msg;
                hasReplied = true;
              }
              return jadibotSock.sendMessage(jid, content, opts);
            },
            ev: jadibotSock.ev,
            user: jadibotSock.user,
            authState: jadibotSock.authState,
            ws: jadibotSock.ws
          };

          await entry.handler(sockProxy, msg, from, sender, cmd, args, u, dbr, config);
        } catch (err) {
          console.error(`[JADIBOT] ${cmd}:`, err.message);
        }
      });

    } catch (err) {
      console.error(`[JADIBOT ${nomor}] Gagal setup:`, err.message);
      if (jadibotSock) cleanupJadibotSession(jadibotSock, nomor, sessionDir, false);
      scheduleReconnect(nomor, attemptConnect, () => {
        freeActiveSlot(nomor);
        mainSock.sendMessage(requester, { text: `❌ Gagal memulai jadibot untuk ${nomor} setelah beberapa kali percobaan: ${err.message}. Minta Owner mengulang prosesnya dengan .jadibot.` }).catch(() => {});
      });
    }
  };

  await attemptConnect();
}

export default {
  name: 'jadibot',
  version: '3.1.2-light',
  commands: ['jadibot', 'jadibotacc', 'jadibotreject', 'killjadibot', 'jadibotlist', 'listjadibot'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const { prefix, isOwner, isAdmin, isOwnerUtama } = config;

    // ===== .jadibot =====
    if (cmd === 'jadibot') {
      if (!db.global.owner_utama) {
        await sock.sendMessage(from, { text: `❌ Owner Utama belum ditetapkan.` });
        return true;
      }
      if (!db.global.jadibot) db.global.jadibot = { requests: {}, active: {} };

      for (let jid in db.global.jadibot.active) {
        if (db.global.jadibot.active[jid].requester === sender) {
          await sock.sendMessage(from, { text: `❌ Kamu sudah punya jadibot aktif!` });
          return true;
        }
      }
      for (let sidCheck in db.global.jadibot.requests) {
        if (db.global.jadibot.requests[sidCheck].requester === sender && db.global.jadibot.requests[sidCheck].status === 'pending') {
          await sock.sendMessage(from, { text: `❌ Masih ada pengajuan pending! ID: *${sidCheck}*` });
          return true;
        }
      }

      if (Object.keys(db.global.jadibot.active).length >= MAX_JADIBOT) {
        await sock.sendMessage(from, { text: `❌ Maksimal ${MAX_JADIBOT} jadibot sudah tercapai.` });
        return true;
      }

      let nomor = normalizeWaNumber(args[0]);
      if (!nomor || nomor.length < 10 || nomor.length > 15) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}jadibot [nomor]\nContoh: ${prefix}jadibot 6281234567890\n\n_Gunakan format internasional (diawali kode negara, mis. 62 utk Indonesia) -- BUKAN diawali angka 0._` });
        return true;
      }

      let sessionId = Math.random().toString(36).substring(2, 8).toUpperCase();
      db.global.jadibot.requests[sessionId] = {
        requester: sender,
        requesterName: u.name || 'Player',
        number: nomor,
        status: 'pending',
        created_at: Date.now()
      };
      saveDB(db);

      await sock.sendMessage(db.global.owner_utama, {
        text: `📩 *JADIBOT REQUEST*\n👤 ${u.name} (@${sender.split('@')[0]})\n📱 ${nomor}\n🆔 ${sessionId}\n\n➡️ ${prefix}jadibotacc ${sessionId} | ${prefix}jadibotreject ${sessionId}`,
        mentions: [sender]
      });

      await sock.sendMessage(from, {
        text: `✅ *Permintaan terkirim!*\n📱 ${nomor}\n🆔 ${sessionId}\n⏳ Menunggu persetujuan Owner.`
      });
      return true;
    }

    // ===== .jadibotacc =====
    if (cmd === 'jadibotacc') {
      if (!isOwner) {
        await sock.sendMessage(from, { text: `❌ Hanya Owner.` });
        return true;
      }
      if (!db.global.jadibot) db.global.jadibot = { requests: {}, active: {} };

      let sid = args[0]?.toUpperCase();
      let req = sid ? db.global.jadibot.requests?.[sid] : null;
      if (!req) {
        let pending = Object.entries(db.global.jadibot.requests || {}).filter(([_, r]) => r.status === 'pending');
        let txt = `❌ ID tidak valid.\n\n📋 *Pending:*`;
        for (let [id, r] of pending) txt += `\n🆔 ${id} — ${r.requesterName} (${r.number})`;
        if (pending.length === 0) txt += `\n_(Tidak ada)_`;
        txt += `\n\nGunakan: ${prefix}jadibotacc [ID]`;
        await sock.sendMessage(from, { text: txt });
        return true;
      }
      if (req.status !== 'pending') {
        await sock.sendMessage(from, { text: `❌ Request ini sudah *${req.status}*.` });
        return true;
      }

      const requester = req.requester;
      const requesterName = req.requesterName || 'Player';
      if (!requester) {
        await sock.sendMessage(from, { text: `❌ Data request rusak (requester kosong). Minta player mengulang ${prefix}jadibot.` });
        return true;
      }

      req.status = 'approved';
      req.approved_at = Date.now();
      saveDB(db);

      await sock.sendMessage(from, { text: `⏳ Memulai jadibot ${req.number}...` });

      let nomor = req.number;
      const sessionDir = `jadibot_${nomor}`;
      resetReconnectState(nomor); // mulai fresh, bukan lanjutan hitungan retry lama

      req.status = 'pending_pairing';
      saveDB(db);
      await sock.sendMessage(from, {
        text: `✅ *JADIBOT DIAKTIFKAN!*\n\n📱 *Nomor:* ${nomor}\n🆔 *ID:* ${sid}\n👤 *Pengaju:* ${requesterName}\n\n_Menyiapkan koneksi & kode pairing, mohon tunggu..._`
      });

      let ownerJid = db.global?.owner_utama;
      let notifyJids = new Set();
      if (from !== requester) notifyJids.add(from);
      if (ownerJid && ownerJid !== requester) notifyJids.add(ownerJid);

      // Tidak perlu ditunggu (await) sampai selesai total -- .jadibotacc cukup
      // memastikan proses SUDAH DIMULAI, sisanya (kode pairing, konfirmasi
      // terhubung) menyusul lewat pesan terpisah begitu setiap tahap selesai.
      startJadibotSession(sock, { requester, nomor, sessionDir, requesterName, sid, notifyJids: [...notifyJids] })
        .catch(err => console.error(`[JADIBOT] ${nomor} gagal total:`, err.message));

      return true;
    }

    // ===== .jadibotreject =====
    if (cmd === 'jadibotreject') {
      if (!isOwner) { await sock.sendMessage(from, { text: `❌ Hanya Owner.` }); return true; }
      let sid = args[0]?.toUpperCase();
      let req = sid ? db.global.jadibot?.requests?.[sid] : null;
      if (!req || req.status !== 'pending') {
        await sock.sendMessage(from, { text: `❌ ID tidak valid.` });
        return true;
      }
      let alasan = args.slice(1).join(' ') || 'Tidak ada alasan';
      req.status = 'rejected';
      req.reason = alasan;
      saveDB(db);
      await sock.sendMessage(req.requester, { text: `❌ *JADIBOT DITOLAK*\n📱 ${req.number}\n📝 ${alasan}` });
      await sock.sendMessage(from, { text: `❌ Ditolak.\n👤 ${req.requesterName}\n📝 ${alasan}` });
      return true;
    }

    // ===== .killjadibot =====
    if (cmd === 'killjadibot') {
      if (!isOwner) { await sock.sendMessage(from, { text: `❌ Hanya Owner.` }); return true; }
      if (!db.global.jadibot?.active || Object.keys(db.global.jadibot.active).length === 0) {
        await sock.sendMessage(from, { text: `⚠️ Tidak ada jadibot aktif.` });
        return true;
      }
      let target = args.join(' ').toLowerCase();
      if (!target) {
        let txt = `📋 *JADIBOT AKTIF:*`;
        for (let [jid, info] of Object.entries(db.global.jadibot.active)) {
          txt += `\n📱 ${info.number} — ${info.requesterName} (${info.sessionId})`;
        }
        txt += `\n\nGunakan: ${prefix}killjadibot [nomor/ID]`;
        await sock.sendMessage(from, { text: txt });
        return true;
      }
      // Kalau target berupa nomor dalam format lokal (0812...), samakan dulu
      // ke format internasional sebelum dibandingkan -- info.number tersimpan
      // dalam format 62xxx, jadi tanpa ini .killjadibot 0812... tidak akan
      // pernah cocok dgn jadibot yg didaftarkan lewat .jadibot 62812....
      let targetAsNumber = normalizeWaNumber(target);

      let foundKey = null, foundInfo = null;
      for (let [jid, info] of Object.entries(db.global.jadibot.active)) {
        if (info.number === target || info.number === targetAsNumber || info.sessionId?.toLowerCase() === target) {
          foundKey = jid; foundInfo = info; break;
        }
      }
      if (!foundInfo) {
        await sock.sendMessage(from, { text: `❌ Tidak ditemukan: ${target}` });
        return true;
      }

      let nomor = foundInfo.number;
      let sessionDir = foundInfo.sessionDir || `jadibot_${nomor}`;

      // WAJIB duluan: batalkan reconnect yang mungkin sudah terjadwal, kalau
      // tidak, jadibot yang baru saja "dimatikan" bisa nyambung lagi sendiri
      // beberapa detik kemudian.
      cancelReconnect(nomor);

      if (global.activeJadibots[nomor]) {
        cleanupJadibotSession(global.activeJadibots[nomor], nomor, sessionDir, true);
      } else {
        try { if (fs.existsSync(`./${sessionDir}`)) fs.rmSync(`./${sessionDir}`, { recursive: true, force: true }); } catch (e) {}
      }

      delete db.global.jadibot.active[foundKey];
      saveDB(db);

      await sock.sendMessage(from, { text: `🛑 *JADIBOT DIHENTIKAN*\n📱 ${nomor}\n👤 ${foundInfo.requesterName}` });
      await sock.sendMessage(foundInfo.requester, { text: `🛑 Jadibot ${nomor} dihentikan oleh Owner.` });
      return true;
    }

    // ===== .jadibotlist / .listjadibot =====
    if (cmd === 'jadibotlist' || cmd === 'listjadibot') {
      if (!isOwner && !isAdmin) {
        await sock.sendMessage(from, { text: `❌ Hanya Staff.` });
        return true;
      }
      if (!db.global.jadibot) db.global.jadibot = { requests: {}, active: {} };

      let act = Object.entries(db.global.jadibot.active || {});
      let pend = Object.entries(db.global.jadibot.requests || {}).filter(([_, r]) => r.status === 'pending');

      let txt = `📊 *STATUS JADIBOT*\n\n🟢 *Aktif (${act.length}/${MAX_JADIBOT}):*\n`;
      for (let [_, info] of act) {
        let m = Math.floor((Date.now() - info.started_at) / 60000);
        txt += `  📱 ${info.number} (${m}m)\n`;
      }
      if (act.length === 0) txt += `  _(Tidak ada)_\n`;
      txt += `\n🟡 *Pending (${pend.length}):*\n`;
      for (let [id, r] of pend) txt += `  🆔 ${id} — ${r.requesterName} (${r.number})\n`;
      if (pend.length === 0) txt += `  _(Tidak ada)_`;

      await sock.sendMessage(from, { text: txt });
      return true;
    }

    return false;
  }
};

// =========================================================
// reconnectActiveJadibots — dipanggil sekali saat bot utama baru nyala,
// untuk menyambungkan ulang semua sesi jadibot yang sebelumnya aktif.
// Sekarang cuma pemanggil tipis ke startJadibotSession yang sama dengan
// yang dipakai .jadibotacc -- jadi perbaikan backoff/pembatalan di atas
// otomatis berlaku juga di sini, tidak perlu disalin ulang.
// =========================================================
export async function reconnectActiveJadibots(mainSock) {
  try {
    const dbr = readDB();
    if (!dbr.global?.jadibot?.active || Object.keys(dbr.global.jadibot.active).length === 0) {
      console.log('[JADIBOT] Tidak ada sesi aktif untuk direconnect.');
      return;
    }
    const activeEntries = Object.entries(dbr.global.jadibot.active);
    console.log(`[JADIBOT] Auto-reconnect ${activeEntries.length} sesi aktif...`);

    const reconnectPromises = activeEntries.map(([requester, info]) => {
      const nomor = info.number;
      const sessionDir = info.sessionDir || `jadibot_${nomor}`;
      const requesterName = info.requesterName || 'Player';

      if (global.activeJadibots[nomor]) {
        try {
          const oldSock = global.activeJadibots[nomor];
          oldSock.ev.removeAllListeners('messages.upsert');
          oldSock.ev.removeAllListeners('connection.update');
          oldSock.ev.removeAllListeners('creds.update');
          oldSock.end(undefined);
        } catch (e) {}
        delete global.activeJadibots[nomor];
      }
      resetReconnectState(nomor);

      return startJadibotSession(mainSock, {
        requester, nomor, sessionDir, requesterName,
        sid: info.sessionId || null,
        notifyJids: []
      }).catch(err => console.error(`[JADIBOT] Reconnect ${nomor} gagal:`, err.message));
    });

    await Promise.allSettled(reconnectPromises);
  } catch (err) {
    console.error('[JADIBOT] Error auto-reconnect:', err.message);
  }
}
