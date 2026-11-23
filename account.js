// Color War 账号模块（网页版）：登录/注册、战绩与本地复盘、排行榜、好友、邀请联机。
// 和 iOS 版共用同一套服务器接口（/api/*）。只通过 hooks 读取游戏状态，不改游戏逻辑。

const TOKEN_KEY = 'CW_Account_Token';
const PENDING_KEY = 'CW_Account_PendingMatches';
const LOCAL_HISTORY_KEY = 'CW_Local_MatchHistory';
const REPLAYS_KEY = 'CW_Replays';
const PERIODS = [['week', '周榜'], ['month', '月榜'], ['season', '季榜'], ['year', '年榜']];
const BOT_NAMES = { mathNightmare: 'Bot 1', enhancedNightmare: 'Bot 2', driveBot: 'Bot 3' };

export function encodeFrame(board) {
    let out = '';
    for (const row of board) for (const cell of row) {
        const v = cell.owner === null || cell.owner === undefined || cell.owner < 0 ? 0 : (cell.owner + 1) * 16 + Math.min(cell.count, 15);
        out += Math.min(v, 255).toString(16).toUpperCase().padStart(2, '0');
    }
    return out;
}

export function decodeCell(frame, size, r, c) {
    const i = (r * size + c) * 2;
    const v = parseInt(frame.slice(i, i + 2), 16) || 0;
    return v ? { owner: Math.floor(v / 16) - 1, count: v % 16 } : { owner: null, count: 0 };
}

export function describeMatch(state, replay) {
    const active = state.active;
    const types = state.playerTypes;
    const humans = active.filter(p => types[p] === 'human');
    const ais = active.filter(p => BOT_NAMES[types[p]]);
    let mode = 'local', mySeat = humans.length === 1 ? humans[0] : null, aiKey = null, aiLabel = null;
    if (state.online) {
        mode = 'online';
        mySeat = state.myPlayerIndex;
    } else if (active.length === 2 && humans.length === 1 && ais.length === 1) {
        mode = 'vsAI';
        const t = types[ais[0]];
        if (t === 'driveBot') {
            if (state.duelBotStrength === 0) { aiKey = 'bot3-s0'; aiLabel = 'Bot 3 · 入门'; } // 入门单独一个榜
            else { aiKey = `bot3-s${state.duelBotStrength}`; aiLabel = `Bot 3 · 强度 ${state.duelBotStrength}`; }
        }
        else if (t === 'enhancedNightmare') { aiKey = `bot2-l${state.aiLevel}`; aiLabel = `Bot 2 · ${state.aiLevel}档`; }
        else { aiKey = `bot1-l${state.aiLevel}`; aiLabel = `Bot 1 · ${state.aiLevel}档`; }
    }
    const winner = state.winnerIndex;
    let result = 'none';
    if (mySeat !== null && winner !== null && winner >= 0) result = winner === mySeat ? 'win' : 'loss';
    return {
        id: replay.id, playedAt: replay.playedAt, mode, players: active.length, boardSize: replay.boardSize,
        aiKey, aiLabel, moves: replay.moves.length,
        myMoves: mySeat === null ? 0 : replay.moves.filter(m => m.player === mySeat).length,
        result, duration: Math.round((Date.now() - replay.playedAt) / 1000),
        detail: {
            names: active.map(p => state.playerNames[p] || '玩家'),
            controllers: active.map(p => BOT_NAMES[types[p]] || (types[p] === 'human' ? '真人' : '网络玩家')),
            colors: active.map(p => replay.colors[p] || '808080'),
            winnerName: winner !== null && winner >= 0 ? state.playerNames[winner] : null
        }
    };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const readJSON = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const writeJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const modeText = m => m === 'vsAI' ? '人机' : m === 'online' ? '联机' : '本地';
const resultText = m => m.result === 'win' ? '胜' : m.result === 'loss' ? '负' : m.result === 'draw' ? '平' : (m.detail?.winnerName ? `${m.detail.winnerName} 胜` : '—');
const resultColor = m => m.result === 'win' ? '#2ecc71' : m.result === 'loss' ? '#e74c3c' : '#7f8c8d';
// 只改显示：Bot 3 强度 4（原 Drive 原版）显示为“困难+”，存储的 aiKey/aiLabel 不变
const displayAILabel = l => l ? String(l).replace('Bot 3 · 强度 4', 'Bot 3 · 困难+') : l;
const summary = m => [modeText(m.mode), `${m.players}人`, `${m.boardSize}×${m.boardSize}`, displayAILabel(m.aiLabel), `${m.moves}步`].filter(Boolean).join(' · ');

export function avatarHTML(avatar, name, size = 40) {
    const base = `width:${size}px;height:${size}px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid rgba(255,255,255,.35);`;
    if (avatar && avatar.startsWith('data:image')) return `<span style="${base}"><img src="${esc(avatar)}" style="width:100%;height:100%;object-fit:cover"></span>`;
    if (avatar && avatar.startsWith('emoji:')) {
        const [, e, color] = avatar.split(':');
        return `<span style="${base}background:${esc(color)};font-size:${size * 0.55}px">${esc(e)}</span>`;
    }
    return `<span style="${base}background:#1447a6;color:#fff;font-weight:800;font-size:${size * 0.45}px">${esc((name || '?').slice(0, 1).toUpperCase())}</span>`;
}

export function initAccount(hooks) {
    const api = async (method, path, body) => {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem(TOKEN_KEY);
        if (token) headers.Authorization = `Bearer ${token}`;
        let res;
        try { res = await fetch(hooks.serverURL + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
        catch { throw new Error('网络连接失败，请稍后再试'); }
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && token && localStorage.getItem(TOKEN_KEY) === token) sessionExpired(data.error || '登录已过期，请重新登录');
        if (!res.ok) throw Object.assign(new Error(data.error || `服务器错误 (${res.status})`), { status: res.status });
        return data;
    };

    const S = { user: null, history: readJSON(LOCAL_HISTORY_KEY, []), friends: { friends: [], incoming: [], outgoing: [] },
        view: 'home', replayId: null, frame: 0, lbPeriod: 'week', lbAutoPeriod: true, lbKey: null, lbSize: null, lbFull: null, lbPreview: null,
        seenInvites: new Set(), seenUpdates: new Set(), seenFriendReqs: new Set(), isRegister: false, error: '' };
    // 登录后联机昵称用账号用户名；退出后恢复登录前手动填的昵称。
    const MANUAL_NICK_KEY = 'CW_Account_ManualNickname';
    // 上次登录成功时的账号信息：打开网页时直接用它恢复登录，不联网校验
    const CACHED_USER_KEY = 'CW_Account_CachedUser';
    function setUser(u) {
        const prev = S.user;
        S.user = u;
        if (u) writeJSON(CACHED_USER_KEY, u); else localStorage.removeItem(CACHED_USER_KEY);
        const input = document.getElementById('online-nickname');
        if (!input) return;
        if (u && u.username) {
            if (!prev && localStorage.getItem(MANUAL_NICK_KEY) === null) localStorage.setItem(MANUAL_NICK_KEY, input.value || '');
            input.value = u.username;
        } else if (prev) {
            const manual = localStorage.getItem(MANUAL_NICK_KEY);
            if (manual) input.value = manual;
            localStorage.removeItem(MANUAL_NICK_KEY);
        }
    }
    let replays = readJSON(REPLAYS_KEY, []);
    let current = null;
    let pollTimer = null;

    const root = document.getElementById('panel-account');
    const banner = document.getElementById('account-banner');

    function toast(text) {
        const el = document.createElement('div');
        el.className = 'glass-panel';
        el.style.cssText = 'padding:10px 16px;border-radius:999px;font-weight:700;color:#fff;margin:6px auto;width:max-content;max-width:90vw;pointer-events:auto';
        el.textContent = text;
        banner.appendChild(el);
        setTimeout(() => el.remove(), 2600);
    }

    // ---------- 对局记录 ----------
    function saveReplays() {
        let unsaved = 0;
        replays = replays.filter(r => r.isSaved || ++unsaved <= 5);
        try { writeJSON(REPLAYS_KEY, replays); } catch { replays = replays.slice(0, 5); writeJSON(REPLAYS_KEY, replays); }
    }

    function begin() {
        const st = hooks.getState();
        current = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(), playedAt: Date.now(), title: '',
            boardSize: st.boardSize, names: [...st.playerNames], colors: st.playerColors.map(c => String(c).replace('#', '').slice(0, 6)),
            frames: [encodeFrame(st.board)], moves: [], isSaved: false,
            emojis: Array.isArray(st.playerEmojis) ? [...st.playerEmojis] : null };
    }

    function recordMove(row, col, player) {
        if (!current) return;
        current.moves.push({ row, column: col, player });
        current.frames.push(encodeFrame(hooks.getState().board));
    }

    function finish() {
        if (!current) return;
        const replay = current; current = null;
        const record = describeMatch(hooks.getState(), replay);
        replay.title = `${resultText(record)} · ${summary(record)}`;
        replays.unshift(replay);
        saveReplays();
        const local = readJSON(LOCAL_HISTORY_KEY, []).filter(m => m.id !== record.id);
        local.unshift(record);
        writeJSON(LOCAL_HISTORY_KEY, local.slice(0, 500));
        writeJSON(PENDING_KEY, [...readJSON(PENDING_KEY, []), record]);
        S.history = [record, ...S.history.filter(m => m.id !== record.id)];
        uploadPending();
        render();
    }

    async function uploadPending() {
        if (!S.user) return;
        const pending = readJSON(PENDING_KEY, []);
        if (!pending.length) return;
        try {
            await api('POST', '/api/matches', { matches: pending });
            const sent = new Set(pending.map(m => m.id));
            writeJSON(PENDING_KEY, readJSON(PENDING_KEY, []).filter(m => !sent.has(m.id)));
        } catch { /* 下次再传 */ }
    }

    async function refreshHistory() {
        if (!S.user) { S.history = readJSON(LOCAL_HISTORY_KEY, []); return; }
        try {
            const { matches } = await api('GET', '/api/matches?limit=200');
            const ids = new Set(matches.map(m => m.id));
            S.history = [...readJSON(PENDING_KEY, []).filter(m => !ids.has(m.id)), ...matches].sort((a, b) => b.playedAt - a.playedAt);
        } catch { /* 保留本地 */ }
    }

    // ---------- 账号 ----------
    async function afterLogin() {
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
        await uploadPending();
        await Promise.all([refreshHistory(), refreshFriends(), loadLeaderboard(false)]);
        startPolling();
        render();
    }

    async function loadMe() {
        if (!localStorage.getItem(TOKEN_KEY)) { render(); loadLeaderboard(false).then(render); return; }
        const cached = readJSON(CACHED_USER_KEY, null);
        if (cached && cached.id) {
            // 默认保持登录：不请求 /api/me，等真正联网操作（传战绩、好友、排行榜、邀请）时再校验
            setUser(cached);
            render();
            uploadPending();
            loadLeaderboard(false).then(render);
            startPolling();
            return;
        }
        // 旧版本还没有缓存，只校验这一次
        try { setUser((await api('GET', '/api/me')).user); await afterLogin(); }
        catch { render(); }
    }

    // 401：清掉登录状态，保留没传上去的战绩，重新登录后补传
    function sessionExpired(message) {
        localStorage.removeItem(TOKEN_KEY);
        clearInterval(pollTimer);
        setUser(null); S.view = 'home';
        S.history = readJSON(LOCAL_HISTORY_KEY, []);
        S.error = message;
        render();
    }

    function startPolling() {
        clearInterval(pollTimer);
        pollTimer = setInterval(() => { if (!document.hidden && !inGame()) poll(); }, 20000);
        poll();
    }
    // 对局进行中（任何模式）暂停轮询；对局结束/离开对局时立刻补一次（顺带补传战绩）。本地检查，不发请求。
    const inGame = () => !!(hooks.isGameActive && hooks.isGameActive());
    let wasInGame = false;
    setInterval(() => {
        const now = inGame();
        if (wasInGame && !now && S.user && !document.hidden) poll();
        wasInGame = now;
    }, 1000);
    window.addEventListener('online', () => uploadPending());
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user && !inGame()) poll(); });

    async function auth(isRegister, username, password, confirm) {
        S.error = '';
        if (isRegister && password !== confirm) { S.error = '两次输入的密码不一致'; render(); return; }
        try {
            const body = isRegister ? { username, password, confirmPassword: confirm } : { username, password };
            const res = await api('POST', isRegister ? '/api/register' : '/api/login', body);
            localStorage.setItem(TOKEN_KEY, res.token);
            setUser(res.user);
            await afterLogin();
        } catch (e) { S.error = e.message; render(); }
    }

    function logout() {
        api('POST', '/api/logout').catch(() => {});
        localStorage.removeItem(TOKEN_KEY);
        clearInterval(pollTimer);
        setUser(null); S.view = 'home';
        S.history = readJSON(LOCAL_HISTORY_KEY, []);
        render();
    }

    // ---------- 排行榜 ----------
    async function loadLeaderboard(full) {
        try {
            const query = period => `/api/leaderboard?period=${period}&limit=${full ? 100 : 5}` + (S.lbKey ? `&aiKey=${encodeURIComponent(S.lbKey)}` : '') + (S.lbSize ? `&boardSize=${S.lbSize}` : '');
            // 没手动选过周期：周榜没人就自动看月榜，再空就季榜、年榜；手动选了就只查那个周期
            let data = null;
            for (const period of S.lbAutoPeriod ? PERIODS.map(([k]) => k) : [S.lbPeriod]) {
                const res = await api('GET', query(period));
                if (!data) data = res;
                if (!S.lbAutoPeriod || (res.entries && res.entries.length)) { data = res; S.lbPeriod = period; break; }
            }
            if (S.lbAutoPeriod && !(data.entries && data.entries.length)) S.lbPeriod = 'week';
            if (!S.lbKey) S.lbKey = data.aiKey;
            if (!S.lbSize && data.boardSize) S.lbSize = data.boardSize;
            if (full) S.lbFull = data; else S.lbPreview = data;
        } catch (e) { if (full) S.lbFull = { error: e.message }; else S.lbPreview = { error: e.message }; }
    }

    // ---------- 好友与邀请 ----------
    async function refreshFriends() {
        if (!S.user) return;
        try { S.friends = await api('GET', '/api/friends'); } catch { /* ignore */ }
    }

    function notify(title, body) {
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            try { new Notification(title, { body }); } catch { /* ignore */ }
        }
    }

    async function poll() {
        if (!S.user) return;
        let data;
        try { data = await api('GET', '/api/notifications'); } catch { return; }
        if (readJSON(PENDING_KEY, []).length) uploadPending();
        for (const inv of data.invites) {
            if (S.seenInvites.has(inv.id)) continue;
            S.seenInvites.add(inv.id);
            showInvite(inv);
            notify('对局邀请', `${inv.from.username} 邀请你加入房间 ${inv.roomCode}`);
        }
        for (const u of data.inviteUpdates) {
            if (S.seenUpdates.has(u.id)) continue;
            S.seenUpdates.add(u.id);
            toast(u.status === 'accepted' ? `${u.to.username} 接受了邀请` : `${u.to.username} 拒绝了邀请`);
        }
        let changed = false;
        for (const f of data.friendRequests) {
            if (S.seenFriendReqs.has(f.id)) continue;
            S.seenFriendReqs.add(f.id); changed = true;
            notify('好友申请', `${f.username} 想加你为好友`);
        }
        if (changed || data.friendRequests.length !== S.friends.incoming.length) { await refreshFriends(); render(); }
    }

    function showInvite(inv) {
        const el = document.createElement('div');
        el.className = 'glass-panel';
        el.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px;border-radius:20px;margin:8px auto;max-width:520px;pointer-events:auto;color:#fff';
        el.innerHTML = `${avatarHTML(inv.from.avatar, inv.from.username, 40)}<div style="flex:1"><b>${esc(inv.from.username)} 邀请你联机</b><div style="opacity:.75;font-size:.85rem">房间 ${esc(inv.roomCode)}</div></div>
            <button class="glass-btn primary" data-a="1">加入</button><button class="glass-btn" data-a="0">拒绝</button>`;
        el.querySelectorAll('button').forEach(b => b.onclick = async () => {
            el.remove();
            const accept = b.dataset.a === '1';
            try {
                const res = await api('POST', `/api/invites/${inv.id}/respond`, { accept });
                if (accept) {
                    if (hooks.isInGame()) { toast('请先结束当前对局'); return; }
                    hooks.joinRoom(res.roomCode || inv.roomCode);
                }
            } catch (e) { toast(e.message); }
        });
        banner.appendChild(el);
        setTimeout(() => el.remove(), 60000);
    }

    async function inviteFriend(friend) {
        if (hooks.isInGame()) { toast('请先结束当前对局'); return; }
        const code = await hooks.hostRoom();
        if (!code) { toast('房间创建失败，没能发出邀请'); return; }
        try {
            await api('POST', '/api/invites', { friendId: friend.id, roomCode: code, boardSize: hooks.getState().boardSize });
            toast(`已邀请 ${friend.username} 加入房间 ${code}`);
        } catch (e) { toast(e.message); }
    }

    // ---------- 渲染 ----------
    const card = (inner, action = '') => `<div class="setting-card glass-panel acc-card" ${action ? `data-go="${action}"` : ''} style="cursor:${action ? 'pointer' : 'default'}">${inner}</div>`;
    const head = (title, chevron = true) => `<div style="display:flex;align-items:center;justify-content:space-between;font-weight:800;margin-bottom:8px">${title}${chevron ? '<span style="opacity:.5">›</span>' : ''}</div>`;
    const back = title => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><button class="glass-btn" data-go="home">‹ 返回</button><b style="font-size:1.1rem">${title}</b></div>`;

    function lbControls(data) {
        const periods = PERIODS.map(([k, t]) => `<div class="${S.lbPeriod === k ? 'active' : ''}" data-period="${k}">${t}</div>`).join('');
        const levels = (data?.levels || []).map(l => `<button class="glass-btn ${S.lbKey === l.aiKey ? 'primary' : ''}" data-lbkey="${esc(l.aiKey)}" style="padding:4px 10px;font-size:.8rem">${esc(displayAILabel(l.aiLabel || l.aiKey))}</button>`).join('');
        const sizes = (data?.boardSizes || []).map(b => `<button class="glass-btn ${S.lbSize === b.boardSize ? 'primary' : ''}" data-lbsize="${b.boardSize}" style="padding:4px 10px;font-size:.8rem">${b.boardSize}×${b.boardSize}</button>`).join('');
        return `<div class="seg" style="margin-bottom:8px">${periods}</div>${levels ? `<div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:8px">${levels}</div>` : ''}${sizes ? `<div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:8px">${sizes}</div>` : ''}`;
    }

    function lbRows(data, emptyText) {
        if (!data) return '<div style="opacity:.7">加载中…</div>';
        if (data.error) return `<div style="color:#f39c12">${esc(data.error)}</div>`;
        if (!data.entries.length) return `<div style="opacity:.7">${emptyText}</div>`;
        return data.entries.map(e => `<div style="display:flex;align-items:center;gap:10px;padding:5px 0">
            <b style="width:28px;text-align:center;color:${e.rank <= 3 ? '#ffd700' : '#fff'}">${e.rank}</b>${avatarHTML(e.avatar, e.username, 28)}
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.username)}</span>
            <span style="text-align:right;font-size:.8rem"><b>${e.wins ?? 0} 胜 · 平均 ${Number(e.avgMoves).toFixed(1)} 步</b><br><span style="opacity:.6">${e.games} 局</span></span></div>`).join('');
    }

    function renderAuth() {
        return card(`
            <div class="seg" style="margin-bottom:12px"><div class="${S.isRegister ? '' : 'active'}" data-auth="0">登录</div><div class="${S.isRegister ? 'active' : ''}" data-auth="1">注册</div></div>
            <input id="acc-user" class="glass-input" placeholder="用户名" autocomplete="username" style="width:100%;margin-bottom:8px">
            <input id="acc-pass" class="glass-input" type="password" placeholder="${S.isRegister ? '密码（至少 6 位）' : '密码'}" autocomplete="${S.isRegister ? 'new-password' : 'current-password'}" style="width:100%;margin-bottom:8px">
            ${S.isRegister ? '<input id="acc-pass2" class="glass-input" type="password" placeholder="再次输入密码" autocomplete="new-password" style="width:100%;margin-bottom:8px">' : ''}
            ${S.error ? `<div style="color:#f39c12;font-size:.85rem;margin-bottom:8px">${esc(S.error)}</div>` : ''}
            <button id="acc-submit" class="glass-btn primary" style="width:100%">${S.isRegister ? '注册' : '登录'}</button>`) +
            `<p style="text-align:center;opacity:.7;font-size:.85rem">登录后可以同步战绩、上排行榜、加好友和邀请好友联机。</p>`;
    }

    // 打赏：换图就把仓库根目录的 wechat-pay.png 替换成微信收款码（文件名不变）
    function showDeleteAccount() {
        const o = document.createElement('div');
        o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px';
        o.innerHTML = `<div class="glass-panel" style="max-width:380px;width:100%;padding:20px;border-radius:24px"><b style="font-size:1.1rem;color:#e74c3c">注销账号</b><p style="opacity:.85;font-size:.9rem;line-height:1.5">注销后会永久删除你的账号、全部战绩、好友和邀请，也会从排行榜上移除。别人战绩里你的名字会显示为“已注销用户”。<b>此操作无法撤销。</b></p><input type="password" id="acc-del-pw" class="glass-input" placeholder="输入密码确认" style="width:100%;box-sizing:border-box"><div id="acc-del-err" style="color:#f39c12;font-size:.85rem;margin-top:6px"></div><div style="display:flex;gap:8px;margin-top:12px"><button class="glass-btn" data-x="cancel" style="flex:1">取消</button><button class="glass-btn danger" data-x="ok" style="flex:1">永久注销</button></div></div>`;
        o.onclick = async e => {
            if (e.target === o || e.target.dataset.x === 'cancel') return o.remove();
            if (e.target.dataset.x !== 'ok') return;
            const pw = o.querySelector('#acc-del-pw').value;
            if (!pw) { o.querySelector('#acc-del-err').textContent = '请输入密码'; return; }
            e.target.disabled = true;
            try { await api('POST', '/api/me/delete', { password: pw }); o.remove(); logout(); }
            catch (err) { o.querySelector('#acc-del-err').textContent = err.message; e.target.disabled = false; }
        };
        document.body.appendChild(o);
    }

    function showTip() {
        const o = document.createElement('div');
        o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px';
        o.innerHTML = `<div class="glass-panel" style="max-width:360px;width:100%;padding:20px;border-radius:24px;text-align:center"><b style="font-size:1.1rem">微信收款码</b><img src="wechat-pay.png?v=2" alt="微信收款码" style="display:block;width:100%;margin:14px 0;border-radius:16px"><div style="opacity:.75;font-size:.85rem;margin-bottom:12px">微信扫一扫，或长按图片识别</div><button class="glass-btn primary" style="width:100%">关闭</button></div>`;
        o.onclick = e => { if (e.target === o || e.target.tagName === 'BUTTON') o.remove(); };
        document.body.appendChild(o);
    }

    function renderHome() {
        const u = S.user, st = u.stats || {};
        const recent = S.history.slice(0, 5);
        const dots = recent.map(m => `<span style="width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:800;background:${resultColor(m)}">${resultText(m).length === 1 ? resultText(m) : '—'}</span>`).join('');
        return card(`<div style="display:flex;align-items:center;gap:14px">${avatarHTML(u.avatar, u.username, 60)}<div style="flex:1"><div style="font-size:1.4rem;font-weight:800">${esc(u.username)}</div><div style="opacity:.7">${st.games || 0} 局 · ${st.wins || 0} 胜 ${st.losses || 0} 负</div></div><span style="opacity:.5">›</span></div>`, 'profile')
            + card(head('🕘 最近战绩') + (recent.length ? `<div style="display:flex;gap:8px">${dots}</div><div style="opacity:.7;font-size:.8rem;margin-top:6px">上一局：${esc(summary(recent[0]))}</div>` : '<div style="opacity:.7">还没有对局记录。打完一局就会出现在这里。</div>'), 'history')
            + `<div class="setting-card glass-panel acc-card">${head('<span data-go="leaderboard" style="cursor:pointer">🏆 排行榜</span>', false)}${lbControls(S.lbPreview)}${lbRows(S.lbPreview, '这段时间还没有人上榜（和 AI 打满 3 局即可上榜）')}<button class="glass-btn" data-go="leaderboard" style="width:100%;margin-top:8px">查看前 100 名 ›</button></div>`
            + card(head(`👥 好友${S.friends.incoming.length ? ` <span style="background:#e74c3c;border-radius:999px;padding:0 7px;font-size:.8rem">${S.friends.incoming.length}</span>` : ''}`) + (S.friends.friends.length ? `<div style="display:flex">${S.friends.friends.slice(0, 8).map(f => avatarHTML(f.avatar, f.username, 32)).join('')}</div><div style="opacity:.7;font-size:.8rem;margin-top:4px">${S.friends.friends.length} 位好友</div>` : '<div style="opacity:.7">加好友后可以直接邀请对方联机。</div>'), 'friends')
            + `<div style="display:flex;flex-direction:column;gap:12px;width:100%;margin-top:4px">`
            + `<button class="glass-btn danger" id="acc-logout" style="width:100%;margin:0">退出登录</button>`
            + `<button class="glass-btn danger" id="acc-delete" style="width:100%;margin:0;opacity:.85">注销账号</button>`
            + `<div class="setting-card glass-panel acc-card" id="acc-tip" style="cursor:pointer;margin:6px 0 0">${head('❤️ 打赏作者')}<div style="opacity:.7">喜欢 Color War 的话，可以用微信扫码请作者喝杯奶茶。</div></div>`
            + `</div>`;
    }

    function renderProfile() {
        const u = S.user;
        const emojis = ['🙂', '😎', '🐯', '🐼', '🦊', '🐸', '🐙', '🦄', '🔥', '⚡️', '🌈', '🎯', '🎻', '🚀', '👾', '🍀'];
        return back('个人资料') + card(`<div style="text-align:center;margin-bottom:10px" id="acc-avatar-preview">${avatarHTML(S.draftAvatar ?? u.avatar, u.username, 96)}</div>
            <label class="glass-btn" id="acc-photo" style="position:relative;width:100%;box-sizing:border-box;margin-bottom:8px">从相册选择头像<input type="file" id="acc-photo-input" accept="image/*" style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"></label>
            <div style="opacity:.7;font-size:.8rem">或者用表情头像</div>
            <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin:6px 0">${emojis.map(e => `<button class="glass-btn" data-emoji="${e}" style="padding:4px;font-size:1.3rem">${e}</button>`).join('')}</div>
            <label style="display:flex;align-items:center;gap:8px">表情头像底色 <input type="color" id="acc-emoji-color" value="${S.emojiColor || '#1e5bb8'}"></label>`)
            + card(`<div style="opacity:.7;font-size:.8rem;margin-bottom:6px">用户名</div><input id="acc-name" class="glass-input" value="${esc(u.username)}" style="width:100%">`)
            + card(`<div style="opacity:.7;font-size:.8rem;margin-bottom:6px">Bark 推送（可选）</div><input id="acc-bark" class="glass-input" value="${esc(u.barkKey || '')}" placeholder="Bark Key" style="width:100%"><div style="opacity:.6;font-size:.75rem;margin-top:6px">填了以后，没打开网页时也能通过 iPhone 上的 Bark App 收到好友邀请。</div>`)
            + (S.error ? `<div style="color:#f39c12;font-size:.85rem;margin-bottom:8px">${esc(S.error)}</div>` : '')
            + `<button class="glass-btn primary" id="acc-save" style="width:100%">保存</button>`;
    }

    function renderHistory() {
        const replayIds = new Set(replays.map(r => r.id));
        const savedOnly = replays.filter(r => r.isSaved && !S.history.some(m => m.id === r.id));
        return back(`战绩（${S.history.length}）`)
            + (savedOnly.length ? card(head('已保存的复盘', false) + savedOnly.map(r => `<div data-replay="${r.id}" style="cursor:pointer;padding:6px 0">▶ ${esc(r.title)}</div>`).join('')) : '')
            + card(S.history.length ? S.history.map(m => `<div ${replayIds.has(m.id) ? `data-replay="${m.id}"` : ''} style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08);cursor:${replayIds.has(m.id) ? 'pointer' : 'default'}">
                <span style="background:${resultColor(m)};border-radius:999px;padding:2px 9px;font-weight:800;font-size:.85rem">${esc(resultText(m))}</span>
                <div style="flex:1;min-width:0"><div>${esc(summary(m))}</div><div style="opacity:.6;font-size:.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${new Date(m.playedAt).toLocaleString('zh-CN', { hour12: false })}${m.detail ? ' · ' + esc(m.detail.names.join(' vs ')) : ''}</div></div>
                ${replayIds.has(m.id) ? '<span style="color:#00d2ff">▶</span>' : ''}</div>`).join('') : '<div style="opacity:.7">还没有对局记录</div>')
            + '<p style="opacity:.6;font-size:.75rem;text-align:center">最近 5 局和你保存的对局可以复盘，复盘只存在这个浏览器里。</p>';
    }

    function paintReplayPieces() {
        const boardEl = document.getElementById('acc-replay-board');
        const r = boardEl && replays.find(x => x.id === S.replayId);
        if (!r || typeof hooks.paintPiece !== 'function') return;
        const n = r.boardSize, f = Math.min(S.frame, r.frames.length - 1), side = Number(boardEl.dataset.side);
        boardEl.querySelectorAll('.cell').forEach(el => {
            const c = decodeCell(r.frames[f], n, Number(el.dataset.rr), Number(el.dataset.rc));
            if (c.owner === null || !c.count) return;
            hooks.paintPiece(el, '#' + (r.colors[c.owner] || '808080'), r.emojis ? r.emojis[c.owner] : null, c.count, side * 0.76);
        });
    }

    function renderReplay() {
        const r = replays.find(x => x.id === S.replayId);
        if (!r) return back('复盘') + '<div style="opacity:.7">这局的复盘已经不在本机了</div>';
        const n = r.boardSize, f = Math.min(S.frame, r.frames.length - 1), last = f > 0 ? r.moves[f - 1] : null;
        // 和对局棋盘用同一套 .board / .cell 样式，棋子在 render() 后用对局的 paintPiece 画。
        const avail = Math.min(520, (root.clientWidth || 520) - 4);
        const side = Math.max(10, (avail - 12 - 4 * (n - 1)) / n);
        let cells = '';
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const hl = last && last.row === i && last.column === j;
            cells += `<div class="cell" data-rr="${i}" data-rc="${j}" style="width:${side}px;height:${side}px;cursor:default">${hl ? '<div style="position:absolute;inset:1px;border:2px solid rgba(255,255,255,0.45);border-radius:22%;pointer-events:none;z-index:5"></div>' : ''}</div>`;
        }
        return back('复盘') + `<div style="text-align:center;font-weight:700;margin-bottom:8px">${esc(r.title)}</div>
            <div class="board glass-panel" id="acc-replay-board" style="grid-template-columns:repeat(${n},${side}px);width:max-content;margin:0 auto;pointer-events:none" data-side="${side}">${cells}</div>
            <div style="text-align:center;margin:10px 0;opacity:.85">${last ? `第 ${f} 步：${esc(r.names[last.player] || '玩家')} 下在 (${last.row + 1}, ${last.column + 1})` : '开局'}</div>
            <input type="range" id="acc-frame" min="0" max="${r.frames.length - 1}" value="${f}" style="width:100%;max-width:520px;display:block;margin:0 auto">
            <div style="display:flex;gap:10px;justify-content:center;align-items:center;margin-top:10px">
            <button class="glass-btn" data-step="first">⏮</button><button class="glass-btn" data-step="prev">‹</button><b style="min-width:70px;text-align:center">${f}/${r.frames.length - 1}</b><button class="glass-btn" data-step="next">›</button><button class="glass-btn" data-step="last">⏭</button></div>
            <button class="glass-btn ${r.isSaved ? 'primary' : ''}" id="acc-save-replay" style="width:100%;margin-top:12px">${r.isSaved ? '★ 已保存（不会被自动删除）' : '☆ 保存这局复盘'}</button>
            ${hooks.importToAnalyzer ? `<button class="glass-btn" id="acc-import-analyzer" style="width:100%;margin-top:8px" ${hooks.canImportToAnalyzer?.(r) ? '' : 'disabled'}>🔍 导入分析器</button>` : ''}`;
    }

    function renderLeaderboard() {
        return back('排行榜 · 前 100 名') + card(lbControls(S.lbFull) + (S.lbFull?.rule ? `<div style="opacity:.6;font-size:.75rem">${esc(S.lbFull.rule)}</div>` : '')) + card(lbRows(S.lbFull, '还没有人上榜'));
    }

    function renderFriends() {
        const f = S.friends;
        const row = (u, actions) => { const fr = f.friends.some(x => x.id === u.id); return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0"><span ${fr ? `data-friend="${u.id}"` : ''} style="display:flex;align-items:center;gap:10px;flex:1;cursor:${fr ? 'pointer' : 'default'}">${avatarHTML(u.avatar, u.username, 32)}<span>${esc(u.username)}</span></span>${actions}</div>`; };
        return back('好友')
            + card(`${head('添加好友', false)}<div style="display:flex;gap:8px"><input id="acc-friend-name" class="glass-input" placeholder="输入对方的用户名" style="flex:1"><button class="glass-btn primary" id="acc-add-friend">发送申请</button></div>${S.error ? `<div style="color:#f39c12;font-size:.85rem;margin-top:6px">${esc(S.error)}</div>` : ''}`)
            + (f.incoming.length ? card(head('好友申请', false) + f.incoming.map(u => row(u, `<button class="glass-btn primary" data-accept="${u.id}">接受</button><button class="glass-btn" data-decline="${u.id}">拒绝</button>`)).join('')) : '')
            + card(head('我的好友', false) + (f.friends.length ? f.friends.map(u => row(u, `<button class="glass-btn" data-friend="${u.id}">战绩</button><button class="glass-btn primary" data-invite="${u.id}">邀请联机</button><button class="glass-btn danger" data-remove="${u.id}" title="删除好友">✕</button>`)).join('') : '<div style="opacity:.7">还没有好友</div>'))
            + (f.outgoing.length ? card(head('等待对方同意', false) + f.outgoing.map(u => row(u, '')).join('')) : '');
    }

    function renderFriendRecord() {
        const d = S.friendRecord, name = d?.user?.username || '好友';
        const top = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><button class="glass-btn" data-go="friends">‹ 返回</button><b style="font-size:1.1rem">${esc(name)} · 近一个月战绩</b></div>`;
        if (!d) return top + card('<div style="opacity:.7">加载中…</div>');
        if (d.error) return top + card(`<div style="color:#f39c12">${esc(d.error)}</div>`);
        const st = d.stats;
        return top + card(`<div style="display:flex;align-items:center;gap:14px">${avatarHTML(d.user.avatar, d.user.username, 48)}<div><div style="font-weight:800">${esc(d.user.username)}</div><div style="opacity:.7">${st.games} 局 · ${st.wins} 胜 ${st.losses} 负</div></div></div>`)
            + card(d.matches.length ? d.matches.map(m => `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08)">
                <span style="background:${resultColor(m)};border-radius:999px;padding:2px 9px;font-weight:800;font-size:.85rem">${esc(resultText(m))}</span>
                <div style="flex:1;min-width:0"><div>${esc(summary(m))}</div><div style="opacity:.6;font-size:.75rem">${new Date(m.playedAt).toLocaleString('zh-CN', { hour12: false })}</div></div></div>`).join('') : '<div style="opacity:.7">近一个月没有对局</div>');
    }

    function render() {
        if (!root) return;
        let html;
        if (!S.user) html = renderAuth();
        else html = ({ home: renderHome, profile: renderProfile, history: renderHistory, replay: renderReplay, leaderboard: renderLeaderboard, friends: renderFriends, friendRecord: renderFriendRecord }[S.view] || renderHome)();
        root.innerHTML = html;
        paintReplayPieces();
        bind();
    }

    function go(view) {
        S.view = view; S.error = '';
        if (view === 'leaderboard') { S.lbFull = null; loadLeaderboard(true).then(render); }
        if (view === 'history') refreshHistory().then(render);
        if (view === 'friends') refreshFriends().then(render);
        if (view === 'home') { S.draftAvatar = undefined; }
        render();
    }

    function bind() {
        const $ = id => document.getElementById(id);
        root.querySelectorAll('[data-go]').forEach(el => el.onclick = e => { e.stopPropagation(); go(el.dataset.go); });
        root.querySelectorAll('[data-auth]').forEach(el => el.onclick = () => { S.isRegister = el.dataset.auth === '1'; S.error = ''; render(); });
        if ($('acc-submit')) $('acc-submit').onclick = () => auth(S.isRegister, $('acc-user').value.trim(), $('acc-pass').value, $('acc-pass2')?.value);
        if ($('acc-logout')) $('acc-logout').onclick = logout;
        root.querySelectorAll('[data-friend]').forEach(el => el.onclick = async e => {
            e.stopPropagation(); S.friendRecord = null; S.view = 'friendRecord'; render();
            try { S.friendRecord = await api('GET', `/api/friends/${encodeURIComponent(el.dataset.friend)}/matches`); }
            catch (err) { S.friendRecord = { error: err.message }; }
            if (S.view === 'friendRecord') render();
        });
        if ($('acc-tip')) $('acc-tip').onclick = showTip;
        if ($('acc-delete')) $('acc-delete').onclick = showDeleteAccount;
        root.querySelectorAll('[data-period]').forEach(el => el.onclick = e => {
            e.stopPropagation(); S.lbPeriod = el.dataset.period; S.lbAutoPeriod = false; S.lbSize = null;
            loadLeaderboard(S.view === 'leaderboard').then(render); render();
        });
        root.querySelectorAll('[data-lbkey]').forEach(el => el.onclick = e => {
            e.stopPropagation(); S.lbKey = el.dataset.lbkey; S.lbSize = null;
            loadLeaderboard(S.view === 'leaderboard').then(render); render();
        });
        root.querySelectorAll('[data-lbsize]').forEach(el => el.onclick = e => {
            e.stopPropagation(); S.lbSize = Number(el.dataset.lbsize);
            loadLeaderboard(S.view === 'leaderboard').then(render); render();
        });
        root.querySelectorAll('[data-replay]').forEach(el => el.onclick = () => { S.replayId = el.dataset.replay; S.frame = 0; S.view = 'replay'; render(); });
        const r = replays.find(x => x.id === S.replayId);
        root.querySelectorAll('[data-step]').forEach(el => el.onclick = () => {
            const max = r.frames.length - 1;
            S.frame = { first: 0, prev: Math.max(0, S.frame - 1), next: Math.min(max, S.frame + 1), last: max }[el.dataset.step];
            render();
        });
        if ($('acc-frame')) $('acc-frame').oninput = e => { S.frame = Number(e.target.value); render(); };
        if ($('acc-save-replay')) $('acc-save-replay').onclick = () => { r.isSaved = !r.isSaved; saveReplays(); render(); };
        if ($('acc-import-analyzer')) $('acc-import-analyzer').onclick = () => hooks.importToAnalyzer(r);
        // 资料
        if ($('acc-photo')) {
            $('acc-photo-input').onchange = e => {
                const file = e.target.files[0]; if (!file) return;
                const img = new Image();
                img.onload = () => {
                    const cv = document.createElement('canvas'); cv.width = cv.height = 160;
                    const s = Math.max(160 / img.width, 160 / img.height), w = img.width * s, h = img.height * s;
                    cv.getContext('2d').drawImage(img, (160 - w) / 2, (160 - h) / 2, w, h);
                    S.draftAvatar = cv.toDataURL('image/jpeg', 0.75); render();
                };
                img.src = URL.createObjectURL(file);
            };
            root.querySelectorAll('[data-emoji]').forEach(el => el.onclick = () => { S.emoji = el.dataset.emoji; S.draftAvatar = `emoji:${S.emoji}:${S.emojiColor || '#1e5bb8'}`; render(); });
            $('acc-emoji-color').oninput = e => { S.emojiColor = e.target.value; S.draftAvatar = `emoji:${S.emoji || '🙂'}:${S.emojiColor}`; $('acc-avatar-preview').innerHTML = avatarHTML(S.draftAvatar, S.user.username, 96); };
            $('acc-save').onclick = async () => {
                const body = {};
                const name = $('acc-name').value.trim();
                if (name !== S.user.username) body.username = name;
                if (S.draftAvatar !== undefined) body.avatar = S.draftAvatar;
                const bark = $('acc-bark').value.trim();
                if (bark !== (S.user.barkKey || '')) body.barkKey = bark;
                try { setUser((await api('PATCH', '/api/me', body)).user); S.draftAvatar = undefined; go('home'); }
                catch (e) { S.error = e.message; render(); }
            };
        }
        // 好友
        if ($('acc-add-friend')) $('acc-add-friend').onclick = async () => {
            S.error = '';
            try {
                const res = await api('POST', '/api/friends/request', { username: $('acc-friend-name').value.trim() });
                toast(res.status === 'accepted' ? '你们已经是好友了' : '好友申请已发送');
                await refreshFriends();
            } catch (e) { S.error = e.message; }
            render();
        };
        const byId = id => [...S.friends.friends, ...S.friends.incoming].find(u => u.id === id);
        root.querySelectorAll('[data-accept],[data-decline]').forEach(el => el.onclick = async () => {
            const accept = !!el.dataset.accept;
            try { await api('POST', '/api/friends/respond', { userId: el.dataset.accept || el.dataset.decline, accept }); } catch (e) { toast(e.message); }
            await refreshFriends(); render();
        });
        root.querySelectorAll('[data-remove]').forEach(el => el.onclick = async () => {
            const u = byId(el.dataset.remove);
            if (!confirm(`删除好友 ${u?.username || ''}？`)) return;
            await api('DELETE', `/api/friends/${el.dataset.remove}`).catch(() => {});
            await refreshFriends(); render();
        });
        root.querySelectorAll('[data-invite]').forEach(el => el.onclick = () => inviteFriend(byId(el.dataset.invite)));
    }

    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
    loadMe();

    return {
        begin, recordMove, finish,
        // 最近对局（分析器用）：未收藏的滚动保留 5 局，收藏的长期保留
        listReplays: () => replays.slice(),
        toggleSavedReplay(id) { const r = replays.find(x => x.id === id); if (r) { r.isSaved = !r.isSaved; saveReplays(); } },
        deleteReplay(id) { replays = replays.filter(x => x.id !== id); saveReplays(); },
        myAvatar: () => S.user?.avatar || null,
        show() { if (S.user) { refreshHistory().then(render); } render(); }
    };
}
