import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Maestra (v9.1 - FINAL FULL)...");

const firebaseConfig = {
  apiKey: "AIzaSyDW40Lg6QvBc3zaaA58konqsH3QtDrRmyM",
  authDomain: "fitdatatg.firebaseapp.com",
  projectId: "fitdatatg",
  storageBucket: "fitdatatg.firebasestorage.app",
  messagingSenderId: "1019606805247",
  appId: "1:1019606805247:web:3a3e5c0db061aa62773aca"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- ESTADO GLOBAL ---
let audioCtx = null;
let currentUser = null, userData = null, activeWorkout = null;
let timerInt = null, durationInt = null, wakeLock = null;
let totalRestTime = 60, restEndTime = 0;
let noteTargetIndex = null, communityUnsubscribe = null;
let currentNoticeId = null, currentNoticeType = null, noticeTargetUid = null;

// Filtros y Caches
let rankFilterTime = 'all', rankFilterGender = 'all', rankFilterCat = 'kg';
let selectedUserCoach = null, selectedUserObj = null, editingRoutineId = null;
let currentPose = 'front', coachCurrentPose = 'front';
let allRoutinesCache = [], currentRoutineSelections = [], swapTargetIndex = null;
let selectedPlanForMassAssign = null, selectedRoutineForMassAssign = null, assignMode = 'plan';
window.currentRoutineSelections = currentRoutineSelections;
window.tempHistoryCache = []; // Cache para gráfica de progreso

// Gestión de Gráficos (Para evitar errores de Canvas)
let charts = {}; 

const AVAILABLE_DIETS = [
    { name: "Dieta Volumen (3000kcal)", file: "volumen_3000.html" },
    { name: "Dieta Definición (2000kcal)", file: "definicion_2000.html" },
    { name: "Dieta Mantenimiento", file: "mantenimiento.html" },
    { name: "Dieta Anti Inflamatoria", file: "Anti.html" },
    { name: "Ayuno Intermitente", file: "ayuno.html" }
];

// ==========================================
// 1. UTILIDADES Y MOTORES (AUDIO/GRÁFICOS/UI)
// ==========================================

// Inyección de Telegram
function injectTelegramUI() {
    const regForm = document.getElementById('register-form');
    const regEmail = document.getElementById('reg-email');
    if (regForm && regEmail && !document.getElementById('reg-telegram')) {
        const input = document.createElement('input');
        input.type = 'text'; input.id = 'reg-telegram'; input.placeholder = 'Usuario Telegram (ej: @juanperez)'; input.style.marginBottom = '10px';
        regEmail.parentNode.insertBefore(input, regEmail);
    }
    const restInput = document.getElementById('cfg-rest-time');
    if (restInput && !document.getElementById('cfg-telegram')) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = "width: 100%; margin-top: 25px; margin-bottom: 25px; text-align: center; border-top: 1px solid #222; padding-top: 15px;"; 
        wrapper.innerHTML = `<label style="display:block; margin-bottom:8px; font-size:0.85rem; color:#aaa; font-weight:bold;">📸 Tu Usuario Telegram</label><input type="text" id="cfg-telegram" placeholder="@usuario" style="width: 70%; max-width: 250px; margin: 0 auto 15px auto; background: #111; border: 1px solid #444; color: white; padding: 10px; border-radius: 8px; text-align: center; display:block;"><button onclick="window.contactCoach()" style="background: var(--accent-color); color: #000; border: none; padding: 10px 24px; border-radius: 50px; font-weight: bold; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">Contactar Coach</button>`;
        if (restInput.parentElement) restInput.parentElement.insertAdjacentElement('afterend', wrapper);
    }
}
document.addEventListener('DOMContentLoaded', injectTelegramUI);
setTimeout(injectTelegramUI, 1000); 

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return d.getUTCFullYear() + "_W" + Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
}

function initCommunityListener() {
    if (communityUnsubscribe) communityUnsubscribe(); 
    const q = query(collection(db, "workouts"), orderBy("date", "desc"), limit(1));
    communityUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const w = change.doc.data();
                const now = Date.now() / 1000;
                if (now - (w.date ? w.date.seconds : 0) < 60 && w.uid !== currentUser.uid) {
                    showToast(`🔥 Alguien terminó: ${w.routine}`);
                    if(document.getElementById('cfg-sound')?.checked && audioCtx?.state !== 'suspended') {
                        const osc = audioCtx.createOscillator(); const g = audioCtx.createGain();
                        osc.connect(g); g.connect(audioCtx.destination);
                        osc.frequency.value = 500; osc.start(); g.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5); osc.stop(audioCtx.currentTime + 0.5);
                    }
                }
            }
        });
    });
}

// UI Helpers
let scrollPos = 0;
window.openModal = (id) => { scrollPos = window.pageYOffset; document.body.style.top = `-${scrollPos}px`; document.body.classList.add('modal-open'); document.getElementById(id)?.classList.add('active'); };
window.closeModal = (id) => { document.getElementById(id)?.classList.remove('active'); document.body.classList.remove('modal-open'); document.body.style.top = ''; window.scrollTo(0, scrollPos); };
const normalizeText = (t) => t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
window.toggleElement = (id) => document.getElementById(id)?.classList.toggle('hidden');

// AUDIO ENGINE (Triangular Wave)
function initAudioEngine() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTickSound(isFinal = false) {
    if(!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (isFinal) { playFinalAlarm(); return; }

    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.frequency.value = 1000; osc.type = 'sine';
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    osc.start(now);
    gain.gain.setValueAtTime(0.8, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.stop(now + 0.1);
}

function playFinalAlarm() {
    if(!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator(), osc2 = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination);
    
    osc1.type = 'triangle'; osc2.type = 'triangle'; 
    osc1.frequency.setValueAtTime(880, now); osc2.frequency.setValueAtTime(1760, now); 

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1.0, now + 0.05);
    gain.gain.setValueAtTime(1.0, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    osc1.start(now); osc2.start(now);
    osc1.stop(now + 1.0); osc2.stop(now + 1.0);
    if("vibrate" in navigator) navigator.vibrate([300, 100, 300]);
}
document.body.addEventListener('touchstart', initAudioEngine, {once:true});
document.body.addEventListener('click', initAudioEngine, {once:true});
window.testSound = () => { playTickSound(false); setTimeout(() => playFinalAlarm(), 600); };

// CHART ENGINE UNIFICADO
function renderLineChart(canvasId, labels, datasets) {
    const ctx = document.getElementById(canvasId); if (!ctx) return;
    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
            plugins: { legend: { display: datasets.length > 1, labels: { color: '#888', boxWidth: 10, font: {size: 10} } } },
            scales: { y: { grid: { color: '#333' } }, x: { display: false } },
            maintainAspectRatio: false, elements: { point: { radius: 2 }, line: { tension: 0.3 } }
        }
    });
}
function renderMuscleRadar(canvasId, stats) {
    const ctx = document.getElementById(canvasId); if (!ctx) return;
    if (charts[canvasId]) charts[canvasId].destroy();
    const muscleGroups = ["Pecho", "Espalda", "Cuádriceps", "Isquios", "Hombros", "Bíceps", "Tríceps", "Glúteos"];
    const dataValues = muscleGroups.map(m => stats[m] || 0);
    charts[canvasId] = new Chart(ctx, {
        type: 'radar', data: { labels: muscleGroups, datasets: [{ label: 'Volumen', data: dataValues, backgroundColor: 'rgba(255, 51, 51, 0.4)', borderColor: '#ff3333', pointBackgroundColor: '#ff3333', pointBorderColor: '#fff' }] },
        options: {
            scales: { r: { angleLines: { color: '#333' }, grid: { color: '#333' }, pointLabels: { color: '#ccc', font: { size: 10 } }, ticks: { display: false, stepSize: 1, callback: v => v.toFixed(0) }, suggestedMin: 0, suggestedMax: Math.max(...dataValues) + 1 } },
            plugins: { legend: { display: false } }, maintainAspectRatio: false
        }
    });
}

// TABS LOGIC
window.switchSubTabGeneric = (context, tabName) => {
    const containerId = context === 'profile' ? 'profile-view' : 'coach-detail-view';
    const contentPrefix = context === 'profile' ? 'tab-content' : 'ctab-content';
    const btnPrefix = context === 'profile' ? 'ptab-btn' : 'ctab-btn';
    document.querySelectorAll(`#${containerId} .p-tab-btn`).forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${btnPrefix}-${tabName}`)?.classList.add('active');
    document.querySelectorAll(`.${context === 'profile' ? 'profile' : 'coach'}-tab-content`).forEach(el => el.classList.add('hidden'));
    document.getElementById(`${contentPrefix}-${tabName}`)?.classList.remove('hidden');
};
window.switchProfileSubTab = (tab) => window.switchSubTabGeneric('profile', tab);
window.switchCoachSubTab = (tab) => window.switchSubTabGeneric('coach', tab);
window.switchTab = (t) => {
    document.querySelectorAll('.view-container').forEach(e => e.classList.remove('active'));
    document.getElementById(t).classList.add('active');
    document.getElementById('main-container').scrollTop = 0;
    document.querySelectorAll('.top-nav-item').forEach(n => n.classList.remove('active'));
    if (t === 'routines-view') document.getElementById('top-btn-routines').classList.add('active');
    if (t === 'profile-view') { document.getElementById('top-btn-profile').classList.add('active'); loadProfile(); }
    if (t === 'admin-view' || t === 'coach-detail-view') document.getElementById('top-btn-coach').classList.add('active');
};

// ==========================================
// 2. AUTH & INICIALIZACIÓN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if(user) {
        currentUser = user;
        const snap = await getDoc(doc(db,"users",user.uid));
        if(snap.exists()){
            userData = snap.data();
            checkPhotoVisualReminder(); initCommunityListener(); checkPhotoReminder(); injectTelegramUI(); checkNotices(); 
            if(['admin','assistant'].includes(userData.role)) document.getElementById('top-btn-coach').classList.remove('hidden');
            if(userData.role === 'athlete' && !sessionStorage.getItem('notif_dismissed')) {
                if(!(await getDocs(query(collection(db, "routines"), where("assignedTo", "array-contains", user.uid)))).empty) document.getElementById('notif-badge').style.display = 'block';
            }
            if(userData.approved){
                setTimeout(() => document.getElementById('loading-screen').classList.add('hidden'), 1500); 
                document.getElementById('main-header').classList.remove('hidden');
                loadRoutines();
                const savedW = localStorage.getItem('fit_active_workout');
                if(savedW) { activeWorkout = JSON.parse(savedW); renderWorkout(); switchTab('workout-view'); startTimerMini(); } 
                else switchTab('routines-view');
            } else { alert("Cuenta en revisión."); signOut(auth); }
        }
    } else {
        setTimeout(() => document.getElementById('loading-screen').classList.add('hidden'), 1500);
        switchTab('auth-view'); document.getElementById('main-header').classList.add('hidden');
        if(communityUnsubscribe) communityUnsubscribe();
    }
});

// ==========================================
// 3. LOGICA PERFIL (ATLETA)
// ==========================================
window.loadProfile = async () => {
    document.getElementById('profile-name').innerText = userData.name;
    const img=document.getElementById('avatar-img'), txt=document.getElementById('avatar-text');
    if(userData.photo) { txt.style.display='none'; img.src=userData.photo; img.style.display='block'; } else { img.style.display='none'; txt.style.display='block'; }
    updatePhotoDisplay(userData);
    
    // Configs
    document.getElementById('cfg-ranking').checked = userData.rankingOptIn;
    document.getElementById('top-btn-ranking').classList.toggle('hidden', !userData.rankingOptIn);
    document.getElementById('cfg-rest-time').value = userData.restTime || 60;
    if(userData.telegram) document.getElementById('cfg-telegram').value = userData.telegram;
    
    // Visibilidad
    const toggleSec = (id, show) => document.getElementById(id).classList.toggle('hidden', !show);
    toggleSec('user-bio-section', userData.showBio); toggleSec('user-skinfolds-section', userData.showSkinfolds); toggleSec('user-measures-section', userData.showMeasurements); toggleSec('btn-diet-view', userData.dietFile);

    // Stats
    document.getElementById('stat-workouts').innerText = userData.stats.workouts || 0;
    document.getElementById('stat-kg').innerText = userData.stats.totalKg ? (userData.stats.totalKg/1000).toFixed(1)+'t' : 0;
    document.getElementById('stat-sets').innerText = userData.stats.totalSets || 0;
    document.getElementById('stat-reps').innerText = userData.stats.totalReps || 0;

    // Charts
    renderLineChart('weightChart', (userData.weightHistory||[70]).map((_,i)=>`T${i}`), [{label:'Kg', data:userData.weightHistory||[70], borderColor:'#ff3333', backgroundColor:'rgba(255,51,51,0.1)', fill:true}]);
    renderMuscleRadar('userMuscleChart', userData.muscleStats || {});
    
    if(userData.showBio && userData.bioHistory?.length) renderLineChart('chartBio', userData.bioHistory.map(h => new Date(h.date.seconds*1000).toLocaleDateString()), [{label:'% Musc', data:userData.bioHistory.map(h=>h.muscle), borderColor:'#00ffff'},{label:'% Grasa', data:userData.bioHistory.map(h=>h.fat), borderColor:'#ffaa00'}]);
    if(userData.showSkinfolds && userData.skinfoldHistory?.length) renderLineChart('chartFat', userData.skinfoldHistory.map(h => new Date(h.date.seconds*1000).toLocaleDateString()), [{label:'% Grasa', data:userData.skinfoldHistory.map(h=>h.fat), borderColor:'#ffaa00'}]);
    if(userData.showMeasurements && userData.measureHistory?.length) {
        const d = userData.measureHistory;
        const ls = d.map(h => new Date(h.date.seconds*1000).toLocaleDateString());
        renderLineChart('chartMeasures', ls, [{l:'Pecho',c:'#FF5733',k:'chest'},{l:'Cintura',c:'#00FF88',k:'waist'},{l:'Brazo',c:'#FF33A8',k:'arm'},{l:'Muslo',c:'#F3FF33',k:'thigh'}].map(p=>({label:p.l, borderColor:p.c, data:d.map(x=>x[p.k]||0)})));
    }

    // Historial
    const histDiv = document.getElementById('user-history-list'); histDiv.innerHTML = "Cargando...";
    const snaps = await getDocs(query(collection(db, "workouts"), where("uid", "==", currentUser.uid), limit(10)));
    const workouts = snaps.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.date-a.date);
    histDiv.innerHTML = workouts.length ? '' : "Sin historial.";
    workouts.forEach(d => {
        histDiv.innerHTML += `<div class="history-row" style="grid-template-columns: 1fr 40px;"><div><span style="color:var(--accent-color)">${new Date(d.date.seconds*1000).toLocaleDateString()}</span> - ${d.routine}</div><div style="text-align:right;"><button class="btn-small btn-outline" style="margin:0; padding:2px 6px;" onclick="window.viewWorkoutDetails('${d.routine}', '${encodeURIComponent(JSON.stringify(d.details))}', '${encodeURIComponent(d.note||"")}')">🔍</button></div></div>`;
    });
};

// ==========================================
// 4. LOGICA COACH
// ==========================================
window.openCoachView = async (uid) => {
    selectedUserCoach=uid; 
    const u = (await getDoc(doc(db, "users", uid))).data(); selectedUserObj = u;
    switchTab('coach-detail-view'); window.switchCoachSubTab('progress');

    document.getElementById('coach-user-name').innerText = u.name + (u.role === 'assistant' ? ' 🛡️' : ''); 
    document.getElementById('coach-user-email').innerHTML = `${u.email} <br> ${u.telegram ? `<span style="color:#0088cc">Telegram: ${u.telegram}</span>` : ''}`;
    document.getElementById('coach-user-meta').innerText = `${u.gender==='female'?'♀️':'♂️'} ${u.age} años • ${u.height} cm`;
    const img = document.getElementById('coach-user-img'), ini = document.getElementById('coach-user-initial');
    if(u.photo) { img.src=u.photo; img.style.display='block'; ini.style.display='none'; } else { img.style.display='none'; ini.style.display='block'; ini.innerText = u.name.charAt(0).toUpperCase(); }
    document.getElementById('pending-approval-banner').classList.toggle('hidden', u.approved);
    updateCoachPhotoDisplay('front');
    ['Bio','Skinfolds','Measures','Videos'].forEach(k => document.getElementById(`coach-toggle-${k.toLowerCase()}`).checked = !!u[`show${k}`]);

    // Dietas
    const dietSel = document.getElementById('coach-diet-select'); dietSel.innerHTML = '<option value="">-- Sin Dieta --</option>';
    AVAILABLE_DIETS.forEach(d => dietSel.add(new Option(d.name, d.file, false, u.dietFile === d.file)));

    // Gráficos Coach
    renderLineChart('coachWeightChart', (u.weightHistory||[70]).map((_,i)=>i+1), [{label:'Kg', data:u.weightHistory||[70], borderColor:'#ff3333'}]);
    renderMuscleRadar('coachMuscleChart', u.muscleStats || {});

    document.getElementById('coach-view-bio').classList.toggle('hidden', !u.bioHistory?.length);
    if(u.bioHistory?.length) renderLineChart('coachBioChart', u.bioHistory.map(h=>new Date(h.date.seconds*1000).toLocaleDateString()), [{label:'% M', data:u.bioHistory.map(h=>h.muscle), borderColor:'#0ff'},{label:'% G', data:u.bioHistory.map(h=>h.fat), borderColor:'#fa0'}]);
    
    document.getElementById('coach-view-skinfolds').classList.toggle('hidden', !u.skinfoldHistory?.length);
    if(u.skinfoldHistory?.length) renderLineChart('coachFatChart', u.skinfoldHistory.map(h=>new Date(h.date.seconds*1000).toLocaleDateString()), [{label:'% G', data:u.skinfoldHistory.map(h=>h.fat), borderColor:'#fa0'}]);

    document.getElementById('coach-view-measures').classList.toggle('hidden', !u.measureHistory?.length);
    if(u.measureHistory?.length) {
        const d = u.measureHistory; const ls = d.map(h => new Date(h.date.seconds*1000).toLocaleDateString());
        renderLineChart('coachMeasuresChart', ls, [{l:'Pecho',c:'#FF5733',k:'chest'},{l:'Cintura',c:'#00FF88',k:'waist'},{l:'Muslo',c:'#F3FF33',k:'thigh'}].map(p=>({label:p.l, borderColor:p.c, data:d.map(x=>x[p.k]||0)})));
    }

    // Historial y Rutinas
    document.getElementById('coach-stats-text').innerHTML = `<div class="stat-pill"><b>${u.stats?.workouts||0}</b><span>ENTRENOS</span></div><div class="stat-pill"><b>${(u.stats?.totalKg/1000||0).toFixed(1)}t</b><span>CARGA</span></div><div class="stat-pill"><b>${u.age||'N/D'}</b><span>AÑOS</span></div>`;
    const hList = document.getElementById('coach-history-list'); hList.innerHTML = 'Cargando...';
    const wSnap = await getDocs(query(collection(db,"workouts"), where("uid","==",uid), limit(20)));
    hList.innerHTML = wSnap.empty ? 'Sin datos.' : '';
    wSnap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>b.date-a.date).forEach(d => {
        hList.innerHTML += `<div class="history-row" style="grid-template-columns: 60px 1fr 30px 80px;"><div>${new Date(d.date.seconds*1000).toLocaleDateString()}</div><div style="overflow:hidden;text-overflow:ellipsis;">${d.routine}</div><div>${d.rpe==='Suave'?'🟢':d.rpe==='Duro'?'🟠':'🔴'}</div><button class="btn-small btn-outline" onclick="viewWorkoutDetails('${d.routine}','${encodeURIComponent(JSON.stringify(d.details))}','${encodeURIComponent(d.note||"")}')">Ver</button></div>`;
    });
    loadCoachAssignedRoutines(uid);
};

async function loadCoachAssignedRoutines(uid) {
    const list = document.getElementById('coach-assigned-list'); list.innerHTML = 'Cargando...';
    allRoutinesCache = [];
    const select = document.getElementById('coach-routine-select'); select.innerHTML = '<option value="">Selecciona...</option>';
    let count = 0; list.innerHTML = '';
    (await getDocs(collection(db, "routines"))).forEach(doc => {
        const r = doc.data(); allRoutinesCache.push({id:doc.id, ...r}); select.add(new Option(r.name, doc.id));
        if(r.assignedTo?.includes(uid)) { count++; list.innerHTML += `<div class="assigned-routine-item"><span>${r.name}</span><button style="border:none;background:none;color:#f55;" onclick="window.unassignRoutine('${doc.id}')">❌</button></div>`; }
    });
    if(count === 0) list.innerHTML = "Ninguna.";
    const pSelect = document.getElementById('coach-plan-select'); pSelect.innerHTML = '<option value="">Selecciona plan...</option>';
    (await getDocs(collection(db, "plans"))).forEach(p => pSelect.add(new Option(p.data().name, p.id)));
}

// ==========================================
// 5. WORKOUT & ROUTINE LOGIC
// ==========================================
window.startWorkout = async (rid) => {
    if(document.getElementById('cfg-wake').checked && 'wakeLock' in navigator) { try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){} }
    const r = (await getDoc(doc(db,"routines",rid))).data();
    let lastData = null;
    const prevSnap = await getDocs(query(collection(db,"workouts"), where("uid","==",currentUser.uid)));
    const same = prevSnap.docs.map(d=>d.data()).filter(d=>d.routine===r.name).sort((a,b)=>b.date-a.date);
    if(same.length) lastData = same[0].details;

    initAudioEngine();
    activeWorkout = { name: r.name, startTime: Date.now(), exs: r.exercises.map(exObj => {
        const name = exObj.n || exObj; const setsCfg = { s: parseInt(exObj.series)||5, r: (exObj.reps||"20-16-16-16-16").split('-') };
        const data = getExerciseData(name);
        let sets = Array(setsCfg.s).fill().map((_, i) => ({ r: parseInt(setsCfg.r[i] || setsCfg.r[setsCfg.r.length-1]), w: 0, d: false, prev: '-' }));
        if(lastData) { const prevEx = lastData.find(ld => ld.n === name); if(prevEx) sets.forEach((s, i) => { if(prevEx.s[i]) s.prev = `${prevEx.s[i].r}x${prevEx.s[i].w}kg${prevEx.s[i].isDrop?'(D)':''}`; }); }
        return { n:name, img:data.img, mInfo:data.mInfo, video:data.v, sets:sets, superset: exObj.s||false, note:"" };
    })};
    saveLocalWorkout(); renderWorkout(); switchTab('workout-view'); startTimerMini();
};

function renderWorkout() {
    const c = document.getElementById('workout-exercises'); c.innerHTML = ''; 
    document.getElementById('workout-title').innerText = activeWorkout.name;
    activeWorkout.exs.forEach((e, i) => {
        const card = document.createElement('div'); card.className = 'card'; card.style.borderLeft = "3px solid var(--accent-color)";
        if(e.superset) { card.style.borderBottom = "1px dashed #444"; card.style.marginBottom = "0"; }
        let setsHtml = `<div class="set-header"><div>#</div><div>PREV</div><div>REPS</div><div>KG</div><div></div></div>`;
        e.sets.forEach((s, j) => {
            setsHtml += `<div class="set-row ${s.isDrop?'is-dropset':''} ${s.d?'set-completed':''}"><div class="set-num">${s.numDisplay||(j+1)}</div><div class="prev-data">${s.prev}</div><div><input type="number" value="${s.r}" onchange="uS(${i},${j},'r',this.value)"></div><div><input type="number" placeholder="kg" value="${s.w||''}" onchange="uS(${i},${j},'w',this.value)"></div><div><button class="btn-outline ${s.d?'btn-done':''}" style="margin:0;height:32px;" onclick="tS(${i},${j})">${s.d?'✓':''}</button>${!s.d && !s.isDrop ? `<button class="btn-small btn-outline" style="padding:2px;font-size:0.5rem;color:var(--warning-color);" onclick="window.addDropset(${i},${j})">💧</button>` : ''}</div></div>`;
        });
        const noteBtn = `<button class="ex-note-btn ${e.note?'has-note':''}" onclick="window.openNoteModal(${i})">📝</button>`;
        const vidBtn = e.video ? `<button class="btn-small btn-outline" style="float:right;width:auto;margin:0;color:#f55;" onclick="window.openVideo('${e.video}')">🎥</button>` : '';
        const swapBtn = `<button class="btn-small btn-outline" style="float:right; width:auto; margin:0 5px 0 0; padding:2px 8px; border-color:#aaa; color:#fff;" onclick="window.initSwap(${i})">🔄</button>`;
        
        card.innerHTML = `<h3 style="display:flex;justify-content:space-between;"><span>${e.n}</span><div>${noteBtn}${vidBtn}${swapBtn}</div></h3>${setsHtml}<div class="sets-actions"><button class="btn-set-control" onclick="window.toggleAllSets(${i})">✓ TODO</button><button class="btn-set-control" onclick="window.addSet(${i})">+ Serie</button></div>`;
        c.appendChild(card); if(e.superset) c.innerHTML += `<div style="text-align:center;color:var(--accent-color);">🔗</div>`;
    });
}

// Workout Helpers
window.uS = (i,j,k,v) => { activeWorkout.exs[i].sets[j][k] = v; saveLocalWorkout(); };
window.tS = (i,j) => { const s = activeWorkout.exs[i].sets[j]; s.d = !s.d; if(s.d) { if(s.w>0 && s.r>0) checkPR(activeWorkout.exs[i].n, parseFloat(s.w), parseInt(s.r)); openRest(); } saveLocalWorkout(); renderWorkout(); };
window.addDropset = (i,j) => { const p = activeWorkout.exs[i].sets[j]; p.d = true; activeWorkout.exs[i].sets.splice(j+1, 0, { r: p.r, w: Math.floor(p.w*0.7), d:false, isDrop:true, prev:'DROP', numDisplay: (j+1)+'.5' }); saveLocalWorkout(); renderWorkout(); };
window.toggleAllSets = (i) => { const n = !activeWorkout.exs[i].sets.every(s=>s.d); activeWorkout.exs[i].sets.forEach(s=>s.d=n); saveLocalWorkout(); renderWorkout(); };
window.addSet = (i) => { activeWorkout.exs[i].sets.push({r:10, w:0, d:false, prev:'-'}); saveLocalWorkout(); renderWorkout(); };
window.removeSet = (i) => { if(activeWorkout.exs[i].sets.length>1) activeWorkout.exs[i].sets.pop(); saveLocalWorkout(); renderWorkout(); };
window.cancelWorkout = () => { if(confirm("⚠ Se perderá el entreno.")) { activeWorkout=null; localStorage.removeItem('fit_active_workout'); if(durationInt) clearInterval(durationInt); switchTab('routines-view'); }};
window.finishWorkout=async(rpe)=>{
    window.closeModal('modal-rpe');
    const log = activeWorkout.exs.map(e=>({n:e.n, note:e.note, s:e.sets.filter(s=>s.d)})).filter(e=>e.s.length);
    if(!log.length) return alert("Nada completado.");
    await addDoc(collection(db,"workouts"), { uid:currentUser.uid, date:serverTimestamp(), routine:activeWorkout.name, rpe:rpe, details:log, note: document.getElementById('workout-notes').value });
    const sets=log.reduce((a,b)=>a+b.s.length,0), reps=log.reduce((a,b)=>a+b.s.reduce((x,y)=>x+y.r,0),0), kg=log.reduce((a,b)=>a+b.s.reduce((x,y)=>x+(y.r*y.w),0),0);
    const wKey = getWeekNumber(new Date());
    await updateDoc(doc(db,"users",currentUser.uid), { "stats.workouts":increment(1), "stats.totalKg":increment(kg), "stats.totalSets":increment(sets), "stats.totalReps":increment(reps), [`stats_week_${wKey}.kg`]:increment(kg), lastWorkoutDate: serverTimestamp() });
    showToast("Entreno Guardado 🏆"); localStorage.removeItem('fit_active_workout'); window.switchTab('routines-view');
};
function checkPR(name, w, r) {
    const rm = Math.round(w / (1.0278 - (0.0278 * r)));
    if(rm > (userData.rmRecords?.[name] || 0)) { updateDoc(doc(db,"users",currentUser.uid), { [`rmRecords.${name}`]: rm }); userData.rmRecords = {...userData.rmRecords, [name]: rm}; showToast(`🔥 ¡NUEVO RÉCORD! RM: ${rm}kg`); if(typeof confetti === 'function') confetti(); }
}
function getExerciseData(name) {
    let match = EXERCISES.find(e => e.n === name) || EXERCISES.find(e => normalizeText(e.n) === normalizeText(name));
    if (!match) { 
        let m="General", img="logo.png", n=normalizeText(name); 
        if(n.includes("press")||n.includes("pecho")) {m="Pecho";img="pecho.png";} else if(n.includes("remo")||n.includes("espalda")) {m="Espalda";img="espalda.png";} else if(n.includes("sentadilla")||n.includes("prensa")) {m="Cuádriceps";img="cuadriceps.png";}
        return { img, mInfo: getMuscleInfoByGroup(m), type:'c', v:null };
    }
    return { img: match.img, mInfo: getMuscleInfoByGroup(match.m), type: match.t || 'c', v: match.v };
}

// --- 6. AVISOS & ADMINISTRACIÓN ---
window.openNoticeEditor = async (uid) => {
    noticeTargetUid = uid; document.getElementById('notice-title').value = ''; document.getElementById('notice-text').value = ''; document.getElementById('notice-img-file').value = '';
    document.getElementById('notice-modal-title').innerText = uid==='GLOBAL' ? '📢 AVISO GLOBAL' : '📢 AVISO INDIVIDUAL';
    try {
        let existing = uid==='GLOBAL' ? (await getDoc(doc(db,"settings","globalNotice"))).data() : (await getDoc(doc(db,"users",uid))).data()?.coachNotice;
        if(existing) { document.getElementById('notice-title').value = existing.title||''; document.getElementById('notice-text').value = existing.text||''; }
    } catch(e){}
    window.openModal('modal-notice-editor');
};
window.saveNotice = async () => {
    const t=document.getElementById('notice-title').value, txt=document.getElementById('notice-text').value, file=document.getElementById('notice-img-file').files[0];
    if(!t || !txt) return alert("Falta título o texto");
    document.getElementById('btn-save-notice').innerText = "SUBIENDO...";
    let imgUrl = "";
    if(file) imgUrl = await getDownloadURL((await uploadBytes(ref(storage, `notices/${Date.now()}.jpg`), file)).ref);
    else { if(noticeTargetUid==='GLOBAL') imgUrl = (await getDoc(doc(db,"settings","globalNotice"))).data()?.img || ""; else imgUrl = (await getDoc(doc(db,"users",noticeTargetUid))).data()?.coachNotice?.img || ""; }
    const data = { id: Date.now().toString(), title:t, text:txt, img:imgUrl, date: new Date().toISOString(), active:true };
    if(noticeTargetUid==='GLOBAL') await setDoc(doc(db,"settings","globalNotice"), data); else await updateDoc(doc(db,"users",noticeTargetUid), { coachNotice: data });
    alert("Publicado"); window.closeModal('modal-notice-editor'); document.getElementById('btn-save-notice').innerText = "PUBLICAR";
    if(document.getElementById('tab-users').classList.contains('active')) window.loadAdminUsers();
};
window.deleteNotice = async () => { if(!confirm("¿Borrar?")) return; if(noticeTargetUid==='GLOBAL') await deleteDoc(doc(db,"settings","globalNotice")); else await updateDoc(doc(db,"users",noticeTargetUid), {coachNotice:null}); alert("Borrado"); window.closeModal('modal-notice-editor'); };
async function checkNotices() {
    if(['admin','assistant'].includes(userData.role)) return;
    if(userData.coachNotice?.active) return showNotice(userData.coachNotice, 'INDIVIDUAL');
    const g = (await getDoc(doc(db,"settings","globalNotice"))).data();
    if(g?.active && g.id !== localStorage.getItem('seen_global_notice')) showNotice(g, 'GLOBAL');
}
function showNotice(n, type) {
    currentNoticeId = n.id; currentNoticeType = type;
    document.getElementById('viewer-title').innerText = n.title; document.getElementById('viewer-text').innerText = n.text;
    const img = document.getElementById('viewer-img');
    if(n.img) { img.src=n.img; img.classList.remove('hidden'); img.onclick=()=>window.viewFullImage(n.img); } else img.classList.add('hidden');
    window.openModal('modal-notice-viewer');
}
window.dismissNotice = async () => {
    if(currentNoticeType==='GLOBAL') localStorage.setItem('seen_global_notice', currentNoticeId);
    else await updateDoc(doc(db,"users",currentUser.uid), {"coachNotice.active":false});
    window.closeModal('modal-notice-viewer');
};

// --- 7. HELPERS GENERALES ---
window.toggleAuth=(m)=>{document.getElementById('login-form').classList.toggle('hidden',m!=='login');document.getElementById('register-form').classList.toggle('hidden',m!=='register');};
window.logout=()=>signOut(auth).then(()=>location.reload());
window.viewFullImage=(s)=>{if(s) {document.getElementById('full-image-src').src=s; window.openModal('modal-image-viewer');}};
window.saveNote=()=>{activeWorkout.exs[noteTargetIndex].note=document.getElementById('exercise-note-input').value; window.closeModal('modal-note');};
window.openNoteModal=(i)=>{noteTargetIndex=i; document.getElementById('exercise-note-input').value=activeWorkout.exs[i].note||""; window.openModal('modal-note');};
window.openVideo=(url)=>{ if(!url) return; let embed = url.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/"); document.getElementById('youtube-frame').src = embed+"?autoplay=1"; window.openModal('modal-video'); };
window.closeVideo=()=>{window.closeModal('modal-video'); document.getElementById('youtube-frame').src = "";};
window.viewWorkoutDetails = (name, dStr, nStr) => {
    const details = JSON.parse(decodeURIComponent(dStr));
    let html = `<div class="detail-note-box">📝 ${decodeURIComponent(nStr)|| "Sin notas."}</div>`;
    details.forEach(ex => {
        let setsHtml = '';
        (ex.s||[]).forEach((s,i) => {
             const style = s.isDrop ? 'border:1px solid var(--warning-color);background:rgba(255,170,0,0.15);' : '';
             setsHtml += `<div class="detail-set-badge" style="${style}"><span class="detail-set-num">#${s.numDisplay||(i+1)}</span><span><b>${s.r}</b>x${s.w}k</span>${s.isDrop?'<span style="color:#fa0">💧</span>':''}</div>`;
        });
        html += `<div class="detail-exercise-card"><div class="detail-exercise-title">${ex.n}</div><div class="detail-sets-grid">${setsHtml||'<small>Sin datos</small>'}</div></div>`;
    });
    document.getElementById('detail-title').innerText = name; document.getElementById('detail-content').innerHTML = html; window.openModal('modal-details');
};

// Listeners & Init
document.getElementById('btn-login').onclick=()=>signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value).catch(e=>alert(e.message));
function showToast(m){const t=document.createElement('div');t.className='toast-msg';t.innerText=m;document.body.appendChild(t);setTimeout(()=>t.remove(),4000);}
function saveLocalWorkout(){localStorage.setItem('fit_active_workout',JSON.stringify(activeWorkout));}

// RESTO FUNCIONES ADMIN
window.deleteUser=async()=>{if(!selectedUserCoach)return; if(prompt("Escribe BORRAR:")==='BORRAR'){ await deleteDoc(doc(db,"users",selectedUserCoach)); window.loadAdminUsers(); window.switchTab('admin-view'); }};
window.toggleUserFeature=async(f,v)=>{if(selectedUserCoach){await updateDoc(doc(db,"users",selectedUserCoach),{[f]:v}); openCoachView(selectedUserCoach,selectedUserObj);}};
window.unassignRoutine=async(rid)=>{if(confirm("¿Quitar?")){await updateDoc(doc(db,"routines",rid),{assignedTo:arrayRemove(selectedUserCoach)}); openCoachView(selectedUserCoach,selectedUserObj);}};
window.assignRoutine=async()=>{const rid=document.getElementById('coach-routine-select').value; if(!rid)return alert("Selecciona"); await updateDoc(doc(db,"routines",rid),{assignedTo:arrayUnion(selectedUserCoach)}); alert("Asignada"); openCoachView(selectedUserCoach,selectedUserObj);};
window.assignPlan=async()=>{const pid=document.getElementById('coach-plan-select').value; if(!pid)return alert("Selecciona"); const p=(await getDoc(doc(db,"plans",pid))).data(); await Promise.all(p.routines.map(rid=>updateDoc(doc(db,"routines",rid),{assignedTo:arrayUnion(selectedUserCoach)}))); alert("Plan Asignado"); openCoachView(selectedUserCoach,selectedUserObj);};
window.goToCreateRoutine=()=>{window.switchTab('routines-view'); window.openEditor();};
window.filterCoachRoutines=(t)=>{ const s=document.getElementById('coach-routine-select'); s.innerHTML=''; allRoutinesCache.filter(r=>normalizeText(r.name).includes(normalizeText(t))).forEach(r=>s.add(new Option(r.name,r.id))); };

// RESTO FUNCIONES USUARIO (Faltantes recuperadas)
window.recoverPass=async()=>{const e=prompt("Email:");if(e)try{await sendPasswordResetEmail(auth,e);alert("Enviado");}catch(e){alert(e.message);}};
window.dismissNotif=()=>{document.getElementById('notif-badge').style.display='none';window.switchTab('routines-view');sessionStorage.setItem('notif_dismissed','true');};
window.savePhotoReminder=async()=>{await updateDoc(doc(db,"users",currentUser.uid),{photoDay:document.getElementById('photo-day').value, photoTime:document.getElementById('photo-time').value}); alert("Guardado");};
window.addWeightEntry=async()=>{const w=parseFloat(prompt("Peso (kg):")); if(!isNaN(w)){await updateDoc(doc(db,"users",currentUser.uid),{weightHistory:arrayUnion(w)}); userData.weightHistory.push(w); loadProfile();}};
window.saveBioEntry=async()=>{const m=parseFloat(document.getElementById('bio-muscle').value), f=parseFloat(document.getElementById('bio-fat').value); if(m&&f) {await updateDoc(doc(db,"users",currentUser.uid),{bioHistory:arrayUnion({date:new Date(), muscle:m, fat:f})}); alert("Guardado"); loadProfile();}};
window.calculateAndSaveSkinfolds=async()=>{
    const s={chest:parseFloat(document.getElementById('p-chest').value)||0, axilla:parseFloat(document.getElementById('p-axilla').value)||0, tricep:parseFloat(document.getElementById('p-tricep').value)||0, subscap:parseFloat(document.getElementById('p-subscap').value)||0, abdo:parseFloat(document.getElementById('p-abdo').value)||0, supra:parseFloat(document.getElementById('p-supra').value)||0, thigh:parseFloat(document.getElementById('p-thigh').value)||0};
    const sum=Object.values(s).reduce((a,b)=>a+b,0), age=userData.age||25, male=userData.gender==='male';
    const bd = male ? 1.112-(0.00043499*sum)+(0.00000055*sum*sum)-(0.00028826*age) : 1.097-(0.00046971*sum)+(0.00000056*sum*sum)-(0.00012828*age);
    const fat = ((495/bd)-450).toFixed(1);
    await updateDoc(doc(db,"users",currentUser.uid),{skinfoldHistory:arrayUnion({date:new Date(), fat:fat, skinfolds:s})});
    alert(`Grasa: ${fat}%. Guardado.`); loadProfile();
};
window.saveMeasurements=async()=>{
    const m={date:new Date(), chest:document.getElementById('m-chest').value, waist:document.getElementById('m-waist').value, hip:document.getElementById('m-hip').value, arm:document.getElementById('m-arm').value, thigh:document.getElementById('m-thigh').value, calf:document.getElementById('m-calf').value, shoulder:document.getElementById('m-shoulder').value};
    await updateDoc(doc(db,"users",currentUser.uid),{measureHistory:arrayUnion(m)}); alert("Guardado"); loadProfile();
};

window.checkPhotoVisualReminder=function(){const b=document.getElementById('photo-missing-banner'); if(b)b.remove(); if(!userData.photo){const d=document.createElement('div');d.id='photo-missing-banner';d.style.cssText="background:#fa0;color:#000;padding:10px;text-align:center;font-weight:bold;cursor:pointer;margin-top:5px;";d.innerHTML="📸 ¡Sube foto de perfil!";d.onclick=()=>switchTab('profile-view');document.getElementById('main-header')?.insertAdjacentElement('afterend',d);}};
window.checkPhotoReminder=function(){if(!userData.photoDay)return; const n=new Date(); if(n.getDay()==userData.photoDay && n.toTimeString().substr(0,5)===userData.photoTime) alert("📸 HORA DE FOTO");};

// SWAP LOGIC RECOVERY
window.initSwap=(i)=>{swapTargetIndex=i; const m=activeWorkout.exs[i].mInfo.main; const list=document.getElementById('swap-list'); list.innerHTML=''; EXERCISES.filter(e=>getMuscleInfoByGroup(e.m).main===m && e.n!==activeWorkout.exs[i].n).forEach(e=>{const d=document.createElement('div');d.style.padding="10px";d.style.borderBottom="1px solid #333";d.innerHTML=`<b>${e.n}</b>`;d.onclick=()=>window.performSwap(e.n);list.appendChild(d);}); window.openModal('modal-swap');};
window.performSwap=(n)=>{const d=getExerciseData(n); const oldSets=activeWorkout.exs[swapTargetIndex].sets.map(s=>({...s, prev:'-', d:false})); activeWorkout.exs[swapTargetIndex]={...activeWorkout.exs[swapTargetIndex], n:n, img:d.img, video:d.v, sets:oldSets}; saveLocalWorkout(); renderWorkout(); window.closeModal('modal-swap');};
