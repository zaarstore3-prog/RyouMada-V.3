// =========================================================
// IDENTITY - RyoMada V.3.1
// Resolusi identitas: LID (kode acak WhatsApp) -> Nomor WA asli (PN)
// =========================================================

export function cleanJid(jid) {
  if (!jid || typeof jid !== 'string') return jid;
  if (jid.includes(':')) {
    jid = jid.split(':')[0];
  }
  return jid;
}

function isPnJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@s.whatsapp.net');
}

function isLidJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

export function rememberIdentityPair(db, lid, pn) {
  if (!db) return;
  if (!isLidJid(lid) || !isPnJid(pn)) return;
  if (!db.global) db.global = {};
  if (!db.global.lid_map) db.global.lid_map = {};
  db.global.lid_map[lid] = pn;
}

export function lookupPNForLID(db, lid) {
  if (!db || !db.global || !db.global.lid_map) return null;
  return db.global.lid_map[lid] || null;
}

function migrateUserRecord(db, lid, pn) {
  if (!db || !db.users) return;
  const lidData = db.users[lid];
  if (!lidData) return;

  if (!db.users[pn]) {
    db.users[pn] = lidData;
    delete db.users[lid];
  } 
  // 🔥 PERBAIKAN: Console.warn dihapus sepenuhnya agar tidak mengotori terminal dan
  // memancing delay event loop nodejs yang menyebabkan bad session.
}

export function resolveIdentity(rawSender, db, rawSenderAlt) {
  if (!rawSender) return rawSender;
  let sender = cleanJid(rawSender);

  if (!isLidJid(sender)) return sender;

  let alt = rawSenderAlt ? cleanJid(rawSenderAlt) : null;

  if (!isPnJid(alt)) {
    alt = lookupPNForLID(db, sender);
  }

  if (isPnJid(alt)) {
    rememberIdentityPair(db, sender, alt);
    migrateUserRecord(db, sender, alt);
    return alt;
  }

  return sender;
}

export function waTag(jid, db) {
  if (!jid) return '(tidak diketahui)';
  let real = jid;
  if (isLidJid(real)) {
    real = lookupPNForLID(db, real) || real;
  }
  if (!isPnJid(real)) return '_(belum sinkron nomor)_';
  const clean = real.split('@')[0].split(':')[0];
  return `wa.me/${clean}`;
}

export function waTagNamed(jid, db) {
  const name = db?.users?.[jid]?.name;
  let real = jid;
  if (isLidJid(real)) real = lookupPNForLID(db, real) || real;
  if (!isPnJid(real)) {
    return name ? `${name} _(belum sinkron nomor)_` : waTag(jid, db);
  }
  const tag = waTag(real, db);
  return name ? `${name} (${tag})` : tag;
}

export function resolveTarget(args, msg, sender, db) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;

  if (ctx?.mentionedJid?.length > 0) {
    return resolveIdentity(ctx.mentionedJid[0], db);
  }

  if (ctx?.participant) {
    return resolveIdentity(ctx.participant, db);
  }

  if (!args || args.length === 0) return null;

  for (let arg of args) {
    if (arg.toLowerCase() === 'me') return sender;
  }

  for (let arg of args) {
    if (arg.startsWith('@')) continue;
    let clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 10 && clean.length <= 15) {
      return `${clean}@s.whatsapp.net`;
    }
  }

  return null;
}
