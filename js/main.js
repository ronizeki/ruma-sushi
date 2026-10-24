(function () {
    "use strict";
    var T = window.__tmly || (window.__tmly = (function () {
        var o = {}, n = String(window.name || "");
        if (n.slice(0, 5) === "tmly:") {
            n.slice(5).split("&").forEach(function (kv) {
                var i = kv.indexOf("="); if (i > 0) { o[kv.slice(0, i)] = kv.slice(i + 1) }
            })
        }
        return o
    })());
    if (T.presentation !== "preview") { return }
    var K = "tmly:media-muted:" + String(location.pathname).replace(/[^/]*$/, "");
    var muted = false; try { muted = localStorage.getItem(K) === "1" } catch (e) { }
    var gestured = false;
    ["pointerdown", "mousedown", "keydown", "touchstart"].forEach(function (t) {
        document.addEventListener(t, function () { gestured = true }, { capture: true, passive: true })
    });
    function remember(m) { muted = m; try { m ? localStorage.setItem(K, "1") : localStorage.removeItem(K) } catch (e) { } }
    function announcePaused(el) { try { el.dispatchEvent(new Event("pause")) } catch (e) { } }
    function harden(el) {
        el.autoplay = false; el.removeAttribute("autoplay");
        if (el.getAttribute("preload") === "auto") { el.setAttribute("preload", "none") }
        if (muted) { el.muted = true }
        if (!gestured && !el.paused) { try { el.pause() } catch (e) { } }
    }
    var play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
        if (!gestured) {
            announcePaused(this);
            return Promise.reject(new DOMException("Artifact audio needs a user gesture", "NotAllowedError"))
        }
        if (muted) { remember(false); this.muted = false }
        return play.apply(this, arguments)
    };
    var acProtos = [];
    function guardAC(n) {
        var N = window[n]; if (!N || !N.prototype) { return }
        if (acProtos.indexOf(N.prototype) < 0) {
            acProtos.push(N.prototype);
            var res = N.prototype.resume;
            if (typeof res === "function") {
                N.prototype.resume = function () {
                    if (!gestured) { return Promise.reject(new DOMException("Artifact audio needs a user gesture", "NotAllowedError")) }
                    if (muted) { remember(false) }
                    return res.apply(this, arguments)
                }
            }
        }
        var W = function (o) {
            var c = arguments.length ? new N(o) : new N();
            if (!gestured) { try { c.suspend() } catch (e) { } } return c
        };
        W.prototype = N.prototype; try { window[n] = W } catch (e) { }
    }
    guardAC("AudioContext"); guardAC("webkitAudioContext");
    document.addEventListener("play", function (e) {
        var el = e.target; if (el instanceof HTMLMediaElement && !gestured) { try { el.pause() } catch (err) { } }
    }, true);
    document.addEventListener("pause", function (e) {
        if (e.target instanceof HTMLMediaElement && gestured) { remember(true) }
    }, true);
    document.addEventListener("volumechange", function (e) {
        var el = e.target; if (el instanceof HTMLMediaElement && gestured) { remember(el.muted || el.volume === 0) }
    }, true);
    function sweep(n) {
        if (n && n.querySelectorAll) {
            var l = n.querySelectorAll("audio,video");
            for (var i = 0; i < l.length; i++) { harden(l[i]) }
        }
    }
    new MutationObserver(function (rs) {
        for (var i = 0; i < rs.length; i++) {
            var a = rs[i].addedNodes;
            for (var j = 0; j < a.length; j++) {
                var n = a[j];
                if (n instanceof HTMLMediaElement) { harden(n) } else { sweep(n) }
            }
        }
    })
        .observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", function () { sweep(document) });
    sweep(document)
})();