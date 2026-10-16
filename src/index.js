const CHANNELS = { 
  community: "@lumminercommunity", 
  payouts: "@lumpayout",
  gramapps: "@gramminiappsmining",
  grammoney: "@Grammoneywallet"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/check-join") return handleJoin(request, env);
    if (url.pathname === "/withdraw") return handleWithdraw(request, env);
    if (url.pathname === "/admin") return handleAdmin(request, env);

    return env.ASSETS.fetch(request);
  }
};

function userFrom(initData) {
  try { return JSON.parse(new URLSearchParams(initData || "").get("user") || "{}"); }
  catch (e) { return {}; }
}

async function read(env, key) {
  const raw = await env.REFERRALS.get(key);
  return raw ? JSON.parse(raw) : null;
}
async function write(env, key, value) {
  await env.REFERRALS.put(key, JSON.stringify(value));
}

async function handleJoin(request, env) {
  const body = await request.json();
  const user = userFrom(body.initData);
  const chat = CHANNELS[body.task];
  if (!user.id || !chat) return Response.json({ ok: false, error: "Bad task" });
  if (!env.BOT_TOKEN) return Response.json({ ok: false, error: "Bot token missing" });

  const res = await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/getChatMember?chat_id=" + encodeURIComponent(chat) + "&user_id=" + user.id);
  const data = await res.json();
  const status = data.result && data.result.status;
  const ok = status === "member" || status === "administrator" || status === "creator";
  return Response.json({ ok, status: status || data.description });
}

async function handleWithdraw(request, env) {
  if (request.method === "GET") {
    const id = new URL(request.url).searchParams.get("id");
    const row = id ? await read(env, "wd:" + id) : null;
    return Response.json({ items: (row && row.items) || [] });
  }

  const body = await request.json();
  const id = String(userFrom(body.initData).id || "");
  const amount = Number(body.amount || 0);
  if (!id || amount < 10000) return Response.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const row = (await read(env, "wd:" + id)) || { items: [] };
  row.items.unshift({ 
    net: amount - 1000, 
    status: "pending", 
    wallet: body.wallet || "", 
    time: Date.now() 
  });
  await write(env, "wd:" + id, row);

  // Notify admin
  if (env.BOT_TOKEN && env.ADMIN_CHAT_ID) {
    const text = `New withdrawal\nUser: ${id}\nAmount: ${amount - 1000} LUM\nWallet: ${body.wallet}`;
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.ADMIN_CHAT_ID, text })
    }).catch(() => {});
  }

  return Response.json({ ok: true, items: row.items });
}

async function handleAdmin(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== "761418905") {
    return new Response("Unauthorized", { status: 401 });
  }

  if (request.method === "GET") {
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head><title>LUM Admin</title></head>
      <body style="font-family:system-ui;padding:24px;max-width:600px;margin:auto">
        <h2>LUM Withdrawal Admin</h2>
        <p>Enter User ID and item index (0 = newest) to mark as paid.</p>
        <form method="POST">
          <input name="userId" placeholder="User Telegram ID" required style="width:100%;padding:10px;margin:8px 0">
          <input name="index" type="number" placeholder="Index (0 = newest)" required style="width:100%;padding:10px;margin:8px 0">
          <button style="padding:12px 20px;background:#2fce4a;border:0;border-radius:8px;font-weight:bold">Mark as Paid</button>
        </form>
      </body>
      </html>
    `, { headers: { "Content-Type": "text/html" } });
  }

  if (request.method === "POST") {
    const form = await request.formData();
    const userId = form.get("userId");
    const index = Number(form.get("index") || 0);
    const row = await read(env, "wd:" + userId);
    if (!row || !row.items[index]) return new Response("Withdrawal not found");
    row.items[index].status = "paid";
    await write(env, "wd:" + userId, row);
    return new Response("Marked as paid. You can close this page.");
  }

  return new Response("Method not allowed", { status: 405 });
      }
