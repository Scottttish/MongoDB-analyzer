import React, { useState, useCallback } from 'react';
import './index.css';
import { 
  Database, RefreshCw, Zap, Activity, Clock, 
  HardDrive, Layout, Settings
} from 'lucide-react';
import { format } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, 
  ResponsiveContainer
} from 'recharts';

const OP_COLORS = {
  READ: '#10b981',
  CREATE: '#3b82f6',
  UPDATE: '#f59e0b',
  DELETE: '#ef4444'
};

const OP_ICONS = {
  READ: <span>👁️</span>,
  CREATE: <span>✨</span>,
  UPDATE: <span>🔄</span>,
  DELETE: <span>🗑️</span>
};

function App() {
  const [dbUri, setDbUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUpdated, setShowUpdated] = useState(false);
  const [storageView, setStorageView] = useState('collections'); // 'collections' | 'indexes'
  
  const [stats, setStats] = useState({
    collections: [],
    indexes: [],
    logs: [],
    colStats: {},
    loadData: [],
    crud: { READ: 0, UPDATE: 0, CREATE: 0, DELETE: 0 }
  });

  const fetchData = useCallback(async () => {
    if (!dbUri) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/activity?uri=${encodeURIComponent(dbUri)}`);
      const data = await res.json();
      
      const statsRes = await fetch(`/api/stats?uri=${encodeURIComponent(dbUri)}`);
      const statsData = await statsRes.json();

      const idxRes = await fetch(`/api/indexes?uri=${encodeURIComponent(dbUri)}`);
      const idxData = await idxRes.json();

      if (data.success) {
        setStats({
          logs: data.logs,
          colStats: data.colStats,
          loadData: data.loadData,
          collections: statsData.collections || [],
          indexes: idxData.indexes || [],
          crud: data.logs.reduce((acc, log) => {
            acc[log.op] = (acc[log.op] || 0) + 1;
            return acc;
          }, { READ: 0, UPDATE: 0, CREATE: 0, DELETE: 0 })
        });
        
        setShowUpdated(true);
        setTimeout(() => setShowUpdated(false), 3000);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [dbUri]);

  const handleConnect = () => {
    fetchData();
  };

  const totalOps = Object.values(stats.crud).reduce((a, b) => a + b, 0) || 1;
  const storageItems = storageView === 'collections' ? stats.collections : stats.indexes;
  const totalStorageSize = storageItems.reduce((acc, item) => acc + item.size, 0) || 1;

  // Custom Segmented Progress Bar Component
  const SegmentedProgress = ({ items }) => {
    return (
      <div className="segmented-widget">
        <div className="segmented-bar">
          {items.map((item, i) => {
            const pct = (item.size / totalStorageSize) * 100;
            const color = `hsl(${190 + (i * 25)}, 70%, 50%)`;
            return (
              <div 
                key={i} 
                className="bar-segment" 
                style={{ width: `${pct}%`, background: color }}
                title={`${item.name}: ${pct.toFixed(1)}%`}
              />
            );
          })}
        </div>
        <div className="legend-list">
          {items.map((item, i) => {
            const pct = (item.size / totalStorageSize) * 100;
            const color = `hsl(${190 + (i * 25)}, 70%, 50%)`;
            return (
              <div key={i} className="legend-item">
                <div className="legend-left">
                  <div className="dot" style={{ background: color }} />
                  <span>{item.name}</span>
                </div>
                <div className="legend-right">
                  <span className="legend-size">{(item.size / 1024 / 1024).toFixed(1)} MB</span>
                  <div className="pct-box" style={{ background: color + '20', color: color }}>
                    {Math.round(pct)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Prepare chart data: Group logs by time bucket (e.g., last 10 minutes)
  const chartData = stats.logs.reduce((acc, log) => {
    const time = format(new Date(log.ts), 'HH:mm');
    let bucket = acc.find(b => b.time === time);
    if (!bucket) {
      bucket = { time, READ: 0, CREATE: 0, UPDATE: 0, DELETE: 0 };
      acc.push(bucket);
    }
    bucket[log.op] = (bucket[log.op] || 0) + log.millis;
    return acc;
  }, []).slice(-10);

  return (
    <div className="dashboard">
      <header className="header-config">
        <div className="config-input-group">
          <Database size={14} color="#24a1de" />
          <input 
            type="text" 
            className="config-input" 
            placeholder="MONGO_URI"
            value={dbUri}
            onChange={(e) => setDbUri(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleConnect} disabled={loading}>
            {loading ? <RefreshCw className="animate-spin" size={14} /> : 'Обновить данные'}
          </button>
        </div>
        <div className="header-actions">
          <div className={`last-updated ${showUpdated ? 'visible' : ''}`}>
            Последнее обновление сейчас
          </div>
          <button className="btn btn-secondary btn-icon"><Layout size={14} /></button>
          <button className="btn btn-secondary btn-icon"><Settings size={14} /></button>
        </div>
      </header>

      <main className="main-content">
        <div className="crud-grid">
          {Object.entries(stats.crud).map(([op, val]) => {
            const pct = Math.round((val / totalOps) * 100);
            return (
              <div key={op} className="panel crud-card">
                <div className="crud-header">
                  <span className="crud-label">{op}</span>
                  <div className="crud-icon">
                    {OP_ICONS[op]}
                  </div>
                </div>
                <div className="crud-value">{val}</div>
                <div className="crud-footer">
                  <span>+{Math.floor(val/4)} vs last week</span>
                  <div className="crud-pct-badge" style={{ background: OP_COLORS[op] + '20', color: OP_COLORS[op] }}>
                    {pct}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel" style={{ height: '340px' }}>
          <h3><Activity size={14} color="#24a1de" /> Нагрузка операций</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="time" stroke="#95a5a6" fontSize={11} />
                <YAxis stroke="#95a5a6" fontSize={11} />
                <RechartsTooltip 
                  cursor={{fill: 'rgba(0,0,0,0.02)'}}
                  contentStyle={{ background: '#fff', border: '1px solid #e6ebf0', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="READ" stackId="a" fill={OP_COLORS.READ} radius={[0, 0, 0, 0]} />
                <Bar dataKey="CREATE" stackId="a" fill={OP_COLORS.CREATE} radius={[0, 0, 0, 0]} />
                <Bar dataKey="UPDATE" stackId="a" fill={OP_COLORS.UPDATE} radius={[0, 0, 0, 0]} />
                <Bar dataKey="DELETE" stackId="a" fill={OP_COLORS.DELETE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel log-panel">
          <h3><Clock size={14} color="#24a1de" /> Журнал операций</h3>
          <div className="log-table-wrapper">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Время</th>
                  <th>Запрос</th>
                  <th>Длительность</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {stats.logs.map((log, i) => (
                  <tr key={i}>
                    <td>
                      <span className="badge-solid" style={{ background: OP_COLORS[log.op] }}>
                        {log.op}
                      </span>
                    </td>
                    <td className="time-cell">{format(new Date(log.ts), 'HH:mm:ss')}</td>
                    <td className="query-cell">
                      <div className="query-text">{JSON.stringify(log.command)}</div>
                    </td>
                    <td>
                      <span className={log.millis > 100 ? 'duration-high' : log.millis > 50 ? 'duration-mid' : ''}>
                        {(log.millis / 1000).toFixed(3)}s
                      </span>
                    </td>
                    <td>
                      <span className={`pct-box ${log.category === 'Нормальный' ? 'badge-normal' : log.category === 'Средний' ? 'badge-medium' : 'badge-critical'}`} style={{background: 'transparent', padding: 0}}>
                        {log.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <aside className="sidebar-right">
        <div className="panel storage-widget">
          <h3><HardDrive size={14} color="#24a1de" /> Использование хранилища</h3>
          <div className="storage-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
             <button className={`btn ${storageView === 'collections' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStorageView('collections')} style={{fontSize: '11px', padding: '4px 10px'}}>Коллекции</button>
             <button className={`btn ${storageView === 'indexes' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStorageView('indexes')} style={{fontSize: '11px', padding: '4px 10px'}}>Индексы</button>
          </div>
          <div className="storage-content">
            <SegmentedProgress items={storageItems} />
          </div>
        </div>
      </aside>
    </div>
  );
}

export default App;
