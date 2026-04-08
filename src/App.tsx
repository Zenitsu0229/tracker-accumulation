import { useStore } from './store'
import Header from './components/Header'
import StatsBar from './components/StatsBar'
import OverviewTab from './components/tabs/OverviewTab'
import MonthlyTab from './components/tabs/MonthlyTab'
import RankingTab from './components/tabs/RankingTab'
import DetailTab from './components/tabs/DetailTab'

const TABS = [
  { id: 'overview', label: '損益推移' },
  { id: 'monthly', label: '月別・市場別' },
  { id: 'ranking', label: '銘柄ランキング' },
  { id: 'detail', label: '個別銘柄チャート' },
]

function EmptyState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 20px', color: 'var(--muted)' }}>
      <div style={{ fontSize: '3rem', marginBottom: 16 }}>📊</div>
      <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>CSVファイルを読み込んでください</p>
      <p style={{ fontSize: '0.85rem' }}>ヘッダーの「CSVを読み込む」から証券会社の取引履歴CSVを選択してください</p>
    </div>
  )
}

export default function App() {
  const hasData = useStore((s) => s.filteredTrades.length > 0)
  const activeTab = useStore((s) => s.activeTab)
  const setActiveTab = useStore((s) => s.setActiveTab)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header />

      {!hasData ? (
        <EmptyState />
      ) : (
        <>
          <StatsBar />

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  position: 'relative',
                  padding: '10px 20px',
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--muted)',
                  cursor: 'pointer',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  transition: 'color 0.15s',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '20px 24px' }}>
            {activeTab === 'overview' && <OverviewTab />}
            {activeTab === 'monthly' && <MonthlyTab />}
            {activeTab === 'ranking' && <RankingTab />}
            {activeTab === 'detail' && <DetailTab />}
          </div>
        </>
      )}
    </div>
  )
}
