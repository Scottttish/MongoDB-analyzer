import React, { useState, useCallback } from 'react';
import './index.css';
import { 
  Database, RefreshCw, Zap, Activity, Clock, 
  Monitor, Cpu, HardDrive
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
        // Calculate CRUD counts from logs
        const crud = data.logs.reduce((acc, log) => {
          acc[log.op] = (acc[log.op] || 0) + 1;
          return acc;
        }, { READ: 0, UPDATE: 0, CREATE: 0, DELETE: 0 });

        setStats({
          logs: data.logs,
          colStats: data.colStats,
          loadData: data.loadData,
          collections: statsData.collections || [],
          indexes: idxData.indexes || [],
          crud
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

  return (
    <div className="dashboard">
      {/* Header Config */}
      <header className="header-config">
        <div className="config-input-group">
          <Database size={20} color="#3b82f6" />
          <input 
            type="text" 
            className="config-input" 
            placeholder="mongodb+srv://user:pass@cluster..."
            value={dbUri}
            onChange={(e) => setDbUri(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleConnect} disabled={loading}>
            {loading ? <RefreshCw className="animate-spin" size={18} /> : 'Обновить данные'}
          </button>
        </div>
        <div className="header-actions">
          <div className={`last-updated ${showUpdated ? 'visible' : ''}`}>
            Последнее обновление сейчас
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div className="btn btn-secondary" style={{ padding: '8px' }}><Monitor size={18} /></div>
            <div className="btn btn-secondary" style={{ padding: '8px' }}><Cpu size={18} /></div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {/* CRUD Widgets */}
        <div className="crud-grid">
          {Object.entries(stats.crud).map(([op, val]) => (
            <div key={op} className="panel crud-card">
              <div className="crud-label">{op}</div>
              <div className="crud-value">{val}</div>
            </div>
          ))}
        </div>

        {/* CRUD Chart */}
        <div className="panel" style={{ height: '400px' }}>
          <h3><Activity size={18} color="#3b82f6" /> Нагрузка операций</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.logs.slice(0, 10).reverse()}>
                <XAxis dataKey="ts" tickFormatter={(t) => format(new Date(t), 'HH:mm')} stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <RechartsTooltip 
                  contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Bar dataKey="millis" radius={[4, 4, 0, 0]} name="Latency (ms)">
                  {stats.logs.slice(0, 10).reverse().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.op === 'READ' ? '#10b981' : entry.op === 'UPDATE' ? '#f59e0b' : entry.op === 'CREATE' ? '#3b82f6' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Operation Log */}
        <div className="panel log-panel">
          <h3><Clock size={18} color="#3b82f6" /> Журнал операций</h3>
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
                    <td><span className={`badge badge-${log.op?.toLowerCase() || 'read'}`} style={{background: 'rgba(255,255,255,0.05)'}}>{log.op}</span></td>
                    <td className="query-cell">
                      <div className="query-text">{JSON.stringify(log.command)}</div>
                    </td>
                    <td>
                      <span className={log.millis > 300 ? 'duration-high' : log.millis > 100 ? 'duration-mid' : ''}>
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

      {/* Sidebar Right */}
      <aside className="sidebar-right">
        {/* Storage Widget */}
        <div className="panel storage-widget">
          <h3><HardDrive size={18} color="#3b82f6" /> Использование хранилища</h3>
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
            <button 
              className={`btn btn-secondary ${storageView === 'collections' ? 'active' : ''}`}
              onClick={() => setStorageView('collections')}
            >
              Коллекции
            </button>
            <button 
              className={`btn btn-secondary ${storageView === 'indexes' ? 'active' : ''}`}
              onClick={() => setStorageView('indexes')}
            >
              Индексы
            </button>
          </div>
        </div>

        {/* Database Load Widget */}
        <div className="panel">
          <h3><Zap size={18} color="#3b82f6" /> Нагрузка базы данных</h3>
          <div style={{ height: '160px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.loadData}>
                <Bar dataKey="value" fill="#3b82f6" radius={[2, 2, 0, 0]}>
                   {stats.loadData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fillOpacity={entry.value / 100} fill="#3b82f6" />
                  ))}
                </Bar>
                <XAxis dataKey="hour" hide />
                <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} content={() => null} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-muted" style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px' }}>
            Средняя загрузка: 84%
          </div>
        </div>
      </aside>
    </div>
  );
}

export default App;

