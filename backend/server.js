const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('node:path');
const fs = require('node:fs');
const { stringify } = require('csv-stringify/sync');

const JWT_SECRET = 'attendance_secret_2024';
const DB_FILE = path.join(__dirname, 'attendance.db');

app.use(helmet());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── DB INIT ────────────────────────────────────────────────────────────────
let db;
let SQL;

async function initDB() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      staff_type TEXT DEFAULT 'intern',
      department TEXT,
      start_date TEXT,
      end_date TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      clock_in TEXT,
      clock_out TEXT,
      status TEXT DEFAULT 'present',
      notes TEXT,
      UNIQUE(user_id, date),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Seed admin if not exists
  const adminExists = db.exec("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (!adminExists.length || !adminExists[0].values.length) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.run(
      "INSERT INTO users (name, email, password, role, staff_type, department) VALUES (?,?,?,?,?,?)",
      ['Administrator', 'admin@company.com', hash, 'admin', 'staff', 'Management']
    );
    console.log('✅ Admin seeded: admin@company.com / admin123');
  }

  saveDB();
  console.log('✅ Database ready');
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function query(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (e) {
    console.error('Query error:', e.message, sql);
    throw e;
  }
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const users = query('SELECT * FROM users WHERE email=? AND active=1', [email]);
  if (!users.length) return res.status(401).json({ error: 'Invalid credentials' });
  const user = users[0];
  if (!bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email, staff_type: user.staff_type } });
});

// ─── STAFF ROUTES ────────────────────────────────────────────────────────────
app.get('/api/staff', auth, adminOnly, (req, res) => {
  const staff = query('SELECT id,name,email,role,staff_type,department,start_date,end_date,active,created_at FROM users ORDER BY name');
  res.json(staff);
});

app.post('/api/staff', auth, adminOnly, (req, res) => {
  const { name, email, password, staff_type, department, start_date, end_date } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    run('INSERT INTO users (name,email,password,role,staff_type,department,start_date,end_date) VALUES (?,?,?,?,?,?,?,?)',
      [name, email, hash, 'staff', staff_type || 'intern', department || '', start_date || '', end_date || '']);
    res.json({ message: 'Staff created' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already exists' });
    throw e;
  }
});

app.put('/api/staff/:id', auth, adminOnly, (req, res) => {
  const { name, email, staff_type, department, start_date, end_date, active } = req.body;
  run('UPDATE users SET name=?,email=?,staff_type=?,department=?,start_date=?,end_date=?,active=? WHERE id=?',
    [name, email, staff_type, department, start_date, end_date, active, req.params.id]);
  res.json({ message: 'Updated' });
});

app.get('/api/staff/:id', auth, (req, res) => {
  const id = req.params.id;
  if (req.user.role !== 'admin' && req.user.id != id)
    return res.status(403).json({ error: 'Forbidden' });
  const users = query('SELECT id,name,email,role,staff_type,department,start_date,end_date,active FROM users WHERE id=?', [id]);
  if (!users.length) return res.status(404).json({ error: 'Not found' });
  res.json(users[0]);
});

// ─── ATTENDANCE ROUTES ────────────────────────────────────────────────────────
app.post('/api/attendance/clockin', auth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString().slice(11, 19);
  const existing = query('SELECT * FROM attendance WHERE user_id=? AND date=?', [req.user.id, today]);
  if (existing.length && existing[0].clock_in) return res.status(400).json({ error: 'Already clocked in today' });

  // Late if after 9:00 AM
  const hour = Number.parseInt(now.slice(0, 2), 10);
const min = Number.parseInt(now.slice(3, 5), 10);
  const isLate = hour > 9 || (hour === 9 && min > 0);
  const status = isLate ? 'late' : 'present';

  if (existing.length) {
    run('UPDATE attendance SET clock_in=?, status=? WHERE user_id=? AND date=?', [now, status, req.user.id, today]);
  } else {
    run('INSERT INTO attendance (user_id,date,clock_in,status) VALUES (?,?,?,?)', [req.user.id, today, now, status]);
  }
  res.json({ message: 'Clocked in', time: now, status });
});

app.post('/api/attendance/clockout', auth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString().slice(11, 19);
  const existing = query('SELECT * FROM attendance WHERE user_id=? AND date=?', [req.user.id, today]);
  if (!existing.length || !existing[0].clock_in) return res.status(400).json({ error: 'Not clocked in today' });
  if (existing[0].clock_out) return res.status(400).json({ error: 'Already clocked out' });

  // Half-day if less than 4 hours
  const clockInMins =
  Number.parseInt(clockInParts[0], 10) * 60 +
  Number.parseInt(clockInParts[1], 10);

const nowParts = now.split(':');

const nowMins =
  Number.parseInt(nowParts[0], 10) * 60 +
  Number.parseInt(nowParts[1], 10);

const worked = nowMins - clockInMins;

let status = existing[0].status;

if (worked < 240) {
  status = 'half-day';
}

  run('UPDATE attendance SET clock_out=?, status=? WHERE user_id=? AND date=?', [now, status, req.user.id, today]);
  res.json({ message: 'Clocked out', time: now, worked_minutes: worked });
});

app.get('/api/attendance/today', auth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  if (req.user.role === 'admin') {
    const records = query(`
      SELECT a.*, u.name, u.department, u.staff_type
      FROM attendance a JOIN users u ON a.user_id=u.id
      WHERE a.date=? ORDER BY u.name
    `, [today]);
    const allStaff = query('SELECT id,name,department,staff_type FROM users WHERE role=? AND active=1', ['staff']);
    res.json({ records, allStaff, date: today });
  } else {
    const records = query('SELECT * FROM attendance WHERE user_id=? AND date=?', [req.user.id, today]);
    res.json({ record: records[0] || null, date: today });
  }
});

app.get('/api/attendance/my', auth, (req, res) => {
  const { month, year } = req.query;
  const userId = req.user.role === 'admin' && req.query.user_id ? req.query.user_id : req.user.id;
  let sql = 'SELECT * FROM attendance WHERE user_id=?';
  const params = [userId];
  if (month && year) {
    sql += ' AND strftime("%Y-%m", date)=?';
    params.push(`${year}-${month.padStart(2, '0')}`);
  }
  sql += ' ORDER BY date DESC';
  const records = query(sql, params);
  res.json(records);
});

app.get('/api/attendance/all', auth, adminOnly, (req, res) => {
  const { month, year } = req.query;
  let sql = `SELECT a.*, u.name, u.department, u.staff_type FROM attendance a JOIN users u ON a.user_id=u.id`;
  const params = [];
  if (month && year) {
    sql += ' WHERE strftime("%Y-%m", a.date)=?';
    params.push(`${year}-${month.padStart(2, '0')}`);
  }
  sql += ' ORDER BY a.date DESC, u.name';
  res.json(query(sql, params));
});

app.get('/api/attendance/export', auth, adminOnly, (req, res) => {
  const { month, year } = req.query;
  let sql = `SELECT u.name, u.staff_type, u.department, a.date, a.clock_in, a.clock_out, a.status
             FROM attendance a JOIN users u ON a.user_id=u.id`;
  const params = [];
  if (month && year) {
    sql += ' WHERE strftime("%Y-%m", a.date)=?';
    params.push(`${year}-${month.padStart(2, '0')}`);
  }
  sql += ' ORDER BY a.date, u.name';
  const rows = query(sql, params);
  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=attendance-${year || 'all'}-${month || 'all'}.csv`);
  res.send(csv);
});

app.get('/api/attendance/summary', auth, adminOnly, (req, res) => {
  const { month, year } = req.query;
  const period = `${year}-${(month || '').padStart(2, '0')}`;
  const rows = query(`
    SELECT u.id, u.name, u.staff_type, u.department,
      COUNT(CASE WHEN a.status='present' THEN 1 END) as present,
      COUNT(CASE WHEN a.status='late' THEN 1 END) as late,
      COUNT(CASE WHEN a.status='half-day' THEN 1 END) as halfday,
      COUNT(CASE WHEN a.status='absent' THEN 1 END) as absent,
      COUNT(a.id) as total_days
    FROM users u
    LEFT JOIN attendance a ON u.id=a.user_id AND strftime("%Y-%m", a.date)=?
    WHERE u.role='staff' AND u.active=1
    GROUP BY u.id ORDER BY u.name
  `, [period]);
  res.json(rows);
});

// ─── LEAVE ROUTES ─────────────────────────────────────────────────────────────
app.post('/api/leaves', auth, (req, res) => {
  const { date, type, reason } = req.body;
  if (!date || !type) return res.status(400).json({ error: 'Date and type required' });
  const existing = query('SELECT * FROM leaves WHERE user_id=? AND date=?', [req.user.id, date]);
  if (existing.length) return res.status(400).json({ error: 'Leave already submitted for this date' });
  run('INSERT INTO leaves (user_id,date,type,reason) VALUES (?,?,?,?)', [req.user.id, date, type, reason || '']);
  res.json({ message: 'Leave submitted' });
});

app.get('/api/leaves', auth, (req, res) => {
  if (req.user.role === 'admin') {
    const rows = query(`
      SELECT l.*, u.name, u.department FROM leaves l JOIN users u ON l.user_id=u.id
      ORDER BY l.created_at DESC
    `);
    return res.json(rows);
  }
  const rows = query('SELECT * FROM leaves WHERE user_id=? ORDER BY date DESC', [req.user.id]);
  res.json(rows);
});

app.put('/api/leaves/:id', auth, adminOnly, (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  run('UPDATE leaves SET status=?,reviewed_by=?,reviewed_at=datetime("now") WHERE id=?',
    [status, req.user.id, req.params.id]);

  if (status === 'approved') {
    const leave = query('SELECT * FROM leaves WHERE id=?', [req.params.id])[0];
    const existing = query('SELECT * FROM attendance WHERE user_id=? AND date=?', [leave.user_id, leave.date]);
    if (!existing.length) {
      run('INSERT INTO attendance (user_id,date,status,notes) VALUES (?,?,?,?)',
        [leave.user_id, leave.date, 'absent', `Leave: ${leave.type}`]);
    }
  }
  res.json({ message: `Leave ${status}` });
});

// ─── DASHBOARD STATS ──────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, adminOnly, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const present = query("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status IN ('present','late')", [today])[0].c;
  const late = query("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='late'", [today])[0].c;
  const absent = query("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='absent'", [today])[0].c;
  const totalStaff = query("SELECT COUNT(*) as c FROM users WHERE role='staff' AND active=1")[0].c;
  const pendingLeaves = query("SELECT COUNT(*) as c FROM leaves WHERE status='pending'")[0].c;
  res.json({ present, late, absent, totalStaff, pendingLeaves, date: today });
});

// ─── START ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(3000, () => console.log('🚀 Server running at http://localhost:3000'));
});
