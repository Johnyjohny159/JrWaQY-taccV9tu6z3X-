/* ─── State ──────────────────────────────────────────────── */
let allItems = [];
let toppings = [];
let activeCategory = 'All';
let activeDietary  = 'All';
let searchQuery    = '';

const CATEGORY_ORDER = ['Wrap','Meal','Hummus Bowl','Sides','Salads','Desserts','Drinks','Sauces'];
const CATEGORY_EMOJI = {
  'Wrap': '🌯', 'Meal': '🍽️', 'Hummus Bowl': '🫙',
  'Sides': '🍟', 'Salads': '🥗', 'Desserts': '🍮',
  'Drinks': '🥤', 'Sauces': '🫙'
};

/* ─── Boot ───────────────────────────────────────────────── */
async function init() {
  try {
    const res  = await fetch('data/menu.json');
    const data = await res.json();
    allItems = data.items || [];
    toppings = data.toppings || [];
  } catch (e) {
    console.error('Failed to load menu.json', e);
  }
  attachFilters();
  render();
}

/* ─── Filter logic ───────────────────────────────────────── */
function filtered() {
  return allItems.filter(item => {
    const catOk  = activeCategory === 'All' || item.category === activeCategory;
    const dietOk = activeDietary  === 'All' || item.dietary  === activeDietary;
    const q      = searchQuery.toLowerCase();
    const textOk = !q ||
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q);
    return catOk && dietOk && textOk && item.available;
  });
}

/* ─── Render ─────────────────────────────────────────────── */
function render() {
  const root  = document.getElementById('menu-root');
  const noRes = document.getElementById('no-results');
  const items = filtered();

  // clear previous cards (keep no-results div)
  [...root.children].forEach(el => {
    if (el.id !== 'no-results') el.remove();
  });

  if (items.length === 0) {
    noRes.classList.remove('hidden');
    return;
  }
  noRes.classList.add('hidden');

  if (searchQuery) {
    // flat list when searching
    const section = buildSection('Search Results', items);
    root.insertBefore(section, noRes);
  } else {
    // grouped by category
    const cats = activeCategory === 'All'
      ? CATEGORY_ORDER
      : [activeCategory];

    cats.forEach(cat => {
      const catItems = items.filter(i => i.category === cat);
      if (!catItems.length) return;
      const section = buildSection(
        `${CATEGORY_EMOJI[cat] || ''} ${cat}`,
        catItems
      );
      root.insertBefore(section, noRes);
    });
  }

  // toppings strip always at the bottom
  if (!root.querySelector('.toppings-strip')) {
    root.insertBefore(buildToppingsStrip(), noRes);
  }
}

function buildSection(title, items) {
  const sec = document.createElement('section');

  const h2 = document.createElement('h2');
  h2.className = 'section-heading';
  h2.innerHTML = `${title} <span class="count">${items.length} item${items.length !== 1 ? 's' : ''}</span>`;
  sec.appendChild(h2);

  const grid = document.createElement('div');
  grid.className = 'card-grid';
  items.forEach(item => grid.appendChild(buildCard(item)));
  sec.appendChild(grid);

  return sec;
}

function buildCard(item) {
  const card = document.createElement('article');
  card.className = 'item-card';

  // image
  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';
  const img = document.createElement('img');
  img.src = item.image;
  img.alt = item.title;
  img.loading = 'lazy';
  img.onerror = () => {
    imgWrap.innerHTML = `<div class="card-img-placeholder">${CATEGORY_EMOJI[item.category] || '🍴'}</div>`;
  };
  imgWrap.appendChild(img);
  card.appendChild(imgWrap);

  // body
  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = item.title;
  body.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'card-desc';
  desc.textContent = item.description;
  body.appendChild(desc);

  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const price = document.createElement('span');
  price.className = 'card-price';
  price.textContent = `€${item.price.toFixed(2).replace('.00', '')}`;
  footer.appendChild(price);

  const badges = document.createElement('div');
  badges.className = 'card-badges';
  badges.appendChild(dietBadge(item.dietary));
  if (item.canBeVegan) {
    const b = document.createElement('span');
    b.className = 'badge badge-can-vegan';
    b.textContent = '🌱 Can be vegan';
    badges.appendChild(b);
  }
  footer.appendChild(badges);

  body.appendChild(footer);
  card.appendChild(body);
  return card;
}

function dietBadge(dietary) {
  const b = document.createElement('span');
  const map = {
    'Meat':        ['badge-meat',        '🥩'],
    'Vegetarian':  ['badge-vegetarian',  '🧀'],
    'Vegan':       ['badge-vegan',       '🌱'],
    'Gluten Free': ['badge-gluten-free', '🌾'],
  };
  const [cls, emoji] = map[dietary] || ['badge-vegan', ''];
  b.className = `badge ${cls}`;
  b.textContent = `${emoji} ${dietary}`;
  return b;
}

function buildToppingsStrip() {
  if (!toppings.length) return document.createDocumentFragment();
  const strip = document.createElement('div');
  strip.className = 'toppings-strip';

  const title = document.createElement('p');
  title.className = 'toppings-title';
  title.textContent = '+ Add a Topping';
  strip.appendChild(title);

  const list = document.createElement('div');
  list.className = 'toppings-list';
  toppings.forEach(t => {
    const badge = document.createElement('span');
    badge.className = 'topping-badge';
    badge.innerHTML = `${t.title} <span class="price">€${t.price.toFixed(2).replace('.00','')}</span>`;
    list.appendChild(badge);
  });
  strip.appendChild(list);
  return strip;
}

/* ─── Event listeners ────────────────────────────────────── */
function attachFilters() {
  document.getElementById('category-filters').addEventListener('click', e => {
    const pill = e.target.closest('.cat-pill');
    if (!pill) return;
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeCategory = pill.dataset.cat;
    render();
  });

  document.getElementById('dietary-filters').addEventListener('click', e => {
    const pill = e.target.closest('.diet-pill');
    if (!pill) return;
    document.querySelectorAll('.diet-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeDietary = pill.dataset.diet;
    render();
  });

  let debounce;
  document.getElementById('search-input').addEventListener('input', e => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      searchQuery = e.target.value.trim();
      render();
    }, 200);
  });
}

/* ─── Start ──────────────────────────────────────────────── */
init();
