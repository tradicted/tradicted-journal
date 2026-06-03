import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Journal'
import NewTrade from './pages/NewTrade'
import Settings from './pages/Settings'
import TradingPlan from './pages/TradingPlan'
import { PortfolioProvider } from './context/PortfolioContext'

export default function App() {
  return (
    <PortfolioProvider>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="trades" element={<Trades />} />
            <Route path="new-trade" element={<NewTrade />} />
            <Route path="plan" element={<TradingPlan />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </PortfolioProvider>
  )
}
