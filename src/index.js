const CHANNELS = {
  community: "@lumminercommunity",
  payouts: "@lumpayout",
  gramapps: "@gramminiappsmining",
  grammoney: "@Grammoneywallet"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/verify-turnstile") {
      return handleTurnstile(request, env);
    }

    if (url.pathname === "/check-join") return handleJoin(request, env);

    return env.ASSETS.fetch(request);
  }
};

async function handleTurnstile(request, env) {
  const body = await request.json();
  const token = body.token;
  if (!token || !env.TURNSTILE_SECRET) {
    return Response.json({ ok: false, error: "Missing token or secret" });
  }

  const form = new URLSearchParams();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const data = await res.json();
  return Response.json({ ok: data.success });
}

function userFrom(initData) {
  try { return JSON.parse(new URLSearchParams(initData || "").get("user") || "{}"); }
  catch (e) { return {}; }
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
