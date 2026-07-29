// =========================================================
// ECON_UTILS - RyoMada V.3.1
// BigInt-based economy utilities
// =========================================================

export const PRACTICAL_MAX = 10n ** 250n;

// =========================================================
// Konversi nilai ke BigInt dengan aman
// =========================================================
export function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (value === undefined || value === null) return 0n;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0n;
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[.,]/g, '').replace(/[^0-9-]/g, '');
    if (!cleaned || cleaned === '-') return 0n;
    try { return BigInt(cleaned); } catch { return 0n; }
  }
  return 0n;
}

// =========================================================
// Parsing input nominal dari user (string -> BigInt)
// =========================================================
export function parseAmount(input, { min = 1n, max = PRACTICAL_MAX, allowNegative = false } = {}) {
  if (input === undefined || input === null || input === '') {
    return { valid: false, error: 'Nominal tidak boleh kosong.' };
  }

  let cleaned = String(input).trim().replace(/[.,]/g, '');
  let pattern = allowNegative ? /^-?\d+$/ : /^\d+$/;
  
  if (!pattern.test(cleaned)) {
    return { valid: false, error: `Nominal harus berupa angka bulat${allowNegative ? '' : ' positif'} (tanpa huruf/simbol).` };
  }

  try {
    let num = BigInt(cleaned);
    const minBig = typeof min === 'bigint' ? min : BigInt(min);
    
    if (num < minBig) {
      return { valid: false, error: `Nominal minimal ${formatMoney(min)}.` };
    }

    if (max !== null && max !== undefined) {
      const maxBig = typeof max === 'bigint' ? max : BigInt(max);
      if (num > maxBig) {
        return { valid: false, error: `Nominal terlalu besar (maksimal ${formatMoney(max)}).` };
      }
    }

    return { valid: true, value: num };
  } catch {
    return { valid: false, error: 'Nominal tidak valid.' };
  }
}

// =========================================================
// Batasi nilai di batas aman
// =========================================================
export function capMoney(value, max = PRACTICAL_MAX) {
  const num = toBigInt(value);
  const maxBig = typeof max === 'bigint' ? max : BigInt(max);
  if (num < 0n) return 0n;
  if (num > maxBig) return maxBig;
  return num;
}

// =========================================================
// Format tampilan uang/angka besar
// =========================================================
export function formatMoney(value) {
  const num = toBigInt(value);
  if (num < 0n) return '-' + formatMoneyPositive(-num);
  return formatMoneyPositive(num);
}

function formatMoneyPositive(num) {
  const str = num.toString();
  
  // Angka normal (<= 20 digit): tampilkan dengan pemisah ribuan
  if (str.length <= 20) {
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  
  const exponent = str.length - 1;
  const restDigits = str.slice(1);
  
  // Periksa apakah SEMUA digit setelah digit pertama adalah sama
  const firstRest = restDigits[0];
  let allSame = true;
  for (let i = 0; i < restDigits.length; i++) {
    if (restDigits[i] !== firstRest) {
      allSame = false;
      break;
    }
  }
  
  if (allSame) {
    // Kasus 1: Semua digit seragam
    if (firstRest === '0') {
      return str[0] + 'e+' + exponent;
    } else {
      return str[0] + '.' + firstRest.repeat(3) + 'e+' + exponent;
    }
  }
  
  // Kasus 2: Digit bercampur
  const MAX_DECIMALS = 16;
  const mantissa = restDigits.slice(0, MAX_DECIMALS);
  return str[0] + '.' + mantissa + 'e+' + exponent;
}

// =========================================================
// Sanitasi data ekonomi player
// =========================================================
export function sanitizeUserEconomy(u) {
  if (!u) return u;
  u.uang = capMoney(u.uang);
  u.xp = capMoney(u.xp);
  if (u.invest) {
    for (let k in u.invest) {
      u.invest[k] = capMoney(u.invest[k]);
    }
  }
  if (u.ikan) {
    for (let k in u.ikan) u.ikan[k] = capMoney(u.ikan[k]);
  }
  if (u.bank) u.bank.tabungan = capMoney(u.bank.tabungan);
  if (u.pinjol) u.pinjol.amount = capMoney(u.pinjol.amount);
  u.hutang = capMoney(u.hutang);
  return u;
}

// =========================================================
// Hitung level-up dari akumulasi XP (BigInt)
// =========================================================
//
// Formula XP per level:
//   Level 1 -> 2 : 100 XP
//   Level 2 -> 3 : 500 XP
//   Level 3+     : level^2 * 125 XP
//
// Untuk menghindari loop triliunan kali pada XP raksasa,
// algoritma ini menggunakan:
//   1. Exponential search: gandakan batas atas hingga melampaui XP
//   2. Binary search: cari level yang tepat di antara batas
//
// Sehingga level berapa pun ditemukan dalam < 1000 iterasi!
// =========================================================
export function calculateLevelUp(xp, level) {
  const xpBig = toBigInt(xp);
  let levelBig = toBigInt(level);
  if (levelBig < 1n) levelBig = 1n;

  // XP yang dibutuhkan untuk naik dari level L ke L+1
  const getReq = (lvl) =>
    lvl === 1n ? 100n : (lvl === 2n ? 500n : (lvl * lvl) * 125n);

  // Total XP kumulatif yang dibutuhkan untuk mencapai level L
  // = req(1) + req(2) + ... + req(L-1)
  const getCum = (lvl) => {
    if (lvl <= 1n) return 0n;
    if (lvl === 2n) return 100n;
    // n = lvl - 1 (level terakhir dalam penjumlahan)
    const n = lvl - 1n;
    // Rumus: sum(1^2 + 2^2 + ... + n^2) = n(n+1)(2n+1)/6
    const sumSq = n * (n + 1n) * (2n * n + 1n) / 6n;
    // req(1)+req(2) = 100+500 = 600
    // req(3 sampai L) = 125 * sum(3^2 sampai (L-1)^2)
    //                  = 125 * (sum(1^2 sampai n^2) - 1^2 - 2^2)
    //                  = 125 * (sumSq - 5)
    return 600n + 125n * (sumSq - 5n);
  };

  const currentReq = getReq(levelBig);

  // === FAST PATH: tidak perlu level up ===
  if (xpBig < currentReq) {
    return { level: levelBig, xpReq: currentReq, isLevelUp: false };
  }

  // === PHASE 1: Exponential search untuk batas atas ===
  let lo = levelBig;
  let hi = levelBig + 1n;
  let safety = 0;
  const MAX_BOUND = 10n ** 80n; // ~265 kali penggandaan dari level 1

  while (safety < 500) {
    const cumHi = getCum(hi);
    if (cumHi > xpBig || hi > MAX_BOUND) break;
    hi = hi * 2n;
    safety++;
  }

  // === PHASE 2: Binary search untuk level yang tepat ===
  let searchIter = 0;
  while (lo + 1n < hi && searchIter < 500) {
    const mid = (lo + hi) / 2n;
    const cumMid = getCum(mid);
    if (cumMid <= xpBig) {
      lo = mid;
    } else {
      hi = mid;
    }
    searchIter++;
  }

  // lo = level tertinggi yang bisa dicapai dengan XP saat ini
  const isLevelUp = lo > levelBig;
  const newXpReq = getReq(lo);

  return { level: lo, xpReq: newXpReq, isLevelUp };
}

// =========================================================
// Helper: floor division untuk BigInt
// =========================================================
export function bigIntFloorDiv(a, b) {
  const aB = toBigInt(a);
  const bB = toBigInt(b);
  if (bB === 0n) return 0n;
  return aB / bB;
}

// =========================================================
// Helper: persentase dari BigInt
// =========================================================
export function bigIntPercent(value, percent) {
  const val = toBigInt(value);
  if (percent < 0) percent = 0;
  if (percent > 1) percent = 1;
  return val * BigInt(Math.floor(percent * 1000)) / 1000n;
}
