import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// ═══════════════════════════════════════════════════════
// LUMINA: 90-DAY HOLISTIC GROWTH JOURNAL
// Web App version — PostgreSQL backend
// ═══════════════════════════════════════════════════════

// ─── API HELPER ───
var API_BASE = "/api";
var api = {
  token: (typeof localStorage !== "undefined") ? localStorage.getItem("lumina_token") : null,
  async req(method, path, body) {
    var opts = { method: method, headers: {} };
    if (this.token) opts.headers["Authorization"] = "Bearer " + this.token;
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    var res = await fetch(API_BASE + path, opts);
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  },
  async signup(email, name, password, lang) {
    var data = await this.req("POST", "/auth/signup", { email: email, name: name, password: password, lang: lang });
    this.token = data.token;
    localStorage.setItem("lumina_token", data.token);
    return data.user;
  },
  async login(email, password) {
    var data = await this.req("POST", "/auth/login", { email: email, password: password });
    this.token = data.token;
    localStorage.setItem("lumina_token", data.token);
    return data.user;
  },
  logout: function() {
    this.token = null;
    localStorage.removeItem("lumina_token");
  },
  async getSession() {
    if (!this.token) return null;
    try { return await this.req("GET", "/auth/session"); } catch(e) { this.logout(); return null; }
  },
  async updateLang(lang) { return this.req("PUT", "/user/lang", { lang: lang }); },
  async getProgress() { return this.req("GET", "/progress"); },
  async completeDay(dayNum) { return this.req("POST", "/progress/" + dayNum); },
  async getAudio(dayNum) {
    try { var d = await this.req("GET", "/audio/" + dayNum); return d.data; } catch(e) { return null; }
  },
  async saveAudio(dayNum, data) { return this.req("POST", "/audio/" + dayNum, { data: data }); },
  async getImage(dayNum) {
    try { var d = await this.req("GET", "/image/" + dayNum); return d.data; } catch(e) { return null; }
  },
};

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

// ─── FULL 90-DAY PROGRAM ───
// Phase 1 (Days 1-15): AWAKENING — Foundation practices
// Phase 2 (Days 16-30): DEEPENING — Emotional & shadow work
// Phase 3 (Days 31-45): EXPANDING — Compassion & connection
// Phase 4 (Days 46-60): TRANSFORMING — Purpose & abundance
// Phase 5 (Days 61-75): INTEGRATING — Authentic living
// Phase 6 (Days 76-90): RADIATING — Wisdom & legacy

var DAYS = [
  // ──── PHASE 1: AWAKENING (Days 1-15) ────
  { t:"The Seed of Gratitude", c:"spiritual",
    i:"Welcome to Day 1 of your Lumina journey. Today we plant the first seed \u2014 gratitude. Find a quiet place and close your eyes. Think of three things you are grateful for. Not the obvious ones. The small, hidden gifts: the warmth of morning light, the sound of your own breathing, a kind word someone offered. In your paper journal, write each one slowly. Let it sink into your heart before moving on. Gratitude is the soil from which all inner growth begins.",
    m:"I am grateful for the abundance that already surrounds me." },
  { t:"The Art of Arriving", c:"spiritual",
    i:"Before we can grow, we must learn to arrive \u2014 to be fully here. Today, practice arriving. Sit for three minutes and simply notice: the weight of your body in the chair, the temperature of the air, the sounds around you. Do not judge or analyze. Just notice. In your journal, write what you observed. Most of us spend our lives somewhere other than where we are. Today, you practiced the radical act of being present.",
    m:"I am fully here, fully alive, in this moment." },
  { t:"The Mirror Within", c:"self-love",
    i:"Stand before a mirror \u2014 or simply close your eyes and picture yourself. What do you see? Not the flaws your mind rushes to name, but the whole being who has survived every difficult day. In your journal, write a letter to yourself as though writing to someone you love deeply. What would you say? What would you forgive? What would you celebrate? Self-compassion is not weakness. It is the bravest thing you will ever practice.",
    m:"I love myself unconditionally, exactly as I am." },
  { t:"Your Relationship with Abundance", c:"financial",
    i:"Money is energy \u2014 nothing more, nothing less. Today, examine your relationship with it without judgment. In your journal, write honestly: how does money make you feel? Anxiety? Freedom? Guilt? Shame? Now reflect on a belief about money you inherited from your family. Write it down. Ask yourself: is this belief still serving me? Today is simply about awareness. You cannot transform what you refuse to see.",
    m:"I am worthy of abundance in all its forms." },
  { t:"The Comfort Zone Map", c:"growth",
    i:"Draw a circle in your journal. Inside it, write everything that feels safe and familiar. Outside the circle, write the things that excite you, scare you, or make you feel alive. Look at both lists. Growth does not happen inside the circle \u2014 it lives at the edge. Choose one thing from outside and commit to the smallest possible step toward it this week. Not a leap. A step.",
    m:"I expand beyond my limits with courage and grace." },
  { t:"Five Minutes of Stillness", c:"spiritual",
    i:"Set a timer for five minutes. Sit comfortably and close your eyes. Breathe naturally. When thoughts arise \u2014 and they will \u2014 do not fight them. Imagine each thought is a leaf floating down a stream. Acknowledge it and let it pass. Return to the breath. Afterward, journal what came up. What did the silence reveal? Stillness is not the absence of noise. It is the presence of awareness.",
    m:"In stillness, I find the answers I have been seeking." },
  { t:"Honoring the Body", c:"self-love",
    i:"Your body has carried you through every moment of your life without once asking for thanks. Place your hands over your heart and feel it beating \u2014 it has done this billions of times for you. In your journal, list five things your body does that you rarely acknowledge. Then today, do one kind thing for it: stretch slowly, drink water with intention, rest when tired. Your body is not an obstacle to your spiritual life. It is the vehicle.",
    m:"My body is sacred, and I treat it with reverence." },
  { t:"The Stories We Carry", c:"growth",
    i:"We all carry a narrative about who we are \u2014 stories about our worth, our limits, our future. Today, write down the story you tell yourself most often. Read it back slowly. Is it true? Is it kind? Is it the story your wisest self would tell? Now write a new version. Not fantasy \u2014 but the version that honors your full potential. You are not rewriting reality. You are choosing which story gets your energy.",
    m:"I am the author of my story, and I choose to write it with love." },
  { t:"Sacred Morning", c:"spiritual",
    i:"How you begin your morning shapes the texture of your entire day. Today, design a simple morning ritual \u2014 even just ten minutes. Perhaps a moment of gratitude, three deep breaths, a quiet intention for the day, or reading something that nourishes your spirit. Write this ritual in your journal. Tomorrow, practice it. A sacred morning does not require religion. It requires attention.",
    m:"Each morning is a sacred invitation to begin again." },
  { t:"The Flow of Giving", c:"financial",
    i:"Abundance is a cycle. It flows in and it must flow out. Today, reflect on your relationship with generosity. When did you last give without expecting anything in return? In your journal, plan one act of giving this week. It does not need to be money \u2014 your time, your full attention, a kind word \u2014 these are currencies of the heart. Notice how giving makes you feel. Scarcity grasps. Abundance flows.",
    m:"As I give freely, abundance flows back to me." },
  { t:"The Art of Saying No", c:"self-love",
    i:"Saying no is one of the deepest acts of self-love. Today, reflect honestly on where you say yes when your heart whispers no. Who drains your energy? What obligations feel hollow? In your journal, write about one boundary you need to set. Then practice saying it out loud: No, and that is okay. Your peace is not negotiable. Every yes to something you do not mean is a no to yourself.",
    m:"I honor my needs by setting loving boundaries." },
  { t:"Walking Meditation", c:"spiritual",
    i:"Today your practice leaves the cushion. Go for a slow, deliberate walk \u2014 even ten minutes. Feel each footstep: the heel touching ground, the roll through the arch, the push of your toes. Notice the air on your skin. Listen to the world without naming what you hear. Walking meditation teaches us that mindfulness is not something we do in special moments. It is how we can live every moment. Journal what you noticed.",
    m:"Every step I take is a prayer of presence." },
  { t:"Breath as Anchor", c:"spiritual",
    i:"Your breath is the only thing that is always with you and always in the present moment. Today, practice conscious breathing three times: once in the morning, once midday, once before sleep. Each time, take five slow breaths. Inhale for four counts, hold for two, exhale for six. In your journal, write about how your state of mind shifted with each practice. The breath is your anchor in any storm.",
    m:"My breath connects me to the peace within." },
  { t:"The Gratitude Deepening", c:"spiritual",
    i:"On Day 1, you listed things you were grateful for. Today we go deeper. Choose one of those things and sit with it for five minutes. Close your eyes and really feel the gratitude \u2014 not as a thought, but as a sensation in your body. Where do you feel it? What does it feel like? In your journal, describe the physical experience of gratitude. When gratitude moves from the mind to the body, it becomes transformative.",
    m:"Gratitude is not just a thought. It is a way of being." },
  { t:"Impermanence", c:"growth",
    i:"Everything changes. The weather, your mood, the cells in your body, the people in your life. Today, sit quietly and reflect on impermanence \u2014 not with sadness, but with awe. In your journal, write about something you once clung to that has passed. Did life continue? Did you survive? Impermanence is not the enemy. Resistance to it is. When we accept that nothing lasts, we learn to treasure what is here now.",
    m:"I embrace change as the nature of all things." },

  // ──── PHASE 2: DEEPENING (Days 16-30) ────
  { t:"Meeting Your Shadow", c:"growth",
    i:"Within each of us lives a shadow \u2014 the parts we hide, deny, or reject. Today, we begin to meet it gently. In your journal, write about a quality in others that deeply irritates you. Now ask: where does this quality live in me? Shadow work is not about shame. It is about wholeness. You cannot become your fullest self while exiling parts of who you are.",
    m:"I embrace all parts of myself with compassion." },
  { t:"The Forgiveness Inquiry", c:"self-love",
    i:"Forgiveness is not about the other person. It is about releasing the weight you carry. Today, bring to mind someone you have not forgiven \u2014 perhaps even yourself. In your journal, write: What am I still holding? What would it feel like to set it down? You do not need to forgive today. Simply inquire. Feel the edges of the wound. Healing begins not with resolution, but with honest looking.",
    m:"I release what no longer serves my peace." },
  { t:"Emotional Weather Report", c:"self-love",
    i:"Today, check in with yourself as you would check the weather. What is the emotional climate inside you right now? Cloudy? Stormy? Clear? Name it without trying to change it. In your journal, write your emotional weather report three times today: morning, afternoon, evening. Notice how emotions are like weather \u2014 they move, they shift, they are never permanent. You are the sky, not the clouds.",
    m:"I observe my emotions with compassion, not judgment." },
  { t:"The Wanting Mind", c:"financial",
    i:"The mind that always wants more is the mind that can never rest. Today, notice your desires as they arise \u2014 wanting food, wanting approval, wanting things, wanting to be somewhere else. Each time you notice, pause and ask: what is the wanting beneath the wanting? In your journal, trace one desire to its root. Often, what we think we want is a proxy for something deeper: safety, love, or belonging.",
    m:"I have enough. I am enough. This moment is enough." },
  { t:"Sitting with Discomfort", c:"growth",
    i:"Growth happens not when things are easy, but when we learn to stay with what is difficult. Today, sit in meditation for seven minutes. When discomfort arises \u2014 an itch, a restless thought, boredom \u2014 do not move. Simply observe it. Notice its texture, its intensity, how it changes. In your journal, describe the experience. Learning to sit with discomfort in stillness teaches you to sit with discomfort in life.",
    m:"I am strong enough to sit with what is difficult." },
  { t:"The Inner Critic", c:"self-love",
    i:"We all have an inner voice that criticizes, shames, and diminishes us. Today, listen for it. When you hear it speak, write down exactly what it says in your journal. Then ask: whose voice is this really? A parent? A teacher? A culture? Now write a response from your wisest, most loving self. The inner critic is not your enemy. It is a frightened part of you that needs compassion, not combat.",
    m:"I speak to myself with the kindness I deserve." },
  { t:"Conscious Consumption", c:"financial",
    i:"Today, pay attention to everything you consume: food, media, conversations, purchases. Before each act of consumption, pause and ask: does this nourish me or deplete me? In your journal tonight, make two lists: what nourished you today and what depleted you. This is not about restriction. It is about choosing with awareness. What you consume becomes the material of your inner life.",
    m:"I choose to nourish my body, mind, and spirit with intention." },
  { t:"Loving-Kindness Practice", c:"spiritual",
    i:"Sit quietly and bring to mind someone you love. Silently offer them these words: May you be happy. May you be healthy. May you be safe. May you live with ease. Feel the warmth of this offering. Now direct the same words to yourself. Then to a stranger. Then to someone difficult. In your journal, write about where it was easy and where it was hard. This practice rewires the heart toward compassion.",
    m:"May all beings be happy, healthy, safe, and at peace." },
  { t:"Your Relationship with Time", c:"growth",
    i:"Most suffering comes from living in the past or the future rather than the present. Today, notice how often your mind leaves now. Are you replaying yesterday? Rehearsing tomorrow? Each time you notice, gently return to what is in front of you. In your journal, write about your relationship with time. Do you feel you have enough? Where does time seem to disappear? Time is not the problem. Our relationship with it is.",
    m:"I trust the timing of my life." },
  { t:"Body Scan Meditation", c:"self-love",
    i:"Lie down or sit comfortably. Starting at the top of your head, slowly move your attention through your body: forehead, eyes, jaw, neck, shoulders, arms, hands, chest, belly, hips, legs, feet. At each area, notice sensation without judgment. Where is there tension? Ease? Nothing? This takes about ten minutes. In your journal, map what you found. The body holds what the mind tries to forget.",
    m:"I listen to the wisdom my body carries." },
  { t:"The Roots of Fear", c:"growth",
    i:"Fear is the guardian of the comfort zone. Today, write about something you are currently afraid of. Then ask yourself three times: what am I really afraid of beneath this? Each answer takes you deeper. The surface fear is rarely the true one. At the root, most fears reduce to a few universal themes: being alone, being unworthy, losing control, or ceasing to exist. Name the root. It loses power in the naming.",
    m:"I meet my fears with curiosity rather than avoidance." },
  { t:"Non-Attachment Practice", c:"spiritual",
    i:"Non-attachment does not mean not caring. It means holding things \u2014 people, outcomes, possessions, opinions \u2014 with an open hand instead of a clenched fist. Today, choose one thing you are gripping tightly: an expectation, a plan, a grudge. In your journal, write about what you are holding and what it might feel like to soften your grip. Not to let go. Just to hold more gently.",
    m:"I hold life gently, with open hands and an open heart." },
  { t:"The Pause", c:"self-love",
    i:"Between stimulus and response, there is a space. In that space is your power. Today, practice The Pause. Three times today, before reacting to something \u2014 an email, a comment, an impulse \u2014 pause for three breaths. Then respond. In your journal, write about what happened in those pauses. What did you notice? What might you have done without the pause? This tiny space is where your freedom lives.",
    m:"In the pause, I find my power to choose." },
  { t:"Gratitude for Difficulty", c:"spiritual",
    i:"This is an advanced gratitude practice. Today, bring to mind something difficult you have experienced \u2014 not to minimize the pain, but to look for what it taught you. What strength did it build? What wisdom did it offer? What compassion did it open? In your journal, write a letter of gratitude to a hardship. This is not toxic positivity. It is the honest recognition that suffering, too, can be a teacher.",
    m:"Even in difficulty, I find the seeds of wisdom." },

  // ──── PHASE 3: EXPANDING (Days 31-45) ────
  { t:"Interconnection", c:"spiritual",
    i:"Nothing exists in isolation. The food on your plate passed through countless hands. The air you breathe was exhaled by trees that drink the rain. Today, trace one ordinary thing \u2014 your morning coffee, your shirt, your water \u2014 back through all the lives and processes that brought it to you. In your journal, write this chain. When you see how connected everything is, loneliness becomes impossible and gratitude becomes inevitable.",
    m:"I am woven into the fabric of all life." },
  { t:"Compassion for Strangers", c:"self-love",
    i:"Today, look at every person you encounter \u2014 in the street, at a store, in traffic \u2014 and silently acknowledge: this person has suffered. This person has known loss, fear, and loneliness, just like me. You do not need to say anything. Just let this recognition soften your gaze. In your journal tonight, write about how this shifted your day. Compassion is not pity. It is the recognition of shared humanity.",
    m:"Every person I meet is fighting a battle I know nothing about." },
  { t:"Right Speech", c:"growth",
    i:"Before speaking today, pause and ask three questions: Is it true? Is it kind? Is it necessary? If it does not pass all three, let it go. In your journal tonight, write about what you noticed. How much of your speech was habitual? How much was reactive? How much was truly necessary? Words are not neutral \u2014 they create the world we live in. Speak as though your words are seeds you are planting.",
    m:"I speak with truth, kindness, and intention." },
  { t:"The Gift of Attention", c:"self-love",
    i:"Today, give one person your complete, undivided attention. No phone, no wandering mind. Listen as though what they are saying is the most important thing in the world. Look at them fully. When they finish, pause before responding. In your journal, write about the experience \u2014 both how it felt to give that attention and what you received. Presence is the most generous gift you can offer another human being.",
    m:"My full attention is the greatest gift I can give." },
  { t:"Simplicity Practice", c:"financial",
    i:"Today, do one thing to simplify your life. Clear one drawer, cancel one subscription, say no to one commitment, delete apps you do not use. Simplicity is not deprivation \u2014 it is the removal of everything that distracts you from what matters. In your journal, write about what you simplified and how it felt. Every possession, commitment, and distraction you release creates space for what truly nourishes you.",
    m:"I create space for what truly matters." },
  { t:"Tonglen: Breathing In Suffering", c:"spiritual",
    i:"This ancient practice transforms how we relate to pain. Sit quietly. On the inhale, imagine breathing in the suffering of someone you know \u2014 their grief, fear, or confusion. On the exhale, breathe out relief, love, and peace toward them. Start with one person. In your journal, write about the experience. Tonglen teaches us that we do not need to run from suffering. We can transform it through the alchemy of compassion.",
    m:"I have the courage to hold space for suffering and transform it into love." },
  { t:"Digital Sabbath", c:"growth",
    i:"Today, take a break from screens for as long as you can. No social media, no news, no mindless scrolling. If a full day is impossible, choose four hours. Notice what arises in the space: restlessness? Relief? Boredom? Creativity? In your journal, document the experience. Our devices fill every gap where insight might grow. Sometimes the most radical thing you can do is create an unfilled space.",
    m:"I am not my notifications. I am the awareness behind them." },
  { t:"Equanimity", c:"spiritual",
    i:"Equanimity is the ability to remain balanced in the face of both pleasant and unpleasant experiences. Today, when something good happens, notice without grasping. When something unpleasant happens, notice without aversion. Simply observe both with the same steady awareness. In your journal, write about moments of grasping and aversion you noticed. Equanimity is not indifference \u2014 it is engaged, compassionate balance.",
    m:"I meet both joy and difficulty with a steady heart." },
  { t:"Service Without Recognition", c:"financial",
    i:"Do something kind for someone today without telling anyone about it and without expecting acknowledgment. It can be small: pay for a stranger's coffee, leave an encouraging note, quietly help someone struggling. Tell no one. Write about it only in your journal. Service that seeks recognition is performance. Service that remains invisible is practice. Notice what it feels like to give with no audience.",
    m:"I serve not for recognition but because it is my nature to give." },
  { t:"Contemplating Death", c:"spiritual",
    i:"This is not morbid \u2014 it is one of the most clarifying practices in contemplative traditions. Sit quietly and acknowledge: one day, this body will stop. This is not a threat. It is a fact that gives today its urgency and beauty. In your journal, write: if I had one year left, what would I stop doing? What would I start? Who would I call? The awareness of death does not diminish life. It illuminates it.",
    m:"Because this life is finite, every moment is precious." },
  { t:"Nature as Teacher", c:"growth",
    i:"Spend time outdoors today \u2014 even fifteen minutes. Do not listen to music or podcasts. Just be in nature. Notice how a tree grows without hurrying. How water flows around obstacles rather than fighting them. How seasons change without resistance. In your journal, write about one lesson nature offered you today. We do not need to look far for spiritual teachers. The earth has been practicing wisdom for billions of years.",
    m:"Nature teaches me patience, resilience, and surrender." },
  { t:"The Middle Way", c:"spiritual",
    i:"Extreme effort exhausts. Extreme laziness stagnates. Today, reflect on where you tend toward extremes: overworking or avoiding, over-giving or withdrawing, indulgence or deprivation. The middle path is not mediocrity \u2014 it is the razor's edge of balanced effort. In your journal, identify one area where you could move toward balance. Wisdom lives not in the extremes but in the space between them.",
    m:"I walk the path of balance with grace and awareness." },
  { t:"Compassion for Your Past Self", c:"self-love",
    i:"Think of a decision you made that you now regret. Now consider: with the information, maturity, and emotional resources you had at that time, could you truly have done differently? Probably not. In your journal, write a letter to the version of yourself who made that decision. Offer understanding, not judgment. You did what you could with what you had. That deserves compassion, not punishment.",
    m:"I forgive my past self for not knowing what I know now." },

  // ──── PHASE 4: TRANSFORMING (Days 46-60) ────
  { t:"Rewriting Core Beliefs", c:"growth",
    i:"We carry beliefs so deep we mistake them for facts: I am not enough. The world is not safe. I do not deserve love. Today, write down three beliefs that run your life. For each, ask: when did I first learn this? Is it absolutely true? Who would I be without this belief? In your journal, write a replacement for each \u2014 not an opposite, but a more complete truth. This is some of the most powerful work you will ever do.",
    m:"I release beliefs that limit me and embrace truths that free me." },
  { t:"Purpose as Practice", c:"growth",
    i:"Purpose is not a destination you arrive at but a direction you walk. Today, reflect on what makes you lose track of time, what breaks your heart about the world, and what you would do if money were irrelevant. In your journal, look for where these three overlap. You do not need to find your purpose today. Just notice where purpose might already be quietly living in your life.",
    m:"My purpose reveals itself when I listen with my heart." },
  { t:"Abundance Mindset", c:"financial",
    i:"Scarcity whispers: there is not enough. Abundance replies: there is always more where that came from. Today, catch yourself in scarcity thinking \u2014 about money, time, love, opportunity. Each time, gently replace it with an abundance truth. In your journal, track your scarcity thoughts and write their abundance counterparts. This is not about ignoring reality. It is about refusing to let fear be the lens through which you see everything.",
    m:"The universe is generous, and I am open to receiving." },
  { t:"The Witness", c:"spiritual",
    i:"Today, practice being The Witness. Go through your day observing yourself as though watching a character in a film. Watch yourself eat, talk, react, feel. Do not judge the character. Simply observe. In your journal, write what The Witness noticed that the character would have missed. This practice reveals the space between you and your experiences \u2014 and in that space, freedom lives.",
    m:"I am not my thoughts. I am the awareness that observes them." },
  { t:"Generosity Beyond Money", c:"financial",
    i:"Make a list in your journal of ten ways you can be generous that cost nothing: your time, your skills, a listening ear, a compliment, your patience, sharing knowledge, a letter of appreciation, holding a door with presence, cooking for someone, forgiving a debt of the heart. Choose three and practice them today. True wealth is measured not by what you have but by what you freely give.",
    m:"I am rich in ways that cannot be counted." },
  { t:"Meditation on Emptiness", c:"spiritual",
    i:"Sit for ten minutes. Instead of focusing on an object, rest in the space between thoughts. When a thought comes, let it dissolve and notice the gap before the next one. Rest in that gap. It may be brief at first \u2014 a half-second of pure awareness. That gap is not nothing. It is the ground of everything. In your journal, describe the experience, even if it felt like nothing happened. Nothing is sometimes the most profound something.",
    m:"In emptiness, I find the fullness of being." },
  { t:"Values Inventory", c:"growth",
    i:"List your ten most important values: not what you think they should be, but what actually drives your choices. Now look at how you spent last week. How much alignment is there between your values and your time? In your journal, write about the gaps you see. When we live out of alignment with our values, we feel empty even when we have everything. Alignment is the quiet secret to a meaningful life.",
    m:"I live in alignment with what truly matters to me." },
  { t:"The Second Arrow", c:"self-love",
    i:"The Buddha taught that pain is inevitable, but suffering is optional. The first arrow is what happens to you. The second arrow is the story you tell about it: why me, this always happens, I cannot handle this. Today, when something unpleasant occurs, notice the first arrow and watch for the second. In your journal, describe both arrows. Can you receive the first without shooting the second? This is the path to freedom from unnecessary suffering.",
    m:"I feel my pain without adding to it with stories." },
  { t:"Visualization Practice", c:"growth",
    i:"Close your eyes and imagine your life one year from now, lived in full alignment with your deepest values. See it in detail: where you are, how your morning unfolds, what your work looks like, how your relationships feel, what your inner state is. Spend ten minutes in this vision. In your journal, describe it vividly. Visualization is not fantasy. It is the practice of making the invisible visible, so your actions can follow.",
    m:"I see my highest life clearly, and I move toward it daily." },
  { t:"Investigating Reactivity", c:"self-love",
    i:"Today, pay close attention to moments when you react strongly to something \u2014 anger, defensiveness, hurt. Instead of following the reaction, pause and investigate it with curiosity. Where did you feel it in your body? What triggered it? What older wound does it connect to? In your journal, map one reactive moment in detail. Reactivity is the unconscious past hijacking the present. Awareness breaks the chain.",
    m:"I respond from presence, not from old wounds." },
  { t:"Radical Acceptance", c:"spiritual",
    i:"Acceptance does not mean approval. It means acknowledging what is without waging war against reality. Today, choose one situation in your life that you have been resisting. Sit with it and say: this is how it is right now. Not forever. Just now. In your journal, write about the difference between acceptance and resignation. Resistance exhausts. Acceptance frees your energy for the only question that matters: what now?",
    m:"I accept what is and trust my power to shape what comes next." },
  { t:"Joy as Practice", c:"self-love",
    i:"We practice gratitude, compassion, and patience. But how often do we practice joy? Today, intentionally create three moments of joy: listen to a song that moves you, watch the light change at sunset, savor a single bite of food with complete attention. In your journal, describe each moment. Joy is not frivolous. In contemplative traditions, it is considered a sign of spiritual maturity \u2014 the ability to be delighted by ordinary things.",
    m:"I give myself permission to experience deep, uncomplicated joy." },

  // ──── PHASE 5: INTEGRATING (Days 61-75) ────
  { t:"Right Livelihood", c:"financial",
    i:"How you earn your living is a spiritual practice. Today, reflect honestly on your work. Does it contribute to the wellbeing of others? Does it align with your values? Does it allow you to express your gifts? In your journal, write about what would need to change \u2014 even slightly \u2014 for your work to feel more aligned. You do not need to quit your job. Sometimes right livelihood begins with a shift in intention, not a change in title.",
    m:"My work is an expression of my deepest values." },
  { t:"Relationship as Mirror", c:"self-love",
    i:"Every close relationship is a mirror, reflecting back parts of ourselves we cannot otherwise see. Today, choose one important relationship and ask: what does this person reflect back to me? What do I admire in them that lives dormant in me? What irritates me that I have not accepted in myself? In your journal, explore this mirror honestly. The people closest to us are our most powerful \u2014 and most uncomfortable \u2014 teachers.",
    m:"My relationships teach me what I am ready to learn." },
  { t:"Beginner's Mind", c:"spiritual",
    i:"In the beginner's mind, there are many possibilities. In the expert's mind, there are few. Today, approach one familiar activity \u2014 brushing your teeth, making coffee, your commute \u2014 as if experiencing it for the very first time. Notice everything. In your journal, write what you discovered. When we think we know something, we stop seeing it. Beginner's mind is the antidote to the blindness of routine.",
    m:"I approach each moment with fresh eyes and an open heart." },
  { t:"Honest Inventory", c:"growth",
    i:"Today requires courage. In your journal, make three lists. Things I am proud of this year. Things I am avoiding. Truths I am not telling myself. Be ruthlessly honest \u2014 this journal is for your eyes only. Then sit with what you wrote without trying to fix anything. The most transformative thing you can do is look clearly at your life without flinching. Clarity always precedes meaningful change.",
    m:"I have the courage to see my life clearly." },
  { t:"Energy Audit", c:"self-love",
    i:"Everything in your life either gives you energy or takes it. Today, in your journal, list the people, activities, environments, habits, and commitments that energize you and those that drain you. Be honest. Now circle one draining item you are willing to reduce or release, and one energizing item you are willing to increase. Your energy is finite and sacred. Spend it with the same care you would spend your last dollar.",
    m:"I protect my energy and invest it wisely." },
  { t:"Sitting with Joy and Sorrow", c:"spiritual",
    i:"Life contains both joy and sorrow, often simultaneously. A beautiful sunset reminds us of someone who is gone. A child's laughter exists in a world that contains suffering. Today, sit for ten minutes and hold both joy and sorrow at once. Do not choose. Hold both. In your journal, write about the experience. The heart that can hold paradox is the heart that is truly awake.",
    m:"My heart is big enough to hold both joy and sorrow." },
  { t:"The Practice of Enough", c:"financial",
    i:"There is a point where you have enough \u2014 enough food, enough shelter, enough comfort. Beyond that point, more does not create more happiness. It often creates more anxiety. Today, in your journal, define what enough looks like for you: in money, possessions, achievement, social approval. Be specific. The person who knows they have enough is the richest person in any room.",
    m:"I know what enough is, and I celebrate it." },
  { t:"Authentic Expression", c:"growth",
    i:"Where in your life are you performing a version of yourself that is not true? Where do you dim your light to make others comfortable, or amplify it to win approval? Today, in one interaction, experiment with dropping the performance. Say what you actually think. Express what you actually feel. Not aggressively \u2014 but honestly. In your journal, write about what it felt like. Authenticity is terrifying because it risks rejection. But it is the only path to genuine connection.",
    m:"I am worthy of love exactly as I am, not as I perform." },
  { t:"Forgiveness Ceremony", c:"self-love",
    i:"Today, write a letter you will never send. Address it to someone who hurt you \u2014 or to yourself for a self-inflicted wound. Write everything: the anger, the grief, the confusion. Do not edit. When you are finished, read it once. Then tear it up, burn it safely, or bury it. This is not for them. This is for you. In your journal, write about what you released. Some things can only be put down through ceremony.",
    m:"I set down what I have carried too long, and I walk forward lighter." },
  { t:"Mindful Communication", c:"growth",
    i:"Today, in every conversation, practice this sequence: listen fully without planning your response. Pause before speaking. Respond rather than react. Notice the difference between listening to understand and listening to reply. In your journal, write about one conversation where you practiced this fully. Most conflicts arise not from what is said but from what is not heard. Deep listening heals.",
    m:"I listen with my whole being and speak from my heart." },

  // ──── PHASE 6: RADIATING (Days 76-90) ────
  { t:"Teaching What You Know", c:"spiritual",
    i:"The best way to deepen your understanding is to share it. Today, share one insight from this journey with someone \u2014 a friend, a family member, a colleague. Not as advice. Not as superiority. But as an offering: something you learned about yourself. In your journal, write about the exchange. Teaching is not about being an expert. It is about being honest. Every time you share authentically, you learn it again for the first time.",
    m:"As I share what I have learned, my understanding deepens." },
  { t:"Legacy Meditation", c:"growth",
    i:"Close your eyes and imagine it is the end of your life. Not to frighten you, but to clarify. How do you want to be remembered? Not for what you achieved, but for how you made people feel. In your journal, write your own eulogy \u2014 not as it would be today, but as you want it to be. What qualities define you? What impact did you leave? Now ask: what can I do today to move toward that person?",
    m:"I live each day as a contribution to the legacy I wish to leave." },
  { t:"Advanced Loving-Kindness", c:"spiritual",
    i:"On Day 24, you practiced basic loving-kindness. Today, extend it to its full range. Offer the phrases to: yourself, a loved one, a friend, a neutral person, a difficult person, and finally all beings everywhere. Spend two minutes on each. May you be happy. May you be healthy. May you be safe. May you live with ease. In your journal, write about where your heart opened and where it resisted. The resistance is where the practice is.",
    m:"My compassion has no boundaries." },
  { t:"Defining True Wealth", c:"financial",
    i:"In your journal, answer this question without thinking too long: If I lost everything material tomorrow, what would remain? Write about the wealth that cannot be taken: your wisdom, your capacity to love, your resilience, your relationships, your ability to start again. These are your true assets. Today, invest in one of them. Call someone you love. Learn something. Sit in gratitude. Real wealth compounds in the heart.",
    m:"My true wealth is measured by what remains when everything else is stripped away." },
  { t:"Solitude Practice", c:"spiritual",
    i:"Today, spend thirty minutes in complete solitude. No phone, no book, no music. Just you. Sit somewhere comfortable and let yourself be. Do not meditate formally. Just exist without stimulus or agenda. In your journal, write about what arose. For many, solitude is frightening because it strips away all the distractions we use to avoid ourselves. But in that stripped-down space, you meet the one person you can never escape: yourself.",
    m:"I am comfortable in the company of my own being." },
  { t:"Life as Practice", c:"growth",
    i:"For the past eighty days, you have been practicing specific exercises. Today, recognize that everything is practice. Making breakfast is practice. Driving is practice. A disagreement is practice. A sunset is practice. In your journal, describe three ordinary moments from today and identify what each one offered you as a practice. When all of life becomes the practice, there is no separation between the spiritual and the mundane.",
    m:"Every moment is an opportunity to practice awareness." },
  { t:"The Bodhisattva Vow", c:"spiritual",
    i:"In Buddhist tradition, a Bodhisattva is one who seeks awakening not just for themselves but for all beings. Today, sit quietly and make your own version of this vow. Not as religion, but as intention. In your journal, write: What do I wish for all beings? What am I willing to practice so that my awakening serves others? Spiritual growth that serves only the self eventually becomes a prison. Growth that serves all becomes liberation.",
    m:"My growth serves not only me but all beings." },
  { t:"Reviewing Your Journey", c:"self-love",
    i:"Go back through your paper journal from Day 1 to today. Read without judgment. Notice how your handwriting may have changed, how your insights deepened, how themes evolved. In your journal today, write about the version of you who started this journey. What would you say to that person? What do you appreciate about their courage? You are not the same person who began this. Honor both who you were and who you are becoming.",
    m:"I honor every version of myself that brought me here." },
  { t:"Interdependence Meditation", c:"spiritual",
    i:"Sit quietly and contemplate this: you did not create yourself. Your body was built from food grown in soil, fed by rain, energized by sun. Your mind was shaped by every person who ever spoke to you, every book you read, every experience you survived. You are a collaboration between the entire universe and this particular moment. In your journal, write about what interdependence means for how you live. No one is self-made. Everyone is everything-made.",
    m:"I am a collaboration between the universe and this moment." },
  { t:"Letting Go of the Path", c:"growth",
    i:"A paradox of spiritual growth: the path that brought you here must eventually be released. The practices, the concepts, the identity of being a seeker \u2014 these are rafts, not destinations. Today, reflect on what you might be clinging to about this journey itself. In your journal, explore: can I keep growing without needing to call it growth? The finger pointing at the moon is not the moon. The practices are not the awakening. They are the doorway.",
    m:"I release the path and trust the open road." },
  { t:"Radical Generosity", c:"financial",
    i:"Today, be radically generous in one way that stretches you slightly beyond comfort. Give more than feels easy \u2014 of your time, your money, your energy, your vulnerability. Not to the point of harm, but to the point of feeling the stretch. In your journal, write about what you gave and what it stirred in you. Generosity is a muscle. Like all muscles, it grows only when you push past the familiar range of motion.",
    m:"I give boldly, and in giving, I discover my abundance." },
  { t:"The Still Point", c:"spiritual",
    i:"There is a place inside you that has never been touched by your story, your pain, your name, or your history. It is the still point at the center of the turning world. Today, sit for fifteen minutes and seek it. Not with effort. With surrender. Let everything else fall away \u2014 thoughts, feelings, identity \u2014 and rest in what remains. In your journal, write about whatever you found, even if it was nothing. Especially if it was nothing.",
    m:"At the center of everything, there is peace." },
  { t:"Writing Your Own Mantra", c:"self-love",
    i:"For ninety days, you have been offered mantras. Today, write your own. Sit quietly and ask yourself: what does my soul most need to hear right now? Write whatever comes, then refine it until it feels true in your bones. Say it aloud three times. In your journal, write your mantra and why you chose these words. From now on, this is yours. No one gave it to you. It came from the same place wisdom has always come from: within.",
    m:"I trust the wisdom that lives within me." },
  { t:"The Final Reflection", c:"spiritual",
    i:"You have arrived. Ninety days of showing up, of sitting with discomfort, of asking hard questions, of offering yourself compassion. In your journal, write freely about this journey. What surprised you? What changed? What remains unresolved? What will you carry forward? There is no graduation from the inner life \u2014 only deeper practice. But today, pause and acknowledge: you did something most people never do. You looked inward. You stayed. That took courage.",
    m:"I am awake. I am grateful. I continue." },
  { t:"The Continuation", c:"spiritual",
    i:"Day 90 is not an ending. It is a commencement. Today, in your journal, design your own practice for the next season of your life. What will you keep from these 90 days? What new practices call to you? How will you continue to grow without a guided structure? The training wheels come off today. But the road continues. You now have everything you need. You always did. The journey simply helped you remember.",
    m:"The journey never ends. I walk forward with an open heart." },
  { t:"Gratitude as Legacy", c:"spiritual",
    i:"Today, write a gratitude letter to someone who shaped you — a parent, teacher, friend, or stranger. Do not send it yet. Just write it fully, holding nothing back. Thank them for specific moments, words, and gifts they may not know they gave. In your journal, reflect on how gratitude expressed becomes a living legacy. When we name what others gave us, we complete a circle that blesses both giver and receiver.",
    m:"My gratitude is a gift I give to those who shaped me." },
  { t:"Conscious Money Practice", c:"financial",
    i:"Today, track every financial transaction with full awareness. Before each purchase, pause and ask: does this reflect my values? After each one, notice how you feel — lighter, heavier, neutral? In your journal, review the day. Where was your spending conscious? Where was it automatic? Money is crystallized life energy. When we spend unconsciously, we leak vitality. When we spend with awareness, every transaction becomes a practice.",
    m:"Every financial choice is an expression of my deepest values." },
  { t:"The Courage to Be Seen", c:"self-love",
    i:"Today, share something authentic with someone you trust — a dream, a fear, an imperfect truth about yourself. Not for validation, but for the practice of being genuinely seen. In your journal, write about the experience. What did vulnerability feel like in your body? What happened when you let someone see the real you? We spend so much energy curating a version of ourselves. True belonging requires the courage to show up as we are.",
    m:"I let myself be truly seen, and in that vulnerability, I find connection." },
  { t:"Designing Your Daily Practice", c:"growth",
    i:"The structured 90-day journey is ending, but your practice continues. Today, design your own daily spiritual practice. Choose from what served you most: meditation, journaling, gratitude, loving-kindness, breath work, walking meditation, or something entirely new. Write it down in detail — when, where, how long. Keep it simple enough to sustain. In your journal, commit to this practice. Discipline is not the enemy of freedom. It is its foundation.",
    m:"I design a practice that nourishes me every single day." },
  { t:"The Sacred Ordinary", c:"spiritual",
    i:"Today, treat every ordinary moment as sacred. Washing dishes becomes a meditation. Eating becomes a ceremony. Walking becomes a pilgrimage. Speaking becomes a prayer. There is no dividing line between the spiritual and the mundane — we only think there is. In your journal, describe three ordinary moments you made sacred today. When everything becomes practice, you realize there was never anywhere to get to. You were always already here.",
    m:"Every ordinary moment holds the sacred within it." },
  { t:"Legacy of Kindness", c:"self-love",
    i:"Today, perform three deliberate acts of kindness: one for yourself, one for someone close, and one for a stranger. Make each one specific and intentional. For yourself: rest, nourishment, or beauty. For someone close: a letter, a gift of time, a genuine compliment. For a stranger: generosity without recognition. In your journal, write about all three. Kindness is not a luxury. It is the most practical spiritual practice that exists.",
    m:"My kindness ripples outward and returns as peace." },
  { t:"Abundance Flows Through Me", c:"financial",
    i:"Today, reflect on all the ways abundance has flowed through your life — not just money, but love, opportunity, learning, beauty, health, friendship. Make an abundance inventory in your journal. Write at least twenty items. Then ask: am I a channel or a dam? Does abundance flow through me to others, or do I try to hold it all? The most prosperous people are those who allow abundance to move freely — receiving generously, giving generously.",
    m:"I am a generous channel through which abundance flows to bless the world." },
  { t:"Integration Day", c:"growth",
    i:"Today is for integration. Sit quietly for twenty minutes and let the past eighty-seven days settle into your bones. Do not try to summarize or analyze. Just sit with it all. Then in your journal, write freely — whatever comes. Let your hand move without planning. This is not a test. There is nothing to achieve. Simply allow whatever has been planted in you to find its own expression. Trust the process. Trust yourself.",
    m:"I trust that everything I have learned lives within me now." },
  { t:"The Circle Completes", c:"self-love",
    i:"Today, look at yourself with the same tenderness you would offer a dear friend. You have spent almost ninety days learning to be more present, more compassionate, more aware. In your journal, write a love letter to yourself — not about what you have accomplished, but about who you are. Not the improved version. The version that was always there, hidden beneath the noise. This is not the end of self-love. It is the moment you realize it was always the beginning.",
    m:"I have always been worthy of the love I now give myself." },
  { t:"Blessing and Release", c:"spiritual",
    i:"Sit quietly and bring to mind this entire journey — the difficult days, the breakthrough moments, the days you did not want to practice but did anyway, the surprises and the silences. Bless it all. Thank this journey for what it taught you. Then, gently, release it. You do not need to hold onto the experience. It is now part of who you are. In your journal, write your blessing and release. Completion is its own kind of beginning.",
    m:"I bless this journey and release it with an open heart." },
  { t:"The Unending Path", c:"spiritual",
    i:"Day 90. You have walked a path that most never begin. You have looked inward when it would have been easier to look away. You have sat with discomfort, offered yourself compassion, examined your beliefs, practiced generosity, and dared to grow. This journey has no graduation — only continuation. The path does not end here. It opens. In your journal, write your intention for the next chapter. You are ready. You always were.",
    m:"I am complete, and I am just beginning." },
];


// Day-to-illustration mapping (0-19 illustration types per day theme)
// Motif key: 0=Seed 1=Meditation 2=Mirror 3=Waves 4=Compass 5=Candle 6=Heart 7=Book 8=Sunrise 9=OpenHands 10=Tree 11=Path 12=Breath 13=Mountain 14=YinYang 15=Butterfly 16=Eye 17=Mandala 18=Doorway 19=Flame
var DAY_ILLUS = [
  // Phase 1: AWAKENING (Days 1-15)
  0,  // 1  Seed of Gratitude → Seed
  1,  // 2  Art of Arriving → Meditation (presence)
  2,  // 3  Mirror Within → Mirror
  3,  // 4  Relationship with Abundance → Waves (flow)
  4,  // 5  Comfort Zone Map → Compass (direction)
  1,  // 6  Five Minutes of Stillness → Meditation
  6,  // 7  Honoring the Body → Heart (self-love)
  7,  // 8  Stories We Carry → Book (stories)
  8,  // 9  Sacred Morning → Sunrise
  9,  // 10 Flow of Giving → Open Hands
  11, // 11 Art of Saying No → Path (boundaries)
  11, // 12 Walking Meditation → Path (walking)
  12, // 13 Breath as Anchor → Breath
  0,  // 14 Gratitude Deepening → Seed (gratitude)
  10, // 15 Impermanence → Tree (cycles)
  // Phase 2: DEEPENING (Days 16-30)
  14, // 16 Meeting Your Shadow → Yin-Yang (shadow)
  6,  // 17 Forgiveness Inquiry → Heart (forgiveness)
  3,  // 18 Emotional Weather → Waves (emotions)
  16, // 19 Wanting Mind → Eye (awareness)
  13, // 20 Sitting with Discomfort → Mountain (endurance)
  2,  // 21 Inner Critic → Mirror (self-reflection)
  16, // 22 Conscious Consumption → Eye (awareness)
  6,  // 23 Loving-Kindness → Heart (kindness)
  12, // 24 Relationship with Time → Spirals (time)
  1,  // 25 Body Scan → Meditation (body)
  10, // 26 Root of Fear → Tree (roots)
  9,  // 27 Letting Go → Open Hands
  12, // 28 Space Between → Breath (pause)
  13, // 29 Gratitude for Difficulty → Mountain (challenge)
  17, // 30 Interconnection → Mandala
  // Phase 3: EXPANDING (Days 31-45)
  6,  // 31 Compassion for Strangers → Heart
  7,  // 32 Right Speech → Book (words)
  16, // 33 Gift of Attention → Eye (attention)
  5,  // 34 Practice of Simplicity → Candle (simplicity)
  12, // 35 Tonglen → Breath (breathing)
  18, // 36 Digital Sabbath → Doorway (opening)
  14, // 37 Equanimity → Yin-Yang (balance)
  9,  // 38 Unseen Service → Open Hands (giving)
  19, // 39 Meditating on Death → Flame (life)
  10, // 40 Nature as Teacher → Tree (nature)
  11, // 41 Middle Path → Path
  2,  // 42 Compassion for Past Self → Mirror
  7,  // 43 Rewriting Core Beliefs → Book (rewriting)
  4,  // 44 Purpose as Practice → Compass (purpose)
  8,  // 45 Abundance Mindset → Sunrise (openness)
  // Phase 4: TRANSFORMING (Days 46-60)
  16, // 46 The Observer → Eye (observing)
  9,  // 47 Generosity Beyond Money → Open Hands
  17, // 48 Meditation on Emptiness → Mandala
  7,  // 49 Values Inventory → Book
  13, // 50 The Second Arrow → Mountain (pain)
  16, // 51 Visualization → Eye
  19, // 52 Reactivity Inquiry → Flame
  3,  // 53 Radical Acceptance → Waves (accepting)
  15, // 54 Practice of Joy → Butterfly (joy)
  4,  // 55 Right Livelihood → Compass (direction)
  2,  // 56 Relationships as Mirrors → Mirror
  8,  // 57 Beginner's Mind → Sunrise (fresh)
  7,  // 58 Honest Inventory → Book
  5,  // 59 Energy Audit → Candle (energy)
  14, // 60 Joy and Sorrow → Yin-Yang (both)
  // Phase 5: INTEGRATING (Days 61-75)
  3,  // 61 Practice of Enough → Waves (flow)
  19, // 62 Authentic Expression → Flame (passion)
  6,  // 63 Forgiveness Ritual → Heart
  7,  // 64 Mindful Dialogue → Book (dialogue)
  5,  // 65 Teaching What You Know → Candle (light)
  10, // 66 Legacy Meditation → Tree (roots)
  17, // 67 Advanced Loving-Kindness → Mandala
  0,  // 68 Defining True Wealth → Seed (true abundance)
  13, // 69 Practice of Solitude → Mountain (alone)
  11, // 70 Life as Practice → Path (journey)
  6,  // 71 Bodhisattva Vow → Heart (compassion vow)
  4,  // 72 Reviewing the Journey → Compass (review)
  17, // 73 Interdependence → Mandala
  18, // 74 Releasing the Path → Doorway (opening)
  9,  // 75 Radical Generosity → Open Hands
  // Phase 6: RADIATING (Days 76-90)
  1,  // 76 Still Center → Meditation
  7,  // 77 Writing Your Mantra → Book (writing)
  2,  // 78 Final Reflection → Mirror
  11, // 79 Continuation → Path
  0,  // 80 Gratitude as Legacy → Seed (gratitude)
  4,  // 81 Conscious Money → Compass
  16, // 82 Courage to Be Seen → Eye
  5,  // 83 Design Daily Practice → Candle
  8,  // 84 Sacred Ordinary → Sunrise
  6,  // 85 Legacy of Kindness → Heart
  3,  // 86 Abundance Through Me → Waves (flowing)
  1,  // 87 Integration Day → Meditation
  17, // 88 Circle Completes → Mandala
  15, // 89 Blessing and Release → Butterfly
  18, // 90 Endless Path → Doorway (opening)
];


// ─── JAPANESE TRANSLATIONS FOR ALL 90 DAYS ───
var JA_DAYS = {
  t: [
    "感謝の種",
    "到着の技法",
    "内なる鏡",
    "豊かさとの関係",
    "コンフォートゾーンの地図",
    "五分間の静寂",
    "身体を敬う",
    "私たちが運ぶ物語",
    "聖なる朝",
    "与えることの流れ",
    "断る技法",
    "歩く瞑想",
    "錨としての呼吸",
    "感謝の深化",
    "無常",
    "影との出会い",
    "赦しの探究",
    "心の天気予報",
    "欲望する心",
    "不快と共に座る",
    "内なる批判者",
    "意識的な消費",
    "慈悲の瞑想",
    "時間との関係",
    "ボディスキャン瞑想",
    "恐れの根源",
    "執着を手放す",
    "間（ま）",
    "困難への感謝",
    "つながり",
    "見知らぬ人への思いやり",
    "正しい言葉",
    "注意という贈り物",
    "簡素の実践",
    "トンレン：苦しみを吸い込む",
    "デジタル安息日",
    "平静",
    "認められない奉仕",
    "死を見つめる",
    "自然という師",
    "中道",
    "過去の自分への思いやり",
    "核心的信念の書き換え",
    "実践としての目的",
    "豊かさのマインドセット",
    "観察者",
    "お金を超えた寛大さ",
    "空の瞑想",
    "価値観の棚卸し",
    "第二の矢",
    "視覚化の実践",
    "反応性の探究",
    "根本的な受容",
    "喜びの実践",
    "正しい生計",
    "鏡としての人間関係",
    "初心",
    "正直な棚卸し",
    "エネルギーの監査",
    "喜びと悲しみと共に座る",
    "「足りている」の実践",
    "本当の自己表現",
    "赦しの儀式",
    "マインドフルな対話",
    "知っていることを教える",
    "遺産の瞑想",
    "慈悲の瞑想・上級",
    "本当の豊かさを定義する",
    "孤独の実践",
    "人生は実践",
    "菩薩の誓い",
    "旅を振り返る",
    "相互依存の瞑想",
    "道を手放す",
    "根本的な寛大さ",
    "静寂の中心",
    "自分のマントラを書く",
    "最後の振り返り",
    "継続",
    "遺産としての感謝",
    "意識的なお金の実践",
    "見られる勇気",
    "日々の実践をデザインする",
    "聖なる日常",
    "優しさの遺産",
    "私を通して流れる豊かさ",
    "統合の日",
    "円が完成する",
    "祝福と解放",
    "終わりなき道",
  ],
  i: [
    "ルミナの旅の第一日目へようこそ。今日、最初の種を植えます——感謝です。静かな場所を見つけ、目を閉じてください。感謝していることを三つ考えてください。当たり前のものではなく、小さな隠れた贈り物を。朝の光の温かさ、自分の呼吸の音、誰かがくれた優しい言葉。ノートにひとつずつゆっくりと書いてください。次に進む前に、心に染み込ませましょう。感謝は、すべての内なる成長が始まる土壌です。",
    "成長する前に、まず到着することを学ばなければなりません——完全にここにいることを。今日は到着する練習をしましょう。三分間座って、ただ気づいてください。椅子に座る体の重さ、空気の温度、周りの音。判断も分析もせず、ただ気づくだけ。ノートに観察したことを書いてください。私たちの多くは、今いる場所以外のどこかで人生を過ごしています。今日、あなたは存在するという根本的な行為を実践しました。",
    "鏡の前に立ってください——あるいは目を閉じて自分を思い浮かべてください。何が見えますか？心が急いで名前をつける欠点ではなく、困難な日々すべてを生き延びた存在全体を。ノートに、深く愛する人に書くように自分への手紙を書いてください。何を伝えますか？何を許しますか？何を祝いますか？自己慈悲は弱さではありません。あなたが実践する最も勇敢なことです。",
    "お金はエネルギーです——それ以上でもそれ以下でもありません。今日、判断なしにお金との関係を見つめてください。ノートに正直に書いてください。お金はどんな気持ちにさせますか？不安？自由？罪悪感？恥？今、家族から受け継いだお金に関する信念を振り返ってください。書き出してください。問いかけてください。この信念はまだ自分のためになっているだろうか？今日はただ気づくことだけです。見ることを拒むものは変えられません。",
    "ノートに円を描いてください。中に安全で馴染みのあるものをすべて書いてください。円の外に、ワクワクするもの、怖いもの、生きている実感がするものを書いてください。両方のリストを見てください。成長は円の中では起きません——それは端に生きています。外側からひとつ選び、今週中にそれに向かう最も小さな一歩を約束してください。飛躍ではなく、一歩を。",
    "タイマーを五分にセットしてください。楽な姿勢で座り、目を閉じてください。自然に呼吸してください。考えが浮かんだら——必ず浮かびます——戦わないでください。それぞれの考えが川を流れる葉だと想像してください。認めて、流してください。呼吸に戻りましょう。終わったら、何が浮かんだかをノートに書いてください。静寂は音の不在ではありません。気づきの存在です。",
    "あなたの体は、一度も感謝を求めることなく、人生のあらゆる瞬間を支えてきました。心臓の上に手を置き、鼓動を感じてください——何十億回もあなたのために打ってきました。ノートに、めったに感謝しない体がしてくれている五つのことを書いてください。そして今日、体に優しいことをひとつしてください。ゆっくりストレッチする、意識を込めて水を飲む、疲れたら休む。体はスピリチュアルな生活の障害ではありません。それは乗り物です。",
    "私たちは皆、自分が誰かについての物語を持っています——自分の価値、限界、未来についての物語。今日、最もよく自分に語る物語を書いてください。ゆっくり読み返してください。それは本当ですか？優しいですか？最も賢い自分が語る物語ですか？新しいバージョンを書いてください。空想ではなく、あなたの全潜在能力を尊重するバージョンを。現実を書き換えるのではありません。どの物語にエネルギーを注ぐかを選んでいるのです。",
    "朝の始め方が一日全体の質感を形作ります。今日、シンプルな朝の儀式をデザインしてください——たった十分でも。感謝の瞬間、三回の深い呼吸、一日への静かな意図、あるいは心を養う何かを読むこと。この儀式をノートに書いてください。明日、実践してください。聖なる朝に宗教は必要ありません。注意が必要なのです。",
    "豊かさは循環です。流れ込み、流れ出さなければなりません。今日、寛大さとの関係を振り返ってください。最後に見返りを期待せずに与えたのはいつですか？ノートに今週の与える行為をひとつ計画してください。お金である必要はありません——時間、十分な注意、優しい言葉——これらは心の通貨です。与えることがどんな気持ちにさせるか注意してください。欠乏はしがみつきます。豊かさは流れます。",
    "ノーと言うことは、最も深い自己愛の行為のひとつです。今日、心がノーと囁くのにイエスと言っている場所を正直に振り返ってください。誰があなたのエネルギーを奪っていますか？どんな義務が空虚に感じますか？ノートに設定する必要がある境界線をひとつ書いてください。声に出して練習してください。いいえ、それで大丈夫です。あなたの平和は交渉の対象ではありません。本心でないイエスは、自分へのノーです。",
    "今日の実践は坐禅の場を離れます。ゆっくりと意図的な散歩に出かけてください——十分でも。一歩一歩を感じてください。かかとが地面に触れる感触、足裏のロール、つま先の押し出し。肌に当たる空気を感じてください。名前をつけずに世界の音を聴いてください。歩く瞑想は、マインドフルネスが特別な瞬間に行うものではないことを教えてくれます。すべての瞬間をそう生きることができるのです。",
    "呼吸は、常にあなたと共にあり、常に今この瞬間にある唯一のものです。今日、意識的な呼吸を三回実践してください。朝、昼、就寝前に。毎回、ゆっくりと五回呼吸してください。四つ数えて吸い、二つ保持し、六つで吐く。ノートに、各実践で心の状態がどう変わったかを書いてください。呼吸はあらゆる嵐の中のあなたの錨です。",
    "一日目にあなたは感謝していることをリストアップしました。今日はさらに深く入ります。そのひとつを選び、五分間じっと座ってください。目を閉じ、感謝を本当に感じてください——思考としてではなく、体の感覚として。どこで感じますか？どんな感じですか？ノートに感謝の身体的体験を描写してください。感謝が心から体に移ると、変容的になります。",
    "すべては変わります。天気、気分、体の細胞、人生の人々。今日、静かに座り、無常について振り返ってください——悲しみではなく、畏敬の念を持って。ノートに、かつてしがみついていたけれど過ぎ去ったものについて書いてください。人生は続きましたか？生き延びましたか？無常は敵ではありません。それへの抵抗が敵なのです。何も永遠には続かないと受け入れるとき、今ここにあるものを大切にすることを学びます。",
    "私たちの中には影が生きています——隠し、否定し、拒絶する部分。今日、優しくそれに出会いましょう。ノートに、他人の中で深くイライラする特質について書いてください。そして問いかけてください。この特質は自分のどこに生きているだろうか？シャドーワークは恥じることではありません。全体性を取り戻すことです。自分の一部を追放しながら、最も完全な自分にはなれません。",
    "赦しは相手のためではありません。あなたが背負っている重荷を下ろすことです。今日、まだ赦していない誰か——おそらく自分自身を思い浮かべてください。ノートに書いてください。私はまだ何を握りしめているのか？それを置いたらどんな気持ちだろう？今日赦す必要はありません。ただ問いかけてください。傷の縁を感じてください。癒しは解決からではなく、正直に見つめることから始まります。",
    "今日、天気を確認するように自分をチェックしてください。今、自分の内側の感情的な気候はどうですか？曇り？嵐？晴れ？変えようとせず名前をつけてください。ノートに今日三回、感情の天気予報を書いてください。朝、午後、夜。感情が天気のようなものであることに気づいてください——動き、変わり、決して永遠ではない。あなたは雲ではなく、空なのです。",
    "常にもっと欲しがる心は、決して休めない心です。今日、欲望が生じるのに気づいてください——食べ物、承認、モノ、別の場所にいたいこと。気づくたびに立ち止まり、問いかけてください。この欲望の下にある欲望は何か？ノートにひとつの欲望をその根まで辿ってください。多くの場合、欲しいと思っているものは、もっと深いものの代理です。安全、愛、帰属感。",
    "成長は物事が簡単なときではなく、困難なものと共に留まることを学ぶときに起こります。今日、七分間の瞑想をしてください。不快が生じたら——かゆみ、落ち着かない思考、退屈——動かないでください。ただ観察してください。その質感、強さ、変化に気づいてください。ノートに体験を描写してください。静寂の中で不快と共に座ることを学ぶことは、人生で不快と共に座ることを学ぶことです。",
    "私たちの中には批判し、恥じ、小さくする内なる声があります。今日、その声に耳を傾けてください。聞こえたら、ノートに正確に言っていることを書いてください。そして問いかけてください。この声は本当は誰の声だろう？親？先生？文化？最も賢く、最も愛情深い自分からの返答を書いてください。内なる批判者はあなたの敵ではありません。戦いではなく、思いやりを必要としているあなたの怯えた部分です。",
    "今日、消費するすべてのものに注意を払ってください。食べ物、メディア、会話、買い物。消費の行為の前に立ち止まり問いかけてください。これは私を養うか、消耗させるか？今夜ノートに二つのリストを作ってください。今日養われたものと消耗させたもの。これは制限ではありません。意識を持って選ぶことです。消費するものが内なる生活の素材になります。",
    "静かに座り、愛する人を思い浮かべてください。心の中でこの言葉を贈ってください。あなたが幸せでありますように。健康でありますように。安全でありますように。安らかに暮らせますように。この贈り物の温かさを感じてください。次に同じ言葉を自分に向けてください。そして見知らぬ人に。そして困難な人に。ノートに簡単だったところと難しかったところを書いてください。この実践は心を思いやりに向けて書き換えます。",
    "ほとんどの苦しみは、現在ではなく過去や未来に生きることから来ます。今日、心がどれくらい頻繁に「今」を離れるか気づいてください。昨日を再生していますか？明日のリハーサルをしていますか？気づくたびに、目の前にあることに優しく戻ってください。ノートに時間との関係について書いてください。十分にあると感じますか？時間はどこで消えるように思えますか？",
    "横になるか楽な姿勢で座ってください。頭のてっぺんから始めて、ゆっくりと体中に注意を向けてください。額、目、顎、首、肩、腕、手、胸、腹、腰、脚、足。各部分で判断なしに感覚に気づいてください。緊張はどこにありますか？楽なところは？何もないところは？約十分かかります。ノートに見つけたことを描いてください。体は心が忘れようとするものを保持しています。",
    "恐れはコンフォートゾーンの番人です。今日、現在恐れていることについて書いてください。そして三回自問してください。この下に本当に恐れているものは何か？答えのたびに深くなります。表面の恐れは本当の恐れであることはまれです。根元では、ほとんどの恐れはいくつかの普遍的なテーマに還元されます。孤独、無価値、制御の喪失、存在の消滅。根を名前をつけてください。名前をつけると力を失います。",
    "非執着は気にしないことではありません。物事——人、結果、所有物、意見——を握りしめた拳ではなく開いた手で持つことです。今日、きつく握りしめているものをひとつ選んでください。期待、計画、恨み。ノートにあなたが握りしめているものと、その握りを緩めたらどんな感じがするかを書いてください。手放すのではなく、ただもっと優しく持つだけ。",
    "刺激と反応の間に空間があります。その空間にあなたの力があります。今日、「間（ま）」を実践してください。今日三回、何かに反応する前に——メール、コメント、衝動——三回の呼吸分立ち止まってください。そして応答してください。ノートにその間で何が起きたかを書いてください。何に気づきましたか？間がなければ何をしていましたか？この小さな空間にあなたの自由が生きています。",
    "これは高度な感謝の実践です。今日、困難な経験を思い浮かべてください——痛みを軽視するためではなく、それが教えてくれたことを探すために。どんな強さを築きましたか？どんな知恵を提供しましたか？どんな思いやりを開きましたか？ノートに困難への感謝の手紙を書いてください。これは有害なポジティブ思考ではありません。苦しみもまた師になり得るという正直な認識です。",
    "何も孤立しては存在しません。あなたの皿の食べ物は無数の手を通り過ぎました。あなたが吸う空気は、雨を飲む木々が吐き出したものです。今日、ひとつの普通のもの——朝のコーヒー、シャツ、水——をそれを届けたすべての命とプロセスまで辿ってください。ノートにこの連鎖を書いてください。すべてがつながっていると見えるとき、孤独は不可能になり、感謝は必然になります。",
    "今日、出会うすべての人を見て、心の中で認めてください。この人は苦しんだことがある。この人は私と同じように喪失、恐れ、孤独を知っている。何も言う必要はありません。ただこの認識があなたのまなざしを柔らかくするのを感じてください。今夜ノートに、これが一日をどう変えたか書いてください。思いやりは同情ではありません。共有された人間性の認識です。",
    "今日話す前に、三つの質問で立ち止まってください。それは真実か？それは親切か？それは必要か？三つすべてを通らなければ、手放してください。今夜ノートに気づいたことを書いてください。あなたの言葉のどれくらいが習慣的でしたか？どれくらいが反射的でしたか？本当に必要だったのはどれくらいですか？言葉は中立ではありません——私たちが住む世界を創ります。",
    "今日、ひとりの人にあなたの完全で途切れない注意を向けてください。電話なし、心のさまよいなし。彼らが言っていることが世界で最も重要なことであるかのように聴いてください。十分に見つめてください。終わったら、応答する前に間を置いてください。ノートにその体験を書いてください。存在は、あなたが他の人に贈れる最も寛大な贈り物です。",
    "今日、生活を簡素にすることをひとつしてください。引き出しひとつを整理する、サブスクリプションをひとつ解約する、約束をひとつ断る。簡素さは欠乏ではありません——大切なことから気をそらすすべてを取り除くことです。ノートに何を簡素にしたか、どう感じたかを書いてください。手放すすべての所有物、約束、気晴らしが、本当に養うもののための空間を生み出します。",
    "この古代の実践は、痛みとの関わり方を変容させます。静かに座ってください。吸う息で、知っている人の苦しみを吸い込むことを想像してください——彼らの悲しみ、恐れ、混乱を。吐く息で、安らぎ、愛、平和を彼らに向けて吐き出してください。一人から始めてください。ノートに体験を書いてください。トンレンは苦しみから逃げる必要がないことを教えてくれます。思いやりの錬金術で変容させることができるのです。",
    "今日、できるだけ長くスクリーンから離れてください。SNSなし、ニュースなし、無意識のスクロールなし。丸一日が無理なら、四時間を選んでください。その空間に何が生じるか注意してください。落ち着きのなさ？安堵？退屈？創造性？ノートに体験を記録してください。デバイスは洞察が育つかもしれないあらゆる隙間を埋めます。最も根本的なことは、埋まっていない空間を作ることです。",
    "平静は、快い経験も不快な経験も前にバランスを保つ能力です。今日、良いことが起きたら、しがみつかずに気づいてください。不快なことが起きたら、嫌悪せずに気づいてください。同じ安定した気づきで両方を観察してください。ノートにしがみつきと嫌悪の瞬間を書いてください。平静は無関心ではありません——関与した、思いやりのあるバランスです。",
    "今日、誰にも言わず、認められることを期待せず、誰かに親切なことをしてください。小さなことでいい。見知らぬ人のコーヒーを払う、励ましのメモを残す、困っている人を静かに助ける。誰にも言わないでください。ノートだけに書いてください。認識を求める奉仕はパフォーマンスです。見えないままの奉仕は実践です。",
    "これは病的ではありません——観想的伝統で最も明確にする実践のひとつです。静かに座り、認めてください。いつかこの体は止まる。これは脅しではありません。今日に緊急性と美しさを与える事実です。ノートに書いてください。あと一年しかなかったら、何をやめますか？何を始めますか？誰に電話しますか？死の意識は人生を減じません。照らすのです。",
    "今日、屋外で過ごしてください——十五分でも。音楽やポッドキャストを聴かないでください。ただ自然の中にいてください。木が急がずに育つ様子に気づいてください。水が障害物と戦わずに流れる様子。季節が抵抗なく変わる様子。ノートに今日自然が教えてくれたレッスンをひとつ書いてください。スピリチュアルな師を遠くに探す必要はありません。地球は何十億年も知恵を実践してきました。",
    "極端な努力は疲弊させます。極端な怠惰は停滞させます。今日、極端に傾きがちなところを振り返ってください。働きすぎか回避か、与えすぎか引きこもりか、耽溺か欠乏か。中道は凡庸ではありません——バランスの取れた努力の鋭い刃です。ノートにバランスに向かえる分野をひとつ特定してください。知恵は極端にではなく、その間の空間に生きています。",
    "あなたが今後悔している決断を思い出してください。そして考えてください。そのときの情報、成熟、感情的なリソースで、本当に違うことができたでしょうか？おそらくできなかった。ノートに、その決断をした自分に手紙を書いてください。判断ではなく理解を贈ってください。持っているもので精一杯やった。それは罰ではなく、思いやりに値します。",
    "私たちは事実と間違えるほど深い信念を持っています。「私は十分ではない」「世界は安全ではない」「私は愛に値しない」。今日、あなたの人生を動かしている三つの信念を書いてください。それぞれに問いかけてください。いつ初めてこれを学んだか？絶対に真実か？この信念なしに誰になるか？ノートに置き換えを書いてください——反対ではなく、より完全な真実を。",
    "目的は到着する目的地ではなく、歩く方向です。今日、時間を忘れさせるもの、世界について心を痛めるもの、お金が関係なければ何をするかを振り返ってください。ノートにこの三つが重なるところを探してください。今日目的を見つける必要はありません。ただ、目的がすでに静かにあなたの人生に生きているかもしれない場所に気づいてください。",
    "欠乏は囁きます。十分ではないと。豊かさは答えます。もっとあるところから来ていると。今日、お金、時間、愛、機会についての欠乏思考に気づいてください。毎回、優しく豊かさの真実に置き換えてください。ノートに欠乏の思考とその豊かさの対応を追跡してください。これは現実を無視することではありません。恐れをすべてを見るレンズにすることを拒否することです。",
    "今日、「観察者」になる実践をしてください。映画のキャラクターを見ているかのように自分を観察しながら一日を過ごしてください。食べる自分、話す自分、反応する自分、感じる自分を見てください。キャラクターを判断しないでください。ただ観察してください。ノートに観察者が気づいたがキャラクターが見逃したであろうことを書いてください。この実践はあなたと経験の間の空間を明らかにします。その空間に自由があります。",
    "ノートにお金がかからない寛大さの十の方法をリストアップしてください。時間、スキル、聴く耳、褒め言葉、忍耐、知識の共有、感謝の手紙、存在感を持ってドアを押さえること、誰かのために料理すること、心の負債を許すこと。三つ選んで今日実践してください。本当の豊かさは持っているもので測るのではなく、自由に与えるもので測ります。",
    "十分間座ってください。対象に集中するのではなく、思考の間の空間に休んでください。思考が来たら、溶けさせ、次の思考が来る前の隙間に気づいてください。その隙間に休んでください。最初は短いかもしれません——純粋な気づきの半秒。その隙間は無ではありません。すべての基盤です。ノートに体験を描写してください。たとえ何も起きなかったように感じても。何もないことが時に最も深い何かです。",
    "あなたの十の最も重要な価値観をリストアップしてください。あるべきだと思うものではなく、実際にあなたの選択を動かしているもの。今、先週の時間の使い方を見てください。価値観と時間の間にどれくらいの整合性がありますか？ノートにギャップについて書いてください。価値観と合わない生き方をすると、すべてを持っていても空虚に感じます。整合性が意味のある人生への静かな秘訣です。",
    "ブッダは、痛みは避けられないが苦しみは選択だと教えました。最初の矢はあなたに起こること。第二の矢はそれについて語る物語です。なぜ私に、いつもこうなる、耐えられない。今日、不快なことが起きたら、最初の矢に気づき、第二の矢を見張ってください。ノートに両方の矢を描写してください。最初の矢を受けて第二の矢を放たずにいられますか？これが不必要な苦しみからの自由への道です。",
    "目を閉じ、一年後の人生を想像してください。最も深い価値観と完全に合致した人生を。詳細に見てください。どこにいるか、朝がどう展開するか、仕事がどう見えるか、人間関係がどう感じるか、内なる状態はどうか。この想像に十分間費やしてください。ノートに鮮明に描写してください。視覚化は空想ではありません。見えないものを見えるようにする実践です。",
    "今日、何かに強く反応する瞬間に注意を払ってください——怒り、防御、傷つき。反応に従わず、立ち止まり、好奇心を持って調べてください。体のどこで感じましたか？何がトリガーでしたか？どんな古い傷とつながりますか？ノートにひとつの反応的な瞬間を詳しく描いてください。反応性は無意識の過去が現在を乗っ取ることです。気づきがその連鎖を断ち切ります。",
    "受容は承認を意味しません。現実と戦争することなく、あるがままを認めることです。今日、抵抗してきた状況をひとつ選んでください。それと共に座り、言ってください。今はこうなのだ。永遠にではない。ただ今。ノートに受容と諦めの違いについて書いてください。抵抗は疲弊させます。受容はエネルギーを解放し、唯一重要な問いに向けます。今、何ができるか？",
    "感謝、思いやり、忍耐を実践します。しかし喜びを実践することはどれくらいありますか？今日、意図的に三つの喜びの瞬間を作ってください。心を動かす曲を聴く、夕暮れの光の変化を見る、完全な注意を込めて一口を味わう。ノートに各瞬間を描写してください。喜びは軽薄ではありません。観想的伝統では、霊的成熟のしるしとされています——普通のものに感動する能力。",
    "生計の立て方はスピリチュアルな実践です。今日、仕事について正直に振り返ってください。他者の幸せに貢献していますか？価値観と合致していますか？才能を表現できていますか？ノートに、仕事をもっと合致させるために何を変える必要があるかを書いてください。仕事を辞める必要はありません。正しい生計は時に、肩書きの変更ではなく、意図の変化から始まります。",
    "すべての親密な関係は鏡であり、そうでなければ見えない自分の部分を映し返します。今日、重要な関係をひとつ選び問いかけてください。この人は私に何を映し返しているか？自分の中に眠っている何を賞賛しているか？自分で受け入れていない何にイライラしているか？ノートにこの鏡を正直に探求してください。最も近い人々が最も強力な——そして最も不快な——師です。",
    "初心者の心には多くの可能性があります。専門家の心にはほとんどありません。今日、馴染みのある活動ひとつに——歯を磨く、コーヒーを入れる、通勤——まるで初めて体験するかのように向き合ってください。すべてに気づいてください。ノートに発見したことを書いてください。何かを知っていると思うとき、それを見ることをやめます。初心はルーティンの盲目への解毒剤です。",
    "今日は勇気が必要です。ノートに三つのリストを作ってください。今年誇りに思うこと。避けていること。自分に言っていない真実。容赦なく正直に——このノートはあなただけのものです。書いたものを何も直そうとせずに座ってください。最も変容的なことは、ひるむことなく自分の人生を明確に見ることです。明確さは常に意味のある変化に先立ちます。",
    "人生のすべてはエネルギーを与えるか奪うかのどちらかです。今日、ノートにあなたにエネルギーを与える人、活動、環境、習慣、約束と、消耗させるものをリストアップしてください。正直に。消耗させるもののひとつを減らすか手放す意志があるものに丸をつけ、エネルギーを与えるもののひとつを増やす意志があるものに丸をつけてください。あなたのエネルギーは有限で神聖です。",
    "人生には喜びと悲しみの両方が含まれ、しばしば同時に。美しい夕日はいなくなった人を思い出させます。子供の笑い声は苦しみを含む世界に存在します。今日、十分間座り、喜びと悲しみの両方を一度に抱いてください。選ばないでください。両方を抱いてください。ノートに体験を書いてください。矛盾を抱ける心が、本当に目覚めた心です。",
    "今日の実践は「十分」について。ノートに書いてください。何があれば十分か？その答えを持ったとき、すでにそれをどれだけ持っているか見てください。十分であることは制限ではなく、解放です。常にもっとを追い求めることから自由になること。今日、一瞬一瞬にこう問いかけてください。これは十分か？答えはしばしば、はい。",
    "今日、自分を完全に表現してください。考えを検閲したり、期待に合わせたりしないでください。会話で本当のことを言ってください。着たいものを着てください。感じていることを感じてください。ノートに、本当の自分を表現した瞬間と、それを抑えた瞬間を書いてください。本当の自己表現は完璧ではありません。正直であることです。",
    "赦しの儀式の時間です。赦す必要がある人のリストを作ってください——自分を含めて。各人に対して、心の中でこう言ってください。あなたを赦します。私を自由にします。実際に赦しを感じる必要はありません——意図で十分です。ノートに体験を書いてください。赦しは相手への贈り物ではありません。重荷を下ろす自分への贈り物です。",
    "今日、すべての会話にマインドフルネスを持ち込んでください。話す前に一呼吸。聴くとき完全に存在する。反応ではなく応答する。ノートに今日の三つの会話を書いてください。どこでマインドフルでしたか？どこで自動的でしたか？マインドフルな対話は単なるコミュニケーション技術ではありません。思いやりの実践です。",
    "今日、知っていることをひとつ教えてください。友人にスキルを教える、同僚に洞察を共有する、子供に何かを説明する。教えることは学びの最も深い形です。ノートに何を教えたか、そしてそのプロセスで何を学んだかを書いてください。知識は共有されるとき成長します。握りしめると萎縮します。",
    "目を閉じ、人生の終わりを想像してください。怖がらせるためではなく、明確にするために。何を成し遂げたかではなく、人々にどう感じさせたかで覚えられたいですか？ノートに自分の弔辞を書いてください——今のものではなく、望むものを。どんな資質があなたを定義しますか？どんな影響を残しましたか？今日、その人に向かって何ができますか？",
    "慈悲の瞑想の上級版。今日は完全な範囲に拡げてください。自分、愛する人、友人、中立な人、困難な人、そしてすべての存在にフレーズを贈ってください。各二分間。幸せでありますように。健康でありますように。安全でありますように。安らかに暮らせますように。ノートに心が開いたところと抵抗したところを書いてください。",
    "ノートにこの質問に答えてください。明日すべての物質的なものを失ったら、何が残りますか？奪えない豊かさについて書いてください。知恵、愛する能力、回復力、人間関係、やり直す力。これらがあなたの本当の資産です。今日、そのひとつに投資してください。愛する人に電話する。何かを学ぶ。感謝の中に座る。本当の豊かさは心の中で複利で増えます。",
    "今日、完全な孤独の中で三十分を過ごしてください。電話なし、本なし、音楽なし。ただあなただけ。快適な場所に座り、ただ存在してください。正式な瞑想をしないでください。刺激や予定なしにただ存在してください。ノートに何が生じたかを書いてください。多くの人にとって孤独は怖い。自分を避けるために使うすべての気晴らしを剥ぎ取るからです。",
    "過去八十日間、特定のエクササイズを実践してきました。今日、すべてが実践であることを認識してください。朝食を作ることは実践。運転は実践。意見の相違は実践。夕日は実践。ノートに今日の三つの普通の瞬間を描写し、それぞれが実践として何を提供したかを特定してください。すべてが実践になるとき、スピリチュアルと日常の間に区別はありません。",
    "仏教の伝統で菩薩とは、自分だけでなくすべての存在のために覚りを求める者です。今日、静かに座り、あなた自身のこの誓いを立ててください。宗教としてではなく、意図として。ノートに書いてください。すべての存在に何を願うか？覚りが他者に仕えるために何を実践するか？自分だけに仕えるスピリチュアルな成長はやがて牢獄になります。すべてに仕える成長が解放になります。",
    "一日目から今日までのノートを読み返してください。判断なしに。筆跡がどう変わったか、洞察がどう深まったか、テーマがどう進化したかに気づいてください。今日のノートに、この旅を始めた自分について書いてください。その人に何を言いますか？その勇気の何に感謝しますか？あなたは始めた人と同じではありません。あなたがいた人と、なりつつある人の両方を敬ってください。",
    "静かに座りこう考えてください。あなたは自分自身を創らなかった。体は土壌で育った食物から作られ、雨に養われ、太陽にエネルギーを得た。心はあなたに話したすべての人、読んだすべての本、生き延びたすべての経験によって形作られた。あなたは宇宙全体とこの特定の瞬間の協力作品です。ノートに相互依存が生き方にとって何を意味するか書いてください。",
    "スピリチュアルな成長のパラドックス。ここまで導いた道は最終的に手放さなければなりません。実践、概念、探求者としてのアイデンティティ——これらは筏であり目的地ではありません。今日、この旅自体にしがみついているかもしれないものを振り返ってください。ノートに探求してください。成長と呼ぶ必要なしに成長し続けられるか？月を指す指は月ではない。",
    "今日、快適さを少し超えて根本的に寛大であってください。簡単に感じる以上を与えてください——時間、お金、エネルギー、脆弱性を。害になるほどではなく、伸びを感じるほどに。ノートに何を与えたか、それが何を呼び起こしたかを書いてください。寛大さは筋肉です。すべての筋肉と同じく、馴染みの範囲を超えて押すときにのみ成長します。",
    "あなたの中には、物語、痛み、名前、歴史に触れられたことのない場所があります。それは回転する世界の中心の静寂の点です。今日、十五分間座りそれを探してください。努力ではなく明け渡しで。すべてを落とさせてください——思考、感情、アイデンティティ——そして残るものに休んでください。ノートに見つけたものを書いてください。何もなくても。特に何もなければ。",
    "九十日間マントラを提供されてきました。今日、あなた自身のものを書いてください。静かに座り自問してください。私の魂が今最も聴く必要があるのは何か？浮かんだものを書き、骨に真実と感じるまで磨いてください。三回声に出して唱えてください。ノートにマントラとなぜこの言葉を選んだかを書いてください。これからはあなたのものです。知恵は常にあった場所から来ました。内なるところから。",
    "到着しました。九十日間の現れ、不快と共に座ること、難しい質問をすること、自分に思いやりを贈ること。ノートにこの旅について自由に書いてください。何が驚きましたか？何が変わりましたか？何が未解決のままですか？何を持ち続けますか？内なる生活からの卒業はありません——より深い実践があるだけです。今日、認めてください。ほとんどの人が決してしないことをしました。内を見つめ、留まりました。",
    "九十日目は終わりではありません。始まりです。今日、ノートに人生の次の季節のための実践をデザインしてください。これら九十日間から何を残しますか？どんな新しい実践があなたを呼んでいますか？ガイド付きの構造なしにどう成長し続けますか？補助輪は今日外れます。しかし道は続きます。必要なものはすべて持っています。いつも持っていました。旅はただ思い出す手助けをしただけです。",
    "今日、あなたを形作った誰かに感謝の手紙を書いてください。まだ送らないでください。何も控えずに完全に書いてください。彼らが知らないかもしれない特定の瞬間、言葉、贈り物に感謝してください。ノートに、表現された感謝がどう生きた遺産になるか振り返ってください。他者が与えてくれたものに名前をつけるとき、贈り手と受け手の両方を祝福する円が完成します。",
    "今日、完全な意識ですべての金銭的取引を追跡してください。各購入の前に立ち止まり問いかけてください。これは私の価値観を反映しているか？各取引の後、どう感じるか気づいてください。ノートに一日を振り返ってください。お金は結晶化した生命エネルギーです。無意識に使うとき活力が漏れます。意識を持って使うとき、すべての取引が実践になります。",
    "今日、信頼する人に本当のことを共有してください。夢、恐れ、不完全な真実。承認のためではなく、本当に見てもらう実践として。ノートに体験を書いてください。脆弱性は体でどう感じましたか？本当の自分を見せたとき何が起きましたか？私たちは自分のバージョンをキュレーションするのに多くのエネルギーを費やします。本当の帰属には、ありのままで現れる勇気が必要です。",
    "構造化された九十日の旅は終わりに近づいていますが、実践は続きます。今日、あなた自身の日常的なスピリチュアルな実践をデザインしてください。最も役に立ったものから選んでください。瞑想、ジャーナリング、感謝、慈悲の瞑想、呼吸法、歩く瞑想、または全く新しいもの。いつ、どこで、どれくらいの時間かを詳しく書いてください。持続できるほどシンプルに保ってください。",
    "今日、すべての普通の瞬間を聖なるものとして扱ってください。皿を洗うことが瞑想になります。食べることが儀式になります。歩くことが巡礼になります。話すことが祈りになります。スピリチュアルと日常の間に境界線はありません。ノートに今日聖なるものにした三つの普通の瞬間を描写してください。すべてが実践になるとき、どこにも行く必要がなかったと気づきます。",
    "今日、三つの意図的な優しさの行為をしてください。自分へひとつ、親しい人へひとつ、見知らぬ人へひとつ。各々を具体的で意図的にしてください。自分へは休息、栄養、美しさ。親しい人へは手紙、時間の贈り物、心からの褒め言葉。見知らぬ人へは認識されない寛大さ。ノートに三つすべてについて書いてください。優しさは贅沢ではありません。最も実用的なスピリチュアルな実践です。",
    "今日、あなたの人生を通して豊かさが流れたすべての方法を振り返ってください。お金だけでなく、愛、機会、学び、美しさ、健康、友情。ノートに豊かさの棚卸しをしてください。少なくとも二十項目。そして問いかけてください。私は水路か、それともダムか？豊かさは自由に動くことを許す人が最も繁栄します。寛大に受け取り、寛大に与える。",
    "今日は統合のためです。二十分間静かに座り、過去八十七日間を骨に染み込ませてください。要約も分析もしないでください。ただすべてと共に座ってください。そしてノートに自由に書いてください。計画せずに手を動かしてください。テストではありません。達成すべきものはありません。植えられたものが自分の表現を見つけるのを許してください。プロセスを信頼してください。自分を信頼してください。",
    "今日、親しい友人に向けるのと同じ優しさで自分を見つめてください。あなたはほぼ九十日間、より存在し、より思いやりを持ち、より気づきを深めることを学んできました。ノートに自分への愛の手紙を書いてください——達成したことについてではなく、あなたが誰であるかについて。改善されたバージョンではなく、ずっとそこにいたバージョン。騒音の下に隠れていた存在を。これはセルフラブの終わりではありません。それがいつも始まりだったと気づく瞬間です。",
    "静かに座り、この旅全体を思い浮かべてください。困難な日々、突破の瞬間、実践したくなかったけれどした日々、驚きと沈黙。すべてを祝福してください。この旅が教えてくれたことに感謝してください。そして優しく解放してください。経験にしがみつく必要はありません。それは今、あなたの一部です。ノートに祝福と解放を書いてください。完成はそれ自体の始まりです。",
    "九十日目。ほとんどの人が始めない道を歩きました。目をそらす方が簡単だったのに内を見つめました。不快と共に座り、自分に思いやりを贈り、信念を検証し、寛大さを実践し、成長する勇気を持ちました。この旅に卒業はありません——継続だけがあります。道はここで終わりません。開きます。ノートに次の章への意図を書いてください。準備はできています。いつもできていました。",
  ],
  m: [
    "私は、すでに私を取り巻く豊かさに感謝します。",
    "私は完全にここに、完全に生きて、この瞬間にいます。",
    "私はありのままの自分を無条件に愛します。",
    "私はあらゆる形の豊かさに値します。",
    "私は勇気と優雅さで自分の限界を超えて広がります。",
    "静寂の中に、探し求めていた答えを見つけます。",
    "私の体は神聖であり、敬意を持って扱います。",
    "私は自分の物語の著者であり、愛を込めて書くことを選びます。",
    "毎朝は、新たに始めるための聖なる招待です。",
    "自由に与えるとき、豊かさは私に流れ戻ります。",
    "愛ある境界線を設けることで、自分のニーズを尊重します。",
    "私が踏む一歩一歩が、存在の祈りです。",
    "呼吸が内なる平和と私をつなぎます。",
    "感謝は単なる思考ではありません。在り方です。",
    "私は万物の本質として変化を受け入れます。",
    "思いやりを持って自分のすべての部分を受け入れます。",
    "もはや平和に役立たないものを解放します。",
    "判断ではなく思いやりを持って感情を観察します。",
    "私は十分に持っています。私は十分です。この瞬間で十分です。",
    "困難なものと共に座れるほど、私は強いです。",
    "私にふさわしい優しさで自分に語りかけます。",
    "体、心、魂を意図を持って養うことを選びます。",
    "すべての存在が幸せで、健康で、安全で、平和でありますように。",
    "私は人生のタイミングを信頼します。",
    "体が持つ知恵に耳を傾けます。",
    "回避ではなく好奇心を持って恐れに向き合います。",
    "人生を開いた手と開いた心で優しく抱きます。",
    "間の中に、選ぶ力を見つけます。",
    "困難の中にも、知恵の種を見つけます。",
    "私はすべての命の織物に織り込まれています。",
    "出会うすべての人が、私の知らない戦いを闘っています。",
    "真実、優しさ、意図を持って話します。",
    "十分な注意は、私が贈れる最大の贈り物です。",
    "本当に大切なもののための空間を創ります。",
    "苦しみを抱え、愛に変容させる勇気を持っています。",
    "通知は私ではありません。その背後にある気づきが私です。",
    "喜びも困難も、安定した心で迎えます。",
    "認められるためではなく、与えることが私の本質だから奉仕します。",
    "この命は有限だから、あらゆる瞬間が貴重です。",
    "自然は私に忍耐、回復力、明け渡しを教えます。",
    "優雅さと気づきを持ってバランスの道を歩みます。",
    "知らなかったことを知らなかった過去の自分を赦します。",
    "私を制限する信念を解放し、自由にする真実を受け入れます。",
    "心で聴くとき、私の目的が姿を現します。",
    "宇宙は寛大であり、私は受け取ることに開かれています。",
    "私は思考ではありません。それらを観察する気づきです。",
    "数えられないほど豊かです。",
    "空の中に、存在の充満を見つけます。",
    "本当に大切なことと調和して生きます。",
    "痛みに物語を加えずに感じます。",
    "最高の人生を明確に見て、毎日それに向かって進みます。",
    "古い傷からではなく、存在から応答します。",
    "あるがままを受け入れ、次に来るものを形作る力を信頼します。",
    "深く、複雑でない喜びを経験する許可を自分に与えます。",
    "私の仕事は、最も深い価値観の表現です。",
    "私の人間関係は、学ぶ準備ができたことを教えてくれます。",
    "新鮮な目と開いた心でそれぞれの瞬間に向き合います。",
    "自分の人生を明確に見る勇気を持っています。",
    "エネルギーを守り、賢く投資します。",
    "喜びと悲しみの両方を安定した心で抱きます。",
    "十分であることの豊かさに安らぎます。",
    "本当の自分を表現する自由を自分に許します。",
    "赦しは、自分を重荷から解放する贈り物です。",
    "すべての会話に思いやりの気づきを持ち込みます。",
    "学んだことを分かち合うとき、理解は深まります。",
    "残したい遺産への貢献として毎日を生きます。",
    "私の思いやりに境界はありません。",
    "すべてが剥ぎ取られたとき残るもので、本当の豊かさを測ります。",
    "自分自身の存在の中で安らいでいます。",
    "すべての瞬間が気づきを実践する機会です。",
    "私の成長は私だけでなく、すべての存在に仕えます。",
    "ここに導いたすべての自分を敬います。",
    "私は宇宙とこの瞬間の協力作品です。",
    "道を解放し、開かれた道を信頼します。",
    "大胆に与え、与えることで豊かさを発見します。",
    "すべての中心に、平和があります。",
    "内に生きる知恵を信頼します。",
    "目覚めています。感謝しています。続けます。",
    "旅は終わりません。開いた心で歩み続けます。",
    "私の感謝は、私を形作った人々への贈り物です。",
    "すべての金銭的選択は、最も深い価値観の表現です。",
    "本当の自分を見せ、その脆弱性の中につながりを見つけます。",
    "毎日自分を養う実践をデザインします。",
    "すべての普通の瞬間が、その中に聖なるものを宿しています。",
    "私の優しさは波紋のように広がり、平和となって戻ります。",
    "世界を祝福するために豊かさが流れる寛大な水路です。",
    "学んだすべてが今、私の中に生きていることを信頼します。",
    "自分に今与えている愛に、いつも値する存在でした。",
    "この旅を祝福し、開いた心で解放します。",
    "私は完全であり、始まったばかりです。",
  ]
};

function getDayData(dayNum, user) {
  var d = DAYS[dayNum - 1] || DAYS[0];
  var lang = (user && user.lang) || "en";
  if (lang === "ja" && JA_DAYS && JA_DAYS.t[dayNum - 1]) {
    return { day: dayNum, category: d.c, title: JA_DAYS.t[dayNum - 1], instruction: JA_DAYS.i[dayNum - 1], mantra: JA_DAYS.m[dayNum - 1] };
  }
  return { day: dayNum, category: d.c, title: d.t, instruction: d.i, mantra: d.m };
}

var F = "'Cormorant Garamond', serif";
var B = "'Nunito Sans', sans-serif";
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
  var illusType = (DAY_ILLUS && DAY_ILLUS[dayNum - 1] !== undefined) ? DAY_ILLUS[dayNum - 1] : dayNum % 20;
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
  var submit = async function() {
    setErr("");
    if (!email || !pw) { setErr(t({lang:lang}, "fillAll")); return; }
    if (mode === "signup" && !name) { setErr(t({lang:lang}, "enterName")); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        var ud = await api.signup(email, name, pw, lang);
        props.onLogin(ud);
      } else {
        var ud2 = await api.login(email, pw);
        props.onLogin(ud2);
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
    <div style={{ height: "100vh", background: "#f5f0e8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{CSS}</style>
      <Logo size={80} />
      <h1 style={{ fontFamily: F, fontWeight: 300, fontSize: 34, color: "#4a3f33", letterSpacing: 8, margin: "10px 0 2px" }}>LUMINA</h1>
      <p style={{ fontFamily: B, fontSize: 12, color: "#8a7e6e", letterSpacing: 2, marginBottom: 28 }}>{t(L, "subtitle")}</p>
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 380, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", marginBottom: 20, borderRadius: 10, overflow: "hidden", border: "1px solid #e0d8ce" }}>
          {["login", "signup"].map(function(m) {
            return <button key={m} onClick={function() { setMode(m); setErr(""); }} style={{ flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontFamily: B, fontSize: 13, fontWeight: 700, letterSpacing: 1, background: mode === m ? "#4a3f33" : "#fff", color: mode === m ? "#fff" : "#8a7e6e" }}>{m === "login" ? t(L, "signIn") : t(L, "signUp")}</button>;
          })}
        </div>
        {mode === "signup" && <input placeholder={t(L, "yourName")} value={name} onChange={function(e) { setName(e.target.value); }} style={inp} />}
        {mode === "signup" && (
          <div style={{ display: "flex", marginBottom: 14, borderRadius: 10, overflow: "hidden", border: "1px solid #e0d8ce" }}>
            {[["en", "English"], ["ja", "\u65E5\u672C\u8A9E"]].map(function(pair) {
              var code = pair[0], lbl = pair[1];
              return <button key={code} onClick={function() { setLang(code); }} style={{ flex: 1, padding: "9px 0", border: "none", cursor: "pointer", fontFamily: B, fontSize: 13, fontWeight: 600, background: lang === code ? "#4a3f33" : "#fff", color: lang === code ? "#fff" : "#8a7e6e" }}>{lbl}</button>;
            })}
          </div>
        )}
        <input placeholder={t(L, "email")} type="email" value={email} onChange={function(e) { setEmail(e.target.value); }} style={inp} />
        <div style={{ position: "relative", marginBottom: 14 }}>
          <input placeholder={t(L, "password")} type={showPw ? "text" : "password"} value={pw} onChange={function(e) { setPw(e.target.value); }} onKeyDown={function(e) { if (e.key === "Enter") submit(); }} style={{ width: "100%", padding: "14px 46px 14px 16px", borderRadius: 12, border: "1px solid #e0d8ce", fontFamily: B, fontSize: 15, background: "#fff", color: "#3a3028", boxSizing: "border-box" }} />
          <button onClick={function() { setShowPw(!showPw); }} type="button" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            {showPw ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a7e6e" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a7e6e" strokeWidth="1.5"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            )}
          </button>
        </div>
        {err && <p style={{ fontFamily: B, fontSize: 13, color: "#c0524a", marginBottom: 8 }}>{err}</p>}
        <button onClick={submit} disabled={busy} style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "#4a3f33", color: "#fff", fontFamily: F, fontSize: 16, fontWeight: 500, letterSpacing: 2, cursor: "pointer", marginTop: 4 }}>{busy ? "..." : t(L, "startJourney")}</button>
      </div>
    </div>
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
  else if (motifIdx === 2) motif = <g><circle cx="85" cy="70" r="14" fill={color} opacity=".15" stroke={accent} strokeWidth="1" opacity=".2"/><circle cx="115" cy="85" r="12" fill={accent} opacity=".12"/><circle cx="95" cy="95" r="10" fill={color} opacity=".1"/><path d="M85 56 Q100 50 115 73" fill="none" stroke={color} strokeWidth="1.5" opacity=".15" strokeDasharray="4,3"/></g>;
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
  var audioRef = useRef(null);

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

  var handleComplete2 = function() { if (cooldownMsg) { setShowCooldown(true); return; } onComplete(dayNum); };

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

      {/* Audio player with mp3 support */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={playing ? handlePause : handlePlay} style={{ width: 48, height: 48, borderRadius: "50%", border: "none", cursor: "pointer", background: playing ? cat.color + "80" : cat.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 3px 12px " + cat.color + "50" }}>
            {playing ? <div style={{ display: "flex", gap: 3 }}><div style={{ width: 3, height: 14, background: "#fff", borderRadius: 2 }} /><div style={{ width: 3, height: 14, background: "#fff", borderRadius: 2 }} /></div> : <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="6,3 20,12 6,21" /></svg>}
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
  // Phase name + desc + quote translated
  var phNames = ["phAwakening","phDeepening","phExpanding","phTransforming","phIntegrating","phRadiating"];
  var phDescs = ["phDescAwakening","phDescDeepening","phDescExpanding","phDescTransforming","phDescIntegrating","phDescRadiating"];
  var phQuotes = ["phQuoteAwakening","phQuoteDeepening","phQuoteExpanding","phQuoteTransforming","phQuoteIntegrating","phQuoteRadiating"];
  var phaseName = t(user, phNames[phaseIdx]);
  var phaseDesc = t(user, phDescs[phaseIdx]);
  var phaseQuote = t(user, phQuotes[phaseIdx]);

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

// ─── MAIN ───
function LuminaApp() {
  var [user, setUser] = useState(null);
  var [progress, setProgress] = useState({});
  var [view, setView] = useState("journey");
  var [selDay, setSelDay] = useState(null);
  var [loading, setLoading] = useState(true);
  // Test mode only activates via ?test in URL - invisible to regular users
  var testMode = typeof window !== "undefined" && window.location.search.indexOf("test") >= 0;
  useEffect(function() {
    var init = async function() {
      try {
        var u = await api.getSession();
        if (u) {
          setUser(u);
          try { var p = await api.getProgress(); setProgress(p || {}); } catch(e) { setProgress({}); }
        }
      } catch(e) {}
      setLoading(false);
    };
    init();
  }, []);
  var handleLogin = async function(ud) {
    setUser(ud);
    try { var p = await api.getProgress(); setProgress(p || {}); } catch(e) { setProgress({}); }
  };
  var handleLogout = async function() {
    api.logout();
    setUser(null); setProgress({}); setView("journey"); setSelDay(null);
  };
  var handleComplete = async function(dayNum) {
    var np = Object.assign({}, progress);
    np[dayNum] = { completedAt: new Date().toISOString() };
    setProgress(np);
    try { await api.completeDay(dayNum); } catch(e) {}
    setView("journey"); setSelDay(null);
  };
  var handleUpdateLang = async function(newLang) {
    var updated = Object.assign({}, user, { lang: newLang });
    setUser(updated);
    try { await api.updateLang(newLang); } catch(e) {}
  };
  if (loading) return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0e8" }}><style>{CSS}</style><Logo size={60} /></div>;
  if (!user) return <AuthScreen onLogin={handleLogin} />;
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
  var lang = user ? user.lang : "en";
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
  if (view === "journey") content = <JourneyMap user={user} progress={progress} maxUnlockedDay={maxDay} onSelectDay={handleSelectDay} />;
  else if (view === "lesson") content = <LessonView user={user} dayData={getDayData(lessonDay, user)} dayNum={lessonDay} isCompleted={!!progress[lessonDay]} onComplete={handleComplete} cooldownMsg={cooldownMsg} />;
  else content = <ProfileView user={user} progress={progress} onLogout={handleLogout} onUpdateLang={handleUpdateLang} />;
  return (
    <div style={{ height: "100vh", maxWidth: 430, margin: "0 auto", background: "#f5f0e8", display: "flex", flexDirection: "column", fontFamily: B, overflow: "hidden" }}>
      <style>{CSS}</style>
      <div style={{ padding: "12px 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderBottom: "1px solid #e8e2d8", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Logo size={30} /><span style={{ fontFamily: F, fontWeight: 400, fontSize: 17, color: "#3a3028", letterSpacing: 4 }}>LUMINA</span></div>
        <div style={{ fontFamily: B, fontSize: 11, fontWeight: 600, color: "#8a7e6e", background: "#f5f0e8", padding: "4px 12px", borderRadius: 16 }}>{tf(user, "dayOf")(activeDay, 90)}</div>
      </div>
      {content}
      <div style={{ display: "flex", background: "#fff", borderTop: "1px solid #e8e2d8", padding: "4px 0 8px", flexShrink: 0 }}>
        {["journey","lesson","profile"].map(function(id) {
          var labels = { journey: t(user, "journey"), lesson: t(user, "lesson"), profile: t(user, "profile") };
          var isActive = view === id;
          return <button key={id} onClick={function() { handleTabClick(id); }} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "8px 0 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: isActive ? "#4a3f33" : "transparent" }} /><span style={{ fontFamily: B, fontSize: 11, fontWeight: isActive ? 700 : 400, color: isActive ? "#3a3028" : "#a09488" }}>{labels[id]}</span></button>;
        })}
      </div>
      {testMode && (
        <div style={{ background: "#c9a84c", padding: "4px 0", textAlign: "center", flexShrink: 0 }}>
          <span style={{ fontFamily: B, fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: 1 }}>TEST MODE \u2014 ALL DAYS UNLOCKED \u2014 NO COOLDOWN</span>
        </div>
      )}
    </div>
  );
}

// ─── MOUNT ───
var root = createRoot(document.getElementById("root"));
root.render(React.createElement(LuminaApp));
