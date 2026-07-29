// =========================================================
// PLUGIN: MEDIA - RyoMada V.3.2 (Full Features + Brat)
// =========================================================
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import axios from 'axios';
import FormData from 'form-data';
import fetch from 'node-fetch';
import fs from 'fs';
import { exec } from 'child_process';
import webp from 'node-webpmux';

function extractMediaUrls(obj) {
  let urls = [];
  if (typeof obj === 'string' && obj.startsWith('http') && !obj.includes('.html')) { urls.push(obj); return urls; }
  if (typeof obj !== 'object' || obj === null) return urls;
  if (Array.isArray(obj)) { for (let item of obj) urls = urls.concat(extractMediaUrls(item)); }
  else {
    const keys = ['url', 'download', 'link', 'media', 'hd', 'sd', 'video', 'image', 'nowm', 'wm'];
    for (let key in obj) {
      if (keys.includes(key.toLowerCase()) && typeof obj[key] === 'string' && obj[key].startsWith('http') && !obj[key].includes('.html')) urls.push(obj[key]);
      if (typeof obj[key] === 'object') urls = urls.concat(extractMediaUrls(obj[key]));
    }
  }
  return [...new Set(urls)];
}

async function axiosGetWithRetry(url, options, maxRetries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await axios.get(url, options); }
    catch (e) { lastErr = e; if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1500)); }
  }
  throw lastErr;
}

export default {
  name: 'media',
  version: '3.2.0',
  commands: ['ig', 'igdl', 'instagram', 'dl', 'allin', 'allinone', 'tomp3',
             'fb', 'fbdl', 'facebook', 'ytmp4', 'ytmp3', 'rvo',
             'tt', 'tiktok', 's', 'stiker', 'sticker', 'brat', 'bratvid', 'bratvideo'],

  handler: async (sock, msg, from, sender, cmd, args, u, db, config) => {
    const prefix = config.prefix;

    // ==================== INSTAGRAM ====================
    if (cmd === 'ig' || cmd === 'igdl' || cmd === 'instagram') {
      if (!args[0]) { await sock.sendMessage(from, { text: `❌ Format: ${prefix}${cmd} [URL Instagram]` }); return true; }
      let url = args[0];
      if (!url.includes('instagram.com')) { await sock.sendMessage(from, { text: "❌ Link tidak valid!" }); return true; }
      await sock.sendMessage(from, { text: "⏳ *Mengekstrak media dari Instagram...*" });

      try {
        const apiRes = await fetch(`https://api.azbry.com/api/download/instagramv2?url=${encodeURIComponent(url)}`);
        const json = await apiRes.json();
        if (!json.status || !json.url || json.url.length === 0) { await sock.sendMessage(from, { text: "❌ Gagal mengambil data." }); return true; }

        const meta = json.meta || {};
        const captionMsg = `📱 *INSTAGRAM DOWNLOADER*\n\n👤 *User:* @${meta.username || 'unknown'}\n❤️ *Likes:* ${meta.like_count || 0}\n💬 *Comments:* ${meta.comment_count || 0}`;

        for (let i = 0; i < json.url.length; i++) {
          let media = json.url[i];
          let mediaType = media.type ? media.type.toLowerCase() : 'unknown';
          let dlUrl = media.url;
          let sendCaption = (i === 0) ? captionMsg : undefined;

          if (mediaType === 'mp4' || mediaType === 'video') {
            await sock.sendMessage(from, { video: { url: dlUrl }, caption: sendCaption }, { quoted: msg });
          } else if (mediaType === 'jpg' || mediaType === 'jpeg' || mediaType === 'image') {
            await sock.sendMessage(from, { image: { url: dlUrl }, caption: sendCaption }, { quoted: msg });
          }
        }
      } catch (err) { await sock.sendMessage(from, { text: `❌ Error: ${err.message}` }); }
      return true;
    }

    // ==================== ALL-IN-ONE ====================
    if (cmd === 'dl' || cmd === 'allin' || cmd === 'allinone') {
      if (!args[0]) { await sock.sendMessage(from, { text: `❌ Format: ${prefix}${cmd} [URL]` }); return true; }
      let url = args[0];
      if (!url.startsWith('http')) { await sock.sendMessage(from, { text: "❌ Link tidak valid!" }); return true; }

      await sock.sendMessage(from, { text: "🚀 *Menganalisis tautan...*" });

      let isYoutube = /youtube\.com|youtu\.be/i.test(url);
      if (isYoutube) {
        try {
          let videoUrl = null, title = 'Video', author = '-', quality = 'Auto';
          let apiSuccess = false;

          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              let res = await axiosGetWithRetry(`https://api.azbry.com/api/download/ytmp4?url=${encodeURIComponent(url)}`, { timeout: 25000 });
              if (res.data && res.data.status === true && res.data.result && res.data.result.download) {
                title = res.data.result.title || title;
                author = res.data.result.author || author;
                quality = res.data.result.quality || quality;
                videoUrl = res.data.result.download;
                apiSuccess = true;
                break;
              }
            } catch (e) {
              if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
            }
          }

          if (!apiSuccess || !videoUrl) {
            throw new Error("Semua server download tidak merespon.");
          }

          let buffer = null;
          let bufferError = null;
          const timeouts = [60000, 180000]; 
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              let bufferRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: timeouts[attempt] });
              buffer = Buffer.from(bufferRes.data);
              if (buffer.byteLength >= 50000) break;
              bufferError = "File korup (terlalu kecil).";
            } catch (e) {
              bufferError = e.message;
              if (attempt === 0) {
                await sock.sendMessage(from, { text: "⏳ *Mengunduh video besar...*" });
                await new Promise(r => setTimeout(r, 3000));
              }
            }
          }

          if (!buffer || buffer.byteLength < 50000) {
            throw new Error(`Gagal mengunduh: ${bufferError || 'File korup'}`);
          }

          let safeTitle = (title || "Video").replace(/[\\/:*?"<>|]/g, '');
          let sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1);
          let baseCaption = `📥 *ALL-IN-ONE (YouTube)*\n\n📌 *Title:* ${title}\n👤 *Author:* ${author || '-'}\n📺 *Kualitas:* ${quality || 'Auto'}\n📦 *Ukuran:* ${sizeMB} MB`;

          if (buffer.byteLength > 16 * 1024 * 1024) {
            await sock.sendMessage(from, {
              document: buffer,
              mimetype: 'video/mp4',
              fileName: `${safeTitle}.mp4`,
              caption: `${baseCaption}\n\n_⚠️ Video terlalu besar untuk preview. Download file di atas._`
            }, { quoted: msg });
          } else {
            await sock.sendMessage(from, { video: buffer, caption: baseCaption, fileName: `${safeTitle}.mp4` }, { quoted: msg });
          }
        } catch (err) { await sock.sendMessage(from, { text: `❌ *Gagal download video.*\n_${err.message}_\n\n💡 Coba ${prefix}ytmp3 untuk audio.` }); }
        return true;
      }

      try {
        const apiRes = await fetch(`https://api.azbry.com/api/download/allinonev2?url=${encodeURIComponent(url)}&format=mp4`);
        const json = await apiRes.json();
        if (!json.status || !json.result || !json.result.downloads || json.result.downloads.length === 0) {
          await sock.sendMessage(from, { text: "❌ Gagal mengambil data." }); return true;
        }
        const { title, owner, downloads } = json.result;
        const captionMsg = `📥 *ALL-IN-ONE DOWNLOADER*\n\n👤 *Owner:* ${owner || '-'}\n📝 *Title:* ${title || '-'}`;

        let videoUrl = null, audioUrl = null, imageUrls = [];
        for (let item of downloads) {
          let label = (item.label || "").toLowerCase();
          let dlUrl = item.url;
          let isAudio = label.includes('mp3') || label.includes('audio');
          let isImage = label.includes('image') || label.includes('photo');
          if (isAudio && !audioUrl) audioUrl = dlUrl;
          else if (isImage) imageUrls.push(dlUrl);
          else if (!videoUrl || label.includes('no_watermark') || label.includes('hd')) videoUrl = dlUrl;
        }

        let tasks = [];
        if (videoUrl) {
          tasks.push((async () => {
            let bufferRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 90000 });
            let buffer = Buffer.from(bufferRes.data);
            if (buffer.byteLength >= 5000) await sock.sendMessage(from, { video: buffer, caption: imageUrls.length === 0 ? captionMsg : undefined }, { quoted: msg });
          })());
        }
        if (audioUrl) tasks.push(sock.sendMessage(from, { audio: { url: audioUrl }, mimetype: 'audio/mp4' }, { quoted: msg }));
        if (imageUrls.length > 0) {
          for (let i = 0; i < imageUrls.length; i++) {
            let idx = i;
            tasks.push((async () => {
              let bufferRes = await axios.get(imageUrls[idx], { responseType: 'arraybuffer', timeout: 60000 });
              let buffer = Buffer.from(bufferRes.data);
              if (buffer.byteLength >= 2000) await sock.sendMessage(from, { image: buffer, caption: idx === 0 ? captionMsg : undefined }, { quoted: msg });
            })());
          }
        }
        await Promise.all(tasks);
      } catch (err) { await sock.sendMessage(from, { text: `❌ Error: ${err.message}` }); }
      return true;
    }

    // ==================== TO MP3 ====================
    if (cmd === 'tomp3') {
      try {
        let q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
        let mime = (q.imageMessage || q.videoMessage || q.audioMessage || q.documentMessage) ? Object.keys(q)[0] : null;
        if (!mime) { await sock.sendMessage(from, { text: `❌ Reply video/audio dengan ${prefix}tomp3` }); return true; }

        await sock.sendMessage(from, { text: "⏳ *Mengonversi ke MP3...*" });
        let stream = await downloadContentFromMessage(q[mime], mime.replace('Message', ''));
        let buffer = Buffer.from([]);
        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

        let timeId = Date.now();
        let tmpIn = `./temp_in_${timeId}.media`;
        let tmpOut = `./temp_out_${timeId}.mp3`;
        fs.writeFileSync(tmpIn, buffer);

        exec(`ffmpeg -i ${tmpIn} -vn -acodec libmp3lame -q:a 2 ${tmpOut}`, async (err) => {
          if (err) { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); return sock.sendMessage(from, { text: "❌ FFMPEG Error." }); }
          await sock.sendMessage(from, { audio: fs.readFileSync(tmpOut), mimetype: 'audio/mpeg', ptt: false });
          if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
          if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        });
      } catch (err) { await sock.sendMessage(from, { text: `❌ Error: ${err.message}` }); }
      return true;
    }

    // ==================== FACEBOOK ====================
    if (cmd === 'fb' || cmd === 'fbdl' || cmd === 'facebook') {
      if (!args[0]) { await sock.sendMessage(from, { text: `❌ Format: ${prefix}${cmd} [URL Facebook]` }); return true; }
      let url = args[0];
      if (!url.includes('facebook.com') && !url.includes('fb.watch') && !url.includes('fb.com')) {
        await sock.sendMessage(from, { text: "❌ Link tidak valid!" }); return true;
      }
      await sock.sendMessage(from, { text: "🚀 *Mengekstrak video Facebook...*" });

      try {
        const apiRes = await fetch(`https://api.azbry.com/api/download/facebook?url=${encodeURIComponent(url)}`);
        const json = await apiRes.json();
        if (!json.status || !json.result || !json.result.medias || json.result.medias.length === 0) {
          await sock.sendMessage(from, { text: "❌ Gagal mengambil data." }); return true;
        }
        const { title, medias } = json.result;
        let videoUrl = medias.find(m => m.quality === 'hd')?.url || medias.find(m => m.quality === 'sd')?.url || medias[0].url;
        await sock.sendMessage(from, { video: { url: videoUrl }, caption: `🔵 *FACEBOOK DOWNLOADER*\n\n📝 *Judul:* ${title || '-'}` }, { quoted: msg });
      } catch (err) { await sock.sendMessage(from, { text: `❌ Error: ${err.message}` }); }
      return true;
    }

    // ==================== YTMP4 ====================
    if (cmd === 'ytmp4') {
      if (!args[0]) { await sock.sendMessage(from, { text: `❌ Format: ${prefix}ytmp4 [URL YouTube]` }); return true; }
      await sock.sendMessage(from, { text: "⏳ *Memproses video YouTube...*" });

      try {
        const ytApis = [
          { url: `https://api.azbry.com/api/download/ytmp4?url=${encodeURIComponent(args[0])}`, isAz: true },
        ];

        let videoUrl = null, title = 'Video', author = '-', quality = 'Auto', duration = 0;
        let apiSuccess = false;

        for (let api of ytApis) {
          try {
            let res = await axiosGetWithRetry(api.url, { timeout: 25000 });
            if (!res.data || res.data.status !== true || !res.data.result || !res.data.result.download) {
              continue; 
            }
            title = res.data.result.title || title;
            author = res.data.result.author || author;
            quality = res.data.result.quality || quality;
            duration = res.data.result.duration || duration;
            videoUrl = res.data.result.download;
            apiSuccess = true;
            break; 
          } catch (e) {
            continue; 
          }
        }

        if (!apiSuccess || !videoUrl) {
          throw new Error("Semua server download tidak merespon. Coba lagi nanti.");
        }

        let buffer = null;
        let bufferError = null;
        const timeouts = [60000, 180000]; 
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            let bufferRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: timeouts[attempt] });
            buffer = Buffer.from(bufferRes.data);
            if (buffer.byteLength >= 50000) break; 
            bufferError = "File terlalu kecil (korup).";
          } catch (e) {
            bufferError = e.message;
            if (attempt === 0) {
              await sock.sendMessage(from, { text: "⏳ *Mengunduh video...* (file besar mungkin butuh waktu lebih lama)" });
              await new Promise(r => setTimeout(r, 3000));
            }
          }
        }

        if (!buffer || buffer.byteLength < 50000) {
          throw new Error(`Gagal mengunduh video: ${bufferError || 'File korup'}`);
        }

        let safeTitle = (title || "Video").replace(/[\\/:*?"<>|]/g, '');
        let sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(1);

        const WA_VIDEO_INLINE_LIMIT = 16 * 1024 * 1024;
        if (buffer.byteLength > WA_VIDEO_INLINE_LIMIT) {
          await sock.sendMessage(from, {
            document: buffer,
            mimetype: 'video/mp4',
            fileName: `${safeTitle}.mp4`,
            caption: `✅ *YouTube MP4*\n\n📌 *Title:* ${title}\n👤 *Author:* ${author || '-'}\n📺 *Kualitas:* ${quality || 'Auto'}\n📦 *Ukuran:* ${sizeMB} MB\n\n_⚠️ Video terlalu besar untuk preview inline. Silakan download file di atas._`
          });
        } else {
          await sock.sendMessage(from, {
            video: buffer,
            caption: `✅ *YouTube MP4*\n\n📌 *Title:* ${title}\n👤 *Author:* ${author || '-'}\n📺 *Kualitas:* ${quality || 'Auto'}\n📦 *Ukuran:* ${sizeMB} MB`,
            fileName: `${safeTitle}.mp4`
          });
        }
      } catch (err) {
        await sock.sendMessage(from, { text: `❌ *Gagal download video.*\n_${err.message}_\n\n💡 Tips: Coba gunakan ${prefix}ytmp3 untuk audio saja.` });
      }
      return true;
    }

    // ==================== YTMP3 ====================
    if (cmd === 'ytmp3') {
      if (!args[0]) { await sock.sendMessage(from, { text: `❌ Format: ${prefix}ytmp3 [URL YouTube]` }); return true; }
      await sock.sendMessage(from, { text: "⏳ *Memproses audio YouTube...*" });

      try {
        let res = await axiosGetWithRetry(`https://api.azbry.com/api/download/ytmp3?url=${encodeURIComponent(args[0])}`, { timeout: 25000 });
        if (!res.data || res.data.status !== true || !res.data.result) throw new Error("Gagal.");
        let mediaUrls = extractMediaUrls(res.data.result);
        let finalUrl = mediaUrls.find(u => u.includes('.mp3')) || mediaUrls[0];
        if (!finalUrl) throw new Error("Link tidak ditemukan.");
        let title = res.data.result.title || "Audio";
        await sock.sendMessage(from, { audio: { url: finalUrl }, mimetype: 'audio/mpeg', ptt: false });
        await sock.sendMessage(from, { document: { url: finalUrl }, mimetype: 'audio/mpeg', fileName: `${title}.mp3` });
      } catch (err) { await sock.sendMessage(from, { text: `❌ Error: ${err.message}` }); }
      return true;
    }

    // ==================== RVO (View Once) ====================
    if (cmd === 'rvo') {
      try {
        let isValidQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!isValidQuoted) {
          await sock.sendMessage(from, { text: `❌ Reply pesan 'Sekali Lihat' dengan ${prefix}rvo` });
          return true;
        }

        let quoted = isValidQuoted;
        let mediaObj = null;
        let typeStream = null; 
        let captionMedia = '';

        let viewOnceKey = Object.keys(quoted).find(k => k.toLowerCase().includes('viewonce'));

        if (viewOnceKey) {
            let innerMsg = quoted[viewOnceKey]?.message || quoted[viewOnceKey];
            let msgType = Object.keys(innerMsg).find(k => k.endsWith('Message'));

            if (msgType) {
                mediaObj = innerMsg[msgType];
                typeStream = msgType.replace('Message', '');
                captionMedia = mediaObj.caption || '';
            }
        } else {
            let msgType = Object.keys(quoted).find(k => k.endsWith('Message'));
            if (msgType && quoted[msgType]?.viewOnce) {
                mediaObj = quoted[msgType];
                typeStream = msgType.replace('Message', '');
                captionMedia = mediaObj.caption || '';
            }
        }

        if (!mediaObj || !typeStream) {
          await sock.sendMessage(from, { text: "❌ Ini bukan pesan sekali lihat yang valid atau tipe media tidak didukung." });
          console.log('[RVO DEBUG] Quoted keys yang ditangkap bot:', Object.keys(quoted));
          return true;
        }

        await sock.sendMessage(from, { text: "⏳ *Mengekstrak pesan sekali lihat...*" });

        let stream = await downloadContentFromMessage(mediaObj, typeStream);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

        let finalCaption = `✅ *Pesan Sekali Lihat Dibuka*\n${captionMedia}`;

        if (typeStream === 'image') {
          await sock.sendMessage(from, { image: buffer, caption: finalCaption }, { quoted: msg });
        } else if (typeStream === 'video') {
          await sock.sendMessage(from, { video: buffer, caption: finalCaption }, { quoted: msg });
        } else if (typeStream === 'audio') {
          await sock.sendMessage(from, { audio: buffer, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
        } else {
          await sock.sendMessage(from, { text: `❌ Tipe media (${typeStream}) tidak dikenali.` });
        }

      } catch (err) {
        console.error('[RVO ERROR]', err);
        await sock.sendMessage(from, { text: `❌ *Gagal membuka rvo:* ${err.message}` });
      }
      return true;
    }

    // ==================== TIKTOK ====================
    if (cmd === 'tt' || cmd === 'tiktok') {
      if (!args[0]) { await sock.sendMessage(from, { text: `❌ Format: ${prefix}${cmd} [URL TikTok]` }); return true; }
      let url = args[0];
      await sock.sendMessage(from, { text: "⏳ *Memproses tautan TikTok...*" })

      try {
        let res = await axios.get(`https://api.azbry.com/api/download/tiktok?url=${encodeURIComponent(url)}`, { timeout: 20000 });
        if (!res.data || res.data.status !== true || !res.data.result) throw new Error("Gagal.");
        let mediaUrls = extractMediaUrls(res.data.result);
        let videoUrl = mediaUrls.find(u => u.includes('nwm') || u.includes('nowatermark') || u.includes('.mp4')) || mediaUrls[0];
        if (!videoUrl) throw new Error("Video tidak ditemukan.");
        let bufferRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 60000 });
        let buffer = Buffer.from(bufferRes.data);
        await sock.sendMessage(from, { video: buffer, caption: "✅ *TikTok Downloader Berhasil*" });
      } catch (err) { await sock.sendMessage(from, { text: `❌ Error: ${err.message}` }); }
      return true;
    }

    // ==================== STIKER ====================
    if (cmd === 's' || cmd === 'stiker' || cmd === 'sticker') {
      try {
        let qObj = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
        let isImg = qObj?.imageMessage ? true : false;
        let isVid = qObj?.videoMessage ? true : false;
        let mData = isImg ? qObj.imageMessage : (isVid ? qObj.videoMessage : null);
        let mType = isImg ? 'image' : (isVid ? 'video' : null);

        if (!mData) { await sock.sendMessage(from, { text: `❌ Reply gambar/video dengan ${prefix}${cmd}` }); return true; }
        await sock.sendMessage(from, { text: "⏳ *Memproses stiker...*" });

        let stream = await downloadContentFromMessage(mData, mType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

        let timeId = Date.now();
        let tmpIn = `./temp_${timeId}.${isImg ? 'jpg' : 'mp4'}`;
        let tmpOut = `./temp_${timeId}.webp`;
        fs.writeFileSync(tmpIn, buffer);

        let filter = `scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000`;
        let ffmpegCmd = isVid
          ? `ffmpeg -i ${tmpIn} -vcodec libwebp -filter:v "${filter}" -q:v 40 -lossless 0 -preset default -loop 0 -an -vsync 0 -t 8 -fs 800000 ${tmpOut}`
          : `ffmpeg -i ${tmpIn} -vcodec libwebp -filter:v "${filter}" -lossless 1 -preset default -an -vsync 0 ${tmpOut}`;

        exec(ffmpegCmd, async (err) => {
          if (err) { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); return sock.sendMessage(from, { text: "❌ FFMPEG Error." }); }
          try {
            let webpBuf = fs.readFileSync(tmpOut);
            const img = new webp.Image();
            await img.load(webpBuf);

            let authorName = (u && u.name) ? u.name : (msg.pushName || sender.split('@')[0]);
            const json = {
              'sticker-pack-id': `RyouMada-${Date.now()}`,
              'sticker-pack-name': "RyouMada",
              'sticker-pack-publisher': authorName,
              'emojis': ['🤖', '✨']
            };
            let exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
            let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
            let exif = Buffer.concat([exifAttr, jsonBuffer]);
            exif.writeUIntLE(jsonBuffer.length, 14, 4);
            img.exif = exif;
            let finalSticker = await img.save(null);

            await sock.sendMessage(from, { sticker: finalSticker }, { quoted: msg });
          } catch (e) {
            console.error("Watermark Injector Error:", e);
            await sock.sendMessage(from, { sticker: fs.readFileSync(tmpOut) }, { quoted: msg });
          }
          if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
          if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        });
      } catch (err) { await sock.sendMessage(from, { text: `❌ Error: ${err.message}` }); }
      return true;
    }

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
        let apiUrl = isVideo
          ? `https://api.azbry.com/api/maker/bratvid?text=${encodeURIComponent(text)}`
          : `https://api.azbry.com/api/maker/brat?text=${encodeURIComponent(text)}`;

        let bufferRes = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 60000 });
        let buffer = Buffer.from(bufferRes.data);

        let timeId = Date.now();
        let tmpIn = `./temp_brat_${timeId}.${isVideo ? 'mp4' : 'png'}`;
        let tmpOut = `./temp_brat_${timeId}.webp`;
        fs.writeFileSync(tmpIn, buffer);

        let filter = `scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000`;
        let ffmpegCmd = isVideo
          ? `ffmpeg -i ${tmpIn} -vcodec libwebp -filter:v "${filter}" -q:v 40 -lossless 0 -preset default -loop 0 -an -vsync 0 -t 8 -fs 800000 ${tmpOut}`
          : `ffmpeg -i ${tmpIn} -vcodec libwebp -filter:v "${filter}" -lossless 1 -preset default -an -vsync 0 ${tmpOut}`;

        exec(ffmpegCmd, async (err) => {
          if (err) {
            if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
            return sock.sendMessage(from, { text: "❌ FFMPEG Error: Gagal mengonversi brat menjadi stiker." });
          }
          try {
            let webpBuf = fs.readFileSync(tmpOut);
            const img = new webp.Image();
            await img.load(webpBuf);

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
            await sock.sendMessage(from, { sticker: finalSticker }, { quoted: msg });
          } catch (e) {
            console.error("Watermark Injector Error pada Brat:", e);
            await sock.sendMessage(from, { sticker: fs.readFileSync(tmpOut) }, { quoted: msg });
          }
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