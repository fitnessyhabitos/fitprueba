import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Iniciada (v6.7 - Integración Senior Total)...");

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
let assistantsCache = [];
let currentRoutineSelections = [];
window.currentRoutineSelections = currentRoutineSelections; 
let swapTargetIndex = null; 

let selectedPlanForMassAssign = null; 
let selectedRoutineForMassAssign = null;
let assignMode = 'plan'; 

// --- SISTEMA DE AVISOS (INTEGRACIÓN v6.7) ---

function initNoticesListener() {
    if (noticesUnsubscribe) noticesUnsubscribe();
    if (!currentUser) return;
    const routinesView = document.getElementById('routines-view');
    let display = document.getElementById('notices-display-area');
    if (!display && routinesView) {
        display = document.createElement('div'); display.id = 'notices-display-area';
        display.style.marginBottom = '20px'; routinesView.prepend(display);
    }
    const q = query(collection(db, "notices"), where("active", "==", true), orderBy("createdAt", "desc"), limit(5));
    noticesUnsubscribe = onSnapshot(q, (snapshot) => {
        if(!display) return; display.innerHTML = '';
        snapshot.forEach(docSnap => {
            const n = docSnap.data();
            if (!userData?.readNotices?.includes(docSnap.id) && (n.target === 'all' || n.target === currentUser.uid)) {
                const card = document.createElement('div'); card.className = 'card notice-item notice-card-animate';
                card.style.borderLeft = n.target === 'all' ? '4px solid var(--warning-color)' : '4px solid var(--success-color)';
                const imgH = n.image ? `<img src="${n.image}" style="width:100%; border-radius:8px; margin:10px 0; max-height:250px; object-fit:cover;" onclick="window.viewFullImage(this.src)">` : '';
                const linkH = n.link ? `<button class="btn-small btn-outline" onclick="window.open('${n.link}', '_blank')" style="margin-top:5px; border-color:var(--accent-color); color:var(--accent-color);">🔗 VER ENLACE</button>` : '';
                card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:start;">
                    <h4 style="color:white; margin:0; font-size:1rem;">${n.target === 'all' ? '📢 AVISO GLOBAL' : '📩 MENSAJE PERSONAL'}</h4>
                    <button onclick="window.dismissNotice('${docSnap.id}')" style="background:none; border:none; color:#666; font-size:1.2rem; cursor:pointer;">✕</button>
                </div><div style="font-weight:bold; color:white; margin:5px 0;">${n.title}</div><p style="color:#aaa; font-size:0.85rem; line-height:1.4;">${n.text}</p>${imgH}${linkH}`;
                display.appendChild(card);
            }
        });
    });
}

window.dismissNotice = async (id) => {
    try { await updateDoc(doc(db, "users", currentUser.uid), { readNotices: arrayUnion(id) });
    if(!userData.readNotices) userData.readNotices = []; userData.readNotices.push(id); } catch(e) {}
};

window.openNoticeModal = (uid, name) => {
    selectedUserCoach = uid;
    document.getElementById('modal-notice-target-name').innerText = name || "Atleta";
    window.openModal('modal-send-notice');
};

window.publishNotice = async (target) => {
    const isG = target === 'all';
    const title = document.getElementById(isG ? 'adm-notice-title' : 'ind-notice-title')?.value;
    const text = document.getElementById(isG ? 'adm-notice-text' : 'ind-notice-text')?.value;
    const link = document.getElementById(isG ? 'adm-notice-link' : 'ind-notice-link')?.value;
    const file = document.getElementById(isG ? 'adm-notice-file' : 'ind-notice-file')?.files[0];
    if (!title || !text) return alert("Título y texto obligatorios");
    const btn = event.target; btn.innerText = "⏳..."; btn.disabled = true;
    try {
        let imageUrl = "";
        if (file) {
            const storageRef = ref(storage, `notices/${Date.now()}_${file.name}`);
            const snap = await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(snap.ref);
        }
        await addDoc(collection(db, "notices"), { title, text, link: link || "", image: imageUrl, target, active: true, createdAt: serverTimestamp(), createdBy: currentUser.uid });
        alert("✅ Aviso publicado.");
        if(!isG) window.closeModal('modal-send-notice');
        else { document.getElementById('adm-notice-title').value = ""; document.getElementById('adm-notice-text').value = ""; }
    } catch (e) { alert("Error: " + e.message); }
    finally { btn.innerText = isG ? "PUBLICAR" : "ENVIAR AVISO"; btn.disabled = false; }
};

// --- UTILIDADES ---
const normalizeText = (text) => text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return d.getUTCFullYear() + "_W" + Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
}

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
    const m = document.getElementById(id); if(m) m.classList.add('active');
};
window.closeModal = (id) => {
    const m = document.getElementById(id); if(m) m.classList.remove('active');
    document.body.classList.remove('modal-open'); document.body.style.top = ''; window.scrollTo(0, scrollPos);
};
window.toggleElement = (id) => document.getElementById(id)?.classList.toggle('hidden');

// --- AUDIO ENGINE ---
const SILENT_MP3_URL = "https://raw.githubusercontent.com/anars/blank-audio/master/1-minute-of-silence.mp3";
let htmlAudioElement = new Audio(SILENT_MP3_URL);
htmlAudioElement.loop = true; htmlAudioElement.preload = 'auto';

function initAudioEngine() {
    if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    htmlAudioElement.play().then(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
            navigator.mediaSession.setActionHandler('play', () => htmlAudioElement.play());
            navigator.mediaSession.setActionHandler('pause', () => htmlAudioElement.pause());
        }
    }).catch(() => {});
}

function playTickSound(isFinal = false) {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.frequency.value = isFinal ? 600 : 1000; osc.type = isFinal ? 'square' : 'sine';
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime; osc.start(now);
    gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.8 : 0.1));
    osc.stop(now + (isFinal ? 0.8 : 0.1));
    if("vibrate" in navigator) navigator.vibrate(isFinal ? [500] : [50]);
}
document.body.addEventListener('touchstart', initAudioEngine, {once:true});

// --- CORE HANDLERS ---
onAuthStateChanged(auth, async (user) => {
    if(user) {
        currentUser = user; const snap = await getDoc(doc(db,"users",user.uid));
        if(snap.exists()){
            userData = snap.data(); checkPhotoVisualReminder(); initCommunityListener(); initNoticesListener(); checkPhotoReminder(); injectTelegramUI();
            if(userData.role === 'admin' || userData.role === 'assistant') document.getElementById('top-btn-coach').classList.remove('hidden');
            if(userData.approved){
                setTimeout(() => document.getElementById('loading-screen').classList.add('hidden'), 1500);
                document.getElementById('main-header').classList.remove('hidden');
                loadRoutines();
                const savedW = localStorage.getItem('fit_active_workout');
                if(savedW) { activeWorkout = JSON.parse(savedW); renderWorkout(); switchTab('workout-view'); startTimerMini(); } 
                else { switchTab('routines-view'); }
            } else { alert("Cuenta en revisión."); signOut(auth); }
        }
    } else {
        setTimeout(() => document.getElementById('loading-screen').classList.add('hidden'), 1500);
        switchTab('auth-view'); document.getElementById('main-header').classList.add('hidden');
    }
});

function initCommunityListener() {
    if (communityUnsubscribe) communityUnsubscribe();
    const q = query(collection(db, "workouts"), orderBy("date", "desc"), limit(1));
    communityUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added" && change.doc.data().uid !== currentUser.uid) {
                const w = change.doc.data();
                if ((Date.now()/1000) - (w.date?.seconds||0) < 60) showToast(`🔥 Alguien terminó: ${w.routine}`);
            }
        });
    });
}

// --- RENDERING ENGINE ---
window.switchTab = (t) => {
    document.querySelectorAll('.view-container').forEach(e => e.classList.remove('active'));
    document.getElementById(t).classList.add('active');
    document.querySelectorAll('.top-nav-item').forEach(n => n.classList.remove('active'));
    if (t === 'routines-view') document.getElementById('top-btn-routines').classList.add('active');
    if (t === 'profile-view') { document.getElementById('top-btn-profile').classList.add('active'); loadProfile(); }
    if (t === 'admin-view' || t === 'coach-detail-view') document.getElementById('top-btn-coach').classList.add('active');
};

function getExerciseData(name) {
    let match = EXERCISES.find(e => normalizeText(e.n) === normalizeText(name));
    if(!match) return { img: 'logo.png', mInfo: {main:'General', sec:[]}, type:'c', v:null };
    return { img: match.img, mInfo: getMuscleInfoByGroup(match.m), type: match.t || 'c', v: match.v };
}

async function loadRoutines() {
    const l = document.getElementById('routines-list'); l.innerHTML = 'Cargando...';
    onSnapshot(query(collection(db,"routines")), (s)=>{
        l.innerHTML = '';
        s.forEach(d=>{
            const r = d.data();
            if(r.assignedTo?.includes(currentUser.uid)){
                const div = document.createElement('div'); div.className = 'card';
                div.innerHTML = `<div style="display:flex; justify-content:space-between;"><h3 style="color:var(--accent-color)">${r.name}</h3><div>${r.uid === currentUser.uid ? `<button style="background:none;border:none;margin-right:10px;" onclick="openEditor('${d.id}')">✏️</button><button style="background:none;border:none;" onclick="delRoutine('${d.id}')">🗑️</button>` : '🔒'}</div></div><p style="color:#666; font-size:0.8rem; margin:10px 0;">${r.exercises.length} Ejercicios</p><button class="btn" onclick="startWorkout('${d.id}')">ENTRENAR</button>`;
                l.appendChild(div);
            }
        });
    });
}

// --- WORKOUT ENGINE ---
function saveLocalWorkout() { if(activeWorkout) localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); }

window.startWorkout = async (rid) => {
    initAudioEngine();
    try {
        const snap = await getDoc(doc(db,"routines",rid)); const r = snap.data();
        let lastW = null; const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid));
        const wSnap = await getDocs(q); 
        const sameR = wSnap.docs.map(d=>d.data()).filter(d => d.routine === r.name).sort((a,b) => b.date - a.date);
        if(sameR.length > 0) lastW = sameR[0].details;

        activeWorkout = { name: r.name, startTime: Date.now(), exs: r.exercises.map(exObj => {
            const name = typeof exObj === 'string' ? exObj : exObj.n; const data = getExerciseData(name);
            const series = parseInt(exObj.series)||5; const reps = (exObj.reps || "12").split('-');
            let sets = Array(series).fill().map((_, i) => ({ r: parseInt(reps[i]||reps[0]), w: 0, d: false, prev: '-', numDisplay: (i + 1).toString() }));
            if(lastW) { const pEx = lastW.find(ld => ld.n === name); if(pEx?.s) { sets = sets.map((s, idx) => { if(pEx.s[idx]) s.prev = `${pEx.s[idx].r}x${pEx.s[idx].w}kg`; return s; }); } }
            return { n:name, img:data.img, mInfo: data.mInfo, type: data.type, video: data.v, sets, superset: exObj.s || false, note: "" }; 
        })};
        saveLocalWorkout(); renderWorkout(); switchTab('workout-view'); startTimerMini();
    } catch(e) { console.error(e); }
};

function renderWorkout() {
    const c = document.getElementById('workout-exercises'); if(!c) return; c.innerHTML = '';
    activeWorkout.exs.forEach((e, i) => {
        const card = document.createElement('div'); card.className = 'card';
        if(e.superset) card.style.borderBottom = "2px dashed var(--accent-color)";
        let setsHtml = `<div class="set-header"><div>#</div><div>PREV</div><div>REPS</div><div>KG</div><div></div></div>`;
        e.sets.forEach((s, j) => {
            const isDrop = s.numDisplay.includes('.');
            setsHtml += `<div class="set-row ${isDrop ? 'is-dropset' : ''}">
                <div class="set-num">${s.numDisplay}</div><div class="prev-data">${s.prev}</div>
                <div><input type="number" value="${s.r}" onchange="window.uS(${i},${j},'r',this.value)"></div>
                <div><input type="number" placeholder="kg" onchange="window.uS(${i},${j},'w',this.value)"></div>
                <div style="display:flex; gap:2px;"><button class="btn-outline ${s.d ? 'btn-done' : ''}" onclick="window.tS(${i},${j})">${s.d ? '✓' : ''}</button>
                ${!s.d && !isDrop ? `<button class="btn-small btn-outline" style="border-color:orange;color:orange;" onclick="window.addDropset(${i},${j})">D</button>`:''}</div>
            </div>`;
        });
        card.innerHTML = `<div class="workout-split"><div class="workout-visual"><img src="${e.img}"></div><div class="workout-bars"><span>${e.mInfo.main}</span><div class="mini-track"><div class="mini-fill fill-primary"></div></div></div></div>
            <h3 style="display:flex; justify-content:space-between; align-items:center;">${e.n} <div><button class="btn-small btn-outline" onclick="window.openNoteModal(${i})">📝</button> ${e.video ? `<button class="btn-small btn-outline" style="border-color:red;" onclick="window.openVideo('${e.video}')">🎥</button>` : ''} <button class="btn-small btn-outline" onclick="window.initSwap(${i})">🔄</button></div></h3>${setsHtml}
            <div class="sets-actions"><button class="btn-set-control" onclick="window.toggleAllSets(${i})">✓ TODO</button><button class="btn-set-control" onclick="window.addSet(${i})">+ Serie</button></div>`;
        c.appendChild(card);
    });
}

window.uS = (i,j,k,v) => { if(activeWorkout.exs[i]?.sets[j]) { activeWorkout.exs[i].sets[j][k] = v; saveLocalWorkout(); } };
window.tS = (i,j) => { 
    const s = activeWorkout.exs[i].sets[j]; s.d = !s.d; 
    if(s.d) {
        const weight = parseFloat(s.w)||0; const reps = parseInt(s.r)||0;
        if(weight > 0 && reps > 0) {
            const rm = Math.round(weight / (1.0278 - (0.0278 * reps)));
            const currentRecord = userData.rmRecords?.[activeWorkout.exs[i].n] || 0;
            if(rm > currentRecord) { 
                updateDoc(doc(db,"users",currentUser.uid), {[`rmRecords.${activeWorkout.exs[i].n}`]: rm});
                showToast(`🔥 NUEVO RM: ${rm}kg!`);
            }
        }
        openRest(); 
    }
    renderWorkout(); saveLocalWorkout(); 
};

window.addSet = (exIdx) => { activeWorkout.exs[exIdx].sets.push({r:12, w:0, d:false, prev:'-', numDisplay: (activeWorkout.exs[exIdx].sets.length + 1).toString()}); saveLocalWorkout(); renderWorkout(); };
window.addDropset = (exIdx, setIdx) => {
    const cur = activeWorkout.exs[exIdx].sets[setIdx]; cur.d = true;
    activeWorkout.exs[exIdx].sets.splice(setIdx+1, 0, {r: Math.floor(cur.r*0.8), w: Math.floor(cur.w*0.7), d:false, prev:'DROPSET', numDisplay: cur.numDisplay+".5"});
    saveLocalWorkout(); renderWorkout();
};
window.toggleAllSets = (idx) => { const ex = activeWorkout.exs[idx]; const state = !ex.sets.every(s=>s.d); ex.sets.forEach(s=>s.d=state); saveLocalWorkout(); renderWorkout(); };

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
        const ring = document.getElementById('timer-progress-ring');
        if(ring) ring.style.strokeDashoffset = 565 - (time / totalRestTime) * 565;
        if(time <= 5 && time > 0) playTickSound(false);
        if(time <= 0) { clearInterval(timerInt); window.closeModal('modal-timer'); playTickSound(true); }
    }, 1000);
}

// --- ADMIN USERS LIST (AVISOS QUICK-ACCESS) ---
window.loadAdminUsers = async () => {
    const l = document.getElementById('admin-list'); if(!l) return; l.innerHTML = '↻...';
    try {
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const s = await getDocs(q); l.innerHTML = '';
        
        // Aviso Global
        const gCard = document.createElement('div'); gCard.className = 'card'; gCard.style.borderLeft = '4px solid var(--warning-color)';
        gCard.innerHTML = `<h4 style="color:var(--warning-color);">📢 AVISO GLOBAL (TODOS)</h4><input type="text" id="adm-notice-title" placeholder="Título..."><textarea id="adm-notice-text" placeholder="Mensaje..." rows="1"></textarea>
            <div style="display:flex; gap:5px; margin-top:5px;"><input type="text" id="adm-notice-link" placeholder="Link" style="flex:1; margin:0;"><button class="btn-small btn-outline" onclick="document.getElementById('adm-notice-file').click()">📷</button><input type="file" id="adm-notice-file" class="hidden" accept="image/*"><button class="btn-small btn" onclick="window.publishNotice('all')" style="background:var(--warning-color); color:black;">ENVIAR</button></div>`;
        l.appendChild(gCard);

        const usersList = s.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.lastWorkoutDate?.seconds || 0) - (a.lastWorkoutDate?.seconds || 0));
        usersList.forEach(u => {
            const div = document.createElement('div'); div.className = "admin-user-row";
            const av = u.photo ? `<img src="${u.photo}" class="mini-avatar">` : `<div class="mini-avatar-placeholder">${u.name.charAt(0)}</div>`;
            div.innerHTML = `${av}<div style="flex:1; overflow:hidden;" onclick="window.openCoachView('${u.id}')"><div style="font-weight:bold; color:white;">${u.name}</div><div style="font-size:0.7rem; color:#666;">${u.email}</div></div>
                <div style="display:flex; gap:5px;"><button class="btn-small btn-outline" style="border-color:var(--success-color); color:var(--success-color); padding:8px;" onclick="window.openNoticeModal('${u.id}', '${u.name}')">📩</button><button class="btn-small btn-outline" style="padding:8px;" onclick="window.openCoachView('${u.id}')">⚙️</button></div>`;
            l.appendChild(div);
        });
    } catch(e) { l.innerHTML = 'Error de permisos.'; }
};

window.openCoachView = async (uid) => {
    selectedUserCoach = uid; const snap = await getDoc(doc(db, "users", uid)); selectedUserObj = {id: uid, ...snap.data()};
    switchTab('coach-detail-view');
    document.getElementById('coach-user-name').innerText = selectedUserObj.name;
    document.getElementById('coach-user-email').innerText = selectedUserObj.email;
    document.getElementById('coach-user-meta').innerText = `${selectedUserObj.age || '?'} años • ${selectedUserObj.height || '?'}cm`;
    if(selectedUserObj.photo) { document.getElementById('coach-user-img').src = selectedUserObj.photo; document.getElementById('coach-user-img').style.display='block'; document.getElementById('coach-user-initial').style.display='none'; }
    
    // Assigned Routines
    const rList = document.getElementById('coach-assigned-list'); rList.innerHTML = '';
    const rSnap = await getDocs(collection(db, "routines"));
    rSnap.forEach(d => { if(d.data().assignedTo?.includes(uid)) rList.innerHTML += `<div class="assigned-routine-item"><span>${d.data().name}</span><button onclick="window.unassignRoutine('${d.id}')">❌</button></div>`; });
    
    renderMuscleRadar('coachMuscleChart', selectedUserObj.muscleStats || {});
    if(selectedUserObj.weightHistory) {
        if(coachChart) coachChart.destroy();
        coachChart = new Chart(document.getElementById('coachWeightChart'), { type:'line', data: { labels:selectedUserObj.weightHistory.map((_,i)=>i), datasets:[{label:'Kg', data:selectedUserObj.weightHistory, borderColor:'#ff3333'}] }, options:{maintainAspectRatio:false}});
    }
};

// --- JACKSON-POLLOCK 7 & BIO ---
window.calculateAndSaveSkinfolds = async () => {
    const s = { chest: parseFloat(document.getElementById('p-chest').value)||0, axilla: parseFloat(document.getElementById('p-axilla').value)||0, tricep: parseFloat(document.getElementById('p-tricep').value)||0, subscap: parseFloat(document.getElementById('p-subscap').value)||0, abdo: parseFloat(document.getElementById('p-abdo').value)||0, supra: parseFloat(document.getElementById('p-supra').value)||0, thigh: parseFloat(document.getElementById('p-thigh').value)||0 };
    const sum = Object.values(s).reduce((a,b)=>a+b,0);
    const age = userData.age || 25;
    let bd = userData.gender === 'male' ? 1.112 - (0.00043499*sum) + (0.00000055*sum*sum) - (0.00028826*age) : 1.097 - (0.00046971*sum) + (0.00000056*sum*sum) - (0.00012828*age);
    const fat = ((495 / bd) - 450).toFixed(1);
    await updateDoc(doc(db, "users", currentUser.uid), { skinfoldHistory: arrayUnion({date: new Date(), fat: fat, skinfolds: s}), bodyFat: fat });
    alert(`Grasa: ${fat}%`); loadProfile();
};

// --- CHARTS ---
function renderMuscleRadar(canvasId, stats) {
    const ctx = document.getElementById(canvasId); if(!ctx) return;
    const groups = ["Pecho", "Espalda", "Cuádriceps", "Isquios", "Hombros", "Bíceps", "Tríceps", "Glúteos"];
    new Chart(ctx, { type: 'radar', data: { labels: groups, datasets: [{ label: 'Volumen', data: groups.map(m => stats[m] || 0), backgroundColor: 'rgba(255, 51, 51, 0.4)', borderColor: '#ff3333' }] }, options: { scales: { r: { angleLines: { color: '#333' }, grid: { color: '#333' }, ticks: { display: false } } }, maintainAspectRatio: false } });
}
function renderBioChart(id, h) {
    new Chart(document.getElementById(id), { type: 'line', data: { labels: h.map(x => new Date(x.date.seconds*1000).toLocaleDateString()), datasets: [{ label: 'Músculo', data: h.map(x => x.muscle), borderColor: '#00ffff' }, { label: 'Grasa', data: h.map(x => x.fat), borderColor: '#ffaa00' }] }, options: { maintainAspectRatio: false } });
}
function renderMeasureChart(id, h) {
    const parts = [{k:'chest', l:'Pecho', c:'#FF5733'}, {k:'waist', l:'Cintura', c:'#00FF88'}, {k:'hip', l:'Cadera', c:'#3357FF'}, {k:'arm', l:'Brazo', c:'#FF33A8'}];
    new Chart(document.getElementById(id), { type: 'line', data: { labels: h.map(x => new Date(x.date.seconds*1000).toLocaleDateString()), datasets: parts.map(p => ({ label: p.l, data: h.map(x => x[p.k]||0), borderColor: p.c })) }, options: { maintainAspectRatio: false } });
}

// --- CSV EXPORT ---
window.exportWorkoutHistory = async () => {
    if (!window.tempHistoryCache) return alert("Carga datos primero");
    let csv = "\uFEFFFecha,Rutina,Ejercicio,Series,Reps,Volumen\n";
    window.tempHistoryCache.forEach(w => {
        w.details.forEach(ex => {
            let vol = ex.s.reduce((a,b)=>a+(b.r*b.w),0);
            csv += `${new Date(w.date.seconds*1000).toLocaleDateString()},${w.routine},${ex.n},${ex.s.length},${ex.s.reduce((a,b)=>a+b.r,0)},${vol}\n`;
        });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `FitData_${userData.name}.csv`; link.click();
};

// --- LIBRERÍA & PLANES ---
window.loadAdminLibrary = async () => {
    const l = document.getElementById('admin-lib-list'); l.innerHTML = '↻';
    const s = await getDocs(collection(db, "routines")); l.innerHTML = '<button class="btn" style="margin-bottom:15px;" onclick="window.openEditor()">+ NUEVA RUTINA</button>';
    s.forEach(d => {
        const r = d.data(); l.innerHTML += `<div class="assigned-routine-item"><b>${r.name}</b> <div><button onclick="window.cloneRoutine('${d.id}')">🖨</button><button onclick="window.openEditor('${d.id}')">✏️</button><button onclick="window.initMassAssignRoutine('${d.id}')">📤</button><button onclick="delRoutine('${d.id}')">🗑️</button></div></div>`;
    });
};

window.loadAdminPlans = async () => {
    const list = document.getElementById('admin-plans-list'); const sel = document.getElementById('plan-routine-selector');
    const rSnap = await getDocs(collection(db, "routines")); sel.innerHTML = '';
    rSnap.forEach(d => { sel.innerHTML += `<div class="selector-item"><input type="checkbox" class="plan-check" value="${d.id}" id="chk-${d.id}"><label for="chk-${d.id}">${d.data().name}</label></div>`; });
    const pSnap = await getDocs(collection(db, "plans")); list.innerHTML = '';
    pSnap.forEach(d => { const p = d.data(); list.innerHTML += `<div class="assigned-routine-item"><b>${p.name}</b><button class="btn-small btn" onclick="window.openAssignPlanModal('${d.id}')">📤</button></div>`; });
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
    if(assignMode === 'plan') {
        const p = await getDoc(doc(db, "plans", selectedPlanForMassAssign));
        const promises = p.data().routines.map(rid => updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(...ids) }));
        await Promise.all(promises);
    } else { await updateDoc(doc(db, "routines", selectedRoutineForMassAssign), { assignedTo: arrayUnion(...ids) }); }
    alert("✅ Enviado"); window.closeModal('modal-assign-plan');
};

// --- MISC HANDLERS ---
window.viewWorkoutDetails = (t, d, n) => {
    const details = JSON.parse(decodeURIComponent(d)); let h = `<p><i>${decodeURIComponent(n||"")}</i></p><hr>`;
    details.forEach(ex => { h += `<b>${ex.n}</b><br>`; ex.s.forEach((s, idx) => h += `<small>S${idx+1}: ${s.r}x${s.w}kg</small><br>`); });
    document.getElementById('detail-title').innerText = t; document.getElementById('detail-content').innerHTML = h; window.openModal('modal-details');
};

window.initSwap = (idx) => {
    swapTargetIndex = idx; const muscle = activeWorkout.exs[idx].mInfo.main;
    const alternatives = EXERCISES.filter(e => e.m === muscle && e.n !== activeWorkout.exs[idx].n);
    const list = document.getElementById('swap-list'); list.innerHTML = alternatives.length ? '' : 'No hay alternativas.';
    alternatives.forEach(alt => { const d = document.createElement('div'); d.style.padding = "10px"; d.innerHTML = `<b>${alt.n}</b>`; d.onclick = () => { activeWorkout.exs[idx].n = alt.n; renderWorkout(); window.closeModal('modal-swap'); }; list.appendChild(d); });
    window.openModal('modal-swap');
};

window.openVideo = (url) => { 
    let id = url.includes("v=") ? url.split("v=")[1] : url.split("/").pop();
    document.getElementById('youtube-frame').src = `https://www.youtube.com/embed/${id}?autoplay=1`;
    window.openModal('modal-video');
};

window.saveConfig = async () => {
    const rt = document.getElementById('cfg-rest-time').value; const tg = document.getElementById('cfg-telegram')?.value || "";
    await updateDoc(doc(db,"users",currentUser.uid), { restTime: parseInt(rt), telegram: tg }); alert("Guardado");
};

window.contactCoach = () => window.open("https://t.me/fityhab", "_blank");
window.logout = () => signOut(auth).then(()=>location.reload());
window.viewFullImage = (src) => { document.getElementById('full-image-src').src = src; window.openModal('modal-image-viewer'); };

function injectTelegramUI() {
    const target = document.getElementById('cfg-rest-time');
    if (target && !document.getElementById('tg-wrapper')) {
        const div = document.createElement('div'); div.id = "tg-wrapper"; div.style.cssText = "margin-top:20px;text-align:center;border-top:1px solid #222;padding-top:15px;";
        div.innerHTML = `<label style="color:#aaa;font-size:0.8rem;">Usuario Telegram</label><input type="text" id="cfg-telegram" value="${userData.telegram||''}" style="text-align:center;"><button class="btn" onclick="window.contactCoach()">Contactar Coach</button>`;
        target.parentElement?.insertAdjacentElement('afterend', div);
    }
}

// --- BOOTSTRAP EVENTOS ---
document.getElementById('btn-login').onclick = () => signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value).catch(e => alert(e.message));
document.getElementById('btn-register').onclick = async () => {
    try {
        const c = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-pass').value);
        await setDoc(doc(db, "users", c.user.uid), {
            name: document.getElementById('reg-name').value, email: document.getElementById('reg-email').value, role: 'athlete', approved: false,
            secretCode: document.getElementById('reg-code').value, joined: serverTimestamp(), stats: {workouts:0, totalKg:0}, readNotices: []
        });
    } catch(e) { alert(e.message); }
};
