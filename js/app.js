import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App v10.0 (Stable & Complete)...");

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
window.tempHistoryCache = []; 

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
// 1. HELPERS Y MOTORES (AUDIO/GRÁFICOS/UI)
// ==========================================

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return d.getUTCFullYear() + "_W" + Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
}

const normalizeText = (t) => t ? t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

// UI Helpers Globales
let scrollPos = 0;
window.openModal = (id) => { scrollPos = window.pageYOffset; document.body.style.top = `-${scrollPos}px`; document.body.classList.add('modal-open'); document.getElementById(id)?.classList.add('active'); };
window.closeModal = (id) => { document.getElementById(id)?.classList.remove('active'); document.body.classList.remove('modal-open'); document.body.style.top = ''; window.scrollTo(0, scrollPos); };
window.toggleElement = (id) => document.getElementById(id)?.classList.toggle('hidden');
function showToast(m){const t=document.createElement('div');t.className='toast-msg';t.innerText=m;document.body.appendChild(t);setTimeout(()=>t.remove(),4000);}

// AUDIO ENGINE (Triangle Wave - Balanced)
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
    
    // Configuración Triangular (Intermedia)
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

// LOGICA DE PESTAÑAS (TABS)
window.switchProfileSubTab = (tabName) => {
    document.querySelectorAll('#profile-view .p-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`ptab-btn-${tabName}`).classList.add('active');
    ['progress','history','settings'].forEach(t => document.getElementById(`tab-content-${t}`).classList.add('hidden'));
    document.getElementById(`tab-content-${tabName}`).classList.remove('hidden');
};

window.switchCoachSubTab = (tabName) => {
    document.querySelectorAll('#coach-detail-view .p-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`ctab-btn-${tabName}`).classList.add('active');
    ['progress','history','profile'].forEach(t => document.getElementById(`ctab-content-${t}`).classList.add('hidden'));
    document.getElementById(`ctab-content-${tabName}`).classList.remove('hidden');
};

window.switchTab = (t) => {
    document.querySelectorAll('.view-container').forEach(e => e.classList.remove('active'));
    document.getElementById(t).classList.add('active');
    document.getElementById('main-container').scrollTop = 0;
    document.querySelectorAll('.top-nav-item').forEach(n => n.classList.remove('active'));
    if (t === 'routines-view') document.getElementById('top-btn-routines').classList.add('active');
    if (t === 'profile-view') { 
        document.getElementById('top-btn-profile').classList.add('active'); 
        window.loadProfile(); // Importante llamar a cargar perfil aquí
    }
    if (t === 'admin-view' || t === 'coach-detail-view') document.getElementById('top-btn-coach').classList.add('active');
};


// ==========================================
// 2. FUNCIONES DE CARGA (DEFINIDAS ANTES DE AUTH)
// ==========================================

// Carga las rutinas en la pantalla principal
window.loadRoutines = async () => {
    const l = document.getElementById('routines-list'); 
    if(!l) return;
    l.innerHTML = 'Cargando...';
    onSnapshot(query(collection(db,"routines")), (s)=>{
        l.innerHTML = '';
        s.forEach(d=>{
            const r = d.data();
            const isAssignedToMe = r.assignedTo && r.assignedTo.includes(currentUser.uid);
            if(isAssignedToMe){
                const div = document.createElement('div'); div.className = 'card';
                const canEdit = r.uid === currentUser.uid;
                div.innerHTML = `<div style="display:flex; justify-content:space-between;"><h3 style="color:var(--accent-color)">${r.name}</h3><div>${canEdit ? `<button style="background:none;border:none;margin-right:10px;" onclick="window.openEditor('${d.id}')">✏️</button><button style="background:none;border:none;" onclick="window.delRoutine('${d.id}')">🗑️</button>` : '🔒'}</div></div><p style="color:#666; font-size:0.8rem; margin:10px 0;">${r.exercises.length} Ejercicios</p><button class="btn" onclick="window.startWorkout('${d.id}')">ENTRENAR</button>`;
                l.appendChild(div);
            }
        });
        if(l.innerHTML === '') l.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No tienes rutinas asignadas.</div>';
    });
};

// ==========================================
// 3. AUTH & INICIALIZACIÓN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if(user) {
        currentUser = user;
        const snap = await getDoc(doc(db,"users",user.uid));
        if(snap.exists()){
            userData = snap.data();
            
            // Inits
            initCommunityListener();
            injectTelegramUI();
            checkNotices();
            
            // Visual Reminders
            if(window.checkPhotoVisualReminder) window.checkPhotoVisualReminder();
            if(window.checkPhotoReminder) window.checkPhotoReminder();

            // Roles
            if(['admin','assistant'].includes(userData.role)) document.getElementById('top-btn-coach').classList.remove('hidden');
            
            // Notif
            if(userData.role === 'athlete' && !sessionStorage.getItem('notif_dismissed')) {
                const q = query(collection(db, "routines"), where("assignedTo", "array-contains", user.uid));
                const s = await getDocs(q);
                if(!s.empty) document.getElementById('notif-badge').style.display = 'block';
            }

            if(userData.approved){
                setTimeout(() => document.getElementById('loading-screen').classList.add('hidden'), 1500); 
                document.getElementById('main-header').classList.remove('hidden');
                
                // Carga inicial
                window.loadRoutines();
                
                const savedW = localStorage.getItem('fit_active_workout');
                if(savedW) { 
                    activeWorkout = JSON.parse(savedW); 
                    renderWorkout(); 
                    switchTab('workout-view'); 
                    startTimerMini(); 
                } else { 
                    switchTab('routines-view'); 
                }
            } else { 
                alert("Cuenta en revisión."); signOut(auth); 
            }
        }
    } else {
        setTimeout(() => document.getElementById('loading-screen').classList.add('hidden'), 1500);
        switchTab('auth-view'); document.getElementById('main-header').classList.add('hidden');
        if(communityUnsubscribe) communityUnsubscribe();
    }
});


// ==========================================
// 4. LOGICA PERFIL (ATLETA)
// ==========================================
window.loadProfile = async () => {
    // 1. Datos Básicos
    document.getElementById('profile-name').innerText = userData.name;
    const img=document.getElementById('avatar-img'), txt=document.getElementById('avatar-text');
    if(userData.photo) { txt.style.display='none'; img.src=userData.photo; img.style.display='block'; } else { img.style.display='none'; txt.style.display='block'; }
    window.updatePhotoDisplay(userData);
    
    // 2. Configuración
    document.getElementById('cfg-ranking').checked = userData.rankingOptIn;
    document.getElementById('top-btn-ranking').classList.toggle('hidden', !userData.rankingOptIn);
    document.getElementById('cfg-rest-time').value = userData.restTime || 60;
    if(userData.telegram) document.getElementById('cfg-telegram').value = userData.telegram;

    // 3. Toggles de Secciones
    const toggleSec = (id, show) => document.getElementById(id)?.classList.toggle('hidden', !show);
    toggleSec('user-bio-section', userData.showBio);
    toggleSec('user-skinfolds-section', userData.showSkinfolds);
    toggleSec('user-measures-section', userData.showMeasurements);
    toggleSec('btn-diet-view', userData.dietFile);

    // 4. Estadísticas
    document.getElementById('stat-workouts').innerText = userData.stats.workouts || 0;
    document.getElementById('stat-kg').innerText = userData.stats.totalKg ? (userData.stats.totalKg/1000).toFixed(1)+'t' : 0;
    document.getElementById('stat-sets').innerText = userData.stats.totalSets || 0;
    document.getElementById('stat-reps').innerText = userData.stats.totalReps || 0;

    // 5. Gráficos
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
        const d = userData.measureHistory;
        const ls = d.map(h => new Date(h.date.seconds*1000).toLocaleDateString());
        renderLineChart('chartMeasures', ls, [{l:'Pecho',c:'#FF5733',k:'chest'},{l:'Cintura',c:'#00FF88',k:'waist'},{l:'Brazo',c:'#FF33A8',k:'arm'},{l:'Muslo',c:'#F3FF33',k:'thigh'}].map(p=>({label:p.l, borderColor:p.c, data:d.map(x=>x[p.k]||0)})));
    }
    
    // 6. Historial
    const histDiv = document.getElementById('user-history-list'); 
    histDiv.innerHTML = "Cargando...";
    const snap = await getDocs(query(collection(db, "workouts"), where("uid", "==", currentUser.uid), limit(10))); 
    const workouts = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => b.date - a.date);
    histDiv.innerHTML = workouts.length ? '' : "Sin historial.";
    workouts.forEach(d => {
        const date = d.date ? new Date(d.date.seconds*1000).toLocaleDateString() : '-';
        const btn = `<button class="btn-small btn-outline" style="margin:0; padding:2px 6px;" onclick="window.viewWorkoutDetails('${d.routine}', '${encodeURIComponent(JSON.stringify(d.details))}', '${encodeURIComponent(d.note||"")}')">🔍</button>`;
        histDiv.innerHTML += `<div class="history-row" style="grid-template-columns: 1fr 40px;"><div><span style="color:var(--accent-color)">${date}</span> - ${d.routine}</div><div style="text-align:right;">${btn}</div></div>`;
    });
};

window.updatePhotoDisplay = (u) => {
    const prefix = currentPose === 'front' ? '' : '_back';
    const b = u[`photoBefore${prefix}`] || '', a = u[`photoAfter${prefix}`] || '';
    const dateB = u[`dateBefore${prefix}`] || '-', dateA = u[`dateAfter${prefix}`] || '-';
    document.getElementById('img-before').src = b; document.getElementById('img-overlay').src = a;
    document.getElementById('date-before').innerText = `ANTES (${dateB})`; document.getElementById('date-after').innerText = `AHORA (${dateA})`;
    document.getElementById('slider-handle').style.left = '0%'; document.getElementById('img-overlay').style.clipPath = 'inset(0 0 0 0)';
};

window.uploadAvatar = (inp) => { 
    if(inp.files[0]) { 
        const file = inp.files[0]; const path = `users/${currentUser.uid}/avatar.jpg`; const storageRef = ref(storage, path);
        uploadBytes(storageRef, file).then(async (snapshot) => {
            const url = await getDownloadURL(snapshot.ref); await updateDoc(doc(db,"users",currentUser.uid), {photo: url}); userData.photo = url; window.loadProfile();
        }).catch(e => alert("Error subiendo foto: " + e.message));
    } 
};

window.loadCompImg = (inp, field) => { 
    if(inp.files[0]) { 
        const file = inp.files[0]; const r = new FileReader(); 
        r.onload = (e) => { 
            const img = new Image(); img.src = e.target.result; 
            img.onload = async () => { 
                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const scale = 800 / img.width; canvas.width = 800; canvas.height = img.height * scale; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); 
                canvas.toBlob(async (blob) => {
                    const prefix = currentPose === 'front' ? 'front' : 'back'; const timestamp = Date.now(); const path = `users/${currentUser.uid}/progress/${timestamp}_${prefix}.jpg`; const storageRef = ref(storage, path);
                    try {
                        await uploadBytes(storageRef, blob); const url = await getDownloadURL(storageRef);
                        const fieldPrefix = currentPose === 'front' ? '' : '_back'; const fieldName = field === 'before' ? `photoBefore${fieldPrefix}` : `photoAfter${fieldPrefix}`; const dateField = field === 'before' ? `dateBefore${fieldPrefix}` : `dateAfter${fieldPrefix}`; const today = new Date().toLocaleDateString(); const record = { date: today, url: url };
                        let update = {}; update[fieldName] = url; update[dateField] = today; const histField = fieldPrefix === '' ? 'photoHistoryFront' : 'photoHistoryBack'; update[histField] = arrayUnion(record);
                        await updateDoc(doc(db, "users", currentUser.uid), update); userData[fieldName] = url; userData[dateField] = today; if(!userData[histField]) userData[histField] = []; userData[histField].push(record); updatePhotoDisplay(userData);
                    } catch(err) { alert("Error: " + err.message); }
                }, 'image/jpeg', 0.8);
            }; 
        }; r.readAsDataURL(file); 
    } 
};
window.deletePhoto = async (type) => { if(!confirm("¿Borrar?")) return; const prefix = currentPose === 'front' ? '' : '_back'; const f = type === 'before' ? `photoBefore${prefix}` : `photoAfter${prefix}`; let u={}; u[f]=""; await updateDoc(doc(db,"users",currentUser.uid),u); userData[f]=""; updatePhotoDisplay(userData); };
window.moveSlider = (v) => { document.getElementById('img-overlay').style.clipPath = `inset(0 0 0 ${v}%)`; document.getElementById('slider-handle').style.left = `${v}%`; };
window.switchPose = (pose) => { currentPose = pose; document.getElementById('tab-front').classList.toggle('active', pose==='front'); document.getElementById('tab-back').classList.toggle('active', pose==='back'); updatePhotoDisplay(userData); };


// ==========================================
// 5. LOGICA ADMIN / COACH
// ==========================================
window.loadAdminUsers = async () => {
    const l = document.getElementById('admin-list'); l.innerHTML = '↻ Cargando...';
    try {
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const s = await getDocs(q); l.innerHTML = '';
        
        if(userData.role === 'admin') {
             const btn = document.createElement('button'); btn.className = 'btn'; btn.style.cssText = "width:100%; margin-bottom:15px; background:var(--warning-color); color:black;";
             btn.innerHTML = "📢 CREAR AVISO GLOBAL"; btn.onclick = () => window.openNoticeEditor('GLOBAL'); l.appendChild(btn);
        }

        const usersList = s.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => (b.lastWorkoutDate?.seconds||0) - (a.lastWorkoutDate?.seconds||0));

        usersList.forEach(u => {
            const avatarHtml = u.photo ? `<img src="${u.photo}" class="mini-avatar">` : `<div class="mini-avatar-placeholder">${u.name.charAt(0).toUpperCase()}</div>`;
            let activeStatus = "";
            if (u.lastWorkoutDate) {
                const last = u.lastWorkoutDate.toDate(), today = new Date();
                if (last.getDate() === today.getDate() && last.getMonth() === today.getMonth()) activeStatus = `<span style="color:#00ff88; font-size:0.75rem; margin-left:5px;">🟢 ${last.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>`;
            }
            
            const div = document.createElement('div'); 
            div.className = `admin-user-row ${u.id===currentUser.uid?'is-me':''} ${u.role==='assistant'?'is-coach':''}`;
            div.innerHTML=`${avatarHtml}<div style="overflow:hidden;"><div style="font-weight:bold; white-space:nowrap; overflow:hidden;">${u.name} ${u.role==='assistant'?'🛡️':''} ${activeStatus}</div><div style="font-size:0.75rem; color:#888;">${u.email}</div></div><div style="display:flex; gap:8px;"><button class="btn-outline btn-small" style="color:#fa0; border-color:#fa0; width:40px;" onclick="event.stopPropagation(); window.openNoticeEditor('${u.id}')">📢</button><button class="btn-outline btn-small" style="color:#ccc;" onclick="window.openCoachView('${u.id}', null)">⚙️</button></div>`;
            l.appendChild(div);
        });
    } catch (e) { l.innerHTML = 'Error de permisos.'; console.log(e); }
};

window.openCoachView = async (uid) => {
    selectedUserCoach=uid; 
    const snap = await getDoc(doc(db, "users", uid)); 
    const u = snap.data(); 
    selectedUserObj = u; 
    
    switchTab('coach-detail-view'); 
    window.switchCoachSubTab('progress');

    document.getElementById('coach-user-name').innerText = u.name + (u.role === 'assistant' ? ' 🛡️' : ''); 
    document.getElementById('coach-user-email').innerHTML = `${u.email} <br> ${u.telegram ? `<span style="color:#0088cc">Telegram: ${u.telegram}</span>` : ''}`;
    document.getElementById('coach-user-meta').innerText = `${u.gender==='female'?'♀️':'♂️'} ${u.age} años • ${u.height} cm`;
    
    const img = document.getElementById('coach-user-img'), initials = document.getElementById('coach-user-initial');
    if(u.photo) { img.src=u.photo; img.style.display='block'; initials.style.display='none'; } 
    else { img.style.display='none'; initials.style.display='block'; initials.innerText = u.name.charAt(0).toUpperCase(); }
    
    document.getElementById('pending-approval-banner').classList.toggle('hidden', u.approved);
    
    window.updateCoachPhotoDisplay('front');
    
    // Toggles
    ['Bio','Skinfolds','Measures','Videos'].forEach(k => {
        const el = document.getElementById(`coach-toggle-${k.toLowerCase()}`);
        if(el) el.checked = !!u[`show${k}`];
    });

    // Dietas
    const dietSel = document.getElementById('coach-diet-select'); dietSel.innerHTML = '<option value="">-- Sin Dieta --</option>';
    AVAILABLE_DIETS.forEach(d => dietSel.add(new Option(d.name, d.file, false, u.dietFile === d.file)));

    // Gráficos Coach
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

    // Historial
    const st = u.stats || {}; 
    document.getElementById('coach-stats-text').innerHTML = `<div class="stat-pill"><b>${st.workouts||0}</b><span>ENTRENOS</span></div><div class="stat-pill"><b>${(st.totalKg/1000||0).toFixed(1)}t</b><span>CARGA</span></div><div class="stat-pill"><b>${u.age||'N/D'}</b><span>AÑOS</span></div>`;
    
    const hList = document.getElementById('coach-history-list'); hList.innerHTML = 'Cargando...';
    const wSnap = await getDocs(query(collection(db,"workouts"), where("uid","==",uid), limit(20)));
    hList.innerHTML = wSnap.empty ? 'Sin datos.' : '';
    wSnap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>b.date-a.date).forEach(d => {
        hList.innerHTML += `<div class="history-row" style="grid-template-columns: 60px 1fr 30px 80px;"><div>${new Date(d.date.seconds*1000).toLocaleDateString()}</div><div style="overflow:hidden;text-overflow:ellipsis;">${d.routine}</div><div>${d.rpe==='Suave'?'🟢':d.rpe==='Duro'?'🟠':'🔴'}</div><button class="btn-small btn-outline" onclick="viewWorkoutDetails('${d.routine}','${encodeURIComponent(JSON.stringify(d.details))}','${encodeURIComponent(d.note||"")}')">Ver</button></div>`;
    });
    
    window.loadCoachAssignedRoutines(uid);
};

window.loadCoachAssignedRoutines = async (uid) => {
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
    
    const pSelect = document.getElementById('coach-plan-select'); pSelect.innerHTML = '<option value="">Selecciona plan...</option>';
    (await getDocs(collection(db, "plans"))).forEach(p => pSelect.add(new Option(p.data().name, p.id)));
};

window.switchCoachPose = (pose) => { coachCurrentPose = pose; document.getElementById('coach-tab-front').classList.toggle('active', pose==='front'); document.getElementById('coach-tab-back').classList.toggle('active', pose==='back'); window.updateCoachPhotoDisplay(pose); };

window.updateCoachPhotoDisplay = (pose) => {
    const u = selectedUserObj; if(!u) return; const prefix = pose === 'front' ? '' : '_back'; const histField = prefix === '' ? 'photoHistoryFront' : 'photoHistoryBack'; const history = u[histField] || []; const pCont = document.getElementById('coach-photos-container');
    pCont.innerHTML = `<div style="display:flex; gap:5px; margin-bottom:10px;"><select id="c-sel-before" onchange="window.updateCoachSliderImages()" style="margin:0; font-size:0.8rem;"></select><select id="c-sel-after" onchange="window.updateCoachSliderImages()" style="margin:0; font-size:0.8rem;"></select></div><div class="compare-wrapper" style="min-height:250px; background:#000; position:relative;"><div class="slider-labels"><span class="label-tag">ANTES</span><span class="label-tag">AHORA</span></div><img src="" id="c-img-before" class="compare-img" style="width:100%; height:100%; object-fit:contain;"><img src="" id="c-img-after" class="compare-img img-overlay" style="clip-path:inset(0 0 0 0); width:100%; height:100%; object-fit:contain;"><div class="slider-handle" id="coach-slider-handle" style="left:0%"><div class="slider-btn"></div></div></div><input type="range" min="0" max="100" value="0" style="width:100%; margin-top:15px;" oninput="window.moveCoachSlider(this.value)">`;
    const selB = document.getElementById('c-sel-before'); const selA = document.getElementById('c-sel-after');
    if(history.length === 0) { const current = u[`photoBefore${prefix}`]; const opt = new Option(current ? "Actual" : "Sin fotos", current || ""); selB.add(opt); selA.add(opt.cloneNode(true)); } 
    else { history.forEach((h, i) => { const label = h.date || `Foto ${i+1}`; selB.add(new Option(label, h.url)); selA.add(new Option(label, h.url)); }); selB.selectedIndex = 0; selA.selectedIndex = history.length - 1; }
    window.updateCoachSliderImages();
};
window.updateCoachSliderImages = () => { const urlB = document.getElementById('c-sel-before').value; const urlA = document.getElementById('c-sel-after').value; document.getElementById('c-img-before').src = urlB; document.getElementById('c-img-after').src = urlA; };
window.moveCoachSlider = (v) => { document.getElementById('c-img-after').style.clipPath = `inset(0 0 0 ${v}%)`; document.getElementById('coach-slider-handle').style.left = `${v}%`; };


// ==========================================
// 6. WORKOUT LOGIC
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
            const name = exObj.n || exObj; const setsCfg = { s: parseInt(exObj.series)||5, r: (exObj.reps||"20-16-16-16-16").split('-') };
            const data = getExerciseData(name);
            let sets = Array(setsCfg.s).fill().map((_, i) => ({ r: parseInt(setsCfg.r[i] || setsCfg.r[setsCfg.r.length-1]), w: 0, d: false, prev: '-' }));
            if(lastData) { const prevEx = lastData.find(ld => ld.n === name); if(prevEx) sets.forEach((s, i) => { if(prevEx.s[i]) s.prev = `${prevEx.s[i].r}x${prevEx.s[i].w}kg${prevEx.s[i].isDrop?'(D)':''}`; }); }
            return { n:name, img:data.img, mInfo:data.mInfo, video:data.v, sets:sets, superset: exObj.s||false, note:"" };
        }) 
    };
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

// Helpers Workout
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
window.initSwap=(i)=>{swapTargetIndex=i; const m=activeWorkout.exs[i].mInfo.main; const list=document.getElementById('swap-list'); list.innerHTML=''; EXERCISES.filter(e=>getMuscleInfoByGroup(e.m).main===m && e.n!==activeWorkout.exs[i].n).forEach(e=>{const d=document.createElement('div');d.style.padding="10px";d.style.borderBottom="1px solid #333";d.innerHTML=`<b>${e.n}</b>`;d.onclick=()=>window.performSwap(e.n);list.appendChild(d);}); window.openModal('modal-swap');};
window.performSwap=(n)=>{const d=getExerciseData(n); const oldSets=activeWorkout.exs[swapTargetIndex].sets.map(s=>({...s, prev:'-', d:false})); activeWorkout.exs[swapTargetIndex]={...activeWorkout.exs[swapTargetIndex], n:n, img:d.img, video:d.v, sets:oldSets}; saveLocalWorkout(); renderWorkout(); window.closeModal('modal-swap');};

// --- VISUALIZACION DETALLES (DROPDOWNS) ---
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

// --- FUNCIONES RESTANTES ---
window.toggleAuth=(m)=>{document.getElementById('login-form').classList.toggle('hidden',m!=='login');document.getElementById('register-form').classList.toggle('hidden',m!=='register');};
window.logout=()=>signOut(auth).then(()=>location.reload());
window.viewFullImage=(s)=>{if(s) {document.getElementById('full-image-src').src=s; window.openModal('modal-image-viewer');}};
window.saveNote=()=>{activeWorkout.exs[noteTargetIndex].note=document.getElementById('exercise-note-input').value; window.closeModal('modal-note');};
window.openNoteModal=(i)=>{noteTargetIndex=i; document.getElementById('exercise-note-input').value=activeWorkout.exs[i].note||""; window.openModal('modal-note');};
window.openVideo=(url)=>{ if(!url) return; let embed = url.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/"); document.getElementById('youtube-frame').src = embed+"?autoplay=1"; window.openModal('modal-video'); };
window.closeVideo=()=>{window.closeModal('modal-video'); document.getElementById('youtube-frame').src = "";};
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

// ADMIN
window.loadAdminPlans = async () => {
    const list = document.getElementById('admin-plans-list'); const selector = document.getElementById('plan-routine-selector');
    const routinesSnap = await getDocs(collection(db, "routines"));
    selector.innerHTML = '';
    routinesSnap.forEach(d => {
        const div = document.createElement('div'); div.className = "selector-item";
        div.innerHTML = `<input type="checkbox" class="plan-check selector-checkbox" value="${d.id}" id="chk-${d.id}"><label for="chk-${d.id}" class="selector-label">${d.data().name}</label>`;
        selector.appendChild(div);
    });
    const plansSnap = await getDocs(collection(db, "plans")); list.innerHTML = '';
    if(plansSnap.empty) { list.innerHTML = "<div style='text-align:center; padding:20px; color:#666;'>No hay planes creados.</div>"; return; }
    const uSnap = await getDocs(collection(db, "users")); const userMap = {}; uSnap.forEach(u => userMap[u.id] = u.data().name);
    plansSnap.forEach(d => {
        const p = d.data(); const div = document.createElement('div'); div.className = "assigned-routine-item";
        let author = p.createdBy === currentUser.uid ? "Mía (Admin)" : (userMap[p.createdBy] || "Admin");
        div.innerHTML = `<div style="flex:1;"><b>${p.name}</b><br><span style="font-size:0.7rem; color:#666;">Creado por: ${author} • ${p.routines.length} Rutinas</span></div><div style="display:flex; gap:5px;"><button class="btn-small btn-outline" style="margin:0; width:auto; border-color:#666;" onclick="window.viewPlanContent('${p.name}', '${d.id}')">👁️</button><button class="btn-small btn" style="margin:0; width:auto;" onclick="window.openAssignPlanModal('${d.id}')">📤</button><button class="btn-small btn-danger" style="margin:0; width:auto; border:none;" onclick="window.deletePlan('${d.id}')">🗑️</button></div>`;
        list.appendChild(div);
    });
};
window.toggleAdminMode=(mode)=>{ document.getElementById('tab-users').classList.toggle('active',mode==='users'); document.getElementById('tab-lib').classList.toggle('active',mode==='lib'); document.getElementById('tab-plans').classList.toggle('active',mode==='plans'); document.getElementById('admin-users-card').classList.toggle('hidden',mode!=='users'); document.getElementById('admin-lib-card').classList.toggle('hidden',mode!=='lib'); document.getElementById('admin-plans-card').classList.toggle('hidden',mode!=='plans'); if(mode==='users')window.loadAdminUsers(); if(mode==='lib')window.loadAdminLibrary(); if(mode==='plans')window.loadAdminPlans(); };
window.deleteUser=async()=>{if(!selectedUserCoach)return; if(prompt("Escribe BORRAR:")==='BORRAR'){ await deleteDoc(doc(db,"users",selectedUserCoach)); window.loadAdminUsers(); window.switchTab('admin-view'); }};
window.toggleUserFeature=async(f,v)=>{if(selectedUserCoach){await updateDoc(doc(db,"users",selectedUserCoach),{[f]:v}); openCoachView(selectedUserCoach,selectedUserObj);}};
window.unassignRoutine=async(rid)=>{if(confirm("¿Quitar?")){await updateDoc(doc(db,"routines",rid),{assignedTo:arrayRemove(selectedUserCoach)}); openCoachView(selectedUserCoach,selectedUserObj);}};
window.assignRoutine=async()=>{const rid=document.getElementById('coach-routine-select').value; if(!rid)return alert("Selecciona"); await updateDoc(doc(db,"routines",rid),{assignedTo:arrayUnion(selectedUserCoach)}); alert("Asignada"); openCoachView(selectedUserCoach,selectedUserObj);};
window.assignPlan=async()=>{const pid=document.getElementById('coach-plan-select').value; if(!pid)return alert("Selecciona"); const p=(await getDoc(doc(db,"plans",pid))).data(); await Promise.all(p.routines.map(rid=>updateDoc(doc(db,"routines",rid),{assignedTo:arrayUnion(selectedUserCoach)}))); alert("Plan Asignado"); openCoachView(selectedUserCoach,selectedUserObj);};
window.goToCreateRoutine=()=>{window.switchTab('routines-view'); window.openEditor();};
window.filterCoachRoutines=(t)=>{ const s=document.getElementById('coach-routine-select'); s.innerHTML=''; allRoutinesCache.filter(r=>normalizeText(r.name).includes(normalizeText(t))).forEach(r=>s.add(new Option(r.name,r.id))); };

document.getElementById('btn-login').onclick=()=>signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value).catch(e=>alert(e.message));
document.getElementById('btn-register').onclick=async()=>{
    const secretCode = document.getElementById('reg-code').value; const tgUser = document.getElementById('reg-telegram')?.value || ""; 
    try{ const c=await createUserWithEmailAndPassword(auth,document.getElementById('reg-email').value,document.getElementById('reg-pass').value);
        await setDoc(doc(db,"users",c.user.uid),{name:document.getElementById('reg-name').value, email:document.getElementById('reg-email').value, secretCode, telegram: tgUser, approved: false, role: 'athlete', gender:document.getElementById('reg-gender').value, age:parseInt(document.getElementById('reg-age').value), height:parseInt(document.getElementById('reg-height').value), weightHistory: [], measureHistory: [], skinfoldHistory: [], bioHistory: [], prs: {}, stats: {workouts:0, totalKg:0, totalSets:0, totalReps:0}, muscleStats: {}, joined: serverTimestamp(), showVideos: false, showBio: false });
    }catch(e){alert("Error: " + e.message);}
};
function showToast(m){const t=document.createElement('div');t.className='toast-msg';t.innerText=m;document.body.appendChild(t);setTimeout(()=>t.remove(),4000);}
function saveLocalWorkout(){localStorage.setItem('fit_active_workout',JSON.stringify(activeWorkout));}
