import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { StatusGrid } from '../components/StatusGrid'
import { ObjectStatus } from '../api/client'

const mockObjects: ObjectStatus[] = [
  {
    object_name: 'Sales_Orders_View',
    overall_status: 'pass',
    compliance: 'compliant',
    total_checks: 5,
    passed_checks: 5,
    failed_checks: 0,
    warning_checks: 0,
    contract_version: '1.0.0',
  },
  {
    object_name: 'Customers_View',
    overall_status: 'skipped_stale',
    compliance: 'unknown',
    total_checks: 3,
    passed_checks: 0,
    failed_checks: 0,
    warning_checks: 0,
    contract_version: '',
  },
]

const wrap = (ui: React.ReactElement) =>
  render(<BrowserRouter>{ui}</BrowserRouter>)

describe('StatusGrid', () => {
  it('renders object names', () => {
    wrap(<StatusGrid objects={mockObjects} />)
    expect(screen.getByText('Sales_Orders_View')).toBeTruthy()
    expect(screen.getByText('Customers_View')).toBeTruthy()
  })

  it('skipped_stale is visually distinct from pass', () => {
    wrap(<StatusGrid objects={mockObjects} />)
    // Both badges should be present but with different text
    const passEl = screen.getByText('Bestanden')
    const staleEl = screen.getByText('Übersprungen (veraltet)')
    expect(passEl).toBeTruthy()
    expect(staleEl).toBeTruthy()
  })
})
