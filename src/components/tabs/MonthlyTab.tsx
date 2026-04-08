import { useStore } from '../../store'
import { MonthlyBarChart, MarketPieChart, AccountBarChart } from '../charts/MonthlyChart'

function SqCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px' }}>
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

export default function MonthlyTab() {
  const trades = useStore((s) => s.filteredTrades)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SqCard title="月別損益">
        <MonthlyBarChart trades={trades} />
      </SqCard>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <SqCard title="市場別 取引量構成">
          <MarketPieChart trades={trades} />
        </SqCard>
        <SqCard title="口座区分別損益">
          <AccountBarChart trades={trades} />
        </SqCard>
      </div>
    </div>
  )
}
