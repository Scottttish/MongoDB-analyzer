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
      console.warn("Could not set profiling level to 2", e.message);
    }
    
    res.status(200).json({ success: true, duration, message: 'Connected to MongoDB' });
  } catch (err) {
    console.error("Connection Error:", err);
    res.status(200).json({ success: false, error: err.message, duration: 0 });
  }
});

app.get('/api/status', async (req, res) => {
  if (!globalClient) return res.status(200).json({ connected: false });
  try {
    const db = globalClient.db();
    const adminDb = db.admin();
    const ping = await adminDb.command({ ping: 1 });
    res.status(200).json({ connected: ping.ok === 1, status: ping.ok === 1 ? 'Normal' : 'Critical', updatedAt: new Date() });
  } catch (err) {
    res.status(200).json({ connected: false, status: 'Critical', error: err.message, updatedAt: new Date() });
  }
});

app.get('/api/logs', async (req, res) => {
  if (!globalClient) return res.status(200).json({ success: false, error: 'Not connected' });
  try {
    const db = globalClient.db();
    const profileCollection = db.collection('system.profile');
    const logs = await profileCollection.find({}).sort({ ts: -1 }).limit(1000).toArray();
      
    const transformedLogs = logs.map(log => {
      let operation = 'UNKNOWN';
      if (log.op === 'query' || log.op === 'getmore' || log.op === 'command' && log.command?.find) operation = 'READ';
      else if (log.op === 'insert' || log.command?.insert) operation = 'CREATE';
      else if (log.op === 'update' || log.command?.update) operation = 'UPDATE';
      else if (log.op === 'remove' || log.command?.delete) operation = 'DELETE';
      else operation = log.op.toUpperCase();

      let quality = 'Great';
      if (log.millis > 500) quality = 'Poor';
      else if (log.millis > 100) quality = 'Need Improvement';

      return {
        id: log._id ? log._id.toString() : Math.random().toString(36),
        operation,
        ns: log.ns,
        millis: log.millis,
        ts: log.ts,
        query: JSON.stringify(log.command || log.query || log),
        error: log.err ? true : false,
        errMsg: log.err || null,
        quality
      };
    });

    res.status(200).json({ success: true, logs: transformedLogs });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

app.get('/api/indexes', async (req, res) => {
  if (!globalClient) return res.status(200).json({ success: false, error: 'Not connected' });
  try {
    const db = globalClient.db();
    const cols = await db.listCollections().toArray();
    let indexesList = [];
    
    for (let c of cols) {
      if (c.name.startsWith('system.')) continue;
      try {
        const coll = db.collection(c.name);
        const stats = await coll.aggregate([ { $indexStats: {} } ]).toArray();
        const collStats = await db.command({ collStats: c.name });
        
        stats.forEach(st => {
           indexesList.push({
             name: `${c.name}: ${st.name}`,
             size: collStats.indexSizes[st.name] || 0,
             usage: st.accesses?.ops || 0
           });
         });
      } catch (err) {
        // M0 restrictions or missing privileges for specific collections
      }
    }
    res.status(200).json({ success: true, indexes: indexesList.sort((a,b) => b.usage - a.usage) });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
});

app.get('/api/export', async (req, res) => {
  if (!globalClient) return res.status(200).json({ success: false, error: 'Not connected' });
  try {
    const format = req.query.format || 'json';
    const db = globalClient.db();
    const logs = await db.collection('system.profile').find({}).sort({ ts: -1 }).limit(1000).toArray();

    if (format === 'json') {
      res.setHeader('Content-disposition', 'attachment; filename=mongo_logs.json');
      res.setHeader('Content-type', 'application/json');
      res.send(JSON.stringify(logs, null, 2));
    } else if (format === 'excel') {
      const ws = xlsx.utils.json_to_sheet(logs.map(l => ({
        timestamp: l.ts,
        operation: l.op,
        namespace: l.ns,
        latency_ms: l.millis,
        error: l.err || 'None',
        query: JSON.stringify(l.command || l.query || {})
      })));
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
