// ============================================================
// Supabase client + data-access helpers.
//
// Loaded via CDN (see the <script> tag added to each page, right
// before this file) — this project has no build step, so there is
// no import/require here, only the browser global the CDN bundle
// attaches: window.supabase.createClient(...).
//
// SECURITY: SUPABASE_PUBLISHABLE_KEY below is the public
// "publishable" key (Supabase's modern name for the anon key).
// It is safe to ship in client-side code — every table it touches
// is protected by Row Level Security. The service_role/secret key
// must never appear in this file or anywhere else in this project.
// ============================================================

const SUPABASE_URL = "https://oakqchukpvgcskkdjdoe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3W8TerFgZbIYLMHOKZrnGA_T39ZAENF";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ---------- Auth ----------

async function sbGetSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) return null;
  return data.session;
}

function sbOnAuthStateChange(callback) {
  const { data } = sb.auth.onAuthStateChange((event, session) => callback(event, session));
  return data.subscription;
}

// Creates the row in `profiles` for a user the first time we see them with
// a real session. Signup may not return a session immediately (email
// confirmation can be required), so this is called again on sign-in and on
// page load rather than relying on signUp() alone.
async function sbEnsureProfile(user) {
  if (!user) return;
  const fullName = user.user_metadata && user.user_metadata.full_name ? user.user_metadata.full_name : null;
  // ignoreDuplicates: only inserts if missing, never overwrites an existing profile.
  await sb.from("profiles").upsert(
    { id: user.id, full_name: fullName },
    { onConflict: "id", ignoreDuplicates: true }
  );
}

async function sbSignUp(email, password, fullName) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { error };
  if (data.session && data.user) await sbEnsureProfile(data.user);
  return { data };
}

async function sbSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error };
  if (data.session && data.user) await sbEnsureProfile(data.user);
  return { data };
}

async function sbSignOut() {
  return sb.auth.signOut();
}

// ---------- Products ----------
// Maps a Supabase products row (with joined category name) onto the shape
// the rest of the site already renders: { id, name, cat, price, was,
// rating, reviews, inStock }. This keeps renderProductCard/initShopFilters
// unchanged — only the data source moves.
function sbMapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    cat: (row.categories && row.categories.name) ? row.categories.name : "Uncategorized",
    price: Number(row.price),
    was: row.old_price != null ? Number(row.old_price) : null,
    rating: row.rating != null ? Number(row.rating) : null,
    reviews: row.review_count || 0,
    inStock: (row.stock || 0) > 0,
    stock: row.stock || 0,
    description: row.description || null,
    imageUrl: row.image_url || null,
  };
}

const PRODUCT_SELECT = "id, name, description, price, old_price, stock, rating, review_count, image_url, featured, created_at, categories(name)";

async function sbFetchProducts({ featuredOnly = false } = {}) {
  let query = sb.from("products").select(PRODUCT_SELECT);
  if (featuredOnly) query = query.eq("featured", true);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(sbMapProduct);
}

async function sbFetchProductById(id) {
  const { data, error } = await sb.from("products").select(PRODUCT_SELECT).eq("id", id).single();
  if (error) throw error;
  return sbMapProduct(data);
}

// ---------- Cart (Supabase-backed — logged-in users only) ----------
// Anonymous cart state is handled separately, in script.js, purely in
// memory. These functions are only ever called once a session exists.

async function sbGetCartItems(userId) {
  const { data, error } = await sb
    .from("cart_items")
    .select(`id, quantity, product_id, products (${PRODUCT_SELECT})`)
    .eq("user_id", userId);
  if (error) throw error;
  return data
    .filter(row => row.products) // guard against a product having been deleted
    .map(row => ({
      cartItemId: row.id,
      qty: row.quantity,
      product: sbMapProduct(row.products),
    }));
}

async function sbAddToCart(userId, productId, qtyToAdd = 1) {
  const { data: existing, error: fetchErr } = await sb
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  if (existing) {
    const { error } = await sb
      .from("cart_items")
      .update({ quantity: existing.quantity + qtyToAdd })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await sb
      .from("cart_items")
      .insert({ user_id: userId, product_id: productId, quantity: qtyToAdd });
    if (error) throw error;
  }
}

async function sbSetCartQty(userId, productId, qty) {
  if (qty <= 0) return sbRemoveCartItem(userId, productId);
  const { error } = await sb
    .from("cart_items")
    .update({ quantity: qty })
    .eq("user_id", userId)
    .eq("product_id", productId);
  if (error) throw error;
}

async function sbRemoveCartItem(userId, productId) {
  const { error } = await sb
    .from("cart_items")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId);
  if (error) throw error;
}

// ---------- Orders ----------
// `items` must carry prices resolved fresh from sbGetCartItems/sbFetchProducts
// just before calling this — never a stale client-cached number — since this
// is what gets recorded as the order's line items and total.
//
// NOTE: this is two sequential inserts (orders, then order_items), not one
// atomic transaction — the client can't do multi-table transactions over
// plain REST calls. If the second insert fails after the first succeeds,
// you'd be left with an order row with no line items. Given payment
// processing itself is still a placeholder at this stage, that's a real but
// low-stakes gap; worth revisiting with a Postgres function (RPC) once
// checkout is wired to an actual payment gateway.
async function sbCreateOrder({ userId, shipping, paymentMethod, items }) {
  if (!items.length) throw new Error("Cannot place an order with an empty cart.");

  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  const deliveryFee = 2500;
  const total = subtotal + deliveryFee;

  const { data: order, error: orderErr } = await sb
    .from("orders")
    .insert({
      user_id: userId,
      status: "pending",
      payment_method: paymentMethod,
      payment_status: "unpaid",
      subtotal,
      delivery_fee: deliveryFee,
      total,
      shipping_name: shipping.name,
      shipping_phone: shipping.phone,
      shipping_address: shipping.address,
      shipping_city: shipping.city,
      shipping_state: shipping.state,
    })
    .select()
    .single();
  if (orderErr) throw orderErr;

  const orderItemRows = items.map(i => ({
    order_id: order.id,
    product_id: i.product.id,
    product_name: i.product.name,
    unit_price: i.product.price,
    quantity: i.qty,
    line_total: i.product.price * i.qty,
  }));
  const { error: itemsErr } = await sb.from("order_items").insert(orderItemRows);
  if (itemsErr) throw itemsErr;

  // Clear the cart now that its contents are captured in the order.
  await sb.from("cart_items").delete().eq("user_id", userId);

  return order;
}
