// =========================================================
// PLUGIN: JADIBOT - RyoMada V.3.1 Multi-Bot System
// VERSI RINGAN — Dioptimasi untuk spesifikasi rendah
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

// Logger super ringan: disabled total
const noLogger = pino({ level: 'fatal', enabled: false });

const MAX_JADIBOT = 5;
const PAIR_RETRY_DELAYS = [3000, 4500, 6000];

const CMD_ALIASES = {
  'ps':'pasangan','inv':'investasi','m':'uang','p':'ping',
  'k':'kerja','s':'stiker','ikan':'koleksi','buy':'beli',
  'sell':'jual','give':'tfsaham'
};

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

function cleanupJadibotSession(jadibotSock, nomor, sessionDir, removeFolder) {
  try {
    jadibotSock.ev.removeAllListeners('messages.upsert');
    jadibotSock.ev.removeAllListeners('connection.update');
    jadibotSock.ev.removeAllListeners('creds.update');
    jadibotSock.end(undefined);
  } catch (e) {}
  delete global.activeJadibots[nomor];
  if (removeFolder) {
    try { fs.rmSync(`./${sessionDir}`, { recursive: true, force: true }); } catch (e) {}
  }
}

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

export default {
  name: 'jadibot',
  version: '3.1.2-light',
  commands: ['jadibot', 'jadibotacc', 'jadibotreject', 'killjadibot', 'jadibotlist', 'listjadibot'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const { prefix, isOwner, isAdmin, isOwnerUtama } = config;

    // ===== .jadibot =====
    if (cmd === 'jadibot') {
      if (!db.global.owner_utama) {
        return sock.sendMessage(from, { text: `❌ Owner Utama belum ditetapkan.` });
      }
      if (!db.global.jadibot) db.global.jadibot = { requests: {}, active: {} };

      for (let jid in db.global.jadibot.active) {
        if (db.global.jadibot.active[jid].requester === sender) {
          return sock.sendMessage(from, { text: `❌ Kamu sudah punya jadibot aktif!` });
        }
      }
      for (let sid in db.global.jadibot.requests) {
        if (db.global.jadibot.requests[sid].requester === sender && db.global.jadibot.requests[sid].status === 'pending') {
          return sock.sendMessage(from, { text: `❌ Masih ada pengajuan pending! ID: *${sid}*` });
        }
      }

      if (Object.keys(db.global.jadibot.active).length >= MAX_JADIBOT) {
        return sock.sendMessage(from, { text: `❌ Maksimal ${MAX_JADIBOT} jadibot sudah tercapai.` });
      }

      let nomor = args[0]?.replace(/[^0-9]/g, '');
      if (!nomor || nomor.length < 10) {
        return sock.sendMessage(from, { text: `❌ Format: ${prefix}jadibot [nomor]\nContoh: ${prefix}jadibot 6281234567890` });
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
      if (!isOwner) return sock.sendMessage(from, { text: `❌ Hanya Owner.` });
      
      if (!db.global.jadibot) db.global.jadibot = { requests: {}, active: {} };

      let sid = args[0]?.toUpperCase();
      let req = sid ? db.global.jadibot.requests?.[sid] : null;
      if (!req) {
        let pending = Object.entries(db.global.jadibot.requests || {}).filter(([_, r]) => r.status === 'pending');
        let txt = `❌ ID tidak valid.\n\n📋 *Pending:*`;
        for (let [id, r] of pending) txt += `\n🆔 ${id} — ${r.requesterName} (${r.number})`;
        if (pending.length === 0) txt += `\n_(Tidak ada)_`;
        return sock.sendMessage(from, { text: txt + `\n\nGunakan: ${prefix}jadibotacc [ID]` });
      }
      if (req.status !== 'pending') return sock.sendMessage(from, { text: `❌ Request ini sudah *${req.status}*.` });

      const requester = req.requester;
      const requesterName = req.requesterName || 'Player';

      req.status = 'approved';
      req.approved_at = Date.now();
      saveDB(db);

      await sock.sendMessage(from, { text: `⏳ Memulai sistem jadibot ${req.number}...` });

      let nomor = req.number;
      const sessionDir = `jadibot_${nomor}`;
      let hasRequestedPairing = false; // Mengunci agar tidak spam request pairing
      let pairingCodeStr = null;

      // 🔥 PERBAIKAN: Dibungkus menjadi fungsi startSession agar bisa Auto-Reconnect saat kena Error 515
      const startSession = async () => {
        try {
          const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
          const { version } = await fetchLatestBaileysVersion();
          
          let jadibotSock = makeWASocket({
            version,
            auth: {
              creds: state.creds,
              keys: makeCacheableSignalKeyStore(state.keys, noLogger)
            },
            logger: noLogger,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false,
            // 🔥 PERBAIKAN: Wajib TRUE agar HP tidak stuck loading/Masuk... saat pairing
            markOnlineOnConnect: true, 
            generateHighQualityLinkPreview: false,
            shouldSyncHistoryMessage: () => false,
            downloadHistory: false,
            defaultQueryTimeoutMs: undefined,
            getMessage: () => null
          });

          // Meminta kode pairing HANYA JIKA belum terdaftar dan belum diminta sebelumnya
          if (!jadibotSock.authState.creds.registered && !hasRequestedPairing) {
            hasRequestedPairing = true;
            for (let i = 0; i < PAIR_RETRY_DELAYS.length; i++) {
              await new Promise(r => setTimeout(r, PAIR_RETRY_DELAYS[i]));
              if (jadibotSock.authState.creds.registered) break;
              try {
                pairingCodeStr = await jadibotSock.requestPairingCode(nomor);
                break;
              } catch (err) {
                console.error(`[JADIBOT] Pairing gagal:`, err.message);
                if (i === PAIR_RETRY_DELAYS.length - 1) {
                  cleanupJadibotSession(jadibotSock, nomor, sessionDir, true);
                  sock.sendMessage(requester, { text: `❌ Gagal memuat kode pairing: ${err.message}` }).catch(()=>{});
                  sock.sendMessage(from, { text: `❌ Gagal pairing ${nomor}` }).catch(()=>{});
                  req.status = 'approved';
                  saveDB(db);
                  return; // Stop fungsi
                }
              }
            }

            if (pairingCodeStr) {
              await sock.sendMessage(requester, {
                text: `🎟️ *KODE PAIRING JADIBOT* 🎟️\n\n📱 *Nomor:* ${nomor}\n🎟️ *Kode:* ${pairingCodeStr}\n\n_Buka WhatsApp > 3 titik > Perangkat Tertaut > Hubungkan Perangkat_\n_Masukkan kode di atas untuk menghubungkan bot. Kode berlaku sekitar 1 menit!_`
              });
              let ownerJid = db.global?.owner_utama;
              if (ownerJid && ownerJid !== requester) {
                await sock.sendMessage(ownerJid, { text: `🎟️ Pairing ${nomor}: ${pairingCodeStr}` });
              }
            }
          } else if (jadibotSock.authState.creds.registered && !hasRequestedPairing) {
            hasRequestedPairing = true;
            await sock.sendMessage(requester, { text: `♻️ Menghubungkan kembali sistem bot ke sesi lama nomor ${nomor}...` });
          }

          jadibotSock.ev.on('creds.update', saveCreds);

          // Handler Koneksi Anti-Macet
          jadibotSock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
              const statusCode = lastDisconnect?.error?.output?.statusCode;
              const isLoggedOut = statusCode === DisconnectReason.loggedOut;
              
              console.log(`[JADIBOT ${nomor}] Terputus (Kode Error: ${statusCode || 'unknown'})`);

              // Bersihkan listener memori setiap putus agar tidak duplikat saat reconnect
              try {
                jadibotSock.ev.removeAllListeners('messages.upsert');
                jadibotSock.ev.removeAllListeners('connection.update');
                jadibotSock.ev.removeAllListeners('creds.update');
              } catch (e) {}

              if (isLoggedOut) {
                // Jika sengaja dilogout dari HP, hapus bersih
                delete global.activeJadibots[nomor];
                try { fs.rmSync(`./${sessionDir}`, { recursive: true, force: true }); } catch (e) {}
                freeActiveSlot(nomor);
                console.log(`[JADIBOT ${nomor}] Sesi Logged Out dihapus total.`);
              } else {
                // 🔥 PERBAIKAN: Jika kena Error 515 / koneksi tidak stabil, JANGAN MATIKAN BOT. Lakukan Reconnect.
                console.log(`[JADIBOT ${nomor}] Sedang menyambung ulang otomatis dalam 3 detik...`);
                setTimeout(startSession, 3000); 
              }

            } else if (connection === 'open') {
              console.log(`✅ JADIBOT ${nomor} BERHASIL TERHUBUNG!`);
              global.activeJadibots[nomor] = jadibotSock;
              
              let dbr2 = readDB();
              if (!dbr2.global.jadibot) dbr2.global.jadibot = { requests: {}, active: {} };
              if (!dbr2.global.jadibot.active) dbr2.global.jadibot.active = {};
              if (dbr2.global.jadibot.requests?.[sid]) dbr2.global.jadibot.requests[sid].status = 'active';
              
              dbr2.global.jadibot.active[requester] = {
                sessionId: sid,
                number: nomor,
                sessionDir,
                started_at: Date.now(),
                requester,
                requesterName
              };
              saveDB(dbr2);
              sock.sendMessage(requester, { text: `✅ *JADIBOT ${nomor} BERHASIL TERHUBUNG!*\n\nSekarang bot sudah tersinkronisasi dan siap merespon pesan.` }).catch(() => {});
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

            if (from.endsWith('@g.us')) {
              const now = Date.now();
              const last = global.lastGroupResponse[from] || 0;
              if (now - last < 800) return;
              global.lastGroupResponse[from] = now;
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
          console.error(`[JADIBOT] Gagal:`, err);
          // Jika gagal setup, coba ulang setelah 5 detik agar tidak crash
          setTimeout(startSession, 5000);
        }
      };

      // Mulai proses inisiasi Jadibot
      startSession();

      // Update status ke pending_pairing sambil menunggu loop startSession beraksi
      req.status = 'pending_pairing';
      saveDB(db);

      await sock.sendMessage(from, {
        text: `✅ *JADIBOT DIAKTIFKAN!*\n\n📱 *Nomor:* ${nomor}\n🆔 *ID:* ${sid}\n👤 *Pengaju:* ${requesterName}\n\n_Menyiapkan kode pairing... Mohon tunggu notifikasi selanjutnya._`
      });

      return true;
    }

    // ===== .jadibotreject =====
    if (cmd === 'jadibotreject') {
      if (!isOwner) return sock.sendMessage(from, { text: `❌ Hanya Owner.` });
      
      let sid = args[0]?.toUpperCase();
      let req = sid ? db.global.jadibot?.requests?.[sid] : null;
      if (!req || req.status !== 'pending') {
        return sock.sendMessage(from, { text: `❌ ID tidak valid.` });
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
      if (!isOwner) return sock.sendMessage(from, { text: `❌ Hanya Owner.` });
      
      if (!db.global.jadibot?.active || Object.keys(db.global.jadibot.active).length === 0) {
        return sock.sendMessage(from, { text: `⚠️ Tidak ada jadibot aktif.` });
      }
      let target = args.join(' ').toLowerCase();
      if (!target) {
        let txt = `📋 *JADIBOT AKTIF:*`;
        for (let [jid, info] of Object.entries(db.global.jadibot.active)) {
          txt += `\n📱 ${info.number} — ${info.requesterName} (${info.sessionId})`;
        }
        return sock.sendMessage(from, { text: txt + `\n\nGunakan: ${prefix}killjadibot [nomor/ID]` });
      }

      let foundKey = null, foundInfo = null;
      for (let [jid, info] of Object.entries(db.global.jadibot.active)) {
        if (info.number === target || info.sessionId?.toLowerCase() === target) {
          foundKey = jid; foundInfo = info; break;
        }
      }
      if (!foundInfo) return sock.sendMessage(from, { text: `❌ Tidak ditemukan: ${target}` });

      let nomor = foundInfo.number;
      let sessionDir = foundInfo.sessionDir || `jadibot_${nomor}`;

      if (global.activeJadibots[nomor]) {
        cleanupJadibotSession(global.activeJadibots[nomor], nomor, sessionDir, true);
      } else {
        try { if (fs.existsSync(`./${sessionDir}`)) fs.rmSync(`./${sessionDir}`, { recursive: true, force: true }); } catch (e) {}
      }

      delete db.global.jadibot.active[foundKey];
      saveDB(db);

      await sock.sendMessage(from, { text: `🛑 *JADIBOT DIHENTIKAN*\n📱 ${nomor}\n👤 ${foundInfo.requesterName}` });
      await sock.sendMessage(foundInfo.requester, { text: `🛑 Jadibot ${nomor} dihentikan oleh Owner.` }).catch(()=>{});
      return true;
    }

    // ===== .jadibotlist / .listjadibot =====
    if (cmd === 'jadibotlist' || cmd === 'listjadibot') {
      if (!isOwner && !isAdmin) return sock.sendMessage(from, { text: `❌ Hanya Staff.` });
      
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
