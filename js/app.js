import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Iniciada (v6.5 - Sistema Completo con Avisos Quick-Access)...");

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

const AVAILABLE_DIETS = [
    { name: "Dieta Volumen (3000kcal)", file: "volumen_3000.html" },
    { name: "Dieta Definición (2000kcal)", file: "definicion_2000.html" },
    { name: "Dieta Mantenimiento", file: "mantenimiento.html" },
    { name: "Dieta Anti Inflamatoria", file: "Anti.html" },
    { name: "Ayuno Intermitente", file: "ayuno.html" }
];

// --- ESTADO GLOBAL ---
let audioCtx = null;
let currentUser = null; 
let userData = null; 
let activeWorkout = null; 
let timerInt = null; 
let durationInt = null;
let wakeLock = null;
let totalRestTime = 60; 
let restEndTime = 0; 
let noteTargetIndex = null;
let communityUnsubscribe = null; 
let noticesUnsubscribe = null;

let rankFilterTime = 'all';      
let rankFilterGender = 'all';    
let rankFilterCat = 'kg';        

let chartInstance = null; let progressChart = null; let fatChartInstance = null; let bioChartInstance = null; let measureChartInstance = null; let coachFatChart = null; let coachBioChart = null; let coachMeasureChart = null; let radarChartInstance = null; let coachChart = null; let userRadarChart = null; let coachRadarChart = null;

let selectedUserCoach = null; 
let selectedUserObj = null; 
let editingRoutineId = null; 
let currentPose = 'front'; 
let coachCurrentPose = 'front'; 
let allRoutinesCache = []; 
let currentRoutineSelections = [];
window.currentRoutineSelections = currentRoutineSelections; 
let swapTargetIndex = null; 
let selectedPlanForMassAssign = null; 
let selectedRoutineForMassAssign = null;
let assignMode = 'plan'; 

// --- UTILIDADES CORE ---
const normalizeText = (text) => text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

function showToast(msg) { 
    const container = document.getElementById('toast-container') || (() => {
        const d = document.createElement('div'); d.id = 'toast-container'; document.body.appendChild(d); return d;
    })();
    const t = document.createElement('div'); t.className = 'toast-msg'; t.innerText = msg;
    container.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000); 
}

let scrollPos = 0;
window.openModal = (id) => {
    scrollPos = window.pageYOffset;
    document.body.style.top = `-${scrollPos}px`;
    document.body.classList.add('modal-open');
    const m = document.getElementById(id);
    if(m) m.classList.add('active');
};
window.closeModal = (id) => {
    const m = document.getElementById(id);
    if(m) m.classList.remove('active');
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, scrollPos);
};

window.toggleElement = (id) => { const el = document.getElementById(id); if(el) el.classList.toggle('hidden'); };

// --- AUDIO ENGINE ---
const SILENT_MP3_URL = "https://raw.githubusercontent.com/anars/blank-audio/master/1-minute-of-silence.mp3";
let htmlAudioElement = new Audio(SILENT_MP3_URL);
htmlAudioElement.loop = true;
htmlAudioElement.preload = 'auto';

function initAudioEngine() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    htmlAudioElement.play().catch(e => console.log("Audio block expected."));
}

function playTickSound(isFinal = false) {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = isFinal ? 600 : 1000; 
    osc.type = isFinal ? 'square' : 'sine';
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    osc.start(now);
    const duration = isFinal ? 0.8 : 0.1;
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.stop(now + duration);
    if("vibrate" in navigator) navigator.vibrate(isFinal ? [500] : [50]);
}

// --- SISTEMA DE AVISOS v6.5 ---
function initNoticesListener() {
    if (noticesUnsubscribe) noticesUnsubscribe();
    if (!currentUser) return;
    const display = document.getElementById('notices-display-area') || (() => {
        const d = document.createElement('div'); d.id = 'notices-display-area'; d.style.marginBottom = '20px';
        document.getElementById('routines-view')?.prepend(d); return d;
    })();
    const q = query(collection(db, "notices"), where("active", "==", true), orderBy("createdAt", "desc"), limit(5));
    noticesUnsubscribe = onSnapshot(q, (snapshot) => {
        display.innerHTML = '';
        snapshot.forEach(docSnap => {
            const n = docSnap.data();
            const isRead = userData?.readNotices?.includes(docSnap.id);
            if (!isRead && (n.target === 'all' || n.target === currentUser.uid)) {
                const card = document.createElement('div'); card.className = 'card notice-card-animate';
                card.style.borderLeft = n.target === 'all' ? '4px solid var(--warning-color)' : '4px solid var(--success-color)';
                const imgHtml = n.image ? `<img src="${n.image}" style="width:100%; border-radius:8px; margin:10px 0; max-height:250px; object-fit:cover;" onclick="window.viewFullImage(this.src)">` : '';
                const linkHtml = n.link ? `<button class="btn-small btn-outline" onclick="window.open('${n.link}', '_blank')" style="margin-top:10px; border-color:var(--accent-color); color:var(--accent-color);">🔗 ENLACE</button>` : '';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <h4 style="color:white; margin:0; font-size:1rem;">${n.target === 'all' ? '📢 AVISO GLOBAL' : '📩 MENSAJE PERSONAL'}</h4>
                        <button onclick="window.dismissNotice('${docSnap.id}')" style="background:none; border:none; color:#666; font-size:1.2rem;">✕</button>
                    </div>
                    <div style="font-weight:bold; color:white; margin:5px 0;">${n.title}</div>
                    <p style="color:#aaa; font-size:0.85rem; line-height:1.4;">${n.text}</p>
                    ${imgHtml}${linkHtml}`;
                display.appendChild(card);
            }
        });
    });
}

window.dismissNotice = async (id) => {
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { readNotices: arrayUnion(id) });
        if(!userData.readNotices) userData.readNotices = []; userData.readNotices.push(id);
    } catch(e) { console.error(e); }
};

window.openNoticeModal = (uid, name) => {
    selectedUserCoach = uid;
    document.getElementById('modal-notice-target-name').innerText = name || "Atleta";
    window.openModal('modal-send-notice');
};

window.publishNotice = async (target) => {
    const isGlobal = target === 'all';
    const title = document.getElementById(isGlobal ? 'adm-notice-title' : 'ind-notice-title')?.value;
    const text = document.getElementById(isGlobal ? 'adm-notice-text' : 'ind-notice-text')?.value;
    const link = document.getElementById(isGlobal ? 'adm-notice-link' : 'ind-notice-link')?.value;
    const file = document.getElementById(isGlobal ? 'adm-notice-file' : 'ind-notice-file')?.files[0];
    if (!title || !text) return alert("Título y texto obligatorios");
    const btn = event.target; btn.innerText = "⏳..."; btn.disabled = true;
    try {
        let imageUrl = "";
        if (file) {
            const storageRef = ref(storage, `notices/${Date.now()}_${file.name}`);
            const snap = await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(snap.ref);
        }
        await addDoc(collection(db, "notices"), {
            title, text, link: link || "", image: imageUrl, target, active: true, createdAt: serverTimestamp(), createdBy: currentUser.uid
        });
        alert("✅ Enviado correctamente");
        if(!isGlobal) window.closeModal('modal-send-notice');
        else { document.getElementById('adm-notice-title').value = ""; document.getElementById('adm-notice-text').value = ""; }
    } catch (e) { alert("Error: " + e.message); }
    finally { btn.innerText = isGlobal ? "PUBLICAR" : "ENVIAR AVISO"; btn.disabled = false; }
};

// --- AUTH & BOOTSTRAP ---
onAuthStateChanged(auth, async (user) => {
    if(user) {
        currentUser = user;
        const snap = await getDoc(doc(db,"users",user.uid));
        if(snap.exists()){
            userData = snap.data();
            initCommunityListener();
            initNoticesListener();
            checkPhotoVisualReminder();
            checkPhotoReminder();
            injectTelegramUI();
            if(userData.role === 'admin' || userData.role === 'assistant') document.getElementById('top-btn-coach').classList.remove('hidden');
            if(userData.approved){
                setTimeout(() => { document.getElementById('loading-screen').classList.add('hidden'); }, 1500); 
                document.getElementById('main-header').classList.remove('hidden');
                loadRoutines();
                const savedW = localStorage.getItem('fit_active_workout');
                if(savedW) { activeWorkout = JSON.parse(savedW); renderWorkout(); switchTab('workout-view'); startTimerMini(); } else { switchTab('routines-view'); }
            } else { alert("Cuenta en revisión."); signOut(auth); }
        }
    } else {
        setTimeout(() => { document.getElementById('loading-screen').classList.add('hidden'); }, 1500);
        switchTab('auth-view'); document.getElementById('main-header').classList.add('hidden');
    }
});

// --- UI NAVIGATION ---
window.switchTab = (t) => {
    document.querySelectorAll('.view-container').forEach(e => e.classList.remove('active'));
    document.getElementById(t).classList.add('active');
    document.getElementById('main-container').scrollTop = 0;
    document.querySelectorAll('.top-nav-item').forEach(n => n.classList.remove('active'));
    if (t === 'routines-view') document.getElementById('top-btn-routines').classList.add('active');
    if (t === 'profile-view') { document.getElementById('top-btn-profile').classList.add('active'); loadProfile(); }
    if (t === 'admin-view' || t === 'coach-detail-view') document.getElementById('top-btn-coach').classList.add('active');
};

// --- PROFILE & PROGRESS ENGINE ---
function updatePhotoDisplay(u) {
    const prefix = currentPose === 'front' ? '' : '_back';
    const b = u[`photoBefore${prefix}`] || '', a = u[`photoAfter${prefix}`] || '';
    const dateB = u[`dateBefore${prefix}`] || '-', dateA = u[`dateAfter${prefix}`] || '-';
    document.getElementById('img-before').src = b; document.getElementById('img-overlay').src = a;
    document.getElementById('date-before').innerText = `ANTES (${dateB})`; document.getElementById('date-after').innerText = `AHORA (${dateA})`;
    document.getElementById('slider-handle').style.left = '0%'; document.getElementById('img-overlay').style.clipPath = 'inset(0 0 0 0)';
}

window.loadProfile = async () => {
    document.getElementById('profile-name').innerText = userData.name;
    if(userData.photo) {
        document.getElementById('avatar-text').style.display='none';
        document.getElementById('avatar-img').src = userData.photo;
        document.getElementById('avatar-img').style.display='block';
    }
    updatePhotoDisplay(userData);
    if(userData.showBio && userData.bioHistory?.length > 0) renderBioChart('chartBio', userData.bioHistory);
    if(userData.showSkinfolds && userData.skinfoldHistory?.length > 0) {
        const ctxF = document.getElementById('chartFat');
        if(fatChartInstance) fatChartInstance.destroy();
        fatChartInstance = new Chart(ctxF, { type: 'line', data: { labels: userData.skinfoldHistory.map(f => new Date(f.date.seconds*1000).toLocaleDateString()), datasets: [{ label: '% Grasa', data: userData.skinfoldHistory.map(f => f.fat || 0), borderColor: '#ffaa00' }] }, options: { maintainAspectRatio: false } });
    }
    if(userData.showMeasurements && userData.measureHistory?.length > 0) renderMeasureChart('chartMeasures', userData.measureHistory);
    document.getElementById('stat-workouts').innerText = userData.stats.workouts || 0;
    document.getElementById('stat-kg').innerText = userData.stats.totalKg ? (userData.stats.totalKg/1000).toFixed(1)+'t' : 0;
    
    const ctx = document.getElementById('weightChart');
    if(chartInstance) chartInstance.destroy();
    const dataW = userData.weightHistory?.length > 0 ? userData.weightHistory : [70];
    chartInstance = new Chart(ctx, { type:'line', data:{ labels:dataW.map((_,i)=>i), datasets:[{label:'Kg', data:dataW, borderColor:'#ff3333', fill:true, tension:0.4}] }, options:{maintainAspectRatio:false} });
    
    renderMuscleRadar('userMuscleChart', userData.muscleStats || {});
    
    const histDiv = document.getElementById('user-history-list'); histDiv.innerHTML = "Cargando...";
    const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid));
    const snap = await getDocs(q);
    const workouts = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => b.date - a.date).slice(0, 5);
    histDiv.innerHTML = workouts.length ? '' : "Sin historial.";
    workouts.forEach(d => {
        const date = d.date ? new Date(d.date.seconds*1000).toLocaleDateString() : '-';
        histDiv.innerHTML += `<div class="history-row" style="grid-template-columns: 1fr 40px;"><div><span style="color:var(--accent-color)">${date}</span> - ${d.routine}</div><div style="text-align:right;"><button class="btn-small btn-outline" style="margin:0; padding:2px 6px;" onclick="window.viewWorkoutDetails('${d.routine}', '${encodeURIComponent(JSON.stringify(d.details))}', '${encodeURIComponent(d.note||"")}')">🔍</button></div></div>`;
    });
};

// --- WORKOUT ENGINE ---
function saveLocalWorkout() { if(activeWorkout) localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); }

window.startWorkout = async (rid) => {
    initAudioEngine();
    if(document.getElementById('cfg-wake')?.checked && 'wakeLock' in navigator) try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){}
    try {
        const snap = await getDoc(doc(db,"routines",rid)); const r = snap.data();
        let lastW = null; const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid));
        const wSnap = await getDocs(q); const sameR = wSnap.docs.map(d=>d.data()).filter(d => d.routine === r.name).sort((a,b) => b.date - a.date);
        if(sameR.length > 0) lastW = sameR[0].details;

        activeWorkout = { name: r.name, startTime: Date.now(), exs: r.exercises.map(exObj => {
            const name = typeof exObj === 'string' ? exObj : exObj.n; const data = getExerciseData(name);
            const series = parseInt(exObj.series) || 5; const reps = (exObj.reps || "12").split('-');
            let sets = Array(series).fill().map((_, i) => ({ r: parseInt(reps[i] || reps[0]), w: 0, d: false, prev: '-', numDisplay: (i + 1).toString() }));
            if(lastW) { const pEx = lastW.find(ld => ld.n === name); if(pEx?.s) { sets = sets.map((s, i) => { if(pEx.s[i]) s.prev = `${pEx.s[i].r}x${pEx.s[i].w}kg`; return s; }); } }
            return { n:name, img:data.img, mInfo: data.mInfo, type: data.type, video: data.v, sets, superset: exObj.s || false, note: "" }; 
        })};
        saveLocalWorkout(); renderWorkout(); switchTab('workout-view'); startTimerMini();
    } catch(e) { console.error(e); }
};

function renderWorkout() {
    const c = document.getElementById('workout-exercises'); if(!c) return; c.innerHTML = '';
    document.getElementById('workout-title').innerText = activeWorkout.name;
    activeWorkout.exs.forEach((e, i) => {
        const card = document.createElement('div'); card.className = 'card';
        if(e.superset) card.style.borderBottom = "2px dashed var(--accent-color)";
        let setsHtml = `<div class="set-header"><div>#</div><div>PREV</div><div>REPS</div><div>KG</div><div></div></div>`;
        e.sets.forEach((s, j) => {
            setsHtml += `<div class="set-row">
                <div class="set-num">${s.numDisplay}</div><div class="prev-data">${s.prev}</div>
                <div><input type="number" value="${s.r}" onchange="window.uS(${i},${j},'r',this.value)"></div>
                <div><input type="number" placeholder="kg" onchange="window.uS(${i},${j},'w',this.value)"></div>
                <button class="btn-outline ${s.d ? 'btn-done' : ''}" onclick="window.tS(${i},${j})">${s.d ? '✓' : ''}</button>
            </div>`;
        });
        card.innerHTML = `<h3 style="display:flex; justify-content:space-between; align-items:center;">${e.n} <div><button class="btn-small btn-outline" onclick="window.openNoteModal(${i})">📝</button> ${e.video ? `<button class="btn-small btn-outline" style="border-color:red;" onclick="window.openVideo('${e.video}')">🎥</button>` : ''}</div></h3>${setsHtml}`;
        c.appendChild(card);
    });
}

window.uS = (i,j,k,v) => { if(activeWorkout.exs[i]?.sets[j]) { activeWorkout.exs[i].sets[j][k] = v; saveLocalWorkout(); } };
window.tS = (i,j) => { activeWorkout.exs[i].sets[j].d = !activeWorkout.exs[i].sets[j].d; if(activeWorkout.exs[i].sets[j].d) openRest(); renderWorkout(); saveLocalWorkout(); };

function startTimerMini() {
    if(durationInt) clearInterval(durationInt);
    durationInt = setInterval(() => {
        if(!activeWorkout) return; const diff = Math.floor((Date.now() - activeWorkout.startTime)/1000);
        const d = document.getElementById('mini-timer'); if(d) d.innerText = `${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,'0')}`;
    }, 1000);
}

function openRest() {
    window.openModal('modal-timer'); let time = userData.restTime || 60; totalRestTime = time;
    if(timerInt) clearInterval(timerInt);
    timerInt = setInterval(() => {
        time--; document.getElementById('timer-display').innerText = time;
        const offset = 565 - (time / totalRestTime) * 565;
        document.getElementById('timer-progress-ring').style.strokeDashoffset = offset;
        if(time <= 5 && time > 0) playTickSound(false);
        if(time <= 0) { clearInterval(timerInt); window.closeModal('modal-timer'); playTickSound(true); }
    }, 1000);
}

// --- ADMIN / COACH PANEL ---
window.loadAdminUsers = async () => {
    const l = document.getElementById('admin-list'); l.innerHTML = '↻ Cargando...';
    try {
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const s = await getDocs(q); l.innerHTML = '';
        
        const globalCard = document.createElement('div'); globalCard.className = 'card';
        globalCard.style.borderLeft = '4px solid var(--warning-color)';
        globalCard.innerHTML = `
            <h4 style="color:var(--warning-color); margin-bottom:10px;">📢 AVISO GLOBAL (EQUIPO)</h4>
            <input type="text" id="adm-notice-title" placeholder="Título...">
            <textarea id="adm-notice-text" placeholder="Mensaje..." rows="1"></textarea>
            <div style="display:flex; gap:5px; margin-top:5px;">
                <input type="text" id="adm-notice-link" placeholder="Link" style="flex:1; margin:0;">
                <button class="btn-small btn-outline" onclick="document.getElementById('adm-notice-file').click()">📷</button>
                <input type="file" id="adm-notice-file" class="hidden" accept="image/*">
                <button class="btn-small btn" onclick="window.publishNotice('all')" style="background:var(--warning-color); color:black;">ENVIAR</button>
            </div>`;
        l.appendChild(globalCard);

        const usersList = s.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.lastWorkoutDate?.seconds || 0) - (a.lastWorkoutDate?.seconds || 0));
        usersList.forEach(u => {
            const avatar = u.photo ? `<img src="${u.photo}" class="mini-avatar">` : `<div class="mini-avatar-placeholder">${u.name.charAt(0)}</div>`;
            const div = document.createElement('div'); div.className = "admin-user-row";
            div.innerHTML = `
                ${avatar}
                <div style="flex:1; overflow:hidden;" onclick="window.openCoachView('${u.id}')">
                    <div style="font-weight:bold; color:white;">${u.name}</div>
                    <div style="font-size:0.7rem; color:#666;">${u.email}</div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn-small btn-outline" style="border-color:var(--success-color); color:var(--success-color);" onclick="window.openNoticeModal('${u.id}', '${u.name}')">📩</button>
                    <button class="btn-small btn-outline" onclick="window.openCoachView('${u.id}')">⚙️</button>
                </div>`;
            l.appendChild(div);
        });
    } catch (e) { l.innerHTML = 'Error.'; }
};

window.openCoachView = async (uid) => {
    selectedUserCoach = uid; const snap = await getDoc(doc(db, "users", uid)); selectedUserObj = snap.data();
    switchTab('coach-detail-view'); document.getElementById('coach-user-name').innerText = selectedUserObj.name;
    document.getElementById('coach-user-email').innerText = selectedUserObj.email;
    if(selectedUserObj.photo) { document.getElementById('coach-user-img').src = selectedUserObj.photo; document.getElementById('coach-user-img').style.display='block'; document.getElementById('coach-user-initial').style.display='none'; }
    else { document.getElementById('coach-user-img').style.display='none'; document.getElementById('coach-user-initial').style.display='block'; document.getElementById('coach-user-initial').innerText = selectedUserObj.name.charAt(0); }
    
    // Dietas & Features
    const dietSel = document.getElementById('coach-diet-select'); dietSel.innerHTML = '<option value="">-- Sin Dieta --</option>';
    AVAILABLE_DIETS.forEach(d => { const opt = new Option(d.name, d.file); if(selectedUserObj.dietFile === d.file) opt.selected = true; dietSel.appendChild(opt); });
    
    document.getElementById('coach-toggle-bio').checked = !!selectedUserObj.showBio;
    document.getElementById('coach-toggle-skinfolds').checked = !!selectedUserObj.showSkinfolds;
    document.getElementById('coach-toggle-measures').checked = !!selectedUserObj.showMeasurements;
    
    // Assigned Routines
    const rList = document.getElementById('coach-assigned-list'); rList.innerHTML = 'Cargando...';
    const rSnap = await getDocs(collection(db, "routines")); rList.innerHTML = '';
    rSnap.forEach(d => { if(d.data().assignedTo?.includes(uid)) rList.innerHTML += `<div class="assigned-routine-item"><span>${d.data().name}</span><button onclick="window.unassignRoutine('${d.id}')">❌</button></div>`; });
    
    renderMuscleRadar('coachMuscleChart', selectedUserObj.muscleStats || {});
    updateCoachPhotoDisplay('front');
};

// --- LIBRERÍA & PLANES ---
window.loadAdminLibrary = async () => {
    const l = document.getElementById('admin-lib-list'); l.innerHTML = '↻';
    const s = await getDocs(collection(db, "routines")); l.innerHTML = '<button class="btn" style="margin-bottom:15px;" onclick="window.openEditor()">+ NUEVA RUTINA</button>';
    s.forEach(d => {
        const r = d.data(); const div = document.createElement('div'); div.className = "assigned-routine-item";
        div.innerHTML = `<div style="flex:1;"><b>${r.name}</b></div><button class="btn-small btn-outline" onclick="window.openEditor('${d.id}')">✏️</button><button class="btn-small btn" onclick="window.initMassAssignRoutine('${d.id}')">📤</button><button class="btn-small btn-danger" onclick="window.delRoutine('${d.id}')">🗑️</button>`;
        l.appendChild(div);
    });
};

window.loadAdminPlans = async () => {
    const list = document.getElementById('admin-plans-list'); const sel = document.getElementById('plan-routine-selector');
    const rSnap = await getDocs(collection(db, "routines")); sel.innerHTML = '';
    rSnap.forEach(d => { sel.innerHTML += `<div class="selector-item"><input type="checkbox" class="plan-check" value="${d.id}" id="chk-${d.id}"><label for="chk-${d.id}">${d.data().name}</label></div>`; });
    const pSnap = await getDocs(collection(db, "plans")); list.innerHTML = '';
    pSnap.forEach(d => { const p = d.data(); list.innerHTML += `<div class="assigned-routine-item"><b>${p.name}</b><button class="btn-small btn" onclick="window.openAssignPlanModal('${d.id}')">📤</button><button class="btn-small btn-danger" onclick="window.deletePlan('${d.id}')">🗑️</button></div>`; });
};

window.createPlan = async () => {
    const n = document.getElementById('new-plan-name').value; const checks = Array.from(document.querySelectorAll('.plan-check:checked')).map(c => c.value);
    if(!n || checks.length === 0) return alert("Faltan datos");
    await addDoc(collection(db, "plans"), { name: n, routines: checks, createdBy: currentUser.uid });
    window.loadAdminPlans();
};

window.openAssignPlanModal = (id) => { assignMode = 'plan'; selectedPlanForMassAssign = id; window.openModal('modal-assign-plan'); loadMassUsers(); };
window.initMassAssignRoutine = (id) => { assignMode = 'routine'; selectedRoutineForMassAssign = id; window.openModal('modal-assign-plan'); loadMassUsers(); };

async function loadMassUsers() {
    const list = document.getElementById('assign-users-list'); list.innerHTML = 'Cargando...';
    const s = await getDocs(collection(db, "users")); list.innerHTML = '';
    s.forEach(d => { if(d.data().role === 'athlete') list.innerHTML += `<div class="selector-item"><input type="checkbox" class="user-mass-check" value="${d.id}" id="u-${d.id}"><label for="u-${d.id}">${d.data().name}</label></div>`; });
}

window.distributePlan = async () => {
    const ids = Array.from(document.querySelectorAll('.user-mass-check:checked')).map(c => c.value);
    if(ids.length === 0) return alert("Selecciona atletas");
    try {
        if(assignMode === 'plan') {
            const p = await getDoc(doc(db, "plans", selectedPlanForMassAssign));
            const promises = p.data().routines.map(rid => updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(...ids) }));
            await Promise.all(promises);
        } else { await updateDoc(doc(db, "routines", selectedRoutineForMassAssign), { assignedTo: arrayUnion(...ids) }); }
        alert("✅ Enviado"); window.closeModal('modal-assign-plan');
    } catch(e) { console.error(e); }
};

// --- CHART RENDERING ---
function renderMeasureChart(canvasId, h) {
    const ctx = document.getElementById(canvasId); if(measureChartInstance) measureChartInstance.destroy();
    const parts = [{k:'chest', l:'Pecho', c:'#FF5733'}, {k:'waist', l:'Cintura', c:'#00FF88'}, {k:'hip', l:'Cadera', c:'#3357FF'}, {k:'arm', l:'Brazo', c:'#FF33A8'}];
    const ds = parts.map(p => ({ label: p.l, data: h.map(x => x[p.k]||0), borderColor: p.c, tension:0.3 }));
    measureChartInstance = new Chart(ctx, { type:'line', data:{ labels:h.map(x => new Date(x.date.seconds*1000).toLocaleDateString()), datasets:ds }, options:{maintainAspectRatio:false}});
}

function renderBioChart(canvasId, h) {
    const ctx = document.getElementById(canvasId); if(bioChartInstance) bioChartInstance.destroy();
    const ds = [{ label:'Músculo', data:h.map(x => x.muscle||0), borderColor:'#00ffff' }, { label:'Grasa', data:h.map(x => x.fat||0), borderColor:'#ffaa00' }];
    bioChartInstance = new Chart(ctx, { type:'line', data:{ labels:h.map(x => new Date(x.date.seconds*1000).toLocaleDateString()), datasets:ds }, options:{maintainAspectRatio:false}});
}

// --- COMUNIDAD & REMINDERS ---
function initCommunityListener() {
    if (communityUnsubscribe) communityUnsubscribe();
    const q = query(collection(db, "workouts"), orderBy("date", "desc"), limit(1));
    communityUnsubscribe = onSnapshot(q, (s) => {
        s.docChanges().forEach(c => { if(c.type === "added" && c.doc.data().uid !== currentUser.uid) showToast(`🔥 ${c.doc.data().routine} terminado`); });
    });
}

function checkPhotoReminder() {
    if(!userData.photoDay) return;
    const now = new Date(); if(now.getDay() == userData.photoDay && now.toTimeString().substr(0,5) === userData.photoTime) alert("📸 FOTO DE PROGRESO!");
}

function checkPhotoVisualReminder() { if(!userData.photo) showToast("📸 Sube tu foto de perfil."); }

function injectTelegramUI() {
    const t = document.getElementById('cfg-rest-time');
    if (t && !document.getElementById('tg-wrapper')) {
        const d = document.createElement('div'); d.id = "tg-wrapper"; d.style.marginTop = "20px"; d.style.textAlign = "center";
        d.innerHTML = `<label style="color:#888;">Telegram</label><input type="text" id="cfg-telegram" value="${userData.telegram||''}" style="text-align:center;"><button class="btn" onclick="window.contactCoach()">Contactar Coach</button>`;
        t.parentElement?.insertAdjacentElement('afterend', d);
    }
}

// --- OTROS HANDLERS ---
window.viewWorkoutDetails = (t, d, n) => {
    const det = JSON.parse(decodeURIComponent(d)); let h = `<p><i>${decodeURIComponent(n||"")}</i></p><hr>`;
    det.forEach(ex => { h += `<b>${ex.n}</b><br>`; ex.s.forEach((s, idx) => h += `<small>S${idx+1}: ${s.r}x${s.w}kg</small><br>`); });
    document.getElementById('detail-title').innerText = t; document.getElementById('detail-content').innerHTML = h; window.openModal('modal-details');
};

window.saveConfig = async () => {
    const rt = document.getElementById('cfg-rest-time').value; const tg = document.getElementById('cfg-telegram')?.value || "";
    await updateDoc(doc(db,"users",currentUser.uid), { restTime: parseInt(rt), telegram: tg });
    userData.restTime = parseInt(rt); userData.telegram = tg; alert("Guardado ✅");
};

window.unassignRoutine = async (rid) => { if(confirm("Quitar?")) { await updateDoc(doc(db,"routines",rid), {assignedTo: arrayRemove(selectedUserCoach)}); window.openCoachView(selectedUserCoach); } };
window.approveUser = async () => { await updateDoc(doc(db,"users",selectedUserCoach), {approved:true}); alert("OK"); window.openCoachView(selectedUserCoach); };
window.deleteUser = async () => { if(prompt("Escribe BORRAR:") === 'BORRAR') { await deleteDoc(doc(db,"users",selectedUserCoach)); window.loadAdminUsers(); window.switchTab('admin-view'); } };
window.toggleUserFeature = async (f, v) => { await updateDoc(doc(db,"users",selectedUserCoach), {[f]:v}); window.openCoachView(selectedUserCoach); };

window.logout = () => signOut(auth).then(()=>location.reload());
window.contactCoach = () => window.open("https://t.me/fityhab", "_blank");
window.viewFullImage = (src) => { document.getElementById('full-image-src').src = src; window.openModal('modal-image-viewer'); };
window.openVideo = (url) => { 
    let id = url.includes("watch?v=") ? url.split("v=")[1] : url.split("/").pop();
    document.getElementById('youtube-frame').src = `https://www.youtube.com/embed/${id}?autoplay=1`;
    window.openModal('modal-video'); 
};

// --- DOM ACTIONS ---
document.getElementById('btn-login').onclick = () => signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value).catch(e => alert(e.message));
document.getElementById('btn-register').onclick = async () => {
    try {
        const c = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-pass').value);
        await setDoc(doc(db, "users", c.user.uid), {
            name: document.getElementById('reg-name').value, email: document.getElementById('reg-email').value, role:'athlete', approved:false, secretCode: document.getElementById('reg-code').value,
            stats:{workouts:0, totalKg:0, totalSets:0, totalReps:0}, readNotices: [], joined: serverTimestamp()
        });
    } catch(e) { alert(e.message); }
};
