const { app, Tray, Menu, BrowserWindow, ipcMain, nativeImage, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')
const crypto = require('crypto')
const http = require('http')
const { exec } = require('child_process')

function updateServerFileIfDev() {

  const mainPath = __dirname;
  const sourceServerPath = path.join(mainPath, 'server.js');

  const userProfilePath = process.env.USERPROFILE || os.homedir();
  const targetServerPath = path.join(mainPath, 'resources', 'app.asar.unpacked', 'server.js');
  if (!fs.existsSync(sourceServerPath)) {
    console.error('[ERROR] source server.js not found.');
    return;
  }

  try {
    fs.copyFileSync(sourceServerPath, targetServerPath);
    console.log('[INFO] server.js successfully updated in app.asar.unpacked');
  } catch (err) {
    console.error('[ERROR] Failed to update server.js:', err);
  }
}
updateServerFileIfDev();

const APPDATA = process.env.APPDATA || path.join(os.homedir(), '.config')
const SETTINGS_PATH = path.join(APPDATA, 'Zaxora', 'settings.json')

function loadSettings() {
  const settingsPath = path.join(process.env.APPDATA || '.', 'Zaxora', 'settings.json')
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  } catch {}
}
let tray = null
let mainWindow = null
let serverProcess = null
let settingsPath
let token = crypto.randomBytes(32).toString('hex')

function launchServer(settings) {
  const serverPath = path.join(__dirname, 'server.js');
  const child = spawn('node', [serverPath], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

function startServer(forceRestart = false) {
  const settings = loadSettings();
  const port = settings.port;
  const checkUrl = `http://127.0.0.1:${port}/ping`;

  const req = http.get(checkUrl, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (data.trim().toLowerCase() === 'zaxora') {
        if (forceRestart) {
          console.log('[DEBUG] Wymuszono restart serwera');
          killProcessOnPort(port, () => {
            launchServer(settings);
          });
        } else {
          console.log(`[DEBUG] Serwer już działa na porcie ${port}`);
        }
      } else {
        launchServer(settings);
      }
    });
  });

  req.on('error', () => {
    launchServer(settings);
  });

  req.setTimeout(500, () => {
    req.destroy();
    killProcessOnPort(port, () => {
      launchServer(settings);
    });
  });
}

module.exports = {
  startServer,
  killProcessOnPort,
  launchServer
}

let settings = {
  port: 8888,
  theme: 'dark',
  publicAccess: true,
  password: 'admin',
  language: 'en',
  features: {
    streaming: true,
    shutdown: true,
    restart: true
  },
  languages: {
    pl: require('./languages/pl.json'),
    en: require('./languages/en.json')
  }
}

ipcMain.on('open-link', (event, link) => {
  shell.openExternal(link)
})

function getLocalIPs() {
  const interfaces = os.networkInterfaces()
  const ips = []
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.')
        for (let i = 1; i < 255; i++) {
          ips.push(`${parts[0]}.${parts[1]}.${parts[2]}.${i}`)
        }
      }
    }
  }
  return ips
}

ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.hide()
  }
})

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'images/zaxora.png')).resize({ width: 16, height: 16 })
  tray = new Tray(icon)

  const menu = Menu.buildFromTemplate([
    { label: 'Open Zaxora - Client', click: () => openWindow() },
    { label: 'Hide Zaxora - ', click: () => window.zaxora.closeWindow() },
    { type: 'separator' },
    { label: 'Restart Zaxora - Server', click: () => startServer(true) },
    { label: 'Start Zaxora - Server', click: () => startServer(true) },
    { label: 'Stop Zaxora - Server', click: () => app.quit() }
  ])

  tray.setToolTip('Zaxora - Remote Control')
  tray.setContextMenu(menu)
}

function showSplashAndMain() {
  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    icon: path.join(__dirname, 'images', 'zaxora.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  })
  splash.loadFile(path.join(__dirname, 'web', 'splash.html'))
  setTimeout(() => {
    splash.close()
    openWindow()
  }, 5000)
}

function openWindow() {
  if (mainWindow) {
    mainWindow.show()
    return
  }
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    frame: false,
    icon: path.join(__dirname, 'images', 'zaxora.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  })
  mainWindow.loadFile(path.join(__dirname, 'web', 'index.html'))
  mainWindow.on('close', e => {
    e.preventDefault()
    mainWindow.hide()
  })
}

function sendRestarted() {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('server-restarted')
  })
}


async function killProcessOnPort(port, callback) {
  const processes = await psList();
  for (const proc of processes) {
    if (proc.cmd.includes(`:${port}`)) {
      console.log(`Zabijam proces ${proc.pid} używający portu ${port}`);
      try {
        process.kill(proc.pid);
        if (callback) callback();
      } catch (err) {
        console.error(`Nie udało się zabić procesu ${proc.pid}:`, err);
      }
    }
  }
}

function launchServer(settings) {
  const date = new Date().toISOString().replace(/[:.]/g, '-')
  const userProfilePath = process.env.USERPROFILE || os.homedir();
  const serverPath = path.join(userProfilePath, 'AppData', 'Local', 'Programs', 'zaxora_win', 'resources', 'app.asar.unpacked', 'server.js');

  serverProcess = spawn('node', [serverPath, settings.password, settings.port, settings.token])

  serverProcess.stdout.on('data', data => {
    process.stdout.write(data)
  })

  serverProcess.stderr.on('data', data => {
    process.stderr.write(data)
  })

  serverProcess.on('exit', code => {
    console.log(`Server zakończył działanie z kodem ${code}`)
  })
}


ipcMain.handle('zaxora-scan', async () => {
  const ip = require('ip')
  const port = 8888
  const localBase = ip.address().split('.').slice(0, 3).join('.')
  const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))

  const promises = []
  for (let i = 1; i <= 254; i++) {
    const addr = `http://${localBase}.${i}:${port}`
    promises.push(fetch(`${addr}/ping`).then(res => res.ok ? addr : null).catch(() => null))
  }

  const results = await Promise.all(promises)
  return results.filter(r => r)
})


function getSingleLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`[DEBUG] Local IP found: ${iface.address}`)
        return iface.address
      }
    }
  }
  console.log('[DEBUG] No local IP found.')
  return null
}

function scanAllPortsOnLocalIP() {
  const ip = getSingleLocalIP()
  if (!ip) return Promise.resolve([])

  const found = []
  const maxPort = 65535
  const concurrency = 100
  let currentPort = 1
  let running = 0

  console.log(`[DEBUG] Starting full port scan on ${ip}`)

  return new Promise(resolve => {
    function next() {
      while (running < concurrency && currentPort <= maxPort) {
        const port = currentPort++
        running++
        console.log(`[DEBUG] Checking ${ip}:${port}`)

        const req = http.get({ host: ip, port, timeout: 300, path: '/ping' }, res => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            console.log(`[DEBUG] Response from ${ip}:${port} = ${data}`)
            if (data.trim().toLowerCase() === 'zaxora') {
              const address = `http://${ip}:${port}`
              if (!found.includes(address)) {
                found.push(address)
                console.log(`✅ Found Zaxora at ${address}`)
              }
            }
            running--
            if (currentPort > maxPort && running === 0) {
              console.log('[DEBUG] Scan complete.')
              resolve(found)
            } else {
              next()
            }
          })
        })

        req.on('error', err => {
          console.log(`❌ Error on ${ip}:${port} = ${err.message}`)
          running--
          if (currentPort > maxPort && running === 0) {
            console.log('[DEBUG] Scan complete with errors.')
            resolve(found)
          } else {
            next()
          }
        })

        req.on('timeout', () => {
          console.log(`⌛ Timeout on ${ip}:${port}`)
          req.destroy()
          running--
          if (currentPort > maxPort && running === 0) {
            console.log('[DEBUG] Scan complete after timeouts.')
            resolve(found)
          } else {
            next()
          }
        })
      }
    }

    next()
  })
}

ipcMain.handle('scan-instances', async () => {
  console.log('[DEBUG] ipcMain handle: scan-instances')
  const result = await scanAllPortsOnLocalIP()
  console.log('[DEBUG] Returning result:', result)
  return result
})

app.whenReady().then(() => {
  settingsPath = path.join(app.getPath('userData'), 'settings.json')
  loadSettings()
  startServer()
  createTray()
  showSplashAndMain()
})

ipcMain.handle('get-settings', () => settings)
ipcMain.handle('set-settings', (event, newSettings) => {
  Object.assign(settings, newSettings)
  saveSettings()
  startServer()
})

ipcMain.handle('restart-server', () => {
  startServer()
})