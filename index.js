const { Telegraf, Markup } = require('telegraf');
const { message } = require('telegraf/filters');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const vsett = require('./settings');

const ownerFile = 'db/owner.json';
const premiumUsersFile = 'db/premiumUsers.json';
const ressFile = 'db/ress.json';
const tkFile = 'db/tk.json';
const ptFile = 'db/pt.json';
const adminfile = 'adminID.json';
const ceoFile = 'db/Ceo.json';

if (!fs.existsSync(ownerFile)) fs.writeFileSync(ownerFile, '[]');
if (!fs.existsSync(premiumUsersFile)) fs.writeFileSync(premiumUsersFile, '[]');
if (!fs.existsSync(ressFile)) fs.writeFileSync(ressFile, '[]');
if (!fs.existsSync(tkFile)) fs.writeFileSync(tkFile, '[]');
if (!fs.existsSync(ptFile)) fs.writeFileSync(ptFile, '[]');
if (!fs.existsSync(ceoFile)) fs.writeFileSync(ceoFile, '[]');

const serversFile = 'db/servers.json';

if (!fs.existsSync('db')) fs.mkdirSync('db');
if (!fs.existsSync(serversFile)) fs.writeFileSync(serversFile, '[]');
const bot = new Telegraf(vsett.token);

async function getValidEgg(srv, plta) {
  if (!Array.isArray(vsett.eggs) || vsett.eggs.length === 0) {
    throw new Error("global.eggs kosong atau bukan array");
  }

  for (const eggId of vsett.eggs) {
    try {
      const res = await fetch(
        `${srv.domain}/api/application/nests/5/eggs/${eggId}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${plta}`
          }
        }
      );

      const json = await res.json();

      if (!json.errors && json.attributes) {
        console.log(`✅ Egg ${eggId} valid di server ${srv.domain}`);
        return {
          eggId: eggId,
          startup: json.attributes.startup
        };
      }
    } catch (err) {
      console.log(`❌ Egg ${eggId} error: ${err.message}`);
    }
  }

  throw new Error(`Semua egg tidak valid di server ${srv.domain}`);
}

const panelSpecs = {
  '1gb':  { memo: '1024', cpu: '30', disk: '1024' },
  '2gb':  { memo: '2048', cpu: '60', disk: '2048' },
  '3gb':  { memo: '3072', cpu: '90', disk: '3072' },
  '4gb':  { memo: '4048', cpu: '110', disk: '4048' },
  '5gb':  { memo: '5048', cpu: '140', disk: '5048' },
  '6gb':  { memo: '6048', cpu: '170', disk: '6048' },
  '7gb':  { memo: '7048', cpu: '200', disk: '7048' },
  '8gb':  { memo: '8048', cpu: '230', disk: '8048' },
  '9gb':  { memo: '9048', cpu: '260', disk: '9048' },
  '10gb': { memo: '10000', cpu: '500', disk: '15000' },
  'unli': { memo: '0', cpu: '0', disk: '0' }
};

const tempStorage = new Map();

function generateTempId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const cooldownMap = new Map();
const COOLDOWN_TIME = 5 * 60 * 1000; 

function checkCooldown(userId, cmd) {
  const key = `${userId}_${cmd}`;
  const lastUsed = cooldownMap.get(key);
  
  if (lastUsed) {
    const timeLeft = COOLDOWN_TIME - (Date.now() - lastUsed);
    if (timeLeft > 0) {
      const minutes = Math.ceil(timeLeft / 60000);
      return {
        onCooldown: true,
        minutesLeft: minutes,
        timeLeft: timeLeft
      };
    }
  }
  return { onCooldown: false };
}

function setCooldown(userId, cmd) {
  const key = `${userId}_${cmd}`;
  cooldownMap.set(key, Date.now());

  setTimeout(() => {
    cooldownMap.delete(key);
  }, COOLDOWN_TIME);
}

function getGreeting() {

  const options = { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false };
  const hours = parseInt(new Date().toLocaleString('id-ID', options));
  
  if (hours >= 3 && hours < 10) {
    return "Selamat Pagi.. 🌅";
  } else if (hours >= 10 && hours < 15) {
    return "Selamat Siang.. ☀️";
  } else if (hours >= 15 && hours < 18) {
    return "Selamat Sore.. 🌇";
  } else if (hours >= 18 && hours < 21) {
    return "Selamat Malam.. 🌙";
  } else {
    return "Selamat Malam.. 🌌";
  }
}
let lastAudioMessageId = null;  

// ========== FUNGSI AUTO CLEANUP SERVER ==========
async function autoCleanupServers(ctx, thresholdRAM = 90, thresholdDisk = 90) {
  const chatId = ctx?.chat?.id || 'internal';
  const startTime = Date.now();
  
  console.log('🧹 Memulai auto cleanup server...');
  
  // Baca semua server dari file
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    console.log('❌ Tidak ada server terdaftar');
    return { success: false, message: 'Tidak ada server terdaftar' };
  }

  let totalCleaned = 0;
  let totalFailed = 0;
  let cleanupResults = [];
  let serverDetails = [];

  // Loop setiap server panel
  for (const srv of servers) {
    try {
      // Cek koneksi ke server
      const testConn = await fetch(`${srv.domain}/api/application/servers?page=1`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${srv.plta}`
        },
        timeout: 5000
      });

      if (!testConn.ok) {
        serverDetails.push(`❌ ${srv.name || srv.domain} - Gagal konek`);
        continue;
      }

      serverDetails.push(`✅ ${srv.name || srv.domain} - Memeriksa server...`);

      let page = 1;
      let totalPages = 1;
      let serversToDelete = [];

      // Ambil semua server dari panel ini
      do {
        const f = await fetch(`${srv.domain}/api/application/servers?page=${page}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${srv.plta}`,
          },
        });

        const res = await f.json();
        const panelServers = res.data;
        totalPages = res.meta.pagination.total_pages;

        for (const server of panelServers) {
          const s = server.attributes;
          
          try {
            // Ambil detail resources server
            const resourceCheck = await fetch(
              `${srv.domain}/api/client/servers/${s.uuid.split("-")[0]}/resources`,
              {
                method: "GET",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${srv.pltc}`,
                },
                timeout: 5000
              }
            );

            const resourceData = await resourceCheck.json();
            
            if (resourceData.attributes) {
              const resources = resourceData.attributes;
              
              // Hitung penggunaan dalam persen
              const ramLimit = s.limits.memory; // dalam MB
              const diskLimit = s.limits.disk; // dalam MB
              
              // Kalo unlimited (0), skip
              if (ramLimit === 0 || diskLimit === 0) continue;
              
              const ramUsed = resources.resources.memory_bytes / 1024 / 1024; // konversi ke MB
              const diskUsed = resources.resources.disk_bytes / 1024 / 1024; // konversi ke MB
              
              const ramPercent = (ramUsed / ramLimit) * 100;
              const diskPercent = (diskUsed / diskLimit) * 100;
              
              // Cek apakah melebihi threshold
              if (ramPercent >= thresholdRAM || diskPercent >= thresholdDisk) {
                serversToDelete.push({
                  id: s.id,
                  name: s.name,
                  uuid: s.uuid,
                  ramPercent: ramPercent.toFixed(2),
                  diskPercent: diskPercent.toFixed(2),
                  ramUsed: ramUsed.toFixed(0),
                  ramLimit: ramLimit,
                  diskUsed: diskUsed.toFixed(0),
                  diskLimit: diskLimit,
                  reason: ramPercent >= thresholdRAM ? 'RAM' : 'Disk'
                });
              }
            }
          } catch (err) {
            console.log(`Gagal ambil resources server ${s.id}:`, err.message);
          }
        }

        page++;
      } while (page <= totalPages);

      // Hapus server yang melebihi threshold
      if (serversToDelete.length > 0) {
        for (const srvToDel of serversToDelete) {
          try {
            const del = await fetch(`${srv.domain}/api/application/servers/${srvToDel.id}`, {
              method: "DELETE",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${srv.plta}`,
              },
            });

            if (del.status === 204) {
              totalCleaned++;
              cleanupResults.push(`✅ ${srvToDel.name} - ${srvToDel.reason}: ${srvToDel.reason === 'RAM' ? srvToDel.ramPercent + '%' : srvToDel.diskPercent + '%'}`);
              
              // Kirim notifikasi ke owner (opsional)
              if (ctx) {
                await ctx.telegram.sendMessage(vsett.adminId, `
⚠️ <b>SERVER AUTO-DELETED</b>

<b>Server:</b> ${srvToDel.name}
<b>Panel:</b> ${srv.name || srv.domain}
<b>Alasan:</b> ${srvToDel.reason} ${srvToDel.reason === 'RAM' ? srvToDel.ramPercent + '%' : srvToDel.diskPercent + '%'}
<b>Used:</b> ${srvToDel.reason === 'RAM' ? srvToDel.ramUsed + 'MB / ' + srvToDel.ramLimit + 'MB' : srvToDel.diskUsed + 'MB / ' + srvToDel.diskLimit + 'MB'}
                `, { parse_mode: 'HTML' }).catch(() => {});
              }
            } else {
              totalFailed++;
              cleanupResults.push(`❌ ${srvToDel.name} - Gagal dihapus`);
            }
          } catch (err) {
            totalFailed++;
            cleanupResults.push(`❌ ${srvToDel.name} - Error: ${err.message}`);
          }
        }
        
        serverDetails[serverDetails.length - 1] = `✅ ${srv.name || srv.domain} - Dihapus: ${serversToDelete.length} server (RAM/Disk penuh)`;
      } else {
        serverDetails[serverDetails.length - 1] = `✅ ${srv.name || srv.domain} - Tidak ada server perlu dibersihkan`;
      }

    } catch (error) {
      console.error(`Error di server ${srv.domain}:`, error);
      serverDetails.push(`❌ ${srv.name || srv.domain} - Error: ${error.message}`);
    }
  }

  const processTime = ((Date.now() - startTime) / 1000).toFixed(2);
  
  return {
    success: true,
    totalCleaned,
    totalFailed,
    cleanupResults,
    serverDetails,
    processTime
  };
}


// ========== AUTO CLEANUP SCHEDULER (JALAN OTOMATIS) ==========
function startAutoCleanupScheduler(intervalMinutes = 60) {

  setInterval(async () => {
    console.log('🕐 Menjalankan auto cleanup terjadwal...');
    
    const result = await autoCleanupServers(null, 90, 90); // Threshold 90%
    
    if (result.totalCleaned > 0) {
      console.log(`✅ Auto cleanup selesai: ${result.totalCleaned} server dihapus`);
      
      // Kirim laporan ke owner via console (atau bisa ditambah ke telegram)
      let report = `🧹 AUTO CLEANUP REPORT\n`;
      report += `Total dihapus: ${result.totalCleaned}\n`;
      report += `Gagal: ${result.totalFailed}\n`;
      result.cleanupResults.slice(0, 5).forEach(item => {
        report += `${item}\n`;
      });
      console.log(report);
    } else {
      console.log('ℹ️ Tidak ada server perlu dibersihkan');
    }
    
  }, intervalMinutes * 60 * 1000);
}

// ========== GLOBAL VARIABLE UNTUK COMMAND STATS ==========
let commandStats = {
  total: 0,
  perKategori: {
    umum: 0,
    owner: 0,
    server: 0,
    cleanup: 0,
    panel: 0
  }
};

// ========== FUNGSI AUTO DETECT ALL COMMANDS ==========
function updateCommandStats() {
  const commands = {
    umum: [],
    owner: [],
    server: [],
    cleanup: [],
    panel: []
  };
  
// Auto detect dari bot handlers
if (bot && bot.bot && bot.bot.handlers) {
  // Loop semua command handler
  for (const [key, handler] of Object.entries(bot.bot.handlers)) {
    if (key.startsWith('command:')) {
      const cmd = key.replace('command:', '');
      
      // Kategorikan berdasarkan pola
      if (cmd.match(/^(start|info|ping|commands|id)$/)) {
        commands.umum.push(cmd);
      }
      else if (cmd.match(/^(add|del)$/)) {  // ✅ UPDATE INI
        commands.owner.push(cmd);
      }
      else if (cmd.match(/^(addserver|listserver|delserver|delallserver|delsrvoff|clearoff|totalserver|listadmin|listsrv|delsrv|listusr|delusr|cekserver)$/)) {
        commands.server.push(cmd);
      }
      else if (cmd.match(/^(cleanup|cekpenuh|setcleanup|refreshcmds)$/)) {
        commands.cleanup.push(cmd);
      }
      else if (cmd.match(/^(cpa|cadp)$/)) {
        commands.panel.push(cmd);
      }
    }
  }
}

// Fallback manual list kalo auto detect gagal
if (commands.umum.length === 0) {
  commands.umum = ['start', 'info', 'ping', 'commands', 'id'];
  commands.owner = [
    'add', 'del'
  ];
  commands.server = [
    'addserver', 'listserver', 'delserver', 'delallserver',
    'delsrvoff', 'clearoff', 'totalserver', 'listadmin',
    'listsrv', 'delsrv', 'listusr', 'delusr', 'cekserver'
  ];
  commands.cleanup = ['cleanup', 'cekpenuh', 'setcleanup', 'refreshcmds'];
  commands.panel = ['cpa', 'cadp'];
}
  
  // Hitung total
  const total = Object.values(commands).flat().length;
  
  // Update global stats
  commandStats = {
    total,
    perKategori: {
      umum: commands.umum.length,
      owner: commands.owner.length,
      server: commands.server.length,
      cleanup: commands.cleanup.length,
      panel: commands.panel.length
    },
    list: commands
  };

  return commandStats;
}

/*
⬇️-----------Starting fitur------------⬇️
*/
bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  const sender = ctx.from.username || 'tanpa_username';
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || '';
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  const runtime = `${hours} Jam ${minutes} Menit ${seconds} Detik`;
  const stats = updateCommandStats();
  
  // Cek role user
  const ownerUsers = JSON.parse(fs.readFileSync(ownerFile));
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const ressUsers = JSON.parse(fs.readFileSync(ressFile));
  const tkUsers = JSON.parse(fs.readFileSync(tkFile));
  const ptUsers = JSON.parse(fs.readFileSync(ptFile));
  const ceoUsers = JSON.parse(fs.readFileSync(ceoFile));
  const adminUsers = JSON.parse(fs.readFileSync(adminfile));
  
  let userRole = 'User Gratisan Gak Modal🗿🤣';
  if (userId.toString() === vsett.adminId) userRole = 'OWNER UTAMA';
  else if (adminUsers.includes(userId.toString())) userRole = 'PEMILIK PANEL';
  else if (ceoUsers.includes(userId.toString())) userRole = 'CEO PANEL';
  else if (ptUsers.includes(userId.toString())) userRole = 'PT PANEL';
  else if (ownerUsers.includes(userId.toString())) userRole = 'OWN PANEL';
  else if (tkUsers.includes(userId.toString())) userRole = 'TANGAN KANAN';
  else if (premiumUsers.includes(userId.toString())) userRole = 'PREMIUM';
  else if (ressUsers.includes(userId.toString())) userRole = 'RESELLER';
  
  const teksAwal = `
<b>${getGreeting()}, ${firstName}!</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>📋 USER INFO</b>
├─ Username : ${sender ? '@' + sender : '-'}
├─ ID : <code>${userId}</code>
╰─ Role : ${userRole}

<b>🤖 BOT INFO</b>
├─ Nama : Zyura Panel Bot
├─ Runtime : ${runtime}
├─ Total Fitur : ${stats.total}
╰─ Status : 🟢 Aktif

━━━━━━━━━━━━━━━━━━━━━━

/info  - Detail user
/ping  - Status bot
/id    - Cek ID Telegram

━━━━━━━━━━━━━━━━━━━━━━

<b>⬇️ PILIH MENU:</b>
`;

  await ctx.replyWithPhoto(
    { url: "https://files.catbox.moe/x8yq8b.png" },
    {
      caption: teksAwal,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'OWNER MENU',
              callback_data: 'owner_menu',
              style: 'primary'
            },
            {
              text: 'CREATE PANEL',
              callback_data: 'create_panel',
              style: 'success'
            }
          ],
          [
            {
              text: 'SERVER MENU',
              callback_data: 'server_menu',
              style: 'danger'
            }
          ]
        ]
      }
    }
  );
  
  const audioMsg = await ctx.replyWithAudio({
    url: "https://files.catbox.moe/gk5egu.mp3"
  });
  
  lastAudioMessageId = audioMsg.message_id;
  console.log(`Audio ID baru: ${lastAudioMessageId}`);
});
bot.action('owner_menu', async (ctx) => {
    const chatId = ctx.chat.id;
  const text = `<blockquote>╭━━━━━━━━━━━━━━━━━━━━━━╮
┃     <b>🔰 OWNER MENU</b>      
├──────────────────────┤
│  /add  - Tambah role
│  /del  - Hapus role 
└──────────────────────┘

┌──────────────────────┐
│ <b>🎭 ROLE TERSEDIA</b>     
├──────────────────────┤
│  OWNER             
│  PREMIUM           
│  RESELLER          
│  TANGAN KANAN      
│  PT PANEL          
│  CEO PANEL         
│  PEMILIK PANEL     
└──────────────────────┘
</blockquote>
  `;
  await ctx.deleteMessage();

  if (lastAudioMessageId) {
    try {
      await ctx.telegram.deleteMessage(chatId, lastAudioMessageId);
      console.log(`Audio ID ${lastAudioMessageId} dihapus`);
      lastAudioMessageId = null;  
    } catch (err) {
      console.log('Gagal hapus audio:', err.message);
    }
  }
  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: ' KEMBALI',
            callback_data: 'back_to_start',
            style: 'danger',
            icon_custom_emoji_id: '5311020286356236428'
          }
        ]
      ]
    }
  });
  
  await ctx.answerCbQuery();
});
bot.action('server_menu', async (ctx) => {
    const chatId = ctx.chat.id;
  const text = `
<blockquote><b>🖥️ SERVER MENU</b>
━━━━━━━━━━━━━━━━━━━━

/listsrv   - List semua server
/listusr   - List semua user
/listadmin - List admin panel
/totalserver - Total semua server
/delsrv     - Hapus server by ID
/delusr     - Hapus user by ID
/delsrvoff  - Hapus server offline
/clearoff   - Hapus semua user & server offline
/cekpenuh   - Cek server penuh
/cleanup    - Hapus server penuh (RAM/Disk)
/setcleanup - Atur auto cleanup

━━━━━━━━━━━━━━━━━━━━
</blockquote>

<b>⚠️ Perintah tertentu khusus Owner</b>
  `;
  await ctx.deleteMessage();

  if (lastAudioMessageId) {
    try {
      await ctx.telegram.deleteMessage(chatId, lastAudioMessageId);
      console.log(`Audio ID ${lastAudioMessageId} dihapus`);
      lastAudioMessageId = null;  // Reset ID audio
    } catch (err) {
      console.log('Gagal hapus audio:', err.message);
    }
  }

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: ' KEMBALI',
            callback_data: 'back_to_start',
            style: 'primary',
            icon_custom_emoji_id: '5311020286356236428'
          }
        ]
      ]
    }
  });
  
  await ctx.answerCbQuery();
});

bot.action('create_panel', async (ctx) => {
    const chatId = ctx.chat.id;
  const text = `
<b>━━━━━━━━━━━━━━━━━━━━</b>
<b>📦 CREATE PANEL MENU</b>
<b>━━━━━━━━━━━━━━━━━━━━</b>

<blockquote>┏━━━━━━━━━━━━━━━━━━┓
┃ <b>💾 CREATE PANEL</b>
┣━━━━━━━━━━━━━━━━━━┛
┗ /cpa - Create Panel

┏━━━━━━━━━━━━━━━━━━┓
┃ <b>👑 ADMIN PANEL</b>
┣━━━━━━━━━━━━━━━━━━┛
┗ /cadp - Create Admin Panel
</blockquote>
  `;
  await ctx.deleteMessage();

  if (lastAudioMessageId) {
    try {
      await ctx.telegram.deleteMessage(chatId, lastAudioMessageId);
      console.log(`Audio ID ${lastAudioMessageId} dihapus`);
      lastAudioMessageId = null;
    } catch (err) {
      console.log('Gagal hapus audio:', err.message);
    }
  }

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: ' CARA CREATE',
            callback_data: 'usage_info',
            style: 'success',
            icon_custom_emoji_id: '5301096984617166561'
          }
        ],
        [
          {
            text: ' KEMBALI',
            callback_data: 'back_to_start',
            style: 'primary',
            icon_custom_emoji_id: '5311020286356236428'
          }
        ]
      ]
    }
  });
  
  await ctx.answerCbQuery();
});
bot.action('usage_info', async (ctx) => {
  const chatId = ctx.chat.id;
  const usageText = `<b>📖 CARA PAKAI</b>
<blockquote expandable>↬ <b>Contoh Buat Panel (Pribadi):</b> 
/cpa nama

↬ <b>Contoh Buat Panel (Kirim ke buyer):</b> 
/cpa nama,idtelegram

↬ <b>Contoh Buat Admin Panel (Pribadi):</b> 
/cadp nama

↬ <b>Contoh Buat Admin Panel (Kirim ke buyer):</b> 
/cadp nama,idtelegram

━━━━━━━━━━━━━━━━━━━━
<b>📌 Contoh Lengkap:</b>
• /cpa panelku
• /cpa panelku,12345678
• /cadp adminku
• /cadp adminku,12345678

<b>⚠️ Cooldown 5 menit per pembuatan</b>
<b>📌 Cek ID? Ketik /id lalu reply ke user</b>

<b>Pahami Baik Baik Yaww</b>
</blockquote>`;

  await ctx.deleteMessage();

  if (lastAudioMessageId) {
    try {
      await ctx.telegram.deleteMessage(chatId, lastAudioMessageId);
      console.log(`Audio ID ${lastAudioMessageId} dihapus`);
      lastAudioMessageId = null;
    } catch (err) {
      console.log('Gagal hapus audio:', err.message);
    }
  }

  await ctx.reply(usageText, {  
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🔙 KEMBALI',
            callback_data: 'create_panel',
            style: 'primary',
            icon_custom_emoji_id: '5311020286356236428'
          }
        ]
      ]
    }
  });
  
  await ctx.answerCbQuery();
});

bot.action('back_to_start', async (ctx) => {
  const sender = ctx.from.username || 'tanpa_username';
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || '';
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  const runtime = `${hours} Jam ${minutes} Menit ${seconds} Detik`;
  const stats = updateCommandStats();
  
  // Cek role user
  const ownerUsers = JSON.parse(fs.readFileSync(ownerFile));
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const ressUsers = JSON.parse(fs.readFileSync(ressFile));
  const tkUsers = JSON.parse(fs.readFileSync(tkFile));
  const ptUsers = JSON.parse(fs.readFileSync(ptFile));
  const ceoUsers = JSON.parse(fs.readFileSync(ceoFile));
  const adminUsers = JSON.parse(fs.readFileSync(adminfile));
  
  let userRole = 'User';
  if (userId.toString() === vsett.adminId) userRole = 'OWNER UTAMA';
  else if (adminUsers.includes(userId.toString())) userRole = 'PEMILIK PANEL';
  else if (ceoUsers.includes(userId.toString())) userRole = 'CEO PANEL';
  else if (ptUsers.includes(userId.toString())) userRole = 'PT PANEL';
  else if (ownerUsers.includes(userId.toString())) userRole = 'OWN PANEL';
  else if (tkUsers.includes(userId.toString())) userRole = 'TANGAN KANAN';
  else if (premiumUsers.includes(userId.toString())) userRole = 'PREMIUM';
  else if (ressUsers.includes(userId.toString())) userRole = 'RESELLER';
  
  const teksAwal = `
<b>${getGreeting()}, ${firstName}!</b>

━━━━━━━━━━━━━━━━━━━━━━

<b>📋 USER INFO</b>
├─ Username : ${sender ? '@' + sender : '-'}
├─ ID : <code>${userId}</code>
╰─ Role : ${userRole}

<b>🤖 BOT INFO</b>
├─ Nama : Zyura Panel Bot
├─ Runtime : ${runtime}
├─ Total Fitur : ${stats.total}
╰─ Status : 🟢 Aktif

━━━━━━━━━━━━━━━━━━━━━━

/info  - Detail user
/ping  - Status bot
/id    - Cek ID Telegram

━━━━━━━━━━━━━━━━━━━━━━

<b>⬇️ PILIH MENU:</b>
`;

  await ctx.deleteMessage();
  await ctx.replyWithPhoto(
    { url: "https://files.catbox.moe/6kxqxn.jpg" },
    {
      caption: teksAwal,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'OWNER MENU',
              callback_data: 'owner_menu',
              style: 'primary'
            },
            {
              text: 'CREATE PANEL',
              callback_data: 'create_panel',
              style: 'success'
            }
          ],
          [
            {
              text: 'SERVER MENU',
              callback_data: 'server_menu',
              style: 'danger'
            }
          ]
        ]
      }
    }
  );
  
  const audioMsg = await ctx.replyWithAudio({
    url: "https://files.catbox.moe/gk5egu.mp3"
  });
  
  lastAudioMessageId = audioMsg.message_id;
  console.log(`Audio ID baru: ${lastAudioMessageId}`);
});
// ========== COMMAND: CLEANUP (MANUAL) ==========
bot.command('cleanup', async (ctx) => {
  const fromId = ctx.from.id.toString();

  // Cek akses (hanya owner)
  if (fromId !== vsett.adminId) {
    return ctx.reply('❌ Khusus owner utama!');
  }

  const args = ctx.message.text.split(' ');
  const thresholdRAM = parseInt(args[1]) || 90;
  const thresholdDisk = parseInt(args[2]) || 90;

  const loadingMsg = await ctx.reply(`🧹 <b>Auto cleanup dimulai...</b>\nRAM > ${thresholdRAM}% | Disk > ${thresholdDisk}%`, {
    parse_mode: 'HTML'
  });

  const result = await autoCleanupServers(ctx, thresholdRAM, thresholdDisk);

  await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

  let report = `<blockquote><b>🧹 HASIL AUTO CLEANUP</b>\n\n`;
  report += `<b>Threshold:</b> RAM ${thresholdRAM}% | Disk ${thresholdDisk}%\n`;
  report += `<b>Total dihapus:</b> ${result.totalCleaned} server\n`;
  report += `<b>Gagal:</b> ${result.totalFailed} server\n\n`;

  if (result.cleanupResults.length > 0) {
    report += `<b>📋 Detail:</b>\n`;
    result.cleanupResults.slice(0, 10).forEach(item => {
      report += `${item}\n`;
    });
    if (result.cleanupResults.length > 10) {
      report += `...dan ${result.cleanupResults.length - 10} lainnya\n`;
    }
  }

  report += `\n⏱️ Waktu: ${result.processTime} detik</blockquote>`;

  ctx.replyWithHTML(report);
});

// ========== COMMAND: SET AUTOCLEANUP ==========
bot.command('setcleanup', async (ctx) => {
  const fromId = ctx.from.id.toString();
  const args = ctx.message.text.split(' ');

  // Cek akses (hanya owner)
  if (fromId !== vsett.adminId) {
    return ctx.reply('❌ Khusus owner utama!');
  }

  if (args.length < 2) {
    return ctx.replyWithHTML(`
<b>📋 FORMAT SETCLEANUP:</b>
<code>/setcleanup [interval menit] [ram%] [disk%]</code>

<b>Contoh:</b>
<code>/setcleanup 60 90 90</code> - Auto cleanup tiap 60 menit, RAM 90%, Disk 90%
<code>/setcleanup 30 85 80</code> - Auto cleanup tiap 30 menit, RAM 85%, Disk 80%
<code>/setcleanup off</code> - Matikan auto cleanup
    `);
  }

  if (args[1].toLowerCase() === 'off') {
    // Logic untuk matikan scheduler (perlu implementasi)
    return ctx.reply('✅ Auto cleanup dimatikan');
  }

  const interval = parseInt(args[1]);
  const ramThreshold = parseInt(args[2]) || 90;
  const diskThreshold = parseInt(args[3]) || 90;

  if (isNaN(interval) || interval < 5) {
    return ctx.reply('❌ Interval minimal 5 menit');
  }

  // Restart scheduler dengan interval baru
  // (perlu implementasi proper)

  ctx.replyWithHTML(`
✅ <b>AUTO CLEANUP DIATUR</b>

⏱️ Interval: ${interval} menit
💾 RAM Threshold: ${ramThreshold}%
📀 Disk Threshold: ${diskThreshold}%

Auto cleanup akan berjalan setiap ${interval} menit.
  `);
});
// ========== COMMAND ID ==========
bot.command('id', async (ctx) => {
  try {
    let targetMsg = ctx.message;
    
    // Cek apakah ada reply
    if (ctx.message.reply_to_message) {
      targetMsg = ctx.message.reply_to_message;
    }
    
    const from = targetMsg.from;
    const firstName = from.first_name || '';
    const lastName = from.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const targetId = from.id;
    const targetUsername = from.username || 'tidak ada';
    const isPremium = from.is_premium || false;
    
    // Format response
    const responseText = `
╭━━━━━━━━━━━━━━━━━━━━╮
┃   <b>🔍 CEK ID TELEGRAM</b>   
╰━━━━━━━━━━━━━━━━━━━━╯

<b>👤 NAMA:</b> ${fullName || firstName || targetId}
<b>🆔 ID:</b> <code>${targetId}</code>
<b>🌐 USERNAME:</b> ${targetUsername !== 'tidak ada' ? '@' + targetUsername : '<i>tidak ada</i>'}
<b>⭐ PREMIUM:</b> ${isPremium ? '✅ Ya (Telegram Premium)' : '❌ Tidak (Gratis)'}

━━━━━━━━━━━━━━━━━━━━
<i>CEK ID TELEGRAM BY BOT CREATE PANEL V2</i>
`;

    await ctx.replyWithHTML(responseText, {
      reply_to_message_id: ctx.message.message_id
    });
  } catch (error) {
    console.error('Error di command id:', error);
    await ctx.reply('❌ Terjadi kesalahan, coba lagi nanti.');
  }
});
// ========== COMMAND: CEK SERVER PENUH ==========
bot.command('cekpenuh', async (ctx) => {
  const fromId = ctx.from.id.toString();

  // Cek akses (hanya owner)
  if (fromId !== vsett.adminId) {
    return ctx.reply('❌ Khusus owner utama!');
  }

  const loadingMsg = await ctx.reply('🔍 <b>Mencari server dengan RAM/Disk penuh...</b>', {
    parse_mode: 'HTML'
  });

  const servers = JSON.parse(fs.readFileSync(serversFile));
  let fullServers = [];
  let totalChecked = 0;

  for (const srv of servers) {
    try {
      let page = 1;
      let totalPages = 1;

      do {
        const f = await fetch(`${srv.domain}/api/application/servers?page=${page}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${srv.plta}`,
          },
        });

        const res = await f.json();
        const panelServers = res.data;
        totalPages = res.meta.pagination.total_pages;

        for (const server of panelServers) {
          totalChecked++;
          const s = server.attributes;
          
          try {
            const resourceCheck = await fetch(
              `${srv.domain}/api/client/servers/${s.uuid.split("-")[0]}/resources`,
              {
                method: "GET",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${srv.pltc}`,
                },
                timeout: 5000
              }
            );

            const resourceData = await resourceCheck.json();
            
            if (resourceData.attributes) {
              const resources = resourceData.attributes;
              
              const ramLimit = s.limits.memory;
              const diskLimit = s.limits.disk;
              
              if (ramLimit === 0 || diskLimit === 0) continue;
              
              const ramUsed = resources.resources.memory_bytes / 1024 / 1024;
              const diskUsed = resources.resources.disk_bytes / 1024 / 1024;
              
              const ramPercent = (ramUsed / ramLimit) * 100;
              const diskPercent = (diskUsed / diskLimit) * 100;
              
              if (ramPercent >= 80 || diskPercent >= 80) {
                fullServers.push({
                  name: s.name,
                  panel: srv.name || srv.domain,
                  ramPercent: ramPercent.toFixed(2),
                  diskPercent: diskPercent.toFixed(2),
                  ramUsed: ramUsed.toFixed(0),
                  ramLimit: ramLimit,
                  diskUsed: diskUsed.toFixed(0),
                  diskLimit: diskLimit
                });
              }
            }
          } catch (err) {}
        }

        page++;
      } while (page <= totalPages);

    } catch (error) {}
  }

  await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

  if (fullServers.length === 0) {
    return ctx.replyWithHTML(`
<blockquote><b>✅ SEMUA SERVER AMAN</b>

Total server dicek: ${totalChecked}
Tidak ada server dengan penggunaan >80%
</blockquote>
    `);
  }

  let report = `<blockquote><b>🔴 SERVER DENGAN PENGGUNAAN TINGGI</b>\n\n`;
  report += `<b>Total:</b> ${fullServers.length} server\n\n`;

  fullServers.slice(0, 10).forEach((s, i) => {
    report += `<b>${i+1}. ${s.name}</b>\n`;
    report += `├─ Panel: ${s.panel}\n`;
    report += `├─ RAM: ${s.ramUsed}MB / ${s.ramLimit}MB (${s.ramPercent}%)\n`;
    report += `╰─ Disk: ${s.diskUsed}MB / ${s.diskLimit}MB (${s.diskPercent}%)\n\n`;
  });

  if (fullServers.length > 10) {
    report += `...dan ${fullServers.length - 10} server lainnya\n`;
  }

  report += `</blockquote>`;

  ctx.replyWithHTML(report);
});

// ========== JALANKAN AUTO CLEANUP SAAT BOT START ==========
// Aktifkan auto cleanup tiap 60 menit dengan threshold 90%
startAutoCleanupScheduler(60);

bot.command('ping', async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const msgId = ctx.message.message_id;
  const startTime = Date.now();

const loaderStickerId = vsett.QRIS_STICKER_FILE_ID;
let stickerMsg = null;

try {
  // Kirim sticker loading doang (GA ADA TEKS)
  if (loaderStickerId) {
    stickerMsg = await ctx.replyWithSticker(loaderStickerId);
  } else {
    // Fallback kalo gak ada sticker ID
    stickerMsg = await ctx.reply('⏳ <b>Loading...</b>', { 
      parse_mode: 'HTML' 
    });
  }
} catch (err) {
  console.log('Gagal kirim sticker:', err.message);
  // Fallback pake teks
  stickerMsg = await ctx.reply('⏳ <b>Loading...</b>', { 
    parse_mode: 'HTML' 
  }).catch(() => null);
}

  const now = new Date();
  const waktuJakarta = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'full' });
  const waktuMakassar = now.toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'full', timeStyle: 'full' });
  const waktuJayapura = now.toLocaleString('id-ID', { timeZone: 'Asia/Jayapura', dateStyle: 'full', timeStyle: 'full' });
  const waktuUTC = now.toUTCString();
  const waktuISO = now.toISOString();
  const waktuUnix = Math.floor(now.getTime() / 1000);
  const waktuUnixMs = now.getTime();
  const tahun = now.getFullYear();
  const bulan = now.getMonth() + 1;
  const tanggal = now.getDate();
  const hari = now.getDay();
  const jam = now.getHours();
  const menit = now.getMinutes();
  const detik = now.getSeconds();
  const milidetik = now.getMilliseconds();
  const namaHari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][hari];
  const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][bulan - 1];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneOffset = -now.getTimezoneOffset() / 60;
  const timezoneOffsetStr = `UTC${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset}`;
  const timezoneOffsetMinutes = now.getTimezoneOffset();
  const botUptimeMs = process.uptime() * 1000;
  const botUptimeSec = process.uptime();
  const botMs = botUptimeMs;
  const botDetik = Math.floor(botUptimeSec);
  const botMenit = Math.floor(botUptimeSec / 60);
  const botJam = Math.floor(botUptimeSec / 3600);
  const botHari = Math.floor(botUptimeSec / 86400);
  const botMinggu = Math.floor(botUptimeSec / 604800);
  const botBulan = Math.floor(botUptimeSec / 2592000);
  const botTahun = Math.floor(botUptimeSec / 31536000);
  const botDasawarsa = Math.floor(botUptimeSec / 315360000);
  const botAbad = Math.floor(botUptimeSec / 3153600000);
  const botDays = Math.floor(botUptimeSec / 86400);
  const botHours = Math.floor((botUptimeSec % 86400) / 3600);
  const botMinutes = Math.floor((botUptimeSec % 3600) / 60);
  const botSeconds = Math.floor(botUptimeSec % 60);
  const botMsRemain = Math.floor((botUptimeSec - Math.floor(botUptimeSec)) * 1000);
  const vpsUptimeSec = os.uptime();
  const vpsDays = Math.floor(vpsUptimeSec / 86400);
  const vpsHours = Math.floor((vpsUptimeSec % 86400) / 3600);
  const vpsMinutes = Math.floor((vpsUptimeSec % 3600) / 60);
  const vpsSeconds = Math.floor(vpsUptimeSec % 60);
  const vpsMs = vpsUptimeSec * 1000;
  const bootTime = new Date(Date.now() - (vpsUptimeSec * 1000));
  const bootTimeStr = bootTime.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'full' });
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'Tidak diketahui';
  const cpuCores = cpus.length;
  const cpuSpeedMHz = cpus[0]?.speed || 0;
  const cpuSpeedGHz = (cpuSpeedMHz / 1000).toFixed(2);

  let totalIdle = 0;
  let totalTick = 0;
  const perCoreData = [];
  
  cpus.forEach((cpu, index) => {
    let coreIdle = 0;
    let coreTick = 0;
    
    for (let type in cpu.times) {
      coreTick += cpu.times[type];
      totalTick += cpu.times[type];
    }
    coreIdle = cpu.times.idle;
    totalIdle += coreIdle;
    
    const coreUsageValue = totalTick > 0 ? ((1 - coreIdle / coreTick) * 100).toFixed(2) : '0.00';
    perCoreData.push(`Core ${index + 1}: ${coreUsageValue}%`);
  });
  
  const cpuUsagePercent = totalTick > 0 ? ((1 - totalIdle / totalTick) * 100).toFixed(2) : '0.00';

  const loadAvg = os.loadavg();
  const load1 = loadAvg[0]?.toFixed(2) || '0.00';
  const load5 = loadAvg[1]?.toFixed(2) || '0.00';
  const load15 = loadAvg[2]?.toFixed(2) || '0.00';
  const loadInterpretasi = parseFloat(load1) > cpuCores ? '🔴 OVERLOAD' : 
                          parseFloat(load1) > cpuCores * 0.7 ? '🟡 MENENGAH' : '🟢 RINGAN';
                          
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;
  const totalMemoryKB = (totalMemoryBytes / 1024).toFixed(2);
  const totalMemoryMB = (totalMemoryBytes / (1024 ** 2)).toFixed(2);
  const totalMemoryGB = (totalMemoryBytes / (1024 ** 3)).toFixed(2);
  const totalMemoryTB = (totalMemoryBytes / (1024 ** 4)).toFixed(6);
  const usedMemoryKB = (usedMemoryBytes / 1024).toFixed(2);
  const usedMemoryMB = (usedMemoryBytes / (1024 ** 2)).toFixed(2);
  const usedMemoryGB = (usedMemoryBytes / (1024 ** 3)).toFixed(2);
  const freeMemoryKB = (freeMemoryBytes / 1024).toFixed(2);
  const freeMemoryMB = (freeMemoryBytes / (1024 ** 2)).toFixed(2);
  const freeMemoryGB = (freeMemoryBytes / (1024 ** 3)).toFixed(2);
  const memoryUsagePercent = totalMemoryBytes > 0 ? ((usedMemoryBytes / totalMemoryBytes) * 100).toFixed(4) : '0.00';
  const { execSync } = require('child_process');
  let diskDetail = 'Tidak tersedia';
  let diskRootTotal = 'N/A';
  let diskRootUsed = 'N/A';
  let diskRootFree = 'N/A';
  let diskRootPercent = 'N/A';
  
  try {
    const dfRoot = execSync('df -h /').toString().trim().split('\n')[1]?.split(/\s+/);
    if (dfRoot && dfRoot.length >= 5) {
      diskRootTotal = dfRoot[1];
      diskRootUsed = dfRoot[2];
      diskRootFree = dfRoot[3];
      diskRootPercent = dfRoot[4];
    }

    const dfAll = execSync('df -h').toString().trim().split('\n');
    let mountDetails = [];
    
    dfAll.slice(1).forEach(line => {
      const parts = line.split(/\s+/);
      if (parts.length >= 6 && parts[0].startsWith('/dev/')) {
        mountDetails.push(`📀 ${parts[5]} (${parts[0]}): ${parts[1]} | Used: ${parts[2]} (${parts[4]}) | Free: ${parts[3]}`);
      }
    });
    
    diskDetail = mountDetails.join('\n') || 'Tidak ada mount point';
    
  } catch (e) {
    diskDetail = '❌ Gagal membaca disk (container)';
  }

  const networkInterfaces = os.networkInterfaces();
  let networkDetail = '';
  let publicIP = 'Tidak diketahui';
  let ipv4List = [];
  
  for (const [name, interfaces] of Object.entries(networkInterfaces)) {
    interfaces.forEach(iface => {
      if (!iface.internal && iface.family === 'IPv4') {
        ipv4List.push(`├─ ${name}: ${iface.address} (${iface.mac})`);
        networkDetail += `🌐 ${name}: ${iface.address}\n`;
      }
    });
  }

  try {
    const publicIPResponse = execSync('curl -s --max-time 3 ifconfig.me').toString().trim();
    if (publicIPResponse) publicIP = publicIPResponse;
  } catch (e) {}

  const nodeVersion = process.version;
  const nodePlatform = process.platform;
  const nodeArch = process.arch;
  const pid = process.pid;
  const cwd = process.cwd();
  const processMemory = process.memoryUsage();
  const rssMemory = (processMemory.rss / 1024 / 1024).toFixed(2);
  const heapTotalMemory = (processMemory.heapTotal / 1024 / 1024).toFixed(2);
  const heapUsedMemory = (processMemory.heapUsed / 1024 / 1024).toFixed(2);
  const externalMemory = (processMemory.external / 1024 / 1024).toFixed(2);
  const cpuUsageProcess = process.cpuUsage();
  const userCPUTimeSec = (cpuUsageProcess.user / 1000000).toFixed(2);
  const systemCPUTimeSec = (cpuUsageProcess.system / 1000000).toFixed(2);
  const hostname = os.hostname();
  const osType = os.type();
  const osPlatform = os.platform();
  const osRelease = os.release();
  const osArch = os.arch();
  let osUsername = 'Tidak diketahui';
  let osHomeDir = 'Tidak diketahui';
  
  try {
    const userInfo = os.userInfo();
    osUsername = userInfo.username || process.env.USER || 'container';
    osHomeDir = userInfo.homedir || process.env.HOME || '/home/container';
  } catch (error) {
    // Fallback ke environment variables
    osUsername = process.env.USER || process.env.USERNAME || 'container';
    osHomeDir = process.env.HOME || process.env.HOMEPATH || '/home/container';
  }
  const processTime = Date.now() - startTime;
      try {
      if (stickerMsg) {
        await ctx.telegram.deleteMessage(chatId, stickerMsg.message_id);
      }
    } catch (err) {
      console.log('Gagal hapus loading messages:', err.message);
    }
    
const msgText = `
╭─────────────────────────╮
│  <b>📊 SISTEM INFORMASI</b>        
╰─────────────────────────╯

<blockquote expandable><b>🕐 TIMES</b>
├─ WIB  : ${waktuJakarta.split(' pukul ')[0]}
├─ WITA : ${waktuMakassar.split(' pukul ')[0]}
├─ WIT  : ${waktuJayapura.split(' pukul ')[0]}
├─ Jam  : ${jam}:${menit}:${detik}
╰─ TZ   : ${timezone} (${timezoneOffsetStr})

<b>⏱️ UPTIME</b>
├─ Bot  : ${botDays}H ${botHours}J ${botMinutes}M
╰─ VPS  : ${vpsDays}H ${vpsHours}J ${vpsMinutes}M

<b>⚙️ CPU</b>
├─ Model : ${cpuModel.substring(0, 30)}...
├─ Core  : ${cpuCores} Core @ ${cpuSpeedMHz} MHz
├─ Usage : ${cpuUsagePercent}%
├─ Load  : ${load1} (1m) | ${load5} (5m)
╰─ Status: ${loadInterpretasi}

<b>💾 MEMORY</b>
├─ Total : ${totalMemoryGB} GB
├─ Used  : ${usedMemoryGB} GB (${memoryUsagePercent}%)
╰─ Free  : ${freeMemoryGB} GB

<b>📀 DISK</b>
├─ Total : ${diskRootTotal}
├─ Used  : ${diskRootUsed}
╰─ Free  : ${diskRootFree}

<b>🤖 BOT</b>
├─ Node  : ${nodeVersion}
├─ PID   : ${pid}
├─ RAM   : ${rssMemory} MB
╰─ CPU   : ${userCPUTimeSec}s / ${systemCPUTimeSec}s

<b>💻 SYSTEM</b>
├─ OS    : ${osType} ${osRelease}
├─ Arch  : ${osArch}
├─ User  : ${osUsername}
╰─ Host  : ${hostname}
</blockquote>
╭─────────────────────────╮
│ ⏱️ ${processTime}ms │ ✅ Aktif │
╰─────────────────────────╯
`;
  await ctx.replyWithHTML(msgText, {
    reply_to_message_id: msgId
  });
});
// ========== COMMAND ADD (TAMBAH ROLE) ==========
bot.command('add', async (ctx) => {
  const fromId = ctx.from.id.toString();

  // CEK AKSES (siapa aja yang bisa pake /add)
  const ownerUsers = JSON.parse(fs.readFileSync(ownerFile));
  const tkUsers = JSON.parse(fs.readFileSync(tkFile));
  const ceoUsers = JSON.parse(fs.readFileSync(ceoFile));
  const adminUsers = JSON.parse(fs.readFileSync(adminfile));

  const hasAccess = 
    ownerUsers.includes(String(fromId)) ||
    tkUsers.includes(String(fromId)) ||
    ceoUsers.includes(String(fromId)) ||
    adminUsers.includes(String(fromId)) ||
    fromId === vsett.adminId;

  if (!hasAccess) {
    return ctx.reply('❌ Khusus member public Zyura kak ☺️', {
      ...Markup.inlineKeyboard([
        Markup.button.url('ʟᴀᴘᴏʀᴀɴ', 'https://t.me/akuzyura')
      ])
    });
  }

  // CEK APAKAH ADA REPLY
  if (!ctx.message.reply_to_message) {
    return ctx.reply(`
<blockquote><b>❌ CARA PAKAI /add</b>
Reply pesan user yang mau dikasih role, lalu ketik:
<code>/add</code></blockquote>
`, { parse_mode: 'HTML' });
  }

  const targetId = ctx.message.reply_to_message.from.id.toString();
  const targetName = ctx.message.reply_to_message.from.username || 'tanpa username';
  const tempId = generateTempId();

  // SIMPAN SEMENTARA
  tempStorage.set(tempId, {
    type: 'add_role',
    targetId: targetId,
    targetName: targetName,
    userId: fromId
  });

  setTimeout(() => {
    tempStorage.delete(tempId);
  }, 2 * 60 * 1000);

  const msg = await ctx.reply(`<blockquote>╭━━━━━━━━━━━━━━━━━━━━╮
┃    <b>TAMBAH ROLE</b>    ┃
╰━━━━━━━━━━━━━━━━━━━━╯

<b>📌 TARGET USER</b>
├─ 👤 Username : @${targetName}
╰─ 🆔 User ID   : <code>${targetId}</code>

<b>🎯 SILAHKAN PILIH ROLE</b>
╰─ Tekan tombol di bawah ini
</blockquote>
`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'OWN PANEL', callback_data: `add_role_${tempId}_owner`, style: 'primary' },
          { text: 'PREMIUM', callback_data: `add_role_${tempId}_premium`, style: 'primary' }
        ],
        [
          { text: 'RESELLER PANEL', callback_data: `add_role_${tempId}_reseller`, style: 'primary' },
          { text: 'TK PANEL', callback_data: `add_role_${tempId}_tk`, style: 'success' }
        ],
        [
          { text: 'PT PANEL', callback_data: `add_role_${tempId}_pt`, style: 'success' },
          { text: 'CEO PANEL', callback_data: `add_role_${tempId}_ceo`, style: 'success' }
        ],
        [
          { text: 'PEMILIK PANEL', callback_data: `add_role_${tempId}_pemilik`, style: 'primary' }
        ],
        [
          { text: '❌ BATAL', callback_data: `cancel_add_${tempId}`, style: 'danger' }
        ]
      ]
    }
  });

  // SIMPAN messageId biar bisa dihapus nanti
  const data = tempStorage.get(tempId);
  if (data) {
    data.messageId = msg.message_id;
    data.chatId = ctx.chat.id;
    tempStorage.set(tempId, data);
  }
});

// ========== HANDLE ADD ROLE ==========
bot.action(/^add_role_(.+)_(.+)$/, async (ctx) => {
  const tempId = ctx.match[1];
  const role = ctx.match[2];
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;

  const data = tempStorage.get(tempId);
  
  if (!data || data.type !== 'add_role') {
    await ctx.answerCbQuery('❌ Session expired!', { alert: true });
    return;
  }

  if (data.userId !== userId) {
    await ctx.answerCbQuery('❌ Bukan session kamu!', { alert: true });
    return;
  }

  const { targetId, targetName, messageId } = data;
  
  // ✅ HAPUS PESAN TOMBOL
  try {
    await ctx.telegram.deleteMessage(chatId, messageId);
  } catch (err) {
    console.log('Gagal hapus pesan tombol add:', err.message);
  }
  
  tempStorage.delete(tempId);

  // MAP role ke file dan nama display
  const roleMap = {
    owner: { file: ownerFile, display: 'OWN PANEL', listName: 'ownerUsers' },
    premium: { file: premiumUsersFile, display: 'PREMIUM', listName: 'premiumList' },
    reseller: { file: ressFile, display: 'RESELLER PANEL', listName: 'ressList' },
    tk: { file: tkFile, display: 'TK PANEL', listName: 'tkList' },
    pt: { file: ptFile, display: 'PT PANEL', listName: 'ptList' },
    ceo: { file: ceoFile, display: 'CEO PANEL', listName: 'ceoList' },
    pemilik: { file: adminfile, display: 'PEMILIK PANEL', listName: 'adminList' }
  };

  const roleInfo = roleMap[role];
  if (!roleInfo) {
    return ctx.reply('❌ Role tidak dikenal!');
  }

  let list = JSON.parse(fs.readFileSync(roleInfo.file));

  if (list.includes(targetId)) {
    return ctx.reply(`<blockquote>⚠️ @${targetName} sudah memiliki role ${roleInfo.display}.</blockquote>`, { parse_mode: 'HTML' });
  }

  list.push(targetId);
  fs.writeFileSync(roleInfo.file, JSON.stringify(list, null, 2));

  await ctx.replyWithHTML(`
<blockquote><b>✅ Berhasil ditambahin!</b>

@${targetName} sekarang punya role ${roleInfo.display}
ID: <code>${targetId}</code>
</blockquote>
  `);

  // Kirim notifikasi ke user yang ditambahi
try {
  await ctx.telegram.sendMessage(vsett.adminId, `
<blockquote>
<b>📢 NOTIFIKASI TAMBAH ROLE</b>

👤 User: @${targetName}
🆔 ID: <code>${targetId}</code>
🎭 Role: <b>${roleInfo.display}</b>

━━━━━━━━━━━━━━━━━━━━
Status: ✅ Berhasil ditambahkan
</blockquote>
`, { parse_mode: 'HTML' });
} catch (err) {
  console.log('Gagal kirim notifikasi ke owner:', err.message);
}

  await ctx.answerCbQuery();
});

// ========== HANDLE BATAL ADD ==========
bot.action(/^cancel_add_(.+)$/, async (ctx) => {
  const tempId = ctx.match[1];
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;

  const data = tempStorage.get(tempId);
  
  if (data && data.userId === userId) {
    // ✅ HAPUS PESAN TOMBOL
    try {
      await ctx.telegram.deleteMessage(chatId, data.messageId);
    } catch (err) {
      console.log('Gagal hapus pesan tombol cancel add:', err.message);
    }
    
    tempStorage.delete(tempId);
    await ctx.reply('<blockquote>❌ Penambahan role dibatalkan.</blockquote>', { parse_mode: 'HTML' });
  }
  
  await ctx.answerCbQuery();
});

// ========== COMMAND DEL (HAPUS ROLE) ==========
bot.command('del', async (ctx) => {
  const fromId = ctx.from.id.toString();

  // CEK AKSES
  const ownerUsers = JSON.parse(fs.readFileSync(ownerFile));
  const tkUsers = JSON.parse(fs.readFileSync(tkFile));
  const ceoUsers = JSON.parse(fs.readFileSync(ceoFile));
  const adminUsers = JSON.parse(fs.readFileSync(adminfile));

  const hasAccess = 
    ownerUsers.includes(String(fromId)) ||
    tkUsers.includes(String(fromId)) ||
    ceoUsers.includes(String(fromId)) ||
    adminUsers.includes(String(fromId)) ||
    fromId === vsett.adminId;

  if (!hasAccess) {
    return ctx.reply('❌ Khusus member public Zyura kak ☺️', {
      ...Markup.inlineKeyboard([
        Markup.button.url('ʟᴀᴘᴏʀᴀɴ', 'https://t.me/akuzyura')
      ])
    });
  }

  if (!ctx.message.reply_to_message) {
    return ctx.reply(`
<blockquote><b>❌ CARA PAKAI /del</b>
Reply pesan user yang mau dihapus role-nya, lalu ketik:
<code>/del</code></blockquote>
`, { parse_mode: 'HTML' });
  }

  const targetId = ctx.message.reply_to_message.from.id.toString();
  const targetName = ctx.message.reply_to_message.from.username || 'tanpa username';
  const tempId = generateTempId();

  // CEK ROLE APA AJA YANG DIMILIKI USER INI
  const ownerList = JSON.parse(fs.readFileSync(ownerFile));
  const premiumList = JSON.parse(fs.readFileSync(premiumUsersFile));
  const ressList = JSON.parse(fs.readFileSync(ressFile));
  const tkList = JSON.parse(fs.readFileSync(tkFile));
  const ptList = JSON.parse(fs.readFileSync(ptFile));
  const ceoList = JSON.parse(fs.readFileSync(ceoFile));
  const adminList = JSON.parse(fs.readFileSync(adminfile));

  const userRoles = [];
  
  if (ownerList.includes(targetId)) userRoles.push({ key: 'owner', display: 'OWN PANEL', file: ownerFile });
  if (premiumList.includes(targetId)) userRoles.push({ key: 'premium', display: 'PREMIUM', file: premiumUsersFile });
  if (ressList.includes(targetId)) userRoles.push({ key: 'reseller', display: 'RESELLER PANEL', file: ressFile });
  if (tkList.includes(targetId)) userRoles.push({ key: 'tk', display: 'TK PANEL', file: tkFile });
  if (ptList.includes(targetId)) userRoles.push({ key: 'pt', display: 'PT PANEL', file: ptFile });
  if (ceoList.includes(targetId)) userRoles.push({ key: 'ceo', display: 'CEO PANEL', file: ceoFile });
  if (adminList.includes(targetId)) userRoles.push({ key: 'pemilik', display: 'PEMILIK PANEL', file: adminfile });

  if (userRoles.length === 0) {
    return ctx.reply(`<blockquote>⚠️ @${targetName} tidak memiliki role apapun.</blockquote>`, { parse_mode: 'HTML' });
  }

  // SIMPAN SEMENTARA
  tempStorage.set(tempId, {
    type: 'del_role',
    targetId: targetId,
    targetName: targetName,
    userRoles: userRoles,
    userId: fromId
  });

  setTimeout(() => {
    tempStorage.delete(tempId);
  }, 2 * 60 * 1000);

const roleButtons = [];
for (const role of userRoles) {
  roleButtons.push([{ text: `🗑️ ${role.display}`, callback_data: `del_role_${tempId}_${role.key}`, style: 'primary' }]);
}
roleButtons.push([{ text: '❌ BATAL', callback_data: `cancel_del_${tempId}`, style: 'danger' }]);

  const msg = await ctx.reply(`<blockquote><b>🗑️ Hapus Role</b>

• @${targetName}
• <code>${targetId}</code>

Role yang dimiliki:</blockquote>
`, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: roleButtons }
  });

  // SIMPAN messageId
  const data = tempStorage.get(tempId);
  if (data) {
    data.messageId = msg.message_id;
    data.chatId = ctx.chat.id;
    tempStorage.set(tempId, data);
  }
});

// ========== HANDLE DEL ROLE ==========
bot.action(/^del_role_(.+)_(.+)$/, async (ctx) => {
  const tempId = ctx.match[1];
  const roleKey = ctx.match[2];
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;

  const data = tempStorage.get(tempId);
  
  if (!data || data.type !== 'del_role') {
    await ctx.answerCbQuery('❌ Session expired!', { alert: true });
    return;
  }

  if (data.userId !== userId) {
    await ctx.answerCbQuery('❌ Bukan session kamu!', { alert: true });
    return;
  }

  const { targetId, targetName, userRoles, messageId } = data;
  
  const roleToDelete = userRoles.find(r => r.key === roleKey);
  if (!roleToDelete) {
    await ctx.answerCbQuery('❌ Role tidak ditemukan!', { alert: true });
    return;
  }

  // ✅ HAPUS PESAN TOMBOL
  try {
    await ctx.telegram.deleteMessage(chatId, messageId);
  } catch (err) {
    console.log('Gagal hapus pesan tombol del:', err.message);
  }

  tempStorage.delete(tempId);

  let list = JSON.parse(fs.readFileSync(roleToDelete.file));
  list = list.filter(id => id !== targetId);
  fs.writeFileSync(roleToDelete.file, JSON.stringify(list, null, 2));

  await ctx.replyWithHTML(`<blockquote><b>✅ Berhasil dihapus!</b>

User @${targetName}
ID <code>${targetId}</code>

Role ${roleToDelete.display} udah dihapus.
</blockquote>
  `);

try {
  await ctx.telegram.sendMessage(vsett.adminId, `
<blockquote>
<b>📢 NOTIFIKASI HAPUS ROLE</b>

👤 User: @${targetName}
🆔 ID: <code>${targetId}</code>
🎭 Role: <b>${roleToDelete.display}</b>

━━━━━━━━━━━━━━━━━━━━
Status: ❌ Berhasil dihapus
</blockquote>
`, { parse_mode: 'HTML' });
} catch (err) {
  console.log('Gagal kirim notifikasi ke owner:', err.message);
}
  await ctx.answerCbQuery();
});

// ========== HANDLE BATAL DEL ==========
bot.action(/^cancel_del_(.+)$/, async (ctx) => {
  const tempId = ctx.match[1];
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;

  const data = tempStorage.get(tempId);
  
  if (data && data.userId === userId) {
    // ✅ HAPUS PESAN TOMBOL
    try {
      await ctx.telegram.deleteMessage(chatId, data.messageId);
    } catch (err) {
      console.log('Gagal hapus pesan tombol cancel del:', err.message);
    }
    
    tempStorage.delete(tempId);
    await ctx.reply('<blockquote>❌ Penghapusan role dibatalkan.</blockquote>', { parse_mode: 'HTML' });
  }
  
  await ctx.answerCbQuery();
});
bot.command('info', async (ctx) => {
  const chatId = ctx.chat.id;
  let targetMsg = ctx.message;
  if (ctx.message.reply_to_message) {
    targetMsg = ctx.message.reply_to_message;
  }

  const targetId = targetMsg.from.id.toString();
  const targetUsername = targetMsg.from.username || 'tanpa_username';
  const targetFullName = targetMsg.from.first_name || '';
  const targetLastName = targetMsg.from.last_name || '';
  const targetNama = `${targetFullName} ${targetLastName}`.trim();

  let ownerUsers = JSON.parse(fs.readFileSync(ownerFile));
  let premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  let ressUsers = JSON.parse(fs.readFileSync(ressFile));
  let tkUsers = JSON.parse(fs.readFileSync(tkFile));
  let ptUsers = JSON.parse(fs.readFileSync(ptFile));
  let ceoUsers = JSON.parse(fs.readFileSync(ceoFile));
  let PemilikUsers = JSON.parse(fs.readFileSync(adminfile));

  const isMainOwner = (targetId === vsett.adminId);
  const isOwner = ownerUsers.includes(targetId);
  const isPremium = premiumUsers.includes(targetId);
  const isReseller = ressUsers.includes(targetId);
  const isTrial = tkUsers.includes(targetId);
  const isPtpanel = ptUsers.includes(targetId);
  const isCeopanel = ceoUsers.includes(targetId);
  const isPemilikpanel = PemilikUsers.includes(targetId);

  let mainRole = 'User Gratisan🤣';
  if (isMainOwner) mainRole = '👑 OWNER UTAMA';
  else if (isOwner) mainRole = 'OWN PANEL';
  else if (isReseller) mainRole = 'RESELLER';
  else if (isPremium) mainRole = 'PREMIUM';
  else if (isTrial) mainRole = 'TANGAN KANAN';
  else if (isPtpanel) mainRole = 'PT PANEL';
  else if (isCeopanel) mainRole = 'CEO PANEL';
  else if (isPemilikpanel) mainRole = 'PEMILIK PANEL';

  let isActive = false;
  let cekMsg = '';

  try {
    await ctx.telegram.sendMessage(targetId, '🔔 <b>Sedang mengecek status...</b>', { parse_mode: 'HTML' });
    isActive = true;
    cekMsg = '✅ Aktif (bisa menerima pesan)';
  } catch (error) {
    isActive = false;
    cekMsg = '❌ Tidak Aktif (belum start / block bot)';

    console.log(`User ${targetId} tidak aktif: ${error.description || error.message}`);
  }

  const mainOwnerStatus = isMainOwner ? '✅' : '❌';
  const ownerStatus = isOwner ? '✅' : '❌';
  const premiumStatus = isPremium ? '✅' : '❌';
  const resellerStatus = isReseller ? '✅' : '❌';
  const trialStatus = isTrial ? '✅' : '❌';
  const PtpanelStatus = isPtpanel ? '✅' : '❌';
  const CeopanelStatus = isCeopanel ? '✅' : '❌';
  const PemilikpanelStatus = isPemilikpanel ? '✅' : '❌';

  const infoText = `
<blockquote><b>📋 INFORMASI USER</b>

<b>🔹 DATA DIRI</b>
• ID: <code>${targetId}</code>
• Username: @${targetUsername}
• Nama: ${targetNama || '(tanpa nama)'}

<b>🔹 STATUS ROLE</b>
• Role Utama: <b>${mainRole}</b>

• Owner utama: ${mainOwnerStatus}
• Own Panel: ${ownerStatus}
• Premium: ${premiumStatus}
• Reseller: ${resellerStatus}
• Tangan kanan: ${trialStatus}
• PT Panel: ${PtpanelStatus}
• Ceo Panel: ${CeopanelStatus}
• Pemilik Panel: ${PemilikpanelStatus}

<b>🔹 STATUS BOT</b>
• Cek Aktif: ${cekMsg}

${isActive ? `✅ <b>@${targetUsername}</b> SUDAH AKTIF!` : `❌ <b>@${targetUsername}</b> TIDAK AKTIF! User belum start bot atau pernah block bot.`}
</blockquote>`;

  ctx.replyWithHTML(infoText);
});

bot.command('addserver', async (ctx) => {
  const fromId = ctx.from.id.toString();
  const text = ctx.message.text.split(' ').slice(1).join(' ').trim();

  if (fromId !== vsett.adminId) {
    return ctx.reply('❌ Khusus owner utama!', {
      ...Markup.inlineKeyboard([
        Markup.button.url('ʟᴀᴘᴏʀᴀɴ', 'https://t.me/akuzyura')
      ])
    });
  }

  if (!text) {
    return ctx.reply(`❌ Format Salah!\n\n<code>/addserver domain,plta,pltc</code>\n\nContoh:\n<code>/addserver https://panel.com,ptla_abc123,ptlc_xyz789</code>`, {
      parse_mode: 'HTML'
    });
  }

  const servers = JSON.parse(fs.readFileSync(serversFile));
  const lines = text.split('\n'); 
  let success = [];
  let failed = [];

  const loadingMsg = await ctx.reply('⏳ <b>Menambahkan server...</b>', { parse_mode: 'HTML' });

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(',');
    if (parts.length < 3) {
      failed.push(`❌ Format salah: ${trimmed}`);
      continue;
    }

    const domain = parts[0].trim();
    const plta = parts[1].trim();
    const pltc = parts[2].trim();

    if (!domain.startsWith('http')) {
      failed.push(`❌ Domain harus dengan http/https: ${domain}`);
      continue;
    }

    const exists = servers.some(s => s.domain === domain || s.plta === plta);
    if (exists) {
      failed.push(`⚠️ Sudah ada: ${domain}`);
      continue;
    }

    try {
      const test = await fetch(`${domain}/api/application/servers?page=1`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${plta}`
        }
      });

      if (!test.ok) {
        failed.push(`❌ Gagal konek (${test.status}): ${domain}`);
        continue;
      }

      const newServer = {
        id: `srv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: `Server ${servers.length + 1}`,
        domain: domain,
        plta: plta,
        pltc: pltc,
        added_by: fromId,
        added_at: new Date().toISOString()
      };

      servers.push(newServer);
      success.push(`✅ ${domain}`);

    } catch (error) {
      console.error(`Gagal test konek ke ${domain}:`, error.message);
      failed.push(`❌ Error koneksi: ${domain}`);
    }
  }

  fs.writeFileSync(serversFile, JSON.stringify(servers, null, 2));

  await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);

  let report = `<blockquote><b>📊 HASIL TAMBAH SERVER</b>\n\n`;

  if (success.length > 0) {
    report += `<b>✅ BERHASIL (${success.length}):</b>\n`;
    success.slice(0, 10).forEach(s => report += `${s}\n`);
    if (success.length > 10) report += `...dan ${success.length - 10} lainnya\n`;
    report += `\n`;
  }

  if (failed.length > 0) {
    report += `<b>❌ GAGAL (${failed.length}):</b>\n`;
    failed.slice(0, 10).forEach(f => report += `${f}\n`);
    if (failed.length > 10) report += `...dan ${failed.length - 10} lainnya\n`;
  }

  report += `\n📌 Total server tersimpan: ${servers.length}</blockquote>`;

  ctx.replyWithHTML(report);
});

bot.command('listserver', async (ctx) => {
  const fromId = ctx.from.id.toString();
  if (fromId !== vsett.adminId) {
    return ctx.reply('❌ Khusus owner utama!', {
      ...Markup.inlineKeyboard([
        Markup.button.url('ʟᴀᴘᴏʀᴀɴ', 'https://t.me/akuzyura')
      ])
    });
  }

  const servers = JSON.parse(fs.readFileSync(serversFile));

  if (servers.length === 0) {
    return ctx.reply('<blockquote>📋 Belum ada server terdaftar.</blockquote>', { parse_mode: 'HTML' });
  }

  let messageText = `<blockquote><b>📋 DAFTAR SERVER (${servers.length})</b>\n\n`;

  servers.forEach((srv, index) => {
    messageText += `<b>${index + 1}. ${srv.name || 'Unnamed'}</b>\n`;
    messageText += `🆔 <code>${srv.id}</code>\n`;
    messageText += `🌐 <a href="${srv.domain}">${srv.domain}</a>\n`;
    messageText += `👤 Added by: ${srv.added_by}\n`;
    messageText += `📅 Added: ${new Date(srv.added_at).toLocaleString()}\n`;
    messageText += `━━━━━━━━━━━━━━━━━━\n`;
  });

  messageText += `</blockquote>`;

  if (messageText.length > 4096) {
    const chunks = messageText.match(/[\s\S]{1,4096}/g) || [];
    for (const chunk of chunks) {
      await ctx.replyWithHTML(chunk);
    }
  } else {
    await ctx.replyWithHTML(messageText);
  }
});

bot.command('delserver', async (ctx) => {
  const fromId = ctx.from.id.toString();
  const serverId = ctx.message.text.split(' ')[1];
  if (fromId !== vsett.adminId) {
    return ctx.reply('❌ Khusus owner utama!', {
      ...Markup.inlineKeyboard([
        Markup.button.url('ʟᴀᴘᴏʀᴀɴ', 'https://t.me/akuzyura')
      ])
    });
  }

  if (!serverId) {
    return ctx.reply('❌ Masukkan ID server!\nContoh: <code>/delserver srv_abc123</code>', {
      parse_mode: 'HTML'
    });
  }

  const servers = JSON.parse(fs.readFileSync(serversFile));
  const serverIndex = servers.findIndex(s => s.id === serverId);

  if (serverIndex === -1) {
    return ctx.reply(`<blockquote>❌ Server dengan ID <code>${serverId}</code> tidak ditemukan!</blockquote>`, {
      parse_mode: 'HTML'
    });
  }

  const deletedServer = servers[serverIndex];
  servers.splice(serverIndex, 1);
  fs.writeFileSync(serversFile, JSON.stringify(servers, null, 2));

  ctx.replyWithHTML(`
<blockquote><b>✅ SERVER DIHAPUS</b>

🆔 <b>ID:</b> <code>${deletedServer.id}</code>
🌐 <b>Domain:</b> ${deletedServer.domain}
📊 <b>Sisa server:</b> ${servers.length}</blockquote>
  `);
});

bot.command('delallserver', async (ctx) => {
  const fromId = ctx.from.id.toString();
  if (fromId !== vsett.adminId) {
    return ctx.reply('❌ Khusus owner utama!', {
      ...Markup.inlineKeyboard([
        Markup.button.url('ʟᴀᴘᴏʀᴀɴ', 'https://t.me/akuzyura')
      ])
    });
  }

  const servers = JSON.parse(fs.readFileSync(serversFile));
  const count = servers.length;

  if (count === 0) {
    return ctx.reply('<blockquote>📋 Tidak ada server untuk dihapus.</blockquote>', { parse_mode: 'HTML' });
  }

  await ctx.reply(`⚠️ Yakin hapus SEMUA server (${count})?`, {
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ YA, HAPUS SEMUA', 'confirm_delall_server'),
        Markup.button.callback('❌ BATAL', 'cancel_delall_server')
      ]
    ])
  });
});

bot.action('confirm_delall_server', async (ctx) => {
  const fromId = ctx.from.id.toString();

  if (fromId !== vsett.adminId) {
    return ctx.answerCbQuery('❌ Bukan owner utama!');
  }

  const servers = JSON.parse(fs.readFileSync(serversFile));
  const count = servers.length;

  fs.writeFileSync(serversFile, '[]');

  await ctx.editMessageText(`<blockquote><b>🗑️ SEMUA SERVER DIHAPUS</b>\n\n📊 Total: ${count} server</blockquote>`, {
    parse_mode: 'HTML'
  });
  await ctx.answerCbQuery('✅ Berhasil dihapus!');
});

bot.action('cancel_delall_server', async (ctx) => {
  await ctx.editMessageText('<blockquote>❌ Penghapusan dibatalkan.</blockquote>', {
    parse_mode: 'HTML'
  });
  await ctx.answerCbQuery();
});

bot.command('cpa', async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const text = ctx.message.text.split(' ').slice(1).join(' ').trim();

  // CEK AKSES
  const ownerUsers = JSON.parse(fs.readFileSync(ownerFile));
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const tkUsers = JSON.parse(fs.readFileSync(tkFile));
  const ptUsers = JSON.parse(fs.readFileSync(ptFile));
  const adminUsers = JSON.parse(fs.readFileSync(adminfile));
  const ressUsers = JSON.parse(fs.readFileSync(ressFile));
  const ceoUsers = JSON.parse(fs.readFileSync(ceoFile));

  const hasAccess = 
    ownerUsers.includes(String(userId)) ||
    premiumUsers.includes(String(userId)) ||
    tkUsers.includes(String(userId)) ||
    ptUsers.includes(String(userId)) ||
    ceoUsers.includes(String(userId)) ||
    adminUsers.includes(String(userId)) ||
    ressUsers.includes(String(userId)) ||  
    userId === vsett.adminId;

  if (!hasAccess) {
    return ctx.reply('❌ Minta akses create dulu sama owner!', {
      ...Markup.inlineKeyboard([
        [{ text: '📢 LAPORAN', url: 'https://t.me/akuzyura', style: 'danger' }]
      ])
    });
  }

  // PARSE INPUT
  let username, targetId;
  
if (!text) {
    return ctx.replyWithHTML(`<blockquote><b>FORMAT SALAH!! SILAHKAN DI LIHAT FORMAT YANG BENAR DI BAWAH⬇️</b>

<b>📌 FORMAT 1 (Kirim ke diri sendiri)</b>
/cpa nama_panel

<b>📌 FORMAT 2 (Kirim ke orang lain)</b>
/cpa nama_panel,idtelegram

<b>📌 CONTOH</b>
• /cpa panelku
• /cpa panelku,12345678
</blockquote>
`);
}

  const parts = text.split(',');
  username = parts[0].trim();
  
  if (parts.length >= 2) {
    targetId = parts[1].trim();
  } else {
    targetId = userId.toString();
  }

  // SIMPAN SEMENTARA
  const tempId = generateTempId();
  
  const msg = await ctx.reply(`
<b>📦 PANEL: ${username}</b>
📤 Target: <code>${targetId}</code>

<b>⬇️ Pilih spesifikasi RAM:</b>
`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '1 GB', callback_data: `cpa_ram_${tempId}_1gb`, style: 'primary' },
          { text: '2 GB', callback_data: `cpa_ram_${tempId}_2gb`, style: 'primary' },
          { text: '3 GB', callback_data: `cpa_ram_${tempId}_3gb`, style: 'primary' }
        ],
        [
          { text: '4 GB', callback_data: `cpa_ram_${tempId}_4gb`, style: 'primary' },
          { text: '5 GB', callback_data: `cpa_ram_${tempId}_5gb`, style: 'primary' },
          { text: '6 GB', callback_data: `cpa_ram_${tempId}_6gb`, style: 'primary' }
        ],
        [
          { text: '7 GB', callback_data: `cpa_ram_${tempId}_7gb`, style: 'primary' },
          { text: '8 GB', callback_data: `cpa_ram_${tempId}_8gb`, style: 'primary' },
          { text: '9 GB', callback_data: `cpa_ram_${tempId}_9gb`, style: 'primary' }
        ],
        [
          { text: '10 GB', callback_data: `cpa_ram_${tempId}_10gb`, style: 'primary' },
          { text: 'UNLIMITED', callback_data: `cpa_ram_${tempId}_unli`, style: 'primary' }
        ],
        [
          { text: '❌ BATAL', callback_data: `cancel_cpa_${tempId}`, style: 'danger' }
        ]
      ]
    }
  });

  tempStorage.set(tempId, {
    type: 'cpa_waiting_ram',
    username: username,
    targetId: targetId,
    userId: userId.toString(),
    messageId: msg.message_id,
    chatId: chatId
  });
  
  setTimeout(() => {
    tempStorage.delete(tempId);
  }, 5 * 60 * 1000);
});

// ========== HANDLE PILIH RAM cpa ==========
bot.action(/^cpa_ram_(.+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  
  const tempId = ctx.match[1];
  const cmd = ctx.match[2];
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;
  
  const data = tempStorage.get(tempId);
  
  if (!data) {
    await ctx.answerCbQuery('❌ Session expired! Ulangi /cpa', { alert: true });
    return;
  }
  
  if (data.userId !== userId) {
    await ctx.answerCbQuery('❌ Bukan session kamu!', { alert: true });
    return;
  }
  
  if (data.type !== 'cpa_waiting_ram') {
    return;
  }
  
  // ✅ HAPUS PESAN TOMBOL
  try {
    await ctx.telegram.deleteMessage(chatId, data.messageId);
  } catch (err) {
    console.log('Gagal hapus pesan tombol:', err.message);
  }
  
  tempStorage.delete(tempId);
  
  const { username, targetId } = data;
  
  // CEK COOLDOWN
  const cooldownCheck = checkCooldown(userId, cmd);
  if (cooldownCheck.onCooldown) {
    return ctx.replyWithHTML(`
<blockquote>⏱️ Kamu sudah membuat panel ${cmd.toUpperCase()} sebelumnya.
Tunggu <b>${cooldownCheck.minutesLeft} menit</b> lagi.</blockquote>
    `);
  }
  
  // LANJUT KE PROSES CREATE PANEL
  await prosesCreatePanel(ctx, cmd, username, targetId, userId, chatId);
});

// ========== HANDLE BATAL cpa ==========
bot.action(/^cancel_cpa_(.+)$/, async (ctx) => {
  const tempId = ctx.match[1];
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id;
  
  const data = tempStorage.get(tempId);
  
  if (data && data.userId === userId) {
    // ✅ HAPUS PESAN TOMBOL
    try {
      await ctx.telegram.deleteMessage(chatId, data.messageId);
    } catch (err) {
      console.log('Gagal hapus pesan tombol:', err.message);
    }
    
    tempStorage.delete(tempId);
    
    // Kirim pesan konfirmasi (opsional)
    await ctx.reply('<blockquote>❌ Pembuatan panel dibatalkan.</blockquote>', { parse_mode: 'HTML' });
  }
  
  await ctx.answerCbQuery();
});


// ========== FUNGSI PROSES CREATE PANEL ==========
async function prosesCreatePanel(ctx, cmd, username, targetId, userId, chatId) {
  const panelName = username + cmd;
  const specs = panelSpecs[cmd];

  if (!specs) {
    return ctx.reply('❌ Spesifikasi panel tidak ditemukan!');
  }

  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply(`<blockquote>Belum ada server terdaftar. Hubungi owner!</blockquote>`, { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔙 KEMBALI', callback_data: 'back_to_start',       style: 'danger'}
        ]]
      }
    });
  }

  const loadingMsg = await ctx.reply(`<blockquote>⏱️ Sedang mengecek server online...</blockquote>`, { parse_mode: 'HTML' });

  let onlineServers = [];
  
  for (const srv of servers) {
    try {
      const test = await fetch(`${srv.domain}/api/application/servers?page=1`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${srv.plta}`
        },
        timeout: 5000
      });

      if (test.ok) {
        onlineServers.push(srv);
      }
    } catch (error) {
      console.log(`Server ${srv.domain} offline:`, error.message);
    }
  }

  await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

  if (onlineServers.length === 0) {
    return ctx.reply(`<blockquote>Tidak ada server online! Semua server down.</blockquote>`, { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔙 KEMBALI', callback_data: 'back_to_start',       style: 'danger' }
        ]]
      }
    });
  }

  const buttons = [];

  for (const srv of onlineServers) {
    const tempId = generateTempId();
    
    tempStorage.set(tempId, {
      type: 'select_server',
      cmd: cmd,
      username: username,
      targetId: targetId,
      serverId: srv.id,
      userId: userId.toString()
    });
    
    setTimeout(() => {
      tempStorage.delete(tempId);
    }, 5 * 60 * 1000);
    
    buttons.push([
      {
        text: `🖥️ ${srv.name || srv.domain.replace('https://', '')}`,
        callback_data: `srv_${tempId}`,
              style: 'danger'
      }
    ]);
  }

  const batalTempId = generateTempId();
  tempStorage.set(batalTempId, {
    type: 'cancel',
    userId: userId.toString()
  });
  
  setTimeout(() => {
    tempStorage.delete(batalTempId);
  }, 5 * 60 * 1000);
  
  buttons.push([
    { text: '❌ BATAL', callback_data: `cancel_create_${batalTempId}`,       style: 'danger' }
  ]);

  await ctx.reply(`<b>📦 CREATE ${cmd.toUpperCase()}</b>
<blockquote>
<b>Nama:</b> ${username}
<b>Target:</b> <code>${targetId}</code>
<b>RAM:</b> ${specs.memo === '0' ? 'Unlimited' : specs.memo + ' MB'}
<b>CPU:</b> ${specs.cpu}%
<b>Disk:</b> ${specs.disk === '0' ? 'Unlimited' : specs.disk + ' MB'}
</blockquote>

<b>⬇️ PILIH SERVER:</b>`, {
  parse_mode: 'HTML',
  reply_markup: { inline_keyboard: buttons }
});
}

// ========== HANDLE PILIHAN SERVER ==========
bot.action(/^srv_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  
  const tempId = ctx.match[1];
  const userId = ctx.from.id.toString();
  
  const data = tempStorage.get(tempId);
  
  if (!data) {
    await ctx.answerCbQuery('❌ Session expired!', { alert: true });
    return;
  }

  if (data.userId !== userId) {
    await ctx.answerCbQuery('❌ Bukan session kamu!', { alert: true });
    return;
  }
  
  if (data.type !== 'select_server') {
    return;
  }
  
  tempStorage.delete(tempId);
  
  const { cmd, username, targetId, serverId } = data;
  
  const servers = JSON.parse(fs.readFileSync(serversFile));
  const selectedServer = servers.find(s => s.id === serverId);

  if (!selectedServer) {
    try {
      await ctx.editMessageText('<blockquote>❌ Server tidak ditemukan!</blockquote>', { parse_mode: 'HTML' });
    } catch {
      await ctx.reply('<blockquote>❌ Server tidak ditemukan!</blockquote>', { parse_mode: 'HTML' });
    }
    return;
  }

  const timeout = 180000;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), timeout);
  });

  try {
    await Promise.race([
      (async () => {
        try {
          await ctx.editMessageText(`⏳ Mengecek egg di server ${selectedServer.name || selectedServer.domain}...`, { parse_mode: 'HTML' });
        } catch {
          await ctx.reply(`⏳ Mengecek egg di server ${selectedServer.name || selectedServer.domain}...`, { parse_mode: 'HTML' });
        }

        let eggData;
        try {
          eggData = await getValidEgg(selectedServer, selectedServer.plta);
        } catch (eggError) {
          try {
            await ctx.editMessageText(`<blockquote>❌ ${eggError.message}</blockquote>`, { parse_mode: 'HTML' });
          } catch {
            await ctx.reply(`<blockquote>❌ ${eggError.message}</blockquote>`, { parse_mode: 'HTML' });
          }
          return;
        }

        const specs = panelSpecs[cmd];
        const panelName = username + cmd;
        const password = username + 'ServerZyura##';
        const email = `${username}@panelvip.app`;
        
        try {
          await ctx.editMessageText(`⏳ Membuat user di server ${selectedServer.name || selectedServer.domain}...\n✅ Egg: ${eggData.eggId}`, { parse_mode: 'HTML' });
        } catch {
          await ctx.reply(`⏳ Membuat user di server ${selectedServer.name || selectedServer.domain}...\n✅ Egg: ${eggData.eggId}`, { parse_mode: 'HTML' });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        try {
          const response = await fetch(`${selectedServer.domain}/api/application/users`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${selectedServer.plta}`
            },
            body: JSON.stringify({
              email: email,
              username: username,
              first_name: username,
              last_name: username,
              language: 'en',
              password: password
            }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          const dataUser = await response.json();

          if (dataUser.errors) {
            throw new Error(dataUser.errors[0].detail || JSON.stringify(dataUser.errors[0]));
          }

          const user = dataUser.attributes;

          try {
            await ctx.editMessageText(`⏳ Membuat server ${panelName}...`, { parse_mode: 'HTML' });
          } catch {
            await ctx.reply(`⏳ Membuat server ${panelName}...`, { parse_mode: 'HTML' });
          }

          const controller2 = new AbortController();
          const timeoutId2 = setTimeout(() => controller2.abort(), 30000);
          
          try {
            const response2 = await fetch(`${selectedServer.domain}/api/application/servers`, {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${selectedServer.plta}`
              },
              body: JSON.stringify({
                name: panelName,
                description: '',
                user: user.id,
                egg: parseInt(eggData.eggId),
                docker_image: 'ghcr.io/parkervcp/yolks:nodejs_18',
                startup: eggData.startup,
                environment: {
                  INST: 'npm',
                  USER_UPLOAD: '0',
                  AUTO_UPDATE: '0',
                  CMD_RUN: 'npm start'
                },
                limits: {
                  memory: specs.memo,
                  swap: 0,
                  disk: specs.disk,
                  io: 500,
                  cpu: specs.cpu
                },
                feature_limits: {
                  databases: 5,
                  backups: 5,
                  allocations: 1
                },
                deploy: {
                  locations: [parseInt(vsett.loc)],
                  dedicated_ip: false,
                  port_range: []
                }
              }),
              signal: controller2.signal
            });
            
            clearTimeout(timeoutId2);
            const dataServer = await response2.json();

            if (dataServer.errors) {
              await fetch(`${selectedServer.domain}/api/application/users/${user.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${selectedServer.plta}` }
              });
              throw new Error(JSON.stringify(dataServer.errors[0]));
            }

            setCooldown(userId, cmd);

            try {
              await ctx.deleteMessage();
            } catch {}

await ctx.replyWithHTML(`
<blockquote>✅ <b>Panel ${cmd.toUpperCase()} sukses dibuat</b>

├─ 📤 Target: <code>${targetId}</code>
├─ 🖥️ Server: ${selectedServer.name || selectedServer.domain}
╰─ 🥚 Egg: ${eggData.eggId}
</blockquote>
`);

// Kirim notifikasi ke owner
try {
  await ctx.telegram.sendMessage(vsett.adminId, `
<blockquote><b>📢 ADA PANEL BARU</b>

👤 <b>Creator:</b> @${ctx.from.username} (<code>${ctx.from.id}</code>)
📦 <b>Panel:</b> ${cmd.toUpperCase()}
📤 <b>Target:</b> <code>${targetId}</code>
🖥️ <b>Server:</b> ${selectedServer.name || selectedServer.domain}
🥚 <b>Egg:</b> ${eggData.eggId}

━━━━━━━━━━━━━━━━━━━━
✅ Status: Berhasil
</blockquote>
`, { parse_mode: 'HTML' });
} catch (err) {
  console.log('Gagal kirim notif ke owner:', err.message);
}
            await ctx.telegram.sendPhoto(targetId, vsett.pp_panel, {
              caption: `
<blockquote><b>👤 INFORMASI AKUN</b>
├─ <b>Username</b> : <code>${user.username}</code>
├─ <b>User ID</b>   : <code>${user.id}</code>
╰─ <b>Server</b>    : <code>${selectedServer.name || selectedServer.domain}</code>

<b>📊 SPESIFIKASI</b>
├─ <b>Memory</b> : ${specs.memo === '0' ? 'Unlimited' : specs.memo + ' MB'}
├─ <b>Disk</b>    : ${specs.disk === '0' ? 'Unlimited' : specs.disk + ' MB'}
├─ <b>CPU</b>     : ${specs.cpu}%
╰─ <b>Egg ID</b>   : ${eggData.eggId}

<b>📌 LANGKAH LOGIN</b>
├─ 1. Klik tombol <b>LOGIN PANEL</b>
├─ 2. Masukkan <b>Username</b> di atas
├─ 3. Klik tombol <b>COPY PASSWORD</b>
╰─ 4. Paste password lalu <b>Login</b>

<b>⚠️ PERHATIAN</b>
├─ No DDOS / Abuse
├─ No Share / Free
╰─ Simpan Data Akun

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>✨ Selamat menggunakan Panel ${cmd.toUpperCase()}! ✨</i></blockquote>
`,
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '🌐 LOGIN PANEL', url: selectedServer.domain },
                    { text: 'COPY PASSWORD', copy_text: { text: password } }
                  ],
                  [
                    { text: '💬 SUPPORT', url: 'https://t.me/akuzyura' }
                  ]
                ]
              }
            });

          } catch (error) {
            clearTimeout(timeoutId2);
            if (error.name === 'AbortError') {
              throw new Error('Request timeout saat membuat server');
            }
            throw error;
          }

        } catch (error) {
          clearTimeout(timeoutId);
          if (error.name === 'AbortError') {
            throw new Error('Request timeout saat membuat user');
          }
          throw error;
        }
      })(),
      timeoutPromise
    ]);

  } catch (error) {
    console.error('Error:', error);
    
    let errorMessage = '❌ Terjadi kesalahan. Silakan coba lagi nanti.';
    
    if (error.message === 'timeout') {
      errorMessage = '<blockquote>⏱️ Proses terlalu lama (3 menit). Silakan coba lagi.</blockquote>';
    } else if (error.message.includes('timeout')) {
      errorMessage = `<blockquote>⏱️ Request timeout: ${error.message}</blockquote>`;
    }
    
    try {
      await ctx.editMessageText(errorMessage, { parse_mode: 'HTML' });
    } catch {
      try {
        await ctx.reply(errorMessage, { parse_mode: 'HTML' });
      } catch {}
    }
  }
});

// ========== HANDLE BATAL CREATE ==========
bot.action(/^cancel_create_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  
  try {
    const tempId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    const data = tempStorage.get(tempId);
    
    if (!data) {
      await ctx.answerCbQuery('❌ Session expired!', { alert: true });
      return;
    }

    if (data.userId !== userId) {
      await ctx.answerCbQuery('❌ Bukan session kamu!', { alert: true });
      return;
    }
    
    if (data.type !== 'cancel') {
      return;
    }
    
    tempStorage.delete(tempId);
    
    try {
      await ctx.editMessageText('<blockquote>❌ Pembuatan panel dibatalkan.</blockquote>', { parse_mode: 'HTML' });
    } catch {
      try {
        await ctx.reply('<blockquote>❌ Pembuatan panel dibatalkan.</blockquote>', { parse_mode: 'HTML' });
      } catch {}
    }
    
  } catch (error) {
    console.error('Error cancel create:', error);
  }
});
bot.command('cadp', async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || 'User';
  const text = ctx.message.text.split(' ').slice(1).join(' ').trim();

  if (ctx.chat.type === 'private') {
    return ctx.reply(`<blockquote>Perintah /cadp hanya bisa digunakan di dalam GROUP!</blockquote>
    `, { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: ' KEMBALI',
            callback_data: 'back_to_start',
            style: 'primary',
            icon_custom_emoji_id: '5311020286356236428' // 🔙 BACK
          }
        ]]
      }
    });
  }

  // ===== CEK COOLDOWN =====
  const cooldownCheck = checkCooldown(userId, 'cadp');
if (cooldownCheck.onCooldown) {
  return ctx.replyWithHTML(`
<blockquote><b,>Silakan tunggu <b>${cooldownCheck.minutesLeft} menit</b> lagi sebelum membuat lagi.

• Cooldown: 5 menit per admin panel</blockquote>
  `);
}

  // ===== CEK AKSES MULTI-FILE =====
  const ownerUsers = JSON.parse(fs.readFileSync(ownerFile));
  const premiumUsers = JSON.parse(fs.readFileSync(premiumUsersFile));
  const tkUsers = JSON.parse(fs.readFileSync(tkFile));
  const ptUsers = JSON.parse(fs.readFileSync(ptFile));
  const adminUsers = JSON.parse(fs.readFileSync(adminfile));
  const ressUsers = JSON.parse(fs.readFileSync(ressFile));
  const ceoUsers = JSON.parse(fs.readFileSync(ceoFile));

  const hasAccess = 
    ownerUsers.includes(String(userId)) ||
    premiumUsers.includes(String(userId)) ||
    ceoUsers.includes(String(userId)) ||
    tkUsers.includes(String(userId)) ||
    ptUsers.includes(String(userId)) ||
    adminUsers.includes(String(userId)) ||
    userId === vsett.adminId;

  if (!hasAccess) {
    return ctx.reply(`<blockquote><b>Minta akses create dulu sama owner!</b></blockquote>
    `, { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '📢 LAPORAN',
            url: 'https://t.me/akuzyura',
            style: 'danger',
            icon_custom_emoji_id: '5310169226856644648' // 🗑️ sampah
          }
        ]]
      }
    });
  }

  if (!text) {
    return ctx.reply(`<b>Klik Tombol Di Bawah Untuk Melihat Cara Buat Admin Panel👍</b>
    `, { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: ' CARA BUAT',
            callback_data: 'cadp_usage',
            style: 'success',
            icon_custom_emoji_id: '5310076249404621168' // ➕ tambah
          }
        ]]
      }
    });
  }

  const commandParams = text.split(',');
  if (commandParams.length < 2) {
    return ctx.reply(`<b>❌ Format Salah!!!!!</b>`, { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: ' CARA BUAT',
            callback_data: 'cadp_usage',
            style: 'success',
            icon_custom_emoji_id: '5310076249404621168'
          }
        ]]
      }
    });
  }

  const panelName = commandParams[0].trim();
  const telegramId = commandParams[1].trim();
  const password = panelName + '117';

  // ===== CEK SERVER ONLINE =====
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply(`<blockquote>Belum ada server terdaftar. Hubungi owner!</blockquote>
    `, { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: ' KEMBALI',
            callback_data: 'back_to_start',
            style: 'primary',
            icon_custom_emoji_id: '5311020286356236428'
          }
        ]]
      }
    });
  }

  const loadingMsg = await ctx.reply(`<blockquote>⏱️ Sedang mengecek server online...</blockquote>
  `, { parse_mode: 'HTML' });

  let onlineServers = [];
  
  for (const srv of servers) {
    try {
      const test = await fetch(`${srv.domain}/api/application/servers?page=1`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${srv.plta}`
        },
        timeout: 5000
      });

      if (test.ok) {
        onlineServers.push(srv);
      }
    } catch (error) {
      console.log(`Server ${srv.domain} offline:`, error.message);
    }
  }

  await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

  if (onlineServers.length === 0) {
    return ctx.reply(`<blockquote>Tidak ada server online! Semua server down.</blockquote>
    `, { 
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: ' KEMBALI',
            callback_data: 'back_to_start',
            style: 'primary',
            icon_custom_emoji_id: '5311020286356236428'
          }
        ]]
      }
    });
  }

  // ===== BUAT TOMBOL DENGAN STORAGE =====
  const buttons = [];

  // Tombol untuk pilihan server (dengan warna dan emoji premium)
  for (const srv of onlineServers) {
    const tempId = generateTempId();
    
    tempStorage.set(tempId, {
      type: 'select_server_cadp',
      panelName: panelName,
      telegramId: telegramId,
      serverId: srv.id,
      userId: userId.toString()
    });
    
    setTimeout(() => {
      tempStorage.delete(tempId);
    }, 5 * 60 * 1000);
    
    buttons.push([
      {
        text: `🖥️ ${srv.name || srv.domain.replace('https://', '')}`,
        callback_data: `cadp_${tempId}`,
        style: 'primary', // Biru
        icon_custom_emoji_id: '5301096984617166561' // ⚙️ settings premium
      }
    ]);
  }

  // Tombol BATAL dengan emoji premium
  const batalTempId = generateTempId();
  tempStorage.set(batalTempId, {
    type: 'cancel',
    userId: userId.toString()
  });
  
  setTimeout(() => {
    tempStorage.delete(batalTempId);
  }, 5 * 60 * 1000);
  
  buttons.push([
    {
      text: ' BATAL',
      callback_data: `cancel_cadp_${batalTempId}`,
      style: 'danger', // Merah
      icon_custom_emoji_id: '5310169226856644648' // 🗑️ sampah premium
    }
  ]);

  await ctx.reply(`<b>👑 CREATE ADMIN</b>
<blockquote expandable>↬ <b>Nama:</b> ${panelName}
↬ <b>Target:</b> <code>${telegramId}</code>
↬ <b>Tipe:</b> 👑 Admin Panel
</blockquote>

<b>⬇️ PILIH SERVER:</b>`, {
  parse_mode: 'HTML',
  reply_markup: { inline_keyboard: buttons }
});
});

bot.action('cadp_usage', async (ctx) => {
  const usageText = `<b>📖 CARA PEMBUATAN ADP</b>
<blockquote expandable>↬ <b>Kirim Ke Diri Sendiri:</b> /cadp nama
↬ <b>Kirim Ke Buyer:</b> /cadp Nama,Idtelegram

↬ <b>Contoh Pembuat:</b>
↬ <b>Kirim Ke Diri Sendiri:</b> /cadp nama
↬ <b>Kirim Ke Buyer:</b> /cadp Nama,12345678

⚠️ <b>Catatan:</b>
• Cooldown 5 menit
• Cek ID? Ketik /info
</blockquote>`;

  await ctx.reply(usageText, {
    parse_mode: 'HTML'
  });
  
  await ctx.answerCbQuery();
});
// ========== HANDLE PILIHAN SERVER CADP ==========
bot.action(/^cadp_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  
  try {
    const tempId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    const data = tempStorage.get(tempId);
    
    if (!data) {
      await ctx.answerCbQuery('❌ Session expired! Silakan ulangi dari awal', { 
        alert: true 
      }).catch(() => {});
      return;
    }

    // Validasi: cuma pembuat yang bisa pencet
    if (data.userId !== userId) {
      await ctx.answerCbQuery('❌ Ini bukan session kamu!', { 
        alert: true 
      }).catch(() => {});
      return;
    }
    
    // ✅ PERBAIKAN: Cek tipe yang benar (select_server_cadp)
    if (data.type !== 'select_server_cadp') {
      console.log(`Type mismatch: expected select_server_cadp, got ${data.type}`);
      await ctx.answerCbQuery('❌ Session type error!', { alert: true }).catch(() => {});
      return;
    }
    
    tempStorage.delete(tempId);
    
    const { panelName, telegramId, serverId } = data;
    const password = panelName + '117';

    const servers = JSON.parse(fs.readFileSync(serversFile));
    const selectedServer = servers.find(s => s.id === serverId);

    if (!selectedServer) {
      try {
        await ctx.editMessageText('<blockquote>❌ Server tidak ditemukan!</blockquote>', { 
          parse_mode: 'HTML' 
        });
      } catch {
        await ctx.reply('<blockquote>❌ Server tidak ditemukan!</blockquote>', { 
          parse_mode: 'HTML' 
        });
      }
      return;
    }

    // LOADING
    try {
      await ctx.editMessageText(`⏳ <b>Membuat admin panel di server ${selectedServer.name || selectedServer.domain}...</b>`, { 
        parse_mode: 'HTML' 
      });
    } catch {
      await ctx.reply(`⏳ <b>Membuat admin panel di server ${selectedServer.name || selectedServer.domain}...</b>`, { 
        parse_mode: 'HTML' 
      });
    }

    // CEK EGG (OPSIONAL)
    let eggData;
    try {
      eggData = await getValidEgg(selectedServer, selectedServer.plta);
    } catch (eggError) {
      console.log('Egg check skipped:', eggError.message);
    }

    // BUAT USER ADMIN
    const response = await fetch(`${selectedServer.domain}/api/application/users`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${selectedServer.plta}`
      },
      body: JSON.stringify({
        email: `${panelName}@panelvip.app`,
        username: panelName,
        first_name: panelName,
        last_name: 'Admin',
        language: 'en',
        root_admin: true,
        password: password
      })
    });

    const dataUser = await response.json();

    if (dataUser.errors) {
      throw new Error(dataUser.errors[0].detail || JSON.stringify(dataUser.errors[0]));
    }

    const user = dataUser.attributes;

    // HAPUS PESAN LOADING
    try {
      await ctx.deleteMessage();
    } catch {}

    // SET COOLDOWN
    setCooldown(userId, 'cadp');

await ctx.telegram.sendPhoto(telegramId, vsett.pp_adp, {
  caption: `</blockquote><b>🔐 INFORMASI AKUN</b>
├─ <b>Username</b> : <code>${user.username}</code>
├─ <b>User ID</b>   : <code>${user.id}</code>
${eggData ? `├─ <b>Egg ID</b>    : <code>${eggData.eggId}</code>` : ''}
╰─ <b>Server</b>    : <code>${selectedServer.name || selectedServer.domain}</code>

<b>📌 LANGKAH LOGIN</b>
├─ 1. Klik tombol <b>LOGIN PANEL</b>
├─ 2. Masukkan <b>Username</b> di atas
├─ 3. Klik tombol <b>COPY PASSWORD</b>
╰─ 4. Paste password lalu <b>Login</b>

<b>⚠️ PERHATIAN</b>
├─ Jangan share data ini
├─ Simpan di tempat aman
╰─ Lapor jika ada masalah

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>✨ Selamat menggunakan Admin Panel! ✨</i></blockquote>
`,
  parse_mode: 'HTML',
  reply_markup: {
    inline_keyboard: [
      [
        {
          text: '🌐 LOGIN PANEL',
          url: selectedServer.domain
        },
        {
          text: 'COPY PASSWORD',
          copy_text: { text: password }
        }
      ],
      [
        {
          text: '💬 SUPPORT',
          url: 'https://t.me/akuzyura'
        }
      ]
    ]
  }
});
await ctx.replyWithHTML(`
<blockquote>✅ <b>Admin panel berhasil dikirim</b>

├─ 📤 Target: <code>${telegramId}</code>
╰─ 🖥️ Server: ${selectedServer.name || selectedServer.domain}
</blockquote>
`);

// Kirim notifikasi ke owner
try {
  await ctx.telegram.sendMessage(vsett.adminId, `
<blockquote><b>📢 ADMIN PANEL BARU</b>

👤 <b>Creator:</b> @${ctx.from.username} (<code>${ctx.from.id}</code>)
📤 <b>Target:</b> <code>${telegramId}</code>
🖥️ <b>Server:</b> ${selectedServer.name || selectedServer.domain}

━━━━━━━━━━━━━━━━━━━━
✅ Status: Berhasil dikirim
</blockquote>
`, { parse_mode: 'HTML' });
} catch (err) {
  console.log('Gagal kirim notif ke owner:', err.message);
}

  } catch (error) {
    console.error('Error CADP:', error);
    
    let errorMessage = '❌ Terjadi kesalahan. Silakan coba lagi.';
    
    if (error.message) {
      errorMessage = `<blockquote>❌ Error: ${error.message.substring(0, 200)}</blockquote>`;
    }
    
    try {
      await ctx.editMessageText(errorMessage, { parse_mode: 'HTML' }).catch(() => {
        ctx.reply(errorMessage, { parse_mode: 'HTML' });
      });
    } catch {}
  }
});
// ========== HANDLE BATAL CADP DENGAN VALIDASI USER ==========
bot.action(/^cancel_cadp_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  
  try {
    const tempId = ctx.match[1];
    const userId = ctx.from.id.toString();
    
    const data = tempStorage.get(tempId);
    
    if (!data) {
  // Kasih notifikasi popup
  await ctx.answerCbQuery('❌ Session expired! Silakan ulangi dari awal', { 
    alert: true 
  }).catch(() => {});
  
  // Edit pesan jadi expired
  try {
    await ctx.editMessageText('<blockquote>⏱️ <b>SESSION EXPIRED</b>\n\nTombol ini sudah tidak berlaku. Silakan buat command baru.</blockquote>', { 
      parse_mode: 'HTML' 
    });
  } catch {
    // Kalo gagal edit, ya udah
  }
  return;
}
    
    // Validasi: cuma pembuat yang bisa batalin
if (data.userId !== userId) {
  // Cuma popup doang, GAK USAH EDIT ATAU REPLY
  await ctx.answerCbQuery('❌ Bukan session kamu!', { 
    alert: true 
  }).catch(() => {});
  
  return;
}
    
    // Validasi tipe
    if (data.type !== 'cancel') {
      return;
    }
    
    tempStorage.delete(tempId);
    
    try {
      await ctx.editMessageText('<blockquote>❌ Pembuatan admin panel dibatalkan.</blockquote>', { 
        parse_mode: 'HTML' 
      });
    } catch {
      try {
        await ctx.reply('<blockquote>❌ Pembuatan admin panel dibatalkan.</blockquote>', { 
          parse_mode: 'HTML' 
        });
      } catch {}
    }
    
  } catch (error) {
    console.error('Error cancel CADP:', error);
  }
});
// ========== DELSRVOFF DENGAN 3 TOMBOL ==========
bot.command('delsrvoff', async (ctx) => {
  const chatId = ctx.chat.id;
  const fromId = ctx.from.id.toString();

  // Cek harus di grup
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ ᴋʜᴜꜱᴜꜱ ɢʀᴜᴘ!');
  }

  // ===== CEK AKSES (HANYA OWNER UTAMA) =====
  if (fromId !== vsett.adminId) {
    return ctx.reply('❌ ᴋʜᴜsᴜs ᴏᴡɴᴇʀ', {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '📢 LAPORAN',
            url: 'https://t.me/akuzyura',
            style: 'danger',
            icon_custom_emoji_id: '5310169226856644648'
          }
        ]]
      }
    });
  }

  // Baca semua server dari file
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply('<blockquote>❌ Belum ada server terdaftar!</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  const loadingMsg = await ctx.reply('⏳ <b>Mencari server offline di semua panel...</b>', { parse_mode: 'HTML' });

  try {
    let allOfflineServers = [];
    let serverResults = [];

    // Loop setiap server yang terdaftar
    for (const srv of servers) {
      try {
        let page = 1;
        let totalPages = 1;
        let offlineInThisServer = [];

        // Cek koneksi ke server
        const testConn = await fetch(`${srv.domain}/api/application/servers?page=1`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srv.plta}`
          },
          timeout: 5000
        });

        if (!testConn.ok) {
          serverResults.push(`❌ ${srv.name || srv.domain} - Gagal konek`);
          continue;
        }

        // Ambil semua server dari panel ini
        do {
          let f = await fetch(`${srv.domain}/api/application/servers?page=${page}`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${srv.plta}`,
            },
          });

          let res = await f.json();
          let panelServers = res.data;
          totalPages = res.meta.pagination.total_pages;

          for (let server of panelServers) {
            let s = server.attributes;
            try {
              let f3 = await fetch(
                `${srv.domain}/api/client/servers/${s.uuid.split("-")[0]}/resources`,
                {
                  method: "GET",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${srv.pltc}`,
                  },
                }
              );

              let data = await f3.json();
              let status = data.attributes ? data.attributes.current_state : s.status;

              if (status === "offline") {
                offlineInThisServer.push({ 
                  id: s.id, 
                  name: s.name,
                  serverName: srv.name || srv.domain,
                  serverDomain: srv.domain
                });
              }
            } catch (err) {
              console.error(`Gagal ambil data server ${s.id} di ${srv.domain}`, err);
            }
          }

          page++;
        } while (page <= totalPages);

        serverResults.push(`✅ ${srv.name || srv.domain} - ${offlineInThisServer.length} server offline`);
        allOfflineServers = [...allOfflineServers, ...offlineInThisServer];

      } catch (error) {
        serverResults.push(`❌ ${srv.name || srv.domain} - Error: ${error.message}`);
      }
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    if (allOfflineServers.length === 0) {
      return ctx.reply('<blockquote>✅ Tidak ada server offline untuk dihapus.</blockquote>', { 
        parse_mode: 'HTML' 
      });
    }

    // **KIRIM RINGKASAN PER SERVER**
    let serverSummary = `<blockquote><b>📊 RINGKASAN PER SERVER:</b>\n\n`;
    serverResults.forEach(result => {
      serverSummary += `${result}\n`;
    });
    serverSummary += `\n<b>Total offline:</b> ${allOfflineServers.length}</blockquote>`;

    const summaryMsg = await ctx.replyWithHTML(serverSummary);

    // ===== KONFIRMASI DENGAN 3 TOMBOL =====
    const confirmMsg = await ctx.reply(`⚠️ *${allOfflineServers.length} server offline akan dihapus. Lanjutkan?*`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🗑️ YA, HAPUS SEMUA',
              callback_data: 'confirm_delsrvoff',
              style: 'danger', // MERAH
              icon_custom_emoji_id: '5310169226856644648' // 🗑️ sampah
            }
          ],
          [
            {
              text: '🔍 LIHAT DETAIL',
              callback_data: 'lihat_detail_offline',
              style: 'primary', // BIRU
              icon_custom_emoji_id: '5301096984617166561' // ⚙️ settings
            },
            {
              text: '❌ BATAL',
              callback_data: 'cancel_delsrvoff',
              style: 'primary', // BIRU
              icon_custom_emoji_id: '5311020286356236428' // 🔙 back
            }
          ]
        ]
      }
    });

    // **SIMPAN DATA KE STORAGE DENGAN LENGKAP**
    const tempId = generateTempId();
    tempStorage.set(tempId, {
      action: 'delsrvoff',
      servers: allOfflineServers,
      userId: fromId,
      summaryMsgId: summaryMsg.message_id,
      confirmMsgId: confirmMsg.message_id
    });

    const userTempKey = `delsrvoff_${fromId}`;
    tempStorage.set(userTempKey, tempId);

    setTimeout(() => {
      tempStorage.delete(tempId);
      tempStorage.delete(userTempKey);
    }, 5 * 60 * 1000);

  } catch (error) {
    console.error(error);
    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    ctx.reply('<blockquote>⚠️ Terjadi kesalahan saat memproses /delsrvoff.</blockquote>', { parse_mode: 'HTML' });
  }
});

// ========== HANDLE LIHAT DETAIL OFFLINE ==========
bot.action('lihat_detail_offline', async (ctx) => {
  const fromId = ctx.from.id.toString();
  const userTempKey = `delsrvoff_${fromId}`;
  const tempId = tempStorage.get(userTempKey);
  
  if (!tempId) {
    await ctx.answerCbQuery('❌ Session expired!', { alert: true });
    return;
  }

  const data = tempStorage.get(tempId);
  if (!data || data.action !== 'delsrvoff') {
    await ctx.answerCbQuery('❌ Data expired!', { alert: true });
    return;
  }

  const offlineServers = data.servers;
  
  let detailText = `<b>📋 DETAIL SERVER OFFLINE (${offlineServers.length})</b>\n\n<blockquote>`;
  
  offlineServers.slice(0, 15).forEach((srv, i) => {
    detailText += `${i+1}. ${srv.name}\n   📍 ${srv.serverName}\n   🆔 ${srv.id}\n\n`;
  });
  
  if (offlineServers.length > 15) {
    detailText += `...dan ${offlineServers.length - 15} lainnya\n`;
  }
  
  detailText += `</blockquote>`;

  await ctx.editMessageText(detailText, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        {
          text: '🔙 KEMBALI',
          callback_data: 'back_to_confirm',
          style: 'primary',
          icon_custom_emoji_id: '5311020286356236428'
        }
      ]]
    }
  });
  
  await ctx.answerCbQuery();
});

// ========== HANDLE KEMBALI KE KONFIRMASI ==========
bot.action('back_to_confirm', async (ctx) => {
  const fromId = ctx.from.id.toString();
  const userTempKey = `delsrvoff_${fromId}`;
  const tempId = tempStorage.get(userTempKey);
  
  if (!tempId) {
    await ctx.editMessageText('<blockquote>❌ Session expired!</blockquote>', { parse_mode: 'HTML' });
    return;
  }

  const data = tempStorage.get(tempId);
  if (!data) {
    await ctx.editMessageText('<blockquote>❌ Data expired!</blockquote>', { parse_mode: 'HTML' });
    return;
  }

  await ctx.editMessageText(`⚠️ *${data.servers.length} server offline akan dihapus. Lanjutkan?*`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🗑️ YA, HAPUS SEMUA',
            callback_data: 'confirm_delsrvoff',
            style: 'danger',
            icon_custom_emoji_id: '5310169226856644648'
          }
        ],
        [
          {
            text: '🔍 LIHAT DETAIL',
            callback_data: 'lihat_detail_offline',
            style: 'primary',
            icon_custom_emoji_id: '5301096984617166561'
          },
          {
            text: '❌ BATAL',
            callback_data: 'cancel_delsrvoff',
            style: 'primary',
            icon_custom_emoji_id: '5311020286356236428'
          }
        ]
      ]
    }
  });
  
  await ctx.answerCbQuery();
});

// ========== HANDLE KONFIRMASI DELSRVOFF ==========
bot.action('confirm_delsrvoff', async (ctx) => {
  const fromId = ctx.from.id.toString();
  
  if (fromId !== vsett.adminId) {
    await ctx.answerCbQuery('❌ Bukan owner!', { alert: true });
    return;
  }

  const userTempKey = `delsrvoff_${fromId}`;
  const tempId = tempStorage.get(userTempKey);
  
  if (!tempId) {
    await ctx.editMessageText('<blockquote>❌ Session tidak ditemukan! Silakan ulangi /delsrvoff dari awal.</blockquote>', { 
      parse_mode: 'HTML' 
    });
    return;
  }

  const data = tempStorage.get(tempId);
  if (!data || data.action !== 'delsrvoff') {
    await ctx.editMessageText('<blockquote>❌ Data expired! Ulangi dari awal.</blockquote>', { parse_mode: 'HTML' });
    tempStorage.delete(userTempKey);
    return;
  }

  const summaryMsgId = data.summaryMsgId;
  const confirmMsgId = data.confirmMsgId;
  
  tempStorage.delete(tempId);
  tempStorage.delete(userTempKey);
  
  const offlineServers = data.servers;

  try {
    await ctx.deleteMessage();
  } catch (err) {
    console.log('Gagal hapus pesan konfirmasi:', err.message);
  }

  const loadingMsg = await ctx.reply(`⏳ <b>Menghapus ${offlineServers.length} server offline...</b>`, { 
    parse_mode: 'HTML' 
  });

  let success = [];
  let failed = [];
  let serverStats = {};

  for (let srv of offlineServers) {
    try {
      const servers = JSON.parse(fs.readFileSync(serversFile));
      const panelServer = servers.find(p => p.domain === srv.serverDomain);

      if (!panelServer) {
        failed.push(`❌ ${srv.name} (Panel tidak ditemukan)`);
        continue;
      }

      let del = await fetch(`${srv.serverDomain}/api/application/servers/${srv.id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${panelServer.plta}`,
        },
      });

      if (del.status === 204) {
        success.push(`✅ ${srv.name} (${srv.serverName})`);
        serverStats[srv.serverName] = serverStats[srv.serverName] || { success: 0, failed: 0 };
        serverStats[srv.serverName].success++;
      } else {
        failed.push(`❌ ${srv.name} (${srv.serverName})`);
        serverStats[srv.serverName] = serverStats[srv.serverName] || { success: 0, failed: 0 };
        serverStats[srv.serverName].failed++;
      }
    } catch (err) {
      console.error(`Gagal hapus server ${srv.id}`, err);
      failed.push(`❌ ${srv.name} (${srv.serverName})`);
      serverStats[srv.serverName] = serverStats[srv.serverName] || { success: 0, failed: 0 };
      serverStats[srv.serverName].failed++;
    }
  }

  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id);
  } catch (err) {
    console.log('Gagal hapus pesan loading:', err.message);
  }

  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, summaryMsgId);
  } catch (err) {
    console.log('Gagal hapus pesan ringkasan:', err.message);
  }

  let report = `<blockquote><b>🗑️ HASIL PENGHAPUSAN SERVER OFFLINE</b>\n\n`;

  if (success.length) {
    report += `<b>✅ BERHASIL (${success.length}):</b>\n`;
    success.slice(0, 15).forEach(item => { report += `${item}\n`; });
    if (success.length > 15) report += `...dan ${success.length - 15} lainnya\n`;
    report += `\n`;
  }
  
  if (failed.length) {
    report += `<b>❌ GAGAL (${failed.length}):</b>\n`;
    failed.slice(0, 10).forEach(item => { report += `${item}\n`; });
    if (failed.length > 10) report += `...dan ${failed.length - 10} lainnya\n`;
  }

  report += `</blockquote>`;

  if (report.length > 4096) {
    const chunks = report.match(/[\s\S]{1,4096}/g) || [];
    for (const chunk of chunks) {
      await ctx.replyWithHTML(chunk);
    }
  } else {
    await ctx.replyWithHTML(report);
  }

  await ctx.answerCbQuery();
});

// ========== BATAL DELSRVOFF ==========
bot.action('cancel_delsrvoff', async (ctx) => {
  await ctx.editMessageText('<blockquote>❌ Penghapusan dibatalkan.</blockquote>', { 
    parse_mode: 'HTML' 
  });
  await ctx.answerCbQuery();
});
bot.command('clearoff', async (ctx) => {
  const chatId = ctx.chat.id;
  const fromId = ctx.from.id.toString();

  // Cek harus di grup
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ ᴋʜᴜꜱᴜꜱ ɢʀᴜᴘ!');
  }

  // ===== CEK AKSES (HANYA OWNER UTAMA) =====
  if (fromId !== vsett.adminId) {
    return ctx.reply('❌ ᴋʜᴜsᴜs ᴏᴡɴᴇʀ', {
      ...Markup.inlineKeyboard([
        Markup.button.url('ʟᴀᴘᴏʀᴀɴ', 'https://t.me/akuzyura')
      ])
    });
  }

  // Baca semua server dari file
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply('<blockquote>❌ Belum ada server terdaftar!</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  const startMsg = await ctx.reply('<b>🗑️ Memulai proses CLEAROFF di semua server...</b>', { parse_mode: 'HTML' });

  try {
    // ===== VARIABEL GLOBAL =====
    let totalServerOffline = 0;
    let totalServerSuccess = 0;
    let totalServerFailed = 0;
    let totalUserWithoutServer = 0;
    let totalUserSuccess = 0;
    let totalUserFailed = 0;
    
    let allServerResults = [];  // ✅ Untuk detail server
    let allUserResults = [];     // ✅ Untuk detail user
    let serverDetails = [];

    // ===== LOOP SETIAP SERVER =====
    for (const srv of servers) {
      try {
        // Cek koneksi ke server
        const testConn = await fetch(`${srv.domain}/api/application/servers?page=1`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srv.plta}`
          },
          timeout: 5000
        });

        if (!testConn.ok) {
          serverDetails.push(`❌ ${srv.name || srv.domain} - Gagal konek`);
          continue;
        }

        serverDetails.push(`✅ ${srv.name || srv.domain} - Memproses...`);

        // ===== STEP 1: HAPUS SERVER OFFLINE DI SERVER INI =====
        let page = 1;
        let totalPages = 1;
        let offlineServers = [];

        // Ambil semua server offline dari panel ini
        do {
          let f = await fetch(`${srv.domain}/api/application/servers?page=${page}`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${srv.plta}`,
            },
          });

          let res = await f.json();
          let panelServers = res.data;
          totalPages = res.meta.pagination.total_pages;

          for (let server of panelServers) {
            let s = server.attributes;
            try {
              let f3 = await fetch(
                `${srv.domain}/api/client/servers/${s.uuid.split("-")[0]}/resources`,
                {
                  method: "GET",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${srv.pltc}`,
                  },
                }
              );

              let data = await f3.json();
              let status = data.attributes ? data.attributes.current_state : s.status;

              if (status === "offline") {
                offlineServers.push({ 
                  id: s.id, 
                  name: s.name,
                  serverName: srv.name || srv.domain
                });
              }
            } catch (err) {
              console.error(`Gagal ambil data server ${s.id} di ${srv.domain}`, err);
            }
          }

          page++;
        } while (page <= totalPages);

        totalServerOffline += offlineServers.length;

        // Hapus server offline
        let serverSuccess = 0;
        let serverFailed = 0;

        for (let srvOffline of offlineServers) {
          try {
            let del = await fetch(`${srv.domain}/api/application/servers/${srvOffline.id}`, {
              method: "DELETE",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${srv.plta}`,
              },
            });

            if (del.status === 204) {
              serverSuccess++;
              allServerResults.push(`✅ ${srvOffline.name} (${srvOffline.serverName})`);
            } else {
              serverFailed++;
              allServerResults.push(`❌ ${srvOffline.name} (${srvOffline.serverName})`);
            }
          } catch (err) {
            console.error(`Gagal hapus server ${srvOffline.id}`, err);
            serverFailed++;
            allServerResults.push(`❌ ${srvOffline.name} (${srvOffline.serverName}) - Error`);
          }
        }

        totalServerSuccess += serverSuccess;
        totalServerFailed += serverFailed;

        // Update server details
        serverDetails[serverDetails.length - 1] = `✅ ${srv.name || srv.domain} - Server offline: ${offlineServers.length} (✅ ${serverSuccess} | ❌ ${serverFailed})`;

      } catch (error) {
        console.error(`Error di server ${srv.domain}:`, error);
        serverDetails.push(`❌ ${srv.name || srv.domain} - Error: ${error.message}`);
      }
    }

    // ===== TAMPILKAN RINGKASAN PER SERVER =====
    let serverSummary = `<blockquote><b>📊 RINGKASAN PER SERVER:</b>\n\n`;
    serverDetails.forEach(detail => {
      serverSummary += `${detail}\n`;
    });
    serverSummary += `\n<b>Total server offline:</b> ${totalServerOffline}</blockquote>`;

    await ctx.replyWithHTML(serverSummary);

    if (totalServerOffline > 0) {
      // Kirim hasil detail server yang dihapus (jika ada)
      if (allServerResults.length > 0) {
        let serverDetailReport = `<blockquote><b>📋 DETAIL SERVER YANG DIHAPUS:</b>\n\n`;
        allServerResults.slice(0, 30).forEach(item => {
          serverDetailReport += `${item}\n`;
        });
        if (allServerResults.length > 30) {
          serverDetailReport += `...dan ${allServerResults.length - 30} lainnya\n`;
        }
        serverDetailReport += `</blockquote>`;

        if (serverDetailReport.length > 4096) {
          const chunks = serverDetailReport.match(/[\s\S]{1,4096}/g) || [];
          for (const chunk of chunks) {
            await ctx.replyWithHTML(chunk);
          }
        } else {
          await ctx.replyWithHTML(serverDetailReport);
        }
      }
    }

    // ===== STEP 2: TUNGGU 5 MENIT =====
    const waitMsg = await ctx.reply('<b>⏳ Menunggu 5 menit sebelum menghapus user offline...</b>\n\nWaktu tunggu: 5:00', { 
      parse_mode: 'HTML' 
    });

    // Hitung mundur
    for (let i = 4; i >= 1; i--) {
      await new Promise(resolve => setTimeout(resolve, 60 * 1000));
      await ctx.telegram.editMessageText(chatId, waitMsg.message_id, null, 
        `<b>⏳ Menunggu 5 menit sebelum menghapus user offline...</b>\n\nWaktu tunggu: ${i}:00`, 
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }

    await new Promise(resolve => setTimeout(resolve, 60 * 1000));
    await ctx.telegram.deleteMessage(chatId, waitMsg.message_id).catch(() => {});

    // ===== STEP 3: HAPUS USER OFFLINE DI SEMUA SERVER =====
    await ctx.reply('<b>🔍 Mencari user tanpa server di semua panel (kecuali admin)...</b>', { 
      parse_mode: 'HTML' 
    });

    // **RESET VARIABLE UNTUK USER**
    let userDetails = [];
    allUserResults = []; // ✅ PAKE VARIABLE YANG SUDAH ADA (JANGAN DEKLARASI ULANG)

    for (const srv of servers) {
      try {
        // Cek koneksi ke server
        const testConn = await fetch(`${srv.domain}/api/application/users?page=1`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srv.plta}`
          },
          timeout: 5000
        });

        if (!testConn.ok) {
          userDetails.push(`❌ ${srv.name || srv.domain} - Gagal konek`);
          continue;
        }

        let page = 1;
        let totalPages = 1;
        let offlineUsers = [];

        // Ambil semua user
        do {
          let f = await fetch(`${srv.domain}/api/application/users?page=${page}`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${srv.plta}`,
            },
          });

          let res = await f.json();
          let users = res.data;
          totalPages = res.meta.pagination.total_pages;

          for (let user of users) {
            let u = user.attributes;
            
            // Skip admin panel (root_admin)
            if (u.root_admin) continue;

            // Cek apakah user memiliki server
            let hasServer = false;
            try {
              let serverCheck = await fetch(`${srv.domain}/api/application/servers?filter[user_id]=${u.id}`, {
                method: "GET",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${srv.plta}`,
                },
              });

              let serverData = await serverCheck.json();
              if (serverData.data && serverData.data.length > 0) {
                hasServer = true;
              }
            } catch (err) {
              console.error(`Gagal cek server user ${u.id} di ${srv.domain}`, err);
            }

            // Jika user tidak memiliki server, tambahkan ke list offline
            if (!hasServer) {
              offlineUsers.push({ 
                id: u.id, 
                username: u.username, 
                email: u.email,
                serverName: srv.name || srv.domain
              });
            }
          }

          page++;
        } while (page <= totalPages);

        totalUserWithoutServer += offlineUsers.length;

        // Hapus user offline
        let userSuccess = 0;
        let userFailed = 0;

        for (let user of offlineUsers) {
          try {
            let del = await fetch(`${srv.domain}/api/application/users/${user.id}`, {
              method: "DELETE",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${srv.plta}`,
              },
            });

            if (del.status === 204) {
              userSuccess++;
              totalUserSuccess++;
              allUserResults.push(`✅ ${user.username} (${user.email}) - ${user.serverName}`);
            } else {
              userFailed++;
              totalUserFailed++;
              allUserResults.push(`❌ ${user.username} (${user.email}) - ${user.serverName}`);
            }
          } catch (err) {
            console.error(`Gagal hapus user ${user.id}`, err);
            userFailed++;
            totalUserFailed++;
            allUserResults.push(`❌ ${user.username} (${user.email}) - ${user.serverName} (Error)`);
          }
        }

        userDetails.push(`✅ ${srv.name || srv.domain} - User tanpa server: ${offlineUsers.length} (✅ ${userSuccess} | ❌ ${userFailed})`);

      } catch (error) {
        console.error(`Error di server ${srv.domain}:`, error);
        userDetails.push(`❌ ${srv.name || srv.domain} - Error: ${error.message}`);
      }
    }

    // ===== TAMPILKAN RINGKASAN USER PER SERVER =====
    let userSummary = `<blockquote><b>📊 RINGKASAN USER PER SERVER:</b>\n\n`;
    userDetails.forEach(detail => {
      userSummary += `${detail}\n`;
    });
    userSummary += `\n<b>Total user tanpa server:</b> ${totalUserWithoutServer}</blockquote>`;

    await ctx.replyWithHTML(userSummary);

    if (totalUserWithoutServer > 0 && allUserResults.length > 0) {
      // Kirim hasil detail user yang dihapus
      let userDetailReport = `<blockquote><b>📋 DETAIL USER YANG DIHAPUS:</b>\n\n`;
      allUserResults.slice(0, 30).forEach(item => {
        userDetailReport += `${item}\n`;
      });
      if (allUserResults.length > 30) {
        userDetailReport += `...dan ${allUserResults.length - 30} lainnya\n`;
      }
      userDetailReport += `</blockquote>`;

      if (userDetailReport.length > 4096) {
        const chunks = userDetailReport.match(/[\s\S]{1,4096}/g) || [];
        for (const chunk of chunks) {
          await ctx.replyWithHTML(chunk);
        }
      } else {
        await ctx.replyWithHTML(userDetailReport);
      }
    }

    // ===== LAPORAN AKHIR =====
    const finalReport = `
<blockquote><b>🎯 PROSES CLEAROFF SELESAI</b>

<b>📊 STATISTIK PENGHAPUSAN:</b>
• <b>Server offline:</b> ${totalServerOffline} ditemukan
  ✅ Berhasil: ${totalServerSuccess}
  ❌ Gagal: ${totalServerFailed}

• <b>User tanpa server:</b> ${totalUserWithoutServer} ditemukan
  ✅ Berhasil: ${totalUserSuccess}
  ❌ Gagal: ${totalUserFailed}

⏰ Proses memakan waktu: ±5 menit</blockquote>
    `;

    await ctx.replyWithHTML(finalReport);

    // Hapus pesan awal
    await ctx.telegram.deleteMessage(chatId, startMsg.message_id).catch(() => {});

  } catch (error) {
    console.error(error);
    ctx.reply('<blockquote>⚠️ Terjadi kesalahan saat memproses /clearoff.</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }
});

// ========== TOTALSERVER - HITUNG TOTAL SERVER DI SEMUA PANEL ==========
bot.command('totalserver', async (ctx) => {
  const chatId = ctx.chat.id;
  const fromId = ctx.from.id.toString();

  // Cek harus di grup
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ ᴋʜᴜꜱᴜꜱ ɢʀᴜᴘ!');
  }
  // Baca semua server dari file
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply('<blockquote>❌ Belum ada server terdaftar!</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  const loadingMsg = await ctx.reply('⏳ <b>Menghitung total server di semua panel...</b>', { parse_mode: 'HTML' });

  try {
    let totalServers = 0;
    let serverDetails = [];
    let onlineCount = 0;
    let offlineCount = 0;

    // Loop setiap server yang terdaftar
    for (const srv of servers) {
      try {
        // Cek koneksi ke server
        const testConn = await fetch(`${srv.domain}/api/application/servers?page=1`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srv.plta}`
          },
          timeout: 5000
        });

        if (!testConn.ok) {
          serverDetails.push(`❌ ${srv.name || srv.domain} - Gagal konek`);
          offlineCount++;
          continue;
        }

        let page = 1;
        let totalPages = 1;
        let serverInThisPanel = 0;

        // Ambil semua server dari panel ini
        do {
          let f = await fetch(`${srv.domain}/api/application/servers?page=${page}`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${srv.plta}`,
            },
          });

          let res = await f.json();
          totalPages = res.meta.pagination.total_pages;

          if (res.data && res.data.length > 0) {
            serverInThisPanel += res.data.length;
          }

          page++;
        } while (page <= totalPages);

        totalServers += serverInThisPanel;
        serverDetails.push(`✅ ${srv.name || srv.domain} - ${serverInThisPanel} server`);
        onlineCount++;

      } catch (error) {
        console.error(`Error di server ${srv.domain}:`, error.message);
        serverDetails.push(`❌ ${srv.name || srv.domain} - Error: ${error.message}`);
        offlineCount++;
      }
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    // Buat 1 PESAN GABUNGAN
    let finalReport = `<blockquote><b>📊 TOTAL SERVER KESELURUHAN</b>\n\n`;
    
    // Detail per server
    finalReport += `<b>📋 DETAIL PER SERVER:</b>\n`;
    serverDetails.forEach(detail => {
      finalReport += `${detail}\n`;
    });
    
    // Ringkasan
    finalReport += `\n<b>📈 RINGKASAN:</b>\n`;
    finalReport += `• <b>Jumlah Server:</b> <code>${totalServers}</code>\n`;
    finalReport += `• <b>Jumlah Panel:</b> ${servers.length}\n`;
    finalReport += `  ✅ Online: ${onlineCount}\n`;
    finalReport += `  ❌ Offline: ${offlineCount}</blockquote>`;

    // Kirim 1 pesan aja
    await ctx.replyWithHTML(finalReport, {
      reply_to_message_id: ctx.message.message_id
    });

  } catch (error) {
    console.error(error);
    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    ctx.reply('<blockquote>⚠️ Terjadi kesalahan saat memproses /totalserver.</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }
});
// ========== LISTADMIN - DAFTAR ADMIN PANEL ==========
// ========== LISTADMIN - DAFTAR ADMIN PANEL DI SEMUA SERVER (SEDERHANA) ==========
bot.command('listadmin', async (ctx) => {
  const chatId = ctx.chat.id;
  const fromId = ctx.from.id.toString();

  // Cek harus di grup
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ ᴋʜᴜꜱᴜꜱ ɢʀᴜᴘ!');
  }

  const hasAccess = 
    
    fromId === vsett.adminId;

  if (!hasAccess) {
    return ctx.reply('❌ ᴋʜᴜsᴜs ᴏᴡɴᴇʀ', {
      ...Markup.inlineKeyboard([
        Markup.button.url('ʟᴀᴘᴏʀᴀɴ', 'https://t.me/akuzyura')
      ])
    });
  }

  // Baca semua server dari file
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply('<blockquote>❌ Belum ada server terdaftar!</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  const loadingMsg = await ctx.reply('⏳ <b>Mengambil daftar admin dari semua panel...</b>', { parse_mode: 'HTML' });

  try {
    let serverResults = [];
    let onlineCount = 0;
    let offlineCount = 0;
    let totalAdmins = 0;

    // Loop setiap server yang terdaftar
    for (const srv of servers) {
      try {
        // Cek koneksi ke server
        const testConn = await fetch(`${srv.domain}/api/application/users?page=1`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srv.plta}`
          },
          timeout: 5000
        });

        if (!testConn.ok) {
          serverResults.push(`❌ ${srv.name || srv.domain} - Gagal konek`);
          offlineCount++;
          continue;
        }

        let page = 1;
        let totalPages = 1;
        let adminCount = 0;

        // Ambil semua user dari panel ini
        do {
          let f = await fetch(`${srv.domain}/api/application/users?page=${page}`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${srv.plta}`,
            },
          });

          let res = await f.json();
          let users = res.data;
          totalPages = res.meta.pagination.total_pages;

          for (let user of users) {
            let u = user.attributes;
            if (u.root_admin) {
              adminCount++;
            }
          }

          page++;
        } while (page <= totalPages);

        totalAdmins += adminCount;
        serverResults.push(`✅ ${srv.name || srv.domain} - ${adminCount} admin`);
        onlineCount++;

      } catch (error) {
        console.error(`Error di server ${srv.domain}:`, error.message);
        serverResults.push(`❌ ${srv.name || srv.domain} - Error: ${error.message}`);
        offlineCount++;
      }
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    // Buat 1 PESAN RINGKASAN
    let finalReport = `<blockquote><b>📋 DAFTAR ADMIN PANEL</b>\n\n`;
    
    // Ringkasan per server
    finalReport += `<b>📊 RINGKASAN PER SERVER:</b>\n`;
    serverResults.forEach(result => {
      finalReport += `${result}\n`;
    });
    
    finalReport += `\n<b>📈 TOTAL KESELURUHAN:</b>\n`;
    finalReport += `• <b>Total Admin:</b> ${totalAdmins}\n`;
    finalReport += `• <b>Panel Online:</b> ${onlineCount}/${servers.length}</blockquote>`;

    // Kirim 1 pesan aja
    await ctx.replyWithHTML(finalReport, {
      reply_to_message_id: ctx.message.message_id
    });

  } catch (error) {
    console.error(error);
    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    ctx.reply('<blockquote>⚠️ Terjadi kesalahan saat memproses /listadmin.</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }
});
// ========== LISTSERV - LIST SERVER DI SEMUA PANEL ==========
bot.command('listsrv', async (ctx) => {
  const chatId = ctx.chat.id;
  const fromId = ctx.from.id.toString();

  // Cek harus di grup
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ ᴋʜᴜꜱᴜꜱ ɢʀᴜᴘ!');
  }

  const hasAccess = 
    fromId === vsett.adminId;

  if (!hasAccess) {
    return ctx.reply('❌ ᴋʜᴜsᴜs ᴏᴡɴᴇʀ', {
      ...Markup.inlineKeyboard([
        Markup.button.url('OWNER', 'https://t.me/akuzyura')
      ])
    });
  }

  // Baca semua server dari file
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply('<blockquote>❌ Belum ada server terdaftar!</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  const loadingMsg = await ctx.reply('⏳ <b>Mengambil daftar server dari semua panel...</b>', { parse_mode: 'HTML' });

  try {
    let allServers = [];
    let serverResults = [];
    let totalServers = 0;

    // Loop setiap server yang terdaftar
    for (const srv of servers) {
      try {
        // Cek koneksi ke server
        const testConn = await fetch(`${srv.domain}/api/application/servers?page=1`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srv.plta}`
          },
          timeout: 5000
        });

        if (!testConn.ok) {
          serverResults.push(`❌ ${srv.name || srv.domain} - Gagal konek`);
          continue;
        }

        let page = 1;
        let totalPages = 1;
        let serversInThisPanel = [];

        // Ambil semua server dari panel ini
        do {
          let f = await fetch(`${srv.domain}/api/application/servers?page=${page}`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${srv.plta}`,
            },
          });

          let res = await f.json();
          let panelServers = res.data;
          totalPages = res.meta.pagination.total_pages;

          for (let server of panelServers) {
            let s = server.attributes;
            
            // Ambil status server
            let status = "unknown";
            try {
              let f3 = await fetch(
                `${srv.domain}/api/client/servers/${s.uuid.split("-")[0]}/resources`,
                {
                  method: "GET",
                  headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${srv.pltc}`,
                  },
                  timeout: 3000
                }
              );

              let data = await f3.json();
              status = data.attributes ? data.attributes.current_state : s.status;
            } catch (err) {
              console.log(`Gagal ambil status server ${s.id} di ${srv.domain}`);
            }

            serversInThisPanel.push({
              id: s.id,
              name: s.name,
              status: status,
              serverName: srv.name || srv.domain,
              uuid: s.uuid
            });
          }

          page++;
        } while (page <= totalPages);

        allServers = [...allServers, ...serversInThisPanel];
        totalServers += serversInThisPanel.length;
        serverResults.push(`✅ ${srv.name || srv.domain} - ${serversInThisPanel.length} server`);

      } catch (error) {
        console.error(`Error di server ${srv.domain}:`, error.message);
        serverResults.push(`❌ ${srv.name || srv.domain} - Error: ${error.message}`);
      }
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    if (allServers.length === 0) {
      return ctx.reply('<blockquote>📋 Tidak ada server ditemukan.</blockquote>', { 
        parse_mode: 'HTML' 
      });
    }

    // Buat 1 PESAN GABUNGAN
    let finalReport = `<blockquote><b>📋 DAFTAR SERVER (${totalServers})</b>\n\n`;
    
    // Ringkasan per server
    finalReport += `<b>📊 RINGKASAN PER PANEL:</b>\n`;
    serverResults.forEach(result => {
      finalReport += `${result}\n`;
    });
    
    finalReport += `\n<b>📈 DETAIL SERVER (max 20):</b>\n`;

    // Tampilkan max 20 server
    const maxDisplay = Math.min(20, allServers.length);
    for (let i = 0; i < maxDisplay; i++) {
      const s = allServers[i];
      finalReport += `━━━━━━━━━━━━━━━━━━\n`;
      finalReport += `<b>${i + 1}. ${s.name}</b> (${s.serverName})\n`;
      finalReport += `🆔 ID: <code>${s.id}</code>\n`;
      
      // Status dengan emoji
      let statusEmoji = s.status === 'running' ? '✅' : 
                        s.status === 'offline' ? '❌' : '⏳';
      finalReport += `📊 Status: ${statusEmoji} ${s.status}\n`;
    }

    if (allServers.length > 20) {
      finalReport += `━━━━━━━━━━━━━━━━━━\n`;
      finalReport += `...dan ${allServers.length - 20} server lainnya\n`;
    }

    finalReport += `━━━━━━━━━━━━━━━━━━\n`;
    finalReport += `<b>📊 TOTAL SERVER:</b> ${totalServers}</blockquote>`;

    // Handle limit karakter
    if (finalReport.length > 4096) {
      // Kirim ringkasan dulu
      let summaryReport = `<blockquote><b>📋 DAFTAR SERVER</b>\n\n`;
      summaryReport += `<b>📊 RINGKASAN PER PANEL:</b>\n`;
      serverResults.forEach(result => {
        summaryReport += `${result}\n`;
      });
      summaryReport += `\n<b>📊 TOTAL SERVER:</b> ${totalServers}</blockquote>`;
      
      await ctx.replyWithHTML(summaryReport, {
        reply_to_message_id: ctx.message.message_id
      });

      // Kirim detail per chunk
      let detailChunks = [];
      let currentChunk = `<blockquote><b>📋 DETAIL SERVER</b>\n\n`;

      for (let i = 0; i < allServers.length; i++) {
        const s = allServers[i];
        let statusEmoji = s.status === 'running' ? '✅' : 
                          s.status === 'offline' ? '❌' : '⏳';
        
        let serverText = `━━━━━━━━━━━━━━━━━━\n`;
        serverText += `<b>${i + 1}. ${s.name}</b> (${s.serverName})\n`;
        serverText += `🆔 ID: <code>${s.id}</code>\n`;
        serverText += `📊 Status: ${statusEmoji} ${s.status}\n`;

        if (currentChunk.length + serverText.length > 4000) {
          currentChunk += `</blockquote>`;
          detailChunks.push(currentChunk);
          currentChunk = `<blockquote>${serverText}`;
        } else {
          currentChunk += serverText;
        }
      }

      currentChunk += `</blockquote>`;
      detailChunks.push(currentChunk);

      for (const chunk of detailChunks) {
        await ctx.replyWithHTML(chunk);
      }

    } else {
      await ctx.replyWithHTML(finalReport, {
        reply_to_message_id: ctx.message.message_id
      });
    }

  } catch (error) {
    console.error(error);
    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    ctx.reply('<blockquote>⚠️ Terjadi kesalahan saat memproses /listsrv.</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }
});

// ========== DELSRV - HAPUS SERVER BY ID ==========
bot.command('delsrv', async (ctx) => {
  const chatId = ctx.chat.id;
  const fromId = ctx.from.id.toString();
  const srvId = ctx.message.text.split(' ')[1];

  // Cek harus di grup
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ ᴋʜᴜꜱᴜꜱ ɢʀᴜᴘ!');
  }


  const hasAccess = 
    fromId === vsett.adminId;

  if (!hasAccess) {
    return ctx.reply('❌ ᴋʜᴜsᴜs ᴏᴡɴᴇʀ', {
      ...Markup.inlineKeyboard([
        Markup.button.url('OWNER', 'https://t.me/akuzyura')
      ])
    });
  }

  if (!srvId) {
    return ctx.reply('<blockquote>❌ Masukkan ID server!\nContoh: /delsrv 123</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  // Baca semua server dari file
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply('<blockquote>❌ Belum ada server terdaftar!</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  const loadingMsg = await ctx.reply('⏳ <b>Mencari server dengan ID ${srvId}...</b>', { 
    parse_mode: 'HTML' 
  });

  try {
    let found = false;
    let deletedServer = null;
    let errorMessages = [];

    // Coba cari server di setiap panel
    for (const srv of servers) {
      try {
        // Cek koneksi ke server
        const testConn = await fetch(`${srv.domain}/api/application/servers/${srvId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srv.plta}`
          },
          timeout: 5000
        });

        if (!testConn.ok) continue;

        // Server ditemukan, hapus
        let del = await fetch(`${srv.domain}/api/application/servers/${srvId}`, {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${srv.plta}`,
          },
        });

        if (del.status === 204) {
          found = true;
          deletedServer = {
            id: srvId,
            serverName: srv.name || srv.domain
          };
          break;
        }
      } catch (error) {
        errorMessages.push(`${srv.name || srv.domain}: ${error.message}`);
      }
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    if (found && deletedServer) {
      ctx.replyWithHTML(`
<blockquote><b>✅ SERVER BERHASIL DIHAPUS</b>

🆔 <b>ID:</b> <code>${deletedServer.id}</code>
🌐 <b>Panel:</b> ${deletedServer.serverName}</blockquote>
      `, {
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      ctx.replyWithHTML(`
<blockquote><b>❌ SERVER TIDAK DITEMUKAN</b>

ID <code>${srvId}</code> tidak ditemukan di panel manapun.

📋 <b>Error detail:</b>
${errorMessages.slice(0, 3).join('\n')}</blockquote>
      `, {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.message_id
      });
    }

  } catch (error) {
    console.error(error);
    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    ctx.reply('<blockquote>⚠️ Terjadi kesalahan saat memproses /delsrv.</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }
});

// ========== LISTUSR - LIST USER DI SEMUA PANEL ==========
bot.command('listusr', async (ctx) => {
  const chatId = ctx.chat.id;
  const fromId = ctx.from.id.toString();

  // Cek harus di grup
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ ᴋʜᴜꜱᴜꜱ ɢʀᴜᴘ!');
  }
  const hasAccess = 
    fromId === vsett.adminId;

  if (!hasAccess) {
    return ctx.reply('❌ ᴋʜᴜsᴜs ᴏᴡɴᴇʀ', {
      ...Markup.inlineKeyboard([
        Markup.button.url('OWNER', 'https://t.me/akuzyura')
      ])
    });
  }

  // Baca semua server dari file
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply('<blockquote>❌ Belum ada server terdaftar!</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  const loadingMsg = await ctx.reply('⏳ <b>Mengambil daftar user dari semua panel...</b>', { parse_mode: 'HTML' });

  try {
    let allUsers = [];
    let serverResults = [];
    let totalUsers = 0;
    let onlineCount = 0;
    let offlineCount = 0;

    // Loop setiap server yang terdaftar
    for (const srv of servers) {
      try {
        // Cek koneksi ke server
        const testConn = await fetch(`${srv.domain}/api/application/users?page=1`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srv.plta}`
          },
          timeout: 5000
        });

        if (!testConn.ok) {
          serverResults.push(`❌ ${srv.name || srv.domain} - Gagal konek`);
          offlineCount++;
          continue;
        }

        let page = 1;
        let totalPages = 1;
        let usersInThisPanel = [];

        // Ambil semua user dari panel ini
        do {
          let f = await fetch(`${srv.domain}/api/application/users?page=${page}`, {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${srv.plta}`,
            },
          });

          let res = await f.json();
          let users = res.data;
          totalPages = res.meta.pagination.total_pages;

          for (let user of users) {
            let u = user.attributes;
            usersInThisPanel.push({
              id: u.id,
              username: u.username,
              email: u.email,
              first_name: u.first_name,
              last_name: u.last_name,
              serverName: srv.name || srv.domain,
              isAdmin: u.root_admin ? '✅' : '❌'
            });
          }

          page++;
        } while (page <= totalPages);

        allUsers = [...allUsers, ...usersInThisPanel];
        totalUsers += usersInThisPanel.length;
        serverResults.push(`✅ ${srv.name || srv.domain} - ${usersInThisPanel.length} user`);
        onlineCount++;

      } catch (error) {
        console.error(`Error di server ${srv.domain}:`, error.message);
        serverResults.push(`❌ ${srv.name || srv.domain} - Error: ${error.message}`);
        offlineCount++;
      }
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    if (allUsers.length === 0) {
      return ctx.reply('<blockquote>📋 Tidak ada user ditemukan.</blockquote>', { 
        parse_mode: 'HTML' 
      });
    }

    // Buat 1 PESAN GABUNGAN
    let finalReport = `<blockquote><b>📋 DAFTAR USER (${totalUsers})</b>\n\n`;
    
    // Ringkasan per server
    finalReport += `<b>📊 RINGKASAN PER PANEL:</b>\n`;
    serverResults.forEach(result => {
      finalReport += `${result}\n`;
    });
    
    finalReport += `\n<b>📊 PANEL:</b> ${servers.length} (✅ ${onlineCount} online | ❌ ${offlineCount} offline)`;
    finalReport += `\n<b>📈 TOTAL USER:</b> ${totalUsers}</blockquote>`;

    await ctx.replyWithHTML(finalReport, {
      reply_to_message_id: ctx.message.message_id
    });

  } catch (error) {
    console.error(error);
    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    ctx.reply('<blockquote>⚠️ Terjadi kesalahan saat memproses /listusr.</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }
});
// ========== DELUSR - HAPUS USER BY ID ==========
bot.command('delusr', async (ctx) => {
  const chatId = ctx.chat.id;
  const fromId = ctx.from.id.toString();
  const usrId = ctx.message.text.split(' ')[1];

  // Cek harus di grup
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ ᴋʜᴜꜱᴜꜱ ɢʀᴜᴘ!');
  }

  const hasAccess = 
    fromId === vsett.adminId;

  if (!hasAccess) {
    return ctx.reply('❌ ᴋʜᴜsᴜs ᴏᴡɴᴇʀ', {
      ...Markup.inlineKeyboard([
        Markup.button.url('OWNER', 'https://t.me/akuzyura')
      ])
    });
  }

  if (!usrId) {
    return ctx.reply('<blockquote>❌ Masukkan ID user!\nContoh: /delusr 123</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  // Baca semua server dari file
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply('<blockquote>❌ Belum ada server terdaftar!</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  const loadingMsg = await ctx.reply('⏳ <b>Mencari user dengan ID ${usrId}...</b>', { 
    parse_mode: 'HTML' 
  });

  try {
    let found = false;
    let deletedUser = null;
    let errorMessages = [];

    // Coba cari user di setiap panel
    for (const srv of servers) {
      try {
        // Cek koneksi ke server
        const testConn = await fetch(`${srv.domain}/api/application/users/${usrId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srv.plta}`
          },
          timeout: 5000
        });

        if (!testConn.ok) continue;

        // Cek apakah user adalah admin (root_admin)
        const userData = await testConn.json();
        if (userData.attributes && userData.attributes.root_admin) {
          errorMessages.push(`⛔ ${srv.name || srv.domain}: User adalah admin panel, tidak bisa dihapus`);
          continue;
        }

        // User ditemukan, hapus
        let del = await fetch(`${srv.domain}/api/application/users/${usrId}`, {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${srv.plta}`,
          },
        });

        if (del.status === 204) {
          found = true;
          deletedUser = {
            id: usrId,
            username: userData.attributes.username,
            serverName: srv.name || srv.domain
          };
          break;
        }
      } catch (error) {
        errorMessages.push(`${srv.name || srv.domain}: ${error.message}`);
      }
    }

    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id);

    if (found && deletedUser) {
      ctx.replyWithHTML(`
<blockquote><b>✅ USER BERHASIL DIHAPUS</b>

🆔 <b>ID:</b> <code>${deletedUser.id}</code>
👤 <b>Username:</b> ${deletedUser.username}
🌐 <b>Panel:</b> ${deletedUser.serverName}</blockquote>
      `, {
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      ctx.replyWithHTML(`
<blockquote><b>❌ USER TIDAK DITEMUKAN</b>

ID <code>${usrId}</code> tidak ditemukan di panel manapun.

📋 <b>Error detail:</b>
${errorMessages.slice(0, 3).join('\n')}</blockquote>
      `, {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.message_id
      });
    }

  } catch (error) {
    console.error(error);
    await ctx.telegram.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    ctx.reply('<blockquote>⚠️ Terjadi kesalahan saat memproses /delusr.</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }
});

// ========== CEKSERVER - CEK STATUS SEMUA SERVER (DOMAIN FULL SENSOR) ==========
// ========== CEKSERVER - CEK STATUS SEMUA SERVER (DENGAN LOADING STICKER) ==========
bot.command('cekserver', async (ctx) => {
  const chatId = ctx.chat.id;
  const fromId = ctx.from.id.toString();

  // Cek harus di grup
  if (ctx.chat.type === 'private') {
    return ctx.reply('❌ ᴋʜᴜꜱᴜꜱ ɢʀᴜᴘ!');
  }

  // ===== CEK AKSES MULTI-FILE =====
  const ownerUsers = JSON.parse(fs.readFileSync(ownerFile));
  const adminUsers = JSON.parse(fs.readFileSync(adminfile));
  const ceoUsers = JSON.parse(fs.readFileSync(ceoFile));
  const ressUsers = JSON.parse(fs.readFileSync(ressFile));

  const hasAccess = 
    ownerUsers.includes(String(fromId)) ||
    adminUsers.includes(String(fromId)) ||
    ceoUsers.includes(String(fromId)) ||
    ressUsers.includes(String(fromId)) ||
    fromId === vsett.adminId;

  if (!hasAccess) {
    return ctx.reply('❌ ᴋʜᴜsᴜs ᴏᴡɴᴇʀ & ʀᴇꜱᴇʟʟᴇʀ', {
      ...Markup.inlineKeyboard([
        Markup.button.url('ʟᴀᴘᴏʀᴀɴ', 'https://t.me/akuzyura')
      ])
    });
  }

  // Baca semua server dari file
  const servers = JSON.parse(fs.readFileSync(serversFile));
  
  if (servers.length === 0) {
    return ctx.reply('<blockquote>❌ Belum ada server terdaftar di servers.json!</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }

  // ===== LOADING DENGAN STICKER + TEKS =====
  const loaderStickerId = vsett.QRIS_STICKER_FILE_ID;

  let stickerMsg = null;
  let textMsg = null;
  const loaderStart = Date.now();

  try {
    // Kirim sticker loading kalo ada
    if (loaderStickerId) {
      stickerMsg = await ctx.replyWithSticker(loaderStickerId);
    }
    
    // Kirim teks loading
    textMsg = await ctx.reply('⏳ <b>Mengecek status semua server...</b>', { 
      parse_mode: 'HTML' 
    });
    
  } catch (err) {
    console.log('Gagal kirim loading:', err.message);
    // Fallback kalo gagal kirim sticker
    textMsg = await ctx.reply('⏳ <b>Mengecek status semua server...</b>', { 
      parse_mode: 'HTML' 
    }).catch(() => null);
  }

  try {
    let serverStatus = [];
    let onlineCount = 0;
    let offlineCount = 0;
    let errorCount = 0;

    // Loop setiap server yang terdaftar
    for (let i = 0; i < servers.length; i++) {
      const srv = servers[i];
      const serverNumber = i + 1;
      
      let status = {
        number: serverNumber,
        name: srv.name || 'Unnamed',
        domain: '***Sensored Domain***',
        id: srv.id,
        added_by: srv.added_by,
        added_at: srv.added_at,
        status: 'unknown',
        responseTime: null,
        serverCount: 0,
        userCount: 0,
        error: null
      };

      try {
        const startTime = Date.now();
        
        const testConn = await fetch(`${srv.domain}/api/application/servers?page=1`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${srv.plta}`
          },
          timeout: 10000
        });

        const responseTime = Date.now() - startTime;
        status.responseTime = responseTime;

        if (testConn.ok) {
          status.status = 'online';
          onlineCount++;
          
          const data = await testConn.json();
          
          if (data.meta && data.meta.pagination) {
            status.serverCount = data.meta.pagination.total || 0;
          }

          try {
            const userTest = await fetch(`${srv.domain}/api/application/users?page=1`, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${srv.plta}`
              },
              timeout: 5000
            });

            if (userTest.ok) {
              const userData = await userTest.json();
              if (userData.meta && userData.meta.pagination) {
                status.userCount = userData.meta.pagination.total || 0;
              }
            }
          } catch (userErr) {
            console.log(`Gagal ambil data user di ${srv.domain}:`, userErr.message);
          }

        } else {
          status.status = 'offline';
          status.error = `HTTP ${testConn.status}: ${testConn.statusText}`;
          offlineCount++;
        }

      } catch (error) {
        status.status = 'error';
        status.error = error.message;
        errorCount++;
        console.log(`Error cek server ${srv.domain}:`, error.message);
      }

      serverStatus.push(status);
    }

    // ===== HAPUS LOADING MESSAGES =====
    try {
      if (stickerMsg) {
        await ctx.telegram.deleteMessage(chatId, stickerMsg.message_id);
      }
      if (textMsg) {
        await ctx.telegram.deleteMessage(chatId, textMsg.message_id);
      }
    } catch (err) {
      console.log('Gagal hapus loading messages:', err.message);
    }

    // Buat laporan
    let report = `<blockquote><b>📊 STATUS SERVER</b>\n\n`;
    
    report += `<b>📈 RINGKASAN:</b>\n`;
    report += `• Total Server: ${servers.length}\n`;
    report += `• ✅ Online: ${onlineCount}\n`;
    report += `• ❌ Offline: ${offlineCount}\n`;
    report += `• ⚠️ Error: ${errorCount}\n\n`;

    report += `<b>📋 DETAIL PER SERVER:</b>\n`;
    report += `━━━━━━━━━━━━━━━━━━\n`;

    for (const srv of serverStatus) {
      let statusEmoji = '❓';
      if (srv.status === 'online') statusEmoji = '✅';
      else if (srv.status === 'offline') statusEmoji = '❌';
      else if (srv.status === 'error') statusEmoji = '⚠️';

      report += `${statusEmoji} <b>${srv.number}. ${srv.name}</b>\n`;
      report += `   🆔 ID: <code>${srv.id}</code>\n`;
      report += `   🌐 Domain: <code>${srv.domain}</code>\n`;

      if (srv.status === 'online') {
        report += `   ⏱️ Response: ${srv.responseTime}ms\n`;
        report += `   📊 Server: ${srv.serverCount}\n`;
        report += `   👥 User: ${srv.userCount}\n`;
      } else if (srv.status === 'offline') {
        report += `   ❌ Status: Offline\n`;
        if (srv.error) report += `   📝 Error: ${srv.error}\n`;
      } else if (srv.status === 'error') {
        report += `   ⚠️ Error: ${srv.error}\n`;
      }

      report += `   👤 Added by: ${srv.added_by}\n`;
      report += `   📅 Added: ${new Date(srv.added_at).toLocaleString()}\n`;
      report += `━━━━━━━━━━━━━━━━━━\n`;
    }

    report += `</blockquote>`;

    // Hitung waktu proses
    const processTime = ((Date.now() - loaderStart) / 1000).toFixed(2);
    report = report.replace('</blockquote>', `\n⏱️ Waktu proses: ${processTime} detik</blockquote>`);

    // Handle limit karakter
    if (report.length > 4096) {
      let summaryReport = `<blockquote><b>📊 STATUS SERVER</b>\n\n`;
      summaryReport += `<b>📈 RINGKASAN:</b>\n`;
      summaryReport += `• Total Server: ${servers.length}\n`;
      summaryReport += `• ✅ Online: ${onlineCount}\n`;
      summaryReport += `• ❌ Offline: ${offlineCount}\n`;
      summaryReport += `• ⚠️ Error: ${errorCount}\n`;
      summaryReport += `⏱️ Waktu proses: ${processTime} detik</blockquote>`;
      
      await ctx.replyWithHTML(summaryReport, {
        reply_to_message_id: ctx.message.message_id
      });

      let detailChunks = [];
      let currentChunk = `<blockquote><b>📋 DETAIL PER SERVER</b>\n\n`;

      for (const srv of serverStatus) {
        let statusEmoji = '❓';
        if (srv.status === 'online') statusEmoji = '✅';
        else if (srv.status === 'offline') statusEmoji = '❌';
        else if (srv.status === 'error') statusEmoji = '⚠️';

        let srvText = `${statusEmoji} <b>${srv.number}. ${srv.name}</b>\n`;
        srvText += `   🆔 ID: <code>${srv.id}</code>\n`;
        srvText += `   🌐 Domain: <code>${srv.domain}</code>\n`;

        if (srv.status === 'online') {
          srvText += `   ⏱️ Response: ${srv.responseTime}ms\n`;
          srvText += `   📊 Server: ${srv.serverCount}\n`;
          srvText += `   👥 User: ${srv.userCount}\n`;
        } else if (srv.status === 'offline') {
          srvText += `   ❌ Status: Offline\n`;
          if (srv.error) srvText += `   📝 Error: ${srv.error}\n`;
        } else if (srv.status === 'error') {
          srvText += `   ⚠️ Error: ${srv.error}\n`;
        }

        srvText += `   👤 Added by: ${srv.added_by}\n`;
        srvText += `   📅 Added: ${new Date(srv.added_at).toLocaleString()}\n`;
        srvText += `━━━━━━━━━━━━━━━━━━\n`;

        if (currentChunk.length + srvText.length > 4000) {
          currentChunk += `</blockquote>`;
          detailChunks.push(currentChunk);
          currentChunk = `<blockquote>${srvText}`;
        } else {
          currentChunk += srvText;
        }
      }

      currentChunk += `</blockquote>`;
      detailChunks.push(currentChunk);

      for (const chunk of detailChunks) {
        await ctx.replyWithHTML(chunk);
      }

    } else {
      await ctx.replyWithHTML(report, {
        reply_to_message_id: ctx.message.message_id
      });
    }

  } catch (error) {
    console.error('Error di /cekserver:', error);
    
    // Hapus loading messages kalo error
    try {
      if (stickerMsg) {
        await ctx.telegram.deleteMessage(chatId, stickerMsg.message_id);
      }
      if (textMsg) {
        await ctx.telegram.deleteMessage(chatId, textMsg.message_id);
      }
    } catch {}
    
    ctx.reply('<blockquote>⚠️ Terjadi kesalahan saat memproses /cekserver.</blockquote>', { 
      parse_mode: 'HTML' 
    });
  }
});

setTimeout(() => {
  updateCommandStats();
}, 1000);
// ========== AUTO RESTART DENGAN WAKTU WIB ==========
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m'
};
function clearConsole() {
  console.clear();
  // Alternatif kalo console.clear() gak work
  // process.stdout.write('\x1Bc');
}
// Fungsi untuk mendapatkan waktu WIB
function getWIBTime() {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function log(status, message) {
  const time = getWIBTime();
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    restart: '🔄'
  };
  
  console.log(`${colors.cyan}[${time} WIB]${colors.reset} ${icons[status] || '•'} ${message}`);
}

function startBot() {
clearConsole();
  bot.launch().then(() => {
    log('success', `${colors.green}Bot Aktif!${colors.reset}`);
    console.log(colors.green + '[Zyura:] Bot Dah Aktif Bro sung gaasss' + colors.reset);
  }).catch((err) => {
    log('error', `${colors.red}Error: ${err.message}${colors.reset}`);
    log('warning', `${colors.yellow}Restart dalam 3 detik...${colors.reset}`);
    
    setTimeout(() => {
      log('restart', `${colors.cyan}Mencoba restart...${colors.reset}`);
      startBot();
    }, 3000);
  });
}

// Graceful shutdown
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.once(signal, () => {
    log('warning', `${colors.magenta}Dimatikan via ${signal}${colors.reset}`);
    bot.stop(signal);
    process.exit(0);
  });
});

// Auto restart on crash
process.on('uncaughtException', (err) => {
  log('error', `${colors.red}CRASH! ${err.message}${colors.reset}`);
  bot.stop('crash').then(() => {
    log('restart', `${colors.cyan}Restart dalam 3 detik...${colors.reset}`);
    setTimeout(startBot, 3000);
  });
});

process.on('unhandledRejection', (reason) => {
  log('error', `${colors.red}Unhandled Rejection: ${reason}${colors.reset}`);
});

log('info', `${colors.blue}Bot dimulai...${colors.reset}`);
startBot();