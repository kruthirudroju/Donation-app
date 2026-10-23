// Online Donation Management System - Express backend (JSON file storage)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const SECRET = process.env.JWT_SECRET || 'change-this-secret';
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// ---------- tiny JSON database ----------
function load() {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const db = { users: [], campaigns: [], donations: [], updates: [], seq: 1 };
    db.users.push({ id: 1, name: 'Admin', email: 'admin@demo.com', role: 'admin', hash: bcrypt.hashSync('admin123', 8) });
    db.seq = 2;
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
let db = load();
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const nextId = () => db.seq++;

// ---------- helpers ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const raised = id => db.donations.filter(d => d.campaignId === id).reduce((s, d) => s + d.amount, 0);
const view = c => ({ ...c, raised: raised(c.id), donors: db.donations.filter(d => d.campaignId === c.id).length,
  orgName: (db.users.find(u => u.id === c.orgId) || {}).name });

function auth(roles) {
  return (req, res, next) => {
    try {
      const t = (req.headers.authorization || '').replace('Bearer ', '');
      const u = jwt.verify(t, SECRET);
      if (roles && !roles.includes(u.role)) return res.status(403).json({ error: 'Not allowed for your role.' });
      req.user = u; next();
    } catch { res.status(401).json({ error: 'Please log in first.' }); }
  };
}
const token = u => jwt.sign({ id: u.id, name: u.name, role: u.role }, SECRET, { expiresIn: '8h' });

// ---------- auth ----------
app.post('/api/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required.' });
  if (!['donor', 'organization'].includes(role)) return res.status(400).json({ error: 'Choose donor or organization.' });
  if (db.users.some(u => u.email === email.toLowerCase())) return res.status(409).json({ error: 'That email is already registered.' });
  const u = { id: nextId(), name, email: email.toLowerCase(), role, hash: bcrypt.hashSync(password, 8) };
  db.users.push(u); save();
  res.json({ token: token(u), user: { id: u.id, name, role } });
});
app.post('/api/login', (req, res) => {
  const u = db.users.find(x => x.email === String(req.body.email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(req.body.password || '', u.hash)) return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: token(u), user: { id: u.id, name: u.name, role: u.role } });
});

// ---------- public ----------
app.get('/api/stats', (req, res) => res.json({
  totalRaised: db.donations.reduce((s, d) => s + d.amount, 0),
  donations: db.donations.length,
  campaigns: db.campaigns.filter(c => c.status === 'approved').length,
  organizations: db.users.filter(u => u.role === 'organization').length
}));
app.get('/api/campaigns', (req, res) => {
  const q = (req.query.q || '').toLowerCase(), cat = req.query.category;
  res.json(db.campaigns.filter(c => c.status === 'approved' && (!cat || c.category === cat) &&
    (!q || (c.title + c.description).toLowerCase().includes(q))).map(view).reverse());
});
app.get('/api/campaigns/:id', (req, res) => {
  const c = db.campaigns.find(x => x.id == req.params.id && x.status === 'approved');
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });
  const donors = db.donations.filter(d => d.campaignId === c.id).reverse().slice(0, 20).map(d => ({
    name: d.anonymous ? 'Anonymous' : d.donorName, amount: d.amount, message: d.message, date: d.date }));
  res.json({ ...view(c), donors, updates: db.updates.filter(u => u.campaignId === c.id).reverse() });
});

// ---------- donor ----------
app.post('/api/donations', auth(['donor']), (req, res) => {
  const amount = Number(req.body.amount);
  const c = db.campaigns.find(x => x.id == req.body.campaignId && x.status === 'approved');
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });
  if (!(amount >= 1)) return res.status(400).json({ error: 'Enter an amount of at least 1.' });
  const d = { id: nextId(), receipt: 'RCPT-' + Date.now().toString(36).toUpperCase(), campaignId: c.id,
    donorId: req.user.id, donorName: req.user.name, amount, anonymous: !!req.body.anonymous,
    message: (req.body.message || '').slice(0, 200), date: new Date().toISOString() };
  db.donations.push(d); save(); res.json(d);
});
app.get('/api/my/donations', auth(['donor']), (req, res) =>
  res.json(db.donations.filter(d => d.donorId === req.user.id).reverse()
    .map(d => ({ ...d, campaign: (db.campaigns.find(c => c.id === d.campaignId) || {}).title }))));

// ---------- organization ----------
app.post('/api/campaigns', auth(['organization']), (req, res) => {
  const { title, description, goal, category } = req.body;
  if (!title || !description || !(Number(goal) > 0)) return res.status(400).json({ error: 'Title, description and a goal above 0 are required.' });
  const c = { id: nextId(), orgId: req.user.id, title, description, goal: Number(goal), category: category || 'Other',
    status: 'pending', created: new Date().toISOString() };
  db.campaigns.push(c); save(); res.json(c);
});
app.get('/api/my/campaigns', auth(['organization']), (req, res) =>
  res.json(db.campaigns.filter(c => c.orgId === req.user.id).map(view).reverse()));
app.post('/api/campaigns/:id/updates', auth(['organization']), (req, res) => {
  const c = db.campaigns.find(x => x.id == req.params.id && x.orgId === req.user.id);
  if (!c) return res.status(404).json({ error: 'Campaign not found.' });
  if (!req.body.text) return res.status(400).json({ error: 'Write the update first.' });
  const u = { id: nextId(), campaignId: c.id, text: req.body.text, date: new Date().toISOString() };
  db.updates.push(u); save(); res.json(u);
});

// ---------- admin ----------
app.get('/api/admin/campaigns', auth(['admin']), (req, res) => res.json(db.campaigns.map(view).reverse()));
app.post('/api/admin/campaigns/:id/:action', auth(['admin']), (req, res) => {
  const c = db.campaigns.find(x => x.id == req.params.id);
  if (!c || !['approve', 'reject'].includes(req.params.action)) return res.status(404).json({ error: 'Not found.' });
  c.status = req.params.action === 'approve' ? 'approved' : 'rejected'; save(); res.json(c);
});
app.get('/api/admin/report', auth(['admin']), (req, res) => res.json({
  users: db.users.length,
  byCampaign: db.campaigns.map(c => ({ id: c.id, title: c.title, status: c.status, goal: c.goal, raised: raised(c.id) })),
  recent: db.donations.slice(-10).reverse().map(d => ({ receipt: d.receipt, amount: d.amount, donor: d.donorName, date: d.date }))
}));

app.listen(PORT, () => console.log(`Donation app running at http://localhost:${PORT}`));
