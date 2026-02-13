import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Iniciada (v9.0 - Coach Tabs & Full Refactor)...");

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

// Variable temporal para caché de historial (gráfica progreso)
window.tempHistoryCache = [];

const AVAILABLE_DIETS = [
    { name: "Dieta Volumen (3000kcal)", file: "volumen_3000.html" },
    { name: "Dieta Definición (2000kcal)", file: "definicion_2000.html" },
    { name: "Dieta Mantenimiento", file: "mantenimiento.html" },
    { name: "Dieta Anti Inflamatoria", file: "Anti.html" },
    { name: "Ayuno Intermitente", file: "ayuno.html" }
];

// ==========================================
// 1. SISTEMA DE PESTAÑAS (ATLETA Y COACH)
// ==========================================

// Función genérica para cambiar pestañas
function switchTabLogic(context, tabName) {
    // context: 'profile' (Atleta) o 'coach' (Coach View)
    // IDs Atleta: ptab-btn-X / tab-content-X
    // IDs Coach:  ctab-btn-X / ctab-content-X
    
    const btnPrefix = context === 'profile' ? 'ptab-btn' : 'ctab-btn';
    const contentPrefix = context === 'profile' ? 'tab-content' : 'ctab-content';
    const containerId = context === 'profile' ? 'profile-view' : 'coach-detail-view';

    // 1. Quitar active de botones
    const container = document.getElementById(containerId);
    if(container) {
        container.querySelectorAll('.p-tab-btn').forEach(btn => btn.classList.remove('active'));
    }

    // 2. Ocultar contenidos
    const contents = document.querySelectorAll(`.${context === 'profile' ? 'profile' : 'coach'}-tab-content`);
    contents.forEach(el => el.classList.add('hidden'));

    // 3. Activar botón actual
    const currentBtn = document.getElementById(`${btnPrefix}-${tabName}`);
    if(currentBtn) currentBtn.classList.add('active');

    // 4. Mostrar contenido actual
    const currentContent = document.getElementById(`${contentPrefix}-${tabName}`);
    if(currentContent) currentContent.classList.remove('hidden');
}

// Exponer funciones globales
window.switchProfileSubTab = (tab) => switchTabLogic('profile', tab);
window.switchCoachSubTab = (tab) => switchTabLogic('coach', tab);


// ==========================================
// 2. MOTOR GRÁFICO UNIFICADO (Chart.js)
// ==========================================

// Renderiza gráficos de línea de forma segura (destruye el anterior si existe)
function renderLineChart(canvasId, labels, datasets) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    // Limpieza automática: Si ya hay un gráfico, destrúyelo
    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            plugins: { legend: { display: datasets.length > 1, labels: { color: '#888', boxWidth: 10, font: {size: 10} } } },
            scales: { y: { grid: { color: '#333' } }, x: { display: false } },
            maintainAspectRatio: false,
            elements: { point: { radius: 2 }, line: { tension: 0.3 } }
        }
    });
}

// Renderiza el Radar Muscular
function renderMuscleRadar(canvasId, stats) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    const muscleGroups = ["Pecho", "Espalda", "Cuádriceps", "Isquios", "Hombros", "Bíceps", "Tríceps", "Glúteos"];
    const dataValues = muscleGroups.map(m => stats[m] || 0);

    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: muscleGroups,
            datasets: [{
                label: 'Volumen', data: dataValues, backgroundColor: 'rgba(255, 51, 51, 0.4)',
                borderColor: '#ff3333', pointBackgroundColor: '#ff3333', pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff', pointHoverBorderColor: '#ff3333'
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { color: '#333' }, grid: { color: '#333' },
                    pointLabels: { color: '#ccc', font: { size: 10 } },
                    ticks: { display: false, stepSize: 1, callback: v => v.toFixed(0) },
                    suggestedMin: 0, 
                    suggestedMax: Math.max(...dataValues) + 1 // Evita error si todo es 0
                }
            },
            plugins: { legend: { display: false } }, maintainAspectRatio: false
        }
    });
}


// ==========================================
// 3. AUDIO ENGINE (Spotify Friendly & Balanced)
// ==========================================
function initAudioEngine() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTickSound(isFinal = false) {
    if(!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (isFinal) { playFinalAlarm(); return; }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 1000; osc.type = 'sine';
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    osc.start(now);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.stop(now + 0.1);
}

function playFinalAlarm() {
    if(!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator(), osc2 = audioCtx.createOscillator(), gain = audioCtx.createGain();
    
    osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination);
    osc1.type = 'triangle'; osc2.type = 'triangle'; // Triangular = Intermedio

    osc1.frequency.setValueAtTime(880, now); 
    osc2.frequency.setValueAtTime(1760, now); 

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1.0, now + 0.05);
    gain.gain.setValueAtTime(1.0, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    osc1.start(now); osc2.start(now);
    osc1.stop(now + 1.0); osc2.stop(now + 1.0);
    if("vibrate" in navigator) navigator.vibrate([300, 100, 300]);
}

window.testSound = () => { playTickSound(false); setTimeout(() => playFinalAlarm(), 600); };


// ==========================================
// 4. AUTENTICACIÓN Y CARGA INICIAL
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if(user) {
        currentUser = user;
        const snap = await getDoc(doc(db,"users",user.uid));
        if(snap.exists()){
            userData = snap.data();
            checkPhotoVisualReminder();
            initCommunityListener();
            checkPhotoReminder();
            injectTelegramUI();
            checkNotices(); 
            
            if(['admin','assistant'].includes(userData.role)) document.getElementById('top-btn-coach').classList.remove('hidden');
            
            if(userData.role === 'athlete' && !sessionStorage.getItem('notif_dismissed')) {
                const q = query(collection(db, "routines"), where("assignedTo", "array-contains", user.uid));
                if(!(await getDocs(q)).empty) document.getElementById('notif-badge').style.display = 'block';
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
// 5. PERFIL DE ATLETA (CARGA DE DATOS)
// ==========================================
window.loadProfile = async () => {
    // 1. Datos Básicos
    document.getElementById('profile-name').innerText = userData.name;
    if(userData.photo) { document.getElementById('avatar-text').style.display='none'; document.getElementById('avatar-img').src = userData.photo; document.getElementById('avatar-img').style.display='block'; }
    updatePhotoDisplay(userData);
    
    // 2. Configuración
    document.getElementById('cfg-ranking').checked = userData.rankingOptIn;
    document.getElementById('top-btn-ranking').classList.toggle('hidden', !userData.rankingOptIn);
    document.getElementById('cfg-rest-time').value = userData.restTime || 60;
    if(userData.telegram) document.getElementById('cfg-telegram').value = userData.telegram;

    // 3. Toggles de Secciones
    const toggleSec = (id, show) => document.getElementById(id).classList.toggle('hidden', !show);
    toggleSec('user-bio-section', userData.showBio);
    toggleSec('user-skinfolds-section', userData.showSkinfolds);
    toggleSec('user-measures-section', userData.showMeasurements);
    toggleSec('btn-diet-view', userData.dietFile);

    // 4. Estadísticas
    document.getElementById('stat-workouts').innerText = userData.stats.workouts || 0;
    document.getElementById('stat-kg').innerText = userData.stats.totalKg ? (userData.stats.totalKg/1000).toFixed(1)+'t' : 0;
    document.getElementById('stat-sets').innerText = userData.stats.totalSets || 0;
    document.getElementById('stat-reps').innerText = userData.stats.totalReps || 0;

    // 5. Gráficos (Usando el motor unificado)
    renderLineChart('weightChart', (userData.weightHistory||[70]).map((_,i)=>`T${i}`), [{label:'Kg', data:userData.weightHistory||[70], borderColor:'#ff3333', backgroundColor:'rgba(255,51,51,0.1)', fill:true}]);
    renderMuscleRadar('userMuscleChart', userData.muscleStats || {});

    if(userData.showBio && userData.bioHistory?.length) {
        const labels = userData.bioHistory.map(h => new Date(h.date.seconds*1000).toLocaleDateString());
        renderLineChart('chartBio', labels, [
            {label:'% Músculo', data:userData.bioHistory.map(h=>h.muscle), borderColor:'#00ffff'},
            {label:'% Grasa', data:userData.bioHistory.map(h=>h.fat), borderColor:'#ffaa00'}
        ]);
    }
    
    if(userData.showSkinfolds && userData.skinfoldHistory?.length) {
        const labels = userData.skinfoldHistory.map(h => new Date(h.date.seconds*1000).toLocaleDateString());
        renderLineChart('chartFat', labels, [{label:'% Grasa', data:userData.skinfoldHistory.map(h=>h.fat), borderColor:'#ffaa00'}]);
    }

    if(userData.showMeasurements && userData.measureHistory?.length) {
        const labels = userData.measureHistory.map(h => new Date(h.date.seconds*1000).toLocaleDateString());
        const datasets = [
            {l:'Pecho',c:'#FF5733',k:'chest'}, {l:'Cintura',c:'#00FF88',k:'waist'}, {l:'Brazo',c:'#FF33A8',k:'arm'}, {l:'Muslo',c:'#F3FF33',k:'thigh'}
        ].map(p => ({ label: p.l, borderColor: p.c, data: userData.measureHistory.map(h => h[p.k]||0) }));
        renderLineChart('chartMeasures', labels, datasets);
    }
    
    // 6. Historial
    const histDiv = document.getElementById('user-history-list'); 
    histDiv.innerHTML = "Cargando...";
    const snap = await getDocs(query(collection(db, "workouts"), where("uid", "==", currentUser.uid), limit(10))); // Limit 10 para rendimiento
    const workouts = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => b.date - a.date);
    histDiv.innerHTML = workouts.length ? '' : "Sin historial.";
    workouts.forEach(d => {
        const date = d.date ? new Date(d.date.seconds*1000).toLocaleDateString() : '-';
        const btn = `<button class="btn-small btn-outline" style="margin:0; padding:2px 6px;" onclick="window.viewWorkoutDetails('${d.routine}', '${encodeURIComponent(JSON.stringify(d.details))}', '${encodeURIComponent(d.note||"")}')">🔍</button>`;
        histDiv.innerHTML += `<div class="history-row" style="grid-template-columns: 1fr 40px;"><div><span style="color:#accent-color">${date}</span> - ${d.routine}</div><div style="text-align:right;">${btn}</div></div>`;
    });
};


// ==========================================
// 6. PERFIL COACH (VISUALIZACIÓN DE ATLETA)
// ==========================================
window.openCoachView = async (uid) => {
    selectedUserCoach=uid; 
    const snap = await getDoc(doc(db, "users", uid)); 
    const u = snap.data(); 
    selectedUserObj = u; 
    
    switchTab('coach-detail-view'); 
    
    // Resetear pestañas a la primera (Progreso)
    window.switchCoachSubTab('progress');

    // Datos Cabecera
    document.getElementById('coach-user-name').innerText = u.name + (u.role === 'assistant' ? ' 🛡️' : ''); 
    document.getElementById('coach-user-email').innerHTML = `${u.email} <br> ${u.telegram ? `<span style="color:#0088cc">Telegram: ${u.telegram}</span>` : ''}`;
    document.getElementById('coach-user-meta').innerText = `${u.gender==='female'?'♀️':'♂️'} ${u.age} años • ${u.height} cm`;
    
    const img = document.getElementById('coach-user-img'), initials = document.getElementById('coach-user-initial');
    if(u.photo) { img.src=u.photo; img.style.display='block'; initials.style.display='none'; } 
    else { img.style.display='none'; initials.style.display='block'; initials.innerText = u.name.charAt(0).toUpperCase(); }
    
    document.getElementById('pending-approval-banner').classList.toggle('hidden', u.approved);
    
    // Carga de Fotos
    updateCoachPhotoDisplay('front');
    
    // Toggles de Configuración
    ['Bio','Skinfolds','Measures','Videos'].forEach(k => {
        const el = document.getElementById(`coach-toggle-${k.toLowerCase()}`);
        if(el) el.checked = !!u[`show${k}`];
    });

    // Listas desplegables (Dietas)
    const dietSel = document.getElementById('coach-diet-select'); dietSel.innerHTML = '<option value="">-- Sin Dieta --</option>';
    AVAILABLE_DIETS.forEach(d => dietSel.add(new Option(d.name, d.file, false, u.dietFile === d.file)));

    // --- CARGA DE GRÁFICOS (Coach Tabs) ---
    // Pestaña Progreso
    renderLineChart('coachWeightChart', (u.weightHistory||[70]).map((_,i)=>i+1), [{label:'Kg', data:u.weightHistory||[70], borderColor:'#ff3333'}]);
    renderMuscleRadar('coachMuscleChart', u.muscleStats || {});

    // Gráficos Condicionales
    const viewBio = document.getElementById('coach-view-bio');
    if(u.bioHistory?.length) {
        viewBio.classList.remove('hidden');
        renderLineChart('coachBioChart', u.bioHistory.map(h=>new Date(h.date.seconds*1000).toLocaleDateString()), [
            {label:'% Musc', data:u.bioHistory.map(h=>h.muscle), borderColor:'#00ffff'},
            {label:'% Grasa', data:u.bioHistory.map(h=>h.fat), borderColor:'#ffaa00'}
        ]);
    } else viewBio.classList.add('hidden');
    
    const viewFat = document.getElementById('coach-view-skinfolds');
    if(u.skinfoldHistory?.length) {
        viewFat.classList.remove('hidden');
        renderLineChart('coachFatChart', u.skinfoldHistory.map(h=>new Date(h.date.seconds*1000).toLocaleDateString()), [{label:'% Grasa', data:u.skinfoldHistory.map(h=>h.fat), borderColor:'#ffaa00'}]);
    } else viewFat.classList.add('hidden');

    const viewMeasures = document.getElementById('coach-view-measures');
    if(u.measureHistory?.length) {
        viewMeasures.classList.remove('hidden');
        const datasets = [
             {l:'Pecho',c:'#FF5733',k:'chest'}, {l:'Cintura',c:'#00FF88',k:'waist'}, {l:'Brazo',c:'#FF33A8',k:'arm'}, {l:'Muslo',c:'#F3FF33',k:'thigh'}
        ].map(p => ({ label: p.l, borderColor: p.c, data: u.measureHistory.map(h => h[p.k]||0) }));
        renderLineChart('coachMeasuresChart', u.measureHistory.map(h=>new Date(h.date.seconds*1000).toLocaleDateString()), datasets);
    } else viewMeasures.classList.add('hidden');


    // Pestaña Historial
    const st = u.stats || {}; 
    document.getElementById('coach-stats-text').innerHTML = `<div class="stat-pill"><b>${st.workouts||0}</b><span>ENTRENOS</span></div><div class="stat-pill"><b>${(st.totalKg/1000||0).toFixed(1)}t</b><span>CARGA</span></div><div class="stat-pill"><b>${u.age||'N/D'}</b><span>AÑOS</span></div>`;
    
    const hList = document.getElementById('coach-history-list'); hList.innerHTML = 'Cargando...';
    const wSnap = await getDocs(query(collection(db,"workouts"), where("uid","==",uid), limit(20)));
    hList.innerHTML = wSnap.empty ? 'Sin datos.' : '';
    wSnap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>b.date-a.date).forEach(d => {
        hList.innerHTML += `<div class="history-row" style="grid-template-columns: 60px 1fr 30px 80px;"><div>${new Date(d.date.seconds*1000).toLocaleDateString()}</div><div style="overflow:hidden;text-overflow:ellipsis;">${d.routine}</div><div>${d.rpe==='Suave'?'🟢':d.rpe==='Duro'?'🟠':'🔴'}</div><button class="btn-small btn-outline" onclick="viewWorkoutDetails('${d.routine}','${encodeURIComponent(JSON.stringify(d.details))}','${encodeURIComponent(d.note||"")}')">Ver</button></div>`;
    });
    
    // Pestaña Perfil (Cargar Rutinas)
    loadCoachAssignedRoutines(uid);
};

async function loadCoachAssignedRoutines(uid) {
    const list = document.getElementById('coach-assigned-list'); list.innerHTML = 'Cargando...';
    const allRoutines = await getDocs(collection(db, "routines")); 
    allRoutinesCache = [];
    const select = document.getElementById('coach-routine-select'); select.innerHTML = '<option value="">Selecciona...</option>';
    
    let assignedCount = 0; list.innerHTML = '';
    allRoutines.forEach(doc => {
        const r = doc.data();
        allRoutinesCache.push({id:doc.id, ...r});
        select.add(new Option(r.name, doc.id));
        if(r.assignedTo?.includes(uid)) {
            assignedCount++;
            list.innerHTML += `<div class="assigned-routine-item"><span>${r.name}</span><button style="border:none;background:none;color:#f55;" onclick="window.unassignRoutine('${doc.id}')">❌</button></div>`;
        }
    });
    if(assignedCount === 0) list.innerHTML = "Ninguna.";
    
    // Cargar Planes
    const pSelect = document.getElementById('coach-plan-select'); pSelect.innerHTML = '<option value="">Selecciona plan...</option>';
    (await getDocs(collection(db, "plans"))).forEach(p => pSelect.add(new Option(p.data().name, p.id)));
}

// ==========================================
// 7. ENTRENAMIENTO Y LOGICA DE RUTINA
// ==========================================
window.startWorkout = async (rid) => {
    if(document.getElementById('cfg-wake').checked && 'wakeLock' in navigator) { try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){} }
    const r = (await getDoc(doc(db,"routines",rid))).data();
    
    let lastData = null;
    const prevSnap = await getDocs(query(collection(db,"workouts"), where("uid","==",currentUser.uid)));
    const same = prevSnap.docs.map(d=>d.data()).filter(d=>d.routine===r.name).sort((a,b)=>b.date-a.date);
    if(same.length) lastData = same[0].details;

    initAudioEngine();
    
    activeWorkout = { 
        name: r.name, startTime: Date.now(), 
        exs: r.exercises.map(exObj => {
            const name = exObj.n || exObj; 
            const setsCfg = { s: parseInt(exObj.series)||5, r: (exObj.reps||"20-16-16-16-16").split('-') };
            const data = getExerciseData(name);
            
            let sets = Array(setsCfg.s).fill().map((_, i) => ({ 
                r: parseInt(setsCfg.r[i] || setsCfg.r[setsCfg.r.length-1]), w: 0, d: false, prev: '-' 
            }));
            
            if(lastData) {
                const prevEx = lastData.find(ld => ld.n === name);
                if(prevEx) sets.forEach((s, i) => { if(prevEx.s[i]) s.prev = `${prevEx.s[i].r}x${prevEx.s[i].w}kg${prevEx.s[i].isDrop?'(D)':''}`; });
            }
            return { n:name, img:data.img, mInfo:data.mInfo, video:data.v, sets:sets, superset: exObj.s||false, note:"" };
        }) 
    };
    saveLocalWorkout(); renderWorkout(); switchTab('workout-view'); startTimerMini();
};

function renderWorkout() {
    const c = document.getElementById('workout-exercises'); c.innerHTML = ''; 
    document.getElementById('workout-title').innerText = activeWorkout.name;
    
    activeWorkout.exs.forEach((e, i) => {
        const card = document.createElement('div'); 
        card.className = 'card';
        card.style.borderLeft = "3px solid var(--accent-color)";
        if(e.superset) { card.style.borderBottom = "1px dashed #444"; card.style.marginBottom = "0"; }
        
        let setsHtml = `<div class="set-header"><div>#</div><div>PREV</div><div>REPS</div><div>KG</div><div></div></div>`;
        e.sets.forEach((s, j) => {
            const rowClass = `set-row ${s.isDrop?'is-dropset':''} ${s.d?'set-completed':''}`;
            setsHtml += `<div class="${rowClass}"><div class="set-num">${s.numDisplay||(j+1)}</div><div class="prev-data">${s.prev}</div>
            <div><input type="number" value="${s.r}" onchange="uS(${i},${j},'r',this.value)"></div>
            <div><input type="number" placeholder="kg" value="${s.w||''}" onchange="uS(${i},${j},'w',this.value)"></div>
            <div><button class="btn-outline ${s.d?'btn-done':''}" style="margin:0;height:32px;" onclick="tS(${i},${j})">${s.d?'✓':''}</button>
            ${!s.d && !s.isDrop ? `<button class="btn-small btn-outline" style="padding:2px;font-size:0.5rem;color:var(--warning-color);" onclick="window.addDropset(${i},${j})">💧</button>` : ''}</div></div>`;
        });
        
        const noteBtn = `<button class="ex-note-btn ${e.note?'has-note':''}" onclick="window.openNoteModal(${i})">📝</button>`;
        const vidBtn = e.video ? `<button class="btn-small btn-outline" style="float:right;width:auto;margin:0;color:#f55;" onclick="window.openVideo('${e.video}')">🎥</button>` : '';
        
        card.innerHTML = `<h3 style="display:flex;justify-content:space-between;"><span>${e.n}</span><div>${noteBtn}${vidBtn}</div></h3>${setsHtml}
        <div class="sets-actions"><button class="btn-set-control" onclick="window.toggleAllSets(${i})">✓ TODO</button><button class="btn-set-control" onclick="window.addSet(${i})">+ Serie</button></div>`;
        c.appendChild(card);
        if(e.superset) c.innerHTML += `<div style="text-align:center;color:var(--accent-color);">🔗</div>`;
    });
}

// Helpers Workout
window.uS = (i,j,k,v) => { activeWorkout.exs[i].sets[j][k] = v; saveLocalWorkout(); };
window.tS = (i,j) => {
    const s = activeWorkout.exs[i].sets[j]; s.d = !s.d;
    if(s.d) {
        if(s.w > 0 && s.r > 0) checkPR(activeWorkout.exs[i].n, parseFloat(s.w), parseInt(s.r));
        openRest();
    }
    saveLocalWorkout(); renderWorkout();
};
window.addDropset = (i,j) => {
    const parent = activeWorkout.exs[i].sets[j]; parent.d = true;
    activeWorkout.exs[i].sets.splice(j+1, 0, { r: parent.r, w: Math.floor(parent.w*0.7), d:false, isDrop:true, prev:'DROP', numDisplay: (j+1)+'.5' });
    saveLocalWorkout(); renderWorkout();
};
window.toggleAllSets = (i) => { const newState = !activeWorkout.exs[i].sets.every(s=>s.d); activeWorkout.exs[i].sets.forEach(s=>s.d=newState); saveLocalWorkout(); renderWorkout(); };
window.addSet = (i) => { activeWorkout.exs[i].sets.push({r:10, w:0, d:false, prev:'-'}); saveLocalWorkout(); renderWorkout(); };
window.removeSet = (i) => { if(activeWorkout.exs[i].sets.length>1) activeWorkout.exs[i].sets.pop(); saveLocalWorkout(); renderWorkout(); };

function checkPR(name, w, r) {
    const rm = Math.round(w / (1.0278 - (0.0278 * r)));
    const oldRM = userData.rmRecords?.[name] || 0;
    if(rm > oldRM) {
        updateDoc(doc(db,"users",currentUser.uid), { [`rmRecords.${name}`]: rm });
        userData.rmRecords = {...userData.rmRecords, [name]: rm};
        showToast(`🔥 ¡NUEVO RÉCORD! RM Est: ${rm}kg`);
        if(typeof confetti === 'function') confetti();
    }
}

// --- 8. AVISOS Y NOTIFICACIONES ---
window.openNoticeEditor = async (uid) => {
    noticeTargetUid = uid;
    document.getElementById('notice-title').value = ''; document.getElementById('notice-text').value = ''; document.getElementById('notice-img-file').value = '';
    document.getElementById('notice-modal-title').innerText = uid==='GLOBAL' ? '📢 AVISO GLOBAL' : '📢 AVISO INDIVIDUAL';
    
    // Cargar previo si existe
    try {
        let existing;
        if(uid==='GLOBAL') existing = (await getDoc(doc(db,"settings","globalNotice"))).data();
        else existing = (await getDoc(doc(db,"users",uid))).data()?.coachNotice;
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
    else {
         if(noticeTargetUid==='GLOBAL') imgUrl = (await getDoc(doc(db,"settings","globalNotice"))).data()?.img || "";
         else imgUrl = (await getDoc(doc(db,"users",noticeTargetUid))).data()?.coachNotice?.img || "";
    }
    
    const data = { id: Date.now().toString(), title:t, text:txt, img:imgUrl, date: new Date().toISOString(), active:true };
    
    if(noticeTargetUid==='GLOBAL') await setDoc(doc(db,"settings","globalNotice"), data);
    else await updateDoc(doc(db,"users",noticeTargetUid), { coachNotice: data });
    
    alert("Publicado"); window.closeModal('modal-notice-editor'); document.getElementById('btn-save-notice').innerText = "PUBLICAR";
    if(document.getElementById('tab-users').classList.contains('active')) window.loadAdminUsers();
};

async function checkNotices() {
    if(['admin','assistant'].includes(userData.role)) return;
    if(userData.coachNotice?.active) return showNotice(userData.coachNotice, 'INDIVIDUAL');
    const g = (await getDoc(doc(db,"settings","globalNotice"))).data();
    if(g?.active && g.id !== localStorage.getItem('seen_global_notice')) showNotice(g, 'GLOBAL');
}

function showNotice(n, type) {
    currentNoticeId = n.id; currentNoticeType = type;
    document.getElementById('viewer-title').innerText = n.title;
    document.getElementById('viewer-text').innerText = n.text;
    const img = document.getElementById('viewer-img');
    if(n.img) { img.src=n.img; img.classList.remove('hidden'); img.onclick=()=>window.viewFullImage(n.img); } 
    else img.classList.add('hidden');
    window.openModal('modal-notice-viewer');
}

window.dismissNotice = async () => {
    if(currentNoticeType==='GLOBAL') localStorage.setItem('seen_global_notice', currentNoticeId);
    else await updateDoc(doc(db,"users",currentUser.uid), {"coachNotice.active":false});
    window.closeModal('modal-notice-viewer');
};

// --- RESTO DE FUNCIONES (Minificadas, funcionales) ---
window.toggleAuth=(m)=>{document.getElementById('login-form').classList.toggle('hidden',m!=='login');document.getElementById('register-form').classList.toggle('hidden',m!=='register');};
window.logout=()=>signOut(auth).then(()=>location.reload());
window.viewFullImage=(s)=>{if(s) {document.getElementById('full-image-src').src=s; window.openModal('modal-image-viewer');}};
window.saveNote=()=>{activeWorkout.exs[noteTargetIndex].note=document.getElementById('exercise-note-input').value; window.closeModal('modal-note');};
window.openNoteModal=(i)=>{noteTargetIndex=i; document.getElementById('exercise-note-input').value=activeWorkout.exs[i].note||""; window.openModal('modal-note');};

// --- VISOR DETALLES (CON ORANGE DROPSETS) ---
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

window.finishWorkout=async(rpe)=>{
    window.closeModal('modal-rpe');
    const log = activeWorkout.exs.map(e=>({n:e.n, note:e.note, s:e.sets.filter(s=>s.d)})).filter(e=>e.s.length);
    if(!log.length) return alert("Nada completado.");
    
    await addDoc(collection(db,"workouts"), {
        uid:currentUser.uid, date:serverTimestamp(), routine:activeWorkout.name, rpe:rpe, details:log,
        note: document.getElementById('workout-notes').value
    });
    
    const sets=log.reduce((a,b)=>a+b.s.length,0), reps=log.reduce((a,b)=>a+b.s.reduce((x,y)=>x+y.r,0),0), kg=log.reduce((a,b)=>a+b.s.reduce((x,y)=>x+(y.r*y.w),0),0);
    const wKey = getWeekNumber(new Date());
    await updateDoc(doc(db,"users",currentUser.uid), {
        "stats.workouts":increment(1), "stats.totalKg":increment(kg), "stats.totalSets":increment(sets), "stats.totalReps":increment(reps),
        [`stats_week_${wKey}.kg`]:increment(kg), lastWorkoutDate: serverTimestamp()
    });
    
    showToast("Entreno Guardado 🏆"); localStorage.removeItem('fit_active_workout'); window.switchTab('routines-view');
};

// Event Listeners y Funciones de Utilidad (Asegurando completitud)
document.getElementById('btn-login').onclick=()=>signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value).catch(e=>alert(e.message));
function showToast(m){const t=document.createElement('div');t.className='toast-msg';t.innerText=m;document.body.appendChild(t);setTimeout(()=>t.remove(),4000);}
function saveLocalWorkout(){localStorage.setItem('fit_active_workout',JSON.stringify(activeWorkout));}
document.body.addEventListener('touchstart', initAudioEngine, {once:true});
document.body.addEventListener('click', initAudioEngine, {once:true});

// Se mantienen funciones administrativas clave (sin cambios de lógica, solo integradas)
window.deleteUser = async () => { if(!selectedUserCoach) return; if(prompt("Escribe BORRAR:")==='BORRAR'){ await deleteDoc(doc(db,"users",selectedUserCoach)); window.loadAdminUsers(); window.switchTab('admin-view'); }};
window.toggleUserFeature = async (f,v) => { if(selectedUserCoach) { await updateDoc(doc(db,"users",selectedUserCoach),{[f]:v}); openCoachView(selectedUserCoach,selectedUserObj); }};
window.unassignRoutine = async (rid) => { if(confirm("¿Quitar?")) { await updateDoc(doc(db,"routines",rid),{assignedTo:arrayRemove(selectedUserCoach)}); openCoachView(selectedUserCoach,selectedUserObj); }};
