const CHANNELS = { community: "@lumminercommunity", payouts: "@lumpayout" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/check-join" && request.method === "POST") return checkJoin(request, env);
    if (url.pathname === "/referral") return referral(request, env);
    if (url.pathname === "/tonconnect-manifest.json") {
      return Response.json({ url: "https://lum-miner.gurmessa747.workers.dev", name: "LUM Miner", iconUrl: "https://ton.org/download/ton_symbol.png" });
    }
    return env.ASSETS.fetch(request);
  }
};

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
  if (!hash) return null;
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
