import { Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Dashboard } from './pages/Dashboard'
import { ObjectDetail } from './pages/ObjectDetail'
import { ContractList } from './pages/ContractList'
import { ContractDetail } from './pages/ContractDetail'
import { CoverageMap } from './pages/CoverageMap'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/objects/:name" element={<ObjectDetail />} />
          <Route path="/contracts" element={<ContractList />} />
          <Route path="/contracts/:product" element={<ContractDetail />} />
          <Route path="/coverage" element={<CoverageMap />} />
        </Routes>
      </main>
    </div>
  )
}
