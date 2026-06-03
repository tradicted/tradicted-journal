import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Portfolio } from '../types'

interface PortfolioContextValue {
  portfolios: Portfolio[]
  activeId: string
  setActiveId: (id: string) => void
  refresh: () => Promise<void>
}

const PortfolioContext = createContext<PortfolioContextValue>({
  portfolios: [],
  activeId: 'default',
  setActiveId: () => {},
  refresh: async () => {}
})

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [activeId, setActiveId] = useState('default')

  const refresh = async () => {
    const all = await window.api.portfolios.getAll()
    setPortfolios(all)
  }

  useEffect(() => { refresh() }, [])

  return (
    <PortfolioContext.Provider value={{ portfolios, activeId, setActiveId, refresh }}>
      {children}
    </PortfolioContext.Provider>
  )
}

export function usePortfolio() {
  return useContext(PortfolioContext)
}
