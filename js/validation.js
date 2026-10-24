/* ============================================================
       Reservation form — validation, live summary, WhatsApp handoff
       Kitchen hours 11:00–21:30 daily, 30-minute slots.
       ============================================================ */
(function () {
    var form = document.getElementById('resForm');
    if (!form) return;

    var done = document.getElementById('resDone');
    var live = document.getElementById('formLive');
    var miniSlip = document.getElementById('miniSlip');
    var miniText = document.getElementById('miniText');
    var nameEl = document.getElementById('rName');
    var phoneEl = document.getElementById('rPhone');
    var dateEl = document.getElementById('rDate');
    var timeEl = document.getElementById('rTime');
    var guestEl = document.getElementById('rGuests');
    var noteEl = document.getElementById('rNotes');
    var slip = {
        title: document.getElementById('slipTitle'),
        when: document.getElementById('slipWhen'),
        name: document.getElementById('slipName'),
        phone: document.getElementById('slipPhone'),
        guests: document.getElementById('slipGuests'),
        seat: document.getElementById('slipSeat'),
        notes: document.getElementById('slipNotes')
    };

    var WA_BASE = 'https://wa.me/6281386611177';
    var OPEN_MIN = 11 * 60;      /* 11:00 */
    var LAST_MIN = 21 * 60 + 30; /* 21:30 */
    var SLOT = 30;

    /* ---------- date helpers (local calendar, no timezone drift) ---------- */
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function todayISO() {
        var d = new Date();
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function parseISO(v) {
        if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
        var p = v.split('-');
        var d = new Date(+p[0], +p[1] - 1, +p[2]);
        return isNaN(d.getTime()) ? null : d;
    }
    function weekdayName(d) {
        return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    }
    function longDate(d) {
        var m = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return weekdayName(d) + ', ' + d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
    }
    function nowMinutes() {
        var d = new Date();
        return d.getHours() * 60 + d.getMinutes();
    }

    /* earliest selectable day = today */
    dateEl.min = todayISO();

    /* ---------- build 30-minute slots, skipping ones already past ---------- */
    function buildSlots() {
        var selected = timeEl.value;
        var d = parseISO(dateEl.value);
        var isToday = (dateEl.value === todayISO());
        timeEl.innerHTML = '<option value="" selected>Choose a time</option>';
        for (var m = OPEN_MIN; m <= LAST_MIN; m += SLOT) {
            if (isToday && d && m <= nowMinutes() + 30) continue; /* need 30 min lead time */
            var hh = Math.floor(m / 60), mm = m % 60;
            var label = pad(hh) + '.' + pad(mm);
            var opt = document.createElement('option');
            opt.value = hh + ':' + pad(mm);
            opt.textContent = label;
            timeEl.appendChild(opt);
        }
        if (selected) {
            for (var i = 0; i < timeEl.options.length; i++) {
                if (timeEl.options[i].value === selected) { timeEl.value = selected; break; }
            }
        }
    }
    buildSlots();

    /* ---------- formatting for the slip + message ---------- */
    function timeLabel(v) {
        if (!v) return '';
        var p = v.split(':');
        return pad(+p[0]) + '.' + p[1];
    }
    function guestLabel(v) {
        if (!v) return '';
        return v + (v === '1' ? ' guest' : ' guests');
    }
    function seatValue() {
        var r = form.querySelector('input[name="seating"]:checked');
        return r ? r.value : 'No preference';
    }
    function normalizePhone(v) {
        var digits = String(v || '').replace(/[^\d+]/g, '');
        if (digits.indexOf('+62') === 0) digits = '0' + digits.slice(3);
        return digits;
    }
    function displayPhone(v) {
        var d = normalizePhone(v);
        if (!d) return '';
        var out = d.replace(/^(\d{4})(\d{4})(\d+)$/, '$1 $2 $3');
        return out;
    }

    /* ---------- live summary ---------- */
    function setSlip(el, text) {
        if (!el) return;
        el.textContent = text || '\u2014';
        el.classList.toggle('empty', !text);
    }
    function updateSlip() {
        var g = guestEl.value;
        var d = parseISO(dateEl.value);
        var t = timeEl.value;

        slip.title.textContent = g
            ? 'A table for ' + (g === '1' ? 'one' : g)
            : 'A table for two?';

        if (d && t) {
            slip.when.textContent = longDate(d) + ' \u00b7 ' + timeLabel(t);
        } else if (d) {
            slip.when.textContent = longDate(d) + ' \u00b7 pick a time';
        } else if (t) {
            slip.when.textContent = 'Pick a date \u00b7 ' + timeLabel(t);
        } else {
            slip.when.textContent = 'Pick a date and time to see it here.';
        }

        setSlip(slip.name, nameEl.value.trim());
        setSlip(slip.phone, displayPhone(phoneEl.value));
        setSlip(slip.guests, guestLabel(g));
        slip.seat.textContent = seatValue();
        setSlip(slip.notes, noteEl.value.trim());
        updateMini();
    }

    /* one-line echo of the booking, visible inside the form on small screens */
    function updateMini() {
        if (!miniText) return;
        var bits = [];
        var g = guestEl.value;
        var p = parseISO(dateEl.value);
        var t = timeEl.value;
        if (p && t) bits.push(longDate(p) + ' at ' + timeLabel(t));
        else if (p) bits.push(longDate(p));
        else if (t) bits.push(timeLabel(t));
        if (g) bits.push(guestLabel(g));
        if (bits.length) bits.push(seatValue().toLowerCase());
        if (bits.length) {
            miniText.textContent = bits.join(' \u00b7 ');
            if (miniSlip) miniSlip.classList.add('is-ready');
        } else {
            miniText.textContent = 'Your booking summary appears here as you fill it in.';
            if (miniSlip) miniSlip.classList.remove('is-ready');
        }
    }

    ['input', 'change'].forEach(function (ev) {
        form.addEventListener(ev, updateSlip);
    });

    /* ---------- validation ---------- */
    function fieldOf(el) { return el.closest('.field'); }
    function setError(el, msg) {
        var wrap = fieldOf(el);
        var box = document.getElementById(el.id.replace(/^r/, 'r') + 'Err');
        if (wrap) wrap.classList.add('invalid');
        el.setAttribute('aria-invalid', 'true');
        if (box) box.textContent = msg;
    }
    function clearError(el) {
        var wrap = fieldOf(el);
        var box = document.getElementById(el.id + 'Err');
        if (wrap) wrap.classList.remove('invalid');
        el.removeAttribute('aria-invalid');
        if (box) box.textContent = '';
    }
    function clearAll() {
        [nameEl, phoneEl, dateEl, timeEl, guestEl, noteEl].forEach(clearError);
        var seg = form.querySelector('.seg');
        if (seg) seg.closest('.field').classList.remove('invalid');
        document.getElementById('rSeatErr').textContent = '';
        live.textContent = '';
    }

    function validate() {
        clearAll();
        var first = null;
        var problems = [];

        /* name */
        var name = nameEl.value.trim();
        if (!name) {
            setError(nameEl, 'Please tell us the name for the booking.');
            problems.push('name'); if (!first) first = nameEl;
        } else if (name.length < 2) {
            setError(nameEl, 'That looks a little short \u2014 at least 2 characters.');
            problems.push('name'); if (!first) first = nameEl;
        }

        /* phone */
        var phone = normalizePhone(phoneEl.value);
        if (!phoneEl.value.trim()) {
            setError(phoneEl, 'We need a WhatsApp number to confirm your table.');
            problems.push('phone'); if (!first) first = phoneEl;
        } else if (!/^0\d{8,13}$/.test(phone)) {
            setError(phoneEl, 'Enter an Indonesian mobile number, e.g. 0812 3456 7890.');
            problems.push('phone'); if (!first) first = phoneEl;
        }

        /* date */
        var dv = dateEl.value;
        var d = parseISO(dv);
        if (!dv) {
            setError(dateEl, 'Choose the day you would like to visit.');
            problems.push('date'); if (!first) first = dateEl;
        } else if (!d) {
            setError(dateEl, 'That date does not look right \u2014 please pick it again.');
            problems.push('date'); if (!first) first = dateEl;
        } else {
            var t0 = parseISO(todayISO());
            if (d < t0) {
                setError(dateEl, 'We cannot take bookings in the past. Pick today or later.');
                problems.push('date'); if (!first) first = dateEl;
            }
        }

        /* time */
        if (!timeEl.value) {
            setError(timeEl, 'Choose a time between 11.00 and 21.30.');
            problems.push('time'); if (!first) first = timeEl;
        } else {
            var p = timeEl.value.split(':');
            var mins = (+p[0]) * 60 + (+p[1]);
            if (mins < OPEN_MIN || mins > LAST_MIN) {
                setError(timeEl, 'We serve from 11.00 to 21.30 \u2014 pick a time in that window.');
                problems.push('time'); if (!first) first = timeEl;
            }
        }

        /* guests */
        if (!guestEl.value) {
            setError(guestEl, 'How many of you are coming?');
            problems.push('guests'); if (!first) first = guestEl;
        }

        /* notes length guard (maxlength handles it, but keep explicit) */
        if (noteEl.value.length > 400) {
            setError(noteEl, 'Please keep notes under 400 characters.');
            problems.push('notes'); if (!first) first = noteEl;
        }

        if (problems.length) {
            live.textContent = problems.length === 1
                ? 'One detail needs fixing before we send.'
                : problems.length + ' details need fixing before we send.';
            if (first) first.focus();
            return false;
        }
        return true;
    }

    /* clear a field's error as soon as the guest edits it */
    [nameEl, phoneEl, noteEl].forEach(function (el) {
        el.addEventListener('input', function () {
            if (fieldOf(el).classList.contains('invalid')) clearError(el);
        });
    });
    [dateEl, timeEl, guestEl].forEach(function (el) {
        el.addEventListener('change', function () {
            if (fieldOf(el).classList.contains('invalid')) clearError(el);
        });
    });

    /* re-filter slots when the date changes */
    dateEl.addEventListener('change', function () {
        var selectedTime = timeEl.value;
        buildSlots();
        if (selectedTime && dateEl.value === todayISO()) {
            /* keep only if still in the future */
            var found = false;
            for (var i = 0; i < timeEl.options.length; i++) {
                if (timeEl.options[i].value === selectedTime) { found = true; break; }
            }
            if (found) timeEl.value = selectedTime;
        }
        if (live.textContent) live.textContent = '';
        updateSlip();
    });

    /* ---------- build the WhatsApp message ---------- */
    function buildMessage() {
        var d = parseISO(dateEl.value);
        var notes = noteEl.value.trim();
        var lines = [
            'Hello Ruma Sushi! I would like to reserve a table.',
            '',
            'Name: ' + nameEl.value.trim(),
            'Date: ' + longDate(d),
            'Time: ' + timeLabel(timeEl.value) + ' WIB',
            'Guests: ' + guestLabel(guestEl.value),
            'Seating: ' + seatValue(),
            'WhatsApp: ' + displayPhone(phoneEl.value)
        ];
        lines.push('Notes: ' + (notes || 'None'));
        lines.push('');
        lines.push('Please confirm my booking. Thank you!');
        return lines.join('\n');
    }

    var lastUrl = '';
    function waUrl() {
        return WA_BASE + '?text=' + encodeURIComponent(buildMessage());
    }

    /* ---------- submit ---------- */
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!validate()) return;

        lastUrl = waUrl();

        /* show the confirmation state, then hand off to WhatsApp */
        form.closest('.form-card').hidden = true;
        done.hidden = false;
        done.focus();

        var win = window.open(lastUrl, '_blank', 'noopener');
        if (!win) {
            /* popup blocked — let the guest press the retry link */
            live.textContent = '';
        }
        done.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    /* retry / edit / new booking */
    document.getElementById('resRetry').addEventListener('click', function (e) {
        e.preventDefault();
        window.open(lastUrl || waUrl(), '_blank', 'noopener');
    });

    function backToForm(reset) {
        done.hidden = true;
        form.closest('.form-card').hidden = false;
        if (reset) {
            form.reset();
            buildSlots();
            clearAll();
            updateSlip();
            dateEl.min = todayISO();
            nameEl.focus();
        } else {
            nameEl.focus();
        }
        form.closest('.form-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    document.getElementById('resEdit').addEventListener('click', function () { backToForm(false); });
    document.getElementById('resAnother').addEventListener('click', function () { backToForm(true); });

    updateSlip();
})();