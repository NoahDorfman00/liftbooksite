// /clicks: dashboard for the campaign link counts that api/get.js writes to
// clicks/<UTC day>/<ct> in the Realtime Database. Admin sign-in only (the
// database rules enforce it). Add ?demo to preview with made-up data.

(function () {
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyDzF2iZACmgD9uwJRKipGbLgGqh0b9Bkx8",
        authDomain: "liftbook-695fc.firebaseapp.com",
        databaseURL: "https://liftbook-695fc-default-rtdb.firebaseio.com",
        projectId: "liftbook-695fc",
        storageBucket: "liftbook-695fc.firebasestorage.app",
        messagingSenderId: "186341079070",
        appId: "1:186341079070:web:0f0a565f038132a8f5d60f"
    };

    // Colour follows the campaign, never its rank: known tokens keep a fixed
    // slot, new ones take the next free slot in order of first appearance, and
    // anything past the eighth folds into "Other".
    const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
    const KNOWN = ['chartshare', 'website', 'ig', 'tt', 'x', 'yt'];
    const OTHER = 'Other';
    const OTHER_COLOR = '#a3a29c';
    const DAY = 86400000;

    const $ = (id) => document.getElementById(id);
    const el = (tag, attrs, text) => {
        const n = document.createElement(tag);
        for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
        if (text != null) n.textContent = text;
        return n;
    };
    const svg = (tag, attrs) => {
        const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
        return n;
    };
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    const fmtDay = (key, withYear) => new Date(key + 'T00:00:00Z').toLocaleDateString('en-US',
        Object.assign({ month: 'short', day: 'numeric', timeZone: 'UTC' }, withYear ? { year: 'numeric' } : {}));

    let data = {};          // { 'YYYY-MM-DD': { ct: n } }
    let range = '30';
    try { range = localStorage.getItem('clicks-range') || '30'; } catch (e) { /* private mode */ }

    // ---- data shaping -----------------------------------------------------

    function seriesOrder() {
        const first = {};
        Object.keys(data).sort().forEach((day) => {
            Object.keys(data[day] || {}).forEach((ct) => { if (!(ct in first)) first[ct] = day; });
        });
        const extra = Object.keys(first).filter((ct) => !KNOWN.includes(ct))
            .sort((a, b) => first[a].localeCompare(first[b]) || a.localeCompare(b));
        const slots = KNOWN.concat(extra);
        const color = {};
        slots.forEach((ct, i) => { color[ct] = i < PALETTE.length ? PALETTE[i] : null; });
        return { present: slots.filter((ct) => ct in first), color };
    }

    function daysInRange() {
        const today = iso(Date.now());
        let n;
        if (range === 'all') {
            const earliest = Object.keys(data).sort()[0] || today;
            n = Math.max(7, Math.round((Date.parse(today) - Date.parse(earliest)) / DAY) + 1);
        } else {
            n = Number(range);
        }
        const end = Date.parse(today);
        const days = [];
        for (let i = n - 1; i >= 0; i--) days.push(iso(end - i * DAY));
        return days;
    }

    // One bar per day; past ~3 months, one bar per week so bars stay readable.
    function buckets(days) {
        const size = days.length > 92 ? 7 : 1;
        const out = [];
        for (let i = 0; i < days.length; i += size) {
            const span = days.slice(i, i + size);
            const counts = {};
            span.forEach((d) => {
                for (const ct in data[d] || {}) counts[ct] = (counts[ct] || 0) + data[d][ct];
            });
            out.push({
                start: span[0],
                label: size === 1 ? fmtDay(span[0], true) : fmtDay(span[0]) + ' – ' + fmtDay(span[span.length - 1], true),
                counts
            });
        }
        return { list: out, weekly: size === 7 };
    }

    const sumDays = (days, ct) => days.reduce((t, d) => {
        const row = data[d] || {};
        return t + (ct ? (row[ct] || 0) : Object.values(row).reduce((a, b) => a + b, 0));
    }, 0);

    // ---- rendering --------------------------------------------------------

    function render() {
        const { present, color } = seriesOrder();
        const days = daysInRange();
        const today = days[days.length - 1];
        const last7 = [];
        for (let i = 6; i >= 0; i--) last7.push(iso(Date.parse(today) - i * DAY));

        document.querySelectorAll('.range button').forEach((b) => {
            b.setAttribute('aria-pressed', String(b.dataset.range === range));
        });
        const rangeName = range === 'all' ? 'All time' : 'Last ' + range + ' days';
        $('tile-range-label').textContent = rangeName;
        $('th-range').textContent = rangeName;
        $('tile-today').textContent = sumDays([today]).toLocaleString();
        $('tile-week').textContent = sumDays(last7).toLocaleString();
        $('tile-range').textContent = sumDays(days).toLocaleString();

        // Series shown in the chart: campaigns with a colour slot, in slot
        // order, plus "Other" for any beyond the palette.
        const inRange = present.filter((ct) => sumDays(days, ct) > 0);
        const named = inRange.filter((ct) => color[ct]);
        const folded = inRange.filter((ct) => !color[ct]);
        const series = named.map((ct) => ({ name: ct, color: color[ct], of: (c) => c[ct] || 0 }));
        if (folded.length) {
            series.push({ name: OTHER, color: OTHER_COLOR, of: (c) => folded.reduce((t, ct) => t + (c[ct] || 0), 0) });
        }

        const legend = $('legend');
        legend.replaceChildren();
        series.forEach((s) => {
            const item = el('span');
            const sw = el('span', { class: 'swatch' });
            sw.style.background = s.color;
            item.append(sw, s.name);
            legend.append(item);
        });

        const b = buckets(days);
        $('chart-title').textContent = b.weekly ? 'Clicks per week' : 'Clicks per day';
        drawChart(b.list, series);
        drawTable(present, color, today, last7, days);
    }

    function niceMax(v) {
        if (v <= 4) return 4;
        const pow = Math.pow(10, Math.floor(Math.log10(v)));
        const step = [1, 2, 4, 5, 10].find((m) => m * pow >= v / 4) * pow;
        return Math.ceil(v / step) * step;
    }

    function drawChart(list, series) {
        const host = $('chart');
        host.replaceChildren();
        const W = Math.max(280, host.clientWidth), H = 260;
        const m = { l: 34, r: 6, t: 10, b: 24 };
        const iw = W - m.l - m.r, ih = H - m.t - m.b;
        const totals = list.map((d) => series.reduce((t, s) => t + s.of(d.counts), 0));
        const max = niceMax(Math.max.apply(null, totals.concat(0)));
        const y = (v) => m.t + ih - (v / max) * ih;
        const root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Stacked bar chart of link clicks over time by campaign' });

        for (let i = 0; i <= 4; i++) {
            const v = (max / 4) * i;
            root.append(svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: i ? '#ececea' : '#cfcfcb', 'stroke-width': 1 }));
            const t = svg('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' });
            t.textContent = String(v);
            root.append(t);
        }

        const band = iw / list.length;
        const bw = Math.max(1, Math.min(28, band - 2));
        const every = Math.ceil(list.length / Math.max(2, Math.floor(iw / 70)));
        const hover = svg('rect', { y: m.t, height: ih, width: band, fill: '#000', opacity: 0, 'pointer-events': 'none' });
        root.append(hover);

        list.forEach((d, i) => {
            const x = m.l + band * i + (band - bw) / 2;
            let base = 0;
            const segs = series.map((s) => ({ s, v: s.of(d.counts) })).filter((g) => g.v > 0);
            segs.forEach((g, k) => {
                const top = y(base + g.v), bottom = y(base);
                const last = k === segs.length - 1;
                // 2px surface gap between stacked segments; rounded data-end on top.
                const h = Math.max(1, bottom - top - (last ? 0 : 2));
                const y0 = bottom - h;
                const r = last ? Math.min(4, bw / 2, h) : 0;
                root.append(svg('path', {
                    d: 'M' + x + ',' + bottom + 'V' + (y0 + r) + 'q0,' + -r + ' ' + r + ',' + -r +
                        'H' + (x + bw - r) + 'q' + r + ',0 ' + r + ',' + r + 'V' + bottom + 'Z',
                    fill: g.s.color
                }));
                base += g.v;
            });
            if (i % every === 0 || list.length <= 8) {
                const t = svg('text', { x: m.l + band * i + band / 2, y: H - 7, 'text-anchor': 'middle' });
                t.textContent = fmtDay(d.start);
                root.append(t);
            }
        });

        // One hit target per bar, as wide as its band and as tall as the plot.
        const tip = el('div', { class: 'tip' });
        tip.hidden = true;
        list.forEach((d, i) => {
            const hit = svg('rect', { x: m.l + band * i, y: m.t, width: band, height: ih, fill: 'transparent' });
            const show = () => {
                hover.setAttribute('x', m.l + band * i);
                hover.setAttribute('opacity', 0.05);
                tip.replaceChildren(el('div', { class: 'date' }, d.label));
                series.map((s) => ({ s, v: s.of(d.counts) })).filter((g) => g.v > 0).reverse().forEach((g) => {
                    const row = el('div', { class: 'row' });
                    const name = el('span');
                    const sw = el('span', { class: 'swatch' });
                    sw.style.background = g.s.color;
                    name.append(sw, g.s.name);
                    row.append(name, el('span', null, g.v.toLocaleString()));
                    tip.append(row);
                });
                const total = el('div', { class: 'row total' });
                total.append(el('span', null, 'Total'), el('span', null, totals[i].toLocaleString()));
                tip.append(total);
                tip.hidden = false;
                const cx = (m.l + band * (i + 0.5)) / W * host.clientWidth;
                const left = cx + 12 + tip.offsetWidth > host.clientWidth ? cx - 12 - tip.offsetWidth : cx + 12;
                tip.style.left = Math.max(0, left) + 'px';
            };
            hit.addEventListener('mouseenter', show);
            hit.addEventListener('click', show);
            root.append(hit);
        });
        root.addEventListener('mouseleave', () => { tip.hidden = true; hover.setAttribute('opacity', 0); });

        host.append(root, tip);
        if (!totals.some(Boolean)) host.append(el('div', { class: 'empty' }, 'No clicks in this range yet'));
    }

    function drawTable(present, color, today, last7, days) {
        const rows = $('rows');
        rows.replaceChildren();
        const sortedDays = Object.keys(data).sort();
        const list = present.map((ct) => ({
            ct,
            today: sumDays([today], ct),
            week: sumDays(last7, ct),
            total: sumDays(days, ct),
            last: sortedDays.filter((d) => (data[d] || {})[ct] > 0).pop()
        })).sort((a, b) => b.total - a.total || b.week - a.week || a.ct.localeCompare(b.ct));

        if (!list.length) {
            const td = el('td', { colspan: 5 }, 'No clicks recorded yet');
            td.style.textAlign = 'left';
            const tr = el('tr');
            tr.append(td);
            rows.append(tr);
            return;
        }
        list.forEach((r) => {
            const tr = el('tr');
            const name = el('td');
            const sw = el('span', { class: 'swatch' });
            sw.style.background = color[r.ct] || OTHER_COLOR;
            name.append(sw, r.ct);
            tr.append(name,
                el('td', null, r.today.toLocaleString()),
                el('td', null, r.week.toLocaleString()),
                el('td', null, r.total.toLocaleString()),
                el('td', null, r.last ? fmtDay(r.last, true) : '–'));
            rows.append(tr);
        });
    }

    // ---- wiring -----------------------------------------------------------

    function showDash(statusText) {
        $('login-section').style.display = 'none';
        $('dash-section').style.display = 'block';
        $('status').textContent = statusText;
        render();
    }

    document.querySelectorAll('.range button').forEach((b) => {
        b.addEventListener('click', () => {
            range = b.dataset.range;
            try { localStorage.setItem('clicks-range', range); } catch (e) { /* private mode */ }
            render();
        });
    });
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if ($('dash-section').style.display !== 'none') render(); }, 120);
    });

    if (new URLSearchParams(location.search).has('demo')) {
        // Made-up data for previewing the layout without signing in.
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const tokens = [['chartshare', 5], ['website', 2], ['ig', 3], ['tt', 6], ['x', 1.5], ['yt', 2.5], ['newsletter', 1]];
        for (let i = 44; i >= 0; i--) {
            const row = {};
            tokens.forEach(([ct, w]) => {
                const n = Math.floor(rnd() * w * (i < 3 ? 4 : 1.4));
                if (n > 0 && !(ct === 'newsletter' && i > 12)) row[ct] = n;
            });
            if (Object.keys(row).length) data[iso(Date.now() - i * DAY)] = row;
        }
        showDash('Demo data');
        return;
    }

    if (typeof firebase === 'undefined') {
        $('login-section').style.display = 'block';
        $('login-message').textContent = 'Could not load Firebase.';
        return;
    }
    firebase.initializeApp(FIREBASE_CONFIG);
    const auth = firebase.auth();
    const ref = firebase.database().ref('clicks');
    let listening = false;

    function signedOut(message) {
        if (listening) { ref.off(); listening = false; }
        $('dash-section').style.display = 'none';
        $('logout-btn').style.display = 'none';
        $('login-section').style.display = 'block';
        $('login-message').textContent = message || '';
    }

    auth.onAuthStateChanged((user) => {
        if (!user) return signedOut();
        $('logout-btn').style.display = '';
        listening = true;
        ref.on('value', (snap) => {
            data = snap.val() || {};
            showDash('Live · updated ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
        }, () => {
            // The database rules only let the admin account read.
            auth.signOut();
            signedOut('That account does not have access.');
        });
    });

    $('google-signin-btn').addEventListener('click', () => {
        $('login-message').textContent = '';
        auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch((e) => {
            $('login-message').textContent = e.message || 'Sign-in failed.';
        });
    });
    $('logout-btn').addEventListener('click', () => auth.signOut());
})();
