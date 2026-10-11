/**
 * ScoreX — Frontend SPA
 * All state is sourced from /api/v1/... — no localStorage DB
 */

const API = '/api/v1';
const app = document.getElementById('app');

// ─── Current session (loaded from server) ────────────────────────────────────
let session = null;

// ─── Exam state (during attempt) ─────────────────────────────────────────────
let examState = null;
let timerHandle = null;

// ─── API helper ───────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { session = null; home(); return null; }
  return { ok: res.ok, status: res.status, data };
}

// ─── Layout helpers ───────────────────────────────────────────────────────────
function layout(content, actions = '') {
  app.innerHTML = `<header class="top"><div class="brand">Score<span>X</span></div><div class="nav">${actions}</div></header>${content}`;
}

function actions() {
  return `<span class="muted">Hi, ${session.name.split(' ')[0]}</span><button class="btn ghost" onclick="logout()">Logout</button>`;
}

function showMsg(id, text, color = '') {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; if (color) el.style.color = color; }
}

function showToast(msg, isError = false) {
  const old = document.getElementById('__toast__');
  if (old) old.remove();
  const d = document.createElement('div');
  d.id = '__toast__';
  d.style.cssText = `position:fixed;bottom:24px;right:24px;background:${isError ? '#fee2e2' : '#dcfce7'};color:${isError ? '#b91c1c' : '#15803d'};padding:12px 18px;border-radius:12px;box-shadow:0 8px 24px #0002;z-index:200;font-weight:700;max-width:340px`;
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

function setLoading(btnId, loading, text = '') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  if (text) btn.textContent = loading ? 'Please wait…' : text;
}

// ─── Home ─────────────────────────────────────────────────────────────────────
function home() {
  layout(`
    <main class="container">
      <section class="hero">
        <div class="card">
          <span class="badge">SMART ONLINE EXAMINATION</span>
          <h1>Assess knowledge.<br>Track progress.</h1>
          <p class="muted">ScoreX provides role-based examinations with secure exam mode, instant scoring and progress tracking.</p>
          <br>
          <button id="getStartedBtn" class="btn primary" type="button">Get Started</button>
        </div>
        <div class="card">
          <h2>Secure by design</h2>
          <p>✓ Fullscreen examination mode</p>
          <p>✓ Tab/window visibility monitoring</p>
          <p>✓ Copy, paste &amp; right-click restrictions</p>
          <p>✓ Shortcut-key warnings</p>
          <p>✓ Violation tracking &amp; auto-submit</p>
          <p>✓ Role-based student, faculty and admin access</p>
          <p>✓ Server-side scoring &amp; answer validation</p>
        </div>
      </section>
    </main>
  `);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function auth(mode = 'login') {
  layout(`
    <main class="auth">
      <div class="authbox card">
        <div class="tabs">
          <button class="${mode === 'login' ? 'active' : ''}" onclick="auth('login')">Login</button>
          <button class="${mode === 'register' ? 'active' : ''}" onclick="auth('register')">Register</button>
        </div>
        <div id="authform"></div>
      </div>
    </main>
  `);
  renderAuth(mode);
}

function renderAuth(mode) {
  const isLogin = mode === 'login';
  document.getElementById('authform').innerHTML = isLogin
    ? `<h2>Welcome back</h2>
       <p class="muted">Sign in to continue to ScoreX.</p>
       <div class="field"><label>Email</label><input id="email" type="email" autocomplete="email" required></div>
       <div class="field"><label>Password</label><input id="password" type="password" autocomplete="current-password" required></div>
       <button id="loginBtn" class="btn primary full" onclick="login()">Login</button>
       <p id="msg" class="muted" style="margin-top:10px"></p>`
    : `<h2>Create your account</h2>
       <p class="muted">Register as a student or faculty member.</p>
       <div class="formrow">
         <div class="field"><label>Full name</label><input id="name" autocomplete="name"></div>
         <div class="field"><label>User ID</label><input id="uid" placeholder="Roll/Faculty ID"></div>
       </div>
       <div class="field"><label>Email</label><input id="email" type="email" autocomplete="email"></div>
       <div class="field"><label>Password <small style="font-weight:400">(min 8 chars, 1 uppercase, 1 number)</small></label><input id="password" type="password" autocomplete="new-password"></div>
       <div class="field"><label>Confirm password</label><input id="confirm" type="password"></div>
       <div class="field"><label>Role</label><select id="role"><option value="student">Student</option><option value="faculty">Faculty</option></select></div>
       <button id="regBtn" class="btn primary full" onclick="register()">Create account</button>
       <p id="msg" class="muted" style="margin-top:10px"></p>`;
}

async function login() {
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  if (!email || !password) return showMsg('msg', 'Please enter email and password.');

  setLoading('loginBtn', true, 'Login');
  const r = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setLoading('loginBtn', false, 'Login');
  if (!r) return;
  if (!r.ok) return showMsg('msg', r.data.error || 'Login failed.', '#b91c1c');
  session = r.data.user;
  dashboard();
}

async function register() {
  const name = document.getElementById('name').value.trim();
  const uid = document.getElementById('uid').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('password').value;
  const confirm = document.getElementById('confirm').value;
  const role = document.getElementById('role').value;

  if (!name || !uid || !email || !password) return showMsg('msg', 'Please fill all fields.');
  if (password !== confirm) return showMsg('msg', 'Passwords do not match.', '#b91c1c');

  setLoading('regBtn', true, 'Create account');
  const r = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, uid, email, password, role }),
  });
  setLoading('regBtn', false, 'Create account');
  if (!r) return;

  if (!r.ok) {
    const details = r.data.details;
    const msg = details ? details.map(d => d.message).join(', ') : (r.data.error || 'Registration failed.');
    return showMsg('msg', msg, '#b91c1c');
  }
  showMsg('msg', 'Registration successful! You can now log in.', '#15803d');
  setTimeout(() => auth('login'), 1200);
}

async function logout() {
  await apiFetch('/auth/logout', { method: 'POST' });
  session = null;
  examState = null;
  clearInterval(timerHandle);
  home();
}

// ─── Dashboard router ─────────────────────────────────────────────────────────
function dashboard() {
  if (!session) return auth();
  if (session.role === 'student') studentDash();
  else if (session.role === 'faculty') facultyDash();
  else adminDash();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STUDENT DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
async function studentDash() {
  layout(`<main class="container"><p class="muted">Loading dashboard…</p></main>`, actions());

  const [examsRes, progressRes] = await Promise.all([
    apiFetch('/exams'),
    apiFetch('/reports/progress'),
  ]);
  if (!examsRes || !progressRes) return;

  const exams = examsRes.data.exams || [];
  const { summary, recentAttempts } = progressRes.data;

  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div>
          <h1>Student Dashboard</h1>
          <p class="muted">Choose an examination and monitor your progress.</p>
        </div>
        <button class="btn" onclick="studentProgress()">📊 My Progress</button>
      </div>
      <div class="grid">
        <div class="card"><div class="stat">${exams.length}</div><div class="muted">Available exams</div></div>
        <div class="card"><div class="stat">${summary.total}</div><div class="muted">Completed</div></div>
        <div class="card"><div class="stat">${summary.avgScore}%</div><div class="muted">Average score</div></div>
      </div>
      <br>
      <h2>Available Exams</h2>
      <div class="grid">
        ${exams.length === 0 ? '<p class="muted">No exams available at the moment.</p>' :
          exams.map(e => `
            <div class="card examcard">
              <span class="badge">${e.subject?.name || 'General'}</span>
              <h2>${e.title}</h2>
              <p class="muted">${e._count?.questions || 0} questions · ${e.duration} minutes · ${e.totalMarks} marks</p>
              <p class="muted">Passing: ${e.passingMarks} marks</p>
              <button class="btn primary" onclick="instructions('${e.id}','${e.title.replace(/'/g,"\\'")}')">Start Exam</button>
            </div>
          `).join('')}
      </div>
      <br>
      <div class="card">
        <h2>Recent Results</h2>
        ${recentAttempts.length === 0 ? '<p class="muted">No completed exams yet.</p>' :
          recentAttempts.map(a => `
            <div class="violation" style="cursor:pointer" onclick="viewResult('${a.id}')">
              <b>${a.examTitle}</b> (${a.subject || ''}) —
              <b>${a.score}/${a.totalMarks}</b> (${a.percent}%)
              <span class="badge ${a.isPassed ? 'green' : 'red'}" style="margin-left:8px">${a.isPassed ? 'PASS' : 'FAIL'}</span>
              · ${a.violationCount} violation(s)
              <small class="muted" style="float:right">${new Date(a.submittedAt).toLocaleDateString()}</small>
            </div>
          `).join('')}
      </div>
    </main>
  `, actions());
}

async function studentProgress() {
  layout(`<main class="container"><p class="muted">Loading progress…</p></main>`, actions());
  const [progressRes, weeklyRes] = await Promise.all([
    apiFetch('/reports/progress'),
    apiFetch('/reports/weekly'),
  ]);
  if (!progressRes || !weeklyRes) return;

  const { summary, subjectBreakdown, recentAttempts } = progressRes.data;
  const weekly = weeklyRes.data.reports || [];

  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div><h1>My Progress</h1><p class="muted">Weekly reports and subject breakdown.</p></div>
        <button class="btn" onclick="studentDash()">← Dashboard</button>
      </div>
      <div class="grid">
        <div class="card"><div class="stat">${summary.total}</div><div class="muted">Total attempts</div></div>
        <div class="card"><div class="stat">${summary.passed}</div><div class="muted">Passed</div></div>
        <div class="card"><div class="stat">${summary.avgScore}%</div><div class="muted">Average score</div></div>
      </div>
      <br>
      <div class="card">
        <h2>Subject Breakdown</h2>
        ${subjectBreakdown.length === 0 ? '<p class="muted">No data yet.</p>' :
          subjectBreakdown.map(s => `
            <div style="margin:10px 0">
              <b>${s.subject}</b> — ${s.attempts} attempt(s) — avg ${s.avgScore}%
              <div class="progress" style="margin-top:5px"><div style="width:${s.avgScore}%"></div></div>
            </div>
          `).join('')}
      </div>
      <br>
      <div class="card">
        <h2>Weekly Reports</h2>
        ${weekly.length === 0 ? '<p class="muted">No weekly data yet. Complete some exams first.</p>' :
          weekly.map(w => `
            <div class="violation">
              <b>Week of ${new Date(w.weekStart).toLocaleDateString()}</b> —
              ${w.examsAttempted} exam(s) — avg ${w.avgScore.toFixed(1)}% — best ${w.bestScore.toFixed(1)}%
              · ${w.totalViolations} violation(s)
            </div>
          `).join('')}
      </div>
    </main>
  `, actions());
}

// ─── View a result ────────────────────────────────────────────────────────────
async function viewResult(attemptId) {
  layout(`<main class="container"><p class="muted">Loading result…</p></main>`, actions());
  const r = await apiFetch(`/results/${attemptId}`);
  if (!r || !r.ok) return showToast(r?.data?.error || 'Failed to load result.', true);

  const { attempt, review, violations, canSeeAnswers } = r.data;
  const percent = attempt.percent || Math.round((attempt.score / attempt.totalMarks) * 100);

  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div><h1>${attempt.exam.title}</h1><p class="muted">Result details</p></div>
        <button class="btn" onclick="${session.role === 'student' ? 'studentDash()' : 'dashboard()'}">← Back</button>
      </div>
      <div class="grid">
        <div class="card" style="text-align:center">
          <div class="stat" style="font-size:48px">${attempt.score}/${attempt.totalMarks}</div>
          <div class="muted">Score</div>
          <span class="badge ${attempt.isPassed ? 'green' : 'red'}" style="margin-top:8px">${attempt.isPassed ? 'PASSED' : 'FAILED'}</span>
        </div>
        <div class="card">
          <div class="stat">${percent}%</div>
          <div class="muted">Percentage</div>
          <div class="progress" style="margin-top:12px"><div style="width:${percent}%"></div></div>
        </div>
        <div class="card">
          <div class="stat">${attempt.violationCount || violations.length}</div>
          <div class="muted">Violations</div>
          <small class="muted">Submitted by: ${attempt.submittedBy}</small>
        </div>
      </div>
      <br>
      ${canSeeAnswers && review ? `
        <div class="card">
          <h2>Answer Review</h2>
          ${review.map((q, i) => `
            <div class="question">
              <p><b>Q${i + 1}.</b> ${q.questionText} <small class="muted">(${q.marks} mark)</small></p>
              ${q.options.map(o => `
                <label class="option" style="
                  ${o.id === q.selectedOptionId && q.isCorrect ? 'background:#dcfce7;border-color:#16a34a' : ''}
                  ${o.id === q.selectedOptionId && !q.isCorrect ? 'background:#fee2e2;border-color:#dc2626' : ''}
                  ${o.isCorrect && o.id !== q.selectedOptionId ? 'background:#eff6ff;border-color:#3b82f6' : ''}
                ">
                  ${o.isCorrect ? '✓ ' : ''}${o.text}
                  ${o.id === q.selectedOptionId ? '<b> ← your answer</b>' : ''}
                </label>
              `).join('')}
            </div>
          `).join('')}
        </div>
      ` : '<div class="card"><p class="muted">Answer review not available for this exam.</p></div>'}
      ${violations.length > 0 ? `
        <br><div class="card">
          <h2>Security Violations</h2>
          ${violations.map(v => `<div class="violation">${v.type}${v.detail ? ': ' + v.detail : ''} — <small>${new Date(v.occurredAt).toLocaleTimeString()}</small></div>`).join('')}
        </div>
      ` : ''}
    </main>
  `, actions());
}

// ─── Exam Instructions ────────────────────────────────────────────────────────
function instructions(examId, examTitle) {
  app.innerHTML = `
    <div class="modal">
      <div class="card">
        <span class="badge red">SECURE EXAM MODE</span>
        <h2>${examTitle}</h2>
        <p>You must stay in fullscreen and remain on this exam tab.</p>
        <ul>
          <li>Right-click, copy, paste and cut are restricted.</li>
          <li>Shortcut-key attempts are recorded.</li>
          <li>Switching tabs/windows creates a security violation.</li>
          <li>Leaving fullscreen creates a security violation.</li>
          <li>After 3 violations, your exam will be submitted automatically.</li>
        </ul>
        <p class="muted">Browser security limits mean some OS-level shortcuts cannot be completely blocked. Server-side timing and scoring enforce exam integrity.</p>
        <button class="btn primary" onclick="startExam('${examId}')">I Understand — Start Exam</button>
        <button class="btn ghost" onclick="dashboard()">Cancel</button>
      </div>
    </div>
  `;
}

// ─── Start Exam ───────────────────────────────────────────────────────────────
async function startExam(examId) {
  // Request fullscreen
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch (_) {}

  // Start attempt on server
  const r = await apiFetch('/attempts', {
    method: 'POST',
    body: JSON.stringify({ examId }),
  });
  if (!r || !r.ok) {
    alert(r?.data?.error || 'Failed to start exam. Please try again.');
    dashboard();
    return;
  }

  const { attempt, questions, savedAnswers, resumed } = r.data;

  // Build answers map from saved answers (resume support)
  const answersMap = {};
  savedAnswers.forEach(a => { answersMap[a.questionId] = a.selectedOptionId; });

  examState = {
    attemptId: attempt.id,
    examId,
    questions,
    index: 0,
    answers: answersMap,
    violations: [],
    maxViolations: 3,
    startedAt: new Date(attempt.startedAt).getTime(),
    durationSecs: 0, // will be fetched from exam
    submitted: false,
    _installed: false,
  };

  // Fetch exam duration
  const examRes = await apiFetch(`/exams/${examId}`);
  if (examRes && examRes.ok) {
    examState.durationSecs = examRes.data.exam.duration * 60;
    examState.maxViolations = examRes.data.exam.maxViolations || 3;
  }

  // Calculate remaining time
  const elapsed = Math.floor((Date.now() - examState.startedAt) / 1000);
  examState.seconds = Math.max(0, examState.durationSecs - elapsed);

  if (resumed) showToast('Resuming your previous attempt.');
  installSecurity();
  examView();
}

// ─── Exam View ────────────────────────────────────────────────────────────────
function examView() {
  if (!examState) return;
  const s = examState;
  const q = s.questions[s.index];
  const pct = (s.index / s.questions.length) * 100;
  const answered = Object.keys(s.answers).length;

  app.innerHTML = `
    <div id="examRoot">
      <header class="top">
        <div class="brand">Score<span>X</span></div>
        <div class="timer" id="timer"></div>
      </header>
      <main class="container">
        <div class="exambar">
          <div>
            <b>Question ${s.index + 1} of ${s.questions.length}</b>
            <div class="muted">${answered} answered · ${s.violations.length} violation(s)</div>
          </div>
          <button class="btn danger" onclick="submitExam('student')">Submit Exam</button>
        </div>
        <div class="progress"><div style="width:${pct}%"></div></div>
        <br>
        <div class="card question">
          <h2>${q.text}</h2>
          ${q.options.map(o => `
            <label class="option" style="${s.answers[q.id] === o.id ? 'background:#eef2ff;border-color:#6366f1' : ''}">
              <input type="radio" name="opt" value="${o.id}"
                ${s.answers[q.id] === o.id ? 'checked' : ''}
                onchange="saveAnswer('${q.id}','${o.id}')">
              ${o.text}
            </label>
          `).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:12px">
          <button class="btn" onclick="prevQ()" ${s.index === 0 ? 'disabled' : ''}>← Previous</button>
          ${s.index === s.questions.length - 1
            ? `<button class="btn primary" onclick="submitExam('student')">Finish &amp; Submit</button>`
            : `<button class="btn primary" onclick="nextQ()">Next →</button>`}
        </div>
        <br>
        <div class="card">
          <h3>Security status</h3>
          <div class="security">
            <div><b>${s.violations.length}</b><br><span class="muted">Violations</span></div>
            <div><b>${s.maxViolations}</b><br><span class="muted">Max limit</span></div>
            <div><b>ON</b><br><span class="muted">Monitoring</span></div>
            <div><b>${document.fullscreenElement ? 'ON' : 'OFF'}</b><br><span class="muted">Fullscreen</span></div>
          </div>
        </div>
        <br>
        <div class="card">
          <h3>Question Navigator</h3>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
            ${s.questions.map((qq, i) => `
              <button class="btn" style="width:36px;height:36px;padding:0;${s.answers[qq.id] ? 'background:#4f46e5;color:#fff' : ''}${i === s.index ? 'outline:3px solid #6366f1' : ''}" onclick="gotoQ(${i})">${i + 1}</button>
            `).join('')}
          </div>
        </div>
      </main>
    </div>
  `;
  startTimer();
}

function gotoQ(i) { if (examState) { examState.index = i; examView(); } }
function nextQ() { if (examState && examState.index < examState.questions.length - 1) { examState.index++; examView(); } }
function prevQ() { if (examState && examState.index > 0) { examState.index--; examView(); } }

// ─── Save Answer (optimistic + server sync) ───────────────────────────────────
async function saveAnswer(questionId, optionId) {
  if (!examState || examState.submitted) return;
  examState.answers[questionId] = optionId;
  // Update UI immediately
  const labels = document.querySelectorAll('.option');
  labels.forEach(l => l.style.background = '');
  document.querySelector(`input[value="${optionId}"]`)?.closest('.option')
    ?.style?.setProperty('background', '#eef2ff');

  // Save to server
  await apiFetch(`/attempts/${examState.attemptId}/answer`, {
    method: 'PUT',
    body: JSON.stringify({ questionId, selectedOptionId: optionId }),
  });
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function startTimer() {
  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    if (!examState || examState.submitted) { clearInterval(timerHandle); return; }
    examState.seconds--;
    const m = Math.floor(examState.seconds / 60);
    const s = String(examState.seconds % 60).padStart(2, '0');
    const el = document.getElementById('timer');
    if (el) {
      el.textContent = `${m}:${s}`;
      el.style.color = examState.seconds < 60 ? '#b91c1c' : '#172033';
    }
    if (examState.seconds <= 0) submitExam('timer');
  }, 1000);
}

// ─── Security Violations ─────────────────────────────────────────────────────
function installSecurity() {
  if (examState._installed) return;
  examState._installed = true;

  document.addEventListener('visibilitychange', handleVisibility);
  document.addEventListener('fullscreenchange', handleFullscreen);
  ['contextmenu', 'copy', 'cut', 'paste'].forEach(ev =>
    document.addEventListener(ev, handleRestrictedEvent)
  );
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('blur', handleBlur);
}

function uninstallSecurity() {
  document.removeEventListener('visibilitychange', handleVisibility);
  document.removeEventListener('fullscreenchange', handleFullscreen);
  ['contextmenu', 'copy', 'cut', 'paste'].forEach(ev =>
    document.removeEventListener(ev, handleRestrictedEvent)
  );
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('blur', handleBlur);
}

function handleVisibility() {
  if (examState && !examState.submitted && document.hidden)
    recordViolation('tab_switch', 'Tab or window switch detected.');
}
function handleFullscreen() {
  if (examState && !examState.submitted && !document.fullscreenElement)
    recordViolation('fullscreen_exit', 'Fullscreen mode exited.');
}
function handleRestrictedEvent(e) {
  if (examState && !examState.submitted) {
    e.preventDefault();
    recordViolation(e.type, `${e.type} action is restricted during the examination.`);
  }
}
function handleKeydown(e) {
  if (!examState || examState.submitted) return;
  const k = e.key.toLowerCase();
  const blocked = e.ctrlKey || e.metaKey || e.altKey ||
    ['f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12'].includes(k);
  if (blocked) {
    e.preventDefault();
    recordViolation('shortcut', `Shortcut key (${e.key}) is restricted.`);
  }
}
function handleBlur() {
  if (examState && !examState.submitted)
    recordViolation('blur', 'Window lost focus.');
}

async function recordViolation(type, detail) {
  if (!examState || examState.submitted) return;
  examState.violations.push({ type, detail, time: new Date().toISOString() });
  showWarning(detail, examState.violations.length, examState.maxViolations);

  // Report to server
  const r = await apiFetch('/violations', {
    method: 'POST',
    body: JSON.stringify({ attemptId: examState.attemptId, type, detail }),
  });

  if (r && r.ok && r.data.autoSubmit) {
    examState.submitted = true;
    clearInterval(timerHandle);
    uninstallSecurity();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    showResultScreen(null, true);
  } else {
    // Re-render security status
    const secEl = document.querySelector('.security');
    if (secEl) {
      secEl.querySelector('div:first-child b').textContent = examState.violations.length;
    }
  }
}

function showWarning(detail, count, max) {
  const old = document.querySelector('.warning');
  if (old) old.remove();
  const d = document.createElement('div');
  d.className = 'warning';
  d.innerHTML = `<h3>⚠ Security Warning</h3><div>${detail}</div><small>Violation ${count} of ${max}. Repeated violations will auto-submit the exam.</small>`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 4000);
}

// ─── Submit Exam ──────────────────────────────────────────────────────────────
async function submitExam(reason = 'student') {
  if (!examState || examState.submitted) return;
  examState.submitted = true;
  clearInterval(timerHandle);
  uninstallSecurity();

  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

  layout(`<main class="auth"><div class="authbox card" style="text-align:center"><h2>Submitting exam…</h2><p class="muted">Please wait.</p></div></main>`);

  const r = await apiFetch(`/attempts/${examState.attemptId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ submittedBy: reason }),
  });

  if (!r || !r.ok) {
    showToast('Submission error. Please contact your instructor.', true);
    examState = null;
    dashboard();
    return;
  }

  const { attempt } = r.data;
  showResultScreen(attempt);
  examState = null;
}

function showResultScreen(attempt, autoSubmitted = false) {
  if (attempt) {
    const percent = attempt.totalMarks > 0 ? Math.round((attempt.score / attempt.totalMarks) * 100) : 0;
    layout(`
      <main class="auth">
        <div class="authbox card" style="text-align:center">
          <span class="badge ${attempt.isPassed ? 'green' : 'red'}">${attempt.isPassed ? 'PASSED' : 'FAILED'}</span>
          <h1>${attempt.score}/${attempt.totalMarks}</h1>
          <p class="muted">Your score: ${percent}%</p>
          <p class="muted">Violations: ${attempt.violationCount} · Submitted by: ${attempt.submittedBy}</p>
          <button class="btn primary" onclick="viewResult('${attempt.id}')">View Detailed Result</button>
          &nbsp;<button class="btn" onclick="studentDash()">Dashboard</button>
        </div>
      </main>
    `);
  } else {
    layout(`
      <main class="auth">
        <div class="authbox card" style="text-align:center">
          <span class="badge red">AUTO-SUBMITTED</span>
          <h2>Exam Auto-Submitted</h2>
          <p class="muted">Your exam was automatically submitted due to repeated security violations.</p>
          <button class="btn primary" onclick="studentDash()">Back to Dashboard</button>
        </div>
      </main>
    `);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FACULTY DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
async function facultyDash() {
  layout(`<main class="container"><p class="muted">Loading…</p></main>`, actions());
  const r = await apiFetch('/exams');
  if (!r) return;
  const exams = r.data.exams || [];

  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div><h1>Faculty Dashboard</h1><p class="muted">Create and manage your examinations.</p></div>
        <button class="btn primary" onclick="createExamForm()">+ New Exam</button>
      </div>
      <div class="grid">
        <div class="card"><div class="stat">${exams.length}</div><div class="muted">My exams</div></div>
        <div class="card"><div class="stat">${exams.filter(e => e.isPublished).length}</div><div class="muted">Published</div></div>
        <div class="card"><div class="stat">${exams.reduce((s, e) => s + (e._count?.attempts || 0), 0)}</div><div class="muted">Total attempts</div></div>
      </div>
      <br>
      <h2>Your Exams</h2>
      ${exams.length === 0
        ? '<div class="card"><p class="muted">No exams yet. Click "+ New Exam" to create your first exam.</p></div>'
        : `<div class="grid">${exams.map(e => `
          <div class="card examcard">
            <span class="badge">${e.subject?.name || 'No subject'}</span>
            <h2>${e.title}</h2>
            <p class="muted">${e._count?.questions || 0} questions · ${e.duration} min · ${e.totalMarks} marks</p>
            <span class="badge ${e.isPublished ? 'green' : 'red'}">${e.isPublished ? 'PUBLISHED' : 'DRAFT'}</span>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn" onclick="manageExam('${e.id}')">Manage</button>
              <button class="btn" onclick="viewExamAttempts('${e.id}','${e.title.replace(/'/g,"\\'")}')">Attempts (${e._count?.attempts || 0})</button>
              <button class="btn ${e.isPublished ? 'danger' : 'primary'}" onclick="togglePublish('${e.id}')">${e.isPublished ? 'Unpublish' : 'Publish'}</button>
            </div>
          </div>
        `).join('')}</div>`}
    </main>
  `, actions());
}

async function togglePublish(examId) {
  const r = await apiFetch(`/exams/${examId}/publish`, { method: 'POST' });
  if (!r) return;
  if (!r.ok) return showToast(r.data.error || 'Failed to toggle publish.', true);
  showToast(r.data.message);
  facultyDash();
}

async function viewExamAttempts(examId, examTitle) {
  layout(`<main class="container"><p class="muted">Loading attempts…</p></main>`, actions());
  const r = await apiFetch(`/exams/${examId}/attempts`);
  if (!r || !r.ok) return showToast('Failed to load attempts.', true);
  const attempts = r.data.attempts || [];

  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div><h1>${examTitle}</h1><p class="muted">Student attempts</p></div>
        <button class="btn" onclick="facultyDash()">← Back</button>
      </div>
      <div class="card">
        ${attempts.length === 0
          ? '<p class="muted">No attempts yet.</p>'
          : `<table style="width:100%;border-collapse:collapse">
              <tr style="text-align:left;border-bottom:1px solid #e7eaf0">
                <th style="padding:8px">Student</th><th>ID</th><th>Score</th><th>%</th><th>Status</th><th>Violations</th><th>Submitted</th><th></th>
              </tr>
              ${attempts.map(a => {
                const pct = a.totalMarks > 0 ? Math.round((a.score / a.totalMarks) * 100) : 0;
                return `<tr style="border-bottom:1px solid #f1f5f9">
                  <td style="padding:8px">${a.user.name}</td>
                  <td>${a.user.uid}</td>
                  <td>${a.score}/${a.totalMarks}</td>
                  <td>${pct}%</td>
                  <td><span class="badge ${a.isPassed ? 'green' : 'red'}">${a.isPassed ? 'PASS' : 'FAIL'}</span></td>
                  <td>${a.violationCount}</td>
                  <td><small>${a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '-'}</small></td>
                  <td><button class="btn" onclick="viewResult('${a.id}')">View</button></td>
                </tr>`;
              }).join('')}
            </table>`}
      </div>
    </main>
  `, actions());
}

// ─── Manage Exam (questions) ──────────────────────────────────────────────────
async function manageExam(examId) {
  layout(`<main class="container"><p class="muted">Loading exam…</p></main>`, actions());
  const [examRes, qRes] = await Promise.all([
    apiFetch(`/exams/${examId}`),
    apiFetch(`/questions/exam/${examId}`),
  ]);
  if (!examRes || !qRes) return;
  const exam = examRes.data.exam;
  const questions = qRes.data.questions || [];

  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div>
          <h1>${exam.title}</h1>
          <p class="muted">${exam.subject?.name} · ${exam.duration} min · ${exam.totalMarks} marks</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="editExamForm('${examId}')">Edit Exam</button>
          <button class="btn" onclick="facultyDash()">← Back</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2>Questions (${questions.length})</h2>
          <button class="btn primary" onclick="addQuestionForm('${examId}')">+ Add Question</button>
        </div>
        ${questions.length === 0 ? '<p class="muted">No questions yet. Add your first question.</p>' :
          questions.map((q, i) => `
            <div class="question" style="border-bottom:1px solid #e7eaf0;padding-bottom:12px">
              <p><b>Q${i + 1}.</b> ${q.text} <small class="muted">(${q.marks} mark)</small></p>
              ${q.options.map(o => `
                <label class="option" style="${o.isCorrect ? 'background:#dcfce7;border-color:#16a34a' : ''}">
                  ${o.isCorrect ? '✓ ' : ''}${o.text}
                </label>
              `).join('')}
              <div style="margin-top:8px">
                <button class="btn" onclick="deleteQuestion('${q.id}','${examId}')">Delete</button>
              </div>
            </div>
          `).join('')}
      </div>
    </main>
  `, actions());
}

// ─── Add Question Form ────────────────────────────────────────────────────────
function addQuestionForm(examId) {
  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div><h1>Add Question</h1></div>
        <button class="btn" onclick="manageExam('${examId}')">← Back</button>
      </div>
      <div class="card">
        <div class="field"><label>Question Text</label><textarea id="qtext" rows="3" style="width:100%;padding:12px;border:1px solid #d9dee8;border-radius:10px;resize:vertical"></textarea></div>
        <div class="field"><label>Marks</label><input id="qmarks" type="number" value="1" min="1"></div>
        <h3>Options <small class="muted">(mark exactly one as correct)</small></h3>
        <div id="optionsList">
          ${[0,1,2,3].map(i => `
            <div style="display:flex;gap:8px;margin:8px 0;align-items:center">
              <input type="radio" name="correct" value="${i}" ${i===0?'checked':''}>
              <input class="opt-text" style="flex:1;padding:10px;border:1px solid #d9dee8;border-radius:8px" placeholder="Option ${i+1}">
            </div>
          `).join('')}
        </div>
        <br>
        <button class="btn primary" onclick="submitQuestion('${examId}')">Save Question</button>
        <p id="msg" class="muted" style="margin-top:10px"></p>
      </div>
    </main>
  `, actions());
}

async function submitQuestion(examId) {
  const text = document.getElementById('qtext').value.trim();
  const marks = parseInt(document.getElementById('qmarks').value) || 1;
  const optInputs = document.querySelectorAll('.opt-text');
  const correctRadios = document.querySelectorAll('input[name="correct"]');
  let correctIndex = 0;
  correctRadios.forEach((r, i) => { if (r.checked) correctIndex = i; });

  const options = Array.from(optInputs).map((inp, i) => ({
    text: inp.value.trim(),
    isCorrect: i === correctIndex,
  })).filter(o => o.text);

  if (!text) return showMsg('msg', 'Question text is required.', '#b91c1c');
  if (options.length < 2) return showMsg('msg', 'At least 2 options are required.', '#b91c1c');

  const r = await apiFetch('/questions', {
    method: 'POST',
    body: JSON.stringify({ examId, text, marks, options }),
  });
  if (!r || !r.ok) return showMsg('msg', r?.data?.error || 'Failed to add question.', '#b91c1c');
  showToast('Question added!');
  manageExam(examId);
}

async function deleteQuestion(questionId, examId) {
  if (!confirm('Delete this question? This cannot be undone.')) return;
  const r = await apiFetch(`/questions/${questionId}`, { method: 'DELETE' });
  if (!r || !r.ok) return showToast('Failed to delete question.', true);
  showToast('Question deleted.');
  manageExam(examId);
}

// ─── Create / Edit Exam Form ──────────────────────────────────────────────────
async function createExamForm() {
  await showExamForm(null);
}
async function editExamForm(examId) {
  const r = await apiFetch(`/exams/${examId}`);
  await showExamForm(r?.data?.exam);
}

async function showExamForm(exam = null) {
  const subjectsRes = await apiFetch('/subjects');
  const subjects = subjectsRes?.data?.subjects || [];
  const isEdit = !!exam;

  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div><h1>${isEdit ? 'Edit Exam' : 'Create New Exam'}</h1></div>
        <button class="btn" onclick="facultyDash()">← Back</button>
      </div>
      <div class="card">
        <div class="field"><label>Title</label><input id="etitle" value="${exam?.title || ''}"></div>
        <div class="field"><label>Subject</label>
          <select id="esubject">
            ${subjects.map(s => `<option value="${s.id}" ${exam?.subjectId === s.id ? 'selected' : ''}>${s.name} (${s.code})</option>`).join('')}
          </select>
        </div>
        <div class="formrow">
          <div class="field"><label>Duration (minutes)</label><input id="eduration" type="number" value="${exam?.duration || 30}" min="1"></div>
          <div class="field"><label>Total Marks</label><input id="etotalmarks" type="number" value="${exam?.totalMarks || 10}" min="1"></div>
        </div>
        <div class="formrow">
          <div class="field"><label>Passing Marks</label><input id="epassingmarks" type="number" value="${exam?.passingMarks || 6}" min="0"></div>
          <div class="field"><label>Max Violations</label><input id="emaxviolations" type="number" value="${exam?.maxViolations || 3}" min="1" max="10"></div>
        </div>
        <div class="field">
          <label><input type="checkbox" id="eshowAnswers" ${exam?.showAnswersAfter !== false ? 'checked' : ''}> Show correct answers after submission</label>
        </div>
        <div class="field"><label>Instructions (optional)</label><textarea id="einstructions" rows="3" style="width:100%;padding:12px;border:1px solid #d9dee8;border-radius:10px">${exam?.instructions || ''}</textarea></div>
        <button class="btn primary" onclick="${isEdit ? `saveExam('${exam.id}')` : 'saveExam(null)'}">${isEdit ? 'Save Changes' : 'Create Exam'}</button>
        <p id="msg" class="muted" style="margin-top:10px"></p>
      </div>
    </main>
  `, actions());
}

async function saveExam(examId) {
  const data = {
    title: document.getElementById('etitle').value.trim(),
    subjectId: document.getElementById('esubject').value,
    duration: parseInt(document.getElementById('eduration').value),
    totalMarks: parseInt(document.getElementById('etotalmarks').value),
    passingMarks: parseInt(document.getElementById('epassingmarks').value),
    maxViolations: parseInt(document.getElementById('emaxviolations').value),
    showAnswersAfter: document.getElementById('eshowAnswers').checked,
    instructions: document.getElementById('einstructions').value.trim(),
  };

  if (!data.title || !data.subjectId) return showMsg('msg', 'Title and subject are required.', '#b91c1c');

  const r = examId
    ? await apiFetch(`/exams/${examId}`, { method: 'PUT', body: JSON.stringify(data) })
    : await apiFetch('/exams', { method: 'POST', body: JSON.stringify(data) });

  if (!r || !r.ok) {
    const err = r?.data?.details?.map(d => d.message).join(', ') || r?.data?.error || 'Failed to save exam.';
    return showMsg('msg', err, '#b91c1c');
  }
  showToast(examId ? 'Exam updated!' : 'Exam created!');
  if (examId) manageExam(examId);
  else manageExam(r.data.exam.id);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
async function adminDash() {
  layout(`<main class="container"><p class="muted">Loading…</p></main>`, actions());
  const r = await apiFetch('/admin/stats');
  if (!r || !r.ok) return showToast('Failed to load admin stats.', true);

  const { stats, roleBreakdown, recentAttempts } = r.data;

  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div><h1>Admin Dashboard</h1><p class="muted">System overview and management.</p></div>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="adminUsers()">Manage Users</button>
          <button class="btn" onclick="adminAudit()">Audit Logs</button>
        </div>
      </div>
      <div class="grid">
        <div class="card"><div class="stat">${stats.userCount}</div><div class="muted">Registered users</div></div>
        <div class="card"><div class="stat">${stats.examCount}</div><div class="muted">Total exams</div></div>
        <div class="card"><div class="stat">${stats.attemptCount}</div><div class="muted">Exam attempts</div></div>
      </div>
      <br>
      <div class="grid">
        <div class="card"><div class="stat">${stats.violationCount}</div><div class="muted">Security violations</div></div>
        ${roleBreakdown.map(r => `
          <div class="card"><div class="stat">${r.count}</div><div class="muted">${r.role}s</div></div>
        `).join('')}
      </div>
      <br>
      <div class="card">
        <h2>Recent Exam Activity</h2>
        ${recentAttempts.length === 0 ? '<p class="muted">No activity yet.</p>' :
          recentAttempts.map(a => {
            const pct = a.totalMarks > 0 ? Math.round((a.score / a.totalMarks) * 100) : 0;
            return `<div class="violation">
              <b>${a.exam?.title}</b> — ${a.user?.name} (${a.user?.uid}) —
              score ${a.score}/${a.totalMarks} (${pct}%) · ${a._count?.violations || 0} violation(s)
              <small class="muted" style="float:right">${a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '-'}</small>
            </div>`;
          }).join('')}
      </div>
    </main>
  `, actions());
}

async function adminUsers() {
  layout(`<main class="container"><p class="muted">Loading users…</p></main>`, actions());
  const r = await apiFetch('/admin/users?limit=50');
  if (!r || !r.ok) return showToast('Failed to load users.', true);
  const { users } = r.data;

  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div><h1>User Management</h1><p class="muted">${users.length} users</p></div>
        <button class="btn" onclick="adminDash()">← Dashboard</button>
      </div>
      <div class="card" style="overflow:auto">
        <table style="width:100%;border-collapse:collapse;min-width:600px">
          <tr style="text-align:left;border-bottom:2px solid #e7eaf0">
            <th style="padding:10px">Name</th><th>UID</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th>
          </tr>
          ${users.map(u => `
            <tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:10px">${u.name}</td>
              <td>${u.uid}</td>
              <td>${u.email}</td>
              <td><span class="badge">${u.role}</span></td>
              <td><span class="badge ${u.isActive ? 'green' : 'red'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
              <td>
                <button class="btn" onclick="toggleUser('${u.id}',${!u.isActive})">${u.isActive ? 'Deactivate' : 'Activate'}</button>
              </td>
            </tr>
          `).join('')}
        </table>
      </div>
    </main>
  `, actions());
}

async function toggleUser(userId, newActive) {
  const r = await apiFetch(`/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ isActive: newActive }),
  });
  if (!r || !r.ok) return showToast(r?.data?.error || 'Failed to update user.', true);
  showToast(newActive ? 'User activated.' : 'User deactivated.');
  adminUsers();
}

async function adminAudit() {
  layout(`<main class="container"><p class="muted">Loading audit logs…</p></main>`, actions());
  const r = await apiFetch('/admin/audit?limit=50');
  if (!r || !r.ok) return showToast('Failed to load audit logs.', true);
  const { logs } = r.data;

  layout(`
    <main class="container">
      <div class="dashboard-head">
        <div><h1>Audit Logs</h1></div>
        <button class="btn" onclick="adminDash()">← Dashboard</button>
      </div>
      <div class="card">
        ${logs.length === 0 ? '<p class="muted">No logs yet.</p>' :
          logs.map(l => `
            <div class="violation">
              <b>${l.action}</b>
              ${l.entity ? `on ${l.entity}` : ''}
              ${l.user ? `by ${l.user.name} (${l.user.role})` : '(system)'}
              <small class="muted" style="float:right">${new Date(l.createdAt).toLocaleString()}</small>
            </div>
          `).join('')}
      </div>
    </main>
  `, actions());
}

// Get Started uses a delegated click handler instead of an inline onclick.
// This also works when a host's Content Security Policy blocks inline handlers.
document.addEventListener('click', (event) => {
  const button = event.target.closest('#getStartedBtn');
  if (button) {
    event.preventDefault();
    auth('login');
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  const r = await apiFetch('/auth/me');
  if (r && r.ok) {
    session = r.data.user;
    dashboard();
  } else {
    home();
  }
})();
