import fs from 'fs';

// =========================================================
// DATABASE SYSTEM - RyoMada V.3.1
// Menggunakan BigInt untuk ekonomi, JID untuk identitas
// =========================================================

// BigInt JSON Serializer
const BIGINT_MARKER = '__bigint__';

function bigIntReplacer(key, value) {
  if (typeof value === 'bigint') {
    return { [BIGINT_MARKER]: value.toString() };
  }
  return value;
}

function bigIntReviver(key, value) {
  if (value && typeof value === 'object' && BIGINT_MARKER in value) {
    return BigInt(value[BIGINT_MARKER]);
  }
  return value;
}

// =========================================================
// Cache in-memory satu-pintu untuk database.json.
//
// Sebelumnya readDB() SELALU membaca ulang file dari disk setiap
// dipanggil. Sekarang bot punya banyak "penulis" sekaligus yang bisa
// jalan bersamaan (bot utama + sampai 5 jadibot, masing-masing punya
// message handler sendiri yang manggil readDB/saveDB). Karena handler
// pesan banyak memakai await (requestPairingCode, sendMessage, dll),
// dua pesan dari socket berbeda yang masuk hampir bersamaan bisa saling
// melompati: masing-masing membaca snapshot database yang berbeda, lalu
// menyimpan hasilnya sendiri-sendiri -> perubahan salah satu bisa hilang
// tertimpa (lost update), termasuk data ekonomi player atau status
// jadibot. Ini juga menghemat CPU/disk-IO di panel spesifikasi rendah
// karena tidak lagi parse ulang seluruh file JSON di SETIAP pesan.
//
// Dengan cache singleton di bawah ini, SEMUA pemanggil readDB() dalam
// proses yang sama berbagi objek yang SAMA persis di memori. saveDB()
// menulis objek itu ke disk secara atomic (tulis ke file sementara lalu
// rename) supaya proses yang crash/restart di tengah penulisan (bisa
// terjadi kalau resource RAM/CPU mepet) tidak merusak database.json.
// =========================================================
let dbCache = null;

export const initDB = () => {
  if (!fs.existsSync('./database.json')) {
    const emptyDB = {
      users: {},
      market: {},
      market_ikan: {},
      global: {
        antispam: false,
        klaim_pasangan: {},
        pending_acc: {},
        redeem_codes: {},
        owner_utama: null,
        donatur: {},
        acc_group: "",
        last_uid: 10000,
        whitelist_karakter: [],
        muted_groups: {},
        reports: {},
        lid_map: {}
      }
    };
    fs.writeFileSync('./database.json', JSON.stringify(emptyDB, bigIntReplacer, 2));
  }
  if (!fs.existsSync('./media')) fs.mkdirSync('./media');
};

export const readDB = () => {
  if (dbCache) return dbCache;
  const raw = fs.readFileSync('./database.json', 'utf-8');
  dbCache = JSON.parse(raw, bigIntReviver);
  return dbCache;
};

export const saveDB = (data) => {
  dbCache = data;
  const tmpPath = './database.json.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, bigIntReplacer, 2));
  fs.renameSync(tmpPath, './database.json');
};

// =========================================================
// KONSTANTA EKONOMI - INVESTMENTS
// Harga dalam BigInt (string untuk inisialisasi)
// =========================================================
export const INVESTMENTS = {
  'BTC': { nama: 'Bitcoin (BTC)', icon: '🪙', min: 550000000n, max: 2000000000n, step: 1000000n, updateTime: 3600000 },
  'ETH': { nama: 'Ethereum (ETH)', icon: '💎', min: 40000000n, max: 50000000n, step: 1000000n, updateTime: 1800000 },
  'SOL': { nama: 'Solana (SOL)', icon: '🚀', min: 20000000n, max: 50000000n, step: 1000000n, updateTime: 900000 },
  'GLD': { nama: 'Emas Antam (GLD)', icon: '🥇', min: 1000000n, max: 20000000n, step: 100000n, updateTime: 300000 },
  'WEEB': { nama: 'Saham Anime (WEEB)', icon: '🌸', min: 10000n, max: 900000n, step: 1000n, updateTime: 60000 }
};

// =========================================================
// DISTRIK / KOTA
// =========================================================
export const DISTRIK = {
  'Awal': { pajak: 1000n, transport: 500n, bonus: 0, resiko: 0, denda: 0, ongkos_pindah: 0n, desc: 'Aman dan damai. Bebas risiko razia.' },
  'Shibuya': { pajak: 3000n, transport: 2000n, bonus: 0.20, resiko: 0.10, denda: 0.05, ongkos_pindah: 25000n, desc: 'Gaji +20%. Risiko razia 10%.' },
  'Akihabara': { pajak: 5000n, transport: 3000n, bonus: 0.40, resiko: 0.20, denda: 0.10, ongkos_pindah: 75000n, desc: 'Gaji +40%. Risiko denda 20%.' },
  'Ginza': { pajak: 10000n, transport: 5000n, bonus: 0.60, resiko: 0.30, denda: 0.15, ongkos_pindah: 200000n, desc: 'Gaji +60%. Risiko Yakuza 30%.' }
};

// =========================================================
// PEKERJAAN
// =========================================================
export const JOBS = {
  'pembersih': { nama: 'Pembersih', gaji: 5000n, minLvl: 1n, ilegal: false, icon: '🧹' },
  'ojek': { nama: 'Ojek', gaji: 15000n, minLvl: 3n, ilegal: false, icon: '🛵' },
  'sales': { nama: 'Sales', gaji: 30000n, minLvl: 10n, ilegal: false, icon: '👔' },
  'atmin': { nama: 'Atmin Judi', gaji: 500000n, minLvl: 20n, ilegal: true, icon: '💻' },
  'teller': { nama: 'Teller Bank', gaji: 2000000n, minLvl: 45n, ilegal: false, icon: '🏦' },
  'rampok': { nama: 'Rampok Bank', gaji: 10000000n, minLvl: 60n, ilegal: true, icon: '🦹' },
  'hacker': { nama: 'Hacker', gaji: 5000000n, minLvl: 70n, ilegal: true, icon: '🕵️' },
  'cyber': { nama: 'Cyber Security', gaji: 10000000n, minLvl: 110n, ilegal: false, icon: '🛡️' }
};

// =========================================================
// MENU TEXT
// =========================================================
export const menuUtama = (u, prefix) => {
  return `╔════════════════════════╗\n║ ✨ RYOUMADA MENU ✨ ║\n╚════════════════════════╝\n\n` +
         `👤 *[ PROFIL & INFO ]*\n├ ${prefix}profil [@tag/reply], ${prefix}uang\n├ ${prefix}setname, ${prefix}setgender\n├ ${prefix}setstatus, ${prefix}setlocation\n└ ${prefix}listbadge, ${prefix}setbadge, ${prefix}afk\n\n` +
         `💼 *[ RPG & EKONOMI ]*\n├ ${prefix}kerja [Code], ${prefix}listkerja\n├ ${prefix}investasi, ${prefix}beli, ${prefix}jual\n├ ${prefix}shop, ${prefix}redeem, ${prefix}donasi\n├ ${prefix}donatur, ${prefix}listdonatur\n└ ${prefix}distrik, ${prefix}lbuang, ${prefix}lblevel\n\n` +
         `🎮 *[ MINIGAMES ]*\n└ ${prefix}tebakkata, ${prefix}ryou100, ${prefix}math, ${prefix}tebakkimia\n\n` +
         `💞 *[ ASMARA ]*\n├ ${prefix}character [ID/Nama], ${prefix}lamar [ID/Nama]\n├ ${prefix}pasangan, ${prefix}setpfpasangan, ${prefix}cerai\n└ ${prefix}namaianak, ${prefix}listanak\n\n` +
         `🎥 *[ MEDIA ]*\n├ ${prefix}play [Judul/Link YT]\n└ ${prefix}rvo (reply), ${prefix}tiktok, ${prefix}sticker\n\n` +
         `🛠️ *[ BANTUAN ]*\n└ ${prefix}report [Pesan], ${prefix}saran [Saran]\n\n` +
         `_Ketik ${prefix}menuadmin untuk fitur Owner_`;
};

export const menuAdmin = (prefix) => {
  return `👑 *[ MENU ADMIN & OWNER ]* 👑\n\n` +
         `⚙️ *SISTEM & KEAMANAN*\n` +
         `├ ${prefix}antispam [on/off]\n` +
         `├ ${prefix}claimowner\n` +
         `├ ${prefix}setaccgroup\n` +
         `└ ${prefix}resetglobal\n\n` +
         `👥 *MANAJEMEN PLAYER*\n` +
         `├ ${prefix}addprem / ${prefix}delprem [@tag/reply]\n` +
         `├ ${prefix}ban [@tag/reply] [10s/5m/2h/1d/1y] [Alasan]\n` +
         `├ ${prefix}unban [@tag/reply]\n` +
         `├ ${prefix}setdata [me/@tag] [uang/xp/level/role/afk] [nilai]\n` +
         `├ ${prefix}add [me/@tag] [uang/xp/level/pts/inv_kode] [jml]\n` +
         `├ ${prefix}delbadge [@tag/reply] [urutan angka]\n` +
         `├ ${prefix}adddonate [@tag/reply] [jumlah]\n` +
         `├ ${prefix}fixekonomi\n` +
         `├ ${prefix}infostaff\n` +
         `├ ${prefix}mute / ${prefix}unmute\n` +
         `└ ${prefix}delrole [@tag]\n\n` +
         `🎁 *REDEEM & ASMARA*\n` +
         `├ ${prefix}buatredeem [uang=100|xp=50|limit=10]\n` +
         `├ ${prefix}whitelistchar / ${prefix}delwhitelistchar [ID]\n` +
         `├ ${prefix}cekwhitelistchar / ${prefix}cekblacklist [@tag/me]\n` +
         `├ ${prefix}delblacklist [@tag/me] [ID Karakter]\n` +
         `├ ${prefix}acc pf [Kode Unik]\n` +
         `└ ${prefix}tolak pf [Kode Unik] [Alasan]`;
};
