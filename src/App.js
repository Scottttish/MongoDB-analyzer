import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import { Database, Search, ArrowLeft, ArrowRight, Download, Eye, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell
} from 'recharts';

function App() {
  const [dbUri, setDbUri] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [dbStatus, setDbStatus] = useState('Passive');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  
  const [logs, setLogs] = useState([]);
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
        fetchLogs();
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

  const fetchLogs = useCallback(async () => {
    if (!isConnected) return;
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
    } catch (e) {
      console.error(e);
    }
  }, [isConnected]);

  const fetchStatus = useCallback(async () => {
    if (!isConnected) return;
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setDbStatus(data.status);
      setLastUpdate(data.updatedAt ? new Date(data.updatedAt) : new Date());
    } catch (e) {
      setDbStatus('Critical');
    }
  }, [isConnected]);

  useEffect(() => {
    let interval;
    if (isConnected) {
      interval = setInterval(() => {
        fetchStatus();
        fetchLogs();
      }, 60000);
    }
    return () => clearInterval(interval);
  }, [isConnected, fetchStatus, fetchLogs]);

  const handleExport = (format) => {
    window.open(`/api/export?format=${format}`, '_blank');
  };

  const getOpColor = (op) => {
    if (op === 'CREATE') return '#3b82f6';
    if (op === 'READ') return '#10b981';
    if (op === 'UPDATE') return '#f59e0b';
    if (op === 'DELETE') return '#ef4444';
    return '#9ca3af'; /* gray-400 */
  };

  const pieData = Object.keys(opCounts).filter(k => k !== 'TOTAL').map(k => ({
    name: k,
    value: opCounts[k]
  }));

  const chartData = logs.slice(0, 50).reverse().map(l => ({
    name: format(new Date(l.ts), 'HH:mm'),
    latency: l.millis,
    op: l.operation
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
          <button className="btn" onClick={handleConnect} disabled={loading}>
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
          <div className="text-muted">Авто-проверка каждую 1 минуту.</div>
        </div>

        <div className="panel">
          <h2>Аналитика запросов</h2>
          <div style={{ width: '100%', height: '220px', minHeight: 220 }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="99%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getOpColor(entry.name)} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{background: '#ffffff', borderRadius: 8, borderColor: '#e5e7eb', color: '#111827'}} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="text-muted">Нет данных</div>}
          </div>
        </div>

        <div className="panel">
          <h2>Распределение CRUD</h2>
          {['CREATE', 'READ', 'UPDATE', 'DELETE'].map(op => {
            const count = opCounts[op] || 0;
            const pct = opCounts.TOTAL ? (count / opCounts.TOTAL) * 100 : 0;
            return (
              <div className="progress-group" key={op}>
                <div className="progress-label">
                  <span style={{color: getOpColor(op), fontWeight: 600}}>{op}</span>
                  <span>{Math.round(pct)}%</span>
                </div>
                <div className="progress-bg">
                  <div className="progress-fill" style={{width: `${pct}%`, background: getOpColor(op)}}></div>
                </div>
              </div>
            );
          })}
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
                  className={`filter-btn ${filterInterval === i ? 'active' : ''}`}
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

        {/* Logs List & Errors */}
        <div className="panel" style={{display: 'flex', flexDirection: 'column'}}>
          <div className="flex-row justify-between mb-4">
            <div className="flex-row">
              <h2>Журнал операций</h2>
              <div className="w-full max-w-xs" style={{position: 'relative', marginLeft: '20px'}}>
                <Search size={16} color="#6b7280" style={{position: 'absolute', left: 10, top: 10}} />
                <input type="text" className="config-input" style={{paddingLeft: '34px', padding: '8px 8px 8px 34px'}} placeholder="Поиск логов..." />
              </div>
            </div>
            <div className="flex-row">
              <button className="btn" style={{padding: '8px 16px', background: '#e5e7eb', color: '#374151'}} onClick={() => handleExport('json')}>
                <Download size={16} /> JSON
              </button>
              <button className="btn" style={{padding: '8px 16px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981'}} onClick={() => handleExport('excel')}>
                <Download size={16} /> Excel
              </button>
            </div>
          </div>

          {errorLogs.length > 0 && (
            <div className="error-widget">
              <div className="flex-row" style={{color: '#ef4444', fontWeight: 600}}>
                <Eye size={20} />
                <span>Виджет проблем и задержек</span>
              </div>
              <div className="error-controls">
                <span>{errorIndex + 1} / {errorLogs.length} проблем</span>
                <button className="err-btn" onClick={() => setErrorIndex(e => Math.max(0, e - 1))}><ArrowLeft size={16} /></button>
                <button className="err-btn" onClick={() => setErrorIndex(e => Math.min(errorLogs.length - 1, e + 1))}><ArrowRight size={16} /></button>
              </div>
            </div>
          )}

          <div className="logs-container">
            {logs.length > 0 ? logs.map((log, idx) => {
              const isErrorTarget = errorLogs.length > 0 ? (errorLogs[errorIndex].id === log.id) : false;
              let qualityRU = log.quality === 'Great' ? 'Отлично' : log.quality === 'Need Improvement' ? 'Требует улучшений' : 'Плохо';
              return (
                <div key={idx} id={`log-${log.id}`} className={`log-item ${log.error || log.quality === 'Poor' ? 'error-log' : ''} ${isErrorTarget ? 'highlighted' : ''}`}>
                  <div className="log-header">
                    <span className={`badge ${log.operation.toLowerCase()}`}>{log.operation}</span>
                    <span className={`badge ${log.quality.toLowerCase().replace(' ', '-')}`}>{qualityRU} ({log.millis.toFixed(1)}мс)</span>
                    <span className="text-muted">{format(new Date(log.ts), 'HH:mm:ss')}</span>
                  </div>
                  <div className="log-query">
                    {log.query}
                  </div>
                  {log.errMsg && <div style={{color: '#ef4444', fontSize: '12px'}}>{log.errMsg}</div>}
                </div>
              )
            }) : (
              <div className="text-muted" style={{textAlign: 'center', padding: '40px'}}>
                Логов пока нет.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
