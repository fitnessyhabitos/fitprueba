import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Iniciada (v6.6 - Integración Total)...");

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

// --- SISTEMA DE AVISOS ---

function initNoticesListener() {
    if (noticesUnsubscribe) noticesUnsubscribe();
    if (!currentUser) return;
    const routinesView = document.getElementById('routines-view');
    let display = document.getElementById('notices-display-area');
    if (!display && routinesView) {
        display = document.createElement('div');
        display.id = 'notices-display-area';
        display.style.marginBottom = '20px';
        routinesView.prepend(display);
    }
    const q = query(collection(db, "notices"), where("active", "==", true), orderBy("createdAt", "desc"), limit(5));
    noticesUnsubscribe = onSnapshot(q, (snapshot) => {
        if (!display) return;
        display.innerHTML = '';
        snapshot.forEach(docSnap => {
            const n = docSnap.data();
            const noticeId = docSnap.id;
            const isRead = userData?.readNotices?.includes(noticeId);
            if (!isRead && (n.target === 'all' || n.target === currentUser.uid)) {
                const card = document.createElement('div');
                card.className = 'card notice-item notice-card-animate';
                card.style.borderLeft = n.target === 'all' ? '4px solid var(--warning-color)' : '4px solid var(--success-color)';
                const imgHtml = n.image ? `<img src="${n.image}" style="width:100%; border-radius:8px; margin:10px 0; max-height:250px; object-fit:cover;" onclick="window.viewFullImage(this.src)">` : '';
                const linkHtml = n.link ? `<button class="btn-small btn-outline" onclick="window.open('${n.link}', '_blank')" style="margin-top:10px; border-color:var(--accent-color); color:var(--accent-color);">🔗 VER ENLACE</button>` : '';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <h4 style="color:white; margin:0;">${n.target === 'all' ? '📢' : '📩'} ${n.title}</h4>
                        <button onclick="window.dismissNotice('${noticeId}')" style="background:none; border:none; color:#666; font-size:1.2rem; cursor:pointer;">✕</button>
                    </div>
                    <p style="color:#aaa; font-size:0.85rem; margin-top:10px; line-height:1.4;">${n.text}</p>
                    ${imgHtml}${linkHtml}`;
                display.appendChild(card);
            }
        });
    });
}

window.dismissNotice = async (id) => {
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { readNotices: arrayUnion(id) });
        if(!userData.readNotices) userData.readNotices = [];
        userData.readNotices.push(id);
    } catch(e) { console.error("Error dismiss:", e); }
};

window.openNoticeModal = (uid, name) => {
    selectedUserCoach = uid;
    const label = document.getElementById('modal-notice-target-name');
    if(label) label.innerText = name || "Atleta";
    window.openModal('modal-send-notice');
};

window.publishNotice = async (target) => {
    const isG = target === 'all';
    const title = document.getElementById(isG ? 'adm-notice-title' : 'ind-notice-title')?.value;
    const text = document.getElementById(isG ? 'adm-notice-text' : 'ind-notice-text')?.value;
    const link = document.getElementById(isG ? 'adm-notice-link' : 'ind-notice-link')?.value;
    const file = document.getElementById(isG ? 'adm-notice-file' : 'ind-notice-file')?.files[0];

    if (!title || !text) return alert("Título y texto obligatorios");
    const btn = event.target;
    btn.innerText = "⏳ PUBLICANDO..."; btn.disabled = true;

    try {
        let imageUrl = "";
        if (file) {
            const storageRef = ref(storage, `notices/${Date.now()}_${file.name}`);
            const snap = await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(snap.ref);
        }
        await addDoc(collection(db, "notices"), {
            title, text, link: link || "", image: imageUrl,
            target, active: true, createdAt: serverTimestamp(), createdBy: currentUser.uid
        });
        alert("✅ Aviso publicado.");
        if(isG) {
            document.getElementById('adm-notice-title').value = "";
            document.getElementById('adm-notice-text').value = "";
        } else {
            window.closeModal('modal-send-notice');
        }
    } catch (e) { alert("Error: " + e.message); }
    finally { btn.innerText = isG ? "PUBLICAR" : "ENVIAR AVISO"; btn.disabled = false; }
};

// --- UTILIDADES ---
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return d.getUTCFullYear() + "_W" + weekNo;
}

function initCommunityListener() {
    if (communityUnsubscribe) communityUnsubscribe(); 
    const q = query(collection(db, "workouts"), orderBy("date", "desc"), limit(1));
    communityUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const w = change.doc.data();
                const now = Date.now() / 1000;
                const workoutTime = w.date ? w.date.seconds : 0;
                if (now - workoutTime < 60 && w.uid !== currentUser.uid) {
                    showToast(`🔥 Alguien terminó: ${w.routine}`);
                    if(document.getElementById('cfg-sound')?.checked) {
                         const osc = audioCtx?.createOscillator();
                         if(osc) {
                             const g = audioCtx.createGain();
                             osc.connect(g); g.connect(audioCtx.destination);
                             osc.frequency.value = 500; osc.start(); g.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
                             osc.stop(audioCtx.currentTime + 0.5);
                         }
                    }
                }
            }
        });
    });
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

const normalizeText = (text) => text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

window.toggleElement = (id) => {
    const el = document.getElementById(id);
    if(el) el.classList.toggle('hidden');
};

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
    htmlAudioElement.play().then(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
            navigator.mediaSession.setActionHandler('play', () => { htmlAudioElement.play(); });
            navigator.mediaSession.setActionHandler('pause', () => { htmlAudioElement.pause(); });
        }
    }).catch(e => console.log("Audio waiting interaction"));
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

document.body.addEventListener('touchstart', initAudioEngine, {once:true});

// --- CORE BOOTSTRAP ---
onAuthStateChanged(auth, async (user) => {
    if(user) {
        currentUser = user;
        const snap = await getDoc(doc(db,"users",user.uid));
        if(snap.exists()){
            userData = snap.data();
            checkPhotoVisualReminder();
            initCommunityListener();
            initNoticesListener();
            checkPhotoReminder();
            injectTelegramUI();
            if(userData.role === 'admin' || userData.role === 'assistant') document.getElementById('top-btn-coach').classList.remove('hidden');
            if(userData.approved){
                setTimeout(() => { document.getElementById('loading-screen').classList.add('hidden'); }, 1000); 
                document.getElementById('main-header').classList.remove('hidden');
                loadRoutines();
                const savedW = localStorage.getItem('fit_active_workout');
                if(savedW) { activeWorkout = JSON.parse(savedW); renderWorkout(); switchTab('workout-view'); startTimerMini(); } 
                else { switchTab('routines-view'); }
            } else { alert("Cuenta en revisión."); signOut(auth); }
        }
    } else {
        setTimeout(() => { document.getElementById('loading-screen').classList.add('hidden'); }, 1000);
        switchTab('auth-view'); document.getElementById('main-header').classList.add('hidden');
    }
});

function checkPhotoReminder() {
    if(!userData.photoDay) return;
    const now = new Date();
    if(now.getDay() == userData.photoDay && now.toTimeString().substr(0,5) === userData.photoTime) alert("📸 HORA DE TU FOTO DE PROGRESO 📸");
}

function checkPhotoVisualReminder() {
    const bannerId = 'photo-missing-banner';
    const existing = document.getElementById(bannerId);
    if(existing) existing.remove();
    if(!userData.photo || userData.photo === "") {
        const div = document.createElement('div');
        div.id = bannerId;
        div.style.cssText = "background: #ffaa00; color: #000; padding: 10px; text-align: center; font-weight: bold; font-size: 0.9rem; cursor: pointer; animation: pulse 2s infinite; margin-top:5px;";
        div.innerHTML = "📸 ¡Sube tu foto de perfil para aparecer en el Ranking! (Click aquí)";
        div.onclick = () => { switchTab('profile-view'); };
        document.getElementById('main-header')?.insertAdjacentElement('afterend', div);
    }
}

// --- RENDERING ENGINE ---
window.loadProfile = async () => {
    document.getElementById('profile-name').innerText = userData.name;
    if(userData.photo) { document.getElementById('avatar-text').style.display='none'; document.getElementById('avatar-img').src = userData.photo; document.getElementById('avatar-img').style.display='block'; }
    updatePhotoDisplay(userData);
    
    document.getElementById('stat-workouts').innerText = userData.stats.workouts || 0;
    document.getElementById('stat-kg').innerText = userData.stats.totalKg ? (userData.stats.totalKg/1000).toFixed(1)+'t' : 0;
    document.getElementById('stat-sets').innerText = userData.stats.totalSets || 0;
    document.getElementById('stat-reps').innerText = userData.stats.totalReps || 0;

    const ctx = document.getElementById('weightChart'); 
    if(chartInstance) chartInstance.destroy();
    const wData = userData.weightHistory?.length > 0 ? userData.weightHistory : [70];
    chartInstance = new Chart(ctx, { type:'line', data:{ labels:wData.map((_,i)=>i), datasets:[{label:'Kg', data:wData, borderColor:'#ff3333', fill:true, tension:0.4}] }, options:{maintainAspectRatio:false} });

    if(userData.showBio && userData.bioHistory?.length > 0) renderBioChart('chartBio', userData.bioHistory);
    if(userData.showMeasurements && userData.measureHistory?.length > 0) renderMeasureChart('chartMeasures', userData.measureHistory);
    
    renderMuscleRadar('userMuscleChart', userData.muscleStats || {});
};

// --- WORKOUT ENGINE ---
function saveLocalWorkout() { if(activeWorkout) localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); }

window.startWorkout = async (rid) => {
    try {
        const snap = await getDoc(doc(db,"routines",rid)); const r = snap.data();
        let lastW = null; const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid));
        const wSnap = await getDocs(q); 
        const sameR = wSnap.docs.map(d=>d.data()).filter(d => d.routine === r.name).sort((a,b) => b.date - a.date);
        if(sameR.length > 0) lastW = sameR[0].details;

        activeWorkout = { name: r.name, startTime: Date.now(), exs: r.exercises.map(exObj => {
            const name = typeof exObj === 'string' ? exObj : exObj.n; const data = getExerciseData(name);
            const repsArr = (exObj.reps || "12").split('-');
            let sets = Array(parseInt(exObj.series)||5).fill().map((_, i) => ({ r: parseInt(repsArr[i]||repsArr[0]), w: 0, d: false, prev: '-', numDisplay: (i + 1).toString() }));
            if(lastW) { const pEx = lastW.find(ld => ld.n === name); if(pEx?.s) { sets = sets.map((s, i) => { if(pEx.s[i]) s.prev = `${pEx.s[i].r}x${pEx.s[i].w}kg`; return s; }); } }
            return { n:name, img:data.img, mInfo: data.mInfo, type: data.type, video: data.v, sets, superset: exObj.s || false, note: "" }; 
        })};
        saveLocalWorkout(); renderWorkout(); switchTab('workout-view'); startTimerMini();
    } catch(e) { alert("Error"); }
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

// --- ADMIN / COACH LOGIC ---
window.loadAdminUsers = async () => {
    const l = document.getElementById('admin-list'); l.innerHTML = '↻...';
    try {
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const s = await getDocs(q); l.innerHTML = '';
        
        // Inyectar Aviso Global arriba de la lista
        const globalCard = document.createElement('div');
        globalCard.className = 'card'; globalCard.style.borderLeft = '4px solid var(--warning-color)';
        globalCard.innerHTML = `
            <h4 style="color:var(--warning-color);">📢 AVISO GLOBAL (TODOS)</h4>
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
                    <button class="btn-small btn-outline" style="border-color:var(--success-color); color:var(--success-color); padding:8px;" onclick="window.openNoticeModal('${u.id}', '${u.name}')">📩</button>
                    <button class="btn-small btn-outline" style="padding:8px;" onclick="window.openCoachView('${u.id}')">⚙️</button>
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
    
    const dietSel = document.getElementById('coach-diet-select'); dietSel.innerHTML = '<option value="">-- Sin Dieta --</option>';
    AVAILABLE_DIETS.forEach(d => { const opt = new Option(d.name, d.file); if(selectedUserObj.dietFile === d.file) opt.selected = true; dietSel.appendChild(opt); });
    
    const rList = document.getElementById('coach-assigned-list'); rList.innerHTML = '';
    const rSnap = await getDocs(collection(db, "routines"));
    rSnap.forEach(d => { if(d.data().assignedTo?.includes(uid)) rList.innerHTML += `<div class="assigned-routine-item"><span>${d.data().name}</span><button onclick="window.unassignRoutine('${d.id}')">❌</button></div>`; });
    
    renderMuscleRadar('coachMuscleChart', selectedUserObj.muscleStats || {});
    updateCoachPhotoDisplay('front');
};

// --- CHART UTILS ---
function renderMuscleRadar(id, stats) {
    const ctx = document.getElementById(id); if(!ctx) return;
    const groups = ["Pecho", "Espalda", "Cuádriceps", "Isquios", "Hombros", "Bíceps", "Tríceps", "Glúteos"];
    const config = { type: 'radar', data: { labels: groups, datasets: [{ label: 'Volumen', data: groups.map(m => stats[m] || 0), backgroundColor: 'rgba(255, 51, 51, 0.4)', borderColor: '#ff3333' }] }, options: { scales: { r: { angleLines: { color: '#333' }, grid: { color: '#333' }, ticks: { display: false } } }, maintainAspectRatio: false } };
    new Chart(ctx, config);
}

function renderBioChart(id, h) {
    const ctx = document.getElementById(id); if(!ctx) return;
    new Chart(ctx, { type: 'line', data: { labels: h.map(x => new Date(x.date.seconds*1000).toLocaleDateString()), datasets: [{ label: 'Músculo', data: h.map(x => x.muscle), borderColor: '#00ffff' }, { label: 'Grasa', data: h.map(x => x.fat), borderColor: '#ffaa00' }] }, options: { maintainAspectRatio: false } });
}

function renderMeasureChart(id, h) {
    const ctx = document.getElementById(id); if(!ctx) return;
    const parts = [{k:'chest', l:'Pecho', c:'#FF5733'}, {k:'waist', l:'Cintura', c:'#00FF88'}, {k:'hip', l:'Cadera', c:'#3357FF'}, {k:'arm', l:'Brazo', c:'#FF33A8'}];
    new Chart(ctx, { type: 'line', data: { labels: h.map(x => new Date(x.date.seconds*1000).toLocaleDateString()), datasets: parts.map(p => ({ label: p.l, data: h.map(x => x[p.k]||0), borderColor: p.c, tension: 0.3 })) }, options: { maintainAspectRatio: false } });
}

// --- LIBRERÍA & PLANES ---
window.loadAdminLibrary = async () => {
    const l = document.getElementById('admin-lib-list'); l.innerHTML = '<button class="btn" onclick="window.openEditor()">+ NUEVA</button>';
    const s = await getDocs(collection(db, "routines"));
    s.forEach(d => {
        l.innerHTML += `<div class="assigned-routine-item"><b>${d.data().name}</b> <div><button onclick="window.openEditor('${d.id}')">✏️</button><button onclick="window.initMassAssignRoutine('${d.id}')">📤</button></div></div>`;
    });
};

window.loadAdminPlans = async () => {
    const list = document.getElementById('admin-plans-list'); const sel = document.getElementById('plan-routine-selector');
    const rSnap = await getDocs(collection(db, "routines")); sel.innerHTML = '';
    rSnap.forEach(d => { sel.innerHTML += `<div class="selector-item"><input type="checkbox" class="plan-check" value="${d.id}" id="chk-${d.id}"><label for="chk-${d.id}">${d.data().name}</label></div>`; });
    const pSnap = await getDocs(collection(db, "plans")); list.innerHTML = '';
    pSnap.forEach(d => { list.innerHTML += `<div class="assigned-routine-item"><b>${d.data().name}</b><button class="btn-small btn" onclick="window.openAssignPlanModal('${d.id}')">📤</button></div>`; });
};

window.createPlan = async () => {
    const n = document.getElementById('new-plan-name').value; const checks = Array.from(document.querySelectorAll('.plan-check:checked')).map(c => c.value);
    if(!n || checks.length === 0) return alert("Error");
    await addDoc(collection(db, "plans"), { name: n, routines: checks, createdBy: currentUser.uid });
    window.loadAdminPlans();
};

window.openAssignPlanModal = (id) => { assignMode = 'plan'; selectedPlanForMassAssign = id; window.openModal('modal-assign-plan'); loadMassUsers(); };
window.initMassAssignRoutine = (id) => { assignMode = 'routine'; selectedRoutineForMassAssign = id; window.openModal('modal-assign-plan'); loadMassUsers(); };

async function loadMassUsers() {
    const list = document.getElementById('assign-users-list'); list.innerHTML = '';
    const s = await getDocs(collection(db, "users"));
    s.forEach(d => { if(d.data().role === 'athlete') list.innerHTML += `<div class="selector-item"><input type="checkbox" class="user-mass-check" value="${d.id}" id="u-${d.id}"><label for="u-${d.id}">${d.data().name}</label></div>`; });
}

window.distributePlan = async () => {
    const ids = Array.from(document.querySelectorAll('.user-mass-check:checked')).map(c => c.value);
    if(ids.length === 0) return;
    if(assignMode === 'plan') {
        const p = await getDoc(doc(db, "plans", selectedPlanForMassAssign));
        const promises = p.data().routines.map(rid => updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(...ids) }));
        await Promise.all(promises);
    } else { await updateDoc(doc(db, "routines", selectedRoutineForMassAssign), { assignedTo: arrayUnion(...ids) }); }
    window.closeModal('modal-assign-plan'); alert("Enviado");
};

// --- FINISH WORKOUT ---
window.finishWorkout = async (rpeVal) => {
    try {
        window.closeModal('modal-rpe');
        let totalS = 0, totalR = 0, totalK = 0;
        const clean = activeWorkout.exs.map(e => {
            const done = e.sets.filter(s => s.d).map(s => {
                const r = parseInt(s.r)||0, w = parseFloat(s.w)||0;
                totalS++; totalR += r; totalK += (r*w);
                return { r, w, isDrop: !!s.isDrop };
            });
            return { n: e.n, s: done, note: e.note || "" };
        }).filter(e => e.s.length > 0);
        if (clean.length === 0) return alert("No hay series.");
        await addDoc(collection(db, "workouts"), { uid: currentUser.uid, date: serverTimestamp(), routine: activeWorkout.name, rpe: rpeVal, details: clean });
        await updateDoc(doc(db, "users", currentUser.uid), { "stats.workouts": increment(1), "stats.totalKg": increment(totalK), "lastWorkoutDate": serverTimestamp() });
        localStorage.removeItem('fit_active_workout'); switchTab('routines-view');
    } catch(e) { alert("Error al guardar"); }
};

// --- AUXILIARY BUTTON HANDLERS ---
window.logout = () => signOut(auth).then(()=>location.reload());
window.saveConfig = async () => {
    const rt = document.getElementById('cfg-rest-time').value; const tg = document.getElementById('cfg-telegram')?.value || "";
    await updateDoc(doc(db,"users",currentUser.uid), { restTime: parseInt(rt), telegram: tg });
    alert("Guardado");
};

window.viewWorkoutDetails = (t, d, n) => {
    const det = JSON.parse(decodeURIComponent(d)); let h = `<p><i>${decodeURIComponent(n||"")}</i></p><hr>`;
    det.forEach(ex => { h += `<b>${ex.n}</b><br>`; ex.s.forEach((s, idx) => h += `<small>S${idx+1}: ${s.r}x${s.w}kg</small><br>`); });
    document.getElementById('detail-title').innerText = t; document.getElementById('detail-content').innerHTML = h; window.openModal('modal-details');
};

window.unassignRoutine = async (rid) => { if(confirm("Quitar?")) { await updateDoc(doc(db,"routines",rid), {assignedTo: arrayRemove(selectedUserCoach)}); openCoachView(selectedUserCoach); } };

function openRest() {
    window.openModal('modal-timer'); let time = userData.restTime || 60; totalRestTime = time;
    if(timerInt) clearInterval(timerInt);
    timerInt = setInterval(() => {
        time--; document.getElementById('timer-display').innerText = time;
        if(time <= 5 && time > 0) playTickSound(false);
        if(time <= 0) { clearInterval(timerInt); window.closeModal('modal-timer'); playTickSound(true); }
    }, 1000);
}

function injectTelegramUI() {
    const t = document.getElementById('cfg-rest-time');
    if (t && !document.getElementById('tg-wrapper')) {
        const d = document.createElement('div'); d.id = "tg-wrapper"; d.style.marginTop = "20px"; d.style.textAlign = "center";
        d.innerHTML = `<label style="color:#888;">Telegram</label><input type="text" id="cfg-telegram" value="${userData.telegram||''}" style="text-align:center;"><button class="btn" onclick="window.contactCoach()">Contactar Coach</button>`;
        t.parentElement?.insertAdjacentElement('afterend', d);
    }
}

document.getElementById('btn-login').onclick = () => signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value);
document.getElementById('btn-register').onclick = async () => {
    try {
        const c = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-pass').value);
        await setDoc(doc(db, "users", c.user.uid), {
            name: document.getElementById('reg-name').value, email: document.getElementById('reg-email').value, role: 'athlete', approved: false, secretCode: document.getElementById('reg-code').value,
            stats: {workouts:0, totalKg:0, totalSets:0, totalReps:0}, readNotices: [], joined: serverTimestamp()
        });
    } catch(e) { alert(e.message); }
};
