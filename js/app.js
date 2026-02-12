import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Iniciada (v7.0 - Stable Release)...");

// --- CONFIGURACIÓN FIREBASE ---
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

// --- CONSTANTES ---
const AVAILABLE_DIETS = [
    { name: "Dieta Volumen (3000kcal)", file: "volumen_3000.html" },
    { name: "Dieta Definición (2000kcal)", file: "definicion_2000.html" },
    { name: "Dieta Mantenimiento", file: "mantenimiento.html" },
    { name: "Dieta Anti Inflamatoria", file: "Anti.html" },
    { name: "Ayuno Intermitente", file: "ayuno.html" }
];

const SILENT_MP3_URL = "https://raw.githubusercontent.com/anars/blank-audio/master/1-minute-of-silence.mp3";

// --- ESTADO GLOBAL ---
let audioCtx = null;
let htmlAudioElement = new Audio(SILENT_MP3_URL);
htmlAudioElement.loop = true;
htmlAudioElement.preload = 'auto';
htmlAudioElement.volume = 1.0;

let currentUser = null; 
let userData = null; 
let activeWorkout = null; 
let timerInt = null; 
let durationInt = null;
let wakeLock = null;
let totalRestTime = 60; 
let restEndTime = 0; 
let lastBeepSecond = -1;
let noteTargetIndex = null;
let communityUnsubscribe = null; 

// Variables Gráficas
let chartInstance = null; let progressChart = null; let fatChartInstance = null; let bioChartInstance = null; let measureChartInstance = null; 
let coachFatChart = null; let coachBioChart = null; let coachMeasureChart = null; let coachChart = null; 
let userRadarChart = null; let coachRadarChart = null; let radarChartInstance = null;

// Variables Coach/Admin
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
let noticeTargetUid = null;

// Filtros Ranking
let rankFilterTime = 'all';      
let rankFilterGender = 'all';    
let rankFilterCat = 'kg';        

// --- UI & UTILIDADES ---
function injectTelegramUI() {
    // Registro
    const regForm = document.getElementById('register-form');
    const regEmail = document.getElementById('reg-email');
    if (regForm && regEmail && !document.getElementById('reg-telegram')) {
        const input = document.createElement('input');
        input.type = 'text'; input.id = 'reg-telegram'; input.placeholder = 'Usuario Telegram (ej: @juanperez)'; input.style.marginBottom = '10px';
        regEmail.parentNode.insertBefore(input, regEmail);
    }
    // Perfil
    const restInput = document.getElementById('cfg-rest-time');
    if (restInput && !document.getElementById('cfg-telegram')) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = "width: 100%; margin-top: 25px; margin-bottom: 25px; text-align: center; border-top: 1px solid #222; padding-top: 15px;"; 
        wrapper.innerHTML = `
            <label style="display:block; margin-bottom:8px; font-size:0.85rem; color:#aaa; font-weight:bold;">📸 Tu Usuario Telegram</label>
            <input type="text" id="cfg-telegram" placeholder="@usuario" style="width: 70%; max-width: 250px; margin: 0 auto 15px auto; background: #111; border: 1px solid #444; color: white; padding: 10px; border-radius: 8px; text-align: center; display:block;">
            <button onclick="window.contactCoach()" style="background: var(--accent-color); color: #000; border: none; padding: 10px 24px; border-radius: 50px; font-weight: bold; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 11.944 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg> Contactar Coach
            </button>
        `;
        if (restInput.parentElement) restInput.parentElement.insertAdjacentElement('afterend', wrapper);
    }
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return d.getUTCFullYear() + "_W" + Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
}

function normalizeText(text) {
    if(!text) return "";
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function showToast(msg) { 
    const container = document.getElementById('toast-container') || createToastContainer(); 
    const t = document.createElement('div'); t.className = 'toast-msg'; t.innerText = msg; container.appendChild(t); 
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000); 
}
function createToastContainer() { const div = document.createElement('div'); div.id = 'toast-container'; document.body.appendChild(div); return div; }

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

// --- AUDIO & SYSTEM ---
function initAudioEngine() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    htmlAudioElement.play().then(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
            updateMediaSessionMetadata(totalRestTime || 60, 0);
            navigator.mediaSession.setActionHandler('play', () => { htmlAudioElement.play(); navigator.mediaSession.playbackState = "playing"; });
            navigator.mediaSession.setActionHandler('pause', () => navigator.mediaSession.playbackState = "paused");
            navigator.mediaSession.setActionHandler('previoustrack', () => window.addRestTime(-10));
            navigator.mediaSession.setActionHandler('nexttrack', () => window.addRestTime(10));
        }
    }).catch(e => console.log("Esperando interacción..."));
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

function updateMediaSessionMetadata(duration, position) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: `Descanso: ${Math.ceil(duration - position)}s`,
            artist: 'Fit Data Pro',
            album: 'Recuperando...',
            artwork: [{ src: 'logo.png', sizes: '512x512', type: 'image/png' }]
        });
        navigator.mediaSession.setPositionState({ duration: duration, playbackRate: 1, position: position });
    }
}

document.body.addEventListener('touchstart', initAudioEngine, {once:true});
document.body.addEventListener('click', initAudioEngine, {once:true});
window.testSound = () => { playTickSound(false); setTimeout(() => playTickSound(true), 500); };
window.enableNotifications = () => {
    if (!("Notification" in window)) return alert("Dispositivo no compatible.");
    Notification.requestPermission().then((p) => { if (p === "granted") { if("vibrate" in navigator) navigator.vibrate([200]); alert("✅ Vinculado."); } });
};

// --- AUTH STATE & BOOTSTRAP ---
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
            
            if(userData.role === 'admin' || userData.role === 'assistant') {
                document.getElementById('top-btn-coach').classList.remove('hidden');
            }
            if(userData.role !== 'admin' && userData.role !== 'assistant' && !sessionStorage.getItem('notif_dismissed')) {
                const routinesSnap = await getDocs(query(collection(db, "routines"), where("assignedTo", "array-contains", user.uid)));
                if(!routinesSnap.empty) document.getElementById('notif-badge').style.display = 'block';
            }
            if(userData.approved){
                setTimeout(() => { document.getElementById('loading-screen').classList.add('hidden'); }, 1500); 
                document.getElementById('main-header').classList.remove('hidden');
                loadRoutines();
                const savedW = localStorage.getItem('fit_active_workout');
                if(savedW) {
                    activeWorkout = JSON.parse(savedW);
                    renderWorkout();
                    switchTab('workout-view');
                    startTimerMini();
                } else { switchTab('routines-view'); }
            } else { alert("Cuenta en revisión."); signOut(auth); }
        }
    } else {
        setTimeout(() => { document.getElementById('loading-screen').classList.add('hidden'); }, 1500);
        switchTab('auth-view');
        document.getElementById('main-header').classList.add('hidden');
        if(communityUnsubscribe) communityUnsubscribe();
        injectTelegramUI();
    }
});

// --- CORE: SISTEMA DE AVISOS ---
async function checkNotices() {
    if(userData.role === 'admin' || userData.role === 'assistant') return;
    
    // 1. Aviso Individual
    if(userData.coachNotice && userData.coachNotice.active) {
        showNoticeModal(userData.coachNotice, "MENSAJE DEL COACH");
        return; 
    }
    
    // 2. Aviso Global
    try {
        const snap = await getDoc(doc(db, "settings", "globalNotice"));
        if(snap.exists()) {
            const notice = snap.data();
            const lastSeen = localStorage.getItem('last_global_notice_date');
            if(notice.active && notice.date !== lastSeen) {
                showNoticeModal(notice, "AVISO DE LA COMUNIDAD");
                localStorage.setItem('last_global_notice_date', notice.date);
            }
        }
    } catch(e) {}
}

function showNoticeModal(notice, headerTitle) {
    document.getElementById('viewer-header').innerText = headerTitle;
    document.getElementById('viewer-title').innerText = notice.title;
    document.getElementById('viewer-text').innerText = notice.text;
    const imgEl = document.getElementById('viewer-img');
    if(notice.img) { imgEl.src = notice.img; imgEl.classList.remove('hidden'); } else { imgEl.classList.add('hidden'); }
    const linkBtn = document.getElementById('viewer-link-btn');
    if(notice.link) { linkBtn.classList.remove('hidden'); linkBtn.onclick = () => window.open(notice.link, '_blank'); } else { linkBtn.classList.add('hidden'); }
    window.openModal('modal-notice-viewer');
}

window.openNoticeEditor = async (uid) => {
    noticeTargetUid = uid; 
    document.getElementById('notice-title').value = '';
    document.getElementById('notice-text').value = '';
    document.getElementById('notice-img').value = '';
    document.getElementById('notice-link').value = '';
    document.getElementById('notice-modal-title').innerText = uid === 'GLOBAL' ? '📢 CREAR AVISO PARA TODOS' : '📢 AVISO INDIVIDUAL';
    
    try {
        let existing = null;
        if(uid === 'GLOBAL') {
             const snap = await getDoc(doc(db, "settings", "globalNotice"));
             if(snap.exists()) existing = snap.data();
        } else {
             const snap = await getDoc(doc(db, "users", uid));
             if(snap.exists() && snap.data().coachNotice) existing = snap.data().coachNotice;
        }
        if(existing) {
            document.getElementById('notice-title').value = existing.title || '';
            document.getElementById('notice-text').value = existing.text || '';
            document.getElementById('notice-img').value = existing.img || '';
            document.getElementById('notice-link').value = existing.link || '';
        }
    } catch(e) { console.error(e); }
    window.openModal('modal-notice-editor');
};

window.saveNotice = async () => {
    const t = document.getElementById('notice-title').value;
    const txt = document.getElementById('notice-text').value;
    const img = document.getElementById('notice-img').value;
    const lnk = document.getElementById('notice-link').value;
    if(!t || !txt) return alert("Título y texto obligatorios.");
    
    const noticeData = { title: t, text: txt, img: img, link: lnk, date: new Date().toISOString(), active: true };
    const btn = document.getElementById('btn-save-notice'); btn.innerText = "GUARDANDO...";
    
    try {
        if(noticeTargetUid === 'GLOBAL') {
            await setDoc(doc(db, "settings", "globalNotice"), noticeData);
            alert("✅ Aviso Global Publicado");
        } else {
            await updateDoc(doc(db, "users", noticeTargetUid), { coachNotice: noticeData });
            alert("✅ Aviso Enviado");
            if(document.getElementById('tab-users').classList.contains('active')) window.loadAdminUsers();
        }
        window.closeModal('modal-notice-editor');
    } catch(e) { alert("Error: " + e.message); }
    finally { btn.innerText = "PUBLICAR AVISO"; }
};

window.deleteNotice = async () => {
    if(!confirm("¿Borrar aviso?")) return;
    try {
        if(noticeTargetUid === 'GLOBAL') await deleteDoc(doc(db, "settings", "globalNotice"));
        else await updateDoc(doc(db, "users", noticeTargetUid), { coachNotice: null });
        alert("🗑️ Eliminado");
        window.closeModal('modal-notice-editor');
        if(document.getElementById('tab-users').classList.contains('active')) window.loadAdminUsers();
    } catch(e) { alert("Error: " + e.message); }
};

// --- CORE: RUTINAS & ENTRENAMIENTO ---
async function loadRoutines() {
    const l = document.getElementById('routines-list'); l.innerHTML = 'Cargando...';
    onSnapshot(query(collection(db,"routines")), (s)=>{
        l.innerHTML = '';
        s.forEach(d=>{
            const r = d.data();
            const isAssignedToMe = r.assignedTo && r.assignedTo.includes(currentUser.uid);
            if(isAssignedToMe){
                const div = document.createElement('div'); div.className = 'card';
                const canEdit = r.uid === currentUser.uid;
                div.innerHTML = `<div style="display:flex; justify-content:space-between;"><h3 style="color:var(--accent-color)">${r.name}</h3><div>${canEdit ? `<button style="background:none;border:none;margin-right:10px;" onclick="openEditor('${d.id}')">✏️</button><button style="background:none;border:none;" onclick="delRoutine('${d.id}')">🗑️</button>` : '🔒'}</div></div><p style="color:#666; font-size:0.8rem; margin:10px 0;">${r.exercises.length} Ejercicios</p><button class="btn" onclick="startWorkout('${d.id}')">ENTRENAR</button>`;
                l.appendChild(div);
            }
        });
        if(l.innerHTML === '') l.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No tienes rutinas asignadas.</div>';
    });
}

window.startWorkout = async (rid) => {
    if(document.getElementById('cfg-wake').checked && 'wakeLock' in navigator) try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){}
    try {
        const snap = await getDoc(doc(db,"routines",rid)); const r = snap.data();
        let lastWorkoutData = null; const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid)); const wSnap = await getDocs(q); const sameRoutine = wSnap.docs.map(d=>d.data()).filter(d => d.routine === r.name).sort((a,b) => b.date - a.date); if(sameRoutine.length > 0) lastWorkoutData = sameRoutine[0].details;
        
        if(htmlAudioElement) { htmlAudioElement.play().then(() => { htmlAudioElement.pause(); }).catch(e => {}); } 
        
        activeWorkout = { name: r.name, startTime: Date.now(), exs: r.exercises.map(exObj => {
                const isString = typeof exObj === 'string'; const name = isString ? exObj : exObj.n; const isSuperset = isString ? false : (exObj.s || false); const customSeriesNum = isString ? 5 : (parseInt(exObj.series) || 5); const customRepsPattern = isString ? "20-16-16-16-16" : (exObj.reps || "20-16-16-16-16"); const repsArray = customRepsPattern.split('-'); const data = getExerciseData(name);
                let sets = Array(customSeriesNum).fill().map((_, i) => ({ r: repsArray[i] ? parseInt(repsArray[i]) : parseInt(repsArray[repsArray.length - 1]), w: 0, d: false, prev: '-', numDisplay: (i + 1).toString() }));
                if(lastWorkoutData) { const prevEx = lastWorkoutData.find(ld => ld.n === name); if(prevEx && prevEx.s) { sets = sets.map((s, i) => { if(prevEx.s[i]) { const dLabel = prevEx.s[i].isDrop ? ' (D)' : ''; s.prev = `${prevEx.s[i].r}x${prevEx.s[i].w}kg${dLabel}`; } return s; }); } }
                return { n:name, img:data.img, mInfo: data.mInfo, type: data.type, video: data.v, sets: sets, superset: isSuperset, note: "" }; 
            })
        };
        saveLocalWorkout(); renderWorkout(); switchTab('workout-view'); startTimerMini();
    } catch(e) { alert("Error iniciando: " + e.message); }
};

// ... Funciones de Sets (addSet, removeSet, uS, tS) ...
window.addSet = (exIdx) => { const sets = activeWorkout.exs[exIdx].sets; sets.push({r:16, w:0, d:false, prev:'-', numDisplay: (sets.length + 1).toString()}); saveLocalWorkout(); renderWorkout(); };
window.removeSet = (exIdx) => { if(activeWorkout.exs[exIdx].sets.length > 1) { activeWorkout.exs[exIdx].sets.pop(); saveLocalWorkout(); renderWorkout(); } };
window.toggleAllSets = (exIdx) => { const ex = activeWorkout.exs[exIdx]; const newState = !ex.sets.every(s => s.d); ex.sets.forEach(s => s.d = newState); saveLocalWorkout(); renderWorkout(); if(newState) showToast("✅ Series completadas"); };
window.uS = (i,j,k,v) => { activeWorkout.exs[i].sets[j][k]=v; saveLocalWorkout(); };
window.tS = async (i, j) => { 
    const s = activeWorkout.exs[i].sets[j]; const exerciseName = activeWorkout.exs[i].n; s.d = !s.d; 
    if(s.d) { 
        const weight = parseFloat(s.w) || 0; const reps = parseInt(s.r) || 0;
        if (weight > 0 && reps > 0) {
            const estimated1RM = Math.round(weight / (1.0278 - (0.0278 * reps)));
            if (!userData.rmRecords) userData.rmRecords = {}; const currentRecord = userData.rmRecords[exerciseName] || 0;
            if (estimated1RM > currentRecord) { userData.rmRecords[exerciseName] = estimated1RM; updateDoc(doc(db, "users", currentUser.uid), { [`rmRecords.${exerciseName}`]: estimated1RM }); showToast(`🔥 NUEVO 1RM: <b>${estimated1RM}kg</b>`); } 
            else { const currentWeightPR = userData.prs ? (userData.prs[exerciseName] || 0) : 0; if (weight > currentWeightPR) { if(!userData.prs) userData.prs = {}; userData.prs[exerciseName] = weight; const newPrCount = (userData.stats.prCount || 0) + 1; updateDoc(doc(db, "users", currentUser.uid), { [`prs.${exerciseName}`]: weight, "stats.prCount": newPrCount }); showToast(`💪 PR Peso: ${weight}kg`); } }
        }
        openRest(); 
    } 
    saveLocalWorkout(); renderWorkout();
};
window.addDropset = (exIdx, setIdx) => { const currentSet = activeWorkout.exs[exIdx].sets[setIdx]; currentSet.d = true; const newSet = { r: Math.floor(currentSet.r * 0.8) || 10, w: Math.floor(currentSet.w * 0.7) || 0, d: false, prev: 'DROPSET', isDrop: true, numDisplay: (parseInt(currentSet.numDisplay) || (setIdx + 1)) + ".5" }; activeWorkout.exs[exIdx].sets.splice(setIdx + 1, 0, newSet); saveLocalWorkout(); renderWorkout(); showToast(`💧 Dropset añadido`); };

function saveLocalWorkout() { localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); }
function renderWorkout() {
    const c = document.getElementById('workout-exercises'); c.innerHTML = ''; document.getElementById('workout-title').innerText = activeWorkout.name;
    activeWorkout.exs.forEach((e, i) => {
        let cardStyle = "border-left:3px solid var(--accent-color);"; let connector = ""; if (e.superset) { cardStyle += " margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: 1px dashed #444;"; connector = `<div style="text-align:center; background:var(--card-color); color:var(--accent-color); font-size:1.2rem; line-height:0.5;">🔗</div>`; } else if (i > 0 && activeWorkout.exs[i-1].superset) cardStyle += " border-top-left-radius: 0; border-top-right-radius: 0; margin-top:0;";
        const card = document.createElement('div'); card.className = 'card'; card.style.cssText = cardStyle;
        const videoBtn = (userData.showVideos && e.video) ? `<button class="btn-small btn-outline" style="float:right; width:auto; margin:0; padding:2px 8px; border-color:#f00; color:#f55;" onclick="window.openVideo('${e.video}')">🎥</button>` : '';
        const swapBtn = `<button class="btn-small btn-outline" style="float:right; width:auto; margin:0 5px 0 0; padding:2px 8px; border-color:#aaa; color:#fff;" onclick="window.initSwap(${i})">🔄</button>`;
        const noteBtn = `<button class="ex-note-btn ${e.note ? 'has-note' : ''}" onclick="window.openNoteModal(${i})">📝</button>`;
        let bars = `<div class="mini-bar-label"><span>${e.mInfo.main}</span></div><div class="mini-track"><div class="mini-fill fill-primary" style="width:${e.type==='i'?100:70}%"></div></div>`;
        let setsHtml = `<div class="set-header"><div>#</div><div>PREV</div><div>REPS</div><div>KG</div><div></div></div>`;
        e.sets.forEach((s, j) => { 
            const weightVal = s.w === 0 ? '' : s.w; const isDisabled = s.d ? 'disabled' : ''; const rowOpacity = s.d ? 'opacity:0.5; pointer-events:none;' : '';
            setsHtml += `<div class="set-row ${s.isDrop?'is-dropset':''}" style="${rowOpacity}"><div class="set-num">${s.numDisplay||(j+1)}</div><div class="prev-data">${s.prev}</div><div><input type="number" value="${s.r}" ${isDisabled} onchange="uS(${i},${j},'r',this.value)"></div><div><input type="number" placeholder="kg" value="${weightVal}" ${isDisabled} onchange="uS(${i},${j},'w',this.value)"></div><div style="display:flex; flex-direction:column; gap:2px; pointer-events: auto;"><button class="btn-outline ${s.d?'btn-done':''}" style="margin:0;padding:0;height:32px;" onclick="tS(${i},${j})">${s.d?'✓':''}</button>${(!s.d&&!s.isDrop)?`<button class="btn-small btn-outline" style="padding:2px; font-size:0.5rem; border-color:var(--warning-color); color:var(--warning-color);" onclick="window.addDropset(${i},${j})">💧</button>`:''}</div></div>`; 
        });
        setsHtml += `<div class="sets-actions"><button class="btn-set-control" style="border-color:var(--success-color); color:var(--success-color); margin-right:auto;" onclick="window.toggleAllSets(${i})">✓ TODO</button><button class="btn-set-control" onclick="removeSet(${i})">-</button><button class="btn-set-control" onclick="addSet(${i})">+</button></div>`;
        card.innerHTML = `<div class="workout-split"><div class="workout-visual"><img src="${e.img}" onerror="this.src='logo.png'"></div><div class="workout-bars" style="width:100%">${bars}</div></div><h3 style="margin-bottom:10px; border:none; display:flex; align-items:center; justify-content:space-between;"><span>${e.n}</span><div>${noteBtn} ${videoBtn} ${swapBtn}</div></h3>${setsHtml}`;
        c.appendChild(card); if(e.superset) c.innerHTML += connector;
    });
}

// --- TIMER & FINISH ---
function startTimerMini() { if(durationInt) clearInterval(durationInt); const d = document.getElementById('mini-timer'); if(!activeWorkout.startTime) activeWorkout.startTime = Date.now(); const startTime = activeWorkout.startTime; durationInt = setInterval(()=>{ const diff = Math.floor((Date.now() - startTime)/1000); const m = Math.floor(diff/60); const s = diff % 60; if(d) d.innerText = `${m}:${s.toString().padStart(2,'0')}`; }, 1000); }
window.cancelWorkout = () => { if(confirm("¿Cancelar? Se perderán datos.")) { activeWorkout = null; localStorage.removeItem('fit_active_workout'); if(durationInt) clearInterval(durationInt); switchTab('routines-view'); } };
window.promptRPE = () => {
    const radarCtx = document.getElementById('muscleRadarChart'); if (radarChartInstance) radarChartInstance.destroy();
    const mCounts = {}; activeWorkout.exs.forEach(e => { const m = e.mInfo?.main; if(m) mCounts[m] = (mCounts[m]||0) + e.sets.filter(s=>s.d).length; });
    radarChartInstance = new Chart(radarCtx, { type: 'radar', data: { labels: Object.keys(mCounts), datasets: [{ label: 'Series', data: Object.values(mCounts), backgroundColor: 'rgba(255,51,51,0.4)', borderColor: '#f33' }] }, options: { scales: { r: { ticks: { display: false }, grid: { color: '#333' } } }, plugins: { legend: { display: false } }, maintainAspectRatio: false } });
    window.openModal('modal-rpe');
};

window.finishWorkout = async (rpeVal) => {
    try {
        window.closeModal('modal-rpe');
        const note = document.getElementById('workout-notes')?.value || "";
        let totalSets = 0, totalReps = 0, totalKg = 0, mCounts = {};
        const cleanLog = activeWorkout.exs.map(e => {
            const completed = e.sets.filter(s => s.d).map(s => {
                const r = parseInt(s.r)||0, w = parseFloat(s.w)||0;
                totalSets++; totalReps += r; totalKg += (r*w);
                const m = e.mInfo?.main || "General"; mCounts[m] = (mCounts[m]||0) + 1;
                return { r, w, isDrop: !!s.isDrop, numDisplay: String(s.numDisplay||"") };
            });
            return { n: e.n, s: completed, superset: !!e.superset, note: e.note || "" };
        }).filter(e => e.s.length > 0);
        if (cleanLog.length === 0) return alert("No hay series completadas.");

        const now = new Date();
        const mKey = `${now.getFullYear()}_${now.getMonth()}`, yKey = `${now.getFullYear()}`, wKey = getWeekNumber(now);
        await addDoc(collection(db, "workouts"), { uid: currentUser.uid, date: serverTimestamp(), routine: activeWorkout.name, rpe: rpeVal, note: note, details: cleanLog, workoutNumber: (userData.stats?.workouts||0)+1, sessionVolume: Number(totalKg.toFixed(2)), monthKey: mKey, yearKey: yKey, weekKey: wKey });
        
        const updates = { "stats.workouts": increment(1), "stats.totalSets": increment(totalSets), "stats.totalReps": increment(totalReps), "stats.totalKg": increment(totalKg), "lastWorkoutDate": serverTimestamp() };
        updates[`stats_week_${wKey}.kg`] = increment(totalKg); updates[`stats_month_${mKey}.kg`] = increment(totalKg); updates[`stats_year_${yKey}.kg`] = increment(totalKg);
        for (const [m, c] of Object.entries(mCounts)) updates[`muscleStats.${m}`] = increment(c);
        
        await updateDoc(doc(db, "users", currentUser.uid), updates);
        showToast(`🏆 Entreno Guardado. Vol: ${(totalKg/1000).toFixed(2)}t`);
        localStorage.removeItem('fit_active_workout'); if (durationInt) clearInterval(durationInt); if (wakeLock) wakeLock.release(); window.switchTab('routines-view');
    } catch (e) { alert("Error crítico al guardar: " + e.message); }
};

// --- PERFIL Y ESTADÍSTICAS ---
window.loadProfile = async () => {
    document.getElementById('profile-name').innerText = userData.name;
    if(userData.photo) { document.getElementById('avatar-text').style.display='none'; document.getElementById('avatar-img').src = userData.photo; document.getElementById('avatar-img').style.display='block'; }
    
    // Stats Header
    document.getElementById('stat-workouts').innerText = userData.stats.workouts || 0;
    document.getElementById('stat-kg').innerText = userData.stats.totalKg ? (userData.stats.totalKg/1000).toFixed(1)+'t' : 0;
    document.getElementById('stat-sets').innerText = userData.stats.totalSets || 0;
    document.getElementById('stat-reps').innerText = userData.stats.totalReps || 0;

    // Charts & Features
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(document.getElementById('weightChart'), { type:'line', data:{ labels:(userData.weightHistory||[70]).map((_,i)=>`T${i}`), datasets:[{label:'Kg', data:userData.weightHistory||[70], borderColor:'#f33', fill:true, tension:0.4}] }, options:{plugins:{legend:{display:false}}, scales:{x:{display:false},y:{grid:{color:'#333'}}}, maintainAspectRatio:false} });
    
    // Historial Compacto
    const histDiv = document.getElementById('user-history-list'); 
    histDiv.className = 'history-list-container';
    histDiv.innerHTML = "Cargando...";
    try {
        const snap = await getDocs(query(collection(db, "workouts"), where("uid", "==", currentUser.uid), orderBy("date","desc"), limit(5)));
        histDiv.innerHTML = snap.empty ? "<div style='text-align:center;padding:10px;color:#666;'>Sin historial.</div>" : "";
        snap.forEach(docSnap => {
            const d = docSnap.data();
            const date = d.date ? new Date(d.date.seconds*1000).toLocaleDateString(undefined, {day:'2-digit', month:'2-digit'}) : '-';
            let borderCol = d.rpe === 'Suave' ? '#00ff88' : (d.rpe === 'Fallo' ? '#ff3333' : '#ffaa00');
            let volDisplay = d.sessionVolume ? (d.sessionVolume >= 1000 ? (d.sessionVolume/1000).toFixed(1)+'t' : d.sessionVolume+'kg') : '-';
            
            histDiv.innerHTML += `
                <div class="history-card-compact" style="border-left-color: ${borderCol};" 
                     onclick="window.viewWorkoutDetails('${d.routine}', '${encodeURIComponent(JSON.stringify(d.details))}', '${encodeURIComponent(d.note||"")}')">
                    <div class="h-left"><span class="h-date">${date}</span><span class="h-title">${d.routine}</span></div>
                    <div class="h-right"><span class="h-vol">${volDisplay}</span><span class="h-icon">›</span></div>
                </div>`;
        });
    } catch(e) { histDiv.innerHTML = "Error cargando."; }

    renderMuscleRadar('userMuscleChart', userData.muscleStats || {});
    updatePhotoDisplay(userData);
    
    // Toggles
    document.getElementById('user-bio-section').classList.toggle('hidden', !userData.showBio);
    document.getElementById('user-skinfolds-section').classList.toggle('hidden', !userData.showSkinfolds);
    document.getElementById('user-measures-section').classList.toggle('hidden', !userData.showMeasurements);
    document.getElementById('btn-diet-view').classList.toggle('hidden', !userData.dietFile);
};

// --- VISOR DE DETALLES (FUNCIÓN CRÍTICA CORREGIDA) ---
window.viewWorkoutDetails = (routineName, detailsStr, noteStr) => {
    try {
        const details = JSON.parse(decodeURIComponent(detailsStr));
        const note = decodeURIComponent(noteStr || "");
        let html = note ? `<div class="note-display">📝 <b>Nota:</b> ${note}</div>` : '';
        
        details.forEach(ex => {
            const name = ex.n || ex; 
            const sets = ex.s || [];
            html += `<div style="margin-bottom:15px; border-bottom:1px solid #333; padding-bottom:10px;">
                     <div style="font-weight:bold; color:var(--accent-color); margin-bottom:5px;">${name}</div>`;
            if (sets.length > 0) {
                html += `<div style="display:grid; grid-template-columns: 20px 1fr 1fr; gap:5px; font-size:0.8rem; color:#888;"><div>#</div><div>Kg</div><div>Reps</div></div>`;
                sets.forEach((s, i) => {
                    const isDrop = s.isDrop ? '<span style="color:var(--warning-color)">(DROP)</span>' : '';
                    html += `<div style="display:grid; grid-template-columns: 20px 1fr 1fr; gap:5px; font-size:0.8rem; margin-top:3px; color:#ddd;"><div>${s.numDisplay||(i+1)}</div><div>${s.w||0}</div><div>${s.r||0} ${isDrop}</div></div>`;
                });
            } else { html += `<div style="font-size:0.7rem; color:#666;">Sin datos.</div>`; }
            html += `</div>`;
        });
        document.getElementById('detail-title').innerText = routineName;
        document.getElementById('detail-content').innerHTML = html;
        window.openModal('modal-details');
    } catch (e) { alert("Error visualizando detalles."); }
};

// --- ADMIN & COACH VIEW ---
window.loadAdminUsers = async () => {
    const l = document.getElementById('admin-list'); l.innerHTML = '↻ Cargando...';
    try {
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const s = await getDocs(q); l.innerHTML = '';
        
        if(userData.role === 'admin') {
             const gb = document.createElement('button');
             gb.className = 'btn'; gb.style.cssText = "width:100%; margin-bottom:15px; background:var(--warning-color); color:black; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:8px;";
             gb.innerHTML = "📢 CREAR AVISO PARA TODOS"; gb.onclick = () => window.openNoticeEditor('GLOBAL');
             l.appendChild(gb);
        }

        const usersList = s.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => (b.lastWorkoutDate?.seconds || 0) - (a.lastWorkoutDate?.seconds || 0));
        usersList.forEach(u => {
            const rowClass = `admin-user-row ${u.id === currentUser.uid ? 'is-me' : ''} ${u.role === 'assistant' ? 'is-coach' : ''}`;
            let activeStatus = "";
            if (u.lastWorkoutDate) {
                const last = u.lastWorkoutDate.toDate();
                if (last.toDateString() === new Date().toDateString()) activeStatus = `<span style="color:#00ff88; font-size:0.75rem; margin-left:6px; background:rgba(0,255,136,0.1); padding:2px 5px; border-radius:4px;">🟢 ${last.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>`;
            }
            const div = document.createElement('div'); div.className = rowClass;
            div.innerHTML=`
                ${u.photo ? `<img src="${u.photo}" class="mini-avatar">` : `<div class="mini-avatar-placeholder">${u.name.charAt(0)}</div>`}
                <div style="overflow:hidden;"><div style="font-weight:bold; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.name} ${u.role === 'assistant' ? '🛡️' : ''} ${activeStatus}</div><div style="font-size:0.75rem; color:#888;">${u.email}</div></div>
                <div style="display:flex; gap:8px;">
                    <button class="btn-outline btn-small" style="margin:0; width:40px; border-color:#ffaa00; color:#ffaa00; display:flex; align-items:center; justify-content:center;" onclick="event.stopPropagation(); window.openNoticeEditor('${u.id}')">📢</button>
                    <button class="btn-outline btn-small" style="margin:0; border-color:#444; color:#ccc;" onclick="window.openCoachView('${u.id}', null)">⚙️</button>
                </div>`;
            l.appendChild(div);
        });
    } catch (e) { l.innerHTML = 'Error conexión.'; }
};

window.openCoachView = async (uid) => {
    selectedUserCoach=uid; 
    const freshSnap = await getDoc(doc(db, "users", uid)); 
    const freshU = freshSnap.data(); 
    selectedUserObj = freshU; 
    
    switchTab('coach-detail-view'); 
    document.getElementById('coach-user-name').innerText=freshU.name + (freshU.role === 'assistant' ? ' (Coach 🛡️)' : ''); 
    document.getElementById('coach-user-email').innerHTML=`${freshU.email} ${freshU.telegram ? `<br><span style="color:#0088cc; font-size:0.8rem;">Telegram: ${freshU.telegram}</span>` : ''}`;
    document.getElementById('coach-user-meta').innerText = `${freshU.gender === 'female' ? '♀️' : '♂️'} ${freshU.age} años • ${freshU.height} cm`;
    document.getElementById('coach-user-img').src = freshU.photo || ''; 
    document.getElementById('coach-user-img').style.display = freshU.photo ? 'block' : 'none';
    document.getElementById('coach-user-initial').style.display = freshU.photo ? 'none' : 'block';
    document.getElementById('coach-user-initial').innerText = freshU.name.charAt(0).toUpperCase();
    document.getElementById('pending-approval-banner').classList.toggle('hidden', freshU.approved);
    
    // Toggles Config
    ['showBio','showSkinfolds','showMeasurements','showVideos'].forEach(k => {
        const el = document.getElementById(k === 'showBio' ? 'coach-toggle-bio' : k === 'showSkinfolds' ? 'coach-toggle-skinfolds' : k === 'showMeasurements' ? 'coach-toggle-measures' : 'coach-toggle-videos');
        if(el) { el.checked = !!freshU[k]; el.onchange = (e) => window.toggleUserFeature(k, e.target.checked); }
    });

    // Diet Select
    const dietSel = document.getElementById('coach-diet-select'); dietSel.innerHTML = '<option value="">-- Sin Dieta --</option>';
    AVAILABLE_DIETS.forEach(d => { const opt = new Option(d.name, d.file); if(freshU.dietFile === d.file) opt.selected = true; dietSel.appendChild(opt); });

    // Rutinas Asignadas
    const rList = document.getElementById('coach-assigned-list'); rList.innerHTML = 'Cargando...';
    const allRoutinesSnap = await getDocs(collection(db, "routines")); allRoutinesCache = [];
    const s = document.getElementById('coach-routine-select'); s.innerHTML = '<option value="">Selecciona rutina...</option>';
    allRoutinesSnap.forEach(r => { const data = r.data(); allRoutinesCache.push({id: r.id, ...data}); s.add(new Option(data.name, r.id)); });
    
    const assigned = allRoutinesCache.filter(r => (r.assignedTo || []).includes(uid)); 
    rList.innerHTML = assigned.length ? '' : 'Ninguna rutina.';
    assigned.forEach(r => { 
        const div = document.createElement('div'); div.className = "assigned-routine-item"; 
        div.innerHTML = `<span>${r.name}</span><button style="background:none;border:none;color:#f55;font-weight:bold;cursor:pointer;" onclick="window.unassignRoutine('${r.id}')">❌</button>`; 
        rList.appendChild(div); 
    });

    // Gráficas Coach
    if(freshU.bioHistory) renderBioChart('coachBioChart', freshU.bioHistory);
    document.getElementById('coach-view-bio').classList.toggle('hidden', !freshU.bioHistory);
    
    if(freshU.skinfoldHistory) {
        const ctxF = document.getElementById('coachFatChart'); if(coachFatChart) coachFatChart.destroy();
        coachFatChart = new Chart(ctxF, { type: 'line', data: { labels: freshU.skinfoldHistory.map(f => new Date(f.date.seconds*1000).toLocaleDateString()), datasets: [{ label: '% Grasa', data: freshU.skinfoldHistory.map(f => f.fat||0), borderColor: '#ffaa00' }] }, options: { maintainAspectRatio: false } });
    }
    document.getElementById('coach-view-skinfolds').classList.toggle('hidden', !freshU.skinfoldHistory);

    if(freshU.measureHistory) renderMeasureChart('coachMeasuresChart', freshU.measureHistory);
    document.getElementById('coach-view-measures').classList.toggle('hidden', !freshU.measureHistory);
    
    renderMuscleRadar('coachMuscleChart', freshU.muscleStats || {});
    updateCoachPhotoDisplay('front');

    // Historial Compacto (Coach View)
    const hList = document.getElementById('coach-history-list'); 
    hList.className = 'history-list-container';
    hList.innerHTML = 'Cargando...';
    const wSnap = await getDocs(query(collection(db,"workouts"), where("uid","==",uid), orderBy("date","desc"), limit(10))); 
    hList.innerHTML = wSnap.empty ? '<div style="text-align:center; padding:10px; color:#666;">Sin datos recientes.</div>' : '';
    
    wSnap.forEach(docSnap => {
        const d = docSnap.data();
        const date = d.date ? new Date(d.date.seconds*1000).toLocaleDateString(undefined, {day:'2-digit', month:'2-digit'}) : '-';
        let borderCol = d.rpe === 'Suave' ? '#00ff88' : (d.rpe === 'Fallo' ? '#ff3333' : '#ffaa00');
        let volDisplay = d.sessionVolume ? (d.sessionVolume >= 1000 ? (d.sessionVolume/1000).toFixed(1)+'t' : d.sessionVolume+'kg') : '';

        hList.innerHTML += `
            <div class="history-card-compact" style="border-left-color: ${borderCol};" 
                 onclick="viewWorkoutDetails('${d.routine}', '${encodeURIComponent(JSON.stringify(d.details))}', '${encodeURIComponent(d.note||"")}')">
                <div class="h-left"><span class="h-date">${date} • ${d.rpe || '-'}</span><span class="h-title">${d.routine}</span></div>
                <div class="h-right"><span class="h-vol">${volDisplay}</span><span class="h-icon" style="color:${borderCol}">●</span></div>
            </div>`;
    });
};

// --- OTROS HELPERS ---
window.toggleUserFeature = async (f, v) => { if(!selectedUserCoach) return; await updateDoc(doc(db, "users", selectedUserCoach), { [f]: v }); };
window.filterCoachRoutines = (t) => { const s = document.getElementById('coach-routine-select'); s.innerHTML = ''; const term = normalizeText(t); const f = allRoutinesCache.filter(r => normalizeText(r.name).includes(term)); f.forEach(r => s.add(new Option(r.name, r.id))); };
window.assignRoutine = async () => { const rid = document.getElementById('coach-routine-select').value; if(!rid) return; await updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(selectedUserCoach) }); alert("✅ Asignada"); window.openCoachView(selectedUserCoach); };
window.unassignRoutine = async (rid) => { if(confirm("¿Quitar?")) { await updateDoc(doc(db, "routines", rid), { assignedTo: arrayRemove(selectedUserCoach) }); window.openCoachView(selectedUserCoach); } };
window.switchCoachPose = (pose) => { coachCurrentPose = pose; document.getElementById('coach-tab-front').classList.toggle('active', pose==='front'); document.getElementById('coach-tab-back').classList.toggle('active', pose==='back'); updateCoachPhotoDisplay(pose); };
window.toggleAdminMode = (m) => { document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active')); document.getElementById(m==='users'?'tab-users':m==='lib'?'tab-lib':'tab-plans').classList.add('active'); ['users','lib','plans'].forEach(x => document.getElementById(`admin-${x}-card`).classList.toggle('hidden', m!==x)); if(m==='users') window.loadAdminUsers(); if(m==='lib') window.loadAdminLibrary(); if(m==='plans') window.loadAdminPlans(); };

// --- EDITOR RUTINAS (Simplificado) ---
window.openEditor = async (id=null) => {
    editingRoutineId = id; document.getElementById('editor-name').value = ''; document.getElementById('editor-title').innerText = id ? "EDITAR" : "NUEVA";
    currentRoutineSelections = [];
    if (id) { const s = await getDoc(doc(db, "routines", id)); const r = s.data(); document.getElementById('editor-name').value = r.name; currentRoutineSelections = r.exercises.map(ex => ({ n: ex.n||ex, s: ex.s||false, series: ex.series||5, reps: ex.reps||"12-10-8-8-8" })); }
    renderExercises(EXERCISES); renderSelectedSummary(); switchTab('editor-view');
};
window.saveRoutine = async () => {
    const n = document.getElementById('editor-name').value; const s = currentRoutineSelections; if(!n || !s.length) return alert("Faltan datos");
    const d = { uid: currentUser.uid, name: n, exercises: s, createdAt: serverTimestamp(), assignedTo: userData.role!=='admin'?[currentUser.uid]:[] };
    if(editingRoutineId) await updateDoc(doc(db,"routines",editingRoutineId), {name:n, exercises:s}); else await addDoc(collection(db,"routines"),d);
    alert("✅ Guardado"); switchTab('routines-view');
};
function renderExercises(l) {
    const c = document.getElementById('exercise-selector-list'); c.innerHTML = '';
    const sorted = [...l].sort((a,b) => { const aS = currentRoutineSelections.some(x=>x.n===a.n), bS = currentRoutineSelections.some(x=>x.n===b.n); return aS===bS ? 0 : aS ? -1 : 1; });
    sorted.forEach(e => {
        const idx = currentRoutineSelections.findIndex(x => x.n === e.n); const sel = idx > -1;
        const d = document.createElement('div'); d.className = `ex-select-item ${sel?'selected-red-active':''}`; d.id = `ex-card-${normalizeText(e.n)}`;
        if(sel) {
            d.style.cssText = "background: rgba(50, 10, 10, 0.95); border-left: 4px solid var(--accent-color); border: 1px solid var(--accent-color); padding: 10px; margin-bottom: 5px; border-radius: 8px; flex-direction:column; align-items: stretch;";
            const obj = currentRoutineSelections[idx];
            d.innerHTML = `<div style="display:flex; justify-content:space-between;"><b style="color:white;">${e.n}</b><b onclick="removeSelection('${obj.n}')" style="color:#f55;">✕</b></div>
            <div style="display:flex; gap:5px; margin-top:5px;"><input type="number" value="${obj.series}" oninput="updateSelectionData(${idx},'series',this.value)" style="width:50px;"><input type="text" value="${obj.reps}" oninput="updateSelectionData(${idx},'reps',this.value)" style="flex:1;"><span onclick="toggleSuperset(${idx})" style="font-size:1.5rem; ${obj.s?'color:var(--accent-color)':''}">🔗</span></div>`;
        } else {
            d.innerHTML = `<img src="${e.img}" onerror="this.src='logo.png'"><span>${e.n}</span>`;
            d.onclick = () => { currentRoutineSelections.push({n:e.n, s:false, series:5, reps:"12-10-8-8-8"}); renderExercises(sorted); renderSelectedSummary(); };
        }
        c.appendChild(d);
    });
}
window.removeSelection = (n) => { currentRoutineSelections = currentRoutineSelections.filter(x => x.n !== n); renderExercises(EXERCISES); renderSelectedSummary(); };
window.updateSelectionData = (i,f,v) => { if(currentRoutineSelections[i]) currentRoutineSelections[i][f] = f==='series'?(parseInt(v)||0):v; };
window.toggleSuperset = (i) => { if(i < currentRoutineSelections.length-1) { currentRoutineSelections[i].s = !currentRoutineSelections[i].s; renderExercises(EXERCISES); renderSelectedSummary(); } };
window.filterExercises = (v) => renderExercises(EXERCISES.filter(e => normalizeText(e.n).includes(normalizeText(v)) || normalizeText(e.m).includes(normalizeText(v))));
window.renderSelectedSummary = () => {
    const d = document.getElementById('selected-summary'); d.innerHTML = '';
    if(currentRoutineSelections.length) {
        const l = document.createElement('div'); l.className = 'editor-legend'; l.style.cssText = "display:flex;gap:8px;overflow-x:auto;padding:10px;background:#111;margin-bottom:10px;";
        currentRoutineSelections.forEach((o,i) => { l.innerHTML += `<span onclick="document.getElementById('ex-card-${normalizeText(o.n)}').scrollIntoView({behavior:'smooth'})" style="white-space:nowrap;color:#ccc;font-size:0.8rem;">${i+1}. ${o.n} ${o.s?'🔗':''} ${i<currentRoutineSelections.length-1?'›':''}</span>`; });
        d.appendChild(l);
    }
};

// --- INIT LISTENERS ---
window.switchTab = switchTab;
document.getElementById('btn-register').onclick=async()=>{ try{ const c=await createUserWithEmailAndPassword(auth,document.getElementById('reg-email').value,document.getElementById('reg-pass').value); await setDoc(doc(db,"users",c.user.uid),{ name:document.getElementById('reg-name').value, email:document.getElementById('reg-email').value, telegram: document.getElementById('reg-telegram')?.value||"", approved: false, role: 'athlete', gender:document.getElementById('reg-gender').value, age:parseInt(document.getElementById('reg-age').value), height:parseInt(document.getElementById('reg-height').value), weightHistory: [], measureHistory: [], skinfoldHistory: [], bioHistory: [], prs: {}, stats: {workouts:0, totalKg:0, totalSets:0, totalReps:0}, muscleStats: {}, joined: serverTimestamp(), showVideos: false, showBio: false }); }catch(e){alert(e.message);} };
document.getElementById('btn-login').onclick=()=>signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value).catch(e=>alert(e.message));
