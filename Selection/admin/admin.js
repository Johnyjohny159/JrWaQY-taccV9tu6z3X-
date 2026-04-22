/* ─── Config (filled in at login) ───────────────────────── */
let GH_OWNER = '';
let GH_REPO  = '';
let GH_PAT   = '';
const MENU_PATH = 'Selection/data/menu.json';
const IMG_PATH  = 'Selection/images/';

/* ─── State ──────────────────────────────────────────────── */
let menuData   = { items: [], toppings: [] };
let fileSHA    = '';
let dirty      = false;
let editingId  = null;
let editingToppingId = null;
let pendingImages = {}; // { imagePath: base64 }
let currentView  = 'items';
let deleteTarget = null; // { type: 'item'|'topping', id }

/* ─── GitHub API helpers ─────────────────────────────────── */
function ghHeaders() {
  return {
    Authorization: `Bearer ${GH_PAT}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function ghGet(path) {
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
    headers: ghHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function ghPut(path, content, sha, message) {
  const body = { message, content: btoa(unescape(encodeURIComponent(content))) };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub write error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function ghPutBinary(path, base64Content, sha, message) {
  const body = { message, content: base64Content };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Image upload error ${res.status}: ${await res.text()}`);
  return res.json();
}

/* ─── Login ──────────────────────────────────────────────── */
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  err.classList.add('hidden');
  btn.textContent = 'Connecting…';
  btn.disabled = true;

  GH_OWNER = document.getElementById('gh-owner').value.trim();
  GH_REPO  = document.getElementById('gh-repo').value.trim();
  GH_PAT   = document.getElementById('gh-pat').value.trim();

  try {
    const file = await ghGet(MENU_PATH);
    fileSHA    = file.sha;
    menuData   = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, '')))));
    showDashboard();
  } catch (err2) {
    err.textContent = `Connection failed: ${err2.message}`;
    err.classList.remove('hidden');
    btn.textContent = 'Connect';
    btn.disabled = false;
  }
});

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  renderItems();
}

/* ─── Sidebar nav ────────────────────────────────────────── */
document.querySelectorAll('.sidebar-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-btn[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    document.getElementById('items-view').classList.toggle('hidden', currentView !== 'items');
    document.getElementById('toppings-view').classList.toggle('hidden', currentView !== 'toppings');
    document.getElementById('dash-title').textContent = currentView === 'items' ? 'Menu Items' : 'Toppings';
    document.getElementById('add-item-btn').textContent = currentView === 'items' ? '+ Add Item' : '+ Add Topping';
    document.getElementById('admin-cat-filter').style.display = currentView === 'items' ? '' : 'none';
    if (currentView === 'toppings') renderToppings();
  });
});

document.getElementById('add-item-btn').addEventListener('click', () => {
  if (currentView === 'toppings') openToppingModal(null);
  else openItemModal(null);
});

document.getElementById('logout-btn').addEventListener('click', () => {
  GH_PAT = ''; GH_OWNER = ''; GH_REPO = '';
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('gh-pat').value = '';
});

/* ─── Item table ─────────────────────────────────────────── */
function renderItems() {
  const q   = document.getElementById('admin-search').value.toLowerCase();
  const cat = document.getElementById('admin-cat-filter').value;
  const tbody = document.getElementById('items-tbody');
  tbody.innerHTML = '';

  const items = menuData.items.filter(i => {
    const textOk = !q || i.title.toLowerCase().includes(q);
    const catOk  = !cat || i.category === cat;
    return textOk && catOk;
  });

  document.getElementById('dash-subtitle').textContent = `${items.length} of ${menuData.items.length} items`;

  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="thumb" id="thumb-${item.id}">📷</div></td>
      <td><strong>${item.title}</strong></td>
      <td>${item.category}</td>
      <td><span class="badge-sm badge-${item.dietary.toLowerCase().replace(' ','-')}">${item.dietary}</span></td>
      <td>€${item.price}</td>
      <td><span class="avail-dot ${item.available ? 'on' : 'off'}"></span></td>
      <td class="action-btns">
        <button class="btn-edit" data-id="${item.id}">Edit</button>
        <button class="btn-del"  data-id="${item.id}">Delete</button>
      </td>
    `;
    // lazy-load thumb
    const thumb = tr.querySelector(`#thumb-${item.id}`);
    if (item.image) {
      const img = document.createElement('img');
      img.src = `../${item.image}`;
      img.onerror = () => {};
      thumb.innerHTML = '';
      thumb.appendChild(img);
    }
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', () => openItemModal(b.dataset.id)));
  tbody.querySelectorAll('.btn-del').forEach(b => b.addEventListener('click', () => confirmDelete('item', b.dataset.id)));
}

/* ─── Toppings table ─────────────────────────────────────── */
function renderToppings() {
  const tbody = document.getElementById('toppings-tbody');
  tbody.innerHTML = '';
  menuData.toppings.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${t.title}</strong></td>
      <td><span class="badge-sm badge-${t.dietary.toLowerCase()}">${t.dietary}</span></td>
      <td>€${t.price}</td>
      <td class="action-btns">
        <button class="btn-edit" data-id="${t.id}">Edit</button>
        <button class="btn-del"  data-id="${t.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', () => openToppingModal(b.dataset.id)));
  tbody.querySelectorAll('.btn-del').forEach(b => b.addEventListener('click', () => confirmDelete('topping', b.dataset.id)));
}

/* ─── Search / filter toolbar ────────────────────────────── */
document.getElementById('admin-search').addEventListener('input', renderItems);
document.getElementById('admin-cat-filter').addEventListener('change', renderItems);

/* ─── Item modal ─────────────────────────────────────────── */
function openItemModal(id) {
  editingId = id;
  const modal = document.getElementById('item-modal');
  document.getElementById('modal-title').textContent = id ? 'Edit Item' : 'Add Item';
  document.getElementById('form-error').classList.add('hidden');
  document.getElementById('img-preview').classList.add('hidden');
  document.getElementById('img-current').textContent = '';

  const item = id ? menuData.items.find(i => i.id === id) : null;
  document.getElementById('item-id').value       = item?.id || '';
  document.getElementById('f-title').value        = item?.title || '';
  document.getElementById('f-price').value        = item?.price || '';
  document.getElementById('f-desc').value         = item?.description || '';
  document.getElementById('f-category').value     = item?.category || '';
  document.getElementById('f-dietary').value      = item?.dietary || '';
  document.getElementById('f-can-vegan').checked  = item?.canBeVegan || false;
  document.getElementById('f-available').checked  = item?.available ?? true;

  if (item?.image) {
    document.getElementById('img-current').textContent = `Current: ${item.image}`;
  }

  modal.classList.remove('hidden');
  document.getElementById('f-title').focus();
}

document.getElementById('modal-close').addEventListener('click', closeItemModal);
document.getElementById('modal-cancel').addEventListener('click', closeItemModal);
document.getElementById('item-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeItemModal();
});

function closeItemModal() {
  document.getElementById('item-modal').classList.add('hidden');
  document.getElementById('f-image').value = '';
  editingId = null;
}

/* Image preview */
document.getElementById('f-image').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const preview = document.getElementById('img-preview');
    preview.innerHTML = `<img src="${ev.target.result}" alt="preview" />`;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

/* Save item */
document.getElementById('item-form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = document.getElementById('form-error');
  err.classList.add('hidden');

  const title    = document.getElementById('f-title').value.trim();
  const price    = parseFloat(document.getElementById('f-price').value);
  const desc     = document.getElementById('f-desc').value.trim();
  const category = document.getElementById('f-category').value;
  const dietary  = document.getElementById('f-dietary').value;
  const canVegan = document.getElementById('f-can-vegan').checked;
  const available= document.getElementById('f-available').checked;
  const imageFile= document.getElementById('f-image').files[0];

  let imagePath = editingId
    ? (menuData.items.find(i => i.id === editingId)?.image || '')
    : '';

  if (imageFile) {
    const ext = imageFile.name.split('.').pop().toLowerCase();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    imagePath = `images/${slug}.${ext}`;
    const base64 = await fileToBase64(imageFile);
    pendingImages[imagePath] = base64;
  }

  if (editingId) {
    const idx = menuData.items.findIndex(i => i.id === editingId);
    if (idx !== -1) {
      menuData.items[idx] = {
        ...menuData.items[idx], title, price, description: desc,
        category, dietary, canBeVegan: canVegan, available, image: imagePath
      };
    }
  } else {
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
               + '-' + Date.now().toString(36);
    menuData.items.push({
      id, title, description: desc, price, image: imagePath,
      category, dietary, canBeVegan: canVegan, available
    });
  }

  markDirty();
  closeItemModal();
  renderItems();
});

/* ─── Topping modal ──────────────────────────────────────── */
function openToppingModal(id) {
  editingToppingId = id;
  const t = id ? menuData.toppings.find(t => t.id === id) : null;
  document.getElementById('topping-modal-title').textContent = id ? 'Edit Topping' : 'Add Topping';
  document.getElementById('t-id').value      = t?.id || '';
  document.getElementById('t-title').value   = t?.title || '';
  document.getElementById('t-price').value   = t?.price || '';
  document.getElementById('t-dietary').value = t?.dietary || '';
  document.getElementById('topping-form-error').classList.add('hidden');
  document.getElementById('topping-modal').classList.remove('hidden');
  document.getElementById('t-title').focus();
}

document.getElementById('topping-modal-close').addEventListener('click', closeToppingModal);
document.getElementById('topping-cancel').addEventListener('click', closeToppingModal);
document.getElementById('topping-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeToppingModal();
});
function closeToppingModal() {
  document.getElementById('topping-modal').classList.add('hidden');
  editingToppingId = null;
}

document.getElementById('topping-form').addEventListener('submit', e => {
  e.preventDefault();
  const title   = document.getElementById('t-title').value.trim();
  const price   = parseFloat(document.getElementById('t-price').value);
  const dietary = document.getElementById('t-dietary').value;

  if (editingToppingId) {
    const idx = menuData.toppings.findIndex(t => t.id === editingToppingId);
    if (idx !== -1) menuData.toppings[idx] = { ...menuData.toppings[idx], title, price, dietary };
  } else {
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-topping';
    menuData.toppings.push({ id, title, price, dietary });
  }

  markDirty();
  closeToppingModal();
  renderToppings();
});

/* ─── Delete confirm ─────────────────────────────────────── */
function confirmDelete(type, id) {
  deleteTarget = { type, id };
  const name = type === 'item'
    ? menuData.items.find(i => i.id === id)?.title
    : menuData.toppings.find(t => t.id === id)?.title;
  document.getElementById('confirm-msg').textContent = `Delete "${name}"? This cannot be undone.`;
  document.getElementById('confirm-modal').classList.remove('hidden');
}

document.getElementById('confirm-close').addEventListener('click', closeConfirm);
document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
document.getElementById('confirm-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeConfirm();
});
function closeConfirm() {
  document.getElementById('confirm-modal').classList.add('hidden');
  deleteTarget = null;
}

document.getElementById('confirm-ok').addEventListener('click', () => {
  if (!deleteTarget) return;
  if (deleteTarget.type === 'item') {
    menuData.items = menuData.items.filter(i => i.id !== deleteTarget.id);
    markDirty();
    closeConfirm();
    renderItems();
  } else {
    menuData.toppings = menuData.toppings.filter(t => t.id !== deleteTarget.id);
    markDirty();
    closeConfirm();
    renderToppings();
  }
});

/* ─── Dirty / Save ───────────────────────────────────────── */
function markDirty() {
  dirty = true;
  const banner = document.getElementById('save-banner');
  banner.classList.remove('hidden');
  document.getElementById('save-msg').textContent = 'You have unsaved changes.';
}

document.getElementById('save-btn').addEventListener('click', async () => {
  const btn = document.getElementById('save-btn');
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    // upload pending images first
    for (const [path, b64] of Object.entries(pendingImages)) {
      let existingSHA = undefined;
      try {
        const existing = await ghGet(path);
        existingSHA = existing.sha;
      } catch {}
      await ghPutBinary(path, b64, existingSHA, `Upload image ${path.split('/').pop()} via admin panel`);
    }
    pendingImages = {};

    // save menu.json
    const json = JSON.stringify(menuData, null, 2);
    const result = await ghPut(MENU_PATH, json, fileSHA, 'Update menu via admin panel');
    fileSHA = result.content.sha;

    dirty = false;
    document.getElementById('save-banner').classList.add('hidden');
    showToast('Changes saved! GitHub Pages will update in ~30s.', 'success');
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  } finally {
    btn.textContent = 'Save all changes to GitHub';
    btn.disabled = false;
  }
});

/* ─── Helpers ────────────────────────────────────────────── */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // strip the data URL prefix
      const b64 = reader.result.split(',')[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
}
