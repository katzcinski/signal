import { Link, useLocation } from 'react-router-dom'
import { t } from '../i18n/de'

const links = [
  { to: '/', label: t.dashboard },
  { to: '/contracts', label: t.contracts },
  { to: '/coverage', label: t.coverage },
]

export function Nav() {
  const { pathname } = useLocation()
  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
      <span className="text-blue-400 font-semibold text-lg mr-4">DQ Cockpit</span>
      {links.map(l => (
        <Link
          key={l.to}
          to={l.to}
          className={`text-sm transition-colors ${
            pathname === l.to || (l.to !== '/' && pathname.startsWith(l.to))
              ? 'text-white font-medium'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
