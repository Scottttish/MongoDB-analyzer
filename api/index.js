const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const xlsx = require('xlsx');

const app = express();
app.use(cors());
app.use(express.json());

let globalClient = null;
let globalDbUri = null;

async function getClient(uri) {
  if (!uri) throw new Error("URI is required");
  if (globalClient && globalDbUri === uri) {
    return globalClient;
  }
  if (globalClient) {
    await globalClient.close();
  }
  globalDbUri = uri;
  globalClient = new MongoClient(uri);
  await globalClient.connect();
  return globalClient;
}

app.post('/api/connect', async (req, res) => {
  const { uri } = req.body;
  if (!uri) return res.status(200).json({ success: false, error: 'Укажите MongoDB URI' });

  try {
    const start = Date.now();
    await getClient(uri);
    const duration = Date.now() - start;

    try {
      const db = globalClient.db();
      await db.command({ profile: 2 });
    } catch (e) {
      // Ignore Free Tier failure
    }
    res.status(200).json({ success: true, duration, message: 'Connected to MongoDB' });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message, duration: 0 });
  }
});

app.get('/api/status', async (req, res) => {
  const uri = req.query.uri;
  if (!uri) return res.status(200).json({ connected: false });
  try {
    await getClient(uri);
    const db = globalClient.db();
    const adminDb = db.admin();
    const ping = await adminDb.command({ ping: 1 });
    res.status(200).json({ connected: ping.ok === 1, status: ping.ok === 1 ? 'Normal' : 'Critical', updatedAt: new Date() });
  } catch (err) {
    res.status(200).json({ connected: false, status: 'Critical', error: err.message, updatedAt: new Date() });
  }
});

app.get('/api/activity', async (req, res) => {
  const uri = req.query.uri;
  if (!uri) return res.status(200).json({ success: false, error: 'Not connected' });
  try {
    await getClient(uri);
    const db = globalClient.db();
    
    // Attempt to enable profiling if not already at level 2
    try {
      await db.command({ profile: 2 });
    } catch (e) {
      console.log("Could not change profiling level, potentially insufficient permissions.");
    }

    // Fetch REAL server stats
    const serverStatus = await db.command({ serverStatus: 1 });
    const dbStats = await db.command({ dbStats: 1 });

    // Storage Usage
    const colStats = {
      collections: dbStats.collections,
      objects: dbStats.objects,
      dataSize: dbStats.dataSize,
      indexSize: dbStats.indexSize,
      totalSize: dbStats.storageSize
    };

    // Real Load metrics
    const currentConns = serverStatus.connections?.current || 0;
    const activeConns = serverStatus.connections?.active || 0;
    const realLoad = Math.min(((activeConns + 1) / (currentConns + 1)) * 100 + 5, 100);

    // Load Data - native JS timestamp
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const loadData = [{ hour: timeStr, value: realLoad }];

    // Activity Logs - ONLY REAL DATA
    let logs = [];
    let profilingError = null;
    try {
      let rawLogs = await db.collection('system.profile').find({}).sort({ ts: -1 }).limit(100).toArray();
      
      // Filter out analyzer's own queries to avoid noise
      rawLogs = rawLogs.filter(l => {
        const cmd = l.command || l.query || {};
        // Ignore diagnostic commands run by the analyzer
        if (cmd.dbStats || cmd.collStats || cmd.listCollections || cmd.listIndexes) return false;
        if (cmd.aggregate && JSON.stringify(cmd.pipeline).includes('$indexStats')) return false;
        // Ignore the analyzer's own profile queries
        if (cmd.find === 'system.profile') return false;
        return true;
      });

      logs = rawLogs.slice(0, 20).map(l => {
        let opType = l.op.toUpperCase();
        const cmd = l.command || l.query || {};

        if (opType === 'COMMAND') {
          if (cmd.find || cmd.aggregate || cmd.count || cmd.distinct) opType = 'READ';
          else if (cmd.insert) opType = 'CREATE';
          else if (cmd.update) opType = 'UPDATE';
          else if (cmd.delete || cmd.findAndModify) opType = 'DELETE';
        } else if (opType === 'QUERY') {
          opType = 'READ';
        } else if (opType === 'INSERT') {
          opType = 'CREATE';
        } else if (opType === 'REMOVE') {
          opType = 'DELETE';
        }

        // Final fallback for labels
        const finalOp = opType === 'QUERY' ? 'READ' : opType === 'INSERT' ? 'CREATE' : opType === 'REMOVE' ? 'DELETE' : opType;

        // Try to identify used index from planSummary
        let indexName = '-';
        const plan = l.planSummary || '';
        if (plan.includes('IXSCAN')) {
          const match = plan.match(/IXSCAN\s*\{(.*?)\}/);
          indexName = match ? match[1] : 'Indexed';
        } else if (plan.includes('COLLSCAN')) {
          indexName = 'COLLSCAN (No Index)';
        }

        return {
          ts: l.ts,
          op: ['READ', 'CREATE', 'UPDATE', 'DELETE'].includes(finalOp) ? finalOp : 'OTHER',
          millis: l.millis,
          indexUsed: indexName,
          command: cmd,
          category: l.millis > 100 ? 'Критичный' : l.millis > 50 ? 'Средний' : 'Нормальный'
        };
      });

      // Further filter: only keep standard CRUD for the main logs/stats
      logs = logs.filter(l => l.op !== 'OTHER');

    } catch (e) {
      profilingError = e.message;
      console.error("system.profile access failed:", e.message);
    }

    res.status(200).json({ 
      success: true, 
      logs, 
      colStats, 
      loadData, 
      realLoad,
      profilingEnabled: logs.length > 0,
      profilingError: profilingError
    });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

app.get('/api/explain', async (req, res) => {
  const uri = req.query.uri;
  if (!uri) return res.status(200).json({ success: false });
  try {
    await getClient(uri);
    const db = globalClient.db();
    const explanation = await db.collection('users').find({ age: 35 }).explain("executionStats");
    res.status(200).json({ success: true, explanation });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  const uri = req.query.uri;
  if (!uri) return res.status(200).json({ success: false, error: 'Not connected' });
  try {
    await getClient(uri);
    const db = globalClient.db();
    
    let dbStats = {};
    try { dbStats = await db.command({ dbStats: 1 }); } catch(e) {}
    
    const cols = await db.listCollections().toArray();
    let collectionsList = [];
    
    for (let c of cols) {
      if (c.name.startsWith('system.')) continue;
      try {
        const stats = await db.command({ collStats: c.name });
        collectionsList.push({
          name: c.name,
          count: stats.count || 0,
          size: stats.size || 0,
          storageSize: stats.storageSize || 0,
          totalIndexSize: stats.totalIndexSize || 0,
          percent: 0 // Will calculate in frontend or here
        });
      } catch (err) { }
    }
    
    res.status(200).json({ success: true, dbStats, collections: collectionsList });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

app.get('/api/indexes', async (req, res) => {
  const uri = req.query.uri;
  if (!uri) return res.status(200).json({ success: false, error: 'Not connected' });
  try {
    await getClient(uri);
    const db = globalClient.db();
    const cols = await db.listCollections().toArray();
    let indexesList = [];

    for (let c of cols) {
      if (c.name.startsWith('system.')) continue;
      try {
        const coll = db.collection(c.name);
        const stats = await coll.aggregate([{ $indexStats: {} }]).toArray();
        const collStats = await db.command({ collStats: c.name });

        stats.forEach(st => {
          indexesList.push({
            name: st.name,
            coll: c.name,
            size: collStats.indexSizes[st.name] || 0,
            usage: st.accesses?.ops || 0
          });
        });
      } catch (err) { }
    }
    res.status(200).json({ success: true, indexes: indexesList });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

app.get('/api/export', async (req, res) => {
  const uri = req.query.uri;
  if (!uri) return res.status(200).json({ success: false, error: 'Not connected' });
  try {
    await getClient(uri);
    const format = req.query.format || 'json';
    const db = globalClient.db();

    let logs = [];
    try {
      logs = await db.collection('system.profile').find({}).sort({ ts: -1 }).limit(1000).toArray();
    } catch (e) {
      return res.status(200).json({ success: false, error: 'Export failed: ' + e.message });
    }

    if (format === 'json') {
      res.setHeader('Content-disposition', 'attachment; filename=mongo_logs.json');
      res.setHeader('Content-type', 'application/json');
      res.send(JSON.stringify(logs, null, 2));
    } else if (format === 'excel') {
      const data = logs.map(l => {
        const date = new Date(l.ts);
        const pad = (n) => n.toString().padStart(2, '0');
        const formattedDate = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        
        let indexName = '-';
        const plan = l.planSummary || '';
        if (plan.includes('IXSCAN')) {
          const match = plan.match(/IXSCAN\s*\{(.*?)\}/);
          indexName = match ? match[1] : 'Indexed';
        } else if (plan.includes('COLLSCAN')) {
          indexName = 'COLLSCAN (No Index)';
        }

        return {
          'Дата и Время': formattedDate,
          'Тип': l.op === 'query' ? 'READ' : l.op.toUpperCase(),
          'Индекс': indexName,
          'Длительность (ms)': l.millis,
          'Статус': l.millis > 100 ? 'Критичный' : l.millis > 50 ? 'Средний' : 'Нормальный',
          'Команда': JSON.stringify(l.command || l.query || {})
        };
      });
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "MongoDB Logs");
      const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-disposition', 'attachment; filename=mongo_logs.xlsx');
      res.setHeader('Content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(excelBuffer);
    } else {
      res.status(200).json({ success: false, error: 'Invalid format. Use json or excel.' });
    }
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

module.exports = app;
