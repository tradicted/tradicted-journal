import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  trades: {
    create: (trade: unknown) => ipcRenderer.invoke('trades:create', trade),
    update: (id: number, data: unknown) => ipcRenderer.invoke('trades:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('trades:delete', id),
    getAll: (portfolioId?: string) => ipcRenderer.invoke('trades:getAll', portfolioId),
    getById: (id: number) => ipcRenderer.invoke('trades:getById', id),
    getByDateRange: (start: string, end: string) => ipcRenderer.invoke('trades:getByDateRange', start, end)
  },
  journal: {
    create: (entry: unknown) => ipcRenderer.invoke('journal:create', entry),
    getAll: () => ipcRenderer.invoke('journal:getAll')
  },
  analytics: {
    getSummary: (portfolioId?: string) => ipcRenderer.invoke('analytics:getSummary', portfolioId)
  },
  data: {
    exportCSV: () => ipcRenderer.invoke('data:exportCSV'),
    exportJSON: () => ipcRenderer.invoke('data:exportJSON'),
    importCSV: (importSettings?: boolean) =>
      ipcRenderer.invoke('data:importCSV', importSettings)
  },
  portfolios: {
    getAll: () => ipcRenderer.invoke('portfolios:getAll'),
    add: (id: string, name: string) => ipcRenderer.invoke('portfolios:add', id, name),
    rename: (id: string, name: string) => ipcRenderer.invoke('portfolios:rename', id, name),
    delete: (id: string) => ipcRenderer.invoke('portfolios:delete', id)
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
