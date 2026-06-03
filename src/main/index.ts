import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import fs from 'fs'
import icon from '../../resources/icon.png?asset'
import { getDb } from './db'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.tradicted.journal')
  }

  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const DEFAULT_SETUP_TAGS = JSON.stringify([
  { id: 'breakout', label: 'Breakout', color: '#22d3ee' },
  { id: 'reversal', label: 'Reversal', color: '#f97316' },
  { id: 'support-resistance', label: 'S / R', color: '#6366f1' },
  { id: 'gap', label: 'Gap', color: '#a78bfa' },
  { id: 'momentum', label: 'Momentum', color: '#10b981' },
  { id: 'vwap', label: 'VWAP', color: '#1e99dc' },
  { id: 'other', label: 'Other', color: '#64748b' },
])

const DEFAULT_PSYCH_TAGS = JSON.stringify([
  { id: 'disciplined', label: 'Disciplined', color: '#4ade80', negative: false },
  { id: 'rule-based', label: 'Rule-based', color: '#34d399', negative: false },
  { id: 'fomo', label: 'FOMO', color: '#f87171', negative: true },
  { id: 'revenge', label: 'Revenge', color: '#ef4444', negative: true },
  { id: 'hesitated', label: 'Hesitated', color: '#fbbf24', negative: true },
  { id: 'overconfident', label: 'Overconfident', color: '#fb923c', negative: true },
])

const DEFAULT_GRADES = JSON.stringify([
  { id: 'A', label: 'A', color: '#4ade80' },
  { id: 'B', label: 'B', color: '#fbbf24' },
  { id: 'C', label: 'C', color: '#f87171' },
])

function calcPnl(direction: string, entry: number, exit: number, size: number): number {
  return direction === 'long' ? (exit - entry) * size : (entry - exit) * size
}

function calcRMultiple(pnl: number, entry: number, stop: number | null, size: number): number | null {
  if (!stop || size <= 0) return null
  const riskPerUnit = Math.abs(entry - stop)
  if (riskPerUnit <= 0) return null
  return pnl / (riskPerUnit * size)
}

function registerIpcHandlers() {
  /* ── Trades ── */

  ipcMain.handle('trades:create', (_, trade) => {
    const db = getDb()
    let pnl = trade.pnl ?? null
    let r_multiple = trade.r_multiple ?? null

    if (trade.exit_price !== null && trade.exit_price !== undefined) {
      pnl = calcPnl(trade.direction, trade.entry_price, trade.exit_price, trade.position_size)
      r_multiple = calcRMultiple(pnl, trade.entry_price, trade.stop_loss, trade.position_size)
    }

    const trade_uid = trade.trade_uid ?? `${Date.now()}-${String(trade.symbol).toUpperCase().replace(/[^A-Z0-9]/g, '')}-${Math.random().toString(36).slice(2, 7)}`

    const stmt = db.prepare(`
      INSERT INTO trades (date, symbol, direction, entry_price, exit_price, stop_loss, take_profit, position_size, pnl, r_multiple, status, notes, tags, portfolio_id, setup_tag, psych_tag, grade, rules_followed, trade_uid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      trade.date,
      trade.symbol,
      trade.direction,
      trade.entry_price,
      trade.exit_price ?? null,
      trade.stop_loss ?? null,
      trade.take_profit ?? null,
      trade.position_size,
      pnl,
      r_multiple,
      trade.status ?? 'open',
      trade.notes ?? null,
      trade.tags ?? null,
      trade.portfolio_id ?? 'default',
      trade.setup_tag ?? null,
      trade.psych_tag ?? null,
      trade.grade ?? null,
      trade.rules_followed ?? null,
      trade_uid
    )
    return db.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('trades:update', (_, id, data) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as Record<string, unknown>
    if (!existing) return null

    const merged = { ...existing, ...data }
    let pnl = data.pnl !== undefined ? data.pnl : (existing.pnl ?? null)
    let r_multiple = data.r_multiple !== undefined ? data.r_multiple : (existing.r_multiple ?? null)

    if (data.exit_price !== undefined && data.exit_price !== null) {
      pnl = calcPnl(
        String(merged.direction),
        Number(merged.entry_price),
        Number(data.exit_price),
        Number(merged.position_size)
      )
      r_multiple = calcRMultiple(pnl, Number(merged.entry_price), merged.stop_loss as number | null, Number(merged.position_size))
    }

    db.prepare(`
      UPDATE trades SET
        date=?, symbol=?, direction=?, entry_price=?, exit_price=?, stop_loss=?, take_profit=?,
        position_size=?, pnl=?, r_multiple=?, status=?, notes=?, tags=?,
        setup_tag=?, psych_tag=?, grade=?, rules_followed=?, closed_at=?,
        updated_at=datetime('now')
      WHERE id=?
    `).run(
      merged.date, merged.symbol, merged.direction, merged.entry_price,
      data.exit_price !== undefined ? data.exit_price : existing.exit_price,
      merged.stop_loss, merged.take_profit, merged.position_size,
      pnl, r_multiple, merged.status, merged.notes, merged.tags,
      merged.setup_tag ?? null, merged.psych_tag ?? null, merged.grade ?? null, merged.rules_followed ?? null,
      data.closed_at !== undefined ? data.closed_at : (existing.closed_at ?? null),
      id
    )
    return db.prepare('SELECT * FROM trades WHERE id = ?').get(id)
  })

  ipcMain.handle('trades:delete', (_, id) => {
    const db = getDb()
    db.prepare('DELETE FROM trades WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('trades:getAll', (_, portfolioId?: string) => {
    const db = getDb()
    if (portfolioId) {
      return db.prepare('SELECT * FROM trades WHERE portfolio_id = ? ORDER BY date DESC, created_at DESC').all(portfolioId)
    }
    return db.prepare('SELECT * FROM trades ORDER BY date DESC, created_at DESC').all()
  })

  ipcMain.handle('trades:getById', (_, id) => {
    return getDb().prepare('SELECT * FROM trades WHERE id = ?').get(id)
  })

  ipcMain.handle('trades:getByDateRange', (_, start, end) => {
    return getDb().prepare('SELECT * FROM trades WHERE date BETWEEN ? AND ? ORDER BY date DESC').all(start, end)
  })

  /* ── Journal ── */

  ipcMain.handle('journal:create', (_, entry) => {
    const db = getDb()
    const existing = db.prepare('SELECT id FROM journal_entries WHERE date = ?').get(entry.date) as { id: number } | undefined
    if (existing) {
      db.prepare('UPDATE journal_entries SET content=?, mood=?, trade_id=? WHERE id=?').run(
        entry.content ?? null,
        entry.mood ?? null,
        entry.trade_id ?? null,
        existing.id
      )
      return db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(existing.id)
    }
    const result = db.prepare(`
      INSERT INTO journal_entries (date, content, mood, trade_id) VALUES (?, ?, ?, ?)
    `).run(entry.date, entry.content ?? null, entry.mood ?? null, entry.trade_id ?? null)
    return db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('journal:getAll', () => {
    return getDb().prepare('SELECT * FROM journal_entries ORDER BY date DESC').all()
  })

  /* ── Analytics ── */

  ipcMain.handle('analytics:getSummary', (_, portfolioId?: string) => {
    const db = getDb()
    const trades = (
      portfolioId
        ? db.prepare('SELECT * FROM trades WHERE portfolio_id = ? ORDER BY date ASC, created_at ASC').all(portfolioId)
        : db.prepare('SELECT * FROM trades ORDER BY date ASC, created_at ASC').all()
    ) as Array<Record<string, unknown>>

    const closed = trades.filter((t) => t.status === 'closed')
    const won = closed.filter((t) => (t.pnl as number) > 0)
    const lost = closed.filter((t) => (t.pnl as number) <= 0)

    const grossWins = won.reduce((s, t) => s + Math.max(0, (t.pnl as number) || 0), 0)
    const grossLosses = lost.reduce((s, t) => s + Math.abs(Math.min(0, (t.pnl as number) || 0)), 0)
    const totalPnl = grossWins - grossLosses

    const winRate = closed.length > 0 ? won.length / closed.length : null

    const closedWithR = closed.filter((t) => t.r_multiple !== null)
    const avgR = closedWithR.length > 0
      ? closedWithR.reduce((s, t) => s + (t.r_multiple as number), 0) / closedWithR.length
      : null

    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : null
    const avgWinDollar = won.length > 0 ? grossWins / won.length : null
    const avgLossDollar = lost.length > 0 ? grossLosses / lost.length : null
    const avgWin = avgWinDollar
    const avgLoss = avgLossDollar
    const expectancy =
      winRate !== null && avgWin !== null && avgLoss !== null
        ? winRate * avgWin - (1 - winRate) * avgLoss
        : null

    const wonWithR = won.filter((t) => t.r_multiple !== null)
    const lostWithR = lost.filter((t) => t.r_multiple !== null)
    const avgWinRR = wonWithR.length > 0 ? wonWithR.reduce((s, t) => s + (t.r_multiple as number), 0) / wonWithR.length : null
    const avgLossRR = lostWithR.length > 0 ? lostWithR.reduce((s, t) => s + (t.r_multiple as number), 0) / lostWithR.length : null

    const largestWin = won.length > 0 ? Math.max(...won.map((t) => (t.pnl as number) || 0)) : null
    const largestLoss = lost.length > 0 ? Math.min(...lost.map((t) => (t.pnl as number) || 0)) : null

    let maxDD = 0
    let runDD = 0
    for (const t of closed) {
      const p = (t.pnl as number) || 0
      if (p < 0) {
        runDD += Math.abs(p)
        if (runDD > maxDD) maxDD = runDD
      } else {
        runDD = 0
      }
    }

    let streakType: 'win' | 'loss' | null = null
    let streakCount = 0
    for (const t of [...closed].reverse()) {
      const isWin = ((t.pnl as number) || 0) > 0
      if (streakType === null) {
        streakType = isWin ? 'win' : 'loss'
        streakCount = 1
      } else if ((isWin && streakType === 'win') || (!isWin && streakType === 'loss')) {
        streakCount++
      } else break
    }

    let cumPnl = 0
    const equityCurve = closed.map((t, i) => {
      cumPnl += (t.pnl as number) || 0
      const raw = t.date as string
      const createdAt = (t.created_at as string) || ''
      const time = createdAt.length >= 16 ? createdAt.substring(11, 16) : ''
      return {
        index: i,
        date: raw.substring(0, 10).replace('T', '').substring(0, 10),
        time,
        pnl: parseFloat(cumPnl.toFixed(2))
      }
    })

    const monthMap: Record<string, number> = {}
    for (const t of closed) {
      const month = (t.date as string).substring(0, 7)
      monthMap[month] = (monthMap[month] || 0) + ((t.pnl as number) || 0)
    }
    const monthlyPnl = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, pnl]) => ({ month, pnl: parseFloat(pnl.toFixed(2)) }))

    return {
      totalTrades: trades.length,
      closedTrades: closed.length,
      openTrades: trades.filter((t) => t.status === 'open').length,
      wonCount: won.length,
      lostCount: lost.length,
      winRate,
      avgR,
      avgWinRR,
      avgLossRR,
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      profitFactor,
      expectancy,
      avgWinDollar,
      avgLossDollar,
      largestWin,
      largestLoss,
      maxDrawdown: parseFloat(maxDD.toFixed(2)),
      currentStreak: { type: streakType, count: streakCount },
      equityCurve,
      monthlyPnl
    }
  })

  /* ── Export / Import ── */

  ipcMain.handle('data:exportCSV', async () => {
    const db = getDb()
    const portfolios = db.prepare('SELECT * FROM portfolios ORDER BY sort_order ASC, created_at ASC').all() as Array<{ id: string; name: string }>

    const getS = (key: string) => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
      return row?.value ?? null
    }

    interface PlanOption { id: string; letter: string; name: string; text: string }
    interface PlanRule { id?: string; number: number; name: string; text: string; hasOptions: boolean; options: PlanOption[] }

    const csvEscape = (v: unknown): string => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }

    const buildPortfolioSection = (portfolioId: string, portfolioName: string): string => {
      const trades = db.prepare(
        'SELECT * FROM trades WHERE portfolio_id = ? ORDER BY date ASC'
      ).all(portfolioId) as Array<Record<string, unknown>>

      const setupTagsRaw = getS('setupTags') ?? DEFAULT_SETUP_TAGS
      const psychTagsRaw = getS('psychTags') ?? DEFAULT_PSYCH_TAGS
      const gradesRaw = getS('grades') ?? DEFAULT_GRADES
      const rulesRaw = getS(`trading_plan_${portfolioId}`)
      const rules: PlanRule[] = rulesRaw ? JSON.parse(rulesRaw) : []

      const ruleHeaders: string[] = []
      const ruleColToId: Record<string, string> = {}
      for (const r of rules) {
        if (r.hasOptions && r.options?.length) {
          for (const o of r.options) {
            const col = `Rule${r.number}${o.letter}`
            ruleHeaders.push(col)
            ruleColToId[col] = o.id
          }
        } else {
          const col = `Rule${r.number}`
          ruleHeaders.push(col)
          ruleColToId[col] = r.id ?? String(r.number)
        }
      }

      const tradeHeaders = [
        'TradeUID', 'Date', 'Ticker', 'Direction',
        'Entry', 'StopLoss', 'TakeProfit', 'ActualExit',
        'Shares', 'Status', 'SetupTag', 'PsychTag', 'Grade', 'Notes',
        ...ruleHeaders
      ]

      const rows = trades.map((t) => {
        const rulesFollowed: string[] = t.rules_followed ? JSON.parse(String(t.rules_followed)) : []
        const ruleCols = ruleHeaders.map((col) => rulesFollowed.includes(ruleColToId[col]) ? '1' : '0')
        return [
          csvEscape(t.trade_uid),
          csvEscape(t.date),
          csvEscape(t.symbol),
          csvEscape(t.direction),
          csvEscape(t.entry_price),
          csvEscape(t.stop_loss),
          csvEscape(t.take_profit),
          csvEscape(t.exit_price),
          csvEscape(t.position_size),
          csvEscape(t.status),
          csvEscape(t.setup_tag),
          csvEscape(t.psych_tag),
          csvEscape(t.grade),
          csvEscape(t.notes),
          ...ruleCols
        ].join(',')
      })

      return [
        `## PORTFOLIO,${portfolioId}`,
        `# portfolioName,${portfolioName}`,
        `# setupTags,${setupTagsRaw}`,
        `# psychTags,${psychTagsRaw}`,
        `# grades,${gradesRaw}`,
        `# rules,${rulesRaw ?? '[]'}`,
        '#',
        tradeHeaders.join(','),
        ...rows,
      ].join('\n')
    }

    const sections = portfolios.map((p) => buildPortfolioSection(p.id, p.name))
    const csv = ['# TRADICTED_CSV_V1', '', ...sections].join('\n')

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: 'tradicted-trades.csv',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })
    if (!filePath) return { success: false }
    fs.writeFileSync(filePath, csv, 'utf8')
    return { success: true, filePath }
  })

  ipcMain.handle('data:importCSV', async (_, importSettings: boolean = false) => {
    const { filePaths } = await dialog.showOpenDialog({
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile']
    })
    if (!filePaths || filePaths.length === 0) return { success: false, cancelled: true }

    const content = fs.readFileSync(filePaths[0], 'utf8')
    const lines = content.split('\n')

    const db = getDb()

    interface PlanOption { id: string; letter: string; name: string; text: string }
    interface PlanRule { id?: string; number: number; name: string; text: string; hasOptions: boolean; options: PlanOption[] }

    const parseCSVLine = (line: string): string[] => {
      const result: string[] = []
      let cur = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
          else if (ch === '"') { inQuotes = false }
          else cur += ch
        } else {
          if (ch === '"') { inQuotes = true }
          else if (ch === ',') { result.push(cur); cur = '' }
          else cur += ch
        }
      }
      result.push(cur)
      return result
    }

    // Split the file into per-portfolio sections by ## PORTFOLIO lines
    interface Section { portfolioId: string; lines: string[] }
    const sections: Section[] = []
    let currentSection: Section | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('## PORTFOLIO,')) {
        currentSection = { portfolioId: trimmed.slice('## PORTFOLIO,'.length).trim(), lines: [] }
        sections.push(currentSection)
      } else if (currentSection) {
        currentSection.lines.push(line)
      }
      // Lines before the first ## PORTFOLIO (file header like # TRADICTED_CSV_V1) are ignored
    }

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const section of sections) {
      const { portfolioId, lines: sLines } = section

      // Parse settings block
      const settingsFromFile: Record<string, string> = {}
      let dataStart = 0
      for (let i = 0; i < sLines.length; i++) {
        const trimmed = sLines[i].trim()
        if (trimmed.startsWith('#')) {
          if (trimmed === '#') { dataStart = i + 1; continue }
          const body = trimmed.slice(2).trim()
          const commaIdx = body.indexOf(',')
          if (commaIdx !== -1) {
            const k = body.slice(0, commaIdx).trim()
            const v = body.slice(commaIdx + 1).trim()
            settingsFromFile[k] = v
          }
          dataStart = i + 1
        } else {
          dataStart = i
          break
        }
      }

      // Ensure portfolio exists in DB (create it if not)
      const portfolioName = settingsFromFile['portfolioName'] ?? portfolioId
      const existingPortfolio = db.prepare('SELECT id FROM portfolios WHERE id = ?').get(portfolioId)
      if (!existingPortfolio) {
        const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM portfolios').get() as { m: number | null }).m ?? 0
        db.prepare('INSERT INTO portfolios (id, name, sort_order) VALUES (?, ?, ?)').run(portfolioId, portfolioName, maxOrder + 1)
      }

      // Optionally import settings
      if (importSettings) {
        for (const key of ['setupTags', 'psychTags', 'grades'] as const) {
          if (settingsFromFile[key]) {
            db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, settingsFromFile[key])
          }
        }
        if (settingsFromFile['rules']) {
          db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
            `trading_plan_${portfolioId}`, settingsFromFile['rules']
          )
        }
      }

      // Build rule col → id map from the file's rules
      const ruleColToId: Record<string, string> = {}
      try {
        const rulesStr = settingsFromFile['rules'] ??
          ((db.prepare('SELECT value FROM settings WHERE key = ?').get(`trading_plan_${portfolioId}`) as { value: string } | undefined)?.value)
        if (rulesStr) {
          const rules: PlanRule[] = JSON.parse(rulesStr)
          for (const r of rules) {
            if (r.hasOptions && r.options?.length) {
              for (const o of r.options) ruleColToId[`Rule${r.number}${o.letter}`] = o.id
            } else {
              ruleColToId[`Rule${r.number}`] = r.id ?? String(r.number)
            }
          }
        }
      } catch { /* no rules */ }

      // Parse header row
      const headerLine = sLines[dataStart]
      if (!headerLine) { errors.push(`Portfolio ${portfolioId}: no header row`); continue }
      const headers = parseCSVLine(headerLine)
      const colIdx = (name: string) => headers.indexOf(name)

      // Process trade rows
      for (let i = dataStart + 1; i < sLines.length; i++) {
        const line = sLines[i].trim()
        if (!line) continue
        const cells = parseCSVLine(line)
        const get = (name: string) => { const idx = colIdx(name); return idx !== -1 ? (cells[idx] ?? '') : '' }
        const getNum = (name: string): number | null => { const n = parseFloat(get(name)); return isNaN(n) ? null : n }

        const trade_uid = get('TradeUID')
        if (!trade_uid) { errors.push(`Portfolio ${portfolioId} row ${i}: missing TradeUID`); continue }

        const symbol = get('Ticker') || get('Symbol') || ''
        const direction = get('Direction') as 'long' | 'short'
        const entry_price = getNum('Entry')
        const stop_loss = getNum('StopLoss')
        const take_profit = getNum('TakeProfit')
        const exit_price = getNum('ActualExit')
        const position_size = getNum('Shares')
        const status = (get('Status') || 'open') as 'open' | 'closed' | 'cancelled'
        const setup_tag = get('SetupTag') || null
        const psych_tag = get('PsychTag') || null
        const grade = get('Grade') || null
        const notes = get('Notes') || null
        const date = get('Date').slice(0, 10)

        if (!symbol || !direction || entry_price === null || position_size === null) {
          errors.push(`Portfolio ${portfolioId} row ${i}: missing required fields`)
          continue
        }

        let pnl: number | null = null
        let r_multiple: number | null = null
        if (exit_price !== null) {
          pnl = calcPnl(direction, entry_price, exit_price, position_size)
          r_multiple = calcRMultiple(pnl, entry_price, stop_loss, position_size)
        }

        const rulesFollowed: string[] = []
        for (const [colName, ruleId] of Object.entries(ruleColToId)) {
          const idx = colIdx(colName)
          if (idx !== -1 && cells[idx] === '1') rulesFollowed.push(ruleId)
        }
        const rulesJson = rulesFollowed.length ? JSON.stringify(rulesFollowed) : null

        const existing = db.prepare('SELECT id FROM trades WHERE trade_uid = ?').get(trade_uid) as { id: number } | undefined

        try {
          if (existing) {
            db.prepare(`
              UPDATE trades SET
                date=?, symbol=?, direction=?, entry_price=?, exit_price=?, stop_loss=?, take_profit=?,
                position_size=?, pnl=?, r_multiple=?, status=?, notes=?, portfolio_id=?,
                setup_tag=?, psych_tag=?, grade=?, rules_followed=?, updated_at=datetime('now')
              WHERE trade_uid=?
            `).run(
              date, symbol, direction, entry_price, exit_price, stop_loss, take_profit,
              position_size, pnl, r_multiple, status, notes, portfolioId,
              setup_tag, psych_tag, grade, rulesJson, trade_uid
            )
            skipped++
          } else {
            db.prepare(`
              INSERT INTO trades (date, symbol, direction, entry_price, exit_price, stop_loss, take_profit,
                position_size, pnl, r_multiple, status, notes, portfolio_id, setup_tag, psych_tag, grade,
                rules_followed, trade_uid)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              date, symbol, direction, entry_price, exit_price, stop_loss, take_profit,
              position_size, pnl, r_multiple, status, notes, portfolioId,
              setup_tag, psych_tag, grade, rulesJson, trade_uid
            )
            imported++
          }
        } catch (err) {
          errors.push(`Portfolio ${portfolioId} row ${i}: ${(err as Error).message}`)
        }
      }
    }

    return { success: true, imported, skipped, errors }
  })

  ipcMain.handle('data:exportJSON', async () => {
    const db = getDb()
    const trades = db.prepare('SELECT * FROM trades ORDER BY date DESC').all()
    const entries = db.prepare('SELECT * FROM journal_entries ORDER BY date DESC').all()

    const { filePath } = await dialog.showSaveDialog({
      defaultPath: 'tradicted-journal.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })
    if (!filePath) return { success: false }
    fs.writeFileSync(filePath, JSON.stringify({ trades, journal_entries: entries }, null, 2), 'utf8')
    return { success: true, filePath }
  })

  /* ── Portfolios ── */

  ipcMain.handle('portfolios:getAll', () => {
    return getDb().prepare('SELECT * FROM portfolios ORDER BY sort_order ASC, created_at ASC').all()
  })

  ipcMain.handle('portfolios:add', (_, id, name) => {
    const db = getDb()
    const row = db.prepare('SELECT MAX(sort_order) as m FROM portfolios').get() as { m: number | null }
    db.prepare('INSERT INTO portfolios (id, name, sort_order) VALUES (?, ?, ?)').run(id, name, (row.m ?? 0) + 1)
    return db.prepare('SELECT * FROM portfolios WHERE id = ?').get(id)
  })

  ipcMain.handle('portfolios:rename', (_, id, name) => {
    getDb().prepare('UPDATE portfolios SET name = ? WHERE id = ?').run(name, id)
    return { success: true }
  })

  ipcMain.handle('portfolios:delete', (_, id) => {
    if (id === 'default') return { success: false, error: 'Cannot delete default portfolio' }
    const db = getDb()
    db.prepare('DELETE FROM trades WHERE portfolio_id = ?').run(id)
    db.prepare('DELETE FROM portfolios WHERE id = ?').run(id)
    return { success: true }
  })

  /* ── Settings ── */

  ipcMain.handle('settings:get', (_, key) => {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  })

  ipcMain.handle('settings:set', (_, key, value) => {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value))
    return { success: true }
  })
}
