const CHANNELS = { community: "@lumminercommunity", payouts: "@lumpayout" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/check-join" && request.method === "POST") return checkJoin(request, env);
    if (url.pathname === "/tonconnect-manifest.json") {
      return Response.json({ url: "https://lum-miner.gurmessa747.workers.dev", name: "LUM Miner", iconUrl: "https://ton.org/download/ton_symbol.png" });
    }
    return env.ASSETS.fetch(request);
  }
};

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
