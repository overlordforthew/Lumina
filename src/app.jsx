import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// ═══════════════════════════════════════════════════════
// LUMINA: 90-DAY HOLISTIC GROWTH JOURNAL
// Web App version — PostgreSQL backend
// ═══════════════════════════════════════════════════════

// ─── ERROR BOUNDARY ───
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error('[lumina] React error:', error, info); }
  render() { return this.state.hasError ? React.createElement('div', {style:{padding:'2rem',textAlign:'center'}}, 'Something went wrong. Please refresh the page.') : this.props.children; }
}

// ─── API HELPER ───
var API_BASE = "/api";
var api = {
  token: (typeof localStorage !== "undefined") ? localStorage.getItem("lumina_token") : null,
  setToken: function(token) {
    this.token = token || null;
    if (typeof localStorage === "undefined") return;
    if (token) localStorage.setItem("lumina_token", token);
    else localStorage.removeItem("lumina_token");
  },
  async req(method, path, body) {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 15000);
    var opts = { method: method, headers: {}, credentials: "include", signal: controller.signal };
    if (this.token) opts.headers["Authorization"] = "Bearer " + this.token;
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    var res;
    try {
      res = await fetch(API_BASE + path, opts);
    } catch(e) {
      clearTimeout(timeout);
      if (e.name === "AbortError") throw new Error("Request timed out");
      throw e;
    }
    clearTimeout(timeout);
    var text = await res.text();
    var data = {};
    if (text) {
      try { data = JSON.parse(text); } catch(e) { data = { error: text }; }
    }
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  },
  async signup(email, name, password, lang) {
    var data = await this.req("POST", "/auth/signup", { email: email, name: name, password: password, lang: lang });
    this.setToken(data.token);
    return data.user;
  },
  async login(email, password) {
    var data = await this.req("POST", "/auth/login", { email: email, password: password });
    this.setToken(data.token);
    return data.user;
  },
  async logout() {
    try { await this.req("POST", "/auth/logout"); } catch(e) {}
    this.setToken(null);
  },
  async getSession() {
    try { return await this.req("GET", "/auth/session"); } catch(e) { this.setToken(null); return null; }
  },
  async updateLang(lang) { return this.req("PUT", "/user/lang", { lang: lang }); },
  async getBillingStatus(refresh) { return this.req("GET", "/billing/status" + (refresh ? "?refresh=1" : "")); },
  async createBillingPortal(returnUrl) { return this.req("POST", "/billing/portal", { return_url: returnUrl }); },
  async exportAccountData() {
    var opts = { method: "GET", headers: {}, credentials: "include" };
    if (this.token) opts.headers.Authorization = "Bearer " + this.token;
    var res = await fetch(API_BASE + "/account/export", opts);
    if (!res.ok) {
      var text = await res.text();
      var data = {};
      if (text) {
        try { data = JSON.parse(text); } catch(e) { data = { error: text }; }
      }
      throw new Error(data.error || "Unable to export account data");
    }
    var blob = await res.blob();
    var disposition = res.headers.get("Content-Disposition") || "";
    var match = disposition.match(/filename=\"?([^\";]+)\"?/i);
    return {
      blob: blob,
      filename: match ? match[1] : "lumina-export.json"
    };
  },
  async deleteAccount(password, confirmText) {
    return this.req("POST", "/account/delete", { password: password, confirm_text: confirmText });
  },
  async getProgress() { return this.req("GET", "/progress"); },
  async completeDay(dayNum) { return this.req("POST", "/progress/" + dayNum); },
  async getCheckins() { return this.req("GET", "/checkins"); },
  async saveCheckin(dayNum, payload) { return this.req("PUT", "/checkins/" + dayNum, payload); },
  async getReflections() { return this.req("GET", "/reflections"); },
  async saveReflection(dayNum, payload) { return this.req("PUT", "/reflections/" + dayNum, payload); },
  async getAudio(dayNum) {
    try { var d = await this.req("GET", "/audio/" + dayNum); return d.data; } catch(e) { return null; }
  },
  async saveAudio(dayNum, data) { return this.req("POST", "/audio/" + dayNum, { data: data }); },
  async getImage(dayNum) {
    try { var d = await this.req("GET", "/image/" + dayNum); return d.data; } catch(e) { return null; }
  },
};

var ANALYTICS_SESSION_KEY = "lumina_analytics_session";

function getAnalyticsSessionId() {
  if (typeof localStorage === "undefined") return "lumina-session";
  var existing = localStorage.getItem(ANALYTICS_SESSION_KEY);
  if (existing) return existing;
  var next = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : ("lumina-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  localStorage.setItem(ANALYTICS_SESSION_KEY, next);
  return next;
}

function getAnalyticsPagePath() {
  if (typeof window === "undefined") return "/";
  return (window.location.pathname || "/") + (window.location.search || "");
}

function trackEvent(name, properties, options) {
  try {
    var payload = {
      event: name,
      properties: properties || {},
      email: options && options.email ? options.email : null,
      session_id: getAnalyticsSessionId(),
      page_path: getAnalyticsPagePath(),
      source: (options && options.source) || "app"
    };
    var headers = { "Content-Type": "application/json" };
    if (api.token) headers.Authorization = "Bearer " + api.token;
    fetch(API_BASE + "/analytics/track", {
      method: "POST",
      headers: headers,
      credentials: "include",
      keepalive: true,
      body: JSON.stringify(payload)
    }).catch(function() {});
  } catch(e) {}
}

function hasLuminaAccess(billing) {
  return !!(billing && billing.entitlement && billing.entitlement.hasAccess);
}

function wait(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

var CATS = ["spiritual", "self-love", "financial", "growth"];
var CAT_INFO = {
  spiritual: { label: "Spiritual", labelJa: "\u30B9\u30D4\u30EA\u30C1\u30E5\u30A2\u30EB", color: "#9b7fd4", bg: "#f0eaf8", accent: "#7c5cbf" },
  financial: { label: "Financial", labelJa: "\u30D5\u30A1\u30A4\u30CA\u30F3\u30B9", color: "#6aaa6e", bg: "#eaf5eb", accent: "#4a8f4e" },
  "self-love": { label: "Self-Love", labelJa: "\u30BB\u30EB\u30D5\u30E9\u30D6", color: "#d4727e", bg: "#fceef0", accent: "#c0505e" },
  growth: { label: "Growth", labelJa: "\u6210\u9577", color: "#c9a84c", bg: "#faf3e0", accent: "#b08c2a" },
};

// ─── TRANSLATIONS ───
var TXT = {
  en: {
    signIn: "SIGN IN", signUp: "SIGN UP", yourName: "Your Name",
    subtitle: "The Holistic Growth Journal",
    email: "Email", password: "Password", startJourney: "START YOUR JOURNEY",
    noAccount: "No account found.", wrongPw: "Incorrect password.",
    exists: "Account already exists.", fillAll: "Please fill in all fields.",
    enterName: "Please enter your name.", journey: "Journey", lesson: "Lesson",
    profile: "Profile", dayOf: function(a,t) { return "Day " + a + " of " + t; },
    day: "Day", dayLabel: function(d) { return "Day " + d; }, locked: "Locked", completed: "Completed",
    completedOf: function(n) { return "\u2713 " + n + " of 90 completed"; },
    todaysGuidance: "Today\u2019s Guidance", playing: "Playing...",
    mp3Loaded: "MP3 loaded", tapListen: "Tap to listen",
    uploadMp3: "Upload MP3", replaceMp3: "Replace MP3",
    todaysLesson: "Today\u2019s Lesson", todaysMantra: "Today\u2019s Mantra",
    breathe: "Close your eyes. Breathe deeply. Repeat three times.",
    completeDay: function(d) { return "COMPLETE DAY " + d; },
    signOut: "SIGN OUT", language: "Language",
    cooldown: function(day, title, time) { return "You\u2019ve completed Day " + day + "\u2019s journey" + (title ? " \u2014 \"" + title + "\"" : "") + ". Please wait " + time + " before your next lesson. Take this time to reflect and journal."; },
    loading: "Loading...",
    hoursMin: function(h,m) { return h + "h " + m + "m"; },
    minutes: function(m) { return m + " minutes"; },
    phase: "Phase", ninetyDay: "90-Day Journey", ofDays: function(n) { return n + " of 90 days"; },
    // Phase names
    phAwakening: "Awakening", phDeepening: "Deepening", phExpanding: "Expanding",
    phTransforming: "Transforming", phIntegrating: "Integrating", phRadiating: "Radiating",
    // Phase descriptions (inspiring)
    phDescAwakening: "You are planting seeds of awareness. Each day the roots grow deeper.",
    phDescDeepening: "You are turning inward with courage. The shadow holds hidden gifts.",
    phDescExpanding: "Your heart is opening beyond yourself. Compassion flows outward.",
    phDescTransforming: "Old patterns dissolve. You are becoming who you were always meant to be.",
    phDescIntegrating: "Wisdom becomes action. Your practice is now your daily life.",
    phDescRadiating: "Your light touches others. You carry the journey forward for all.",
    // Phase quotes
    phQuoteAwakening: "The journey of a thousand miles begins with a single step.",
    phQuoteDeepening: "The wound is the place where the light enters you.",
    phQuoteExpanding: "In separateness lies the world\u2019s great misery; in compassion lies the world\u2019s true strength.",
    phQuoteTransforming: "What the caterpillar calls the end, the rest of the world calls a butterfly.",
    phQuoteIntegrating: "Before enlightenment, chop wood, carry water. After enlightenment, chop wood, carry water.",
    phQuoteRadiating: "Be a lamp unto yourself. Make of yourself a light.",
  },
  ja: {
    signIn: "\u30ED\u30B0\u30A4\u30F3", signUp: "\u65B0\u898F\u767B\u9332", yourName: "\u304A\u540D\u524D",
    subtitle: "\u30DB\u30EA\u30B9\u30C6\u30A3\u30C3\u30AF\u30FB\u30B0\u30ED\u30FC\u30B9\u30FB\u30B8\u30E3\u30FC\u30CA\u30EB",
    email: "\u30E1\u30FC\u30EB", password: "\u30D1\u30B9\u30EF\u30FC\u30C9", startJourney: "\u65C5\u3092\u59CB\u3081\u308B",
    noAccount: "\u30A2\u30AB\u30A6\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002", wrongPw: "\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002",
    exists: "\u30A2\u30AB\u30A6\u30F3\u30C8\u306F\u65E2\u306B\u5B58\u5728\u3057\u307E\u3059\u3002", fillAll: "\u5168\u3066\u306E\u9805\u76EE\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
    enterName: "\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002", journey: "\u65C5\u8DEF", lesson: "\u30EC\u30C3\u30B9\u30F3",
    profile: "\u30D7\u30ED\u30D5\u30A3\u30FC\u30EB", dayOf: function(a,t) { return "\u7B2C" + a + "\u65E5 / " + t + "\u65E5"; },
    day: "\u7B2C", dayLabel: function(d) { return "\u7B2C" + d + "\u65E5"; }, locked: "\u30ED\u30C3\u30AF", completed: "\u5B8C\u4E86",
    completedOf: function(n) { return "\u2713 " + n + " / 90 \u5B8C\u4E86"; },
    todaysGuidance: "\u4ECA\u65E5\u306E\u30AC\u30A4\u30C0\u30F3\u30B9", playing: "\u518D\u751F\u4E2D...",
    mp3Loaded: "MP3\u8AAD\u307F\u8FBC\u307F\u6E08", tapListen: "\u30BF\u30C3\u30D7\u3057\u3066\u8074\u304F",
    uploadMp3: "MP3\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9", replaceMp3: "MP3\u3092\u5909\u66F4",
    todaysLesson: "\u4ECA\u65E5\u306E\u30EC\u30C3\u30B9\u30F3", todaysMantra: "\u4ECA\u65E5\u306E\u30DE\u30F3\u30C8\u30E9",
    breathe: "\u76EE\u3092\u9589\u3058\u3066\u3002\u6DF1\u304F\u547C\u5438\u3057\u3066\u3002\u4E09\u56DE\u7E70\u308A\u8FD4\u3057\u3066\u3002",
    completeDay: function(d) { return "\u7B2C" + d + "\u65E5\u3092\u5B8C\u4E86"; },
    signOut: "\u30ED\u30B0\u30A2\u30A6\u30C8", language: "\u8A00\u8A9E",
    cooldown: function(day, title, time) { return "\u7B2C" + day + "\u65E5\u306E\u65C5\u3092\u5B8C\u4E86\u3057\u307E\u3057\u305F" + (title ? " \u2014 \u300C" + title + "\u300D" : "") + "\u3002\u6B21\u306E\u30EC\u30C3\u30B9\u30F3\u307E\u3067" + time + "\u304A\u5F85\u3061\u304F\u3060\u3055\u3044\u3002\u3053\u306E\u6642\u9593\u3092\u632F\u308A\u8FD4\u308A\u3068\u30B8\u30E3\u30FC\u30CA\u30EA\u30F3\u30B0\u306B\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002"; },
    loading: "\u8AAD\u307F\u8FBC\u307F\u4E2D...",
    hoursMin: function(h,m) { return h + "\u6642\u9593" + m + "\u5206"; },
    minutes: function(m) { return m + "\u5206"; },
    phase: "\u30D5\u30A7\u30FC\u30BA", ninetyDay: "90\u65E5\u9593\u306E\u65C5", ofDays: function(n) { return n + " / 90\u65E5"; },
    phAwakening: "\u899A\u9192", phDeepening: "\u6DF1\u5316", phExpanding: "\u62E1\u5F35",
    phTransforming: "\u5909\u5BB9", phIntegrating: "\u7D71\u5408", phRadiating: "\u653E\u5C04",
    phDescAwakening: "\u6C17\u3065\u304D\u306E\u7A2E\u3092\u690D\u3048\u3066\u3044\u307E\u3059\u3002\u65E5\u3005\u3001\u6839\u306F\u6DF1\u304F\u306A\u3063\u3066\u3044\u304D\u307E\u3059\u3002",
    phDescDeepening: "\u52C7\u6C17\u3092\u6301\u3063\u3066\u5185\u9762\u3092\u898B\u3064\u3081\u3066\u3044\u307E\u3059\u3002\u5F71\u306B\u306F\u96A0\u308C\u305F\u8D08\u308A\u7269\u304C\u3042\u308A\u307E\u3059\u3002",
    phDescExpanding: "\u5FC3\u304C\u81EA\u5206\u3092\u8D85\u3048\u3066\u958B\u3044\u3066\u3044\u307E\u3059\u3002\u6148\u60B2\u304C\u5916\u3078\u6D41\u308C\u307E\u3059\u3002",
    phDescTransforming: "\u53E4\u3044\u30D1\u30BF\u30FC\u30F3\u304C\u6EB6\u3051\u3066\u3044\u304D\u307E\u3059\u3002\u672C\u5F53\u306E\u81EA\u5206\u306B\u306A\u308A\u3064\u3064\u3042\u308A\u307E\u3059\u3002",
    phDescIntegrating: "\u667A\u6075\u304C\u884C\u52D5\u306B\u306A\u308A\u307E\u3059\u3002\u4FEE\u884C\u304C\u65E5\u5E38\u751F\u6D3B\u306B\u306A\u308A\u307E\u3059\u3002",
    phDescRadiating: "\u3042\u306A\u305F\u306E\u5149\u304C\u4ED6\u8005\u306B\u5C4A\u304D\u307E\u3059\u3002\u65C5\u3092\u5148\u3078\u904B\u3073\u307E\u3059\u3002",
    phQuoteAwakening: "\u5343\u91CC\u306E\u9053\u3082\u4E00\u6B69\u304B\u3089\u3002",
    phQuoteDeepening: "\u50B7\u306F\u5149\u304C\u5165\u308B\u5834\u6240\u3002",
    phQuoteExpanding: "\u5206\u96E2\u306B\u82E6\u3057\u307F\u304C\u3042\u308A\u3001\u6148\u60B2\u306B\u771F\u306E\u529B\u304C\u3042\u308B\u3002",
    phQuoteTransforming: "\u82CB\u866B\u304C\u7D42\u308F\u308A\u3068\u547C\u3076\u3082\u306E\u3092\u3001\u4E16\u754C\u306F\u8776\u3068\u547C\u3076\u3002",
    phQuoteIntegrating: "\u609F\u308A\u306E\u524D\u3082\u5F8C\u3082\u3001\u85AA\u3092\u5272\u308A\u3001\u6C34\u3092\u904B\u3076\u3002",
    phQuoteRadiating: "\u81EA\u3089\u306E\u706F\u3068\u306A\u308C\u3002",
  }
};

function t(user, key) {
  var lang = (user && user.lang) || "en";
  return (TXT[lang] && TXT[lang][key]) || TXT.en[key] || key;
}
function tf(user, key) {
  var lang = (user && user.lang) || "en";
  return (TXT[lang] && TXT[lang][key]) || TXT.en[key] || function() { return ""; };
}

function l(user, en, ja) {
  return (user && user.lang === "ja") ? ja : en;
}

// ─── FULL 90-DAY PROGRAM ───
// Phase 1 (Days 1-15): AWAKENING — Foundation practices
// Phase 2 (Days 16-30): DEEPENING — Emotional & shadow work
// Phase 3 (Days 31-45): EXPANDING — Compassion & connection
// Phase 4 (Days 46-60): TRANSFORMING — Purpose & abundance
// Phase 5 (Days 61-75): INTEGRATING — Authentic living
// Phase 6 (Days 76-90): RADIATING — Wisdom & legacy

var PROGRAM_CONTENT = { en: null, ja: null };
var PROGRAM_CONTENT_PROMISE = null;

function fetchProgramJson(url) {
  return fetch(url, { credentials: "same-origin", cache: "force-cache" }).then(function(res) {
    if (!res.ok) throw new Error("Failed to load program content");
    return res.json();
  });
}

function buildFallbackDay(dayNum, user) {
  var safeDay = Math.min(90, Math.max(1, Number(dayNum) || 1));
  return {
    day: safeDay,
    category: CATS[(safeDay - 1) % CATS.length],
    title: l(user, "Day " + safeDay, "Day " + safeDay),
    instruction: l(
      user,
      "Your Lumina lesson is getting ready. Take three slow breaths and return in a moment.",
      "Luminaのレッスンを準備中です。ゆっくり3回呼吸して、少し待ってください。"
    ),
    mantra: l(user, "I am here, and I am ready.", "私はここにいて、受け取る準備ができています。")
  };
}

function normalizeProgramContentEn(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new Error("English program content is invalid");
  return raw.slice(0, 90).map(function(item, index) {
    return {
      day: index + 1,
      category: CATS.indexOf(item && item.c) >= 0 ? item.c : CATS[index % CATS.length],
      title: String((item && item.t) || ("Day " + (index + 1))),
      instruction: String((item && item.i) || ""),
      mantra: String((item && item.m) || "")
    };
  });
}

function normalizeProgramContentJa(raw) {
  if (!raw || !Array.isArray(raw.t) || !Array.isArray(raw.i) || !Array.isArray(raw.m)) {
    throw new Error("Japanese program content is invalid");
  }
  var total = Math.min(raw.t.length, raw.i.length, raw.m.length, 90);
  if (!total) throw new Error("Japanese program content is empty");
  var result = [];
  for (var index = 0; index < total; index++) {
    var base = (PROGRAM_CONTENT.en && PROGRAM_CONTENT.en[index]) || buildFallbackDay(index + 1);
    result.push({
      day: index + 1,
      category: base.category,
      title: String(raw.t[index] || base.title),
      instruction: String(raw.i[index] || base.instruction),
      mantra: String(raw.m[index] || base.mantra)
    });
  }
  return result;
}

function loadProgramContent() {
  if (PROGRAM_CONTENT.en && PROGRAM_CONTENT.ja) {
    return Promise.resolve(PROGRAM_CONTENT);
  }
  if (PROGRAM_CONTENT_PROMISE) return PROGRAM_CONTENT_PROMISE;

  PROGRAM_CONTENT_PROMISE = Promise.all([
    fetchProgramJson("/content/program-en.json"),
    fetchProgramJson("/content/program-ja.json")
  ]).then(function(results) {
    PROGRAM_CONTENT.en = normalizeProgramContentEn(results[0]);
    PROGRAM_CONTENT.ja = normalizeProgramContentJa(results[1]);
    return PROGRAM_CONTENT;
  }).catch(function(error) {
    PROGRAM_CONTENT_PROMISE = null;
    throw error;
  });

  return PROGRAM_CONTENT_PROMISE;
}

function getDayData(dayNum, user) {
  var safeDay = Math.min(90, Math.max(1, Number(dayNum) || 1));
  var lang = (user && user.lang) || "en";
  var content = lang === "ja" ? PROGRAM_CONTENT.ja : PROGRAM_CONTENT.en;
  if (content && content[safeDay - 1]) return content[safeDay - 1];
  return buildFallbackDay(safeDay, user);
}

var F = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';
var B = '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
var MUTED = "#6b5e50";
var SOFT = "#74695d";
var CSS = "@keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes breathe{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(196,181,224,0.4)}50%{transform:scale(1.05);box-shadow:0 0 0 14px rgba(196,181,224,0)}}*{box-sizing:border-box;margin:0;padding:0}input:focus,textarea:focus{outline:none;border-color:#c4b5e0!important}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#d4c5a0;border-radius:2px}";

var COOLDOWN_MS = 12 * 3600000;

function getDaysSinceStart(sd) {
  if (!sd) return 1;
  var s = new Date(sd), n = new Date();
  s.setHours(0,0,0,0); n.setHours(0,0,0,0);
  return Math.max(1, Math.floor((n - s) / 86400000) + 1);
}

function getLastCompletionTime(progress) {
  var latest = 0;
  Object.keys(progress).forEach(function(k) {
    if (progress[k] && progress[k].completedAt) {
      var t = new Date(progress[k].completedAt).getTime();
      if (t > latest) latest = t;
    }
  });
  return latest || null;
}

function formatTimeRemaining(ms) {
  var h = Math.floor(ms / 3600000);
  var m = Math.ceil((ms % 3600000) / 60000);
  if (h > 0) return h + "h " + m + "m";
  return m + " minutes";
}

var CHECKIN_STATES = [
  { id: "ground", en: "Grounded", ja: "落ち着いている", color: "#6aaa6e" },
  { id: "tender", en: "Tender", ja: "繊細", color: "#d4727e" },
  { id: "heavy", en: "Heavy", ja: "重たい", color: "#7c9ec4" },
  { id: "open", en: "Open", ja: "開いている", color: "#c9a84c" },
  { id: "stretched", en: "Stretched", ja: "張りつめている", color: "#9b7fd4" }
];

function getCheckinStateMeta(stateId) {
  var fallback = CHECKIN_STATES[0];
  for (var i = 0; i < CHECKIN_STATES.length; i++) {
    if (CHECKIN_STATES[i].id === stateId) return CHECKIN_STATES[i];
  }
  return fallback;
}

function getSortedDayNumbers(map) {
  return Object.keys(map || {}).map(function(k) { return Number(k); }).filter(function(n) { return !isNaN(n); }).sort(function(a, b) { return a - b; });
}

function getCompletedCount(progress) {
  return getSortedDayNumbers(progress).filter(function(dayNum) { return !!progress[dayNum]; }).length;
}

function getGapDays(user, progress) {
  var highestCompleted = 0;
  getSortedDayNumbers(progress).forEach(function(dayNum) {
    if (progress[dayNum]) highestCompleted = Math.max(highestCompleted, dayNum);
  });
  var dayFromStart = Math.min(getDaysSinceStart(user && user.startDate), 90);
  return Math.max(0, dayFromStart - (highestCompleted + 1));
}

function getReentryPlan(user, progress, dayData) {
  var gapDays = getGapDays(user, progress);
  if (gapDays < 3) return null;
  return {
    gapDays: gapDays,
    title: l(user, "Return softly", "やさしく戻る"),
    body: l(
      user,
      "You have been carrying life outside the app too. Come back by completing only one small step today: your check-in, one paragraph of reflection, and one slow breath with the mantra.",
      "アプリの外でも、あなたは人生を生き続けていました。今日は無理に追いつかず、チェックインと短いリフレクション、そしてマントラと一呼吸だけで戻ってきてください。"
    ),
    cue: l(
      user,
      "Today's doorway is " + (dayData ? dayData.title : "this day") + ". You do not need to earn your place back here.",
      "今日の入口は「" + (dayData ? dayData.title : "この日") + "」。ここに戻るために、何かを証明する必要はありません。"
    )
  };
}

function extractKeywords(text) {
  var stop = { the: 1, and: 1, that: 1, with: 1, from: 1, this: 1, have: 1, your: 1, will: 1, into: 1, about: 1, them: 1, they: 1, what: 1, where: 1, when: 1, feel: 1, felt: 1, been: 1, just: 1, today: 1, because: 1, after: 1, before: 1, there: 1, their: 1, still: 1, more: 1, than: 1, then: 1, over: 1, very: 1, much: 1 };
  var counts = {};
  String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).forEach(function(word) {
    if (!word || word.length < 4 || stop[word]) return;
    counts[word] = (counts[word] || 0) + 1;
  });
  return Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; }).slice(0, 3);
}

function getAdaptiveSupport(user, dayData, checkin, reentryPlan) {
  var stateMeta = getCheckinStateMeta(checkin && checkin.state);
  var energy = (checkin && checkin.energy) || 3;
  var intensity = energy <= 2 ? l(user, "keep it gentle", "やさしく進める") : energy >= 4 ? l(user, "use the extra energy intentionally", "このエネルギーを丁寧に使う") : l(user, "stay steady", "安定して進める");
  var categoryCopy = {
    spiritual: l(user, "Let the practice be spacious, not perfect.", "完璧さではなく、余白を大切に。"),
    "self-love": l(user, "Answer yourself with softness before insight.", "気づきの前に、まず優しさで自分に応える。"),
    financial: l(user, "Notice what safety means for you today.", "今日の自分にとっての安心を見つめる。"),
    growth: l(user, "Take the smallest brave step, not the dramatic one.", "劇的な一歩ではなく、いちばん小さな勇気を選ぶ。")
  };
  return {
    eyebrow: l(user, "Adaptive guidance", "今日の寄り添い"),
    title: l(user, stateMeta.en + " is enough for today.", "今日は「" + stateMeta.ja + "」で大丈夫。"),
    body: reentryPlan ? reentryPlan.body : categoryCopy[dayData.category],
    focus: l(user, "Focus: " + intensity, "焦点: " + intensity),
    prompt: (checkin && checkin.intention)
      ? l(user, "Return to your intention: " + checkin.intention, "意図に戻る: " + checkin.intention)
      : l(user, "Choose one intention before you complete the day.", "完了する前に、ひとつ意図を選びましょう。"),
    color: stateMeta.color
  };
}

function pickResurfacedReflection(dayNum, reflections, user) {
  var reflectionDays = getSortedDayNumbers(reflections).filter(function(savedDay) {
    return savedDay < dayNum && reflections[savedDay] && reflections[savedDay].body;
  });
  if (!reflectionDays.length) return null;

  var favoriteDay = reflectionDays.filter(function(savedDay) { return reflections[savedDay].favorite; }).slice(-1)[0];
  var mirroredDay = [dayNum - 7, dayNum - 14, dayNum - 21].find(function(candidate) {
    return candidate > 0 && reflections[candidate] && reflections[candidate].body;
  });
  var targetDay = mirroredDay || favoriteDay || reflectionDays[reflectionDays.length - 1];
  var data = reflections[targetDay];
  return {
    day: targetDay,
    title: getDayData(targetDay, user).title,
    excerpt: data.body.length > 220 ? data.body.slice(0, 220).trim() + "..." : data.body,
    favorite: !!data.favorite
  };
}

function getWeeklySynthesis(user, progress, checkins, reflections) {
  var completedDays = getSortedDayNumbers(progress);
  if (completedDays.length < 3) return null;

  var highestCompleted = completedDays[completedDays.length - 1];
  var weekIndex = Math.max(1, Math.ceil(highestCompleted / 7));
  var weekStart = ((weekIndex - 1) * 7) + 1;
  var weekEnd = Math.min(weekStart + 6, 90);
  var states = {};
  var categories = {};
  var keywords = {};
  var favoriteCount = 0;
  var witnessed = 0;

  for (var dayNum = weekStart; dayNum <= weekEnd; dayNum++) {
    if (progress[dayNum]) witnessed++;
    if (checkins[dayNum] && checkins[dayNum].state) {
      states[checkins[dayNum].state] = (states[checkins[dayNum].state] || 0) + 1;
    }
    var dayData = getDayData(dayNum, user);
    categories[dayData.category] = (categories[dayData.category] || 0) + (progress[dayNum] ? 1 : 0);
    if (reflections[dayNum] && reflections[dayNum].body) {
      if (reflections[dayNum].favorite) favoriteCount++;
      extractKeywords(reflections[dayNum].body).forEach(function(word) {
        keywords[word] = (keywords[word] || 0) + 1;
      });
    }
  }

  var topState = Object.keys(states).sort(function(a, b) { return states[b] - states[a]; })[0] || "ground";
  var topCategory = Object.keys(categories).sort(function(a, b) { return categories[b] - categories[a]; })[0] || "spiritual";
  var topKeywords = Object.keys(keywords).sort(function(a, b) { return keywords[b] - keywords[a]; }).slice(0, 3);
  var stateMeta = getCheckinStateMeta(topState);

  return {
    weekIndex: weekIndex,
    title: l(user, "Week " + weekIndex + " synthesis", "第" + weekIndex + "週の統合"),
    summary: l(
      user,
      "This week carried a " + stateMeta.en.toLowerCase() + " tone, with your strongest movement in " + CAT_INFO[topCategory].label.toLowerCase() + ".",
      "今週は「" + stateMeta.ja + "」のトーンが流れ、もっとも深く動いたテーマは「" + CAT_INFO[topCategory].labelJa + "」でした。"
    ),
    focus: favoriteCount > 0
      ? l(user, "You saved " + favoriteCount + " insight" + (favoriteCount === 1 ? "" : "s") + " worth returning to.", "戻る価値のある気づきを " + favoriteCount + " 件残しました。")
      : l(user, "No favorite insight saved yet. Mark one line that you want to keep.", "まだお気に入りの気づきはありません。残したい一文をひとつ選びましょう。"),
    witnessed: witnessed,
    keywords: topKeywords,
    color: stateMeta.color
  };
}

function getJourneyMetrics(progress, checkins, reflections) {
  var completedDays = getSortedDayNumbers(progress);
  var favoriteCount = getSortedDayNumbers(reflections).filter(function(dayNum) {
    return reflections[dayNum] && reflections[dayNum].favorite;
  }).length;
  var returns = 0;
  var lastTs = null;

  completedDays.forEach(function(dayNum) {
    var ts = progress[dayNum] && progress[dayNum].completedAt ? new Date(progress[dayNum].completedAt).getTime() : null;
    if (ts && lastTs && (ts - lastTs) > (36 * 3600000)) returns++;
    if (ts) lastTs = ts;
  });

  return {
    completedCount: completedDays.length,
    checkinCount: getSortedDayNumbers(checkins).length,
    favoriteCount: favoriteCount,
    returnCount: returns
  };
}

function getMilestoneData(count, user) {
  var milestones = {
    7: {
      title: l(user, "First week complete", "最初の1週間を完了"),
      body: l(user, "You have created rhythm. That matters more than speed.", "ペースより大切な、リズムが生まれました。")
    },
    15: {
      title: l(user, "Phase one complete", "フェーズ1を完了"),
      body: l(user, "The roots are deeper now. Let yourself notice what already feels different.", "根はもう深くなっています。すでに変わっているものに気づいてください。")
    },
    30: {
      title: l(user, "A full month witnessed", "1か月の歩みを見届けた"),
      body: l(user, "Consistency has become evidence. You are building trust with yourself.", "継続は証拠になりました。あなたは自分との信頼を築いています。")
    },
    45: {
      title: l(user, "Halfway through", "半分まで到達"),
      body: l(user, "You are no longer just beginning. The work is living in you now.", "もう始めたばかりではありません。実践はすでにあなたの中で生きています。")
    },
    60: {
      title: l(user, "Transformation is visible", "変容が見えてきた"),
      body: l(user, "The path is asking for integration, not perfection.", "いま必要なのは完璧さではなく、統合です。")
    },
    75: {
      title: l(user, "Wisdom is taking shape", "知恵が形になってきた"),
      body: l(user, "What used to feel like effort is starting to feel like identity.", "努力だったものが、少しずつ在り方になっています。")
    },
    90: {
      title: l(user, "Journey complete", "旅を完了"),
      body: l(user, "Completion is not the end. It is proof that you know how to return.", "完了は終わりではなく、戻る力を知った証です。")
    }
  };
  return milestones[count] || null;
}

function buildLuminaCheckoutUrl(user, planCode) {
  var params = new URLSearchParams();
  params.set("plan", planCode || "lumina-monthly");
  params.set("return_url", window.location.origin + "/?billing=success");
  if (user && user.email) params.set("email", user.email);
  if (user && user.name) params.set("name", user.name);
  if (user && user.lang) params.set("lang", user.lang);
  return "https://namibarden.com/lumina?" + params.toString();
}

function playPlaceholderAudio() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[528,0,3,0.3],[396,0.3,4,0.15],[639,1,5,0.1]].forEach(function(t) {
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(t[0], ctx.currentTime);
      gain.gain.setValueAtTime(t[3], ctx.currentTime + t[1]);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t[2]);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t[1]); osc.stop(ctx.currentTime + t[2]);
    });
  } catch(e) {}
}

function Logo(props) {
  var size = props.size || 80;
  var colors = ["#e8b4b8","#c4b5e0","#f5deb3","#d4c5a0","#a8c5aa","#e8cfd0","#b8c9e0","#f0e0c8","#c5d4b8","#dbc4c7"];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {colors.map(function(c, i) {
        var a = (i * 36 - 90) * (Math.PI / 180);
        return <circle key={i} cx={50 + Math.cos(a) * (15 + i * 1.5)} cy={50 + Math.sin(a) * (15 + i * 1.5)} r={Math.max(38 - i * 2.5, 5)} fill={c} opacity={0.85} stroke="#c9b99a" strokeWidth="0.5" />;
      })}
      <circle cx={50} cy={50} r={4} fill="#faf5ef" stroke="#c9b99a" strokeWidth="0.5" />
    </svg>
  );
}

// ─── ILLUSTRATIONS (20 types, mapped to each day's theme) ───
function DayIllustration(props) {
  var color = props.color || "#9b7fd4";
  var size = props.size || 60;
  var bg = color + "18";
  var fill = color + "35";
  var dayNum = props.dayNum;
  var illusType = (typeof DAY_ILLUS !== "undefined" && DAY_ILLUS[dayNum - 1] !== undefined) ? DAY_ILLUS[dayNum - 1] : dayNum % 20;
  var el;

  if(illusType===0) { // Seed/Sprout
    el=<g><rect x="20" y="40" width="16" height="6" rx="3" fill={color} opacity=".2"/><line x1="28" y1="40" x2="28" y2="24" stroke={color} strokeWidth="2.5" strokeLinecap="round"/><path d="M28 28Q22 20 16 14" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/><path d="M28 24Q34 16 40 12" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/><ellipse cx="14" cy="12" rx="5" ry="6" fill={fill} stroke={color} strokeWidth="1.2" transform="rotate(-20,14,12)"/><ellipse cx="42" cy="10" rx="5" ry="6" fill={fill} stroke={color} strokeWidth="1.2" transform="rotate(15,42,10)"/></g>;
  } else if(illusType===1) { // Sitting/Meditation figure
    el=<g><circle cx="28" cy="18" r="6" fill={fill} stroke={color} strokeWidth="1.5"/><line x1="28" y1="24" x2="28" y2="36" stroke={color} strokeWidth="2" strokeLinecap="round"/><path d="M20 46L28 36L36 46" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"/><path d="M22 30L28 26L34 30" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".6"/><circle cx="28" cy="10" r="8" fill="none" stroke={color} strokeWidth=".8" opacity=".3" strokeDasharray="3,2"/></g>;
  } else if(illusType===2) { // Mirror
    el=<g><rect x="14" y="10" width="28" height="36" rx="4" fill={fill} stroke={color} strokeWidth="1.8"/><circle cx="28" cy="26" r="8" fill={bg} stroke={color} strokeWidth="1.2"/><circle cx="28" cy="26" r="3" fill={color} opacity=".15"/><line x1="18" y1="40" x2="38" y2="40" stroke={color} strokeWidth="1" opacity=".3"/></g>;
  } else if(illusType===3) { // Waves/Water
    el=<g><path d="M10 22Q20 16 30 22Q40 28 50 22" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"/><path d="M10 30Q20 24 30 30Q40 36 50 30" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" opacity=".6"/><path d="M10 38Q20 32 30 38Q40 44 50 38" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".35"/><circle cx="16" cy="18" r="2" fill={color} opacity=".3"/><circle cx="38" cy="24" r="1.5" fill={color} opacity=".25"/></g>;
  } else if(illusType===4) { // Compass
    el=<g><circle cx="28" cy="28" r="16" fill="none" stroke={color} strokeWidth="1.5"/><circle cx="28" cy="28" r="2.5" fill={color}/><line x1="28" y1="28" x2="28" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round"/><line x1="28" y1="28" x2="36" y2="34" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".6"/><circle cx="28" cy="12" r="2" fill={color} opacity=".4"/><circle cx="44" cy="28" r="1.5" fill={color} opacity=".3"/><circle cx="12" cy="28" r="1.5" fill={color} opacity=".3"/><circle cx="28" cy="44" r="1.5" fill={color} opacity=".3"/></g>;
  } else if(illusType===5) { // Candle
    el=<g><ellipse cx="28" cy="44" rx="6" ry="3" fill={fill} opacity=".4"/><rect x="25" y="30" width="6" height="14" rx="2" fill={fill} stroke={color} strokeWidth="1.5"/><path d="M28 30Q24 22 28 12Q32 22 28 30Z" fill={color} opacity=".3" stroke={color} strokeWidth="1"/><path d="M28 16Q26 10 28 6" fill="none" stroke={color} strokeWidth="1" opacity=".4" strokeLinecap="round"/><circle cx="28" cy="14" r="2" fill={color} opacity=".2"/></g>;
  } else if(illusType===6) { // Heart
    el=<g><path d="M28 44Q14 34 14 22Q14 14 22 14Q26 14 28 18Q30 14 34 14Q42 14 42 22Q42 34 28 44Z" fill={fill} stroke={color} strokeWidth="2"/><path d="M22 26L26 30L34 22" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></g>;
  } else if(illusType===7) { // Book/Scroll
    el=<g><rect x="16" y="10" width="24" height="36" rx="3" fill="none" stroke={color} strokeWidth="2"/><path d="M16 10Q28 16 40 10" fill="none" stroke={color} strokeWidth="1.5" opacity=".4"/><line x1="22" y1="20" x2="34" y2="20" stroke={color} strokeWidth="1" opacity=".3"/><line x1="22" y1="26" x2="34" y2="26" stroke={color} strokeWidth="1" opacity=".3"/><line x1="22" y1="32" x2="30" y2="32" stroke={color} strokeWidth="1" opacity=".3"/><circle cx="28" cy="40" r="3" fill={fill} stroke={color} strokeWidth="1"/></g>;
  } else if(illusType===8) { // Sunrise
    el=<g><circle cx="28" cy="28" r="8" fill={fill} stroke={color} strokeWidth="1.8"/><circle cx="28" cy="28" r="3" fill={color} opacity=".3"/><line x1="28" y1="16" x2="28" y2="8" stroke={color} strokeWidth="2" strokeLinecap="round"/><line x1="38" y1="20" x2="44" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round"/><line x1="18" y1="20" x2="12" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round"/><line x1="40" y1="28" x2="46" y2="28" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".5"/><line x1="16" y1="28" x2="10" y2="28" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".5"/><path d="M8 42L48 42" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".4"/></g>;
  } else if(illusType===9) { // Open Hands/Giving
    el=<g><path d="M12 34Q12 24 22 22L28 26" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/><path d="M44 34Q44 24 34 22L28 26" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/><circle cx="28" cy="18" r="6" fill={fill} stroke={color} strokeWidth="1.5"/><circle cx="28" cy="18" r="2.5" fill={color} opacity=".3"/><path d="M16 40Q20 36 24 40" fill="none" stroke={color} strokeWidth="1" opacity=".3"/><path d="M32 40Q36 36 40 40" fill="none" stroke={color} strokeWidth="1" opacity=".3"/></g>;
  } else if(illusType===10) { // Tree
    el=<g><line x1="28" y1="48" x2="28" y2="24" stroke={color} strokeWidth="2.5" strokeLinecap="round"/><circle cx="28" cy="18" r="14" fill={fill} stroke={color} strokeWidth="1.5"/><circle cx="22" cy="14" r="4" fill={color} opacity=".15"/><circle cx="34" cy="14" r="3.5" fill={color} opacity=".15"/><circle cx="28" cy="10" r="4" fill={color} opacity=".12"/><circle cx="20" cy="22" r="3" fill={color} opacity=".1"/><circle cx="36" cy="22" r="3" fill={color} opacity=".1"/><path d="M22 48L28 48L34 48" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".4"/></g>;
  } else if(illusType===11) { // Path/Bridge
    el=<g><path d="M8 38Q14 26 22 24L34 24Q42 26 48 38" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/><line x1="16" y1="32" x2="16" y2="38" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".4"/><line x1="24" y1="24" x2="24" y2="38" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".4"/><line x1="32" y1="24" x2="32" y2="38" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".4"/><line x1="40" y1="32" x2="40" y2="38" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".4"/><path d="M8 38L48 38" stroke={color} strokeWidth="1" opacity=".3"/><circle cx="14" cy="18" r="2" fill={color} opacity=".2"/><circle cx="42" cy="16" r="1.5" fill={color} opacity=".15"/></g>;
  } else if(illusType===12) { // Breath/Wind Spirals
    el=<g><path d="M14 22Q22 16 28 22Q34 28 28 34Q22 40 16 34" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/><path d="M28 18Q34 12 40 18Q46 24 40 30" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".5"/><circle cx="28" cy="28" r="3" fill={fill} stroke={color} strokeWidth="1.5"/><circle cx="16" cy="28" r="1.5" fill={color} opacity=".2"/><circle cx="40" cy="24" r="1" fill={color} opacity=".2"/></g>;
  } else if(illusType===13) { // Mountain
    el=<g><path d="M6 46L22 14L38 46Z" fill={fill} stroke={color} strokeWidth="1.5"/><path d="M18 46L30 22L42 46" fill={bg} stroke={color} strokeWidth="1" opacity=".5"/><path d="M18 18L22 14L26 18" fill="none" stroke={color} strokeWidth=".8" opacity=".3"/><circle cx="22" cy="10" r="2" fill={color} opacity=".2"/></g>;
  } else if(illusType===14) { // Yin-Yang/Balance
    el=<g><circle cx="28" cy="28" r="16" fill="none" stroke={color} strokeWidth="1.5"/><path d="M28 12A8 8 0 010 28A8 8 0 000 28A16 16 0 0128 12Z" fill={fill} stroke="none"/><circle cx="28" cy="20" r="3" fill={color} opacity=".3"/><circle cx="28" cy="36" r="3" fill={fill} stroke={color} strokeWidth="1" opacity=".5"/></g>;
  } else if(illusType===15) { // Butterfly
    el=<g><path d="M28 28Q22 20 16 22Q12 28 20 30Q14 34 20 38Q26 42 28 36" fill={fill} stroke={color} strokeWidth="1.5"/><path d="M28 28Q34 20 40 22Q44 28 36 30Q42 34 36 38Q30 42 28 36" fill={fill} stroke={color} strokeWidth="1.5"/><line x1="28" y1="36" x2="28" y2="46" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".4"/><circle cx="24" cy="24" r="1.5" fill={color} opacity=".3"/><circle cx="32" cy="24" r="1.5" fill={color} opacity=".3"/></g>;
  } else if(illusType===16) { // Eye/Awareness
    el=<g><path d="M8 28Q18 16 28 16Q38 16 48 28Q38 40 28 40Q18 40 8 28Z" fill={fill} stroke={color} strokeWidth="1.5"/><circle cx="28" cy="28" r="7" fill={bg} stroke={color} strokeWidth="1.2"/><circle cx="28" cy="28" r="3" fill={color} opacity=".4"/><circle cx="26" cy="26" r="1" fill="#fff" opacity=".6"/></g>;
  } else if(illusType===17) { // Mandala/Interconnection
    el=<g><circle cx="28" cy="28" r="6" fill={fill} stroke={color} strokeWidth="2"/><circle cx="28" cy="28" r="12" fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="4,3" opacity=".5"/><circle cx="28" cy="28" r="18" fill="none" stroke={color} strokeWidth=".8" opacity=".3" strokeDasharray="5,4"/><circle cx="28" cy="28" r="2.5" fill={color} opacity=".4"/><circle cx="28" cy="14" r="1.5" fill={color} opacity=".3"/><circle cx="28" cy="42" r="1.5" fill={color} opacity=".3"/><circle cx="14" cy="28" r="1.5" fill={color} opacity=".3"/><circle cx="42" cy="28" r="1.5" fill={color} opacity=".3"/></g>;
  } else if(illusType===18) { // Doorway/Opening
    el=<g><rect x="16" y="10" width="24" height="36" rx="3" fill="none" stroke={color} strokeWidth="2"/><path d="M16 10Q28 4 40 10" fill="none" stroke={color} strokeWidth="1.5" opacity=".6"/><line x1="22" y1="46" x2="22" y2="34" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".5"/><line x1="34" y1="46" x2="34" y2="34" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".5"/><circle cx="28" cy="24" r="4" fill={fill} stroke={color} strokeWidth="1.2"/><circle cx="28" cy="24" r="1.5" fill={color} opacity=".2"/></g>;
  } else { // Flame/Phoenix (19+)
    el=<g><path d="M28 8Q22 20 18 28Q14 38 28 46Q42 38 38 28Q34 20 28 8Z" fill={fill} stroke={color} strokeWidth="1.5"/><path d="M28 18Q26 26 24 30Q22 36 28 42Q34 36 32 30Q30 26 28 18Z" fill={color} opacity=".15" stroke={color} strokeWidth=".8"/><circle cx="28" cy="32" r="3" fill={color} opacity=".25"/></g>;
  }

  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 12px " + color + "30", border: "2px solid " + color + "40" }}>
      <svg width={size - 8} height={size - 8} viewBox="0 0 56 56">{el}</svg>
    </div>
  );
}

// ─── AUTH ───
function AuthScreen(props) {
  var [mode, setMode] = useState("login");
  var [email, setEmail] = useState("");
  var [pw, setPw] = useState("");
  var [showPw, setShowPw] = useState(false);
  var [name, setName] = useState("");
  var [lang, setLang] = useState("en");
  var [err, setErr] = useState("");
  var [busy, setBusy] = useState(false);
  useEffect(function() {
    trackEvent("auth_screen_viewed", { mode: mode, lang: lang });
  }, []);
  var submit = async function() {
    setErr("");
    if (!email || !pw) { setErr(t({lang:lang}, "fillAll")); return; }
    if (mode === "signup" && !name) { setErr(t({lang:lang}, "enterName")); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        var ud = await api.signup(email, name, pw, lang);
        trackEvent("auth_signup_completed", { lang: lang }, { email: ud.email });
        props.onLogin(ud, { mode: mode, lang: lang });
      } else {
        var ud2 = await api.login(email, pw);
        trackEvent("auth_login_completed", { lang: ud2.lang || lang }, { email: ud2.email });
        props.onLogin(ud2, { mode: mode, lang: ud2.lang || lang });
      }
    } catch(e) {
      var errKey = e.message;
      var knownErrors = ["fillAll","exists","noAccount","wrongPw"];
      setErr(knownErrors.indexOf(errKey) >= 0 ? t({lang:lang}, errKey) : t({lang:lang}, errKey) || "Something went wrong.");
    }
    setBusy(false);
  };
  var inp = { width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #e0d8ce", fontFamily: B, fontSize: 15, background: "#fff", marginBottom: 14, color: "#3a3028" };
  var L = {lang: lang};
  return (
    <main aria-labelledby="lumina-auth-title" aria-describedby="lumina-auth-copy" style={{ minHeight: "100dvh", background: "#f5f0e8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{CSS}</style>
      <Logo size={80} />
      <h1 id="lumina-auth-title" style={{ fontFamily: F, fontWeight: 300, fontSize: 34, color: "#4a3f33", letterSpacing: 8, margin: "10px 0 2px" }}>LUMINA</h1>
      <p style={{ fontFamily: B, fontSize: 12, color: MUTED, letterSpacing: 2, marginBottom: 10 }}>{t(L, "subtitle")}</p>
      <p id="lumina-auth-copy" style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.7, textAlign: "center", maxWidth: 380, marginBottom: 28 }}>
        {l(L, "Daily guidance, reflection, and gentle pacing for meaningful inner work.", "毎日のガイダンス、リフレクション、やさしいペースで深い内面の歩みを支えます。")}
      </p>
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 380, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", marginBottom: 20, borderRadius: 10, overflow: "hidden", border: "1px solid #e0d8ce" }}>
          {["login", "signup"].map(function(m) {
            return <button type="button" key={m} aria-pressed={mode === m} onClick={function() { setMode(m); setErr(""); }} style={{ flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontFamily: B, fontSize: 13, fontWeight: 700, letterSpacing: 1, background: mode === m ? "#4a3f33" : "#fff", color: mode === m ? "#fff" : MUTED }}>{m === "login" ? t(L, "signIn") : t(L, "signUp")}</button>;
          })}
        </div>
        {mode === "signup" && <input placeholder={t(L, "yourName")} value={name} onChange={function(e) { setName(e.target.value); }} style={inp} />}
        {mode === "signup" && (
          <div style={{ display: "flex", marginBottom: 14, borderRadius: 10, overflow: "hidden", border: "1px solid #e0d8ce" }}>
            {[["en", "English"], ["ja", "\u65E5\u672C\u8A9E"]].map(function(pair) {
              var code = pair[0], lbl = pair[1];
              return <button type="button" key={code} aria-pressed={lang === code} onClick={function() { setLang(code); }} style={{ flex: 1, padding: "9px 0", border: "none", cursor: "pointer", fontFamily: B, fontSize: 13, fontWeight: 600, background: lang === code ? "#4a3f33" : "#fff", color: lang === code ? "#fff" : MUTED }}>{lbl}</button>;
            })}
          </div>
        )}
        <input placeholder={t(L, "email")} type="email" value={email} onChange={function(e) { setEmail(e.target.value); }} style={inp} />
        <div style={{ position: "relative", marginBottom: 14 }}>
          <input placeholder={t(L, "password")} type={showPw ? "text" : "password"} value={pw} onChange={function(e) { setPw(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") submit(); }} style={{ width: "100%", padding: "14px 46px 14px 16px", borderRadius: 12, border: "1px solid #e0d8ce", fontFamily: B, fontSize: 15, background: "#fff", color: "#3a3028", boxSizing: "border-box" }} />
          <button aria-label={showPw ? l(L, "Hide password", "パスワードを隠す") : l(L, "Show password", "パスワードを表示")} title={showPw ? l(L, "Hide password", "パスワードを隠す") : l(L, "Show password", "パスワードを表示")} onClick={function() { setShowPw(!showPw); }} type="button" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            {showPw ? (
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            ) : (
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.5"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            )}
          </button>
        </div>
        {err && <p style={{ fontFamily: B, fontSize: 13, color: "#c0524a", marginBottom: 8 }}>{err}</p>}
        <button onClick={submit} disabled={busy} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "#4a3f33", color: "#fff", fontFamily: F, fontSize: 16, fontWeight: 500, letterSpacing: 2, cursor: "pointer", marginTop: 4 }}>{busy ? "..." : t(L, "startJourney")}</button>
      </div>
    </main>
  );
}

function BillingScreen(props) {
  var user = props.user;
  var billing = props.billing || {};
  var entitlement = billing.entitlement || {};
  useEffect(function() {
    if (!user || !user.email) return;
    trackEvent("billing_screen_viewed", {
      status: entitlement.status || "inactive",
      accessState: entitlement.accessState || "inactive",
      justActivated: !!props.justActivated,
      activatingAccess: !!props.activatingAccess
    }, { email: user.email });
  }, [user && user.email, entitlement.status, entitlement.accessState, props.justActivated, props.activatingAccess]);
  var statusCopy = entitlement.status
    ? l(user, "Current state: " + entitlement.status, "現在の状態: " + entitlement.status)
    : l(user, "Membership required to enter Lumina.", "Lumina を使うにはメンバーシップが必要です。");
  var card = function(planCode, priceEn, priceJa, subtitleEn, subtitleJa) {
    return (
      <button
        key={planCode}
        onClick={function() { props.onCheckout(planCode); }}
        style={{
          width: "100%",
          border: "1px solid #e4dccf",
          background: "#fff",
          borderRadius: 18,
          padding: "18px 18px",
          textAlign: "left",
          cursor: "pointer",
          boxShadow: "0 2px 10px rgba(0,0,0,0.04)"
        }}
      >
        <p style={{ fontFamily: B, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#8a7e6e", textTransform: "uppercase", marginBottom: 8 }}>
          {planCode === "lumina-monthly" ? l(user, "Monthly membership", "月額メンバーシップ") : l(user, "Annual membership", "年額メンバーシップ")}
        </p>
        <h3 style={{ fontFamily: F, fontSize: 28, fontWeight: 400, color: "#3a3028", marginBottom: 6 }}>{l(user, priceEn, priceJa)}</h3>
        <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.6 }}>{l(user, subtitleEn, subtitleJa)}</p>
      </button>
    );
  };

  return (
    <main aria-labelledby="lumina-billing-title" style={{ minHeight: "100dvh", background: "#f5f0e8", padding: "32px 22px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Logo size={76} />
          <h1 id="lumina-billing-title" style={{ fontFamily: F, fontWeight: 400, fontSize: 34, color: "#4a3f33", letterSpacing: 8, margin: "10px 0 6px" }}>LUMINA</h1>
          <p style={{ fontFamily: B, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
            {l(
              user,
              "Billing is managed on namibarden.com. Use the same email address here and on checkout so your access unlocks automatically.",
              "請求は namibarden.com 側で管理されます。ここで使うメールアドレスと同じものを決済でも使うと、自動でアクセスが有効になります。"
            )}
          </p>
        </div>

        <div style={{ background: "#fff", borderRadius: 22, padding: "24px 22px", boxShadow: "0 8px 28px rgba(0,0,0,0.06)" }}>
          <div style={{ marginBottom: 18, padding: "14px 16px", borderRadius: 16, background: "linear-gradient(135deg, #f8f3eb, #fff)", border: "1px solid #eadfcf" }}>
            <p style={{ fontFamily: B, fontSize: 12, fontWeight: 700, color: "#6b5e50", marginBottom: 4 }}>{user.name}</p>
            <p style={{ fontFamily: B, fontSize: 12, color: "#8a7e6e", marginBottom: 6 }}>{user.email}</p>
            <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.6 }}>{statusCopy}</p>
          </div>

          {props.activatingAccess && (
            <div style={{ marginBottom: 18, padding: "14px 16px", borderRadius: 16, background: "#f7f0ff", border: "1px solid #ddd0f2" }}>
              <p style={{ fontFamily: B, fontSize: 13, color: "#6a55a3", lineHeight: 1.6 }}>
                {l(user, "Activating your Lumina access now. This can take a few moments after checkout.", "Lumina のアクセスを有効化しています。決済直後は少しだけ時間がかかることがあります。")}
              </p>
            </div>
          )}

          {props.justActivated && (
            <div style={{ marginBottom: 18, padding: "14px 16px", borderRadius: 16, background: "#eaf5eb", border: "1px solid #cfe4d1" }}>
              <p style={{ fontFamily: B, fontSize: 13, color: "#3f7d46", lineHeight: 1.6 }}>
                {l(user, "Checkout completed. Refresh access if Lumina has not unlocked yet.", "決済は完了しています。まだ Lumina が開かない場合はアクセスを更新してください。")}
              </p>
            </div>
          )}

          <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
            {card(
              "lumina-monthly",
              "JPY 2,980 / month",
              "2,980円 / 月",
              "7-day trial, full guided journey, weekly synthesis, reflection library, and ongoing access.",
              "7日間トライアル、ガイド付きジャーニー、週次統合、リフレクション保存、継続アクセス。"
            )}
            {card(
              "lumina-annual",
              "JPY 29,800 / year",
              "29,800円 / 年",
              "Best value for deeper work across the full year.",
              "一年を通して深く取り組む方向けのプランです。"
            )}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={props.onRefresh} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid #d9d0c4", background: "#fff", color: "#6b5e50", fontFamily: B, fontSize: 13, cursor: "pointer" }}>
              {l(user, "Refresh access", "アクセスを更新")}
            </button>
            <button onClick={props.onOpenPortal} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: "#4a3f33", color: "#fff", fontFamily: B, fontSize: 13, cursor: "pointer" }}>
              {l(user, "Manage billing", "請求を管理")}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── VINE BACKGROUND ───
function VineSegment(props) {
  var y = props.y;
  var flip = props.flip;
  var color = props.color || "#6aaa6e";
  var sc = flip ? -1 : 1;
  return (
    <g transform={"translate(0," + y + ") scale(" + sc + ",1)"} style={{ transformOrigin: "50% " + (y + 50) + "px" }}>
      <path d={"M28 0 Q28 20 42 30 Q56 40 42 55 Q28 70 28 100"} fill="none" stroke={color} strokeWidth="2.5" opacity=".18" strokeLinecap="round"/>
      <path d={"M42 28 Q50 22 48 14"} fill="none" stroke={color} strokeWidth="1.5" opacity=".15" strokeLinecap="round"/>
      <ellipse cx="48" cy="12" rx="6" ry="4" fill={color} opacity=".08" transform="rotate(-30,48,12)"/>
      <ellipse cx="50" cy="16" rx="5" ry="3.5" fill={color} opacity=".06" transform="rotate(-10,50,16)"/>
      <path d={"M42 55 Q34 50 30 42"} fill="none" stroke={color} strokeWidth="1.5" opacity=".12" strokeLinecap="round"/>
      <ellipse cx="28" cy="40" rx="5" ry="3.5" fill={color} opacity=".07" transform="rotate(20,28,40)"/>
      <circle cx="46" cy="30" r="2" fill={color} opacity=".1"/>
      <circle cx="36" cy="60" r="1.5" fill={color} opacity=".08"/>
    </g>
  );
}

// ─── JOURNEY MAP ───
function JourneyMap(props) {
  var progress = props.progress, maxDay = props.maxUnlockedDay, onSelect = props.onSelectDay, user = props.user;
  var scrollRef = useRef(null), activeRef = useRef(null);
  var activeDay = maxDay;
  for (var d = 1; d <= maxDay; d++) { if (!progress[d]) { activeDay = d; break; } }
  useEffect(function() {
    if (activeRef.current && scrollRef.current) {
      var top = activeRef.current.offsetTop - 80;
      scrollRef.current.scrollTop = top > 0 ? top : 0;
    }
  }, []);
  var completedCount = Object.keys(progress).length;
  var days = [];
  for (var i = 1; i <= 90; i++) days.push(i);

  // Build vine segments for background
  var vineColors = ["#6aaa6e", "#9b7fd4", "#d4727e", "#c9a84c"];
  var vineSegs = [];
  for (var v = 0; v < 45; v++) {
    vineSegs.push({ y: v * 100, flip: v % 2 === 1, color: vineColors[v % 4] });
  }

  return (
    <div ref={scrollRef} style={{ flex: 1, overflow: "auto", position: "relative" }}>
      {/* Vine background SVG */}
      <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 90 * 120, pointerEvents: "none", zIndex: 0 }} viewBox={"0 0 56 " + (90 * 100)} preserveAspectRatio="none">
        {vineSegs.map(function(seg, si) {
          return <VineSegment key={si} y={seg.y} flip={seg.flip} color={seg.color} />;
        })}
      </svg>

      <div style={{ position: "relative", zIndex: 1, padding: "8px 14px 20px" }}>
        {props.reentryPlan && (
          <div style={{ background: "linear-gradient(135deg, #fff6ea, #fff)", borderRadius: 18, padding: "16px 18px", marginBottom: 10, border: "1px solid #ead7b8", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <p style={{ fontFamily: B, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#b07a30", textTransform: "uppercase", marginBottom: 6 }}>{props.reentryPlan.title}</p>
            <p style={{ fontFamily: F, fontSize: 19, color: "#3a3028", marginBottom: 8 }}>{l(user, props.reentryPlan.gapDays + " days away does not erase the path.", props.reentryPlan.gapDays + "日空いても、この道は消えません。")}</p>
            <p style={{ fontFamily: B, fontSize: 13, color: "#6b5e50", lineHeight: 1.7, marginBottom: 8 }}>{props.reentryPlan.body}</p>
            <p style={{ fontFamily: B, fontSize: 12, color: "#8a7e6e", lineHeight: 1.6 }}>{props.reentryPlan.cue}</p>
          </div>
        )}
        {props.weeklySynthesis && (
          <div style={{ background: "linear-gradient(135deg, " + props.weeklySynthesis.color + "14, #fff)", borderRadius: 18, padding: "16px 18px", marginBottom: 10, border: "1px solid " + props.weeklySynthesis.color + "25", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <p style={{ fontFamily: B, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: props.weeklySynthesis.color, textTransform: "uppercase", marginBottom: 6 }}>{props.weeklySynthesis.title}</p>
            <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.7, marginBottom: 8 }}>{props.weeklySynthesis.summary}</p>
            <p style={{ fontFamily: F, fontSize: 18, color: "#3a3028", marginBottom: 8 }}>{props.weeklySynthesis.focus}</p>
            {props.weeklySynthesis.keywords && props.weeklySynthesis.keywords.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {props.weeklySynthesis.keywords.map(function(keyword) {
                  return <span key={keyword} style={{ padding: "5px 10px", borderRadius: 999, background: "#fff", border: "1px solid #eadfcf", fontFamily: B, fontSize: 11, color: "#7a6b5c" }}>{keyword}</span>;
                })}
              </div>
            )}
          </div>
        )}
        {completedCount > 0 && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
            <div style={{ background: "linear-gradient(135deg, #e6f2e7, #eaf5eb)", borderRadius: 20, padding: "6px 18px", boxShadow: "0 2px 8px rgba(106,170,110,0.15)" }}>
              <span style={{ fontFamily: B, fontSize: 12, color: "#4a8f4e", fontWeight: 700 }}>{tf(user, "completedOf")(completedCount)}</span>
            </div>
          </div>
        )}
        {days.map(function(dayNum) {
          var completed = !!progress[dayNum];
          var isCurrent = dayNum === activeDay && !completed;
          var isLocked = !completed && dayNum > activeDay;
          var canClick = completed || isCurrent;
          var dd = getDayData(dayNum, user);
          var cat = CAT_INFO[dd.category];
          var isLeft = dayNum % 2 === 1;

          var textColor = isCurrent ? "#3a3028" : completed ? "#4a3f33" : "#6b6158";
          var subColor = isLocked ? "#9a8e80" : "#5a4e40";

          var nodeSize = isCurrent ? 58 : 50;
          var illusSize = isCurrent ? 62 : 54;

          var circle = (
            <div style={{
              width: nodeSize, height: nodeSize,
              borderRadius: "50%",
              background: completed ? ("linear-gradient(135deg, " + cat.color + ", " + cat.accent + ")") : isCurrent ? "#fff" : "#ede8e0",
              border: isCurrent ? ("3px solid " + cat.color) : completed ? "none" : ("2px solid " + (isLocked ? "#ccc5b8" : "#c8c0b4")),
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: isLocked ? 0.65 : 1,
              animation: isCurrent ? "breathe 3s ease-in-out infinite" : "none",
              flexShrink: 0,
              boxShadow: completed ? ("0 3px 12px " + cat.color + "50") : isCurrent ? ("0 3px 16px " + cat.color + "40") : "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              {completed ? (
                <span style={{ fontSize: 20, color: "#fff", fontWeight: 700 }}>{"\u2713"}</span>
              ) : isLocked ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a09488" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
              ) : (
                <span style={{ fontSize: isCurrent ? 22 : 18, fontFamily: F, fontWeight: 600, color: "#4a3f33" }}>{dayNum}</span>
              )}
            </div>
          );

          var label = (
            <div style={{ minWidth: 0, textAlign: isLeft ? "left" : "right" }}>
              <p style={{ fontFamily: B, fontSize: 14, fontWeight: 700, color: textColor, marginBottom: 1 }}>{tf(user, "dayLabel")(dayNum)}</p>
              <p style={{ fontFamily: B, fontSize: 11, color: subColor, lineHeight: 1.3 }}>{isLocked ? t(user, "locked") : dd.title}</p>
            </div>
          );

          var illus = (
            <div style={{ opacity: isLocked ? 0.35 : 1, flexShrink: 0 }}>
              <DayIllustration dayNum={dayNum} color={cat.color} size={illusSize} />
            </div>
          );

          // Zigzag: left days hug left, right days hug right
          // Layout for left: [illus] [circle] [label] ---- gap ----
          // Layout for right: ---- gap ---- [label] [circle] [illus]
          var innerContent;
          if (isLeft) {
            innerContent = (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {illus}{circle}{label}
              </div>
            );
          } else {
            innerContent = (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {label}{circle}{illus}
              </div>
            );
          }

          return (
            <div key={dayNum} ref={isCurrent ? activeRef : null}
              onClick={function() { if (canClick) onSelect(dayNum); }}
              style={{
                display: "flex",
                justifyContent: isLeft ? "flex-start" : "flex-end",
                padding: "6px 10px",
                minHeight: "calc((100vh - 110px) / 5)",
                alignItems: "center",
                cursor: canClick ? "pointer" : "default",
                borderRadius: 14,
                marginBottom: 0,
              }}>
              <div style={{
                display: "flex", alignItems: "center",
                padding: "8px 12px",
                borderRadius: 16,
                background: isCurrent ? "rgba(255,255,255,0.75)" : completed ? "rgba(255,255,255,0.5)" : "transparent",
                backdropFilter: (isCurrent || completed) ? "blur(6px)" : "none",
                boxShadow: isCurrent ? "0 4px 20px rgba(0,0,0,0.08)" : completed ? "0 2px 10px rgba(0,0,0,0.04)" : "none",
              }}>
                {innerContent}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── WATERCOLOR ART GENERATOR ───
// Generates unique Waldorf Steiner-style watercolor SVG for each day
function WatercolorArt(props) {
  var dayNum = props.dayNum;
  var cat = props.cat;
  var color = cat.color;
  var accent = cat.accent;
  // Generate unique but deterministic "random" values from day number
  function seeded(n) { var x = Math.sin(dayNum * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); }
  // Color palette - warm watercolor tones
  var palette = [color, accent, color + "80", accent + "60", "#e8cfa0", "#d4a0b8", "#a0c4d4", "#c4d4a0"];
  var blobs = [];
  for (var i = 0; i < 12; i++) {
    var cx = 30 + seeded(i * 3) * 140;
    var cy = 30 + seeded(i * 3 + 1) * 100;
    var rx = 20 + seeded(i * 3 + 2) * 40;
    var ry = 15 + seeded(i * 7) * 35;
    var rot = seeded(i * 11) * 360;
    var c = palette[i % palette.length];
    var op = 0.08 + seeded(i * 13) * 0.12;
    blobs.push({ cx: cx, cy: cy, rx: rx, ry: ry, rot: rot, color: c, opacity: op });
  }
  // Central motif shapes based on day theme
  var motifIdx = (dayNum - 1) % 10;
  var motif;
  if (motifIdx === 0) motif = <g><circle cx="100" cy="80" r="18" fill={color} opacity=".2"/><path d="M100 62 Q92 50 88 38" fill="none" stroke={accent} strokeWidth="2" opacity=".4"/><path d="M100 62 Q108 48 114 36" fill="none" stroke={accent} strokeWidth="2" opacity=".4"/><ellipse cx="86" cy="34" rx="6" ry="9" fill={color} opacity=".2" transform="rotate(-20,86,34)"/><ellipse cx="116" cy="32" rx="6" ry="9" fill={color} opacity=".2" transform="rotate(20,116,32)"/><circle cx="92" cy="46" r="2" fill={accent} opacity=".3"/><circle cx="108" cy="44" r="2" fill={accent} opacity=".3"/></g>;
  else if (motifIdx === 1) motif = <g><ellipse cx="100" cy="80" rx="22" ry="28" fill={color} opacity=".12" /><ellipse cx="100" cy="80" rx="16" ry="22" fill="white" opacity=".3"/><circle cx="94" cy="74" r="4" fill={accent} opacity=".2"/><circle cx="106" cy="74" r="4" fill={accent} opacity=".2"/></g>;
  else if (motifIdx === 2) motif = <g><circle cx="85" cy="70" r="14" fill={color} opacity=".15" stroke={accent} strokeWidth="1"/><circle cx="115" cy="85" r="12" fill={accent} opacity=".12"/><circle cx="95" cy="95" r="10" fill={color} opacity=".1"/><path d="M85 56 Q100 50 115 73" fill="none" stroke={color} strokeWidth="1.5" opacity=".15" strokeDasharray="4,3"/></g>;
  else if (motifIdx === 3) motif = <g><circle cx="100" cy="80" r="12" fill={color} opacity=".15"/><circle cx="100" cy="80" r="22" fill="none" stroke={accent} strokeWidth="1" opacity=".15" strokeDasharray="4,4"/><circle cx="100" cy="80" r="32" fill="none" stroke={color} strokeWidth=".8" opacity=".1" strokeDasharray="6,4"/></g>;
  else if (motifIdx === 4) motif = <g><circle cx="100" cy="70" r="10" fill={color} opacity=".12"/><path d="M100 80 L100 100" stroke={accent} strokeWidth="2" opacity=".2"/><path d="M88 88 L100 94 L112 88" fill="none" stroke={color} strokeWidth="1.5" opacity=".15"/></g>;
  else if (motifIdx === 5) motif = <g><path d="M100 100 Q82 86 82 72 Q82 62 92 62 Q98 62 100 68 Q102 62 108 62 Q118 62 118 72 Q118 86 100 100Z" fill={color} opacity=".15"/></g>;
  else if (motifIdx === 6) motif = <g><path d="M80 65 Q76 62 76 80 Q76 95 100 100" fill="none" stroke={color} strokeWidth="1.5" opacity=".2"/><path d="M120 65 Q124 62 124 80 Q124 95 100 100" fill="none" stroke={accent} strokeWidth="1.5" opacity=".2"/><line x1="100" y1="60" x2="100" y2="100" stroke={color} strokeWidth="1" opacity=".15"/></g>;
  else if (motifIdx === 7) motif = <g><circle cx="100" cy="78" r="16" fill={color} opacity=".12"/><line x1="100" y1="58" x2="100" y2="50" stroke={accent} strokeWidth="2" opacity=".2"/><line x1="116" y1="68" x2="124" y2="62" stroke={accent} strokeWidth="1.5" opacity=".15"/><line x1="84" y1="68" x2="76" y2="62" stroke={accent} strokeWidth="1.5" opacity=".15"/></g>;
  else if (motifIdx === 8) motif = <g><path d="M80 78 Q90 68 100 78 Q110 88 120 78" fill="none" stroke={color} strokeWidth="2" opacity=".2"/><path d="M80 88 Q90 78 100 88 Q110 98 120 88" fill="none" stroke={accent} strokeWidth="1.5" opacity=".15"/></g>;
  else motif = <g><line x1="100" y1="100" x2="100" y2="68" stroke={accent} strokeWidth="2" opacity=".2"/><circle cx="100" cy="62" r="16" fill={color} opacity=".1"/><circle cx="94" cy="58" r="6" fill={accent} opacity=".08"/><circle cx="106" cy="60" r="5" fill={accent} opacity=".08"/></g>;

  return (
    <svg width="100%" viewBox="0 0 200 160" style={{ borderRadius: 14, display: "block" }}>
      <rect width="200" height="160" fill={cat.bg} rx="8"/>
      {blobs.map(function(b, bi) {
        return <ellipse key={bi} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={b.color} opacity={b.opacity} transform={"rotate(" + b.rot + "," + b.cx + "," + b.cy + ")"}/>;
      })}
      {motif}
    </svg>
  );
}

// ─── LESSON IMAGE (from storage or watercolor fallback) ───
function LessonImage(props) {
  var dayNum = props.dayNum;
  var cat = props.cat;
  var [imgData, setImgData] = useState(null);
  var [loadingImg, setLoadingImg] = useState(true);
  useEffect(function() {
    setLoadingImg(true);
    setImgData(null);
    var load = async function() {
      try {
        var data = await api.getImage(dayNum);
        if (data) setImgData(data);
      } catch(e) {}
      setLoadingImg(false);
    };
    load();
  }, [dayNum]);
  if (loadingImg) return <div style={{ height: 160, borderRadius: 14, background: cat.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ fontFamily: B, fontSize: 12, color: "#a09488" }}>Loading...</p></div>;
  if (imgData) return <img src={imgData} alt={"Day " + dayNum} style={{ width: "100%", borderRadius: 14, display: "block", objectFit: "cover", maxHeight: 220 }} />;
  return <WatercolorArt dayNum={dayNum} cat={cat} />;
}

// ─── LESSON VIEW ───
function LessonView(props) {
  var dayData = props.dayData, dayNum = props.dayNum, isCompleted = props.isCompleted;
  var onComplete = props.onComplete, cooldownMsg = props.cooldownMsg, user = props.user;
  var cat = CAT_INFO[dayData.category];
  var [playing, setPlaying] = useState(false);
  var [showCooldown, setShowCooldown] = useState(false);
  var [audioUrl, setAudioUrl] = useState(null);
  var [checkinState, setCheckinState] = useState((props.checkin && props.checkin.state) || "ground");
  var [energy, setEnergy] = useState((props.checkin && props.checkin.energy) || 3);
  var [intention, setIntention] = useState((props.checkin && props.checkin.intention) || "");
  var [note, setNote] = useState((props.checkin && props.checkin.note) || "");
  var [reflectionBody, setReflectionBody] = useState((props.reflection && props.reflection.body) || "");
  var [favoriteReflection, setFavoriteReflection] = useState(!!(props.reflection && props.reflection.favorite));
  var [savingCheckin, setSavingCheckin] = useState(false);
  var [savingReflection, setSavingReflection] = useState(false);
  var [savedCheckin, setSavedCheckin] = useState(false);
  var [savedReflection, setSavedReflection] = useState(false);
  var audioRef = useRef(null);

  useEffect(function() {
    setCheckinState((props.checkin && props.checkin.state) || "ground");
    setEnergy((props.checkin && props.checkin.energy) || 3);
    setIntention((props.checkin && props.checkin.intention) || "");
    setNote((props.checkin && props.checkin.note) || "");
    setSavedCheckin(false);
  }, [dayNum, props.checkin && props.checkin.updatedAt]);

  useEffect(function() {
    setReflectionBody((props.reflection && props.reflection.body) || "");
    setFavoriteReflection(!!(props.reflection && props.reflection.favorite));
    setSavedReflection(false);
  }, [dayNum, props.reflection && props.reflection.updatedAt]);

  // Load stored mp3 for this day
  useEffect(function() {
    setAudioUrl(null);
    var loadAudio = async function() {
      try {
        var data = await api.getAudio(dayNum);
        if (data) setAudioUrl(data);
      } catch(e) {}
    };
    loadAudio();
  }, [dayNum]);

  var handlePlay = function() {
    if (audioUrl) {
      // Play stored mp3
      if (audioRef.current) { audioRef.current.pause(); }
      var audio = new Audio(audioUrl);
      audioRef.current = audio;
      setPlaying(true);
      audio.play().catch(function() {});
      audio.onended = function() { setPlaying(false); };
    } else {
      // Fallback bell sound
      setPlaying(true);
      playPlaceholderAudio();
      setTimeout(function() { setPlaying(false); }, 5000);
    }
  };
  var handlePause = function() {
    if (audioRef.current) { audioRef.current.pause(); }
    setPlaying(false);
  };

  var handleUploadAudio = function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function(ev) {
      var data = ev.target.result;
      setAudioUrl(data);
      try { await api.saveAudio(dayNum, data); } catch(err) {}
    };
    reader.readAsDataURL(file);
  };

  var handleSaveCheckin = async function() {
    if (!props.onSaveCheckin) return;
    setSavingCheckin(true);
    try {
      await props.onSaveCheckin(dayNum, {
        state: checkinState,
        energy: energy,
        intention: intention,
        note: note
      });
      setSavedCheckin(true);
    } catch(e) {
      console.error('[lumina] Save checkin failed:', e);
      alert('Failed to save check-in. Please try again.');
    }
    setSavingCheckin(false);
  };

  var handleSaveReflection = async function() {
    if (!props.onSaveReflection) return;
    setSavingReflection(true);
    try {
      await props.onSaveReflection(dayNum, {
        body: reflectionBody,
        favorite: favoriteReflection
      });
      setSavedReflection(true);
    } catch(e) {
      console.error('[lumina] Save reflection failed:', e);
      alert('Failed to save reflection. Please try again.');
    }
    setSavingReflection(false);
  };

  var handleComplete2 = async function() {
    if (cooldownMsg) { setShowCooldown(true); return; }
    if (props.onSaveCheckin) {
      try {
        await props.onSaveCheckin(dayNum, { state: checkinState, energy: energy, intention: intention, note: note });
      } catch(e) {
        console.error('[lumina] Save checkin on complete failed:', e);
      }
    }
    if (props.onSaveReflection && reflectionBody.trim()) {
      try {
        await props.onSaveReflection(dayNum, { body: reflectionBody, favorite: favoriteReflection });
      } catch(e) {
        console.error('[lumina] Save reflection on complete failed:', e);
      }
    }
    onComplete(dayNum);
  };

  var adaptive = getAdaptiveSupport(user, dayData, {
    state: checkinState,
    energy: energy,
    intention: intention
  }, props.reentryPlan);
  var resurfaced = props.resurfaced;
  var stateMeta = getCheckinStateMeta(checkinState);
  var fieldStyle = {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #e4dccf",
    padding: "12px 14px",
    fontFamily: B,
    fontSize: 14,
    color: "#3a3028",
    background: "#fff"
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px 20px 28px", animation: "fadeIn 0.4s ease" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, " + cat.bg + ", #fff)", borderRadius: 18, padding: "20px 18px", marginBottom: 16, border: "1px solid " + cat.color + "40", display: "flex", gap: 14, alignItems: "center", boxShadow: "0 2px 12px " + cat.color + "15" }}>
        <DayIllustration dayNum={dayNum} color={cat.color} size={68} />
        <div>
          <p style={{ fontFamily: B, fontSize: 11, fontWeight: 700, color: cat.color, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>{(user && user.lang === "ja") ? cat.labelJa : cat.label}</p>
          <h2 style={{ fontFamily: F, fontWeight: 400, fontSize: 26, color: "#3a3028", marginBottom: 2 }}>{tf(user, "dayLabel")(dayNum)}</h2>
          <p style={{ fontFamily: F, fontSize: 16, color: "#6b5e50", fontStyle: "italic" }}>{dayData.title}</p>
          {isCompleted && <p style={{ fontFamily: B, fontSize: 12, color: "#5a9a5e", fontWeight: 700, marginTop: 6 }}>{"\u2713 " + t(user, "completed")}</p>}
        </div>
      </div>

      <div style={{ background: "linear-gradient(135deg, " + adaptive.color + "16, #fff)", borderRadius: 16, padding: "16px 18px", marginBottom: 16, border: "1px solid " + adaptive.color + "28", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
        <p style={{ fontFamily: B, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: adaptive.color, textTransform: "uppercase", marginBottom: 6 }}>{adaptive.eyebrow}</p>
        <h3 style={{ fontFamily: F, fontSize: 22, fontWeight: 400, color: "#3a3028", marginBottom: 8 }}>{adaptive.title}</h3>
        <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.7, marginBottom: 8 }}>{adaptive.body}</p>
        <p style={{ fontFamily: B, fontSize: 12, color: "#7a6b5c", marginBottom: 4 }}>{adaptive.focus}</p>
        <p style={{ fontFamily: F, fontSize: 16, color: "#6b5e50" }}>{adaptive.prompt}</p>
      </div>

      {resurfaced && (
        <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.04)", border: "1px solid #eadfcf" }}>
          <p style={{ fontFamily: B, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#8a7e6e", textTransform: "uppercase", marginBottom: 6 }}>
            {l(user, "Resurfaced reflection", "浮かび上がった振り返り")}
          </p>
          <h3 style={{ fontFamily: F, fontSize: 20, fontWeight: 400, color: "#3a3028", marginBottom: 8 }}>
            {l(user, "Day " + resurfaced.day + ": " + resurfaced.title, "第" + resurfaced.day + "日: " + resurfaced.title)}
          </h3>
          <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.7 }}>{resurfaced.excerpt}</p>
        </div>
      )}

      {/* Audio player with mp3 support */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" aria-label={playing ? l(user, "Pause today's guidance audio", "今日のガイダンス音声を一時停止") : l(user, "Play today's guidance audio", "今日のガイダンス音声を再生")} onClick={playing ? handlePause : handlePlay} style={{ width: 48, height: 48, borderRadius: "50%", border: "none", cursor: "pointer", background: playing ? cat.color + "80" : cat.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 3px 12px " + cat.color + "50" }}>
            {playing ? <div aria-hidden="true" style={{ display: "flex", gap: 3 }}><div style={{ width: 3, height: 14, background: "#fff", borderRadius: 2 }} /><div style={{ width: 3, height: 14, background: "#fff", borderRadius: 2 }} /></div> : <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="6,3 20,12 6,21" /></svg>}
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: B, fontSize: 14, fontWeight: 700, color: "#3a3028" }}>{t(user, "todaysGuidance")}</p>
            <p style={{ fontFamily: B, fontSize: 11, color: "#a09488" }}>{playing ? t(user, "playing") : audioUrl ? t(user, "mp3Loaded") : t(user, "tapListen")}</p>
            <div style={{ display: "flex", gap: 2, marginTop: 6, alignItems: "end", height: 18 }}>
              {Array.from({ length: 30 }, function(_, w) { return <div key={w} style={{ width: 3, borderRadius: 2, height: Math.max(3, 4 + Math.sin(w * 0.7) * 8 + Math.cos(w * 1.1) * 4), background: playing ? cat.color : "#d8d0c4", opacity: 0.6 }} />; })}
            </div>
          </div>
        </div>
        {/* MP3 upload */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, cursor: "pointer", padding: "6px 0" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a09488" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span style={{ fontFamily: B, fontSize: 11, color: "#a09488" }}>{audioUrl ? t(user, "replaceMp3") : t(user, "uploadMp3")}</span>
          <input type="file" accept="audio/mp3,audio/mpeg,audio/*" onChange={handleUploadAudio} style={{ display: "none" }} />
        </label>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: "18px 18px", marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div>
            <h3 style={{ fontFamily: F, fontSize: 21, fontWeight: 400, color: "#3a3028" }}>{l(user, "Arrival check-in", "今の自分をチェック")}</h3>
            <p style={{ fontFamily: B, fontSize: 12, color: "#8a7e6e", lineHeight: 1.6 }}>{l(user, "Let today's guidance meet your actual state.", "今日のガイダンスを、いまの自分に合わせます。")}</p>
          </div>
          {savedCheckin && <span style={{ fontFamily: B, fontSize: 11, color: "#5a9a5e", fontWeight: 700 }}>{l(user, "Saved", "保存済み")}</span>}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {CHECKIN_STATES.map(function(option) {
            var active = option.id === checkinState;
            return (
              <button
                key={option.id}
                onClick={function() { setCheckinState(option.id); setSavedCheckin(false); }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: active ? "none" : "1px solid #e4dccf",
                  background: active ? option.color : "#fff",
                  color: active ? "#fff" : "#6b5e50",
                  fontFamily: B,
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                {l(user, option.en, option.ja)}
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: 12 }}>
          <p style={{ fontFamily: B, fontSize: 12, color: "#7a6b5c", marginBottom: 6 }}>{l(user, "Energy", "エネルギー")}: {energy}/5</p>
          <input type="range" min="1" max="5" value={energy} onChange={function(e) { setEnergy(Number(e.target.value)); setSavedCheckin(false); }} style={{ width: "100%", accentColor: stateMeta.color }} />
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <input value={intention} onChange={function(e) { setIntention(e.target.value); setSavedCheckin(false); }} placeholder={l(user, "Today's intention", "今日の意図")} style={fieldStyle} />
          <textarea value={note} onChange={function(e) { setNote(e.target.value); setSavedCheckin(false); }} placeholder={l(user, "What feels true right now?", "いま本当に感じていることは？")} rows={4} style={fieldStyle} />
        </div>

        <button onClick={handleSaveCheckin} disabled={savingCheckin} style={{ marginTop: 12, width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: "#4a3f33", color: "#fff", fontFamily: B, fontSize: 13, cursor: "pointer" }}>
          {savingCheckin ? "..." : l(user, "Save check-in", "チェックインを保存")}
        </button>
      </div>

      {/* Lesson text */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "20px 18px", marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
        <h3 style={{ fontFamily: F, fontWeight: 500, fontSize: 19, color: "#3a3028", marginBottom: 10 }}>{t(user, "todaysLesson")}</h3>
        <p style={{ fontFamily: B, fontWeight: 300, fontSize: 15, color: "#4a3f33", lineHeight: 1.8 }}>{dayData.instruction}</p>
      </div>

      {/* Watercolor / uploaded image */}
      <div style={{ marginBottom: 16, borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        <LessonImage dayNum={dayNum} cat={cat} />
        <p style={{ fontFamily: F, fontStyle: "italic", fontSize: 13, color: "#8a7e6e", textAlign: "center", padding: "8px 12px", background: "#fff" }}>{dayData.title}</p>
      </div>

      {/* Mantra */}
      <div style={{ background: cat.bg, borderRadius: 14, padding: "22px 18px", marginBottom: 18, border: "1px solid " + cat.color + "30", textAlign: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: cat.color + "25", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}><div style={{ width: 18, height: 18, borderRadius: "50%", background: cat.color }} /></div>
        <p style={{ fontFamily: B, fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "#8a7e6e", textTransform: "uppercase", marginBottom: 8 }}>{t(user, "todaysMantra")}</p>
        <p style={{ fontFamily: F, fontStyle: "italic", fontSize: 20, fontWeight: 400, color: "#3a3028", lineHeight: 1.5 }}>{'"' + dayData.mantra + '"'}</p>
        <p style={{ fontFamily: B, fontSize: 12, color: "#a09488", marginTop: 10 }}>{t(user, "breathe")}</p>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: "18px 18px", marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div>
            <h3 style={{ fontFamily: F, fontSize: 21, fontWeight: 400, color: "#3a3028" }}>{l(user, "Reflection", "リフレクション")}</h3>
            <p style={{ fontFamily: B, fontSize: 12, color: "#8a7e6e", lineHeight: 1.6 }}>{l(user, "Capture the line you want future-you to hear again.", "未来の自分にもう一度届けたい言葉を残しましょう。")}</p>
          </div>
          {savedReflection && <span style={{ fontFamily: B, fontSize: 11, color: "#5a9a5e", fontWeight: 700 }}>{l(user, "Saved", "保存済み")}</span>}
        </div>

        <textarea value={reflectionBody} onChange={function(e) { setReflectionBody(e.target.value); setSavedReflection(false); }} placeholder={l(user, "What shifted in you today?", "今日、自分の中で何が動きましたか？")} rows={7} style={fieldStyle} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={favoriteReflection} onChange={function(e) { setFavoriteReflection(e.target.checked); setSavedReflection(false); }} />
          <span style={{ fontFamily: B, fontSize: 13, color: "#6b5e50" }}>{l(user, "Save this to my insight library", "この気づきをインサイトライブラリに残す")}</span>
        </label>
        <button onClick={handleSaveReflection} disabled={savingReflection} style={{ marginTop: 12, width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: cat.color, color: "#fff", fontFamily: B, fontSize: 13, cursor: "pointer" }}>
          {savingReflection ? "..." : l(user, "Save reflection", "リフレクションを保存")}
        </button>
      </div>

      {/* Cooldown message */}
      {showCooldown && cooldownMsg && (
        <div style={{ background: "#fff8f0", border: "1px solid #e8d4b0", borderRadius: 14, padding: "16px 18px", marginBottom: 14, animation: "fadeIn 0.3s ease" }}>
          <p style={{ fontFamily: B, fontSize: 14, color: "#8a6e3e", lineHeight: 1.6 }}>{cooldownMsg}</p>
        </div>
      )}

      {/* Complete button */}
      {!isCompleted && (
        <button onClick={handleComplete2} style={{ width: "100%", padding: "15px 0", borderRadius: 14, border: "none", background: cooldownMsg ? "#b0a898" : "#4a3f33", color: "#fff", fontFamily: F, fontSize: 17, fontWeight: 500, letterSpacing: 2, cursor: "pointer" }}>{tf(user, "completeDay")(dayNum)}</button>
      )}
    </div>
  );
}

// ─── PROFILE ───
var PHASES = [
  { key: "Awakening", days: [1,15], color: "#9b7fd4", icon: "\u2727" },
  { key: "Deepening", days: [16,30], color: "#d4727e", icon: "\u2661" },
  { key: "Expanding", days: [31,45], color: "#6aaa6e", icon: "\u2726" },
  { key: "Transforming", days: [46,60], color: "#c9a84c", icon: "\u2736" },
  { key: "Integrating", days: [61,75], color: "#7c9ec4", icon: "\u25C7" },
  { key: "Radiating", days: [76,90], color: "#e0a050", icon: "\u2600" },
];

function ProfileView(props) {
  var user = props.user, n = Object.keys(props.progress).length;
  var phaseIdx = n < 15 ? 0 : n < 30 ? 1 : n < 45 ? 2 : n < 60 ? 3 : n < 75 ? 4 : 5;
  var phase = PHASES[phaseIdx];
  var onUpdateLang = props.onUpdateLang;
  var currentLang = user.lang || "en";
  var billing = props.billing || {};
  var entitlement = billing.entitlement || {};
  var metrics = props.metrics || {};
  var [accountBusy, setAccountBusy] = useState("");
  var [accountStatus, setAccountStatus] = useState("");
  var [accountError, setAccountError] = useState("");
  var [deletePassword, setDeletePassword] = useState("");
  var [deleteConfirm, setDeleteConfirm] = useState("");
  var favoriteDays = getSortedDayNumbers(props.reflections || {}).filter(function(dayNum) {
    return props.reflections[dayNum] && props.reflections[dayNum].favorite;
  }).slice(-4).reverse();
  var latestReflectionDays = favoriteDays.length ? favoriteDays : getSortedDayNumbers(props.reflections || {}).filter(function(dayNum) {
    return props.reflections[dayNum] && props.reflections[dayNum].body;
  }).slice(-4).reverse();
  // Phase name + desc + quote translated
  var phNames = ["phAwakening","phDeepening","phExpanding","phTransforming","phIntegrating","phRadiating"];
  var phDescs = ["phDescAwakening","phDescDeepening","phDescExpanding","phDescTransforming","phDescIntegrating","phDescRadiating"];
  var phQuotes = ["phQuoteAwakening","phQuoteDeepening","phQuoteExpanding","phQuoteTransforming","phQuoteIntegrating","phQuoteRadiating"];
  var phaseName = t(user, phNames[phaseIdx]);
  var phaseDesc = t(user, phDescs[phaseIdx]);
  var phaseQuote = t(user, phQuotes[phaseIdx]);
  var cancelScheduled = !!(entitlement.cancelAt || entitlement.canceledAt);
  var statusLabel = entitlement.hasAccess
    ? l(user, "Active " + (entitlement.planCode === "annual" ? "annual" : "monthly") + " membership", (entitlement.planCode === "annual" ? "年額" : "月額") + "メンバーシップ利用中")
    : l(user, "Membership inactive", "メンバーシップ停止中");

  var handleExportClick = async function() {
    setAccountBusy("export");
    setAccountError("");
    setAccountStatus("");
    try {
      await props.onExportData();
      setAccountStatus(l(user, "Your Lumina export has been downloaded.", "Luminaデータを書き出しました。"));
    } catch (e) {
      setAccountError(e && e.message ? e.message : l(user, "Unable to export your Lumina data right now.", "現在Luminaデータを書き出せません。"));
    } finally {
      setAccountBusy("");
    }
  };

  var handleDeleteClick = async function() {
    setAccountBusy("delete");
    setAccountError("");
    setAccountStatus("");
    try {
      await props.onDeleteAccount(deletePassword, deleteConfirm);
    } catch (e) {
      setAccountError(e && e.message ? e.message : l(user, "Unable to delete this account right now.", "現在このアカウントを削除できません。"));
      setAccountBusy("");
      return;
    }
    setAccountBusy("");
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 20px", animation: "fadeIn 0.4s ease" }}>
      {/* Avatar and name */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ width: 68, height: 68, borderRadius: "50%", background: phase.color, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 28, color: "#fff", fontFamily: F, boxShadow: "0 4px 16px " + phase.color + "40" }}>{user.name ? user.name[0].toUpperCase() : "?"}</div>
        <h2 style={{ fontFamily: F, fontWeight: 400, fontSize: 22, color: "#3a3028" }}>{user.name}</h2>
        <p style={{ fontFamily: B, fontSize: 12, color: "#a09488" }}>{user.email}</p>
      </div>

      {/* Phase card with inspiration */}
      <div style={{ background: "linear-gradient(135deg, " + phase.color + "15, " + phase.color + "08)", borderRadius: 18, padding: "20px 18px", marginBottom: 16, border: "1px solid " + phase.color + "30", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>{phase.icon}</div>
        <p style={{ fontFamily: B, fontSize: 10, fontWeight: 700, letterSpacing: 2, color: phase.color, textTransform: "uppercase", marginBottom: 4 }}>{t(user, "phase") + " " + (phaseIdx + 1) + " / 6"}</p>
        <h3 style={{ fontFamily: F, fontSize: 24, fontWeight: 400, color: "#3a3028", marginBottom: 8 }}>{phaseName}</h3>
        <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.6, marginBottom: 12 }}>{phaseDesc}</p>
        <p style={{ fontFamily: F, fontStyle: "italic", fontSize: 14, color: "#8a7e6e", lineHeight: 1.5 }}>{'"' + phaseQuote + '"'}</p>
      </div>

      {/* Phase stepping stones */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 14px", marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          {PHASES.map(function(ph, pi) {
            var isActive = pi === phaseIdx;
            var isPast = pi < phaseIdx;
            return (
              <div key={pi} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                <div style={{
                  width: isActive ? 32 : 24, height: isActive ? 32 : 24,
                  borderRadius: "50%",
                  background: isPast ? ph.color : isActive ? ph.color : "#e8e2d8",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: isActive ? 16 : 11,
                  color: (isPast || isActive) ? "#fff" : "#b0a898",
                  boxShadow: isActive ? ("0 2px 10px " + ph.color + "50") : "none",
                  transition: "all 0.3s",
                }}>
                  {isPast ? "\u2713" : ph.icon}
                </div>
                <div style={{ fontFamily: B, fontSize: 8, color: isActive ? ph.color : "#b0a898", fontWeight: isActive ? 700 : 400, marginTop: 4, letterSpacing: 0.3 }}>{t(user, phNames[pi])}</div>
              </div>
            );
          })}
        </div>
        {/* Journey progress bar */}
        <div style={{ height: 6, borderRadius: 3, background: "#f0ebe4", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #9b7fd4, #d4727e, #6aaa6e, #c9a84c, #7c9ec4, #e0a050)", width: (n / 90 * 100) + "%", transition: "width 0.5s" }} />
        </div>
        <p style={{ fontFamily: B, fontSize: 11, color: "#a09488", marginTop: 6, textAlign: "center" }}>{tf(user, "ofDays")(n)}</p>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
        <p style={{ fontFamily: B, fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "#8a7e6e", textTransform: "uppercase", marginBottom: 8 }}>{l(user, "Membership", "メンバーシップ")}</p>
        <h3 style={{ fontFamily: F, fontSize: 22, fontWeight: 400, color: "#3a3028", marginBottom: 6 }}>{statusLabel}</h3>
        <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.6, marginBottom: 12 }}>
          {entitlement.currentPeriodEnd
            ? l(user, "Current period ends " + new Date(entitlement.currentPeriodEnd).toLocaleDateString(), "現在の利用期間終了日: " + new Date(entitlement.currentPeriodEnd).toLocaleDateString())
            : l(user, "Billing is handled securely on namibarden.com.", "請求は namibarden.com で安全に管理されます。")}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={props.onOpenPortal} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid #ddd3c6", background: "#fff", color: "#6b5e50", fontFamily: B, fontSize: 13, cursor: "pointer" }}>
            {l(user, "Manage billing", "請求を管理")}
          </button>
          <button onClick={function() { props.onStartCheckout(entitlement.planCode === "annual" ? "lumina-annual" : "lumina-monthly"); }} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "none", background: "#4a3f33", color: "#fff", fontFamily: B, fontSize: 13, cursor: "pointer" }}>
            {entitlement.hasAccess ? l(user, "Open checkout", "決済ページを開く") : l(user, "Activate access", "アクセスを有効化")}
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
        <p style={{ fontFamily: B, fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "#8a7e6e", textTransform: "uppercase", marginBottom: 8 }}>{l(user, "Data and privacy", "データとプライバシー")}</p>
        <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.7, marginBottom: 10 }}>
          {l(
            user,
            "Download your Lumina data anytime. Exports include your profile, progress, check-ins, reflections, saved audio, and Lumina usage history.",
            "プロフィール、進捗、チェックイン、リフレクション、保存した音声、Luminaの利用履歴を書き出せます。"
          )}
        </p>
        <p style={{ fontFamily: B, fontSize: 12, color: "#8a7e6e", lineHeight: 1.7, marginBottom: 12 }}>
          {l(
            user,
            "Billing and invoice records may still remain in NamiBarden and Stripe where required for accounting or legal compliance.",
            "請求書や決済履歴は、会計や法令対応のために NamiBarden と Stripe 側に残る場合があります。"
          )}
        </p>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={handleExportClick} disabled={!!accountBusy} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid #ddd3c6", background: "#fff", color: "#6b5e50", fontFamily: B, fontSize: 13, cursor: accountBusy ? "wait" : "pointer" }}>
            {accountBusy === "export" ? l(user, "Preparing export...", "書き出し中...") : l(user, "Export my data", "データを書き出す")}
          </button>
          <a href="mailto:contact@namibarden.com" style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid #eadfcf", background: "#f8f3eb", color: "#6b5e50", fontFamily: B, fontSize: 13, textAlign: "center", textDecoration: "none" }}>
            {l(user, "Email support", "サポートに連絡")}
          </a>
        </div>

        <div style={{ borderRadius: 12, background: "#f8f3eb", padding: "14px 14px 12px", border: "1px solid #eadfcf" }}>
          <p style={{ fontFamily: B, fontSize: 13, fontWeight: 700, color: "#5a4e40", marginBottom: 6 }}>{l(user, "Delete account", "アカウント削除")}</p>
          <p style={{ fontFamily: B, fontSize: 12, color: "#8a7e6e", lineHeight: 1.7, marginBottom: 10 }}>
            {cancelScheduled
              ? l(user, "Your cancellation is already scheduled. Deleting now removes Lumina app data immediately.", "すでに解約予定が入っています。今削除すると Lumina のアプリデータはすぐに消去されます。")
              : l(user, "Cancel any active Lumina membership in Manage billing before deleting this account. This removes your Lumina journal, check-ins, reflections, saved audio, and app session.", "アカウント削除前に、請求管理から有効な Lumina メンバーシップを解約してください。削除すると Lumina の記録、チェックイン、リフレクション、保存した音声、アプリのセッションが消去されます。")}
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              type="password"
              value={deletePassword}
              onChange={function(e) { setDeletePassword(e.target.value); }}
              placeholder={l(user, "Confirm your password", "パスワードを確認")}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #ddd3c6", background: "#fff", color: "#3a3028", fontFamily: B, fontSize: 13 }}
            />
            <input
              type="text"
              value={deleteConfirm}
              onChange={function(e) { setDeleteConfirm(e.target.value.toUpperCase()); }}
              placeholder={l(user, 'Type DELETE to confirm', '確認のため DELETE と入力')}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #ddd3c6", background: "#fff", color: "#3a3028", fontFamily: B, fontSize: 13, letterSpacing: deleteConfirm ? 1 : 0 }}
            />
            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={!!accountBusy || !deletePassword.trim() || deleteConfirm !== "DELETE"}
              style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: "#8c3f3f", color: "#fff", fontFamily: B, fontSize: 13, cursor: (!!accountBusy || !deletePassword.trim() || deleteConfirm !== "DELETE") ? "not-allowed" : "pointer", opacity: (!!accountBusy || !deletePassword.trim() || deleteConfirm !== "DELETE") ? 0.6 : 1 }}
            >
              {accountBusy === "delete" ? l(user, "Deleting account...", "削除中...") : l(user, "Delete my Lumina account", "Luminaアカウントを削除")}
            </button>
          </div>
        </div>

        {(accountStatus || accountError) && (
          <p style={{ fontFamily: B, fontSize: 12, color: accountError ? "#a63f3f" : "#4d8751", lineHeight: 1.6, marginTop: 12 }}>
            {accountError || accountStatus}
          </p>
        )}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
        <p style={{ fontFamily: B, fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "#8a7e6e", textTransform: "uppercase", marginBottom: 10 }}>{l(user, "Compassionate metrics", "やさしい指標")}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {[
            { label: l(user, "Days witnessed", "見届けた日数"), value: metrics.completedCount || 0 },
            { label: l(user, "Check-ins saved", "保存したチェックイン"), value: metrics.checkinCount || 0 },
            { label: l(user, "Returns after pauses", "休止後に戻った回数"), value: metrics.returnCount || 0 },
            { label: l(user, "Favorite insights", "お気に入りの気づき"), value: metrics.favoriteCount || 0 }
          ].map(function(item) {
            return (
              <div key={item.label} style={{ borderRadius: 12, background: "#f8f3eb", padding: "14px 12px" }}>
                <p style={{ fontFamily: F, fontSize: 24, color: "#3a3028" }}>{item.value}</p>
                <p style={{ fontFamily: B, fontSize: 11, color: "#8a7e6e", lineHeight: 1.5 }}>{item.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {props.weeklySynthesis && (
        <div style={{ background: "linear-gradient(135deg, " + props.weeklySynthesis.color + "14, #fff)", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.03)", border: "1px solid " + props.weeklySynthesis.color + "25" }}>
          <p style={{ fontFamily: B, fontSize: 12, fontWeight: 700, letterSpacing: 2, color: props.weeklySynthesis.color, textTransform: "uppercase", marginBottom: 8 }}>{props.weeklySynthesis.title}</p>
          <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.7, marginBottom: 8 }}>{props.weeklySynthesis.summary}</p>
          <p style={{ fontFamily: F, fontSize: 18, color: "#3a3028", marginBottom: 8 }}>{props.weeklySynthesis.focus}</p>
          {props.weeklySynthesis.keywords && props.weeklySynthesis.keywords.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {props.weeklySynthesis.keywords.map(function(keyword) {
                return <span key={keyword} style={{ padding: "5px 10px", borderRadius: 999, background: "#fff", border: "1px solid #eadfcf", fontFamily: B, fontSize: 11, color: "#7a6b5c" }}>{keyword}</span>;
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
        <p style={{ fontFamily: B, fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "#8a7e6e", textTransform: "uppercase", marginBottom: 10 }}>{l(user, "Insight library", "インサイトライブラリ")}</p>
        {latestReflectionDays.length === 0 ? (
          <p style={{ fontFamily: B, fontSize: 13, color: "#8a7e6e", lineHeight: 1.7 }}>{l(user, "Save a reflection as a favorite and it will live here.", "リフレクションをお気に入りにすると、ここに残ります。")}</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {latestReflectionDays.map(function(dayNum) {
              var item = props.reflections[dayNum];
              return (
                <div key={dayNum} style={{ padding: "12px 14px", borderRadius: 12, background: "#f8f3eb" }}>
                  <p style={{ fontFamily: B, fontSize: 11, fontWeight: 700, color: "#8a7e6e", marginBottom: 4 }}>
                    {l(user, "Day " + dayNum, "第" + dayNum + "日")}
                    {item.favorite ? " • " + l(user, "favorite", "お気に入り") : ""}
                  </p>
                  <p style={{ fontFamily: F, fontSize: 18, color: "#3a3028", marginBottom: 6 }}>{getDayData(dayNum, user).title}</p>
                  <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.7 }}>
                    {item.body.length > 180 ? item.body.slice(0, 180).trim() + "..." : item.body}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Language toggle */}
      <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
        <p style={{ fontFamily: B, fontSize: 12, fontWeight: 600, color: "#5a4e40", marginBottom: 10 }}>{t(user, "language")}</p>
        <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid #e0d8ce" }}>
          {[["en", "English"], ["ja", "\u65E5\u672C\u8A9E"]].map(function(pair) {
            var code = pair[0], lbl = pair[1];
            return <button key={code} onClick={function() { onUpdateLang(code); }} style={{ flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontFamily: B, fontSize: 14, fontWeight: 600, background: currentLang === code ? "#4a3f33" : "#fff", color: currentLang === code ? "#fff" : "#8a7e6e", transition: "all 0.2s" }}>{lbl}</button>;
          })}
        </div>
      </div>
      <button onClick={props.onLogout} style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "2px solid #e0d8ce", background: "transparent", fontFamily: B, fontSize: 13, color: "#8a7e6e", cursor: "pointer", fontWeight: 600 }}>{t(user, "signOut")}</button>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main aria-label="Loading Lumina" style={{ minHeight: "100dvh", background: "#f5f0e8", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{CSS}</style>
      <div style={{ width: "100%", maxWidth: 380, background: "rgba(255,255,255,0.92)", borderRadius: 22, padding: "30px 24px", boxShadow: "0 12px 32px rgba(58,48,40,0.08)", textAlign: "center" }}>
        <Logo size={68} />
        <h1 style={{ fontFamily: F, fontWeight: 300, fontSize: 32, color: "#4a3f33", letterSpacing: 8, margin: "12px 0 6px" }}>LUMINA</h1>
        <p style={{ fontFamily: B, fontSize: 12, color: MUTED, letterSpacing: 2, marginBottom: 10 }}>{TXT.en.subtitle}</p>
        <p style={{ fontFamily: B, fontSize: 13, color: "#5a4e40", lineHeight: 1.7 }}>Preparing your journal and membership status.</p>
      </div>
    </main>
  );
}

// ─── MAIN ───
function LuminaApp() {
  var [user, setUser] = useState(null);
  var [progress, setProgress] = useState({});
  var [checkins, setCheckins] = useState({});
  var [reflections, setReflections] = useState({});
  var [billing, setBilling] = useState(null);
  var [view, setView] = useState("journey");
  var [selDay, setSelDay] = useState(null);
  var [milestone, setMilestone] = useState(null);
  var [loading, setLoading] = useState(true);
  var [activatingAccess, setActivatingAccess] = useState(false);
  var analyticsSeenRef = useRef({});
  // Test mode only activates via ?test in URL - invisible to regular users
  var testMode = typeof window !== "undefined" && window.location.search.indexOf("test") >= 0;
  var billingSuccess = typeof window !== "undefined" && window.location.search.indexOf("billing=success") >= 0;

  var loadDashboard = async function(forceBilling, explicitUser) {
    var sessionUser = explicitUser;
    if (!sessionUser) sessionUser = await api.getSession();
    if (!sessionUser) {
      setUser(null);
      setProgress({});
      setCheckins({});
      setReflections({});
      setBilling(null);
      return { user: null, billing: null };
    }

    setUser(sessionUser);
    var results = await Promise.allSettled([
      api.getProgress(),
      api.getCheckins(),
      api.getReflections(),
      api.getBillingStatus(!!forceBilling)
    ]);
    var billingData = results[3].status === "fulfilled" ? (results[3].value || null) : null;
    setProgress(results[0].status === "fulfilled" ? (results[0].value || {}) : {});
    setCheckins(results[1].status === "fulfilled" ? (results[1].value || {}) : {});
    setReflections(results[2].status === "fulfilled" ? (results[2].value || {}) : {});
    setBilling(billingData);

    var hasProgramAccess = testMode || hasLuminaAccess(billingData);
    if (hasProgramAccess) {
      try {
        await loadProgramContent();
      } catch (e) {
        console.error("Program content preload failed:", e);
      }
    }

    if (typeof window !== "undefined" && forceBilling && hasLuminaAccess(billingData)) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    return { user: sessionUser, billing: billingData };
  };

  var refreshBillingUntilActive = async function(explicitUser) {
    var sessionUser = explicitUser || user;
    if (!sessionUser) return { user: null, billing: null };
    setActivatingAccess(true);
    try {
      for (var attempt = 0; attempt < 6; attempt++) {
        if (attempt > 0) await wait(attempt < 3 ? 1500 : 2500);
        var dashboard = await loadDashboard(true, sessionUser);
        sessionUser = dashboard && dashboard.user ? dashboard.user : sessionUser;
        if (testMode || hasLuminaAccess(dashboard && dashboard.billing)) return dashboard;
      }
      return { user: sessionUser, billing: null };
    } finally {
      setActivatingAccess(false);
    }
  };

  useEffect(function() {
    var init = async function() {
      var dashboard = null;
      try {
        dashboard = await loadDashboard(billingSuccess);
        if (billingSuccess) {
          trackEvent("billing_checkout_returned", {
            sessionId: typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("session_id") || null) : null,
            hasAccess: !!(dashboard && hasLuminaAccess(dashboard.billing))
          }, { email: dashboard && dashboard.user ? dashboard.user.email : null });
          if (dashboard && dashboard.user && !testMode && !hasLuminaAccess(dashboard.billing)) {
            dashboard = await refreshBillingUntilActive(dashboard.user);
          }
        }
      } catch(e) {
        console.error('[lumina] Dashboard load failed:', e);
      }
      setLoading(false);
    };
    init();
  }, []);

  var metrics = getJourneyMetrics(progress, checkins, reflections);
  var weeklySynthesis = user ? getWeeklySynthesis(user, progress, checkins, reflections) : null;

  useEffect(function() {
    if (!user || !user.email || !hasLuminaAccess(billing)) return;
    var entitlement = billing && billing.entitlement ? billing.entitlement : {};
    var key = "billing_access_granted:" + user.email + ":" + (entitlement.planCode || "unknown") + ":" + (entitlement.accessState || "active");
    if (analyticsSeenRef.current[key]) return;
    analyticsSeenRef.current[key] = true;
    trackEvent("billing_access_granted", {
      planCode: entitlement.planCode || null,
      accessState: entitlement.accessState || null,
      status: entitlement.status || null
    }, { email: user.email });
  }, [user && user.email, billing && billing.entitlement && billing.entitlement.hasAccess, billing && billing.entitlement && billing.entitlement.planCode, billing && billing.entitlement && billing.entitlement.accessState, billing && billing.entitlement && billing.entitlement.status]);

  useEffect(function() {
    if (!user || !user.email || !weeklySynthesis) return;
    var key = "weekly_synthesis_viewed:" + user.email + ":" + weeklySynthesis.weekIndex;
    if (analyticsSeenRef.current[key]) return;
    analyticsSeenRef.current[key] = true;
    trackEvent("weekly_synthesis_viewed", {
      weekIndex: weeklySynthesis.weekIndex,
      witnessed: weeklySynthesis.witnessed,
      keywords: weeklySynthesis.keywords || []
    }, { email: user.email });
  }, [user && user.email, weeklySynthesis && weeklySynthesis.weekIndex]);

  useEffect(function() {
    if (!user) return;
    var count = getCompletedCount(progress);
    var data = getMilestoneData(count, user);
    if (!data || typeof localStorage === "undefined") return;
    var key = "lumina_milestone_seen_" + user.email + "_" + count;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    setMilestone({ count: count, title: data.title, body: data.body });
  }, [user && user.email, getCompletedCount(progress)]);

  var handleLogin = async function(ud) {
    setLoading(true);
    try { await loadDashboard(billingSuccess, ud); } catch(e) {}
    setLoading(false);
  };
  var handleLogout = async function() {
    await api.logout();
    setUser(null);
    setProgress({});
    setCheckins({});
    setReflections({});
    setBilling(null);
    setView("journey");
    setSelDay(null);
  };
  var handleComplete = async function(dayNum) {
    var np = Object.assign({}, progress);
    np[dayNum] = { completedAt: new Date().toISOString() };
    setProgress(np);
    try { await api.completeDay(dayNum); } catch(e) {}
    trackEvent("day_completed", {
      dayNum: dayNum,
      completedCount: getCompletedCount(np)
    }, { email: user && user.email });
    setView("journey"); setSelDay(null);
  };
  var handleSaveCheckin = async function(dayNum, payload) {
    var next = Object.assign({}, checkins);
    next[dayNum] = {
      state: payload.state,
      energy: payload.energy,
      intention: payload.intention,
      note: payload.note,
      updatedAt: new Date().toISOString()
    };
    setCheckins(next);
    await api.saveCheckin(dayNum, payload);
    trackEvent("checkin_saved", {
      dayNum: dayNum,
      state: payload.state || null,
      energy: payload.energy || null,
      intention: payload.intention || null,
      noteLength: payload.note ? String(payload.note).trim().length : 0
    }, { email: user && user.email });
  };
  var handleSaveReflection = async function(dayNum, payload) {
    var next = Object.assign({}, reflections);
    next[dayNum] = {
      body: payload.body,
      favorite: !!payload.favorite,
      updatedAt: new Date().toISOString()
    };
    setReflections(next);
    await api.saveReflection(dayNum, payload);
    trackEvent("reflection_saved", {
      dayNum: dayNum,
      favorite: !!payload.favorite,
      bodyLength: payload.body ? String(payload.body).trim().length : 0
    }, { email: user && user.email });
  };
  var handleUpdateLang = async function(newLang) {
    var updated = Object.assign({}, user, { lang: newLang });
    setUser(updated);
    try { await api.updateLang(newLang); } catch(e) {}
  };
  var handleRefreshBilling = async function() {
    trackEvent("billing_refresh_requested", {
      justActivated: !!billingSuccess,
      accessState: billing && billing.entitlement ? billing.entitlement.accessState || null : null,
      status: billing && billing.entitlement ? billing.entitlement.status || null : null
    }, { email: user && user.email });
    try {
      if (user && !testMode && (!billing || !billing.entitlement || !billing.entitlement.hasAccess)) {
        await refreshBillingUntilActive(user);
      } else {
        await loadDashboard(true, user);
      }
    } catch(e) {}
  };
  var handleOpenBillingPortal = async function() {
    trackEvent("billing_portal_opened", {
      accessState: billing && billing.entitlement ? billing.entitlement.accessState || null : null,
      status: billing && billing.entitlement ? billing.entitlement.status || null : null
    }, { email: user && user.email });
    try {
      var session = await api.createBillingPortal(window.location.origin + "/");
      if (!session || !session.url) {
        throw new Error(l(user, "Billing portal is unavailable right now. Please try again.", "現在請求ポータルを開けません。しばらくしてからもう一度お試しください。"));
      }
      window.location.href = session.url;
    } catch(e) {
      console.error('[lumina] Billing portal open failed:', e);
      alert((e && e.message) || l(user, "Billing portal is unavailable right now. Please try again.", "現在請求ポータルを開けません。しばらくしてからもう一度お試しください。"));
    }
  };
  var handleExportAccount = async function() {
    try {
      var result = await api.exportAccountData();
      var url = window.URL.createObjectURL(result.blob);
      var anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename || "lumina-export.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(function() { window.URL.revokeObjectURL(url); }, 1000);
    } catch(e) {
      console.error('[lumina] Export account failed:', e);
      alert('Failed to export account data. Please try again.');
    }
  };
  var handleDeleteAccount = async function(password, confirmText) {
    try {
      await api.deleteAccount(password, confirmText);
    } catch(e) {
      console.error('[lumina] Delete account failed:', e);
      alert('Failed to delete account. Please try again.');
      return;
    }
    try {
      await api.logout();
    } catch(e) {
      console.error('[lumina] Logout after delete failed:', e);
    }
    setUser(null);
    setProgress({});
    setCheckins({});
    setReflections({});
    setBilling(null);
    setView("journey");
    setSelDay(null);
  };
  var handleStartCheckout = function(planCode) {
    trackEvent("billing_checkout_started", {
      planCode: planCode,
      accessState: billing && billing.entitlement ? billing.entitlement.accessState || null : null,
      status: billing && billing.entitlement ? billing.entitlement.status || null : null
    }, { email: user && user.email });
    window.location.href = buildLuminaCheckoutUrl(user, planCode);
  };

  if (loading) return <LoadingScreen />;
  if (!user) return <AuthScreen onLogin={handleLogin} />;
  if (!testMode && (!billing || !billing.entitlement || !billing.entitlement.hasAccess)) {
    return <BillingScreen user={user} billing={billing} justActivated={billingSuccess} activatingAccess={activatingAccess} onCheckout={handleStartCheckout} onRefresh={handleRefreshBilling} onOpenPortal={handleOpenBillingPortal} />;
  }
  // maxDay considers both startDate AND highest completed day (for test mode progress)
  var dayFromStart = Math.min(getDaysSinceStart(user.startDate), 90);
  var highestCompleted = 0;
  Object.keys(progress).forEach(function(k) { var n = Number(k); if (n > highestCompleted) highestCompleted = n; });
  var maxDay = testMode ? 90 : Math.max(dayFromStart, Math.min(highestCompleted + 1, 90));
  var activeDay = maxDay;
  var foundUncompleted = false;
  for (var ad = 1; ad <= maxDay; ad++) {
    if (!progress[ad]) { activeDay = ad; foundUncompleted = true; break; }
  }
  // If all days completed, activeDay = maxDay (the last completed day)
  var handleSelectDay = function(d) { setSelDay(d); setView("lesson"); };
  var lessonDay = selDay || activeDay;
  var lessonData = getDayData(lessonDay, user);
  var lang = user ? user.lang : "en";
  var metrics = getJourneyMetrics(progress, checkins, reflections);
  var weeklySynthesis = getWeeklySynthesis(user, progress, checkins, reflections);
  var reentryPlan = getReentryPlan(user, progress, lessonData);
  var resurfaced = pickResurfacedReflection(lessonDay, reflections, user);
  // When switching to lesson tab via bottom nav, always go to current active day
  var handleTabClick = function(id) {
    if (id === "lesson") {
      // During cooldown, show last completed day; otherwise show current active
      var lt = getLastCompletionTime(progress);
      if (!testMode && lt && !progress[activeDay]) {
        var rem = COOLDOWN_MS - (Date.now() - lt);
        if (rem > 0) {
          // Find last completed day number
          var lastD = activeDay;
          Object.keys(progress).forEach(function(k) {
            var num = Number(k);
            if (num > lastD || lastD === activeDay) lastD = num;
          });
          setSelDay(lastD);
        } else {
          setSelDay(activeDay);
        }
      } else {
        setSelDay(activeDay);
      }
    }
    if (id === "journey") { setSelDay(null); }
    setView(id);
  };
  var cooldownMsg = null;
  if (!testMode && !progress[lessonDay]) {
    var lastTime = getLastCompletionTime(progress);
    if (lastTime) {
      var remaining = COOLDOWN_MS - (Date.now() - lastTime);
      if (remaining > 0) {
        var lastDayNum = null;
        Object.keys(progress).forEach(function(k) { if (progress[k].completedAt && new Date(progress[k].completedAt).getTime() === lastTime) lastDayNum = k; });
        var lastDD = lastDayNum ? getDayData(Number(lastDayNum), user) : null;
        var timeStr = ((remaining >= 3600000) ? tf(user, "hoursMin")(Math.floor(remaining / 3600000), Math.ceil((remaining % 3600000) / 60000)) : tf(user, "minutes")(Math.ceil(remaining / 60000)));
        cooldownMsg = tf(user, "cooldown")(lastDayNum || "?", lastDD ? lastDD.title : "", timeStr);
      }
    }
  }
  var content;
  if (view === "journey") {
    content = <JourneyMap user={user} progress={progress} maxUnlockedDay={maxDay} onSelectDay={handleSelectDay} weeklySynthesis={weeklySynthesis} reentryPlan={reentryPlan} />;
  } else if (view === "lesson") {
    content = <LessonView
      user={user}
      dayData={lessonData}
      dayNum={lessonDay}
      isCompleted={!!progress[lessonDay]}
      onComplete={handleComplete}
      cooldownMsg={cooldownMsg}
      checkin={checkins[lessonDay]}
      reflection={reflections[lessonDay]}
      resurfaced={resurfaced}
      reentryPlan={reentryPlan}
      onSaveCheckin={handleSaveCheckin}
      onSaveReflection={handleSaveReflection}
    />;
  } else {
    content = <ProfileView
      user={user}
      progress={progress}
      reflections={reflections}
      billing={billing}
      metrics={metrics}
      weeklySynthesis={weeklySynthesis}
      onLogout={handleLogout}
      onUpdateLang={handleUpdateLang}
      onOpenPortal={handleOpenBillingPortal}
      onStartCheckout={handleStartCheckout}
      onExportData={handleExportAccount}
      onDeleteAccount={handleDeleteAccount}
    />;
  }
  return (
    <div style={{ height: "100dvh", maxWidth: 430, margin: "0 auto", background: "#f5f0e8", display: "flex", flexDirection: "column", fontFamily: B, overflow: "hidden" }}>
      <style>{CSS}</style>
      <header style={{ padding: "12px 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderBottom: "1px solid #e8e2d8", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Logo size={30} /><span style={{ fontFamily: F, fontWeight: 400, fontSize: 17, color: "#3a3028", letterSpacing: 4 }}>LUMINA</span></div>
        <div style={{ fontFamily: B, fontSize: 11, fontWeight: 600, color: MUTED, background: "#f5f0e8", padding: "4px 12px", borderRadius: 16 }}>{tf(user, "dayOf")(activeDay, 90)}</div>
      </header>
      <main aria-label={l(user, "Lumina journal", "Lumina ジャーナル")} style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {content}
      </main>
      <nav aria-label={l(user, "Primary navigation", "主要ナビゲーション")} style={{ display: "flex", background: "#fff", borderTop: "1px solid #e8e2d8", padding: "4px 0 8px", flexShrink: 0 }}>
        {["journey","lesson","profile"].map(function(id) {
          var labels = { journey: t(user, "journey"), lesson: t(user, "lesson"), profile: t(user, "profile") };
          var isActive = view === id;
          return <button type="button" aria-current={isActive ? "page" : undefined} key={id} onClick={function() { handleTabClick(id); }} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "8px 0 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: isActive ? "#4a3f33" : "transparent" }} /><span style={{ fontFamily: B, fontSize: 11, fontWeight: isActive ? 700 : 400, color: isActive ? "#3a3028" : SOFT }}>{labels[id]}</span></button>;
        })}
      </nav>
      {testMode && (
        <div style={{ background: "#c9a84c", padding: "4px 0", textAlign: "center", flexShrink: 0 }}>
          <span style={{ fontFamily: B, fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: 1 }}>TEST MODE \u2014 ALL DAYS UNLOCKED \u2014 NO COOLDOWN</span>
        </div>
      )}
      {milestone && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(58,48,40,0.34)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 50 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="lumina-milestone-title" style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 22, padding: "26px 24px", textAlign: "center", boxShadow: "0 10px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, #e8d6b8, #f8f3eb)", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>✦</div>
            <p style={{ fontFamily: B, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: "uppercase", marginBottom: 8 }}>{l(user, "Milestone", "節目")}</p>
            <h3 id="lumina-milestone-title" style={{ fontFamily: F, fontSize: 28, fontWeight: 400, color: "#3a3028", marginBottom: 10 }}>{milestone.title}</h3>
            <p style={{ fontFamily: B, fontSize: 14, color: "#5a4e40", lineHeight: 1.7, marginBottom: 18 }}>{milestone.body}</p>
            <button type="button" onClick={function() { setMilestone(null); }} style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "none", background: "#4a3f33", color: "#fff", fontFamily: B, fontSize: 13, cursor: "pointer" }}>{l(user, "Continue", "続ける")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MOUNT ───
var root = createRoot(document.getElementById("root"));
root.render(React.createElement(ErrorBoundary, null, React.createElement(LuminaApp)));
