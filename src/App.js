import React, { useState, useCallback } from 'react';
import './index.css';
import { 
  Database, RefreshCw, Activity, Clock, 
  HardDrive
} from 'lucide-react';
import { format } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, 
  ResponsiveContainer
} from 'recharts';

const OP_COLORS = {
  READ: '#24a1de',
  CREATE: '#10b981',
  UPDATE: '#f59e0b',
  DELETE: '#ef4444'
};

function App() {
  const [dbUri, setDbUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [storageView, setStorageView] = useState('collections');
  
  const [stats, setStats] = useState({
    collections: [],
    indexes: [],
    logs: [],
    colStats: {},
    loadData: [],
    crud: { READ: 0, UPDATE: 0, CREATE: 0, DELETE: 0 }
  });
  
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!dbUri) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/activity?uri=${encodeURIComponent(dbUri.trim())}`);
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Ошибка подключения');
      }
      
      const statsRes = await fetch(`/api/stats?uri=${encodeURIComponent(dbUri.trim())}`);
      const statsData = await statsRes.json();

      const idxRes = await fetch(`/api/indexes?uri=${encodeURIComponent(dbUri.trim())}`);
      const idxData = await idxRes.json();

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
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [dbUri]);

  const handleConnect = () => {
    fetchData();
  };

  const totalOps = Object.values(stats.crud).reduce((a, b) => a + b, 0) || 1;
  const storageItems = storageView === 'collections' ? stats.collections : stats.indexes;
  const totalStorageSize = storageItems.reduce((acc, item) => acc + item.size, 0) || 1;

  const SegmentedProgress = ({ items }) => {
    return (
      <div className="storage-widget-container">
        <div className="segmented-bar">
          {items.map((item, i) => {
            const pct = (item.size / totalStorageSize) * 100;
            const color = `hsl(${210 + (i * 40)}, 70%, 50%)`;
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
            const color = `hsl(${210 + (i * 40)}, 70%, 50%)`;
            return (
              <div key={i} className="legend-item">
                <div className="legend-left">
                  <div className="dot" style={{ background: color }} />
                  <span className="item-name">{item.name}</span>
                </div>
                <div className="legend-right">
                  <span className="legend-size">{(item.size / 1024).toFixed(0)} KB</span>
                  <div className="pct-box" style={{ background: color + '15', color: color }}>
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

  const chartData = stats.logs.reduce((acc, log) => {
    const time = format(new Date(log.ts), 'HH:mm');
    let bucket = acc.find(b => b.time === time);
    if (!bucket) {
      bucket = { time, READ: 0, CREATE: 0, UPDATE: 0, DELETE: 0 };
      acc.push(bucket);
    }
    bucket[log.op] = (bucket[log.op] || 0) + log.millis;
    return acc;
  }, []).slice(-15);

  return (
    <div className="dashboard">
      <header className="header-config">
        <div className="config-input-group">
          <Database size={16} color="#24a1de" />
          <input 
            type="text" 
            className="config-input" 
            placeholder="Вставьте URL базы данных"
            value={dbUri}
            onChange={(e) => setDbUri(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleConnect} disabled={loading}>
            {loading ? <RefreshCw className="animate-spin" size={14} /> : 'Соединить'}
          </button>
        </div>
      </header>

      {error && (
        <div className="panel" style={{ borderColor: 'var(--error)', background: '#fffafa' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--error)' }}>
             <span>❌</span>
             <div>
               <strong>Ошибка:</strong> {error}
             </div>
           </div>
        </div>
      )}

      <main className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div className="crud-grid">
          {['READ', 'CREATE', 'UPDATE', 'DELETE'].map((op) => {
            const val = stats.crud[op] || 0;
            const pct = Math.round((val / totalOps) * 100);
            return (
              <div key={op} className="panel crud-card">
                <div className="crud-header">
                  <span className="crud-label">{op}</span>
                  <div className="crud-pct-badge" style={{ background: OP_COLORS[op] + '15', color: OP_COLORS[op] }}>
                    {pct}%
                  </div>
                </div>
                <div className="crud-value-row">
                  <div className="crud-icon-box" style={{ background: OP_COLORS[op] }} />
                  <div className="crud-value">{val}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="middle-row">
          <div className="panel" style={{ minHeight: '420px' }}>
            <h3><Activity size={16} color="#24a1de" /> Нагрузка операций</h3>
            <div className="chart-container" style={{ height: '320px', marginTop: '20px' }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <XAxis dataKey="time" stroke="#95a5a6" fontSize={11} axisLine={false} tickLine={false} />
                    <YAxis stroke="#95a5a6" fontSize={11} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      cursor={{fill: 'rgba(0,0,0,0.02)'}}
                      contentStyle={{ background: '#fff', border: '1px solid #e6ebf0', borderRadius: '12px', fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                    />
                    <Bar dataKey="READ" stackId="a" fill={OP_COLORS.READ} barSize={32} />
                    <Bar dataKey="CREATE" stackId="a" fill={OP_COLORS.CREATE} barSize={32} />
                    <Bar dataKey="UPDATE" stackId="a" fill={OP_COLORS.UPDATE} barSize={32} />
                    <Bar dataKey="DELETE" stackId="a" fill={OP_COLORS.DELETE} radius={[8, 8, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#95a5a6', flexDirection: 'column', gap: '15px' }}>
                  <Activity size={40} opacity={0.2} />
                  <span>Ожидание данных о запросах...</span>
                </div>
              )}
            </div>
          </div>

          <div className="panel storage-widget">
            <h3><HardDrive size={16} color="#24a1de" /> Использование хранилища</h3>
            <div className="storage-tabs" style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
               <button className={`btn ${storageView === 'collections' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStorageView('collections')}>Коллекции</button>
               <button className={`btn ${storageView === 'indexes' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStorageView('indexes')}>Индексы</button>
            </div>
            <div className="storage-content">
              <SegmentedProgress items={storageItems} />
            </div>
          </div>
        </div>

        <div className="panel log-panel">
          <h3><Clock size={16} color="#24a1de" /> Журнал операций</h3>
          <div className="log-table-wrapper" style={{ marginTop: '16px' }}>
            <table className="log-table" style={{ width: '100%' }}>
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
                {stats.logs.length > 0 ? stats.logs.map((log, i) => (
                  <tr key={i}>
                    <td>
                      <span className="badge-solid" style={{ background: OP_COLORS[log.op] }}>
                        {log.op}
                      </span>
                    </td>
                    <td className="time-cell">{format(new Date(log.ts), 'HH:mm:ss')}</td>
                    <td className="query-cell">
                      <div className="query-text-full">{JSON.stringify(log.command)}</div>
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
                )) : (
                   <tr>
                     <td colSpan="5" style={{textAlign: 'center', padding: '60px', color: '#95a5a6'}}>
                        Логи появятся при активности в базе...
                     </td>
                   </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;


