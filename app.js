/**
 * DayScore — app.js 
 * Duolingo Design Edition + Gemini AI
 */

const getLogs   = ()  => JSON.parse(localStorage.getItem("ds_logs")  || "{}");
const getUser   = ()  => JSON.parse(localStorage.getItem("ds_user")  || "null");
const saveLog   = (k,v)=> { const l=getLogs(); l[k]=v; localStorage.setItem("ds_logs",JSON.stringify(l)); };
const saveUser  = (u) => localStorage.setItem("ds_user", JSON.stringify(u));
const getGeminiKey = () => localStorage.getItem("ds_gemini_key") || "";
const setGeminiKey = (k) => localStorage.setItem("ds_gemini_key", k);
const todayKey  = ()  => new Date().toISOString().slice(0,10);

const $  = (id)  => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

let currentUser = null;
let todayScore  = null;
let swSeconds   = 0, swRunning = false, swInterval = null;
let chartInst   = null;
let voiceActive = false, recognition = null;

// Expose toast to window for inline HTML onclicks
window.toast = function(msg) {
  const el = $("toast");
  el.textContent = msg; el.classList.remove("hidden");
  setTimeout(()=>el.classList.add("hidden"), 3000);
}

// ════════════════════════════════════════════════════════
//  SCREEN NAVIGATION
// ════════════════════════════════════════════════════════
function showScreen(id) {
  $$(".screen").forEach(s => { s.classList.remove("active"); s.classList.add("hidden"); });
  const el = $(id);
  if (el) { el.classList.remove("hidden"); el.classList.add("active"); }

  const isMain = ["screen-dashboard", "screen-history"].includes(id);
  $("bottom-nav").classList.toggle("hidden", !isMain);

  $$(".nav-item").forEach(t => {
    const active = t.dataset.screen === id;
    t.classList.toggle("active", active);
  });

  if (id === "screen-history") renderHistory();
}

$$(".nav-item[data-screen]").forEach(tab => {
  tab.addEventListener("click", e => {
    e.preventDefault();
    if (!currentUser) return window.toast("Please sign in first.");
    showScreen(tab.dataset.screen);
  });
});

// ════════════════════════════════════════════════════════
//  REFRESH UI
// ════════════════════════════════════════════════════════
function refreshUI() {
  if (!currentUser) return;
  const u = currentUser;
  const dateStr = new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});

  setText("display-name",  `Hi ${u.name.split(' ')[0]}, ready to crush it?`);
  setText("streak-count",  u.streak ?? 0);
  setText("today-date",    dateStr);
  
  if ($("nav-avatar")) $("nav-avatar").src = u.avatar || "";
  if ($("profile-avatar-img")) $("profile-avatar-img").src = u.avatar || "";
  
  setText("edit-name",     u.name  || "", "value");
  setText("edit-bio",      u.bio   || "", "value");
  setText("edit-avatar-url", u.avatar || "", "value");
  
  if ($("gemini-api-key")) $("gemini-api-key").value = getGeminiKey();
}

function setText(id, val, prop="textContent") { const el = $(id); if (el) el[prop] = val; }

// ════════════════════════════════════════════════════════
//  AUTHENTICATION
// ════════════════════════════════════════════════════════
function onSignedIn(user) {
  currentUser = user;
  saveUser(user);
  refreshUI();
  showScreen("screen-dashboard");
}

function onSignedOut() {
  currentUser = null;
  localStorage.removeItem("ds_user");
  showScreen("screen-auth");
}

// Check session on load
const prevUser = getUser();
if (prevUser) {
  currentUser = prevUser;
  refreshUI();
  showScreen("screen-dashboard");
} else {
  showScreen("screen-auth");
}

$("login-btn").addEventListener("click", () => {
  const btn = $("login-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-rounded" style="animation: spin 1s linear infinite;">sync</span> Signing in...`;

  setTimeout(() => {
    onSignedIn({
      uid: "user001",
      name: "Aarogya Parajuli",
      avatar: "https://ui-avatars.com/api/?name=Aarogya+Parajuli&background=58cc02&color=fff",
      bio: "Ready to level up!",
      streak: 14, totalDays: 45
    });
    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-rounded">login</span> Continue with Google`;
  }, 800);
});

$("logout-btn")?.addEventListener("click", () => {
  if (confirm("Sign out?")) onSignedOut();
});

// Profile Navigation
$("nav-avatar")?.addEventListener("click", () => { refreshUI(); showScreen("screen-profile"); });
$("close-profile-btn")?.addEventListener("click", () => showScreen("screen-dashboard"));

$("save-profile-btn")?.addEventListener("click", () => {
  if (!currentUser) return;
  currentUser.name = $("edit-name").value.trim() || currentUser.name;
  currentUser.bio  = $("edit-bio").value.trim();
  currentUser.avatar = $("edit-avatar-url").value.trim() || currentUser.avatar;
  saveUser(currentUser);
  setGeminiKey($("gemini-api-key").value.trim());
  
  refreshUI();
  window.toast("Saved! ✅");
  showScreen("screen-dashboard");
});

// ════════════════════════════════════════════════════════
//  VOICE INPUT (Web Speech API)
// ════════════════════════════════════════════════════════
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  
  recognition.onstart = () => {
    voiceActive = true;
    $("voice-btn").classList.add("recording");
    $("voice-indicator").classList.remove("hidden");
  };
  recognition.onend = stopVoice;
  recognition.onerror = stopVoice;
  
  let finalTranscript = "";
  recognition.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + " ";
      else interim += e.results[i][0].transcript;
    }
    $("daily-log").value = finalTranscript + interim;
  };
} else {
  if($("voice-btn")) $("voice-btn").style.display = "none";
}

$("voice-btn")?.addEventListener("click", () => {
  if (!recognition) return window.toast("Voice not supported.");
  voiceActive ? stopVoice() : recognition.start();
});
$("stop-voice-btn")?.addEventListener("click", stopVoice);

function stopVoice() {
  voiceActive = false;
  $("voice-btn").classList.remove("recording");
  $("voice-indicator").classList.add("hidden");
  try { recognition.stop(); } catch(e){}
}

// ════════════════════════════════════════════════════════
//  STOPWATCH
// ════════════════════════════════════════════════════════
function swFmt(s) {
  return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60].map(n=>String(n).padStart(2,"0")).join(":");
}
$("sw-play-btn")?.addEventListener("click", () => {
  if (swRunning) {
    clearInterval(swInterval); swRunning = false;
    $("sw-play-btn").innerHTML = `<span class="material-symbols-rounded">play_arrow</span>`;
    $("sw-status").textContent = "Paused";
    $("sw-reset-btn").classList.remove("hidden");
    $("sw-share-btn").classList.remove("hidden");
  } else {
    swRunning = true;
    $("sw-play-btn").innerHTML = `<span class="material-symbols-rounded">pause</span>`;
    $("sw-status").textContent = "Focusing 🔥";
    $("sw-reset-btn").classList.add("hidden");
    $("sw-share-btn").classList.add("hidden");
    swInterval = setInterval(() => { swSeconds++; $("sw-time").textContent = swFmt(swSeconds); }, 1000);
  }
});
$("sw-reset-btn")?.addEventListener("click", () => {
  clearInterval(swInterval); swRunning=false; swSeconds=0;
  $("sw-time").textContent="00:00:00";
  $("sw-play-btn").innerHTML=`<span class="material-symbols-rounded">play_arrow</span>`;
  $("sw-status").textContent="Ready";
  $("sw-reset-btn").classList.add("hidden"); $("sw-share-btn").classList.add("hidden");
});
$("sw-share-btn")?.addEventListener("click", () => {
  window.toast("Shared to feed! (Coming soon)");
});

// ════════════════════════════════════════════════════════
//  EVALUATE DAY (Real Gemini AI Integration)
// ════════════════════════════════════════════════════════
$("evaluate-btn")?.addEventListener("click", async () => {
  if (!currentUser) return;
  const text = $("daily-log").value.trim();
  if (text.length < 10) return window.toast("Write a bit more first! ✍️");

  stopVoice();
  $("entry-card").classList.add("hidden");
  $("ai-loading").classList.remove("hidden");

  let result;
  const apiKey = getGeminiKey();
  
  if (apiKey) {
    result = await callGeminiAI(text, apiKey);
  } else {
    result = await mockAI(text);
  }

  todayScore = result.score;
  saveLog(todayKey(), result);

  currentUser.streak = (currentUser.streak || 0) + 1;
  saveUser(currentUser);
  refreshUI();

  $("ai-loading").classList.add("hidden");
  renderResult(result);
  
  if (result.score >= 50 && window.confetti) {
    confetti({ particleCount:100, spread:70, origin:{y:0.6}, colors:['#58cc02','#1cb0f6','#ffc800'] });
  }
});

async function callGeminiAI(text, apiKey) {
  try {
    const prompt = `Analyze this journal entry. Return ONLY a pure JSON object (no markdown, no backticks).
    Format exactly: {"score": <int 0-100>, "emoji": "<1 emoji>", "label": "<2 words>", "feedback": ["<tip1>", "<tip2>", "<tip3>"]}
    Entry: "${text}"`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    
    if (!res.ok) throw new Error("API Error");
    const data = await res.json();
    let jsonText = data.candidates[0].content.parts[0].text;
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonText);
  } catch (err) {
    console.error("Gemini failed:", err);
    window.toast("AI Error. Falling back to safe score.");
    return mockAI(text);
  }
}

async function mockAI(text) {
  return new Promise(r => setTimeout(() => {
    const score = Math.min(100, text.length > 30 ? 85 : 45);
    r({
      score,
      emoji: score > 70 ? "🥳" : "😐",
      label: score > 70 ? "Great Job" : "Keep Trying",
      feedback: ["Read a book for 10 mins.", "Drink more water.", "Try the Pomodoro technique."]
    });
  }, 1200));
}

function renderResult({ score, emoji, label, feedback }) {
  $("result-card").classList.remove("hidden");
  
  const elScore = $("score-num");
  const t0 = performance.now();
  function step(now) {
    const p = Math.min((now-t0)/1000, 1);
    elScore.textContent = Math.round(score * (1-Math.pow(1-p,3)));
    if (p<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  const ring = $("ring-progress");
  setTimeout(() => {
    ring.setAttribute("stroke-dasharray", `${(score/100)*314.16} 314.16`);
    ring.style.stroke = score>=70 ? "var(--green)" : score>=40 ? "var(--yellow)" : "var(--red)";
  }, 100);

  $("score-emoji").textContent = emoji;
  $("score-label-text").textContent = label;
  
  const list = $("suggestions-list");
  list.innerHTML = "";
  feedback.forEach(tip => {
    const li = document.createElement("li");
    li.textContent = `💡 ${tip}`;
    list.appendChild(li);
  });
}

$("re-eval-btn")?.addEventListener("click", () => {
  $("result-card").classList.add("hidden");
  $("entry-card").classList.remove("hidden");
});

// ════════════════════════════════════════════════════════
//  HISTORY & CHARTS
// ════════════════════════════════════════════════════════
function renderHistory() {
  const grid = $("cal-grid");
  grid.innerHTML = "";
  const now = new Date(), year = now.getFullYear(), month = now.getMonth();
  $("cal-month-title").textContent = now.toLocaleDateString("en-US",{month:"long"}) + " 📅";

  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month+1, 0).getDate();
  const logs = getLogs(), tk = todayKey();

  for(let i=0; i<firstDay; i++) {
    const e = document.createElement("div"); e.className = "cal-cell empty"; grid.appendChild(e);
  }
  for(let d=1; d<=days; d++) {
    const k = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const log = logs[k];
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (k===tk) cell.classList.add("today");
    if (log) {
      cell.classList.add(log.score>=70 ? "high" : log.score>=40 ? "med" : "low");
      cell.textContent = log.score>=70 ? "🔥" : d;
    } else cell.textContent = d;
    grid.appendChild(cell);
  }
  
  // Render Chart
  const ctx = $("weekly-chart");
  if (!ctx || !window.Chart) return;
  if (chartInst) { chartInst.destroy(); chartInst=null; }

  const labels=[], data=[];
  for (let i=6; i>=0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    labels.push(d.toLocaleDateString("en-US",{weekday:"short"}));
    data.push(logs[d.toISOString().slice(0,10)]?.score ?? null);
  }

  chartInst = new Chart(ctx, {
    type:"line",
    data:{ labels, datasets:[{ data, tension:0.4, borderColor:"#1cb0f6", borderWidth:4, pointRadius:5, pointBackgroundColor:"#1cb0f6" }]},
    options:{ scales:{ y:{min:0, max:100} }, plugins:{ legend:{display:false} } }
  });
}
