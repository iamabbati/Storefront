// ============================================================
// Sample product data — OFFLINE / DEV FALLBACK ONLY. The live catalog
// now comes from Supabase (see loadProducts() below and
// supabase-client.js). This array stays in place and is used
// automatically whenever the Supabase fetch fails, so the site never
// shows a blank page if the database is unreachable.
// ============================================================
const SAMPLE_PRODUCTS = [
  { id: 1, name: "Sample Product One",   cat: "Category one",   price: 24500, was: null,   rating: 4, reviews: 12, inStock: true  },
  { id: 2, name: "Sample Product Two",   cat: "Category two",   price: 16170, was: null,   rating: 5, reviews: 4,  inStock: true  },
  { id: 3, name: "Sample Product Three", cat: "Category one",   price: 10395, was: null,   rating: 4, reviews: 9,  inStock: true  },
  { id: 4, name: "Sample Product Four",  cat: "Category three", price: 15600, was: 20000,  rating: null, reviews: 0, inStock: true  },
  { id: 5, name: "Sample Product Five",  cat: "Category two",   price: 8900,  was: null,   rating: null, reviews: 0, inStock: false },
  { id: 6, name: "Sample Product Six",   cat: "Category three", price: 45500, was: 58000,  rating: 5, reviews: 2,  inStock: true  },
];

const CATEGORIES = ["Category one", "Category two", "Category three"];

const BRANDS = [
  { name: "Category one",   count: SAMPLE_PRODUCTS.filter(p => p.cat === "Category one").length,   blurb: "Placeholder blurb for this category — swap in a real description once it's set." },
  { name: "Category two",   count: SAMPLE_PRODUCTS.filter(p => p.cat === "Category two").length,   blurb: "Placeholder blurb for this category — swap in a real description once it's set." },
  { name: "Category three", count: SAMPLE_PRODUCTS.filter(p => p.cat === "Category three").length, blurb: "Placeholder blurb for this category — swap in a real description once it's set." },
];

// ---------- Live product loading — Supabase first, SAMPLE_PRODUCTS on any failure ----------
let LIVE_PRODUCTS = null; // cached full catalog for this page load, once fetched

async function loadProducts() {
  if (LIVE_PRODUCTS) return LIVE_PRODUCTS;
  try {
    const products = await sbFetchProducts();
    LIVE_PRODUCTS = products.length ? products : SAMPLE_PRODUCTS;
  } catch (err) {
    console.warn("Falling back to sample products — Supabase fetch failed:", err);
    LIVE_PRODUCTS = SAMPLE_PRODUCTS;
  }
  return LIVE_PRODUCTS;
}

async function loadFeaturedProducts() {
  try {
    const featured = await sbFetchProducts({ featuredOnly: true });
    if (featured.length) return featured;
  } catch (err) {
    console.warn("Falling back to sample products for featured grid:", err);
  }
  return SAMPLE_PRODUCTS.slice(0, 3);
}

async function loadProductById(id) {
  if (id) {
    try {
      return await sbFetchProductById(id);
    } catch (err) {
      console.warn("Falling back to sample product — Supabase fetch failed:", err);
    }
  }
  return SAMPLE_PRODUCTS[0];
}

// ---------- Auth state — resolved once on load, kept in sync via onAuthStateChange ----------
let currentUser = null;

async function initAuthState() {
  const session = await sbGetSession();
  currentUser = session ? session.user : null;
  sbOnAuthStateChange((_event, session) => {
    currentUser = session ? session.user : null;
    refreshCartBadge(false);
    if (document.getElementById("account-logged-in")) renderAccountAuthState();
  });
}

// ---------- Cart — Supabase-backed when signed in, in-memory when not ----------
// Anonymous cart intentionally does not persist across reloads or devices;
// it exists only for this tab's session, same spirit as the site's previous
// placeholder cart behavior.
let anonCart = []; // [{ productId, qty }]

async function cartGetItems() {
  if (currentUser) return sbGetCartItems(currentUser.id);
  const products = await loadProducts();
  return anonCart
    .map(entry => {
      const product = products.find(p => String(p.id) === String(entry.productId));
      return product ? { qty: entry.qty, product } : null;
    })
    .filter(Boolean);
}

async function cartAdd(productId, qty = 1) {
  if (currentUser) return sbAddToCart(currentUser.id, productId, qty);
  const existing = anonCart.find(e => String(e.productId) === String(productId));
  if (existing) existing.qty += qty;
  else anonCart.push({ productId, qty });
}

async function cartSetQty(productId, qty) {
  if (currentUser) return sbSetCartQty(currentUser.id, productId, qty);
  if (qty <= 0) return cartRemove(productId);
  const existing = anonCart.find(e => String(e.productId) === String(productId));
  if (existing) existing.qty = qty;
}

async function cartRemove(productId) {
  if (currentUser) return sbRemoveCartItem(currentUser.id, productId);
  anonCart = anonCart.filter(e => String(e.productId) !== String(productId));
}

async function cartGetCount() {
  const items = await cartGetItems();
  return items.reduce((sum, i) => sum + i.qty, 0);
}

function formatNaira(n) {
  return "₦" + n.toLocaleString("en-NG");
}

function starString(rating) {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

function renderProductCard(p, animate) {
  const discount = p.was ? Math.round((1 - p.price / p.was) * 100) : null;
  const ratingHtml = p.rating
    ? `<div class="product-rating">${starString(p.rating)}<span class="count">(${p.reviews})</span></div>`
    : `<div class="product-rating none">No reviews yet</div>`;
  const href = `product.html?id=${encodeURIComponent(p.id)}`;
  return `
    <div class="product-card${animate ? ' enter' : ''}">
      <a href="${href}" class="product-thumb">
        ${discount ? `<span class="badge-discount">-${discount}%</span>` : ''}
        ${!p.inStock ? `<span class="badge-stock">Out of stock</span>` : ''}
      </a>
      <div class="product-info">
        <span class="product-cat">${p.cat}</span>
        <a href="${href}" class="product-name">${p.name}</a>
        ${ratingHtml}
        <div class="price-row">
          <span class="product-price">${formatNaira(p.price)}</span>
          ${p.was ? `<span class="price-was">${formatNaira(p.was)}</span>` : ''}
        </div>
        <div class="product-actions">
          <button class="btn btn-outline add-to-cart" data-id="${p.id}" ${!p.inStock ? 'disabled' : ''}>Add to Cart</button>
          <a href="${href}" class="btn btn-primary">Buy Now</a>
        </div>
      </div>
    </div>`;
}

function renderBrandCard(b, animate) {
  return `
    <div class="brand-card${animate ? ' enter' : ''}">
      <span class="brand-count">${b.count} product${b.count === 1 ? '' : 's'}</span>
      <h3>${b.name}</h3>
      <p>${b.blurb}</p>
      <a href="shop.html" class="btn btn-outline">Browse</a>
    </div>`;
}

function renderFooter() {
  return `
    <div class="wrap">
      <div class="footer-grid">
        <div>
          <div class="logo" style="margin-bottom:10px;">Store<span>front</span></div>
          <p>A placeholder e-commerce structure — ready to be rebranded once the catalog and business name are set.</p>
        </div>
        <div>
          <h5>Shop</h5>
          <a href="shop.html">All products</a>
          <a href="shop.html">Categories</a>
          <a href="shop.html">Deals</a>
        </div>
        <div>
          <h5>Support</h5>
          <a href="#">Contact us</a>
          <a href="#">FAQs</a>
          <a href="#">Shipping info</a>
          <a href="#">Track order</a>
        </div>
        <div>
          <h5>Company</h5>
          <a href="#">About us</a>
          <a href="privacy-policy.html">Privacy policy</a>
          <a href="#">Terms of service</a>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© 2026 Storefront. All rights reserved.</span>
        <span>Secured &amp; encrypted checkout</span>
      </div>
    </div>`;
}

/* ---------- Cart badge — feedback purpose, near-imperceptible pulse only (tens-of-times/day tier) ---------- */
async function refreshCartBadge(pulse) {
  let count = 0;
  try {
    count = await cartGetCount();
  } catch (err) {
    console.warn("Could not resolve cart count:", err);
  }
  document.querySelectorAll(".cart-count").forEach(el => {
    el.textContent = count;
    if (pulse) {
      el.classList.remove("pulse");
      void el.offsetWidth; // restart animation if triggered again quickly
      el.classList.add("pulse");
    }
  });
  return count;
}

function initAddToCart() {
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".add-to-cart");
    if (!btn || btn.disabled) return;
    const productId = btn.dataset.id;
    if (!productId) return;
    btn.disabled = true;
    try {
      await cartAdd(productId, 1);
      await refreshCartBadge(true);
    } catch (err) {
      console.error("Failed to add to cart:", err);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- Desktop nav: text-roll effect ported from a pasted framer-motion
   component. Progressive enhancement — if this doesn't run, plain links remain. ---------- */
const ROLL_STAGGER_MS = 35; // matches the source component's STAGGER = 0.035s

function textRollMarkup(word) {
  const letters = word.split("");
  const center = (letters.length - 1) / 2;
  const layer = () =>
    letters.map((ch, i) => {
      const delay = Math.round(ROLL_STAGGER_MS * Math.abs(i - center));
      const glyph = ch === " " ? "&nbsp;" : ch;
      return `<span class="letter" style="transition-delay:${delay}ms">${glyph}</span>`;
    }).join("");
  return `<span class="text-roll"><span class="roll-top">${layer()}</span><span class="roll-bottom" aria-hidden="true">${layer()}</span></span>`;
}

function initTextRollNav() {
  document.querySelectorAll(".main-nav a").forEach((link) => {
    link.innerHTML = textRollMarkup(link.textContent.trim());
  });
}

/* ---------- Smooth caret — ported from a pasted framer-motion component. Real spring
   physics (same default constants as the source: stiffness 500, damping 30, mass 0.5),
   hand-rolled via requestAnimationFrame since this site has no Motion library.
   Deliberately NOT applied to login/password or checkout/shipping fields — see the
   chat note on why a hand-built caret is a worse tradeoff on fields people depend on
   to check out or sign in correctly. Text/email inputs only, no password masking. ---------- */
function initSmoothCaret(input) {
  if (!input) return;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const wrapper = document.createElement("div");
  wrapper.className = "smooth-caret-field";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const measure = document.createElement("span");
  measure.className = "smooth-caret-measure";
  wrapper.appendChild(measure);

  const caret = document.createElement("span");
  caret.className = "smooth-caret";
  wrapper.appendChild(caret);

  let caretX = 0, targetX = 0, velocity = 0, rafId = null;
  const STIFFNESS = 500, DAMPING = 30, MASS = 0.5;

  const paddingLeft = () => parseFloat(window.getComputedStyle(input).paddingLeft) || 0;

  const syncMeasureFont = () => {
    const s = window.getComputedStyle(input);
    measure.style.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    measure.style.letterSpacing = s.letterSpacing;
  };

  const measurePrefixWidth = () => {
    syncMeasureFont();
    const caretIndex = input.selectionEnd ?? input.value.length;
    measure.textContent = input.value.slice(0, caretIndex);
    const width = input.value.length ? measure.offsetWidth : 0;
    return width + paddingLeft();
  };

  function step() {
    const accel = (-STIFFNESS * (caretX - targetX) - DAMPING * velocity) / MASS;
    velocity += accel / 60;
    caretX += velocity / 60;
    caret.style.transform = `translate(${caretX}px, -50%)`;
    if (Math.abs(targetX - caretX) > 0.3 || Math.abs(velocity) > 0.3) {
      rafId = requestAnimationFrame(step);
    } else {
      caretX = targetX;
      caret.style.transform = `translate(${caretX}px, -50%)`;
      rafId = null;
    }
  }

  const setTarget = (immediate) => {
    targetX = measurePrefixWidth();
    if (prefersReduced || immediate) {
      caretX = targetX; velocity = 0;
      caret.style.transform = `translate(${caretX}px, -50%)`;
      return;
    }
    if (!rafId) rafId = requestAnimationFrame(step);
  };

  input.addEventListener("input", () => setTarget(false));
  input.addEventListener("click", () => setTarget(false));
  input.addEventListener("keyup", () => setTarget(false));
  input.addEventListener("focus", () => { caret.style.opacity = "1"; setTarget(true); });
  input.addEventListener("blur", () => { caret.style.opacity = "0"; });
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === input) setTarget(false);
  });
  window.addEventListener("resize", () => setTarget(true));
}

/* ---------- Header search — icon toggles an inline expanding field, focuses on open ---------- */
function initHeaderSearch() {
  const toggle = document.getElementById("searchToggle");
  const field = document.querySelector(".header-search");
  const input = document.getElementById("header-search-input");
  if (!toggle || !field || !input) return;

  toggle.addEventListener("click", () => {
    const opening = !field.classList.contains("open");
    field.classList.toggle("open", opening);
    toggle.classList.toggle("active", opening);
    if (opening) setTimeout(() => input.focus(), 200); // wait for the expand transition
  });

  document.addEventListener("click", (e) => {
    if (!field.classList.contains("open")) return;
    if (field.contains(e.target) || toggle.contains(e.target)) return;
    field.classList.remove("open");
    toggle.classList.remove("active");
  });
}

/* ---------- Theme toggle — persists choice, respects prior system-preference detection done inline in <head> ---------- */
function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;

  const getCurrent = () => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  btn.addEventListener("click", () => {
    const next = getCurrent() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) { /* storage unavailable, theme just won't persist */ }
  });
}

/* ---------- Mobile nav sheet — anchored to header, dims background, mirrors enter/exit ---------- */
function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (!toggle || !nav) return;
  const scrim = document.createElement("div");
  scrim.className = "nav-scrim";
  document.body.appendChild(scrim);

  const close = () => { nav.classList.remove("open"); scrim.classList.remove("open"); };
  const open = () => { nav.classList.add("open"); scrim.classList.add("open"); };
  toggle.addEventListener("click", () => nav.classList.contains("open") ? close() : open());
  scrim.addEventListener("click", close);
  nav.querySelectorAll("a").forEach(a => a.addEventListener("click", close));
}

/* ---------- Shop page: real filtering, wired to Availability / Category / Price ---------- */
async function initShopFilters() {
  const grid = document.getElementById("shop-grid");
  if (!grid) return;
  const allCheckboxes = document.querySelectorAll('.filters input[type="checkbox"]');
  const inStockBox = allCheckboxes[0];
  const categoryCheckboxes = Array.from(allCheckboxes).slice(1); // remaining checkboxes are the category list, in CATEGORIES order
  const priceRadios = document.querySelectorAll('.filters input[type="radio"]');
  const resultCount = document.getElementById("result-count");
  const searchInput = document.getElementById("shop-search");

  const priceRanges = [
    [0, 10000], [10000, 30000], [30000, 50000], [50000, Infinity]
  ];

  grid.innerHTML = `<p style="color:var(--ink-soft);font-size:13px;">Loading products…</p>`;
  const products = await loadProducts();

  const applyFilters = (animate) => {
    const inStockOnly = inStockBox && inStockBox.checked;
    const activeCats = categoryCheckboxes.map((cb, i) => cb.checked ? CATEGORIES[i] : null).filter(Boolean);
    const checkedPriceIndex = Array.from(priceRadios).findIndex(r => r.checked);
    const searchTerm = (searchInput ? searchInput.value : "").trim().toLowerCase();

    let filtered = products.filter(p => {
      if (inStockOnly && !p.inStock) return false;
      if (activeCats.length && !activeCats.includes(p.cat)) return false;
      if (checkedPriceIndex > -1) {
        const [min, max] = priceRanges[checkedPriceIndex];
        if (p.price < min || p.price >= max) return false;
      }
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm)) return false;
      return true;
    });

    grid.innerHTML = filtered.length
      ? filtered.map(p => renderProductCard(p, animate)).join("")
      : `<p style="color:var(--ink-soft);font-size:13px;">No products match those filters.</p>`;
    if (resultCount) resultCount.textContent = `${filtered.length} product${filtered.length === 1 ? '' : 's'}`;
  };

  if (searchInput) {
    const queryFromUrl = new URLSearchParams(window.location.search).get("q");
    if (queryFromUrl) searchInput.value = queryFromUrl;
    searchInput.addEventListener("input", () => applyFilters(false));
  }

  [inStockBox, ...categoryCheckboxes, ...priceRadios].forEach(input => {
    if (input) input.addEventListener("change", () => applyFilters(false));
  });

  applyFilters(true); // first paint only
}

/* ---------- Product detail page: loads the product named in ?id=, falls back to a
   sample product if absent/unreachable. Add to Cart shares .add-to-cart with the
   grid cards, so initAddToCart's delegated handler covers this button too. ---------- */
async function initProductDetail() {
  const nameEl = document.getElementById("pd-name");
  if (!nameEl) return; // not on the product page

  const productId = new URLSearchParams(window.location.search).get("id");
  const p = await loadProductById(productId);

  document.getElementById("pd-category").textContent = p.cat;
  nameEl.textContent = p.name;
  document.getElementById("pd-price").textContent = formatNaira(p.price);
  document.getElementById("pd-desc").textContent = p.description || "Placeholder description — swap in real product copy once you've picked what the store sells.";
  document.getElementById("pd-stock").textContent = p.inStock ? `${p.stock || ''} in stock`.trim() : "Out of stock";

  const ratingEl = document.getElementById("pd-rating");
  if (ratingEl) {
    ratingEl.innerHTML = p.rating
      ? `${starString(p.rating)}<span class="count">(${p.reviews} reviews)</span>`
      : `<span style="color:var(--ink-soft);">No reviews yet</span>`;
  }

  const addBtn = document.getElementById("pd-add-to-cart");
  if (addBtn) {
    addBtn.dataset.id = p.id;
    if (!p.inStock) addBtn.disabled = true;
    // Quantity from the stepper, read at click time via the shared .add-to-cart
    // handler would only ever add 1 — override here so it respects qty-value.
    addBtn.addEventListener("click", async (e) => {
      e.stopImmediatePropagation(); // take over from the generic single-qty handler
      if (addBtn.disabled) return;
      const qty = parseInt(document.getElementById("qty-value").textContent, 10) || 1;
      addBtn.disabled = true;
      try {
        await cartAdd(p.id, qty);
        await refreshCartBadge(true);
      } catch (err) {
        console.error("Failed to add to cart:", err);
      } finally {
        addBtn.disabled = false;
      }
    });
  }
}

/* ---------- Cart page: renders live cart contents (Supabase or in-memory), real
   qty + remove-with-collapse, live totals ---------- */
async function initCartPage() {
  const container = document.getElementById("cart-lines");
  if (!container) return; // not on the cart page

  const checkoutLink = document.getElementById("checkout-link");

  const renderLine = (item) => `
    <div class="cart-line" data-product-id="${item.product.id}">
      <div class="cart-thumb"></div>
      <div>
        <div style="font-weight:600;">${item.product.name}</div>
        <div style="color:var(--ink-soft);font-size:12.5px;">${item.product.cat}</div>
      </div>
      <div class="qty-stepper">
        <button aria-label="Decrease quantity" class="qty-minus">–</button><span>${item.qty}</span><button aria-label="Increase quantity" class="qty-plus">+</button>
      </div>
      <div class="line-price">${formatNaira(item.product.price * item.qty)}</div>
      <span class="remove-link">Remove</span>
    </div>`;

  const render = async () => {
    const items = await cartGetItems();

    if (!items.length) {
      container.innerHTML = `<p style="color:var(--ink-soft);font-size:13.5px;padding:24px 0;">Your cart is empty.</p>`;
    } else {
      container.innerHTML = items.map(renderLine).join("");
    }

    const subtotal = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);
    const delivery = items.length ? 2500 : 0;
    const subtotalEl = document.getElementById("cart-subtotal");
    const deliveryEl = document.getElementById("cart-delivery");
    const totalEl = document.getElementById("cart-total");
    if (subtotalEl) subtotalEl.textContent = formatNaira(subtotal);
    if (deliveryEl) deliveryEl.textContent = formatNaira(delivery);
    if (totalEl) totalEl.textContent = formatNaira(subtotal + delivery);

    if (checkoutLink) {
      checkoutLink.classList.toggle("btn-disabled", !items.length);
      checkoutLink.setAttribute("aria-disabled", items.length ? "false" : "true");
    }

    await refreshCartBadge(false);
  };

  container.addEventListener("click", async (e) => {
    const line = e.target.closest(".cart-line");
    if (!line) return;
    const productId = line.dataset.productId;

    if (e.target.closest(".qty-minus")) {
      const valueEl = line.querySelector(".qty-stepper span");
      const current = parseInt(valueEl.textContent, 10);
      if (current > 1) await cartSetQty(productId, current - 1);
      await render();
    } else if (e.target.closest(".qty-plus")) {
      const valueEl = line.querySelector(".qty-stepper span");
      const current = parseInt(valueEl.textContent, 10);
      await cartSetQty(productId, current + 1);
      await render();
    } else if (e.target.closest(".remove-link")) {
      line.classList.add("removing");
      await cartRemove(productId);
      line.addEventListener("transitionend", () => render(), { once: true });
      // Fallback in case the removing-state transition never fires (e.g. reduced motion).
      setTimeout(() => { if (line.isConnected) render(); }, 400);
    }
  });

  await render();
}

/* ---------- Checkout: gathers live cart + shipping fields, creates a real order for
   signed-in users. Never reads #card/#exp/#cvv — those stay inert placeholders until
   a real payment gateway is wired in. ---------- */
async function initCheckout() {
  const placeBtn = document.getElementById("place-order-btn");
  if (!placeBtn) return; // not on the checkout page

  const statusEl = document.getElementById("checkout-status");
  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = isError ? "var(--brick)" : "var(--jade-deep)";
  };

  const renderSummary = async () => {
    const items = await cartGetItems();
    const subtotal = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);
    const delivery = items.length ? 2500 : 0;
    const countEl = document.getElementById("checkout-item-count");
    const subtotalEl = document.getElementById("checkout-subtotal");
    const deliveryEl = document.getElementById("checkout-delivery");
    const totalEl = document.getElementById("checkout-total");
    if (countEl) countEl.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
    if (subtotalEl) subtotalEl.textContent = formatNaira(subtotal);
    if (deliveryEl) deliveryEl.textContent = formatNaira(delivery);
    if (totalEl) totalEl.textContent = formatNaira(subtotal + delivery);
    return items;
  };

  await renderSummary();

  placeBtn.addEventListener("click", async () => {
    setStatus("", false);

    if (!currentUser) {
      setStatus("Please log in to place an order — your cart is saved on this device.", true);
      return;
    }

    const shipping = {
      name: document.getElementById("fname").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      address: document.getElementById("addr").value.trim(),
      city: document.getElementById("city").value.trim(),
      state: document.getElementById("state").value,
    };
    if (!shipping.name || !shipping.phone || !shipping.address || !shipping.city || !shipping.state) {
      setStatus("Please fill in all shipping details.", true);
      return;
    }

    const checkedPay = document.querySelector('input[name="pay"]:checked');
    const paymentMethod = checkedPay ? checkedPay.dataset.value : "card";

    const items = await cartGetItems();
    if (!items.length) {
      setStatus("Your cart is empty.", true);
      return;
    }

    placeBtn.disabled = true;
    setStatus("Placing your order…", false);
    try {
      const order = await sbCreateOrder({ userId: currentUser.id, shipping, paymentMethod, items });
      setStatus(`Order placed — thank you! Reference: ${order.id.slice(0, 8)}.`, false);
      await renderSummary();
      await refreshCartBadge(false);
    } catch (err) {
      console.error("Failed to place order:", err);
      setStatus("Something went wrong placing your order. Please try again.", true);
    } finally {
      placeBtn.disabled = false;
    }
  });
}

/* ---------- Account page: real Supabase auth, toggles between the login/signup
   tabs and a signed-in panel depending on session state. ---------- */
function renderAccountAuthState() {
  const loggedInPanel = document.getElementById("account-logged-in");
  const tabRow = document.querySelector(".tab-row");
  const forms = document.querySelectorAll("#login-form, #signup-form");
  if (!loggedInPanel) return;

  if (currentUser) {
    loggedInPanel.style.display = "block";
    if (tabRow) tabRow.style.display = "none";
    forms.forEach(f => f.classList.remove("active"));
    const emailEl = document.getElementById("account-email");
    if (emailEl) emailEl.textContent = currentUser.email || "";
  } else {
    loggedInPanel.style.display = "none";
    if (tabRow) tabRow.style.display = "";
    const activeTab = document.querySelector(".tab-btn.active");
    const target = document.getElementById((activeTab ? activeTab.dataset.tab : "login") + "-form");
    if (target) target.classList.add("active");
  }
}

function initAccountAuth() {
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const logoutBtn = document.getElementById("logout-btn");
  if (!loginForm && !signupForm) return; // not on the account page

  renderAccountAuthState();

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const statusEl = document.getElementById("login-status");
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-pass").value;
      statusEl.style.color = "var(--brick)";
      if (!email || !password) { statusEl.textContent = "Enter your email and password."; return; }
      statusEl.textContent = "Signing in…";
      statusEl.style.color = "var(--ink-soft)";
      const { error } = await sbSignIn(email, password);
      if (error) {
        statusEl.style.color = "var(--brick)";
        statusEl.textContent = error.message || "Could not sign in.";
        return;
      }
      statusEl.style.color = "var(--jade-deep)";
      statusEl.textContent = "Signed in.";
      renderAccountAuthState();
      refreshCartBadge(false);
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const statusEl = document.getElementById("signup-status");
      const name = document.getElementById("su-name").value.trim();
      const email = document.getElementById("su-email").value.trim();
      const password = document.getElementById("su-pass").value;
      if (!name || !email || !password) { statusEl.style.color = "var(--brick)"; statusEl.textContent = "Fill in all fields."; return; }
      if (password.length < 6) { statusEl.style.color = "var(--brick)"; statusEl.textContent = "Password must be at least 6 characters."; return; }
      statusEl.style.color = "var(--ink-soft)";
      statusEl.textContent = "Creating your account…";
      const { data, error } = await sbSignUp(email, password, name);
      if (error) {
        statusEl.style.color = "var(--brick)";
        statusEl.textContent = error.message || "Could not create account.";
        return;
      }
      if (data.session) {
        statusEl.style.color = "var(--jade-deep)";
        statusEl.textContent = "Account created — you're signed in.";
        renderAccountAuthState();
        refreshCartBadge(false);
      } else {
        statusEl.style.color = "var(--jade-deep)";
        statusEl.textContent = "Check your email to confirm your account, then log in.";
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      await sbSignOut();
      logoutBtn.disabled = false;
      renderAccountAuthState();
      refreshCartBadge(false);
    });
  }
}

/* ---------- Checkout: selected-state on payment method rows ---------- */
function initPayOptions() {
  const options = document.querySelectorAll(".pay-option");
  if (!options.length) return;
  const sync = () => options.forEach(opt => opt.classList.toggle("selected", opt.querySelector("input").checked));
  options.forEach(opt => opt.querySelector("input").addEventListener("change", sync));
  sync();
}

/* ---------- Account page: tabs with crossfade + sliding underline ---------- */
function initAccountTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  if (!tabBtns.length) return;
  const underline = document.querySelector(".tab-underline");

  const moveUnderline = (btn) => {
    if (!underline) return;
    underline.style.width = btn.offsetWidth + "px";
    underline.style.transform = `translateX(${btn.offsetLeft}px)`;
  };
  moveUnderline(document.querySelector(".tab-btn.active"));

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
      const target = document.getElementById(btn.dataset.tab + "-form");
      if (target) target.classList.add("active");
      moveUnderline(btn);
    });
  });
  window.addEventListener("resize", () => moveUnderline(document.querySelector(".tab-btn.active")));
}

document.addEventListener("DOMContentLoaded", async () => {
  const footerEl = document.getElementById("site-footer");
  if (footerEl) footerEl.innerHTML = renderFooter();

  // Resolve who's signed in before anything cart/account-related renders,
  // so the very first paint already reflects the right state.
  await initAuthState();
  await refreshCartBadge(false);

  const featuredGrid = document.getElementById("featured-grid");
  if (featuredGrid) {
    loadFeaturedProducts().then(products => {
      featuredGrid.innerHTML = products.map(p => renderProductCard(p, true)).join("");
    });
  }

  const brandGrid = document.getElementById("brand-grid");
  if (brandGrid) brandGrid.innerHTML = BRANDS.map(b => renderBrandCard(b, true)).join("");

  await initShopFilters();
  await initProductDetail();
  initTextRollNav();
  initNav();
  initSmoothCaret(document.getElementById("newsletter-email"));
  initSmoothCaret(document.getElementById("promo-code"));
  initSmoothCaret(document.getElementById("su-name"));
  initSmoothCaret(document.getElementById("header-search-input"));
  initSmoothCaret(document.getElementById("shop-search"));
  initHeaderSearch();
  initThemeToggle();
  initAddToCart();
  await initCartPage();
  await initCheckout();
  initPayOptions();
  initAccountTabs();
  initAccountAuth();

  // Quantity stepper on product detail page (cart page has its own wiring above)
  const pdStepper = document.querySelector(".product-detail .qty-stepper");
  if (pdStepper) {
    const minus = pdStepper.querySelector("button:first-child");
    const plus = pdStepper.querySelector("button:last-child");
    const value = pdStepper.querySelector("span");
    minus.addEventListener("click", () => {
      const current = parseInt(value.textContent, 10);
      if (current > 1) value.textContent = current - 1;
    });
    plus.addEventListener("click", () => {
      value.textContent = parseInt(value.textContent, 10) + 1;
    });
  }

  // Login/signup forms prevent their own default and handle submission for real
  // (see initAccountAuth). The newsletter form has its own inline preventDefault.
  // Deliberately NOT blocking #headerSearchForm here — it's a real GET form and
  // needs to navigate to shop.html?q=... on submit.
});
