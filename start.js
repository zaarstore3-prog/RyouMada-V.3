// =========================================================
// START WRAPPER - RyoMada V.3.1
// Menjalankan bot WhatsApp + HTTP health server untuk preview
// =========================================================
import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';

const PORT = parseInt(process.env.PORT || '3000');
const ZIP_PATH = './RyouMada_V3.1_FINAL.zip';

// HTTP server untuk health check + download ZIP
const server = http.createServer((req, res) => {
  // === Route: /download — langsung download ZIP ===
  if (req.url === '/download') {
    if (!fs.existsSync(ZIP_PATH)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('File ZIP belum tersedia. Jalankan npm run build terlebih dahulu.');
      return;
    }
    const stat = fs.statSync(ZIP_PATH);
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="RyouMada_V3.1_FINAL.zip"',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    const readStream = fs.createReadStream(ZIP_PATH);
    readStream.pipe(res);
    return;
  }

  // === Route: / — landing page dengan tombol download ===
  const isAuth = fs.existsSync('./auth_session/creds.json');
  const zipExists = fs.existsSync(ZIP_PATH);
  const zipSize = zipExists ? (fs.statSync(ZIP_PATH).size / 1024 / 1024).toFixed(1) : '?';

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><title>RyouMada V3.1</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
        min-height: 100vh;
        display: flex; align-items: center; justify-content: center;
        color: #fff; padding: 20px;
      }
      .card {
        background: rgba(255,255,255,0.06);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 24px;
        padding: 48px 40px;
        max-width: 460px;
        width: 100%;
        text-align: center;
      }
      .logo { font-size: 72px; margin-bottom: 12px; }
      h1 {
        font-size: 30px; margin-bottom: 8px;
        background: linear-gradient(45deg, #f093fb, #f5576c);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .version {
        display: inline-block;
        background: rgba(255,255,255,0.1);
        padding: 4px 14px;
        border-radius: 20px;
        font-size: 13px;
        color: rgba(255,255,255,0.6);
        margin-bottom: 24px;
      }
      .desc { color: rgba(255,255,255,0.65); margin-bottom: 28px; line-height: 1.7; font-size: 15px; }
      .btn {
        display: inline-block;
        padding: 16px 48px;
        background: linear-gradient(45deg, #f093fb, #f5576c);
        color: #fff;
        text-decoration: none;
        border-radius: 12px;
        font-weight: 700;
        font-size: 18px;
        transition: transform 0.2s, box-shadow 0.2s;
        box-shadow: 0 8px 32px rgba(245,87,108,0.35);
        cursor: pointer;
        border: none;
      }
      .btn:hover { transform: translateY(-2px); box-shadow: 0 12px 44px rgba(245,87,108,0.45); }
      .btn:active { transform: translateY(0); }
      .info {
        margin-top: 24px;
        display: flex; gap: 16px; justify-content: center;
        font-size: 13px; color: rgba(255,255,255,0.4);
      }
      .info span {
        background: rgba(255,255,255,0.06);
        padding: 6px 14px;
        border-radius: 10px;
      }
      .badge { display: inline-block; padding: 4px 16px; border-radius: 20px; font-size: 13px; margin: 8px 0; }
      .online { background: #00c853; color: #000; }
      .waiting { background: #ff9100; color: #000; }
      .footer { margin-top: 28px; font-size: 12px; color: rgba(255,255,255,0.25); }
    </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">🤖</div>
        <h1>RyouMada V3.1</h1>
        <div class="version">⚡ Multi-Bot Edition</div>
        <p class="desc">
          WhatsApp Bot dengan BigInt Economy,<br>
          Plugin System &amp; Multi-Bot Support
        </p>
        <a href="/download" class="btn" download>📥 Download ZIP</a>
        <div class="info">
          <span>📦 ${zipExists ? zipSize + ' MB' : '⏳'}</span>
          <span>🧩 20 Plugins</span>
          <span>⚡ 173 Commands</span>
        </div>
        <p style="margin-top:16px;">
          Bot <span class="badge ${isAuth ? 'online' : 'waiting'}">${isAuth ? '✅ Sesi Tersimpan' : '⏳ Menunggu Pairing'}</span>
        </p>
        <div class="footer">${new Date().toISOString().slice(0,19).replace('T',' ')} UTC</div>
      </div>
      <script>
        // Auto-redirect to download when ?dl=1 is in URL
        if (window.location.search.includes('dl=1')) {
          window.location.href = '/download';
        }
      </script>
    </body>
    </html>
  `);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Health server running on port ${PORT}`);
  console.log('🚀 Starting RyoMada V.3.1 WhatsApp Bot...');

  // Redirect stdin ke bot process
  const bot = spawn('node', ['index.js'], {
    stdio: ['inherit', 'inherit', 'inherit'],
    cwd: process.cwd()
  });

  bot.on('exit', (code) => {
    console.log(`❌ Bot exited with code ${code}`);
    process.exit(code);
  });

  process.on('SIGINT', () => { bot.kill(); process.exit(); });
  process.on('SIGTERM', () => { bot.kill(); process.exit(); });
});
