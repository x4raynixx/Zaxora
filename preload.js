const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('zaxora', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (data) => ipcRenderer.invoke('set-settings', data),
  openLink: (link) => ipcRenderer.send('open-link', link),
  onServerRestarted: (callback) => ipcRenderer.on('server-restarted', callback),
  login: async (password) => {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    return await res.json()
  },
  scanInstances: () => ipcRenderer.invoke('scan-instances'),
  closeWindow: () => ipcRenderer.send('close-window'),
  changeLanguage: (lang) => ipcRenderer.invoke('change-language', lang),
  getCurrentLanguage: () => ipcRenderer.invoke('get-current-language')
})