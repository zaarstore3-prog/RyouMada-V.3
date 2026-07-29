// =========================================================
// PLUGIN: TOOLS - RyoMada V.3.1
// =========================================================
import axios from 'axios';
import yts from 'yt-search';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import fs from 'fs';

export default {
  name: 'tools',
  version: '3.1.0',
  commands: ['play', 'pinterest', 'pindl', 'hd', 'remini'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;

    if (cmd === 'play') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format: ${prefix}play [judul lagu]` });
        return true;
      }
      await sock.sendMessage(from, { text: "🔍 *Mencari & Mengunduh...*\n_Menghubungkan ke API Azbry..._" });

      try {
        let search = await yts(args.join(" "));
        if (!search || !search.videos || search.videos.length === 0) {
          await sock.sendMessage(from, { text: "❌ Lagu tidak ditemukan." });
          return true;
        }

        let video = search.videos[0];
        let infoText = `🎵 *RYOUMADA PLAY* 🎵\n\n📌 *Judul:* ${video.title}\n⏱️ *Durasi:* ${video.timestamp || "Unknown"}\n🔗 *Link:* ${video.url}\n\n_⏳ Sedang memproses audio..._`;

        try { await sock.sendMessage(from, { image: { url: video.thumbnail }, caption: infoText }); }
        catch (e) { await sock.sendMessage(from, { text: infoText }); }

        const encodedUrl = encodeURIComponent(video.url);
        const apiUrl = `https://api.azbry.com/api/download/ytmp3?url=${encodedUrl}`;

        let res = await axios.get(apiUrl, { timeout: 25000 });
        if (!res.data || res.data.status !== true || !res.data.result || !res.data.result.download) {
          throw new Error("Gagal mendapatkan link download dari API.");
        }

        let audioUrl = res.data.result.download;

        // Download buffer agar audio bisa diputar stabil
        let audioBuffer = null;
        try {
          let audioRes = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 60000 });
          audioBuffer = Buffer.from(audioRes.data);
        } catch (e) {
          console.warn('[PLAY] Gagal download buffer, fallback ke URL:', e.message);
        }

        if (audioBuffer && audioBuffer.byteLength > 5000) {
          await sock.sendMessage(from, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: false });
        } else {
          await sock.sendMessage(from, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: false });
        }
        await sock.sendMessage(from, { document: { url: audioUrl }, mimetype: 'audio/mpeg', fileName: `${video.title}.mp3` });
      } catch (err) {
        await sock.sendMessage(from, { text: `❌ *Gagal memproses lagu:* ${err.message || err}\n\n_Coba gunakan ${prefix}ytmp3 [URL YouTube] sebagai alternatif._` });
      }
      return true;
    }

    if (cmd === 'pinterest' || cmd === 'pindl') {
      if (!args[0]) {
        await sock.sendMessage(from, { text: `❌ Format salah! Gunakan: *${prefix}${cmd} [URL Pinterest]*` });
        return true;
      }
      let url = args[0];
      if (!url.includes('pinterest.com') && !url.includes('pin.it')) {
        await sock.sendMessage(from, { text: `❌ Link tidak valid! Pastikan kamu memasukkan URL dari Pinterest.` });
        return true;
      }

      await sock.sendMessage(from, { text: "⏳ *Mengekstrak media dari Pinterest...*" });

      try {
        const apiRes = await fetch(`https://api.azbry.com/api/download/pinterest?url=${encodeURIComponent(url)}`);
        const json = await apiRes.json();

        if (!json.status || !json.result) {
          await sock.sendMessage(from, { text: "❌ Gagal mengambil data dari server." });
          return true;
        }

        const { type, title, download, stats } = json.result;
        const captionMsg = `📌 *PINTEREST DOWNLOADER*\n\n` +
                           `📝 *Judul:* ${title || 'Tidak ada judul'}\n` +
                           `❤️ *Likes:* ${stats?.likes || 0}\n` +
                           `🔗 *Shares:* ${stats?.shares || 0}`;

        if (type === 'image') {
          await sock.sendMessage(from, { image: { url: download }, caption: captionMsg }, { quoted: msg });
        } else if (type === 'video') {
          await sock.sendMessage(from, { video: { url: download }, caption: captionMsg }, { quoted: msg });
        } else {
          await sock.sendMessage(from, { text: "❌ Format media tidak dikenali." });
        }
      } catch (err) {
        await sock.sendMessage(from, { text: `❌ Terjadi kesalahan sistem: ${err.message}` });
      }
      return true;
    }

    if (cmd === 'hd' || cmd === 'remini') {
      const isImage = msg.message?.imageMessage;
      const isQuotedImage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
      const mediaData = isImage ? msg.message.imageMessage : isQuotedImage;

      if (!mediaData) {
        await sock.sendMessage(from, { text: `❌ Kirim gambar dengan caption *${prefix}${cmd}* atau balas sebuah gambar.` });
        return true;
      }

      await sock.sendMessage(from, { text: "⏳ *Sedang memproses gambar...\n(Tahap 1: Uploading ke Server)*" });

      try {
        const stream = await downloadContentFromMessage(mediaData, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

        let timeId = Date.now();
        let tmpPath = `./temp_hd_${timeId}.jpg`;
        fs.writeFileSync(tmpPath, buffer);

        const FormDataPkg = (await import('form-data')).default;
        let form = new FormDataPkg();
        form.append('file', fs.createReadStream(tmpPath));

        const uploadRes = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
          headers: form.getHeaders()
        });

        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

        const uploadData = uploadRes.data;
        if (!uploadData || !uploadData.data || !uploadData.data.url) {
          await sock.sendMessage(from, { text: "❌ Gagal mengunggah gambar ke server sementara." });
          return true;
        }

        const directUrl = uploadData.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        await sock.sendMessage(from, { text: "⏳ *Gambar berhasil diunggah!\n(Tahap 2: Proses Peningkatan HD)*" });

        let apiEndpoints = [
          `https://api.azbry.com/api/tools/remini?url=${encodeURIComponent(directUrl)}`,
          `https://api.azbry.com/api/tools/wink?url=${encodeURIComponent(directUrl)}`
        ];
        let hdUrl = null;
        let lastError = "Semua server AI tidak merespons.";

        for (let apiUrl of apiEndpoints) {
          for (let attempt = 0; attempt <= 2; attempt++) {
            try {
              let hdReq = await axios.get(apiUrl, { timeout: 60000 });
              if (hdReq.data && hdReq.data.status === true && hdReq.data.result && hdReq.data.result.result_url) {
                hdUrl = hdReq.data.result.result_url;
              }
              break;
            } catch (e) {
              lastError = e.message;
              if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
            }
          }
          if (hdUrl) break;
        }

        if (!hdUrl) {
          await sock.sendMessage(from, { text: `❌ API Gagal merespons. Log: ${lastError}` });
          return true;
        }

        let resultBufferRes = await axios.get(hdUrl, { responseType: 'arraybuffer', timeout: 60000 });
        if (!resultBufferRes || !resultBufferRes.data) {
          await sock.sendMessage(from, { text: "❌ Gagal mengunduh gambar hasil." });
          return true;
        }
        let hdBuffer = Buffer.from(resultBufferRes.data);
        if (hdBuffer.byteLength < 5000) {
          await sock.sendMessage(from, { text: "❌ Gambar hasil korup atau terlalu kecil." });
          return true;
        }

        await sock.sendMessage(from, { image: hdBuffer, caption: "✨ *Berhasil Meningkatkan Kualitas Gambar (HD)!*" }, { quoted: msg });
      } catch (err) {
        await sock.sendMessage(from, { text: `❌ Terjadi kesalahan sistem: ${err.message}` });
      }
      return true;
    }

    return false;
  }
};
