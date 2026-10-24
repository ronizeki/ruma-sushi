/* ============================================================
       Availability calendar, staff confirmation + large parties
       Sits on top of the booking form above and never edits it.
       ============================================================ */
(function () {
    'use strict';

    var OPEN_MIN = 11 * 60, LAST_MIN = 21 * 60 + 30, SLOT = 30;
    var CAP = 26;             /* seats we hold per sitting */
    var WINDOW_DAYS = 60;     /* how far ahead tables can be booked */
    var STORE_KEY = 'ruma.bookings.v1';
    var WA_REST = 'https://wa.me/6281386611177';
    var MAP_URL = 'https://maps.app.goo.gl/PpVDHrcYKzyULYRy5';

    /* ---------------- small helpers ---------------- */
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function todayISO() { return isoOf(new Date()); }
    function addDays(d, n) {
        var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        x.setDate(x.getDate() + n); return x;
    }
    function parseISO(v) {
        if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
        var p = v.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
        return isNaN(d.getTime()) ? null : d;
    }
    function nowMinutes() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
    function fmt24(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
    function tk(m) { return pad(Math.floor(m / 60)) + '.' + pad(m % 60); }
    function tkValue(v) { if (!v) return ''; var p = v.split(':'); return p[0] + '.' + p[1]; }
    function minsValue(v) { if (!v) return -1; var p = v.split(':'); return (+p[0]) * 60 + (+p[1]); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    var EN_D = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var EN_M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var ID_D = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    var ID_M = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    function longDate(d) { return EN_D[d.getDay()] + ', ' + d.getDate() + ' ' + EN_M[d.getMonth()] + ' ' + d.getFullYear(); }
    function longDateID(d) { return ID_D[d.getDay()] + ', ' + d.getDate() + ' ' + ID_M[d.getMonth()] + ' ' + d.getFullYear(); }
    function normPhone(v) {
        var s = String(v || '').replace(/[^\d+]/g, '');
        if (s.indexOf('+62') === 0) s = '0' + s.slice(3);
        return s;
    }
    function prettyPhone(v) {
        var d = normPhone(v); if (!d) return '';
        return d.replace(/^(\d{4})(\d{4})(\d+)$/, '$1 $2 $3');
    }
    function intlPhone(v) {
        var d = normPhone(v).replace(/\D/g, '');
        if (d.charAt(0) === '0') d = '62' + d.slice(1);
        return d;
    }
    function hash01(str) {
        var h = 2166136261;
        for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return ((h >>> 0) % 1000003) / 1000003;
    }

    /* ---------------- availability model ----------------
       Deterministic: one date + one slot always yields the same
       baseline load, so the calendar never flickers between visits. */
    var DEMAND = {
        660: .12, 690: .18, 720: .52, 750: .72, 780: .58, 810: .36,
        840: .22, 870: .13, 900: .10, 930: .11, 960: .15, 990: .19,
        1020: .28, 1050: .46, 1080: .80, 1110: .96, 1140: 1.00,
        1170: .99, 1200: .86, 1230: .52, 1260: .32, 1290: .14
    };
    var DAY_MULT = [1.14, 0.86, 0.89, 0.92, 1.02, 1.20, 1.28]; /* Sun .. Sat */
    var PRIME = [1080, 1110, 1140, 1170, 1200];              /* 18.00 - 20.00 rush */

    function baseline(iso, mins) {
        var d = parseISO(iso); if (!d) return 0;
        var base = DEMAND[mins]; if (base == null) return 0;
        var load = base * DAY_MULT[d.getDay()] * (0.80 + 0.42 * hash01(iso + '|' + mins));
        var booked = Math.round(CAP * load);
        return Math.min(CAP, Math.max(0, booked));
    }

    /* ---------------- local booking store ---------------- */
    var _cache = null;
    function store() {
        if (_cache) return _cache;
        try {
            var raw = localStorage.getItem(STORE_KEY);
            var a = raw ? JSON.parse(raw) : [];
            _cache = Object.prototype.toString.call(a) === '[object Array]' ? a : [];
        } catch (e) { _cache = []; }
        return _cache;
    }
    function commit(arr) {
        _cache = arr;
        try { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); } catch (e) { }
    }
    /* re-read from storage so a booking made in another tab is not missed */
    function refresh() { _cache = null; return store(); }
    function heldSeats(iso, mins) {
        var t = fmt24(mins), n = 0;
        store().forEach(function (b) {
            if (b && b.date === iso && b.time === t && (b.status === 'pending' || b.status === 'confirmed')) {
                n += (parseInt(b.guests, 10) || 0);
            }
        });
        return n;
    }
    function seatsLeft(iso, mins) { return Math.max(0, CAP - baseline(iso, mins) - heldSeats(iso, mins)); }
    function slotState(iso, mins) {
        var left = seatsLeft(iso, mins);
        if (left <= 0) return 'full';
        if (left <= 7) return 'limited';
        return 'plenty';
    }
    function isPast(iso, mins) { return iso === todayISO() && mins <= nowMinutes() + 30; }
    function dayCounts(iso) {
        var total = 0, open = 0, primeFull = 0, m;
        for (m = OPEN_MIN; m <= LAST_MIN; m += SLOT) {
            if (isPast(iso, m)) continue;
            total++;
            var st = slotState(iso, m);
            if (st !== 'full') open++;
            if (PRIME.indexOf(m) > -1 && st === 'full') primeFull++;
        }
        return { total: total, open: open, primeFull: primeFull };
    }
    function dayState(iso) {
        var c = dayCounts(iso);
        if (!c.total) return 'past';
        /* a day only reads as full once every evening sitting is gone */
        if (c.primeFull >= 4) return 'full';
        if (c.primeFull >= 2) return 'limited';
        return 'plenty';
    }
    function maxISO() { return isoOf(addDays(new Date(), WINDOW_DAYS)); }
    function inWindow(iso) { return iso >= todayISO() && iso <= maxISO(); }
    var STATE_WORD = { plenty: 'open', limited: 'limited', full: 'full', past: 'passed' };

    /* ---------------- element refs ---------------- */
    var calGrid = document.getElementById('calGrid');
    var calStrip = document.getElementById('calStrip');
    var calMonth = document.getElementById('calMonth');
    var calPrev = document.getElementById('calPrev');
    var calNext = document.getElementById('calNext');
    var slotDay = document.getElementById('slotDay');
    var slotSub = document.getElementById('slotSub');
    var slotGrid = document.getElementById('slotGrid');
    var resForm = document.getElementById('resForm');
    var dateEl = document.getElementById('rDate');
    var timeEl = document.getElementById('rTime');
    var nameEl = document.getElementById('rName');
    var done = document.getElementById('resDone');
    var staffPanel = document.getElementById('staffPanel');
    var staffList = document.getElementById('staffList');
    var staffMsg = document.getElementById('staffMsg');
    var tabStd = document.getElementById('tabStd');
    var tabLarge = document.getElementById('tabLarge');
    var panelStd = document.getElementById('panelStd');
    var panelLarge = document.getElementById('panelLarge');
    var slipAside = document.getElementById('slipAside');

    var selDate = inWindow(todayISO()) ? todayISO() : maxISO();
    var _sd = parseISO(selDate);
    var calY = _sd.getFullYear(), calM = _sd.getMonth();

    /* ---------------- calendar ---------------- */
    function dayLabel(d, st, dis) {
        var base = EN_D[d.getDay()] + ' ' + d.getDate() + ' ' + EN_M[d.getMonth()];
        if (dis) return base + (st === 'full' ? ', fully booked' : ', outside the booking window');
        if (st === 'past') return base + ', no seatings left today';
        return base + ', ' + (st === 'plenty' ? 'good availability' : 'limited availability');
    }

    function renderCalendar() {
        if (!calGrid) return;
        var first = new Date(calY, calM, 1);
        var lead = (first.getDay() + 6) % 7;                 /* Monday-first */
        var days = new Date(calY, calM + 1, 0).getDate();
        if (calMonth) calMonth.textContent = EN_M[calM] + ' ' + calY;

        var html = '', i, d, iso, st, dis, cls;
        for (i = 0; i < lead; i++) html += '<span class="cal-cell blank" aria-hidden="true"></span>';
        for (d = 1; d <= days; d++) {
            var dd = new Date(calY, calM, d);
            iso = isoOf(dd); st = ''; dis = !inWindow(iso);
            if (dis) { cls = 'past'; }
            else {
                st = dayState(iso); cls = st;
                if (st === 'full') dis = true;
            }
            html += '<button type="button" class="cal-cell ' + cls + (iso === todayISO() ? ' today' : '') + '"'
                + ' data-iso="' + iso + '" aria-pressed="' + (iso === selDate ? 'true' : 'false') + '"'
                + (dis ? ' disabled' : '')
                + ' aria-label="' + esc(dayLabel(dd, st, dis)) + '">'
                + '<span class="dn">' + d + '</span><i class="pip" aria-hidden="true"></i></button>';
        }
        calGrid.innerHTML = html;

        var t = new Date(), mx = parseISO(maxISO());
        if (calPrev) calPrev.disabled = (calY < t.getFullYear()) || (calY === t.getFullYear() && calM <= t.getMonth());
        if (calNext) calNext.disabled = (calY > mx.getFullYear()) || (calY === mx.getFullYear() && calM >= mx.getMonth());
        renderStrip();
    }

    function renderStrip() {
        if (!calStrip) return;
        var html = '', i, d, iso, st, dis;
        for (i = 0; i <= WINDOW_DAYS; i++) {
            d = addDays(new Date(), i); iso = isoOf(d); st = dayState(iso); dis = st === 'full';
            html += '<button type="button" class="cal-chip ' + st + '" data-iso="' + iso + '"'
                + ' aria-pressed="' + (iso === selDate ? 'true' : 'false') + '"' + (dis ? ' disabled' : '')
                + ' aria-label="' + esc(EN_D[d.getDay()] + ' ' + d.getDate() + ' ' + EN_M[d.getMonth()] + ', ' + STATE_WORD[st] + ' availability') + '">'
                + '<span class="dow">' + EN_D[d.getDay()].slice(0, 3) + '</span>'
                + '<span class="d">' + d.getDate() + '</span>'
                + '<span class="st">' + STATE_WORD[st] + '</span></button>';
        }
        calStrip.innerHTML = html;
    }

    function renderSlots() {
        if (!slotGrid) return;
        var d = parseISO(selDate);
        if (slotDay) slotDay.textContent = d ? longDate(d) : 'Pick a day';
        var open = 0, total = 0, html = '', m, past, st, dis, word, label;
        for (m = OPEN_MIN; m <= LAST_MIN; m += SLOT) {
            past = isPast(selDate, m);
            st = past ? 'past' : slotState(selDate, m);
            if (!past) { total++; if (st !== 'full') open++; }
            dis = past || st === 'full';
            word = past ? 'passed' : st === 'full' ? 'full' : st === 'limited' ? 'limited' : 'open';
            label = tk(m) + ', ' + (past ? 'already passed' : st === 'full' ? 'fully booked' : seatsLeft(selDate, m) + ' seats left');
            html += '<button type="button" class="slot ' + st + '" data-mins="' + m + '"' + (dis ? ' disabled' : '')
                + ' aria-label="' + esc(label) + '">' + tk(m) + '<small>' + word + '</small></button>';
        }
        slotGrid.innerHTML = html;
        if (slotSub) {
            slotSub.textContent = total
                ? open + ' of ' + total + ' seatings still open'
                : 'No seatings left today \u2014 try tomorrow.';
        }
    }

    function selectDate(iso) {
        if (!inWindow(iso)) return;
        selDate = iso;
        var d = parseISO(iso);
        calY = d.getFullYear(); calM = d.getMonth();
        renderCalendar(); renderSlots();
    }

    function onDayClick(e) {
        var b = e.target.closest('[data-iso]');
        if (!b || b.disabled) return;
        selectDate(b.getAttribute('data-iso'));
    }
    if (calGrid) calGrid.addEventListener('click', onDayClick);
    if (calStrip) calStrip.addEventListener('click', onDayClick);

    if (calGrid) {
        calGrid.addEventListener('keydown', function (e) {
            var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
            if (!(e.key in step)) return;
            var b = e.target.closest('[data-iso]'); if (!b) return;
            var cells = Array.prototype.slice.call(calGrid.querySelectorAll('[data-iso]:not([disabled])'));
            var i = cells.indexOf(b); if (i < 0) return;
            var j = i + step[e.key];
            if (j >= 0 && j < cells.length) { e.preventDefault(); cells[j].focus(); }
        });
    }

    if (calPrev) calPrev.addEventListener('click', function () {
        calM--; if (calM < 0) { calM = 11; calY--; }
        renderCalendar();
    });
    if (calNext) calNext.addEventListener('click', function () {
        calM++; if (calM > 11) { calM = 0; calY++; }
        renderCalendar();
    });

    /* picking a slot writes the date + time into the booking form */
    function applySlot(iso, mins) {
        if (!dateEl || !timeEl) return;
        setTab('std');
        dateEl.value = iso;
        dateEl.dispatchEvent(new Event('change', { bubbles: true }));
        timeEl.value = fmt24(mins);
        timeEl.dispatchEvent(new Event('change', { bubbles: true }));
        [dateEl, timeEl].forEach(function (el) {
            var fld = el.closest('.field');
            if (fld) fld.classList.remove('invalid');
            el.removeAttribute('aria-invalid');
        });
        var card = resForm ? resForm.closest('.form-card') : null;
        renderCalendar();
        renderSlots();
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (nameEl) window.setTimeout(function () { nameEl.focus({ preventScroll: true }); }, 380);
    }
    if (slotGrid) {
        slotGrid.addEventListener('click', function (e) {
            var b = e.target.closest('[data-mins]');
            if (!b || b.disabled) return;
            applySlot(selDate, parseInt(b.getAttribute('data-mins'), 10));
        });
    }

    if (dateEl) dateEl.max = maxISO();
    if (dateEl) {
        dateEl.addEventListener('change', function () {
            if (inWindow(dateEl.value)) {
                selDate = dateEl.value;
                var d = parseISO(selDate);
                if (d) { calY = d.getFullYear(); calM = d.getMonth(); }
                renderCalendar();
            }
            renderSlots();
        });
    }

    /* ---------------- staff confirmation ---------------- */
    var staffMsgText = '';

    function guestConfirmMsg(b) {
        var d = parseISO(b.date);
        return [
            'Halo ' + b.name + '! \uD83C\uDF3F',
            '',
            'Terima kasih sudah memesan meja di Ruma Sushi. Reservasi Anda sudah kami konfirmasi.',
            '',
            'Kode booking: ' + b.code,
            'Tanggal: ' + (d ? longDateID(d) : b.date),
            'Waktu: ' + tkValue(b.time) + ' WIB',
            'Jumlah tamu: ' + b.guests + ' orang',
            'Area: ' + b.seating,
            '',
            'Meja kami tahan 15 menit dari waktu reservasi. Kalau Anda terlambat, cukup balas pesan ini agar meja tetap kami simpan.',
            '',
            'Alamat: Ruko Nico Residence Blok B3A No. 5, Sadai, Kec. Bengkong, Batam 29444',
            'Peta: ' + MAP_URL,
            '',
            'Kalau rencana berubah, balas pesan ini untuk membatalkan \u2014 tidak ada biaya pembatalan.',
            '',
            'Sampai jumpa di Ruma Sushi!'
        ].join('\n');
    }

    function guestDeclineMsg(b) {
        var d = parseISO(b.date);
        var alts = altSlots(b, 3);
        var lines = [
            'Halo ' + b.name + ', terima kasih sudah menghubungi Ruma Sushi.',
            '',
            'Mohon maaf, meja untuk ' + b.guests + ' orang pada ' + (d ? longDateID(d) : b.date)
            + ' pukul ' + tkValue(b.time) + ' WIB sudah penuh.',
            ''
        ];
        if (alts.length) {
            lines.push('Kami masih punya waktu lain yang bisa kami tawarkan:');
            alts.forEach(function (a) {
                lines.push('\u2022 ' + longDateID(parseISO(a.iso)) + ', pukul ' + tk(a.mins) + ' WIB'
                    + ' (' + seatsLeft(a.iso, a.mins) + ' kursi tersisa)');
            });
            lines.push('');
            lines.push('Kalau salah satunya cocok, cukup balas dengan pilihannya dan meja langsung kami kunci.');
        } else {
            lines.push('Untuk tanggal itu kami belum punya slot yang pas. Balas pesan ini dengan tanggal lain yang Anda inginkan, kami carikan.');
        }
        lines.push('');
        lines.push('Terima kasih atas pengertiannya \u2014 semoga bisa menyambut Anda segera.');
        lines.push('Ruma Sushi');
        return lines.join('\n');
    }

    function altSlots(b, n) {
        var out = [], start = parseISO(b.date);
        if (!start) return out;
        var startMin = minsValue(b.time);
        for (var k = 0; k < 6 && out.length < n; k++) {
            var iso = isoOf(addDays(start, k));
            if (!inWindow(iso)) break;
            for (var m = OPEN_MIN; m <= LAST_MIN && out.length < n; m += SLOT) {
                if (k === 0 && m <= startMin) continue;
                if (isPast(iso, m)) continue;
                if (slotState(iso, m) === 'full') continue;
                out.push({ iso: iso, mins: m });
            }
        }
        return out;
    }

    function renderStaff() {
        if (!staffList) return;
        var arr = store().filter(function (b) { return b && b.status === 'pending'; });
        if (!arr.length) {
            staffList.innerHTML = '<p class="staff-empty">No pending requests in this browser yet. '
                + 'Send a booking from the form and it will appear here.</p>';
            return;
        }
        arr.sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
        staffList.innerHTML = arr.map(function (b) {
            var d = parseISO(b.date);
            return '<div class="pending">'
                + '<div class="pending-top"><span class="pending-name">' + esc(b.name) + '</span>'
                + '<span class="code-chip">' + esc(b.code) + '</span></div>'
                + '<p class="pending-meta">' + esc(d ? longDate(d) : b.date) + ' &middot; ' + esc(tkValue(b.time)) + ' WIB<br>'
                + esc(b.guests) + ' guests &middot; ' + esc(b.seating) + ' &middot; WhatsApp ' + esc(b.phone) + '</p>'
                + (b.notes ? '<p class="pending-notes">&ldquo;' + esc(b.notes) + '&rdquo;</p>' : '')
                + '<div class="pending-actions">'
                + '<button type="button" class="btn btn-sm btn-accept" data-act="accept" data-id="' + esc(b.id) + '">Accept &amp; message guest</button>'
                + '<button type="button" class="btn btn-sm btn-decline" data-act="decline" data-id="' + esc(b.id) + '">Decline</button>'
                + '</div></div>';
        }).join('');
    }

    function showGuestMsg(b, msg, kind) {
        if (!staffMsg) return;
        staffMsgText = msg;
        var url = 'https://wa.me/' + intlPhone(b.phone) + '?text=' + encodeURIComponent(msg);
        staffMsg.innerHTML =
            '<h4>' + (kind === 'accept' ? 'Confirmation to ' + esc(b.name) : 'Alternative times for ' + esc(b.name)) + '</h4>'
            + '<p class="msg-text">' + esc(msg) + '</p>'
            + '<div class="msg-actions">'
            + '<button type="button" class="btn btn-sm btn-solid" data-copy="1">Copy message</button>'
            + '<a class="btn btn-sm btn-ghost" href="' + esc(url) + '" target="_blank" rel="noopener">Open WhatsApp again</a>'
            + '<span class="copy-ok" hidden>Copied</span>'
            + '</div>';
        staffMsg.hidden = false;
        if (staffPanel) staffPanel.hidden = false;
    }

    function copyText(txt, okEl) {
        function doneCopy() {
            if (!okEl) return;
            okEl.hidden = false;
            window.setTimeout(function () { okEl.hidden = true; }, 2200);
        }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = txt; ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); doneCopy(); } catch (e) { }
            document.body.removeChild(ta);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(doneCopy)['catch'](fallback);
        } else fallback();
    }

    function decide(id, kind) {
        var arr = refresh(), hit = null;
        for (var i = 0; i < arr.length; i++) if (arr[i].id === id) hit = arr[i];
        if (!hit) return;
        hit.status = kind === 'accept' ? 'confirmed' : 'declined';
        hit.decidedAt = new Date().toISOString();
        commit(arr);

        var msg = kind === 'accept' ? guestConfirmMsg(hit) : guestDeclineMsg(hit);
        showGuestMsg(hit, msg, kind);
        renderStaff(); renderCalendar(); renderSlots();

        var url = 'https://wa.me/' + intlPhone(hit.phone) + '?text=' + encodeURIComponent(msg);
        window.open(url, '_blank', 'noopener');
    }

    if (staffList) {
        staffList.addEventListener('click', function (e) {
            var b = e.target.closest('[data-act]');
            if (!b) return;
            decide(b.getAttribute('data-id'), b.getAttribute('data-act') === 'accept' ? 'accept' : 'decline');
        });
    }
    if (staffMsg) {
        staffMsg.addEventListener('click', function (e) {
            if (!e.target.closest('[data-copy]')) return;
            copyText(staffMsgText, staffMsg.querySelector('.copy-ok'));
        });
    }

    var staffOpen = document.getElementById('staffOpen');
    if (staffOpen) staffOpen.addEventListener('click', function () {
        if (!staffPanel) return;
        refresh();
        renderStaff();
        staffPanel.hidden = false;
        staffPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var b = staffPanel.querySelector('button');
        if (b) window.setTimeout(function () { b.focus({ preventScroll: true }); }, 380);
    });
    var staffClose = document.getElementById('staffClose');
    if (staffClose) staffClose.addEventListener('click', function () {
        if (staffPanel) staffPanel.hidden = true;
    });

    /* ---------------- record the guest's own booking ---------------- */
    if (resForm) {
        resForm.addEventListener('submit', function () {
            if (!done || done.hidden) return;          /* validation failed upstream */
            if (!dateEl || !parseISO(dateEl.value) || !timeEl.value) return;
            var seat = resForm.querySelector('input[name="seating"]:checked');
            var id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            var rec = {
                id: id,
                code: 'RS-' + pad(Math.floor(hash01(id) * 9000) + 1000),
                name: (document.getElementById('rName') || {}).value ? document.getElementById('rName').value.trim() : '',
                phone: prettyPhone((document.getElementById('rPhone') || {}).value),
                date: dateEl.value,
                time: timeEl.value,
                guests: (document.getElementById('rGuests') || {}).value || '',
                seating: seat ? seat.value : 'No preference',
                notes: (document.getElementById('rNotes') || {}).value ? document.getElementById('rNotes').value.trim() : '',
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            var arr = store(), dup = -1;
            for (var i = 0; i < arr.length; i++) {
                var b = arr[i];
                if (b.status === 'pending' && b.name === rec.name && b.date === rec.date
                    && b.time === rec.time && b.phone === rec.phone) dup = i;
            }
            if (dup > -1) {
                rec.id = arr[dup].id;
                rec.code = arr[dup].code;
                arr[dup] = rec;
            } else {
                arr.push(rec);
            }
            commit(arr);
            renderStaff(); renderCalendar(); renderSlots();
            if (staffMsg) staffMsg.hidden = true;
        });
    }

    /* the built-in reset buttons should reset the calendar too */
    ['resEdit', 'resAnother'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', function () {
            window.setTimeout(function () {
                selDate = inWindow(todayISO()) ? todayISO() : maxISO();
                var d = parseISO(selDate);
                calY = d.getFullYear(); calM = d.getMonth();
                renderCalendar(); renderSlots();
            }, 0);
        });
    });

    /* ---------------- tabs ---------------- */
    function setTab(which) {
        var large = which === 'large';
        if (tabStd) {
            tabStd.classList.toggle('on', !large);
            tabStd.setAttribute('aria-selected', large ? 'false' : 'true');
        }
        if (tabLarge) {
            tabLarge.classList.toggle('on', large);
            tabLarge.setAttribute('aria-selected', large ? 'true' : 'false');
        }
        if (panelStd) panelStd.hidden = large;
        if (panelLarge) panelLarge.hidden = !large;
        if (slipAside) slipAside.hidden = large;
    }

    [tabStd, tabLarge].forEach(function (tab, i) {
        if (!tab) return;
        tab.addEventListener('click', function () { setTab(i === 1 ? 'large' : 'std'); });
        tab.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            var next = i === 1 ? 'std' : 'large';
            setTab(next);
            var target = next === 'std' ? tabStd : tabLarge;
            if (target) target.focus();
        });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-jump="large"]'), function (el) {
        el.addEventListener('click', function (e) {
            e.preventDefault();
            setTab('large');
            var target = document.getElementById('reserve');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    /* ---------------- large parties ---------------- */
    var lgForm = document.getElementById('lgForm');
    var lgDone = document.getElementById('lgDone');
    var lgTime = document.getElementById('lgTime');
    var lgDate = document.getElementById('lgDate');
    var lgGuests = document.getElementById('lgGuests');
    var lgBudget = document.getElementById('lgBudget');
    var lastLgUrl = '';

    function lgEl(id) { return document.getElementById(id); }
    function lgFieldWrap(id) { var el = lgEl(id); return el ? el.closest('.field') : null; }
    function lgErr(id, msg) {
        var box = lgEl(id + 'Err'), fld = lgFieldWrap(id), el = lgEl(id);
        if (fld) fld.classList.add('invalid');
        if (box) box.textContent = msg;
        if (el) el.setAttribute('aria-invalid', 'true');
    }
    function lgClear(id) {
        var box = lgEl(id + 'Err'), fld = lgFieldWrap(id), el = lgEl(id);
        if (fld) fld.classList.remove('invalid');
        if (box) box.textContent = '';
        if (el) el.removeAttribute('aria-invalid');
    }
    function lgMenuValue() {
        var r = document.querySelector('#lgForm input[name="lgmenu"]:checked');
        return r ? r.value : '';
    }
    function lgSetRow(id, txt) {
        var el = lgEl(id); if (!el) return;
        el.textContent = txt || '\u2014';
        el.classList.toggle('empty', !txt);
    }
    function lgBudgetText() {
        if (!lgBudget || !lgBudget.value) return '';
        return lgBudget.options[lgBudget.selectedIndex].text;
    }
    function lgUpdate() {
        if (!lgForm) return;
        var d = parseISO(lgDate ? lgDate.value : '');
        var when = d ? longDate(d) + (lgTime && lgTime.value ? ' \u00b7 ' + tkValue(lgTime.value) : '') : '';
        lgSetRow('lgSlipWhen', when);
        lgSetRow('lgSlipGuests', lgGuests && lgGuests.value ? lgGuests.value + ' people' : '');
        lgSetRow('lgSlipOccasion', (lgEl('lgOccasion') || {}).value || '');
        lgSetRow('lgSlipMenu', lgMenuValue());
        lgSetRow('lgSlipBudget', lgBudgetText());
        var nm = lgEl('lgName') ? lgEl('lgName').value.trim() : '';
        var ph = lgEl('lgPhone') ? prettyPhone(lgEl('lgPhone').value) : '';
        lgSetRow('lgSlipContact', nm && ph ? nm + ' \u00b7 ' + ph : (nm || ph));
    }
    function lgClearAll() {
        ['lgName', 'lgPhone', 'lgEmail', 'lgDate', 'lgTime', 'lgGuests', 'lgOccasion', 'lgNotes'].forEach(lgClear);
        var seg = document.querySelector('#lgForm .seg');
        if (seg) seg.closest('.field').classList.remove('invalid');
        var me = lgEl('lgMenuErr'); if (me) me.textContent = '';
        var live = lgEl('lgLive'); if (live) live.textContent = '';
    }

    function lgValidate() {
        lgClearAll();
        var problems = [], first = null;
        function bad(id, msg) { lgErr(id, msg); problems.push(id); if (!first) first = lgEl(id); }

        var nm = lgEl('lgName').value.trim();
        if (!nm) bad('lgName', 'Please tell us who we are speaking to.');
        else if (nm.length < 2) bad('lgName', 'That looks a little short \u2014 at least 2 characters.');

        var ph = normPhone(lgEl('lgPhone').value);
        if (!lgEl('lgPhone').value.trim()) bad('lgPhone', 'We need a WhatsApp number to send you the menu.');
        else if (!/^0\d{8,13}$/.test(ph)) bad('lgPhone', 'Enter an Indonesian mobile number, e.g. 0812 3456 7890.');

        var em = lgEl('lgEmail').value.trim();
        if (em && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(em)) bad('lgEmail', 'That email does not look complete.');

        var dv = lgDate.value, d = parseISO(dv);
        if (!dv) bad('lgDate', 'Choose the date of your event.');
        else if (!d) bad('lgDate', 'That date does not look right \u2014 please pick it again.');
        else if (d < addDays(new Date(), 2)) bad('lgDate', 'Large parties need at least two days\u2019 notice \u2014 please pick a later date.');

        if (!lgTime.value) bad('lgTime', 'Choose the time you would like to start.');
        if (!lgGuests.value) bad('lgGuests', 'How many people are coming? (9\u201340)');
        if (!lgEl('lgOccasion').value) bad('lgOccasion', 'Pick the closest occasion.');

        if (!lgMenuValue()) {
            lgErr('lgMenu', 'Set menu or \u00e0 la carte \u2014 or tell us you are not sure yet.');
            var seg = document.querySelector('#lgForm .seg');
            if (seg) seg.closest('.field').classList.add('invalid');
            problems.push('menu');
            if (!first) first = seg ? seg.querySelector('input') : null;
        }

        if (problems.length) {
            var live = lgEl('lgLive');
            if (live) {
                live.textContent = problems.length === 1
                    ? 'One detail needs fixing before we send.'
                    : problems.length + ' details need fixing before we send.';
            }
            if (first) first.focus();
            return false;
        }
        return true;
    }

    function lgMessage() {
        var d = parseISO(lgDate.value);
        var budget = lgBudgetText();
        var lines = [
            'Hello Ruma Sushi! I would like to enquire about a large party.',
            '',
            'Name: ' + lgEl('lgName').value.trim(),
            'WhatsApp: ' + prettyPhone(lgEl('lgPhone').value)
        ];
        var em = lgEl('lgEmail').value.trim();
        if (em) lines.push('Email: ' + em);
        lines.push('Event date: ' + (d ? longDate(d) : lgDate.value));
        lines.push('Preferred time: ' + tkValue(lgTime.value) + ' WIB');
        lines.push('Guests: ' + lgGuests.value + ' people');
        lines.push('Occasion: ' + lgEl('lgOccasion').value);
        lines.push('Menu preference: ' + lgMenuValue());
        if (budget) lines.push('Budget per head: ' + budget);
        lines.push('Notes: ' + (lgEl('lgNotes').value.trim() || 'None'));
        lines.push('');
        lines.push('Please send the set-menu options, price per head and which dates are still open. Thank you!');
        return lines.join('\n');
    }
    function lgWaUrl() { return WA_REST + '?text=' + encodeURIComponent(lgMessage()); }

    if (lgForm) {
        if (lgTime) {
            var topts = '<option value="" selected>Choose a time</option>';
            for (var tmm = OPEN_MIN; tmm <= LAST_MIN; tmm += SLOT) {
                topts += '<option value="' + fmt24(tmm) + '">' + tk(tmm) + '</option>';
            }
            lgTime.innerHTML = topts;
        }
        if (lgGuests) {
            var gopt = '<option value="" selected>How many?</option>';
            for (var n = 9; n <= 40; n++) gopt += '<option value="' + n + '">' + n + ' guests</option>';
            lgGuests.innerHTML = gopt;
        }
        if (lgDate) {
            lgDate.min = isoOf(addDays(new Date(), 2));
            lgDate.max = isoOf(addDays(new Date(), 180));
        }

        ['input', 'change'].forEach(function (ev) {
            lgForm.addEventListener(ev, function (e) {
                var el = e.target;
                if (el && el.id && lgEl(el.id + 'Err')) {
                    var fld = el.closest('.field');
                    if (fld && fld.classList.contains('invalid')) lgClear(el.id);
                }
                if (el && el.name === 'lgmenu') {
                    var seg = document.querySelector('#lgForm .seg');
                    if (seg) seg.closest('.field').classList.remove('invalid');
                    var me = lgEl('lgMenuErr'); if (me) me.textContent = '';
                }
                lgUpdate();
            });
        });

        lgForm.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!lgValidate()) return;
            lastLgUrl = lgWaUrl();
            var card = lgForm.closest('.form-card');
            if (card) card.hidden = true;
            if (lgDone) { lgDone.hidden = false; lgDone.focus(); }
            window.open(lastLgUrl, '_blank', 'noopener');
            if (lgDone) lgDone.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        var lgRetry = document.getElementById('lgRetry');
        if (lgRetry) lgRetry.addEventListener('click', function (e) {
            e.preventDefault();
            window.open(lastLgUrl || lgWaUrl(), '_blank', 'noopener');
        });

        function lgBack(reset) {
            if (lgDone) lgDone.hidden = true;
            var card = lgForm.closest('.form-card');
            if (card) card.hidden = false;
            if (reset) {
                lgForm.reset();
                lgClearAll();
                lgUpdate();
            }
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        var lgEdit = document.getElementById('lgEdit');
        if (lgEdit) lgEdit.addEventListener('click', function () { lgBack(false); });
        var lgAnother = document.getElementById('lgAnother');
        if (lgAnother) lgAnother.addEventListener('click', function () { lgBack(true); });
    }

    /* ---------------- boot ---------------- */
    renderCalendar();
    renderSlots();
    renderStaff();
    lgUpdate();
})();