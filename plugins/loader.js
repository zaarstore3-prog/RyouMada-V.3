// =========================================================
// PLUGIN LOADER - RyoMada V.3.1
// Sistem plugin yang memuat semua command dari file terpisah
// =========================================================
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

// =========================================================
// Muat semua plugin dari direktori plugins/
// Plugin adalah file .js yang mengekspor default object
// dengan struktur: { name, version, commands[], handler() }
// =========================================================
export async function loadPlugins() {
  const plugins = [];
  const pluginDir = __dirname;

  const files = fs.readdirSync(pluginDir).filter(f => 
    f.endsWith('.js') && f !== 'loader.js' && f !== 'index.js'
  );

  for (const file of files) {
    try {
      const pluginPath = `./${file}`;
      const pluginModule = await import(pluginPath);
      
      if (pluginModule.default && pluginModule.default.commands) {
        plugins.push(pluginModule.default);
      }
    } catch (err) {
      console.error(`[PLUGIN] Gagal memuat ${file}:`, err.message);
    }
  }

  return plugins;
}

// =========================================================
// Buat command map dari daftar plugin
// Output: { commandName: { plugin, handler } }
// =========================================================
export function buildCommandMap(plugins) {
  const commandMap = new Map();
  
  for (const plugin of plugins) {
    if (!plugin.commands || !plugin.handler) continue;
    
    for (const cmd of plugin.commands) {
      commandMap.set(cmd, {
        plugin: plugin.name,
        handler: plugin.handler
      });
    }
  }
  
  return commandMap;
}

// =========================================================
// Inisialisasi plugin system
// =========================================================
export async function initPlugins() {
  const plugins = await loadPlugins();
  const commandMap = buildCommandMap(plugins);
  
  console.log(`[PLUGIN] ${plugins.length} plugin dimuat dengan ${commandMap.size} command`);
  
  return { plugins, commandMap };
}
