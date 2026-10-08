const CHANNELS = { community: "@lumminercommunity", payouts: "@lumpayout" };
const MIN_WITHDRAW = 10000;
const WITHDRAW_FEE = 1000;
const CYCLE = 4 * 60 * 60 * 1000;
const TOP = 5000000;
const RATIO = Math.pow(TOP / 40, 1 / 99);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/check-join" && request.method === "POST") return checkJoin(request, env);
    if (url.pathname === "/referral") return referral(request, env);
    if (url.pathname === "/mine") return mine(request, env);
    if (url.pathname === "/withdraw") return withdraw(request, env);
    if (url.pathname === "/admin") return adminPage(request, env);
    if (url.pathname === "/admin/withdrawals") return adminWithdrawals(request, env);
    if (url.pathname === "/tonconnect-manifest.json") {
      return Response.json({ url: "https://lum-miner.gurmessa747.workers.dev", name: "LUM Miner", iconUrl: "https://ton.org/download/ton_symbol.png" });
    }
    return env.ASSETS.fetch(request);
  }
};

function costOf(n) { if (n <= 1) return 0; if (n >= 100) return TOP; return Math.round(40 * Math.pow(RATIO, n - 1)); }
function levelFromBalance(amount) { let best = 1; for (let n = 2; n <= 100; n++) { if (costOf(n) <= amount) best = n; else break; } return best; }
function stepAt(n) { if (n <= 20) return 0.1; if (n <= 40) return 0.2; if (n <= 60) return 0.3; if (n <= 80) return 0.4; return 1; }
function rateOf(n) { let rate = 1; for (let i = 2; i <= n; i++) rate += stepAt(i); return Math.round(rate * 100) / 100; }
function sessionOf(state) {
  const elapsed = Math.max(0, Date.now() - (state.startedAt || Date.now()));
  const rate = rateOf(levelFromBalance((state.claimed || 0) + (state.bonus || 0)));
  return rate * Math.min(elapsed, CYCLE) / 3600000 * 8;
}
function purse(state) { return (state.claimed || 0) + (state.bonus || 0); }

function crc16(bytes) {
  let reg = 0;
  for (const b of bytes) {
    reg ^= b << 8;
    for (let i = 0; i < 8; i++) reg = (reg & 0x8000) ? ((reg << 1) ^ 0x1021) & 0xffff : (reg << 1) & 0xffff;
  }
  return reg;
}
function toFriendly(address) {
  const raw = String(address || "");
  if (!raw.includes(":")) return raw;
  const [wc, hex] = raw.split(":");
  if (!hex || hex.length !== 64) return raw;
  const body = new Uint8Array(34);
  body[0] = 0x11;
  body[1] = Number(wc) & 0xff;
  for (let i = 0; i < 32; i++) body[2 + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const crc = crc16(body);
  const full = new Uint8Array(36);
  full.set(body);
  full[34] = (crc >> 8) & 0xff;
  full[35] = crc & 0xff;
  return btoa(String.fromCharCode(...full)).replaceAll("+", "-").replaceAll("/", "_");
}

async function mine(request, env) {
  if (!env.REFERRALS) return Response.json({ ok: false, error: "KV missing" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const user = await telegramUser(body.initData || "", env.BOT_TOKEN);
  if (!user) return Response.json({ ok: false, error: "Open this inside Telegram" }, { status: 401 });
  const key = "bal:" + user.id;
  const state = await env.REFERRALS.get(key, "json") || { claimed: 0, bonus: 0, startedAt: Date.now(), ads: 0, adDay: "", doneTasks: [] };
  const today = new Date().toISOString().slice(0, 10);
  if (state.adDay !== today) { state.ads = 0; state.adDay = today; }
  if (body.action === "claim") {
    state.claimed = (state.claimed || 0) + sessionOf(state);
    state.startedAt = Date.now();
  }
  if (body.action === "ad") {
    if (state.ads >= 10) return Response.json({ ok: false, error: "Ad limit reached" }, { status: 400 });
    state.ads += 1;
    state.bonus = (state.bonus || 0) + 15;
  }
  if (body.action === "task" && CHANNELS[body.task] && !(state.doneTasks || []).includes(body.task)) {
    state.doneTasks = state.doneTasks || [];
    state.doneTasks.push(body.task);
    state.bonus = (state.bonus || 0) + 50;
  }
  if (body.action === "referral") {
    const paid = Number(body.paid || 0);
    if (paid > 0 && paid <= 100) state.bonus = (state.bonus || 0) + paid * 1000;
  }
  await env.REFERRALS.put(key, JSON.stringify(state));
  const level = levelFromBalance(purse(state));
  return Response.json({ ok: true, balance: purse(state), session: sessionOf(state), rate: rateOf(level), level, ads: state.ads, doneTasks: state.doneTasks || [], startedAt: state.startedAt });
}

async function markPaid(env, all, id) {
  const item = all.find((x) => x.id === id);
  if (!item) return false;
  item.status = "paid";
  await env.REFERRALS.put("wd:all", JSON.stringify(all));
  const userData = await env.REFERRALS.get("wd:" + item.userId, "json") || { items: [] };
  const mineItem = userData.items.find((x) => x.id === item.id);
  if (mineItem) mineItem.status = "paid";
  await env.REFERRALS.put("wd:" + item.userId, JSON.stringify(userData));
  return true;
}

async function adminPage(request, env) {
  if (!env.REFERRALS) return new Response("KV missing", { status: 500 });
  const url = new URL(request.url);
  if (String(url.searchParams.get("key")) !== String(env.ADMIN_ID)) return new Response("no", { status: 401 });
  const key = url.searchParams.get("key");
  const all = await env.REFERRALS.get("wd:all", "json") || [];
  const paidId = url.searchParams.get("paid");
  if (paidId) {
    await markPaid(env, all, paidId);
    return Response.redirect(url.origin + "/admin?key=" + encodeURIComponent(key), 302);
  }
  const rows = all.map((x) => {
    const button = x.status === "pending" ? "<a href='/admin?key=" + encodeURIComponent(key) + "&paid=" + x.id + "'>Mark paid</a>" : "<span class='ok'>" + x.status + "</span>";
    return "<div class='card'><b>" + x.name + "</b> <span class='ok'>ID " + x.userId + "</span><div class='addr'>" + x.wallet + "</div><div>send " + x.net + " LUM · fee " + x.fee + "</div><div>" + button + "</div></div>";
  }).join("") || "<p>No requests</p>";
  const html = "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{font-family:system-ui;background:#0c1016;color:#fff;padding:16px}a{display:block;background:#2f80ed;color:#fff;text-align:center;padding:12px;border-radius:12px;text-decoration:none;margin-top:8px}.card{border:1px solid #2a3340;border-radius:12px;padding:12px;margin:10px 0}.addr{word-break:break-all;color:#9aa6b5}.ok{color:#2fce4a;font-weight:700}</style><h1>LUM payouts</h1>" + rows;
  return new Response(html, { headers: { "content-type": "text/html;charset=utf-8" } });
}

async function referral(request, env) {
  if (!env.REFERRALS) return Response.json({ ok: false, error: "REFERRALS KV is missing" }, { status: 500 });
  const url = new URL(request.url);
  if (request.method === "GET") {
    const data = await env.REFERRALS.get("user:" + url.searchParams.get("id"), "json") || { friends: [] };
    return Response.json(data);
  }
  const body = await request.json().catch(() => ({}));
  const user = await telegramUser(body.initData || "", env.BOT_TOKEN);
  if (!user) return Response.json({ ok: false, error: "Open this inside Telegram" }, { status: 401 });
  if (body.action === "join" && body.inviter && String(body.inviter) !== String(user.id)) {
    await env.REFERRALS.put("who:" + user.id, JSON.stringify({ inviter: String(body.inviter) }));
    const key = "user:" + body.inviter;
    const data = await env.REFERRALS.get(key, "json") || { friends: [] };
    if (!data.friends.find((f) => f.id === user.id)) {
      data.friends.push({ id: user.id, name: user.username ? "@" + user.username : user.first_name || String(user.id), qualified: false, paid: false });
      await env.REFERRALS.put(key, JSON.stringify(data));
    }
    return Response.json({ ok: true });
  }
  if (body.action === "qualify") {
    const who = await env.REFERRALS.get("who:" + user.id, "json");
    if (!who) return Response.json({ ok: false, error: "No inviter" });
    const key = "user:" + who.inviter;
    const data = await env.REFERRALS.get(key, "json") || { friends: [] };
    const friend = data.friends.find((f) => f.id === user.id);
    if (friend) friend.qualified = true;
    await env.REFERRALS.put(key, JSON.stringify(data));
    return Response.json({ ok: true });
  }
  if (body.action === "claim") {
    const key = "user:" + user.id;
    const data = await env.REFERRALS.get(key, "json") || { friends: [] };
    let paid = 0;
    data.friends.forEach((f) => { if (f.qualified && !f.paid) { f.paid = true; paid++; } });
    await env.REFERRALS.put(key, JSON.stringify(data));
    return Response.json({ ok: true, paid, friends: data.friends });
  }
  return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
}

async function withdraw(request, env) {
  if (!env.REFERRALS) return Response.json({ ok: false, error: "REFERRALS KV is missing" }, { status: 500 });
  const url = new URL(request.url);
  if (request.method === "GET") {
    const data = await env.REFERRALS.get("wd:" + url.searchParams.get("id"), "json") || { items: [] };
    return Response.json(data);
  }
  const body = await request.json().catch(() => ({}));
  const user = await telegramUser(body.initData || "", env.BOT_TOKEN);
  if (!user) return Response.json({ ok: false, error: "Open this inside Telegram" }, { status: 401 });
  const amount = Number(body.amount);
  const wallet = toFriendly(body.wallet || "");
  if (!wallet) return Response.json({ ok: false, error: "Connect wallet first" }, { status: 400 });
  const state = await env.REFERRALS.get("bal:" + user.id, "json") || { claimed: 0, bonus: 0 };
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAW || purse(state) < amount) return Response.json({ ok: false, error: "Insufficient balance" }, { status: 400 });
  const key = "wd:" + user.id;
  const data = await env.REFERRALS.get(key, "json") || { items: [] };
  if (data.items.some((x) => x.status === "pending")) return Response.json({ ok: false, error: "You already have a pending request" }, { status: 400 });
  state.bonus = state.bonus || 0;
  state.claimed = state.claimed || 0;
  if (state.bonus >= amount) state.bonus -= amount;
  else { state.claimed -= (amount - state.bonus); state.bonus = 0; }
  await env.REFERRALS.put("bal:" + user.id, JSON.stringify(state));
  const item = { id: Date.now().toString(), userId: user.id, name: user.username ? "@" + user.username : user.first_name || String(user.id), wallet, gross: amount, fee: WITHDRAW_FEE, net: amount - WITHDRAW_FEE, status: "pending", at: new Date().toISOString() };
  data.items.unshift(item);
  await env.REFERRALS.put(key, JSON.stringify(data));
  const all = await env.REFERRALS.get("wd:all", "json") || [];
  all.unshift(item);
  await env.REFERRALS.put("wd:all", JSON.stringify(all.slice(0, 200)));
  if (env.BOT_TOKEN && env.ADMIN_ID) {
    await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.ADMIN_ID, text: "LUM withdraw\n" + item.name + "\nID " + item.userId + "\n" + item.wallet + "\nsend " + item.net + " LUM\nfee " + item.fee + "\nid " + item.id })
    });
  }
  return Response.json({ ok: true, item, items: data.items, balance: purse(state) });
}

async function adminWithdrawals(request, env) {
  if (!env.REFERRALS) return Response.json({ ok: false, error: "REFERRALS KV is missing" }, { status: 500 });
  const url = new URL(request.url);
  if (String(url.searchParams.get("key")) !== String(env.ADMIN_ID)) return new Response("no", { status: 401 });
  const all = await env.REFERRALS.get("wd:all", "json") || [];
  const paidId = url.searchParams.get("paid");
  if (paidId) return Response.json({ ok: await markPaid(env, all, paidId) });
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    return Response.json({ ok: await markPaid(env, all, body.id) });
  }
  return Response.json(all);
}

async function checkJoin(request, env) {
  if (!env.BOT_TOKEN) return Response.json({ ok: false, error: "BOT_TOKEN secret is missing" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const chat = CHANNELS[body.task];
  if (!chat) return Response.json({ ok: false, error: "Unknown task" }, { status: 400 });
  const user = await telegramUser(body.initData || "", env.BOT_TOKEN);
  if (!user) return Response.json({ ok: false, error: "Open this inside Telegram" }, { status: 401 });
  const data = await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/getChatMember?chat_id=" + encodeURIComponent(chat) + "&user_id=" + user.id).then((r) => r.json());
  const status = data.result && data.result.status;
  return Response.json({ ok: ["creator", "administrator", "member"].includes(status), status: status || data.description || "unknown" });
}

async function telegramUser(initData, token) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !token) return null;
  params.delete("hash");
  const pairs = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => k + "=" + v).join("\n");
  const enc = new TextEncoder();
  const webKey = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", webKey, enc.encode(token));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(pairs));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== hash) return null;
  return JSON.parse(params.get("user") || "null");
  }
