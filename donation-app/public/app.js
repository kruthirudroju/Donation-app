// Single-page frontend (vanilla JS, hash routing)
const $ = s => document.querySelector(s), app = $('#app');
let session = JSON.parse(localStorage.getItem('session') || 'null');
const money = n => '₹' + Number(n).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = c => Math.min(100, Math.round(c.raised / c.goal * 100));
const CATS = ['Education', 'Health', 'Environment', 'Disaster Relief', 'Community', 'Other'];

function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2800); }
async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json',
    ...(session ? { Authorization: 'Bearer ' + session.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json();
  if (!r.ok) { if (r.status === 401 && session) logout(true); throw new Error(d.error || 'Something went wrong.'); }
  return d;
}
function logout(silent) { session = null; localStorage.removeItem('session'); if (!silent) toast('Logged out.'); location.hash = '#/login'; renderNav(); }
function renderNav() {
  $('#nav').innerHTML = session
    ? `<a href="#/">Campaigns</a><a href="#/dashboard">${session.role === 'admin' ? 'Admin' : 'Dashboard'}</a><span class="meta">${esc(session.user.name)}</span><button class="ghost" id="lo">Log out</button>`
    : `<a href="#/">Campaigns</a><a href="#/login">Log in</a><a class="btn" href="#/register">Register</a>`;
  if (session) $('#lo').onclick = () => logout();
}
const form = (el, fn) => el.addEventListener('submit', async e => {
  e.preventDefault(); const err = el.querySelector('.err'); err.textContent = '';
  try { await fn(Object.fromEntries(new FormData(el)), el); } catch (x) { err.textContent = x.message; }
});

// ---------- views ----------
async function home() {
  const s = await api('/stats');
  app.innerHTML = `<section class="hero"><h1>Every rupee, in the open.</h1>
    <p>Donate to verified organizations and see exactly how much each campaign has raised and who has helped.</p>
    <div class="total">${money(s.totalRaised)}</div><div class="stats">
    <span><b>${s.donations}</b>donations</span><span><b>${s.campaigns}</b>live campaigns</span><span><b>${s.organizations}</b>organizations</span></div></section>
    <div class="filters"><input id="q" placeholder="Search campaigns" aria-label="Search campaigns"><select id="cat" aria-label="Category"><option value="">All categories</option>${CATS.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div id="list" class="grid" style="margin-top:1rem"></div>`;
  const load = async () => {
    const l = await api(`/campaigns?q=${encodeURIComponent($('#q').value)}&category=${encodeURIComponent($('#cat').value)}`);
    $('#list').innerHTML = l.length ? l.map(c => `<article class="card"><span class="meta">${esc(c.category)} · by ${esc(c.orgName)}</span>
      <h3>${esc(c.title)}</h3><div class="bar"><i style="width:${pct(c)}%"></i></div>
      <div class="meta">${money(c.raised)} of ${money(c.goal)} (${pct(c)}%) · ${c.donors} donors</div>
      <a class="btn" href="#/campaign/${c.id}">View and donate</a></article>`).join('')
      : '<p>No campaigns match yet. Try a different search.</p>';
  };
  $('#q').oninput = load; $('#cat').onchange = load; load();
}
async function campaign(id) {
  const c = await api('/campaigns/' + id);
  const canDonate = session && session.user.role === 'donor';
  app.innerHTML = `<div class="two"><div><span class="meta">${esc(c.category)} · by ${esc(c.orgName)}</span><h1>${esc(c.title)}</h1>
    <p>${esc(c.description)}</p><div class="bar"><i style="width:${pct(c)}%"></i></div>
    <p><b>${money(c.raised)}</b> raised of ${money(c.goal)} goal (${pct(c)}%) · ${c.donors} donors</p>
    <h2>Updates</h2>${c.updates.map(u => `<div class="panel"><div class="meta">${new Date(u.date).toLocaleDateString()}</div>${esc(u.text)}</div>`).join('') || '<p class="meta">No updates yet.</p>'}
    <h2>Recent donors</h2><table><tr><th>Donor</th><th>Amount</th><th>Message</th></tr>
    ${c.donors.map(d => `<tr><td>${esc(d.name)}</td><td>${money(d.amount)}</td><td>${esc(d.message)}</td></tr>`).join('') || '<tr><td colspan="3">Be the first to donate.</td></tr>'}</table></div>
    <aside class="panel"><h2>Donate</h2>${canDonate ? `<form id="f"><label>Amount (₹)<input name="amount" type="number" min="1" required></label>
      <label>Message (optional)<textarea name="message" rows="2" maxlength="200"></textarea></label>
      <label class="check"><input type="checkbox" name="anonymous"> Hide my name</label><p class="err"></p><button>Donate now</button></form>`
      : `<p>${session ? 'Only donor accounts can donate.' : '<a href="#/login">Log in</a> or <a href="#/register">register</a> as a donor to give.'}</p>`}</aside></div>`;
  if (canDonate) form($('#f'), async d => {
    const r = await api('/donations', 'POST', { campaignId: c.id, amount: d.amount, message: d.message, anonymous: !!d.anonymous });
    toast('Donated. Receipt ' + r.receipt); campaign(id);
  });
}
function authView(mode) {
  const reg = mode === 'register';
  app.innerHTML = `<form id="f" class="panel narrow"><h2>${reg ? 'Create account' : 'Log in'}</h2>
    ${reg ? `<label>Name<input name="name" required></label>` : ''}<label>Email<input name="email" type="email" required></label>
    <label>Password<input name="password" type="password" minlength="6" required></label>
    ${reg ? `<label>I am a<select name="role"><option value="donor">Donor</option><option value="organization">Organization</option></select></label>` : '<p class="meta">Demo admin: admin@demo.com / admin123</p>'}
    <p class="err"></p><button>${reg ? 'Register' : 'Log in'}</button></form>`;
  form($('#f'), async d => {
    const r = await api(reg ? '/register' : '/login', 'POST', d);
    session = { token: r.token, user: r.user, role: r.user.role }; localStorage.setItem('session', JSON.stringify(session));
    renderNav(); location.hash = '#/dashboard';
  });
}
async function dashboard() {
  if (!session) return (location.hash = '#/login');
  const role = session.user.role;
  if (role === 'donor') {
    const l = await api('/my/donations');
    app.innerHTML = `<h1>My donations</h1><div class="panel"><table><tr><th>Receipt</th><th>Campaign</th><th>Amount</th><th>Date</th></tr>
      ${l.map(d => `<tr><td>${d.receipt}</td><td>${esc(d.campaign)}</td><td>${money(d.amount)}</td><td>${new Date(d.date).toLocaleDateString()}</td></tr>`).join('') || '<tr><td colspan="4">No donations yet. <a href="#/">Browse campaigns</a>.</td></tr>'}</table>
      <p><b>Total given: ${money(l.reduce((s, d) => s + d.amount, 0))}</b></p></div>`;
  } else if (role === 'organization') {
    const l = await api('/my/campaigns');
    app.innerHTML = `<h1>My campaigns</h1><form id="f" class="panel"><h2>New campaign</h2><label>Title<input name="title" required></label>
      <label>Description<textarea name="description" rows="3" required></textarea></label><label>Goal (₹)<input name="goal" type="number" min="1" required></label>
      <label>Category<select name="category">${CATS.map(c => `<option>${c}</option>`).join('')}</select></label>
      <p class="err"></p><button>Submit for approval</button></form>
      ${l.map(c => `<div class="panel"><h3>${esc(c.title)} <span class="tag ${c.status}">${c.status}</span></h3>
      <p class="meta">${money(c.raised)} of ${money(c.goal)} · ${c.donors} donors</p>
      ${c.status === 'approved' ? `<form class="up" data-id="${c.id}"><input name="text" placeholder="Post an update on how funds are used" required><p class="err"></p><button>Post update</button></form>` : ''}</div>`).join('')}`;
    form($('#f'), async d => { await api('/campaigns', 'POST', d); toast('Submitted for approval.'); dashboard(); });
    document.querySelectorAll('.up').forEach(f => form(f, async d => { await api(`/campaigns/${f.dataset.id}/updates`, 'POST', d); toast('Update posted.'); dashboard(); }));
  } else {
    const [l, r] = await Promise.all([api('/admin/campaigns'), api('/admin/report')]);
    app.innerHTML = `<h1>Admin</h1><div class="stats"><span><b>${r.users}</b>users</span><span><b>${l.length}</b>campaigns</span></div>
      <div class="panel"><h2>Campaigns</h2><table><tr><th>Title</th><th>Organization</th><th>Status</th><th>Raised</th><th></th></tr>
      ${l.map(c => `<tr><td>${esc(c.title)}</td><td>${esc(c.orgName)}</td><td><span class="tag ${c.status}">${c.status}</span></td><td>${money(c.raised)} / ${money(c.goal)}</td>
      <td>${c.status === 'pending' ? `<button data-a="approve" data-id="${c.id}">Approve</button> <button class="danger" data-a="reject" data-id="${c.id}">Reject</button>` : ''}</td></tr>`).join('')}</table></div>
      <div class="panel"><h2>Recent donations</h2><table><tr><th>Receipt</th><th>Donor</th><th>Amount</th></tr>
      ${r.recent.map(d => `<tr><td>${d.receipt}</td><td>${esc(d.donor)}</td><td>${money(d.amount)}</td></tr>`).join('') || '<tr><td colspan="3">No donations yet.</td></tr>'}</table></div>`;
    app.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { await api(`/admin/campaigns/${b.dataset.id}/${b.dataset.a}`, 'POST'); dashboard(); });
  }
}

// ---------- router ----------
async function route() {
  renderNav();
  const [, page, id] = location.hash.split('/');
  try {
    if (page === 'campaign') await campaign(id);
    else if (page === 'login' || page === 'register') authView(page);
    else if (page === 'dashboard') await dashboard();
    else await home();
  } catch (e) { app.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
addEventListener('hashchange', route); route();
