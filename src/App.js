import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import { Database, Search, ArrowLeft, ArrowRight, Download, Eye, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
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
  
  const [filterInterval, setFilterInterval] = useState('Day');
  const [errorIndex, setErrorIndex] = useState(0);
  
  const [connectionTimeMs, setConnectionTimeMs] = useState(0);

  // Stats derived from logs
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
      if (res.ok) {
        setIsConnected(true);
        setConnectionTimeMs(data.duration);
        setDbStatus('Normal');
        fetchLogs();
      } else {
        alert("Connection failed: " + data.error);
        setDbStatus('Critical');
      }
    } catch (e) {
      alert("Error: " + e.message);
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
      }, 60000); // exactly 1 minute
    }
    return () => clearInterval(interval);
  }, [isConnected, fetchStatus, fetchLogs]);

  // Export handlers
  const handleExport = (format) => {
    window.open(`/api/export?format=${format}`, '_blank');
  };

  // Render variables
  const getOpColor = (op) => {
    if (op === 'CREATE') return '#3b82f6';
    if (op === 'READ') return '#10b981';
    if (op === 'UPDATE') return '#f59e0b';
    if (op === 'DELETE') return '#ef4444';
    return '#94a3b8';
  };

  const pieData = Object.keys(opCounts).filter(k => k !== 'TOTAL').map(k => ({
    name: k,
    value: opCounts[k]
  }));

  // Group logs directly into chart data
  const chartData = logs.slice(0, 50).reverse().map(l => ({
    name: format(new Date(l.ts), 'HH:mm'),
    latency: l.millis,
    op: l.operation
  }));

  // Connection Progress Logic (0 to 100% based on an arbitrary max like 5000ms)
  let connPct = Math.min((connectionTimeMs / 5000) * 100, 100);
  if (connectionTimeMs === 0) connPct = 0;
  if (!isConnected) connPct = 0;

  return (
    <div className="dashboard-container">
      {/* Top Center: Config */}
      <div className="top-center panel">
        <div className="config-input-wrapper">
          <Database size={24} color="#6366f1" />
          <input 
            type="text" 
            className="config-input" 
            placeholder="mongodb+srv://user:pass@cluster... (Atlas/AWS)"
            value={dbUri}
            onChange={(e) => setDbUri(e.target.value)}
          />
          <button className="btn" onClick={handleConnect} disabled={loading}>
            {loading ? <RefreshCw className="animate-spin" /> : 'Connect DB'}
          </button>
        </div>
        
        <div className="flex-row">
          <div className="text-muted" style={{textAlign: 'right', marginRight: '10px'}}>
            <div>Connection Perf</div>
            <div style={{color: 'white', fontWeight: 'bold'}}>{connectionTimeMs} ms</div>
          </div>
          <div className="circular-progress" style={{ '--progress': `${connPct}%` }}>
            <span className="circular-value">{Math.round(connPct)}%</span>
          </div>
        </div>
      </div>

      {/* Left Sidebar */}
      <div className="sidebar-left">
        <div className="panel">
          <h2>Database Status</h2>
          <div className="status-indicator">
            <div className={`status-dot ${dbStatus.toLowerCase()}`}></div>
            <h1 style={{margin: 0}}>{dbStatus}</h1>
          </div>
          <div className="text-muted mb-4">Last checked: {formatDistanceToNow(lastUpdate)} ago</div>
          <div className="text-muted">Checks automatically every 1 minute.</div>
        </div>

        <div className="panel">
          <h2>Analytics Split</h2>
          <div style={{ height: '200px' }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getOpColor(entry.name)} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{background: '#161621', border: 'none', color: 'white'}} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="text-muted">No data available</div>}
          </div>
        </div>

        <div className="panel">
          <h2>CRUD Distribution</h2>
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
            <h2>Operation Frequency & Latency</h2>
            <div className="chart-filters">
              {['Day', 'Week', 'Month', 'Year'].map(i => (
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
          <div style={{ height: '250px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <RechartsTooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{background: '#161621', border: 'none', color: 'white'}} />
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
              <h2>Action Logs</h2>
              <div className="w-full max-w-xs" style={{position: 'relative', marginLeft: '20px'}}>
                <Search size={16} color="#94a3b8" style={{position: 'absolute', left: 10, top: 10}} />
                <input type="text" className="config-input" style={{paddingLeft: '34px', padding: '8px 8px 8px 34px'}} placeholder="Search logs..." />
              </div>
            </div>
            <div className="flex-row">
              <button className="btn" style={{padding: '8px 16px', background: 'rgba(255,255,255,0.1)'}} onClick={() => handleExport('json')}>
                <Download size={16} /> JSON
              </button>
              <button className="btn" style={{padding: '8px 16px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981'}} onClick={() => handleExport('excel')}>
                <Download size={16} /> Excel
              </button>
            </div>
          </div>

          {errorLogs.length > 0 && (
            <div className="error-widget">
              <div className="flex-row" style={{color: '#ef4444', fontWeight: 600}}>
                <Eye size={20} />
                <span>Error / Poor Performance Widget</span>
              </div>
              <div className="error-controls">
                <span>{errorIndex + 1} / {errorLogs.length} issues</span>
                <button className="err-btn" onClick={() => setErrorIndex(e => Math.max(0, e - 1))}><ArrowLeft size={16} /></button>
                <button className="err-btn" onClick={() => setErrorIndex(e => Math.min(errorLogs.length - 1, e + 1))}><ArrowRight size={16} /></button>
              </div>
            </div>
          )}

          <div className="logs-container">
            {logs.length > 0 ? logs.map((log, idx) => {
              const isErrorTarget = errorLogs.length > 0 ? (errorLogs[errorIndex].id === log.id) : false;
              return (
                <div key={idx} id={`log-${log.id}`} className={`log-item ${log.error || log.quality === 'Poor' ? 'error-log' : ''} ${isErrorTarget ? 'highlighted' : ''}`}>
                  <div className="log-header">
                    <span className={`badge ${log.operation.toLowerCase()}`}>{log.operation}</span>
                    <span className={`badge ${log.quality.toLowerCase().replace(' ', '-')}`}>{log.quality} ({log.millis.toFixed(1)}ms)</span>
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
                No logs generated or parsed yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
