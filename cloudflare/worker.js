const ROOM_TTL_SECONDS = 60 * 60 * 24 * 180;
const ADMIN_REMEMBER_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/, '') || '/';

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
      }

      if (pathname === '/api/create' && request.method === 'POST') return createRoom(request, env);
      if (pathname === '/api/room' && request.method === 'GET') return roomJson(request, env);
      if (pathname === '/api/question' && request.method === 'POST') return addQuestion(request, env);
      if (pathname === '/api/vote' && request.method === 'POST') return voteQuestion(request, env);
      if (pathname === '/api/admin/login' && request.method === 'POST') return adminLogin(request, env);
      if (pathname === '/api/admin/action' && request.method === 'POST') return adminAction(request, env);

      if (pathname.startsWith('/room/')) {
        const roomId = sanitizeRoomId(decodeURIComponent(pathname.slice('/room/'.length)));
        return renderRoom(request, env, roomId);
      }

      if (pathname === '/') {
        const roomId = url.searchParams.get('room');
        if (roomId) return renderRoom(request, env, sanitizeRoomId(roomId));
        return htmlResponse(renderHome());
      }

      return htmlResponse(renderNotFound(), 404);
    } catch (error) {
      return json({ success: false, error: 'Server error', detail: String(error && error.message ? error.message : error) }, 500);
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function htmlResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

function sanitizeRoomId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 50);
}

function randomId(prefix = '', bytes = 8) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return prefix + [...data].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function kvKey(roomId) {
  return `room:${roomId}`;
}

async function loadRoom(env, roomId) {
  if (!roomId) return null;
  const data = await env.ONLINEQUESTIONS_ROOMS.get(kvKey(roomId), { type: 'json' });
  if (!data) return null;
  if (data.expiresAt && data.expiresAt < Date.now()) {
    await env.ONLINEQUESTIONS_ROOMS.delete(kvKey(roomId));
    return null;
  }
  data.questions ||= [];
  data.votes ||= {};
  data.adminTokens ||= [];
  return data;
}

async function saveRoom(env, room) {
  room.updatedAt = Date.now();
  await env.ONLINEQUESTIONS_ROOMS.put(kvKey(room.id), JSON.stringify(room), {
    expirationTtl: ROOM_TTL_SECONDS,
  });
}

function getCookies(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) continue;
    cookies[rawKey] = decodeURIComponent(rawValue.join('=') || '');
  }
  return cookies;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function adminCookieName(roomId) {
  return `oq_admin_${(await sha256Hex(roomId)).slice(0, 24)}`;
}

function cookieString(name, value, maxAge, httpOnly = true) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `Max-Age=${maxAge}`, 'SameSite=Lax', 'Secure'];
  if (httpOnly) parts.push('HttpOnly');
  return parts.join('; ');
}

function clearCookieString(name) {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly`;
}

function base64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hashPassword(password, saltBytes = null) {
  // Cloudflare Workers do not run PHP's password_hash(), and high-iteration
  // PBKDF2 can exceed the CPU budget on the free/standard Worker runtime.
  // This salted SHA-256 hash preserves admin-password behavior for the Worker
  // port while keeping the original PHP version untouched.
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const saltString = base64Url(salt);
  return {
    algorithm: 'SALTED-SHA256',
    salt: saltString,
    hash: await sha256Hex(`${saltString}:${password}`),
  };
}

async function verifyPassword(password, passwordHash) {
  if (!passwordHash || !passwordHash.salt || !passwordHash.hash) return false;
  const computed = await hashPassword(password, fromBase64Url(passwordHash.salt));
  return timingSafeEqual(computed.hash, passwordHash.hash);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function isAdmin(request, room) {
  if (!room.passwordHash) return false;
  const cookies = getCookies(request);
  const name = await adminCookieName(room.id);
  const token = cookies[name];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  let matched = false;
  room.adminTokens = (room.adminTokens || []).filter((record) => {
    if (!record.hash || !record.expiresAt || record.expiresAt <= now) return false;
    if (timingSafeEqual(record.hash, tokenHash)) {
      record.lastUsed = now;
      matched = true;
    }
    return true;
  });
  return matched;
}

async function grantAdmin(room) {
  const token = randomId('', 32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  room.adminTokens = (room.adminTokens || []).filter((record) => record.expiresAt > now).slice(-19);
  room.adminTokens.push({ hash: tokenHash, createdAt: now, lastUsed: now, expiresAt: now + ADMIN_REMEMBER_SECONDS * 1000 });
  return token;
}

function publicRoom(room, userId, admin = false) {
  const questions = [...(room.questions || [])].map((q) => ({
    ...q,
    votes: q.votes || 0,
    answered: q.answered === true,
    border_color: q.border_color || null,
    user_vote: room.votes?.[`${q.id}:${userId}`] || null,
  }));
  questions.sort(sortQuestions);
  return {
    id: room.id,
    name: room.name,
    has_password: !!room.passwordHash,
    is_admin: admin,
    questions,
  };
}

function sortQuestions(a, b) {
  const answeredA = a.answered === true;
  const answeredB = b.answered === true;
  if (answeredA !== answeredB) return answeredA ? 1 : -1;
  if ((b.votes || 0) !== (a.votes || 0)) return (b.votes || 0) - (a.votes || 0);
  return (b.timestamp || 0) - (a.timestamp || 0);
}

function getOrCreateUserCookie(request) {
  const cookies = getCookies(request);
  const existing = cookies.oq_user;
  if (existing && /^[a-f0-9]{24,64}$/.test(existing)) return { userId: existing, setCookie: null };
  const userId = randomId('', 16);
  return { userId, setCookie: cookieString('oq_user', userId, ROOM_TTL_SECONDS, true) };
}

async function createRoom(request, env) {
  const input = await parseJson(request);
  const name = String(input.room_name || '').trim().slice(0, 120);
  if (!name) return json({ success: false, error: 'Room name is required' }, 400);

  let id = sanitizeRoomId(input.room_id || '');
  if (!id) id = randomId('', 4);
  if (id.length < 3) return json({ success: false, error: 'Room ID must be at least 3 characters' }, 400);
  if (await loadRoom(env, id)) return json({ success: false, error: 'Room ID already exists' }, 409);

  const password = String(input.password || '').trim();
  const now = Date.now();
  const room = {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ROOM_TTL_SECONDS * 1000,
    questions: [],
    votes: {},
    adminTokens: [],
  };
  if (password) {
    room.passwordHash = await hashPassword(password);
    const token = await grantAdmin(room);
    await saveRoom(env, room);
    const cookieName = await adminCookieName(id);
    return json({ success: true, room_id: id, url: `/room/${id}` }, 200, {
      'Set-Cookie': cookieString(cookieName, token, ADMIN_REMEMBER_SECONDS, true),
    });
  }

  await saveRoom(env, room);
  return json({ success: true, room_id: id, url: `/room/${id}` });
}

async function roomJson(request, env) {
  const url = new URL(request.url);
  const roomId = sanitizeRoomId(url.searchParams.get('room_id') || url.searchParams.get('room') || '');
  const room = await loadRoom(env, roomId);
  if (!room) return json({ success: false, error: 'Room not found' }, 404);
  const { userId, setCookie } = getOrCreateUserCookie(request);
  const admin = await isAdmin(request, room);
  await saveRoom(env, room);
  const headers = setCookie ? { 'Set-Cookie': setCookie } : {};
  return json({ success: true, room: publicRoom(room, userId, admin) }, 200, headers);
}

async function addQuestion(request, env) {
  const input = await parseJson(request);
  const roomId = sanitizeRoomId(input.room_id || '');
  const questionText = String(input.question || '').trim().slice(0, 2000);
  if (!questionText) return json({ success: false, error: 'Question is required' }, 400);
  const room = await loadRoom(env, roomId);
  if (!room) return json({ success: false, error: 'Room not found' }, 404);
  const question = {
    id: randomId('', 8),
    text: questionText,
    timestamp: Math.floor(Date.now() / 1000),
    votes: 0,
    answered: false,
    border_color: null,
  };
  room.questions.push(question);
  await saveRoom(env, room);
  return json({ success: true, question });
}

async function voteQuestion(request, env) {
  const input = await parseJson(request);
  const roomId = sanitizeRoomId(input.room_id || '');
  const questionId = String(input.question_id || '');
  const voteType = input.vote_type === 'downvote' ? 'downvote' : 'upvote';
  const room = await loadRoom(env, roomId);
  if (!room) return json({ success: false, error: 'Room not found' }, 404);
  const question = room.questions.find((q) => q.id === questionId);
  if (!question) return json({ success: false, error: 'Question not found' }, 404);
  const { userId, setCookie } = getOrCreateUserCookie(request);
  const key = `${questionId}:${userId}`;
  const previous = room.votes[key];

  if (previous === voteType) {
    delete room.votes[key];
  } else {
    room.votes[key] = voteType;
  }

  question.votes = Object.entries(room.votes).reduce((total, [voteKey, vote]) => {
    if (!voteKey.startsWith(`${questionId}:`)) return total;
    return total + (vote === 'upvote' ? 1 : -1);
  }, 0);

  await saveRoom(env, room);
  const headers = setCookie ? { 'Set-Cookie': setCookie } : {};
  return json({ success: true, question, user_vote: room.votes[key] || null }, 200, headers);
}

async function adminLogin(request, env) {
  const input = await parseJson(request);
  const roomId = sanitizeRoomId(input.room_id || '');
  const password = String(input.password || '');
  const room = await loadRoom(env, roomId);
  if (!room || !room.passwordHash) return json({ success: false, error: 'Room not found or has no admin password' }, 404);
  if (!(await verifyPassword(password, room.passwordHash))) return json({ success: false, error: 'Invalid password' }, 401);
  const token = await grantAdmin(room);
  await saveRoom(env, room);
  const cookieName = await adminCookieName(room.id);
  return json({ success: true, room_id: room.id, url: `/room/${room.id}` }, 200, {
    'Set-Cookie': cookieString(cookieName, token, ADMIN_REMEMBER_SECONDS, true),
  });
}

async function adminAction(request, env) {
  const input = await parseJson(request);
  const roomId = sanitizeRoomId(input.room_id || '');
  const room = await loadRoom(env, roomId);
  if (!room) return json({ success: false, error: 'Room not found' }, 404);
  if (!(await isAdmin(request, room))) return json({ success: false, error: 'Admin authentication required' }, 401);

  const question = room.questions.find((q) => q.id === String(input.question_id || ''));
  if (['delete_question', 'mark_answered', 'set_color'].includes(input.action) && !question) {
    return json({ success: false, error: 'Question not found' }, 404);
  }

  if (input.action === 'delete_question') {
    room.questions = room.questions.filter((q) => q.id !== question.id);
    for (const key of Object.keys(room.votes || {})) {
      if (key.startsWith(`${question.id}:`)) delete room.votes[key];
    }
  } else if (input.action === 'mark_answered') {
    question.answered = input.answered === true;
  } else if (input.action === 'set_color') {
    const color = String(input.color || '');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return json({ success: false, error: 'Invalid color' }, 400);
    question.border_color = color;
  } else {
    return json({ success: false, error: 'Invalid action' }, 400);
  }

  await saveRoom(env, room);
  return json({ success: true });
}

async function renderRoom(request, env, roomId) {
  const room = await loadRoom(env, roomId);
  if (!room) return htmlResponse(renderNotFound(`Room “${escapeHtml(roomId)}” was not found.`), 404);
  const { userId, setCookie } = getOrCreateUserCookie(request);
  const admin = await isAdmin(request, room);
  await saveRoom(env, room);
  const data = publicRoom(room, userId, admin);
  return htmlResponse(roomHtml(data), 200, setCookie ? { 'Set-Cookie': setCookie } : {});
}

function renderHome() {
  return pageShell('Online Questions', `
    <section class="card hero">
      <p class="eyebrow">Cloudflare version</p>
      <h1>Online Questions</h1>
      <p>Create a room, share the link, collect questions, vote, and moderate with a remembered admin login.</p>
      <form id="create-form" class="stack">
        <input id="room-name" required maxlength="120" placeholder="Room name" />
        <input id="room-id" maxlength="50" pattern="[a-zA-Z0-9-]+" placeholder="Optional custom room ID" />
        <input id="room-password" type="password" placeholder="Admin password (optional)" />
        <button type="submit">Create room</button>
      </form>
    </section>
    <section class="card">
      <h2>Access a room</h2>
      <form id="access-form" class="inline-form">
        <input id="access-room" required placeholder="Room ID" />
        <button type="submit">Go</button>
      </form>
    </section>
    <script>${homeScript()}</script>
  `);
}

function roomHtml(room) {
  return pageShell(room.name, `
    <header class="room-header">
      <div>
        <p class="eyebrow">Room ${escapeHtml(room.id)}</p>
        <h1>${escapeHtml(room.name)}</h1>
      </div>
      <div class="header-actions">
        ${room.has_password && !room.is_admin ? '<button id="admin-login-open" class="secondary">Admin login</button>' : ''}
        ${room.is_admin ? '<span class="admin-pill">Admin remembered</span>' : ''}
        <button id="copy-link" class="secondary">Copy link</button>
      </div>
    </header>

    <section class="card">
      <form id="question-form" class="question-form">
        <textarea id="question-text" required maxlength="2000" placeholder="Ask a question…"></textarea>
        <button type="submit">Submit question</button>
      </form>
    </section>

    <section class="questions-section">
      <div class="section-title"><h2>Questions</h2><span id="status">Live</span></div>
      <div id="questions"></div>
    </section>

    <dialog id="admin-dialog">
      <form id="admin-login-form" method="dialog" class="stack">
        <h2>Admin login</h2>
        <input id="admin-password" type="password" required placeholder="Admin password" />
        <div class="modal-actions">
          <button type="button" id="admin-cancel" class="secondary">Cancel</button>
          <button type="submit">Log in</button>
        </div>
      </form>
    </dialog>

    <script id="room-data" type="application/json">${escapeHtml(JSON.stringify(room))}</script>
    <script>${roomScript()}</script>
  `);
}

function renderNotFound(message = 'That page was not found.') {
  return pageShell('Not found', `<section class="card"><h1>Not found</h1><p>${message}</p><p><a href="/">Create or access a room</a></p></section>`);
}

function pageShell(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Online Questions</title>
  <style>${styles()}</style>
</head>
<body>
  <main class="container">${content}</main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function styles() {
  return `
:root{color-scheme:dark;--bg:#070816;--card:#111427;--muted:#9ba3b4;--text:#f7f8fb;--line:#262b44;--accent:#7c3aed;--accent2:#06b6d4;--danger:#ef4444;--ok:#22c55e}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top left,#20114d,transparent 36rem),linear-gradient(135deg,#060713,#10142a);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.container{width:min(980px,92vw);margin:0 auto;padding:48px 0}.card{background:rgba(17,20,39,.84);border:1px solid var(--line);box-shadow:0 24px 80px rgba(0,0,0,.35);border-radius:24px;padding:24px;margin:18px 0}.hero{padding:36px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;color:var(--accent2);font-size:.76rem;font-weight:800}h1{font-size:clamp(2rem,8vw,4.5rem);line-height:.95;margin:.2em 0}h2{margin:0 0 12px}p{color:var(--muted);line-height:1.6}a{color:#93c5fd}input,textarea{width:100%;border:1px solid var(--line);background:#090b18;color:var(--text);border-radius:14px;padding:14px 16px;font:inherit}textarea{min-height:110px;resize:vertical}button{border:0;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;padding:13px 18px;font-weight:800;cursor:pointer}button.secondary{background:#1b2038;color:#dbeafe;border:1px solid var(--line)}button.danger{background:rgba(239,68,68,.18);color:#fecaca;border:1px solid rgba(239,68,68,.35)}button:disabled{opacity:.55;cursor:not-allowed}.stack{display:grid;gap:12px}.inline-form{display:grid;grid-template-columns:1fr auto;gap:12px}.room-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}.header-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.admin-pill{display:inline-flex;align-items:center;border:1px solid rgba(34,197,94,.35);color:#bbf7d0;background:rgba(34,197,94,.12);border-radius:999px;padding:10px 14px;font-weight:800}.question-form{display:grid;gap:12px}.section-title{display:flex;align-items:center;justify-content:space-between;margin:28px 0 14px}.section-title span{color:var(--muted);font-size:.9rem}.question{display:grid;grid-template-columns:auto 1fr;gap:16px;border:1px solid var(--line);background:rgba(17,20,39,.78);border-left:5px solid #7c3aed;border-radius:20px;padding:18px;margin:12px 0}.question.answered{opacity:.68}.votes{display:grid;gap:8px;align-content:start;justify-items:center}.vote-count{font-weight:900}.question-text{white-space:pre-wrap;line-height:1.55}.meta{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:12px;color:var(--muted);font-size:.86rem}.admin-controls{display:flex;gap:8px;flex-wrap:wrap}.answered-badge{display:inline-flex;margin-bottom:8px;border-radius:999px;background:rgba(34,197,94,.12);color:#bbf7d0;border:1px solid rgba(34,197,94,.35);padding:4px 8px;font-size:.78rem;font-weight:800}dialog{border:1px solid var(--line);border-radius:24px;background:var(--card);color:var(--text);padding:24px;max-width:420px;width:92vw}dialog::backdrop{background:rgba(0,0,0,.65)}.modal-actions{display:flex;justify-content:flex-end;gap:10px}.empty{color:var(--muted);border:1px dashed var(--line);border-radius:18px;padding:28px;text-align:center}@media(max-width:720px){.room-header,.meta{display:grid}.inline-form{grid-template-columns:1fr}.header-actions{justify-content:flex-start}.question{grid-template-columns:1fr}.votes{display:flex}}
  `;
}

function homeScript() {
  return `
const createForm=document.getElementById('create-form');
const accessForm=document.getElementById('access-form');
createForm.addEventListener('submit',async e=>{e.preventDefault();const btn=createForm.querySelector('button');btn.disabled=true;try{const res=await fetch('/api/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_name:document.getElementById('room-name').value,room_id:document.getElementById('room-id').value,password:document.getElementById('room-password').value})});const data=await res.json();if(!data.success)throw new Error(data.error||'Failed');location.href=data.url;}catch(err){alert(err.message);}finally{btn.disabled=false;}});
accessForm.addEventListener('submit',e=>{e.preventDefault();const id=document.getElementById('access-room').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'');if(id)location.href='/room/'+encodeURIComponent(id);});
  `;
}

function roomScript() {
  return `
let room=JSON.parse(document.getElementById('room-data').textContent);let polling=false;let timer=null;
const questionsEl=document.getElementById('questions');const statusEl=document.getElementById('status');
function esc(s){return String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function fmt(ts){return new Date((ts||0)*1000).toLocaleString();}
function render(){questionsEl.innerHTML=room.questions.length?room.questions.map(q=>'<article class="question '+(q.answered?'answered':'')+'" data-id="'+esc(q.id)+'" style="border-left-color:'+(q.border_color||'#7c3aed')+'"><div class="votes"><button class="secondary vote" data-vote="upvote">▲</button><span class="vote-count">'+(q.votes||0)+'</span><button class="secondary vote" data-vote="downvote">▼</button></div><div><div>'+(q.answered?'<span class="answered-badge">Answered</span>':'')+'</div><div class="question-text">'+esc(q.text)+'</div><div class="meta"><span>'+fmt(q.timestamp)+'</span>'+(room.is_admin?'<span class="admin-controls"><button class="secondary admin" data-action="mark_answered">'+(q.answered?'Mark unanswered':'Mark answered')+'</button><input class="color" type="color" value="'+(q.border_color||'#7c3aed')+'" title="Color"/><button class="danger admin" data-action="delete_question">Delete</button></span>':'')+'</div></div></article>').join(''):'<div class="empty">No questions yet.</div>';}
async function refresh(){if(document.hidden||polling)return;polling=true;try{const res=await fetch('/api/room?room_id='+encodeURIComponent(room.id)+'&t='+Date.now(),{cache:'no-store',credentials:'same-origin'});const data=await res.json();if(data.success){room=data.room;render();statusEl.textContent='Live';}else{statusEl.textContent=data.error||'Error';}}catch(e){statusEl.textContent='Offline';console.error(e);}finally{polling=false;}}
render();timer=setInterval(refresh,3000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
document.getElementById('copy-link').addEventListener('click',async()=>{await navigator.clipboard.writeText(location.href);statusEl.textContent='Copied';});
document.getElementById('question-form').addEventListener('submit',async e=>{e.preventDefault();const text=document.getElementById('question-text');const res=await fetch('/api/question',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room_id:room.id,question:text.value})});const data=await res.json();if(data.success){text.value='';await refresh();}else alert(data.error||'Failed');});
questionsEl.addEventListener('click',async e=>{const article=e.target.closest('.question');if(!article)return;const id=article.dataset.id;if(e.target.matches('.vote')){await fetch('/api/vote',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({room_id:room.id,question_id:id,vote_type:e.target.dataset.vote})});refresh();}if(e.target.matches('.admin')){const action=e.target.dataset.action;const payload={room_id:room.id,question_id:id,action};if(action==='mark_answered')payload.answered=!article.classList.contains('answered');if(action==='delete_question'&&!confirm('Delete this question?'))return;const res=await fetch('/api/admin/action',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});const data=await res.json();if(!data.success)alert(data.error||'Failed');refresh();}});
questionsEl.addEventListener('change',async e=>{const article=e.target.closest('.question');if(!article||!e.target.matches('.color'))return;await fetch('/api/admin/action',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({room_id:room.id,question_id:article.dataset.id,action:'set_color',color:e.target.value})});refresh();});
const open=document.getElementById('admin-login-open'),dialog=document.getElementById('admin-dialog');if(open)open.addEventListener('click',()=>dialog.showModal());document.getElementById('admin-cancel').addEventListener('click',()=>dialog.close());document.getElementById('admin-login-form').addEventListener('submit',async e=>{e.preventDefault();const res=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({room_id:room.id,password:document.getElementById('admin-password').value})});const data=await res.json();if(data.success)location.reload();else alert(data.error||'Invalid password');});
  `;
}
