const Admin = (() => {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
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

  async function saveConnection() {
    const raw = document.getElementById('connectionCodeInput').value.trim();
    const errEl = document.getElementById('connectError');
    errEl.textContent = '';
    let decoded;
    try {
      decoded = JSON.parse(atob(raw));
      if (!decoded.url || !decoded.key) throw new Error();
    } catch (e) {
      errEl.textContent = 'کد اتصال نامعتبر است — کامل و بدون فاصلهٔ اضافه کپی شده باشد.';
      return;
    }

    errEl.style.color = 'var(--muted)';
    errEl.textContent = 'در حال بررسی دسترسی به سرور…';

    // مرحله ۱: تست اتصال پایه (بدون هدر سفارشی، بدون کلید) — فقط می‌سنجد سرور اصلاً در دسترس است یا نه
    try {
      const res = await fetch(decoded.url + '/api/ping.php');
      if (!res.ok) throw new Error('server_error');
    } catch (e) {
      errEl.style.color = 'var(--danger)';
      errEl.textContent = 'اصلاً به این آدرس متصل نمی‌شویم — احتمالاً مشکل SSL/گواهی سرور یا اشتباه بودن آدرس دامنه است. آدرس API را در پنل بررسی کنید.';
      return;
    }

    // مرحله ۲: تست کلید اتصال (همراه هدر سفارشی — اگر اینجا شکست خورد ولی مرحله ۱ موفق بود، مشکل CORS/کلید است)
    state.url = decoded.url;
    state.key = decoded.key;
    try {
      await api('branding.php');
    } catch (e) {
      errEl.style.color = 'var(--danger)';
      errEl.textContent = 'سرور در دسترس است ولی درخواست همراه کلید رد شد — کد اتصال را دوباره از پنل بسازید و کامل پیست کنید. (جزئیات: ' + e.message + ')';
      return;
    }

    localStorage.setItem('conn_url', state.url);
    localStorage.setItem('conn_key', state.key);
    errEl.textContent = '';
    showScreen('login');
    applyBranding();
  }

  async function applyBranding() {
    try {
      const data = await api('branding.php');
      const b = data.branding;
      const root = document.getElementById('htmlRoot');
      root.style.setProperty('--gold', b.brand_primary);
      root.style.setProperty('--deep', b.brand_primary);
      root.style.setProperty('--gold-soft', b.brand_primary + 'cc');
      root.style.setProperty('--gold-tint', b.brand_primary + '1a');
      root.style.setProperty('--accent2', b.brand_secondary);
      root.style.setProperty('--success', b.brand_secondary);
      root.style.setProperty('--paper', b.brand_bg);
      root.style.setProperty('--card', b.brand_surface);
      root.style.setProperty('--ink', b.brand_text);
      root.style.setProperty('--danger', b.brand_danger);
      root.style.setProperty('--radius', (b.brand_radius || 18) + 'px');
      document.body.style.fontSize = { small: '13px', medium: '14px', large: '15.5px' }[b.font_size] || '14px';
      if (!localStorage.getItem('theme') && b.theme_default) root.setAttribute('data-theme', b.theme_default);

      ['brandTitle', 'loginBrand', 'mainBrand'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = b.app_name;
      });
      document.title = b.app_name;
      if (b.app_icon_url) {
        document.querySelectorAll('.logo-mark').forEach(el => {
          el.style.background = 'none';
          el.innerHTML = `<img src="${b.app_icon_url}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
        });
      }
    } catch (e) { /* برندینگ اختیاری است؛ خطا نباید مانع کار اپ شود */ }
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

  function decodeXmlEntities(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }
  async function extractFileText(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'docx') {
      const buf = await file.arrayBuffer();
      return (await mammoth.extractRawText({ arrayBuffer: buf })).value;
    }
    if (ext === 'pdf') {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(it => it.str).join(' ') + '\n\n';
      }
      return text.trim();
    }
    if (ext === 'pptx') {
      const zip = await JSZip.loadAsync(file);
      const slideNames = Object.keys(zip.files)
        .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => parseInt(a.match(/slide(\d+)/)[1]) - parseInt(b.match(/slide(\d+)/)[1]));
      let text = '';
      for (const name of slideNames) {
        const xml = await zip.files[name].async('string');
        const matches = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)];
        text += matches.map(m => decodeXmlEntities(m[1])).join(' ') + '\n\n';
      }
      return text.trim();
    }
    throw new Error('فرمت پشتیبانی نمی‌شود');
  }

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
        <label>فایل Word، PDF یا PowerPoint (.docx / .pdf / .pptx)</label>
        <input type="file" id="docxInput" accept=".docx,.pdf,.pptx">
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

    document.getElementById('docxInput').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      const statusEl = document.getElementById('docxStatus');
      statusEl.textContent = 'در حال خواندن فایل…';
      try {
        const text = await extractFileText(file);
        document.getElementById('topicContent').value = text;
        if (!document.getElementById('topicTitle').value) document.getElementById('topicTitle').value = file.name.replace(/\.[^.]+$/, '');
        statusEl.textContent = '✓ متن استخراج شد (' + file.name + ')';
      } catch (err) { statusEl.textContent = 'خطا در خواندن فایل: ' + err.message; }
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
      const lockBadge = u.is_locked ? ' <span class="pill" style="background:var(--danger);color:#fff">قفل‌شده</span>' : '';
      const reactivateBtn = u.is_locked ? `<button class="btn gold" style="padding:5px 9px;font-size:11px;margin-left:4px" onclick="Admin.reactivateUser(${u.id})">فعال‌سازی مجدد</button>` : '';
      return `<tr><td><b>${escapeHtml(u.first_name + ' ' + u.last_name)}</b>${lockBadge}<div class="note" style="margin:0">کد پرسنلی: ${escapeHtml(u.personnel_code)}</div></td>
        <td>${names.map(n => `<span class="pill">${escapeHtml(n)}</span>`).join(' ')}</td>
        <td style="width:100px">${reactivateBtn}<button class="btn danger" style="padding:5px 9px;font-size:11px" onclick="Admin.deleteUser(${u.id})">حذف</button></td></tr>`;
    }).join('');
    document.getElementById('userTable').innerHTML = rows || '<tr><td class="note">کاربری ثبت نشده.</td></tr>';
  }
  async function reactivateUser(id) {
    loading(true);
    try { await api('users.php', { method: 'POST', body: JSON.stringify({ reactivate_id: id }) }); toast('حساب فعال شد.'); loadUsers(); }
    catch (e) { toast(e.message); } finally { loading(false); }
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
    applyBranding();

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
    addUser, submitBulk, deleteUser, reactivateUser, saveSettings, regenerateKey };
})();

window.addEventListener('DOMContentLoaded', Admin.init);
