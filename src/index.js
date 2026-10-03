const CHANNELS = { community: "@lumminercommunity", payouts: "@lumpayout" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/check-join" && request.method === "POST") return checkJoin(request, env);
    if (url.pathname === "/tonconnect-manifest.json") {
      return Response.json({ url: "https://lum-miner.gurmessa747.workers.dev", name: "LUM Miner", iconUrl: "https://ton.org/download/ton_symbol.png" });
    }
    return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
};

async function checkJoin(request, env) {
  if (!env.BOT_TOKEN) return Response.json({ ok: false, error: "BOT_TOKEN secret is missing" }, { status: 500 });
  const body = await request.json().catch(() => ({}));
  const chat = CHANNELS[body.task];
  if (!chat) return Response.json({ ok: false, error: "Unknown task" }, { status: 400 });
  const user = await telegramUser(body.initData || request.headers.get("X-Telegram-Init-Data") || "", env.BOT_TOKEN);
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

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>LUM Miner</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://unpkg.com/@tonconnect/ui@2.0.9/dist/tonconnect-ui.min.js"></script>
  <style>
    :root { --bg:#0c1016; --card:#171c24; --line:#2a3340; --text:#f4f7fb; --muted:#9aa6b5; --green:#2fce4a; }
    * { box-sizing:border-box; } body { margin:0; font-family:system-ui,sans-serif; background:var(--bg); color:var(--text); }
    .app { max-width:430px; margin:0 auto; min-height:100vh; padding:14px 14px 96px; }
    .page { display:none; } .page.on { display:block; } h1 { font-size:28px; margin:4px 0; }
    .label, .note, .addr { color:var(--muted); } .green { color:var(--green); font-weight:700; }
    button.btn, button.watch, button.go, button.claim, button.action, button.pill, button.ad { border:0; background:var(--green); color:#06210c; font-weight:800; border-radius:12px; }
    button.btn, button.watch, button.go, button.claim, button.action, button.ad { width:100%; padding:12px; } button.ad { margin-top:10px; }
    button.go.done, button.watch:disabled, button.pill:disabled { background:#1e3a28; color:#9ed7ae; }
    .card, .top, .fcard { background:#171c24; border:1px solid var(--line); border-radius:16px; padding:14px; margin-bottom:12px; }
    .fcard, .row, .user, .adhead, .bank { display:flex; gap:10px; align-items:center; justify-content:space-between; }
    .avatar { width:42px; height:42px; border-radius:12px; background:var(--green); color:#06210c; font-weight:800; display:flex; align-items:center; justify-content:center; }
    .grow { flex:1; } .addr { font-size:12px; word-break:break-all; }
    button.pill { border-radius:999px; padding:10px 14px; } .top { display:grid; grid-template-columns:1fr 1fr; } .bank { grid-column:1 / -1; }
    .track, .bar { height:8px; background:#243044; border-radius:99px; overflow:hidden; flex:1; } .fill, .bar i { display:block; height:100%; background:var(--green); }
    .wallet-wrap, .claim-num { text-align:center; } .claim-num { font-size:34px; font-weight:800; }
    .stage { position:relative; height:230px; display:flex; align-items:center; justify-content:center; }
    .mark { width:180px; height:180px; border-radius:50%; background:radial-gradient(circle at 50% 42%, #b6ff4a, #39e023 42%, #0b8f12); box-shadow:inset 0 0 0 12px #071208; position:relative; }
    .mark:before, .mark:after, .mark span { content:""; position:absolute; background:#111; border-radius:40px; }
    .mark:before { width:44px; height:74px; left:68px; top:36px; } .mark:after { width:32px; height:58px; left:40px; top:58px; transform:rotate(-28deg); } .mark span { width:32px; height:58px; right:40px; top:58px; transform:rotate(28deg); }
    .side { position:absolute; right:0; display:flex; flex-direction:column; gap:8px; } .side button { width:40px; height:40px; border:0; border-radius:50%; background:#2a3646; color:#fff; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; } .pack { background:#141b24; border:1px solid #2a3948; border-radius:16px; padding:12px; }
    select { width:100%; margin-top:8px; padding:12px; border-radius:12px; border:1px solid var(--line); background:#0f131b; color:var(--text); }
    .nav { position:fixed; left:0; right:0; bottom:0; display:flex; background:#0d1218; border-top:1px solid #242424; padding:10px 4px 14px; }
    .nav button { flex:1; background:transparent; border:0; color:var(--muted); display:flex; flex-direction:column; align-items:center; gap:4px; font-size:14px; font-weight:700; }
    .nav .ico { font-size:26px; line-height:1; } .nav button.on { color:var(--green); }
  </style>
</head>
<body>
  <div class="app">
    <section id="home" class="page on">
      <div class="top"><div><div class="label" data-i="rate">MINING RATE</div><div id="hashrate">0.00200 TH/s</div></div><div><div class="label" data-i="rank">CURRENT RANK</div><div id="rank">Level 1</div></div><div class="bank"><span id="status">Mining</span><div class="track"><div class="fill" id="bank-fill"></div></div><span id="live">live</span></div></div>
      <div class="wallet-wrap"><b id="held">0.00000000 LUM</b><div class="note">Claimed in app</div></div>
      <div class="stage"><div class="mark"><span></span></div><div class="side"><button id="help">?</button><button id="copy-addr">Lx</button></div></div>
      <div class="claim-num" id="reward">+0.00000000</div>
      <button class="claim" id="claim">Claim</button>
      <button class="ad" id="ad">Watch boost +0.0002 TH/s (+1h)</button>
    </section>
    <section id="tasks" class="page">
      <h1 data-i="tasks">Tasks</h1>
      <div class="card"><div class="adhead"><b data-i="ads">Watch Ads</b><span class="green" id="ad-meta">0/10</span></div><div class="note" id="ad-left2">10 left today</div><div class="bar"><i id="ad-bar"></i></div><button class="watch" id="watch">Watch Ad (+15 LUM)</button></div>
      <div class="card"><div class="row"><b>Join LUM Community</b><span class="green">+50 LUM</span></div><button class="go" data-task="community" data-url="https://t.me/lumminercommunity" data-reward="50">GO</button></div>
      <div class="card"><div class="row"><b>Join LUM payouts</b><span class="green">+50 LUM</span></div><button class="go" data-task="payouts" data-url="https://t.me/lumpayout" data-reward="50">GO</button></div>
      <div class="card"><div class="row"><b>Connect TON wallet</b><span class="green">+100 LUM</span></div><button class="go" id="task-wallet" data-reward="100">GO</button></div>
      <div class="card"><div class="row"><b>Share invite</b><span class="green">+50 LUM</span></div><button class="go" id="task-share" data-reward="50">GO</button></div>
    </section>
    <section id="boost" class="page">
      <h1 data-i="boost">Boost</h1>
      <div id="boost-level">Level 1</div>
      <div class="row" style="margin:10px 0"><button class="btn" id="prev">Prev</button><span id="page-label"></span><button class="btn" id="next">Next</button></div>
      <div class="grid" id="packs"></div>
    </section>
    <section id="friends" class="page">
      <h1 data-i="friends">Friends</h1>
      <div class="fcard"><div class="grow"><b data-i="invite">Your Invite Link</b><div class="addr">https://t.me/lumeonminer_bot?start=ref</div></div><button class="pill" id="invite" data-i="copy">Copy</button></div>
      <button class="btn" id="share" data-i="share">Share</button>
    </section>
    <section id="profile" class="page">
      <h1 data-i="profile">Profile</h1>
      <div class="card user"><div class="avatar" id="avatar">L</div><div class="grow"><b id="uname">Miner</b><div class="note" id="handle"></div></div></div>
      <div id="ton-connect"></div>
      <div class="card"><div class="row"><b data-i="holding">Holding Wallet</b><b id="bal">0 LUM</b></div></div>
      <div class="card"><div class="row"><b data-i="mined">Mining Wallet</b><b id="mined">0 LUM</b></div></div>
      <div class="card"><b data-i="lang">Language</b><select id="lang"><option value="en">English</option><option value="hi">हिन्दी</option><option value="id">Bahasa Indonesia</option><option value="ha">Hausa</option><option value="ar">العربية</option><option value="fr">Français</option><option value="es">Español</option><option value="ru">Русский</option><option value="zh">中文</option></select></div>
      <div class="addr" id="msg"></div>
    </section>
  </div>
  <nav class="nav">
    <button class="on" data-page="home"><span class="ico">⛏️</span><span data-i="mine">Mine</span></button>
    <button data-page="tasks"><span class="ico">📋</span><span data-i="tasks">Tasks</span></button>
    <button data-page="boost"><span class="ico">⚡</span><span data-i="boost">Boost</span></button>
    <button data-page="friends"><span class="ico">👥</span><span data-i="friends">Friends</span></button>
    <button data-page="profile"><span class="ico">👤</span><span data-i="profileNav">Profile</span></button>
  </nav>
  <script>
    const I18N = { en:{rate:"MINING RATE",rank:"CURRENT RANK",tasks:"Tasks",ads:"Watch Ads",boost:"Boost",friends:"Friends",invite:"Your Invite Link",copy:"Copy",share:"Share",profile:"Profile",holding:"Holding Wallet",mined:"Mining Wallet",lang:"Language",mine:"Mine",profileNav:"Profile"} };
    const JETTON = "EQCuTahLfZSKRGP4GF02yPMnFAq-bT1XJU4Z8V1DH_5sWlmw", INVITE = "https://t.me/lumeonminer_bot?start=ref";
    const BASE = 0.002, STEP = 0.00002, MAX = 1000, PAGE = 20, CYCLE = 4*60*60*1000, KEY = "lum-miner-v2";
    let lum = 0, address = "", ads = 0, level = 1, page = 0, lang = "en", adUntil = 0, bonus = 0, claimed = 0, startedAt = Date.now();
    const $ = (id) => document.getElementById(id);
    function load(){ try { const s = JSON.parse(localStorage.getItem(KEY)||"{}"); startedAt = s.startedAt||Date.now(); level = s.level||1; ads = s.ads||0; bonus = s.bonus||0; claimed = s.claimed||0; adUntil = s.adUntil||0; lang = s.lang||"en"; $("lang").value = lang; } catch(e){} save(); }
    function save(){ localStorage.setItem(KEY, JSON.stringify({ startedAt, level, ads, bonus, claimed, adUntil, lang })); }
    function applyLang(){ document.querySelectorAll("[data-i]").forEach((el)=>{ el.textContent = (I18N[lang]&&I18N[lang][el.dataset.i])||I18N.en[el.dataset.i]||el.dataset.i; }); }
    function rateOf(n){ return BASE+(n-1)*STEP; }
    function rateNow(){ return rateOf(level)*Math.min(3,1+Math.log10(1+Math.max(0,lum))/8)+(Date.now()<adUntil?0.0002:0); }
    function elapsed(){ return Math.max(0, Date.now()-startedAt); }
    function stopped(){ return elapsed()>=CYCLE; }
    function minedNow(){ return rateNow()*Math.min(elapsed(),CYCLE)/3600000*8; }
    function renderPacks(){ const start = page*PAGE+1, end = Math.min(MAX, start+PAGE-1); $("page-label").textContent = start+"-"+end; $("packs").innerHTML = ""; for (let n = start; n <= end; n++) { const el = document.createElement("div"); el.className = "pack"; el.innerHTML = "<b>Level "+n+"</b><div class='green'>+"+rateOf(n).toFixed(5)+" TH/s</div>"; $("packs").appendChild(el); } }
    function paint(){ const off = stopped(), session = minedNow(), appBal = claimed+bonus; $("hashrate").textContent = (off?0:rateNow()).toFixed(5)+" TH/s"; $("rank").textContent = "Level "+level; $("boost-level").textContent = "Level "+level; $("held").textContent = appBal.toFixed(8)+" LUM"; $("mined").textContent = appBal.toFixed(8)+" LUM"; $("bal").textContent = lum.toFixed(4)+" LUM"; $("reward").textContent = "+"+session.toFixed(8); $("status").textContent = off?"Stopped":"Mining"; $("live").textContent = off?"stopped":"live"; $("bank-fill").style.width = Math.min(100, elapsed()/CYCLE*100)+"%"; $("claim").textContent = off?"Claim and restart":"Claim"; $("ad-meta").textContent = ads+"/10"; $("ad-left2").textContent = (10-ads)+" left today"; $("ad-bar").style.width = (ads/10*100)+"%"; $("watch").disabled = ads>=10; applyLang(); }
    load(); setInterval(paint, 1000);
    $("claim").onclick = ()=>{ claimed += minedNow(); startedAt = Date.now(); save(); paint(); };
    $("ad").onclick = ()=>{ adUntil = Date.now()+3600000; save(); paint(); };
    $("watch").onclick = ()=>{ if(ads>=10) return; ads++; bonus += 15; save(); paint(); };
    $("copy-addr").onclick = ()=>navigator.clipboard.writeText(JETTON);
    $("help").onclick = ()=>alert("Join the channel, come back, and press GO again.");
    document.querySelectorAll(".go").forEach((btn)=>btn.onclick = async ()=>{
      if (btn.classList.contains("done")) return;
      if (btn.id === "task-wallet" && !address) return document.querySelector('[data-page="profile"]').click();
      if (btn.id === "task-share") { $("share").click(); bonus += 50; btn.classList.add("done"); btn.textContent = "CLAIMED"; save(); paint(); return; }
      if (btn.dataset.task) {
        if (window.Telegram && Telegram.WebApp) Telegram.WebApp.openTelegramLink(btn.dataset.url);
        btn.textContent = "Checking...";
        await new Promise((r)=>setTimeout(r, 3000));
        try {
          const initData = (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) || "";
          const res = await fetch("/check-join", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ task: btn.dataset.task, initData }) });
          const data = await res.json();
          if (!data.ok) { btn.textContent = "Join first"; alert("Join the channel, then press GO again. " + (data.status||data.error||"")); return; }
        } catch (e) { btn.textContent = "GO"; alert("Could not check membership."); return; }
      }
      bonus += Number(btn.dataset.reward||0); btn.classList.add("done"); btn.textContent = "CLAIMED"; save(); paint();
    });
    $("prev").onclick = ()=>{ page = Math.max(0, page-1); renderPacks(); };
    $("next").onclick = ()=>{ page = Math.min(Math.ceil(MAX/PAGE)-1, page+1); renderPacks(); };
    $("invite").onclick = async ()=>{ try { await navigator.clipboard.writeText(INVITE); $("invite").textContent = "OK"; } catch(e){} };
    $("share").onclick = ()=>{ const url = "https://t.me/share/url?url="+encodeURIComponent(INVITE)+"&text="+encodeURIComponent("Mine LUM with me"); window.Telegram&&Telegram.WebApp?Telegram.WebApp.openTelegramLink(url):window.open(url,"_blank"); };
    $("lang").onchange = ()=>{ lang = $("lang").value; save(); paint(); };
    document.querySelectorAll(".nav button").forEach((btn)=>btn.onclick = ()=>{ document.querySelectorAll(".nav button").forEach((b)=>b.classList.remove("on")); document.querySelectorAll(".page").forEach((p)=>p.classList.remove("on")); btn.classList.add("on"); $(btn.dataset.page).classList.add("on"); });
    try { const u = Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user; if (u) { $("uname").textContent = u.first_name||"Miner"; $("handle").textContent = u.username?"@"+u.username:String(u.id); $("avatar").textContent = (u.first_name||"L").slice(0,1); } Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch(e){}
    const ui = new TON_CONNECT_UI.TonConnectUI({ manifestUrl:"https://lum-miner.gurmessa747.workers.dev/tonconnect-manifest.json" });
    const wbtn = document.createElement("button"); wbtn.className = "action"; wbtn.textContent = "Connect Wallet"; wbtn.onclick = ()=>ui.openModal();
    $("ton-connect").appendChild(wbtn);
    ui.onStatusChange(async (wallet)=>{ address = wallet&&wallet.account?wallet.account.address:""; wbtn.textContent = address?"Wallet connected":"Connect Wallet"; if (!address){ lum = 0; paint(); return; } try { const res = await fetch("https://tonapi.io/v2/accounts/"+encodeURIComponent(address)+"/jettons/"+encodeURIComponent(JETTON)); const data = await res.json(); lum = Number(data.balance||"0")/Math.pow(10,(data.jetton&&data.jetton.decimals)||9); } catch(e){ $("msg").textContent = "Could not read LUM balance"; } paint(); });
    renderPacks(); paint();
  </script>
</body>
</html>`;
