(function () {
    var root = document.documentElement;
    root.classList.remove('no-js');

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- scroll reveal (only once JS + motion support confirmed) ---- */
    if ('IntersectionObserver' in window && !reduce) {
        root.classList.add('motion');
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
        document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });
        /* anything already in view on load should be visible immediately */
        window.setTimeout(function () {
            document.querySelectorAll('.rv').forEach(function (el) {
                if (el.getBoundingClientRect().top < window.innerHeight * 0.95) el.classList.add('in');
            });
        }, 60);
    }

    /* ---- sticky nav state ---- */
    var nav = document.getElementById('nav');
    function onScroll() {
        if (window.scrollY > 60) nav.classList.add('scrolled');
        else nav.classList.remove('scrolled');
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    /* ---- mobile drawer ---- */
    var burger = document.getElementById('burger');
    var drawer = document.getElementById('drawer');
    function setDrawer(open) {
        drawer.classList.toggle('open', open);
        document.body.classList.toggle('locked', open);
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    burger.addEventListener('click', function () {
        setDrawer(!drawer.classList.contains('open'));
    });
    drawer.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { setDrawer(false); });
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setDrawer(false);
    });

    /* ---- menu filter ---- */
    var tabs = document.querySelectorAll('.tab');
    var items = document.querySelectorAll('.m-item');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            tabs.forEach(function (t) {
                t.classList.remove('on');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('on');
            tab.setAttribute('aria-selected', 'true');
            var f = tab.getAttribute('data-filter');
            items.forEach(function (it) {
                var show = (f === 'all' || it.getAttribute('data-cat') === f);
                it.classList.toggle('hide', !show);
            });
        });
    });

    /* ---- today's hours highlight ---- */
    try {
        var tz = 'Asia/Jakarta';
        var parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
        var map = {};
        parts.forEach(function (p) { map[p.type] = p.value; });
        var hh = parseInt(map.hour, 10), mm = parseInt(map.minute, 10);
        var mins = hh * 60 + mm;
        var isOpen = mins >= 660 && mins < 1290; /* 11:00 - 21:30 */
        var statusEl = document.querySelector('.hero-badge b');
        if (statusEl) {
            statusEl.textContent = isOpen ? '★ 4.8 · Open now' : '★ 4.8';
            statusEl.style.color = isOpen ? '' : '';
        }
        var rows = document.querySelectorAll('.hours div');
        var dayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(map.weekday);
        if (rows.length === 3) {
            var target = (dayIdx >= 1 && dayIdx <= 5) ? 0 : (dayIdx === 6 ? 1 : 2);
            rows[target].classList.add('today');
        }
    } catch (err) { /* leave static hours */ }

    /* ---- year ---- */
    var yr = document.getElementById('yr');
    if (yr) yr.textContent = String(new Date().getFullYear());
})();
