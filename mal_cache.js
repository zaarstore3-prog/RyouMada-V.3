import fetch from 'node-fetch';
import { saveDB } from './database.js';

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 jam -- data karakter anime jarang berubah

// =========================================================
// CACHE + RETRY UNTUK JIKAN (MyAnimeList API)
// Karena Jikan API kadang down/kena rate limit, cache lokal ini bikin
// lookup karakter yang PERNAH dicari sebelumnya tetap jalan walau Jikan
// lagi bermasalah, dan mengurangi jumlah panggilan ke Jikan secara umum
// (dipakai bersama oleh cmd_asmara.js & cmd_admin_asmara.js).
//
// Catatan: Jikan/MAL adalah satu-satunya API karakter anime gratis yang
// pakai ID MAL (dicek dan dikonfirmasi -- API resmi MAL tidak bisa search
// karakter sama sekali, AniList pakai ID sendiri yang beda). Jadi solusi
// di sini FOKUS ke bikin Jikan lebih tahan-banting, bukan menggantinya.
// =========================================================
export async function fetchMalCharacter(query, db) {
    if (!db.global.mal_cache) db.global.mal_cache = {};
    let cacheKey = query.toString().trim().toLowerCase();
    let cached = db.global.mal_cache[cacheKey];
    let isId = /^\d+$/.test(query);

    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL) {
        return cached.data;
    }

    let url = isId
        ? `https://api.jikan.moe/v4/characters/${query}`
        : `https://api.jikan.moe/v4/characters?q=${encodeURIComponent(query)}&limit=1`;

    let res, lastErr;
    // Retry hingga 2x tambahan dengan jeda 2 detik -- baik untuk rate limit (429)
    // maupun error sementara lainnya (500, koneksi Termux yang kadang tidak stabil)
    for (let attempt = 0; attempt <= 2; attempt++) {
        try {
            res = await fetch(url);
            if (res.ok) break;
            lastErr = `HTTP ${res.status}`;
        } catch (e) {
            lastErr = e.message;
            res = null;
        }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (!res || !res.ok) {
        // Jikan gagal total -> pakai cache lama (walau sudah kedaluwarsa) daripada
        // gagal total. Data agak basi masih lebih baik daripada tidak ada sama sekali.
        return cached ? cached.data : null;
    }

    try {
        let json = await res.json();
        let result = isId ? (json.data || null) : ((json.data && json.data.length > 0) ? json.data[0] : null);

        if (result) {
            db.global.mal_cache[cacheKey] = { data: result, cachedAt: Date.now() };
            // Simpan juga di key mal_id-nya kalau query awal berupa nama, supaya lookup
            // berikutnya pakai ID (mis. dari .lamar) ikut kena cache yang sama
            if (result.mal_id && result.mal_id.toString() !== cacheKey) {
                db.global.mal_cache[result.mal_id.toString()] = { data: result, cachedAt: Date.now() };
            }
            saveDB(db);
        }
        return result;
    } catch (e) {
        return cached ? cached.data : null;
    }
}
