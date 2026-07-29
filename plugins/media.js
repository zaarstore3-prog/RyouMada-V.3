// =========================================================
// PLUGIN: MEDIA - RyoMada V.3.1
// Fitur: .brat, .bratvid, .bratvideo (Stiker Brat via API Azbry)
// =========================================================
import axios from 'axios';
import fs from 'fs';
import { exec } from 'child_process';
import * as webp from 'node-webpmux';

export default {
  name: 'media',
  version: '3.1.0',
  commands: ['brat', 'bratvid', 'bratvideo'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;

    // ==================== BRAT & BRAT VIDEO ====================
    if (cmd === 'brat' || cmd === 'bratvid' || cmd === 'bratvideo') {
      let text = args.join(' ');
      if (!text) {
        await sock.sendMessage(from, { text: `❌ Format: *${prefix}${cmd} [teks]*\nContoh: *${prefix}${cmd} RyouMada Bot Terbaik*` });
        return true;
      }

      let isVideo = cmd === 'bratvid' || cmd === 'bratvideo';
      await sock.sendMessage(from, { text: `⏳ *Membuat stiker Brat ${isVideo ? 'Animasi ' : ''}...*` });

      try {
        // Menggunakan API Azbry sesuai request
        let apiUrl = isVideo
          ? `https://api.azbry.com/api/maker/bratvid?text=${encodeURIComponent(text)}`
          : `https://api.azbry.com/api/maker/brat?text=${encodeURIComponent(text)}`;

        // Download output dari API menjadi buffer mentah
        let bufferRes = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 60000 });
        let buffer = Buffer.from(bufferRes.data);

        // Disimpan sementara untuk diproses FFmpeg menjadi WebP
        let timeId = Date.now();
        let tmpIn = `./temp_brat_${timeId}.${isVideo ? 'mp4' : 'png'}`;
        let tmpOut = `./temp_brat_${timeId}.webp`;
        fs.writeFileSync(tmpIn, buffer);

        let filter = `scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000`;
        let ffmpegCmd = isVideo
          ? `ffmpeg -i ${tmpIn} -vcodec libwebp -filter:v "${filter}" -q:v 40 -lossless 0 -preset default -loop 0 -an -vsync 0 -t 8 -fs 800000 ${tmpOut}`
          : `ffmpeg -i ${tmpIn} -vcodec libwebp -filter:v "${filter}" -lossless 1 -preset default -an -vsync 0 ${tmpOut}`;

        // Eksekusi perubahan ke Stiker
        exec(ffmpegCmd, async (err) => {
          if (err) {
            if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
            return sock.sendMessage(from, { text: "❌ FFMPEG Error: Gagal mengonversi brat menjadi stiker." });
          }
          try {
            let webpBuf = fs.readFileSync(tmpOut);
            const img = new webp.Image();
            await img.load(webpBuf);

            // Injeksi Watermark (EXIF metadata)
            let authorName = (u && u.name) ? u.name : (msg.pushName || sender.split('@')[0]);
            const json = {
              'sticker-pack-id': `RyouMada-${Date.now()}`,
              'sticker-pack-name': "RyouMada",
              'sticker-pack-publisher': `Dibuat oleh: ${authorName}`,
              'emojis': ['🟩', '✨']
            };
            
            let exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
            let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
            let exif = Buffer.concat([exifAttr, jsonBuffer]);
            exif.writeUIntLE(jsonBuffer.length, 14, 4);
            img.exif = exif;
            
            let finalSticker = await img.save(null);

            // Kirim Stiker Brat ke pengguna
            await sock.sendMessage(from, { sticker: finalSticker }, { quoted: msg });
          } catch (e) {
            console.error("Watermark Injector Error pada Brat:", e);
            // Fallback jika EXIF error
            await sock.sendMessage(from, { sticker: fs.readFileSync(tmpOut) }, { quoted: msg });
          }
          // Pembersihan file temporary
          if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
          if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        });

      } catch (err) {
        await sock.sendMessage(from, { text: `❌ Terjadi kesalahan saat memanggil API: ${err.message}` });
      }
      return true;
    }

    return false;
  }
};
