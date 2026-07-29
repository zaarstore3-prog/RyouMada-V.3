// =========================================================
// IDENTITY - RyoMada V.3.1
// Resolusi identitas: LID (kode acak WhatsApp) -> Nomor WA asli (PN)
// =========================================================
//
// WhatsApp secara bertahap memakai "LID" (Linked ID, format xxxx@lid)
// untuk sebagian kontak alih-alih nomor asli (format xxxx@s.whatsapp.net,
// disingkat "PN"/wa.net di bot ini), demi privasi. Baileys KADANG
// menyertakan nomor asli lewat field pendamping pesan (participantPn/
// senderPn), tapi field itu tidak selalu ada di setiap pesan/setiap versi
// Baileys — kadang ada, kadang tidak, tergantung pesan & histori WA-nya.
//
// Modul ini membuat bot tidak "lupa" siapa seseorang hanya karena satu
// pesan kebetulan tidak membawa field itu:
// 1. Begitu PN seseorang PERNAH diketahui (dari field pendamping pesan
//    manapun), dipetakan & disimpan sendiri di db.global.lid_map supaya
//    bisa dipakai lagi kapan pun — termasuk untuk pesan/command lain yang
//    tidak membawa field pendamping itu (mis. mention/reply ke orang lain).
// 2. resolveIdentity SELALU mengembalikan PN kalau itu sudah/bisa
//    diketahui (dari pesan saat ini ATAU dari peta yang sudah dipelajari),
//    sehingga db.global.owner_utama, db.users[...], dsb tetap konsisten
//    dan tidak "keliru dianggap bukan owner" hanya gara-gara representasi
//    JID yang berbeda antar pesan.
// 3. Kalau PN benar-benar belum pernah diketahui sama sekali, player tetap
//    bisa dipakai bot dengan LID apa adanya (tidak diblokir), dan tampilan
//    (waTag) akan menunjukkan "(belum sinkron nomor)" alih-alih nomor
//    palsu/asal tebak.
// =========================================================

// =========================================================
// Bersihkan JID: hapus suffix perangkat (:15, :2, dll)
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

// =========================================================
// Peta LID <-> PN yang dipelajari bot sendiri, disimpan persisten di
// database.json (db.global.lid_map). Hanya operasi object murah
// (bukan network/disk call), jadi aman dipakai di jalur yang butuh
// hemat resource (mis. handler jadibot).
// =========================================================
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

// =========================================================
// Pindahkan data player dari key LID ke key PN begitu PN diketahui.
// - Kalau slot PN masih kosong -> pindahkan (move) apa adanya.
// - Kalau slot PN JUGA sudah terisi (kemungkinan 2 record punya orang
//   yang sama) -> JANGAN timpa/hapus diam-diam (data ekonomi berharga
//   buat player). Cukup log supaya Owner sadar & bisa cek manual;
//   record LID lama dibiarkan apa adanya, PN tetap dipakai ke depannya.
// =========================================================
function migrateUserRecord(db, lid, pn) {
  if (!db || !db.users) return;
  const lidData = db.users[lid];
  if (!lidData) return;

  if (!db.users[pn]) {
    db.users[pn] = lidData;
    delete db.users[lid];
  } else if (db.users[pn] !== lidData) {
    // Log HANYA SEKALI per pasangan LID/PN (disimpan persisten di
    // db.global, jadi tidak muncul lagi walau bot restart) -- SEBELUMNYA
    // baris ini tereksekusi & mencetak warning di HAMPIR SETIAP pesan
    // dari user yang datanya kebetulan "duplikat", karena kondisi
    // pemicunya (dua record utk 1 orang) memang tidak pernah berubah.
    // Itu yang membanjiri console dengan baris identik berulang-ulang.
    if (!db.global) db.global = {};
    if (!db.global.identity_conflict_warned) db.global.identity_conflict_warned = {};
    const warnKey = `${lid}|${pn}`;
    if (!db.global.identity_conflict_warned[warnKey]) {
      db.global.identity_conflict_warned[warnKey] = true;
      console.warn(`[IDENTITY] Kemungkinan 2 data untuk orang yang sama: ${lid} & ${pn}. Data LID lama dibiarkan (tidak dihapus otomatis) demi keamanan data.`);
    }
  }
}

// =========================================================
// Resolve Identity: pastikan sender selalu dalam format
// @s.whatsapp.net setiap kali itu memungkinkan.
//
// rawSenderAlt datang dari participantPn/senderPn/participantAlt yang
// disediakan Baileys langsung di key pesan MASUK saat ini, kalau ada.
// db dipakai sebagai sumber kedua (peta yang sudah pernah dipelajari
// sebelumnya), supaya resolusi tetap konsisten walau pesan kali ini
// tidak membawa field pendamping (mis. JID dari mention/reply, atau
// Baileys kebetulan tidak menyertakannya untuk pesan ini).
// =========================================================
export function resolveIdentity(rawSender, db, rawSenderAlt) {
  if (!rawSender) return rawSender;
  let sender = cleanJid(rawSender);

  if (!isLidJid(sender)) return sender;

  // 1) Coba dari field pendamping pesan saat ini (paling akurat)
  let alt = rawSenderAlt ? cleanJid(rawSenderAlt) : null;

  // 2) Kalau tidak ada, coba dari peta yang sudah pernah dipelajari
  if (!isPnJid(alt)) {
    alt = lookupPNForLID(db, sender);
  }

  if (isPnJid(alt)) {
    rememberIdentityPair(db, sender, alt);
    migrateUserRecord(db, sender, alt);
    return alt;
  }

  // Belum bisa di-resolve sama sekali -> pakai LID apa adanya.
  return sender;
}

// =========================================================
// Format tampilan: wa.me/628xxx
// Kalau db disediakan dan jid berupa LID, coba dulu terjemahkan lewat
// peta yang sudah dipelajari sebelum menyerah ke "(belum sinkron nomor)".
// =========================================================
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

// =========================================================
// Format tampilan dengan nama player
// =========================================================
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

// =========================================================
// Resolve target dari argumen command
// Mendukung:
// 1. Mention (@tag) -> JID (di-resolve ke PN bila memungkinkan)
// 2. Reply pesan -> JID reply sender (idem)
// 3. 'me' -> sender
// 4. Nomor telepon (628xxx) -> JID format PN
// =========================================================
export function resolveTarget(args, msg, sender, db) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;

  // 1. Cek mention
  if (ctx?.mentionedJid?.length > 0) {
    return resolveIdentity(ctx.mentionedJid[0], db);
  }

  // 2. Cek reply target
  if (ctx?.participant) {
    return resolveIdentity(ctx.participant, db);
  }

  if (!args || args.length === 0) return null;

  // 3. Cek keyword 'me'
  for (let arg of args) {
    if (arg.toLowerCase() === 'me') return sender;
  }

  // 4. Cek nomor telepon (angka 10-15 digit, tidak diawali @)
  for (let arg of args) {
    if (arg.startsWith('@')) continue;
    let clean = arg.replace(/[^0-9]/g, '');
    if (clean.length >= 10 && clean.length <= 15) {
      return `${clean}@s.whatsapp.net`;
    }
  }

  return null;
}
