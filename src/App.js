import React, { useState, useCallback } from 'react';
import './index.css';
import { 
  Database, RefreshCw, Zap, Activity, Clock, 
  HardDrive, Layout, Settings
} from 'lucide-react';
import { format } from 'date-fns';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, 
  ResponsiveContainer, Cell
} from 'recharts';

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
    realLoad: 0,
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
          realLoad: data.realLoad,
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

  const storageItems = storageView === 'collections' ? stats.collections : stats.indexes;
  const maxVal = Math.max(...storageItems.map(i => i.size), 1);
  const avgLoad = stats.loadData.length > 0 
    ? Math.round(stats.loadData.reduce((a, b) => a + b.value, 0) / stats.loadData.length)
    : 0;

  return (
    <div className="dashboard">
      <header className="header-config">
        <div className="config-input-group">
          <Database size={16} color="#24a1de" />
          <input 
            type="text" 
            className="config-input" 
            placeholder="mongodb+srv://user:pass@cluster..."
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
          <button className="btn btn-secondary btn-icon" title="Layout"><Layout size={14} /></button>
          <button className="btn btn-secondary btn-icon" title="Settings"><Settings size={14} /></button>
        </div>
      </header>

      <main className="main-content">
        <div className="crud-grid">
          {Object.entries(stats.crud).map(([op, val]) => (
            <div key={op} className="panel crud-card">
              <div className="crud-label">{op}</div>
              <div className="crud-value">{val}</div>
            </div>
          ))}
        </div>

        <div className="panel" style={{ height: '340px' }}>
          <h3><Activity size={14} color="#24a1de" /> Нагрузка операций</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.logs.slice(0, 10).reverse()}>
                <XAxis dataKey="ts" tickFormatter={(t) => format(new Date(t), 'HH:mm')} stroke="#95a5a6" fontSize={11} />
                <YAxis stroke="#95a5a6" fontSize={11} />
                <RechartsTooltip 
                  contentStyle={{ background: '#fff', border: '1px solid #e6ebf0', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="millis" radius={[2, 2, 0, 0]} name="Задержка (ms)">
                  {stats.logs.slice(0, 10).reverse().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.op === 'READ' ? '#27ae60' : entry.op === 'UPDATE' ? '#f1c40f' : entry.op === 'CREATE' ? '#24a1de' : '#e74c3c'} />
                  ))}
                </Bar>
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
                  <th>Запрос</th>
                  <th>Длительность</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {stats.logs.map((log, i) => (
                  <tr key={i}>
                    <td><span className={`badge badge-${log.op?.toLowerCase() || 'read'}`}>{log.op}</span></td>
                    <td className="query-cell">
                      <div className="query-text">{JSON.stringify(log.command)}</div>
                    </td>
                    <td>
                      <span className={log.millis > 100 ? 'duration-high' : log.millis > 50 ? 'duration-mid' : ''}>
                        {(log.millis / 1000).toFixed(3)}s
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${log.category === 'Нормальный' ? 'normal' : log.category === 'Средний' ? 'medium' : 'critical'}`}>
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
          <div className="storage-content">
            {storageItems.map((item, i) => (
              <div key={i} className="storage-item">
                <div className="storage-info">
                  <span>{item.name}</span>
                  <span className="text-muted">{(item.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
                <div className="storage-bar-bg">
                  <div 
                    className="storage-bar-fill" 
                    style={{ width: `${(item.size / maxVal) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          <div className="storage-buttons">
            <button className={`btn btn-secondary ${storageView === 'collections' ? 'active' : ''}`} onClick={() => setStorageView('collections')}>Коллекции</button>
            <button className={`btn btn-secondary ${storageView === 'indexes' ? 'active' : ''}`} onClick={() => setStorageView('indexes')}>Индексы</button>
          </div>
        </div>

        <div className="panel">
          <h3><Zap size={14} color="#24a1de" /> Нагрузка базы данных</h3>
          <div style={{ height: '140px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.loadData}>
                <Bar dataKey="value" fill="#24a1de" radius={[1, 1, 0, 0]}>
                   {stats.loadData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fillOpacity={(entry.value / 100) * 0.8 + 0.2} fill="#24a1de" />
                  ))}
                </Bar>
                <XAxis dataKey="hour" hide />
                <RechartsTooltip cursor={{fill: 'rgba(0,0,0,0.02)'}} content={() => null} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-muted" style={{ textAlign: 'center', marginTop: '10px', fontSize: '11px' }}>
            Средняя загрузка: {avgLoad}%
          </div>
        </div>
      </aside>
    </div>
  );
}

export default App;


