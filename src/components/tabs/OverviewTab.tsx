import { useStore } from '../../store'
import CumulativeChart from '../charts/CumulativeChart'
import DailyChart from '../charts/DailyChart'

function SqCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px' }}>
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

export default function OverviewTab() {
  const trades = useStore((s) => s.filteredTrades)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SqCard title="累積損益推移 — ポイントにカーソルで取引開始日・終了日を表示">
        <CumulativeChart trades={trades} />
      </SqCard>
      <SqCard title="日別損益">
        <DailyChart trades={trades} />
      </SqCard>
    </div>
  )
}
