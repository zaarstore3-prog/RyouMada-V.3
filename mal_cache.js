import { saveDB } from './database.js';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 jam -- data karakter anime jarang berubah

// =========================================================
// SCRAPER HTML MAL (MyAnimeList) LANGSUNG -- PENGGANTI JIKAN & ANILIST
// =========================================================
// Jikan API (wrapper tidak resmi Jikan utk MAL) sering down/rate-limit,
// dan AniList pakai ID sendiri yang BEDA dari ID MAL (walau nama karakter
// sama, angkanya tidak nyambung). Supaya .char/.lamar/whitelist/blacklist
// tetap konsisten pakai ID MAL asli, modul ini scrape langsung dari HTML
// myanimelist.net -- tanpa API pihak ketiga sama sekali.
//
// Dua halaman yang di-scrape:
// 1. https://myanimelist.net/character/{id}      -> detail 1 karakter
// 2. https://myanimelist.net/character.php?q=... -> hasil pencarian nama
//
// Cache lokal (db.global.mal_cache) tetap dipertahankan persis seperti
// sebelumnya: mengurangi jumlah request ke MAL (sopan ke server mereka +
// lebih cepat utk pemain), dan tetap bisa jawab dari cache lama kalau
// scrape sedang gagal (mis. MAL lambat/lagi maintenance).
// =========================================================

const FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8'
};

// Bersihkan entity HTML paling umum + buang sisa tag, tanpa dependency baru.
function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}

function stripTags(html) {
    return decodeEntities(
        html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    ).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Ambil isi meta og:xxx -- cek 2 urutan atribut (property dulu / content dulu)
// karena urutan atribut HTML tidak dijamin sama di semua halaman.
function extractOgMeta(html, property) {
    let re = new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']*)["']`, 'i');
    let m = html.match(re);
    if (m) return decodeEntities(m[1]);
    re = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:${property}["']`, 'i');
    m = html.match(re);
    return m ? decodeEntities(m[1]) : null;
}

function cleanTitle(str) {
    if (!str) return null;
    return str.replace(/\s*[-|]\s*MyAnimeList\.net\s*$/i, '').trim() || null;
}

async function fetchHtml(url) {
    let res;
    try {
        // Timeout 15 detik -- supaya kalau MAL lambat/menggantung, request tidak
        // ikut menggantung tanpa batas (langsung dianggap gagal & masuk jalur retry).
        res = await fetch(url, { headers: FETCH_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    } catch (e) {
        return { ok: false, html: null, err: e.message };
    }
    if (!res.ok) return { ok: false, html: null, err: `HTTP ${res.status}` };
    const html = await res.text();
    return { ok: true, html, err: null };
}

// =========================================================
// Detail 1 karakter dari halaman /character/{id}
// =========================================================
async function scrapeCharacterById(id) {
    const url = `https://myanimelist.net/character/${id}`;
    const { ok, html, err } = await fetchHtml(url);
    if (!ok || !html) return { result: null, err };

    // Nama: og:title lebih diutamakan, <title> sebagai cadangan
    let name = cleanTitle(extractOgMeta(html, 'title'));
    if (!name) {
        const tm = html.match(/<title>([^<]*)<\/title>/i);
        name = tm ? cleanTitle(decodeEntities(tm[1])) : null;
    }
    // Halaman tidak valid (ID tidak ada / karakter dihapus) -> tidak ketemu
    if (!name || /^myanimelist\.net$/i.test(name)) return { result: null, err: 'Karakter tidak ditemukan' };

    // Gambar: og:image dulu, kalau kosong cari langsung pola URL gambar karakter di cdn MAL
    let image = extractOgMeta(html, 'image');
    if (image && /questionmark|apple-touch-icon|\/img\/common\//i.test(image)) image = null;
    if (!image) {
        const im = html.match(/https:\/\/cdn\.myanimelist\.net\/images\/characters\/[^"'\s]+/i);
        image = im ? im[0] : null;
    }

    // Nama Jepang (opsional, best-effort) -- baris "Japanese: xxx" di kotak info
    let nameKanji = null;
    const jpMatch = html.match(/Japanese:<\/span>\s*([^<]+)</i);
    if (jpMatch) nameKanji = decodeEntities(jpMatch[1]).trim();

    // Deskripsi/about (opsional, best-effort): ambil teks antara "Member
    // Favorites:" dan heading <h2> berikutnya (Animeography/Voice Actors).
    // Kalau pola ini tidak ketemu (mis. layout berubah), about dibiarkan
    // null -- tidak fatal, field inti (id/nama/gambar) tetap didapat dari
    // sumber yang lebih stabil (title tag & og:image) di atas.
    let about = null;
    const favIdx = html.search(/Member Favorites:/i);
    if (favIdx !== -1) {
        const afterFav = html.slice(favIdx);
        const h2Idx = afterFav.search(/<h2/i);
        let chunk = h2Idx !== -1 ? afterFav.slice(0, h2Idx) : afterFav.slice(0, 3000);
        // Strip tag HTML DULU, baru buang sisa teks label "Member Favorites: N"
        // dari hasil plain text -- supaya tetap benar walau ada tag (mis. </span>)
        // di antara label & angkanya di markup aslinya.
        let cleaned = stripTags(chunk).replace(/Member Favorites:\s*[\d,]+/i, '').trim();
        about = cleaned.length > 0 ? cleaned.slice(0, 500) : null;
    }

    return {
        result: {
            mal_id: parseInt(id, 10),
            name,
            name_kanji: nameKanji,
            about,
            images: { jpg: { image_url: image || null } },
            url
        },
        err: null
    };
}

// =========================================================
// Cari karakter lewat nama di halaman pencarian MAL, ambil hasil PERTAMA
// (paling relevan menurut MAL sendiri).
// =========================================================
async function searchCharacterByName(query) {
    const url = `https://myanimelist.net/character.php?q=${encodeURIComponent(query)}&cat=character`;
    const { ok, html, err } = await fetchHtml(url);
    if (!ok || !html) return { found: null, err };

    // Anchor ke halaman karakter selalu berpola /character/{id}/{slug}.
    // Anchor gambar (tanpa teks) otomatis terlewati karena butuh minimal
    // 1 karakter non-"<" di antara buka-tutup tag (yaitu teks nama-nya).
    const re = /<a[^>]+href="(?:https?:\/\/myanimelist\.net)?\/character\/(\d+)\/[^"]*"[^>]*>([^<]+)<\/a>/i;
    const m = html.match(re);
    if (!m) return { found: null, err: 'Karakter tidak ditemukan' };
    return { found: { id: m[1], name: stripTags(m[2]) }, err: null };
}

// =========================================================
// fetchMalCharacter -- dipakai bersama oleh asmara.js & admin_asmara.js.
// Signature & bentuk hasil (mal_id, name, images.jpg.image_url, dst)
// SENGAJA dipertahankan sama seperti sebelumnya supaya pemanggil lain
// tidak perlu berubah banyak -- yang berubah cuma SUMBER datanya (scrape
// MAL, bukan lagi Jikan/AniList).
// =========================================================
export async function fetchMalCharacter(query, db) {
    if (!db.global.mal_cache) db.global.mal_cache = {};
    let cacheKey = query.toString().trim().toLowerCase();
    let cached = db.global.mal_cache[cacheKey];
    let isId = /^\d+$/.test(query);

    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL) {
        return cached.data;
    }

    let result = null;
    let lastErr = null;

    // Retry hingga 2x tambahan dengan jeda 2 detik -- utk koneksi/hosting
    // yang kadang tidak stabil, bukan utk rate limit (kita tidak menghajar
    // MAL bertubi-tubi: 1 nomor/nama = maksimal 1-2 request per lookup).
    for (let attempt = 0; attempt <= 2 && !result; attempt++) {
        try {
            if (isId) {
                const { result: r, err } = await scrapeCharacterById(query);
                result = r;
                lastErr = err;
            } else {
                const { found, err } = await searchCharacterByName(query);
                lastErr = err;
                if (found) {
                    const { result: detail } = await scrapeCharacterById(found.id);
                    result = detail || {
                        mal_id: parseInt(found.id, 10), name: found.name, name_kanji: null,
                        about: null, images: { jpg: { image_url: null } },
                        url: `https://myanimelist.net/character/${found.id}`
                    };
                }
            }
        } catch (e) {
            lastErr = e.message;
        }
        if (!result && attempt < 2) await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!result) {
        // Scrape gagal total -> pakai cache lama (walau kedaluwarsa) daripada
        // gagal total. Data agak basi masih lebih baik daripada tidak ada sama sekali.
        if (lastErr) console.error(`[MAL SCRAPE] Gagal ambil "${query}": ${lastErr}`);
        return cached ? cached.data : null;
    }

    db.global.mal_cache[cacheKey] = { data: result, cachedAt: Date.now() };
    // Simpan juga di key mal_id-nya kalau query awal berupa nama, supaya lookup
    // berikutnya pakai ID (mis. dari .lamar) ikut kena cache yang sama
    if (result.mal_id && result.mal_id.toString() !== cacheKey) {
        db.global.mal_cache[result.mal_id.toString()] = { data: result, cachedAt: Date.now() };
    }
    saveDB(db);
    return result;
}
