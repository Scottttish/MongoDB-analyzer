import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import { Database, Search, ArrowLeft, ArrowRight, Download, Eye, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  Cell
} from 'recharts';

function App() {
  const [dbUri, setDbUri] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [dbStatus, setDbStatus] = useState('Passive');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  const [logs, setLogs] = useState([]);
  const [indexesData, setIndexesData] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [filterInterval, setFilterInterval] = useState('День');
  const [errorIndex, setErrorIndex] = useState(0);
  
  const [connectionTimeMs, setConnectionTimeMs] = useState(0);

  const errorLogs = logs.filter(l => l.error || l.quality === 'Poor');
  const opCounts = logs.reduce((acc, log) => {
    acc[log.operation] = (acc[log.operation] || 0) + 1;
    acc.TOTAL = (acc.TOTAL || 0) + 1;
    return acc;
  }, {});

  const handleConnect = async () => {
    if (!dbUri) return;
    setLoading(true);
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: dbUri })
      });
      const data = await res.json();
      if (res.ok && data.success !== false) {
        setIsConnected(true);
        setConnectionTimeMs(data.duration);
        setDbStatus('Normal');
        fetchStats();
        fetchIndexes();
      } else {
        alert("Ошибка подключения: " + data.error);
        setDbStatus('Critical');
      }
    } catch (e) {
      alert("Ошибка: " + e.message);
      setDbStatus('Critical');
    }
    setLoading(false);
  };

  const fetchStats = useCallback(async () => {
    if (!isConnected || !dbUri) return;
    try {
      const res = await fetch(`/api/stats?uri=${encodeURIComponent(dbUri)}`);
      const data = await res.json();
      if (data.success) {
        setStatsData(data.collections || []);
        setDbInfo(data.dbStats || null);
      }
    } catch (e) {
      console.error(e);
    }
  }, [isConnected, dbUri]);

  const fetchStatus = useCallback(async () => {
    if (!isConnected || !dbUri) return;
    try {
      const res = await fetch(`/api/status?uri=${encodeURIComponent(dbUri)}`);
      const data = await res.json();
      setDbStatus(data.status);
      setLastUpdate(data.updatedAt ? new Date(data.updatedAt) : new Date());
    } catch (e) {
      setDbStatus('Critical');
    }
  }, [isConnected, dbUri]);

  const fetchIndexes = useCallback(async () => {
    if (!isConnected || !dbUri) return;
    try {
      const res = await fetch(`/api/indexes?uri=${encodeURIComponent(dbUri)}`);
      const data = await res.json();
      if (data.success && data.indexes) {
        setIndexesData(data.indexes);
      }
    } catch (e) {
      console.error(e);
    }
  }, [isConnected, dbUri]);

  useEffect(() => {
    let interval;
    if (isConnected) {
      interval = setInterval(() => {
        fetchStatus();
        fetchStats();
        fetchIndexes();
      }, 60000);
    }
    return () => clearInterval(interval);
  }, [isConnected, fetchStatus, fetchStats, fetchIndexes]);

  const handleExport = (format) => {
    window.open(`/api/export?format=${format}&uri=${encodeURIComponent(dbUri)}`, '_blank');
  };

  const chartData = statsData.slice(0, 10).map(c => ({
    name: c.name,
    sizeKB: Number((c.size / 1024).toFixed(1))
  }));

  let connPct = Math.min((connectionTimeMs / 5000) * 100, 100);
  if (connectionTimeMs === 0) connPct = 0;
  if (!isConnected) connPct = 0;

  return (
    <div className="dashboard-container">
      {/* Top Center: Config */}
      <div className="top-center panel">
        <div className="config-input-wrapper">
          <Database size={24} color="#FF5A00" />
          <input 
            type="text" 
            className="config-input" 
            placeholder="mongodb+srv://user:pass@cluster... (Atlas/AWS)"
            value={dbUri}
            onChange={(e) => setDbUri(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleConnect} disabled={loading}>
            {loading ? <RefreshCw className="animate-spin" /> : 'Подключиться'}
          </button>
        </div>
        
        <div className="flex-row">
          <div className="text-muted" style={{textAlign: 'right', marginRight: '10px'}}>
            <div>Время подкл.</div>
            <div style={{color: '#111827', fontWeight: 'bold'}}>{connectionTimeMs} ms</div>
          </div>
          <div className="circular-progress" style={{ '--progress': `${connPct}%` }}>
            <span className="circular-value">{Math.round(connPct)}%</span>
          </div>
        </div>
      </div>

      {/* Left Sidebar */}
      <div className="sidebar-left">
        <div className="panel">
          <h2>Статус базы данных</h2>
          <div className="status-indicator">
            <div className={`status-dot ${dbStatus.toLowerCase()}`}></div>
            <h1 style={{margin: 0}}>{dbStatus === 'Normal' ? 'Нормальный' : dbStatus === 'Critical' ? 'Критичный' : 'В ожидании'}</h1>
          </div>
          <div className="text-muted mb-4">Обновлено: {formatDistanceToNow(lastUpdate, { locale: ru })} назад</div>
        </div>

        <div className="panel">
          <h2>Аналитика индексов</h2>
          <div className="index-list-container">
            {indexesData.length > 0 ? indexesData.map((idx, i) => (
              <div key={i} className="index-item">
                <div className="index-title">{idx.name}</div>
                <div className="index-stats">
                  <span>{(idx.size / 1024).toFixed(1)} KB</span>
                  <span>{idx.usage} исп.</span>
                </div>
              </div>
            )) : <div className="text-muted">Нет данных (или доступ ограничен)</div>}
          </div>
        </div>

        <div className="panel">
          <h2>Сводка хранилища (Native)</h2>
          {dbInfo ? (
            <div className="flex-col" style={{gap: '12px', marginTop: '16px'}}>
              <div className="flex-row justify-between">
                <span className="text-muted">Количество коллекций</span>
                <span className="font-600">{dbInfo.collections || 0}</span>
              </div>
              <div className="flex-row justify-between">
                <span className="text-muted">Объектов всего</span>
                <span className="font-600">{dbInfo.objects || 0}</span>
              </div>
              <div className="flex-row justify-between">
                <span className="text-muted">Размер данных</span>
                <span className="font-600">{(dbInfo.dataSize / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div className="flex-row justify-between">
                <span className="text-muted">Размер индексов</span>
                <span className="font-600">{(dbInfo.indexSize / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            </div>
          ) : (
             <div className="text-muted" style={{marginTop: '16px'}}>Нет данных</div>
          )}
        </div>
      </div>

      {/* Main Content (Right/Center) */}
      <div className="main-content">
        {/* Top Graph Container */}
        <div className="panel">
          <div className="flex-row justify-between mb-4">
            <h2>Частота и задержка операций</h2>
            <div className="chart-filters">
              {['День', 'Неделя', 'Месяц', 'Год'].map(i => (
                <button 
                  key={i} 
                  className={`btn btn-secondary ${filterInterval === i ? 'active' : ''}`}
                  style={{padding: '6px 12px', fontSize: '12px'}}
                  onClick={() => setFilterInterval(i)}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: '100%', height: '280px', minHeight: 280 }}>
            <ResponsiveContainer width="99%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#6b7280" />
                <YAxis stroke="#6b7280" />
                <RechartsTooltip cursor={{fill: 'rgba(0,0,0,0.03)'}} contentStyle={{background: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', color: '#111827'}} />
                <Bar dataKey="latency" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getOpColor(entry.op)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Collections Native List */}
        <div className="panel" style={{display: 'flex', flexDirection: 'column'}}>
          <div className="flex-row justify-between mb-4">
            <h2 style={{ margin: 0, minWidth: 'max-content' }}>Статистика коллекций (Native db.command)</h2>
          </div>
          
          <div className="logs-container">
            {statsData.length > 0 ? statsData.map((c, i) => (
              <div key={i} className="log-row" style={{background: 'var(--bg-main)', padding: '16px', marginBottom: '12px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', border: '1px solid var(--border-light)'}}>
                <div style={{flex: 1}}>
                  <div style={{fontWeight: 600, color: 'var(--text-main)', fontSize: '15px'}}>{c.name}</div>
                  <div style={{fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px'}}>Объектов: {c.count} шт</div>
                  <div style={{fontSize: '13px', color: 'var(--text-muted)'}}>Индексов: {c.nindexes} шт</div>
                </div>
                <div style={{textAlign: 'right'}}>
                  <div style={{fontWeight: 600, color: '#FF5A00', fontSize: '15px'}}>{(c.size / 1024).toFixed(1)} КБ (Data)</div>
                  <div style={{fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px'}}>Ср. размер: {c.avgObjSize}B</div>
                  <div style={{fontSize: '13px', color: '#10b981'}}>ВЕС Индексов: {(c.totalIndexSize / 1024).toFixed(1)} КБ</div>
                </div>
              </div>
            )) : (
              <div className="text-muted" style={{textAlign: 'center', padding: '40px'}}>
                Нет коллекций для отображения. Обратите внимание, что системные коллекции скрыты.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
