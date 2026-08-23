const Admin = (() => {
  let state = { url: '', key: '', token: '', user: null, categories: [] };

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  function loading(show, text) {
    document.getElementById('loading').classList.toggle('hidden', !show);
    if (text) document.getElementById('loadingText').textContent = text;
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json', 'X-Access-Key': state.key }, opts.headers || {});
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    const res = await fetch(state.url + '/api/' + path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'خطای ناشناخته');
    return data;
  }

  function saveConnection() {
    const raw = document.getElementById('connectionCodeInput').value.trim();
    try {
      const decoded = JSON.parse(atob(raw));
      if (!decoded.url || !decoded.key) throw new Error();
      state.url = decoded.url;
      state.key = decoded.key;
      localStorage.setItem('conn_url', state.url);
      localStorage.setItem('conn_key', state.key);
      document.getElementById('connectError').textContent = '';
      showScreen('login');
    } catch (e) {
      document.getElementById('connectError').textContent = 'کد اتصال نامعتبر است.';
    }
  }

  function resetConnection() {
    localStorage.removeItem('conn_url');
    localStorage.removeItem('conn_key');
    localStorage.removeItem('session_token');
    state = { url: '', key: '', token: '', user: null, categories: [] };
    showScreen('connect');
  }

  async function login() {
    const personnel_code = document.getElementById('loginPersonnel').value.trim();
    const national_code = document.getElementById('loginNational').value.trim();
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    loading(true, 'در حال ورود…');
    try {
      const data = await api('login.php', { method: 'POST', body: JSON.stringify({ personnel_code, national_code }) });
      if (!data.user.is_admin) throw new Error('این حساب دسترسی مدیریتی ندارد.');
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('session_token', state.token);
      await enterApp();
    } catch (e) {
      errEl.textContent = e.message;
    } finally {
      loading(false);
    }
  }

  function logout() {
    localStorage.removeItem('session_token');
    state.token = ''; state.user = null;
    showScreen('login');
  }

  function toggleTheme() {
    const root = document.getElementById('htmlRoot');
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  function showScreen(name) {
    ['connect', 'login', 'main'].forEach(s => document.getElementById('screen-' + s).classList.toggle('hidden', s !== name));
  }

  async function enterApp() {
    showScreen('main');
    try {
      const s = await api('settings.php');
      const name = s.settings.app_name || 'پنل مدیریت';
      document.getElementById('mainBrand').textContent = name;
      document.title = name;
    } catch (e) {}
    await loadCategories();
    showTab('categories');
  }

  async function loadCategories() {
    const data = await api('categories.php');
    state.categories = data.categories;
  }

  function catOptions(selected) {
    return state.categories.map(c => `<option value="${c.id}" ${c.id == selected ? 'selected' : ''}>${c.parent_id ? '↳ ' : ''}${escapeHtml(c.name)}</option>`).join('');
  }

  function escapeHtml(s) { return (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // ---------------- تب دسته‌بندی‌ها ----------------
  async function renderCategories() {
    const el = document.getElementById('tabContent');
    el.innerHTML = `
      <div class="card">
        <h2>افزودن دسته‌بندی</h2>
        <label>نام</label><input type="text" id="catName">
        <label>زیرمجموعهٔ (اختیاری)</label>
        <select id="catParent"><option value="">بدون والد</option>${catOptions()}</select>
        <button class="btn" style="margin-top:12px" onclick="Admin.addCategory()">افزودن</button>
      </div>
      <div class="card"><h2>فهرست</h2><table id="catTable"></table></div>`;
    document.getElementById('catParent').innerHTML = '<option value="">بدون والد</option>' + catOptions();
    fillCatTable();
  }
  function fillCatTable() {
    const roots = state.categories.filter(c => !c.parent_id);
    const childrenOf = id => state.categories.filter(c => c.parent_id == id);
    let rows = '';
    roots.forEach(r => {
      rows += `<tr><td><b>${escapeHtml(r.name)}</b></td><td style="width:50px"><button class="btn danger" style="padding:5px 9px;font-size:11px" onclick="Admin.deleteCategory(${r.id})">حذف</button></td></tr>`;
      childrenOf(r.id).forEach(c => {
        rows += `<tr><td style="padding-right:22px;color:var(--muted)">↳ ${escapeHtml(c.name)}</td><td><button class="btn danger" style="padding:5px 9px;font-size:11px" onclick="Admin.deleteCategory(${c.id})">حذف</button></td></tr>`;
      });
    });
    document.getElementById('catTable').innerHTML = rows || '<tr><td class="note">دسته‌بندی‌ای ثبت نشده.</td></tr>';
  }
  async function addCategory() {
    const name = document.getElementById('catName').value.trim();
    const parent_id = document.getElementById('catParent').value || null;
    if (!name) return;
    loading(true);
    try { await api('categories.php', { method: 'POST', body: JSON.stringify({ name, parent_id }) }); await loadCategories(); renderCategories(); toast('اضافه شد.'); }
    catch (e) { toast(e.message); } finally { loading(false); }
  }
  async function deleteCategory(id) {
    if (!confirm('حذف شود؟')) return;
    loading(true);
    try { await api('categories.php?id=' + id, { method: 'DELETE' }); await loadCategories(); renderCategories(); }
    catch (e) { toast(e.message); } finally { loading(false); }
  }

  // ---------------- تب مطالب ----------------
  let pendingAttachments = [];
  async function renderTopics() {
    pendingAttachments = [];
    const el = document.getElementById('tabContent');
    el.innerHTML = `
      <div class="card">
        <h2>افزودن مطلب جدید</h2>
        <label>عنوان</label><input type="text" id="topicTitle">
        <label>دسته‌بندی</label><select id="topicCategory">${catOptions()}</select>
        <label>فایل Word (.docx)</label>
        <input type="file" id="docxInput" accept=".docx">
        <div id="docxStatus" class="note"></div>
        <textarea id="topicContent" rows="6" placeholder="متن استخراج‌شده اینجا نمایش داده می‌شود…"></textarea>
        <label>خلاصه (اختیاری)</label>
        <textarea id="topicSummary" rows="2"></textarea>
        <label>پیوست تصویر یا PDF</label>
        <input type="file" id="attachInput" accept="image/*,.pdf" multiple>
        <button class="btn" style="margin-top:12px" onclick="Admin.saveTopic()">ذخیره مطلب</button>
      </div>
      <div class="card">
        <h2>جست‌وجو</h2>
        <input type="text" id="topicSearch" placeholder="عبارت جست‌وجو…" onkeyup="if(event.key==='Enter')Admin.searchTopics()">
        <button class="btn secondary" style="margin-top:8px" onclick="Admin.searchTopics()">جست‌وجو</button>
      </div>
      <div class="card"><h2>فهرست مطالب</h2><table id="topicTable"></table></div>`;

    document.getElementById('docxInput').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      document.getElementById('docxStatus').textContent = 'در حال خواندن فایل…';
      const reader = new FileReader();
      reader.onload = () => mammoth.extractRawText({ arrayBuffer: reader.result }).then(r => {
        document.getElementById('topicContent').value = r.value;
        document.getElementById('docxStatus').textContent = '✓ متن استخراج شد (' + file.name + ')';
      }).catch(() => document.getElementById('docxStatus').textContent = 'خطا در خواندن فایل.');
      reader.readAsArrayBuffer(file);
    });
    document.getElementById('attachInput').addEventListener('change', e => {
      pendingAttachments = [];
      [...e.target.files].forEach(f => {
        const reader = new FileReader();
        reader.onload = () => pendingAttachments.push({ type: f.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image', name: f.name, data: reader.result });
        reader.readAsDataURL(f);
      });
    });

    await searchTopics();
  }
  async function searchTopics() {
    const q = document.getElementById('topicSearch') ? document.getElementById('topicSearch').value.trim() : '';
    loading(true);
    try {
      const data = await api('topics.php' + (q ? '?q=' + encodeURIComponent(q) : ''));
      const rows = data.topics.map(t => {
        const cat = state.categories.find(c => c.id == t.category_id);
        return `<tr><td><b>${escapeHtml(t.title)}</b><div class="note" style="margin:0">${escapeHtml(t.summary || '')}</div></td>
          <td><span class="pill">${cat ? escapeHtml(cat.name) : ''}</span></td>
          <td style="width:50px"><button class="btn danger" style="padding:5px 9px;font-size:11px" onclick="Admin.deleteTopic(${t.id})">حذف</button></td></tr>`;
      }).join('');
      document.getElementById('topicTable').innerHTML = rows || '<tr><td class="note">موردی یافت نشد.</td></tr>';
    } finally { loading(false); }
  }
  async function saveTopic() {
    const title = document.getElementById('topicTitle').value.trim();
    const category_id = document.getElementById('topicCategory').value;
    const content = document.getElementById('topicContent').value.trim();
    const summary = document.getElementById('topicSummary').value.trim();
    if (!title || !category_id || !content) { toast('عنوان، دسته‌بندی و متن الزامی است.'); return; }
    loading(true, 'در حال ذخیره…');
    try {
      await api('topics.php', { method: 'POST', body: JSON.stringify({ title, category_id, content, summary, attachments: pendingAttachments }) });
      toast('مطلب ذخیره شد.');
      renderTopics();
    } catch (e) { toast(e.message); } finally { loading(false); }
  }
  async function deleteTopic(id) {
    if (!confirm('حذف شود؟')) return;
    loading(true);
    try { await api('topics.php?id=' + id, { method: 'DELETE' }); searchTopics(); } catch (e) { toast(e.message); } finally { loading(false); }
  }

  // ---------------- تب کاربران ----------------
  let bulkRows = [];
  async function renderUsers() {
    bulkRows = [];
    const el = document.getElementById('tabContent');
    el.innerHTML = `
      <div class="card">
        <h2>افزودن کاربر تکی</h2>
        <label>نام</label><input type="text" id="uFirst">
        <label>نام خانوادگی</label><input type="text" id="uLast">
        <label>کد پرسنلی</label><input type="text" id="uPersonnel">
        <label>کد ملی</label><input type="text" id="uNational">
        <label>دسترسی به دسته‌بندی‌ها</label>
        <div id="uCats" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">${state.categories.map(c => `<span class="pill" data-id="${c.id}" onclick="Admin.toggleCatPill(this)">${escapeHtml(c.name)}</span>`).join('')}</div>
        <button class="btn" onclick="Admin.addUser()">افزودن</button>
      </div>
      <div class="card">
        <h2>ایمپورت دسته‌ای از اکسل</h2>
        <p class="note">ستون‌ها: نام، نام‌خانوادگی، کد پرسنلی، کد ملی، دسته‌بندی‌های مجاز (با کاما جدا؛ نام دقیق دسته‌بندی).</p>
        <input type="file" id="excelInput" accept=".xlsx,.xls">
        <div id="excelStatus" class="note"></div>
        <button class="btn secondary hidden" id="bulkBtn" onclick="Admin.submitBulk()" style="margin-top:8px">تأیید و ایمپورت</button>
      </div>
      <div class="card"><h2>فهرست کاربران</h2><table id="userTable"></table></div>`;

    document.getElementById('excelInput').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      document.getElementById('excelStatus').textContent = 'در حال خواندن فایل…';
      const reader = new FileReader();
      reader.onload = () => {
        const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        bulkRows = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i]; if (!r || !r[0]) continue;
          bulkRows.push({ first_name: String(r[0] || ''), last_name: String(r[1] || ''), personnel_code: String(r[2] || ''), national_code: String(r[3] || ''), categories: String(r[4] || '') });
        }
        document.getElementById('excelStatus').textContent = bulkRows.length + ' کاربر شناسایی شد.';
        document.getElementById('bulkBtn').classList.remove('hidden');
      };
      reader.readAsArrayBuffer(file);
    });

    await loadUsers();
  }
  function toggleCatPill(el) { el.classList.toggle('active'); }
  async function loadUsers() {
    const data = await api('users.php');
    const rows = data.users.map(u => {
      const names = u.category_ids.map(id => { const c = state.categories.find(x => x.id == id); return c ? c.name : ''; }).filter(Boolean);
      return `<tr><td><b>${escapeHtml(u.first_name + ' ' + u.last_name)}</b><div class="note" style="margin:0">کد پرسنلی: ${escapeHtml(u.personnel_code)}</div></td>
        <td>${names.map(n => `<span class="pill">${escapeHtml(n)}</span>`).join(' ')}</td>
        <td style="width:50px"><button class="btn danger" style="padding:5px 9px;font-size:11px" onclick="Admin.deleteUser(${u.id})">حذف</button></td></tr>`;
    }).join('');
    document.getElementById('userTable').innerHTML = rows || '<tr><td class="note">کاربری ثبت نشده.</td></tr>';
  }
  async function addUser() {
    const first_name = document.getElementById('uFirst').value.trim();
    const last_name = document.getElementById('uLast').value.trim();
    const personnel_code = document.getElementById('uPersonnel').value.trim();
    const national_code = document.getElementById('uNational').value.trim();
    const category_ids = [...document.querySelectorAll('#uCats .pill.active')].map(p => p.dataset.id);
    if (!first_name || !personnel_code || !national_code) { toast('نام، کد پرسنلی و کد ملی الزامی است.'); return; }
    loading(true);
    try { await api('users.php', { method: 'POST', body: JSON.stringify({ first_name, last_name, personnel_code, national_code, category_ids }) }); toast('کاربر اضافه شد.'); renderUsers(); }
    catch (e) { toast(e.message); } finally { loading(false); }
  }
  async function submitBulk() {
    loading(true, 'در حال ایمپورت…');
    try { const r = await api('users.php', { method: 'POST', body: JSON.stringify({ bulk: bulkRows }) }); toast(r.added + ' کاربر ایمپورت شد.'); renderUsers(); }
    catch (e) { toast(e.message); } finally { loading(false); }
  }
  async function deleteUser(id) {
    if (!confirm('حذف شود؟')) return;
    loading(true);
    try { await api('users.php?id=' + id, { method: 'DELETE' }); loadUsers(); } catch (e) { toast(e.message); } finally { loading(false); }
  }

  // ---------------- تب تنظیمات ----------------
  async function renderSettings() {
    const el = document.getElementById('tabContent');
    const s = await api('settings.php');
    el.innerHTML = `
      <div class="card">
        <h2>مشخصات برنامه</h2>
        <label>نام برنامه</label><input type="text" id="setAppName" value="${escapeHtml(s.settings.app_name || '')}">
        <label>حالت پیش‌فرض نمایش</label>
        <select id="setTheme"><option value="light" ${s.settings.theme_default!=='dark'?'selected':''}>روز</option><option value="dark" ${s.settings.theme_default==='dark'?'selected':''}>شب</option></select>
        <button class="btn" style="margin-top:12px" onclick="Admin.saveSettings()">ذخیره</button>
      </div>
      <div class="card">
        <h2>کد اتصال سیستم</h2>
        <p class="note">ساخت کد جدید، کد فعلی را در همهٔ اپ‌های متصل غیرفعال می‌کند و باید دوباره در همه وارد شود.</p>
        <div id="newCodeBox"></div>
        <button class="btn secondary" onclick="Admin.regenerateKey()">ساخت کد اتصال جدید</button>
      </div>`;
  }
  async function saveSettings() {
    const app_name = document.getElementById('setAppName').value.trim();
    const theme_default = document.getElementById('setTheme').value;
    loading(true);
    try { await api('settings.php', { method: 'POST', body: JSON.stringify({ app_name, theme_default }) }); document.getElementById('mainBrand').textContent = app_name; toast('ذخیره شد.'); }
    catch (e) { toast(e.message); } finally { loading(false); }
  }
  async function regenerateKey() {
    if (!confirm('کد قبلی غیرفعال می‌شود. ادامه می‌دهید؟')) return;
    loading(true);
    try {
      const r = await api('regenerate_key.php', { method: 'POST' });
      document.getElementById('newCodeBox').innerHTML = `<div class="codebox" style="margin-bottom:10px">${escapeHtml(r.connection_code)}</div>`;
      state.key = r.access_key;
      localStorage.setItem('conn_key', state.key);
      toast('کد جدید ساخته شد.');
    } catch (e) { toast(e.message); } finally { loading(false); }
  }

  function showTab(name) {
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    ({ categories: renderCategories, topics: renderTopics, users: renderUsers, settings: renderSettings })[name]();
  }

  async function init() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) document.getElementById('htmlRoot').setAttribute('data-theme', savedTheme);

    state.url = localStorage.getItem('conn_url') || '';
    state.key = localStorage.getItem('conn_key') || '';
    state.token = localStorage.getItem('session_token') || '';

    if (!state.url || !state.key) { showScreen('connect'); return; }

    if (state.token) {
      loading(true, 'در حال اتصال…');
      try { await loadCategories(); await enterApp(); }
      catch (e) { localStorage.removeItem('session_token'); showScreen('login'); }
      finally { loading(false); }
    } else {
      showScreen('login');
    }
  }

  return { init, saveConnection, resetConnection, login, logout, toggleTheme, showTab,
    addCategory, deleteCategory, saveTopic, deleteTopic, searchTopics, toggleCatPill,
    addUser, submitBulk, deleteUser, saveSettings, regenerateKey };
})();

window.addEventListener('DOMContentLoaded', Admin.init);
