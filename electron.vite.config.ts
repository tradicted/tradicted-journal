import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Electron 39 ESM: 'electron' only has a default export; convert named imports to destructuring
function electronDefaultImportPlugin(): Plugin {
  return {
    name: 'electron-default-import',
    renderChunk(code: string) {
      const named = /^import\s*\{([^}]+)\}\s*from\s*["']electron["']/m
      const match = named.exec(code)
      if (!match) return null
      const imports = match[1]
      const replaced = code.replace(
        named,
        `import __electronDefault from "electron";\nconst {${imports}} = __electronDefault`
      )
      return { code: replaced, map: null }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [electronDefaultImportPlugin()]
  },
  preload: {
    plugins: [electronDefaultImportPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
