import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Iniciada (Versión Corrección 0 Errores)...");

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

// Filtros Ranking
let rankFilterTime = 'all';    
let rankFilterGender = 'all';  
let rankFilterCat = 'kg';      

// Gráficos
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

// Variables de Asignación Masiva
let selectedPlanForMassAssign = null; 
let selectedRoutineForMassAssign = null;
let assignMode = 'plan'; 

// ======================================================
// 1. UTILIDADES Y AUDIO ENGINE
// ======================================================

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

const normalizeText = (text) => {
    if(!text) return "";
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};
window.toggleElement = (id) => {
    const el = document.getElementById(id);
    if(el) el.classList.toggle('hidden');
};

// --- AUDIO ENGINE MEJORADO ---
const SILENT_MP3_URL = "https://raw.githubusercontent.com/anars/blank-audio/master/1-minute-of-silence.mp3";
let htmlAudioElement = new Audio(SILENT_MP3_URL);
htmlAudioElement.loop = true;
htmlAudioElement.preload = 'auto';
htmlAudioElement.volume = 1.0; 

let lastBeepSecond = -1; 

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
            
            navigator.mediaSession.setActionHandler('play', () => { 
                htmlAudioElement.play(); navigator.mediaSession.playbackState = "playing"; 
            });
            navigator.mediaSession.setActionHandler('pause', () => { 
                navigator.mediaSession.playbackState = "paused"; 
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => window.addRestTime(-10));
            navigator.mediaSession.setActionHandler('nexttrack', () => window.addRestTime(10));
        }
    }).catch(e => console.log("Esperando interacción de usuario..."));
}

function updateMediaSessionMetadata(duration, position) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: `Descanso: ${Math.ceil(duration - position)}s`,
            artist: 'Fit Data Pro',
            album: 'Recuperando...',
            artwork: [{ src: 'logo.png', sizes: '512x512', type: 'image/png' }]
        });
        navigator.mediaSession.setPositionState({
            duration: duration,
            playbackRate: 1,
            position: position
        });
    }
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
document.body.addEventListener('click', initAudioEngine, {once:true});
window.testSound = () => { playTickSound(false); setTimeout(() => playTickSound(true), 500); };

window.enableNotifications = () => {
    if (!("Notification" in window)) return alert("Tu dispositivo no soporta notificaciones.");
    Notification.requestPermission().then((p) => {
        if (p === "granted") {
            if("vibrate" in navigator) navigator.vibrate([200]);
            new Notification("Fit Data", { body: "✅ Notificaciones listas.", icon: "logo.png" });
            alert("✅ Vinculado.");
        } else alert("❌ Permiso denegado.");
    });
};

// ======================================================
// 2. GESTIÓN DE SESIÓN
// ======================================================

onAuthStateChanged(auth, async (user) => {
    if(user) {
        currentUser = user;
        const snap = await getDoc(doc(db,"users",user.uid));
        if(snap.exists()){
            userData = snap.data();
            checkPhotoVisualReminder();
            initCommunityListener();
            checkPhotoReminder();
            
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
    }
});

function checkPhotoReminder() {
    if(!userData.photoDay) return;
    const now = new Date();
    const day = now.getDay();
    const time = now.toTimeString().substr(0,5);
    if(day == userData.photoDay && time === userData.photoTime) alert("📸 HORA DE TU FOTO DE PROGRESO 📸");
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
        const header = document.getElementById('main-header');
        if(header && header.parentNode) header.parentNode.insertBefore(div, header.nextSibling);
    }
}

window.switchTab = (t) => {
    document.querySelectorAll('.view-container').forEach(e => e.classList.remove('active'));
    document.getElementById(t).classList.add('active');
    document.getElementById('main-container').scrollTop = 0;
    document.querySelectorAll('.top-nav-item').forEach(n => n.classList.remove('active'));
    if (t === 'routines-view') document.getElementById('top-btn-routines').classList.add('active');
    if (t === 'profile-view') {
        document.getElementById('top-btn-profile').classList.add('active');
        loadProfile();
    }
    if (t === 'admin-view' || t === 'coach-detail-view') {
        document.getElementById('top-btn-coach').classList.add('active');
    }
};

window.toggleAuth = (m) => { document.getElementById('login-form').classList.toggle('hidden',m!=='login'); document.getElementById('register-form').classList.toggle('hidden',m!=='register'); };
window.logout = () => signOut(auth).then(()=>location.reload());
window.recoverPass = async () => { const email = prompt("Introduce tu email:"); if(email) try { await sendPasswordResetEmail(auth, email); alert("📧 Correo enviado."); } catch(e) { alert("Error: " + e.message); } };
window.dismissNotif = () => { document.getElementById('notif-badge').style.display = 'none'; switchTab('routines-view'); sessionStorage.setItem('notif_dismissed', 'true'); };

// ======================================================
// 3. EDITOR DE RUTINAS (CLONADO + SMART CARDS)
// ======================================================

window.openEditor = async (id = null, isClone = false) => {
    editingRoutineId = isClone ? null : id; 
    document.getElementById('editor-name').value = '';
    document.getElementById('editor-title').innerText = id ? (isClone ? "CLONAR RUTINA" : "EDITAR RUTINA") : "NUEVA RUTINA";
    
    if (id) {
        const docSnap = await getDoc(doc(db, "routines", id));
        const r = docSnap.data();
        document.getElementById('editor-name').value = isClone ? r.name + " (Copia)" : r.name;
        currentRoutineSelections = r.exercises.map(ex => ({
            n: ex.n || ex, s: ex.s || false, series: ex.series || 5, reps: ex.reps || "20-16-16-16-16"
        }));
    } else {
        currentRoutineSelections = [];
    }
    window.currentRoutineSelections = currentRoutineSelections;
    renderExercises(EXERCISES); 
    renderSelectedSummary();
    switchTab('editor-view');
};

window.filterExercises = (t) => { 
    const cleanSearch = normalizeText(t);
    const filtered = EXERCISES.filter(e => {
        const nameMatch = normalizeText(e.n).includes(cleanSearch);
        const muscleMatch = e.m ? normalizeText(e.m).includes(cleanSearch) : false;
        return nameMatch || muscleMatch;
    });
    renderExercises(filtered); 
};

// --- RENDERIZADO CON "SMART CARDS" ---
function renderExercises(l) {
    const c = document.getElementById('exercise-selector-list'); 
    c.innerHTML = '';
    l.forEach(e => {
        const selIdx = currentRoutineSelections.findIndex(x => x.n === e.n);
        const isSelected = selIdx > -1;
        const d = document.createElement('div'); 
        d.className = `ex-select-item`;
        
        // Estilo ROJO si está seleccionado
        if(isSelected) {
            d.style.border = "2px solid #ff3333";
            d.style.background = "linear-gradient(45deg, #441111, #220000)";
        }

        let configHtml = "";
        if(isSelected) {
            const obj = currentRoutineSelections[selIdx];
            const chainStyle = obj.s ? "color: #ff3333; font-weight:bold; text-shadow:0 0 5px red;" : "color:#666;";
            configHtml = `
                <div class="smart-config" style="margin-top:10px; padding-top:10px; border-top:1px solid #552222; display:flex; gap:10px; align-items:center;">
                    <div style="display:flex; flex-direction:column; width:60px;">
                        <label style="font-size:0.6rem; color:#aaa;">Series</label>
                        <input type="number" value="${obj.series}" oninput="window.updateSmartEx(${selIdx}, 'series', this.value)" onclick="event.stopPropagation()" style="width:100%; padding:5px; background:#000; border:1px solid #ff3333; color:white; border-radius:4px; text-align:center;">
                    </div>
                    <div style="display:flex; flex-direction:column; flex:1;">
                        <label style="font-size:0.6rem; color:#aaa;">Reps (ej: 12-10-8)</label>
                        <input type="text" value="${obj.reps}" oninput="window.updateSmartEx(${selIdx}, 'reps', this.value)" onclick="event.stopPropagation()" style="width:100%; padding:5px; background:#000; border:1px solid #ff3333; color:white; border-radius:4px; text-align:center;">
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:center;" onclick="event.stopPropagation(); window.toggleSmartSuperset(${selIdx})">
                         <label style="font-size:0.6rem; color:#aaa;">Link</label>
                         <span style="font-size:1.5rem; cursor:pointer; ${chainStyle}">🔗</span>
                    </div>
                </div>`;
        }

        d.innerHTML = `
            <div style="display:flex; align-items:center; width:100%;">
                <img src="${e.img}" onerror="this.src='logo.png'" style="width:40px; height:40px; object-fit:cover; border-radius:4px; margin-right:10px;">
                <span style="flex:1; font-weight:bold; color:${isSelected ? '#ffcccc' : 'white'};">${e.n}</span>
                ${isSelected ? `<b style="color:#ff3333; font-size:1.2rem; cursor:pointer; padding:5px;" onclick="event.stopPropagation(); window.removeSelection('${e.n}')">✕</b>` : ''}
            </div>
            ${configHtml}`;
            
        d.onclick = () => { 
            if(!isSelected) {
                currentRoutineSelections.push({ n: e.n, s: false, series: 5, reps: "20-16-16-16-16" });
                renderExercises(l); renderSelectedSummary(); 
            }
        };
        c.appendChild(d);
    });
}

window.updateSmartEx = (idx, key, val) => {
    currentRoutineSelections[idx][key] = key === 'series' ? (parseInt(val) || 0) : val;
    renderSelectedSummary(); 
};

window.toggleSmartSuperset = (idx) => {
    if (idx < currentRoutineSelections.length - 1) {
        currentRoutineSelections[idx].s = !currentRoutineSelections[idx].s;
        renderExercises(EXERCISES); 
        renderSelectedSummary();
    } else {
        alert("No puedes encadenar el último ejercicio.");
    }
};

// --- LEYENDA SUPERIOR COMPACTA ---
window.renderSelectedSummary = () => {
    const div = document.getElementById('selected-summary'); 
    div.innerHTML = ''; 
    if(currentRoutineSelections.length === 0) {
        div.innerHTML = '<div style="color:#666; font-size:0.8rem; padding:10px; text-align:center;">Selecciona ejercicios de la lista inferior</div>';
        return;
    }
    
    const legend = document.createElement('div');
    legend.className = 'compact-legend';
    legend.style.cssText = "display:flex; flex-wrap:wrap; gap:5px; padding:8px; background:#111; border-radius:8px; align-items:center; border:1px solid #333;";
    
    let html = "";
    currentRoutineSelections.forEach((obj, i) => {
        const connector = obj.s ? ' <span style="color:#ff3333; font-weight:bold;">🔗</span> ' : ' <span style="color:#666;">➜</span> ';
        const isLast = i === currentRoutineSelections.length - 1;
        html += `<span style="font-size:0.85rem; color:#fff; white-space:nowrap;"><b>${i+1}.</b> ${obj.n} <small style="color:#888;">(${obj.series}x)</small>${!isLast ? connector : ''}</span>`;
    });
    
    legend.innerHTML = html;
    div.appendChild(legend);
};

window.removeSelection = (name) => { 
    currentRoutineSelections = currentRoutineSelections.filter(x => x.n !== name); 
    renderExercises(EXERCISES); renderSelectedSummary(); 
}

window.saveRoutine = async () => {
    const n = document.getElementById('editor-name').value;
    const s = window.currentRoutineSelections; 
    if(!n || s.length === 0) return alert("❌ Faltan datos");
    const btn = document.getElementById('btn-save-routine'); btn.innerText = "💾 GUARDANDO...";
    try {
        const data = { uid: currentUser.uid, name: n, exercises: s, createdAt: serverTimestamp(), assignedTo: [] };
        if(editingRoutineId) { await updateDoc(doc(db, "routines", editingRoutineId), { name: n, exercises: s }); } 
        else { await addDoc(collection(db, "routines"), data); }
        alert("✅ Guardado"); switchTab('routines-view');
    } catch(e) { alert("Error: " + e.message); } finally { btn.innerText = "GUARDAR"; }
};

// ======================================================
// 4. FUNCIONALIDADES RESTANTES (SIN DUPLICAR)
// ======================================================

window.delRoutine = async (id) => { if(confirm("¿Borrar?")) await deleteDoc(doc(db,"routines",id)); window.loadAdminLibrary(); };

function getExerciseData(name) {
    if(!name) return { img: 'logo.png', mInfo: {main:'General', sec:[]}, type:'c', v:null };
    let match = EXERCISES.find(e => e.n === name);
    if (!match) { const cleanName = normalizeText(name); match = EXERCISES.find(e => normalizeText(e.n) === cleanName); }
    if (!match) { const cleanName = normalizeText(name); match = EXERCISES.find(e => { const cleanDbName = normalizeText(e.n); return cleanDbName.includes(cleanName) || cleanName.includes(cleanDbName); }); }
    if (!match) {
        const n = normalizeText(name); let m = "General", img = "logo.png";
        if(n.includes("press")||n.includes("pecho")||n.includes("aperturas")) { m="Pecho"; img="pecho.png"; }
        else if(n.includes("remo")||n.includes("jalon")||n.includes("espalda")||n.includes("dominadas")) { m="Espalda"; img="espalda.png"; }
        else if(n.includes("sentadilla")||n.includes("prensa")||n.includes("extension")||n.includes("zancada")) { m="Cuádriceps"; img="cuadriceps.png"; }
        else if(n.includes("curl")||n.includes("biceps")) { m="Bíceps"; img="biceps.png"; }
        else if(n.includes("triceps")||n.includes("frances")||n.includes("fondos")) { m="Tríceps"; img="triceps.png"; }
        else if(n.includes("hombro")||n.includes("militar")||n.includes("elevacion")||n.includes("pajaros")) { m="Hombros"; img="hombros.png"; }
        return { img: img, mInfo: getMuscleInfoByGroup(m), type:'c', v:null };
    }
    return { img: match.img, mInfo: getMuscleInfoByGroup(match.m), type: match.t || 'c', v: match.v };
}

function getMuscleInfoByGroup(m) {
    let s = [];
    if(m==="Pecho") s=["Tríceps","Hombros"]; else if(m==="Espalda") s=["Bíceps", "Antebrazo"]; else if(m==="Cuádriceps") s=["Glúteos", "Gemelos"]; else if(m==="Isquios") s=["Glúteos", "Espalda Baja"]; else if(m==="Hombros") s=["Tríceps", "Trapecio"]; else if(m==="Bíceps") s=["Antebrazo"]; else if(m==="Tríceps") s=["Hombros", "Pecho"]; else if(m==="Glúteos") s=["Isquios", "Cuádriceps"];
    return {main:m, sec:s};
}

async function loadRoutines() {
    const l = document.getElementById('routines-list'); l.innerHTML = 'Cargando...';
    onSnapshot(query(collection(db,"routines")), (s)=>{
        l.innerHTML = '';
        s.forEach(d=>{
            const r = d.data();
            const isMine = r.uid === currentUser.uid;
            const isAssignedToMe = r.assignedTo && r.assignedTo.includes(currentUser.uid);
            if(isMine || isAssignedToMe){
                const div = document.createElement('div'); div.className = 'card';
                div.innerHTML = `<div style="display:flex; justify-content:space-between;"><h3 style="color:${isMine?'white':'var(--accent-color)'}">${r.name}</h3><div>${isMine ? `<button style="background:none;border:none;margin-right:10px;" onclick="openEditor('${d.id}')">✏️</button><button style="background:none;border:none;" onclick="delRoutine('${d.id}')">🗑️</button>` : '🔒'}</div></div><p style="color:#666; font-size:0.8rem; margin:10px 0;">${r.exercises.length} Ejercicios</p><button class="btn" onclick="startWorkout('${d.id}')">ENTRENAR</button>`;
                l.appendChild(div);
            }
        });
        if(l.innerHTML === '') l.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No tienes rutinas asignadas.</div>';
    });
}

window.switchPose = (pose) => { currentPose = pose; document.getElementById('tab-front').classList.toggle('active', pose==='front'); document.getElementById('tab-back').classList.toggle('active', pose==='back'); updatePhotoDisplay(userData); };

function updatePhotoDisplay(u) {
    const prefix = currentPose === 'front' ? '' : '_back';
    const b = u[`photoBefore${prefix}`] || '', a = u[`photoAfter${prefix}`] || '';
    const dateB = u[`dateBefore${prefix}`] || '-', dateA = u[`dateAfter${prefix}`] || '-';
    document.getElementById('img-before').src = b; document.getElementById('img-overlay').src = a;
    document.getElementById('date-before').innerText = `ANTES (${dateB})`; document.getElementById('date-after').innerText = `AHORA (${dateA})`;
    document.getElementById('slider-handle').style.left = '0%'; document.getElementById('img-overlay').style.clipPath = 'inset(0 0 0 0)';
}
window.uploadAvatar = (inp) => { if(inp.files[0]) { const file = inp.files[0]; const path = `users/${currentUser.uid}/avatar.jpg`; const storageRef = ref(storage, path); uploadBytes(storageRef, file).then(async (snapshot) => { const url = await getDownloadURL(snapshot.ref); await updateDoc(doc(db,"users",currentUser.uid), {photo: url}); userData.photo = url; window.loadProfile(); }).catch(e => alert("Error subiendo foto: " + e.message)); } };
window.loadCompImg = (inp, field) => { if(inp.files[0]) { const file = inp.files[0]; const r = new FileReader(); r.onload = (e) => { const img = new Image(); img.src = e.target.result; img.onload = async () => { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const scale = 800 / img.width; canvas.width = 800; canvas.height = img.height * scale; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); canvas.toBlob(async (blob) => { const prefix = currentPose === 'front' ? 'front' : 'back'; const timestamp = Date.now(); const path = `users/${currentUser.uid}/progress/${timestamp}_${prefix}.jpg`; const storageRef = ref(storage, path); try { await uploadBytes(storageRef, blob); const url = await getDownloadURL(storageRef); const fieldPrefix = currentPose === 'front' ? '' : '_back'; const fieldName = field === 'before' ? `photoBefore${fieldPrefix}` : `photoAfter${fieldPrefix}`; const dateField = field === 'before' ? `dateBefore${fieldPrefix}` : `dateAfter${fieldPrefix}`; const today = new Date().toLocaleDateString(); const record = { date: today, url: url }; let update = {}; update[fieldName] = url; update[dateField] = today; const histField = fieldPrefix === '' ? 'photoHistoryFront' : 'photoHistoryBack'; update[histField] = arrayUnion(record); await updateDoc(doc(db, "users", currentUser.uid), update); userData[fieldName] = url; userData[dateField] = today; if(!userData[histField]) userData[histField] = []; userData[histField].push(record); updatePhotoDisplay(userData); } catch(err) { alert("Error: " + err.message); } }, 'image/jpeg', 0.8); }; }; r.readAsDataURL(file); } };
window.deletePhoto = async (type) => { if(!confirm("¿Borrar?")) return; const prefix = currentPose === 'front' ? '' : '_back'; const f = type === 'before' ? `photoBefore${prefix}` : `photoAfter${prefix}`; let u={}; u[f]=""; await updateDoc(doc(db,"users",currentUser.uid),u); userData[f]=""; updatePhotoDisplay(userData); };
window.moveSlider = (v) => { document.getElementById('img-overlay').style.clipPath = `inset(0 0 0 ${v}%)`; document.getElementById('slider-handle').style.left = `${v}%`; };

function saveLocalWorkout() { localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); }
window.cancelWorkout = () => { if(confirm("⚠ ¿SEGURO QUE QUIERES CANCELAR?")) { activeWorkout = null; localStorage.removeItem('fit_active_workout'); if(durationInt) clearInterval(durationInt); switchTab('routines-view'); } };
window.startWorkout = async (rid) => { if(document.getElementById('cfg-wake').checked && 'wakeLock' in navigator) try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){} try { const snap = await getDoc(doc(db,"routines",rid)); const r = snap.data(); let lastWorkoutData = null; const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid)); const wSnap = await getDocs(q); const sameRoutine = wSnap.docs.map(d=>d.data()).filter(d => d.routine === r.name).sort((a,b) => b.date - a.date); if(sameRoutine.length > 0) lastWorkoutData = sameRoutine[0].details; const now = Date.now(); if(htmlAudioElement) { htmlAudioElement.play().then(() => { htmlAudioElement.pause(); }).catch(e => {}); } activeWorkout = { name: r.name, startTime: now, exs: r.exercises.map(exObj => { const isString = typeof exObj === 'string'; const name = isString ? exObj : exObj.n; const isSuperset = isString ? false : (exObj.s || false); const customSeriesNum = isString ? 5 : (parseInt(exObj.series) || 5); const customRepsPattern = isString ? "20-16-16-16-16" : (exObj.reps || "20-16-16-16-16"); const repsArray = customRepsPattern.split('-'); const data = getExerciseData(name); let sets = Array(customSeriesNum).fill().map((_, i) => ({ r: repsArray[i] ? parseInt(repsArray[i]) : parseInt(repsArray[repsArray.length - 1]), w: 0, d: false, prev: '-', numDisplay: (i + 1).toString() })); if(lastWorkoutData) { const prevEx = lastWorkoutData.find(ld => ld.n === name); if(prevEx && prevEx.s) { sets = sets.map((s, i) => { if(prevEx.s[i]) { const dLabel = prevEx.s[i].isDrop ? ' (D)' : ''; s.prev = `${prevEx.s[i].r}x${prevEx.s[i].w}kg${dLabel}`; } return s; }); } } return { n:name, img:data.img, mInfo: data.mInfo, type: data.type, video: data.v, sets: sets, superset: isSuperset, note: "" }; }) }; saveLocalWorkout(); renderWorkout(); switchTab('workout-view'); startTimerMini(); } catch(e) { console.error(e); alert("Error"); } };
window.addSet = (exIdx) => { const sets = activeWorkout.exs[exIdx].sets; sets.push({r:16, w:0, d:false, prev:'-', numDisplay: (sets.length + 1).toString()}); saveLocalWorkout(); renderWorkout(); };
window.removeSet = (exIdx) => { if(activeWorkout.exs[exIdx].sets.length > 1) { activeWorkout.exs[exIdx].sets.pop(); saveLocalWorkout(); renderWorkout(); } };
window.toggleAllSets = (exIdx) => { const ex = activeWorkout.exs[exIdx]; const allDone = ex.sets.every(s => s.d); const newState = !allDone; ex.sets.forEach(s => { s.d = newState; }); saveLocalWorkout(); renderWorkout(); if(newState) showToast("✅ Hecho"); };
window.openNoteModal = (idx) => { noteTargetIndex = idx; const existingNote = activeWorkout.exs[idx].note || ""; document.getElementById('exercise-note-input').value = existingNote; window.openModal('modal-note'); };
window.saveNote = () => { if (noteTargetIndex === null) return; const txt = document.getElementById('exercise-note-input').value.trim(); activeWorkout.exs[noteTargetIndex].note = txt; saveLocalWorkout(); renderWorkout(); window.closeModal('modal-note'); };
window.uS = (i,j,k,v) => { activeWorkout.exs[i].sets[j][k]=v; saveLocalWorkout(); };
window.tS = async (i, j) => { const s = activeWorkout.exs[i].sets[j]; const exName = activeWorkout.exs[i].n; s.d = !s.d; if(s.d) { const w = parseFloat(s.w) || 0; const r = parseInt(s.r) || 0; if (w > 0 && r > 0) { const rm = Math.round(w / (1.0278 - (0.0278 * r))); if (!userData.rmRecords) userData.rmRecords = {}; if (rm > (userData.rmRecords[exName] || 0)) { userData.rmRecords[exName] = rm; updateDoc(doc(db, "users", currentUser.uid), { [`rmRecords.${exName}`]: rm }); if(typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } }); showToast(`🔥 NUEVO RÉCORD: ${rm}kg`); } } openRest(); } saveLocalWorkout(); renderWorkout(); };
function updateTimerVisuals(timeLeft) { const display = document.getElementById('timer-display'); const ring = document.getElementById('timer-progress-ring'); if(display) { display.innerText = timeLeft; display.style.color = timeLeft <= 5 ? "#fff" : "var(--accent-color)"; display.style.textShadow = timeLeft <= 5 ? "0 0 20px #fff" : "none"; } if(ring) { const circumference = 565; const offset = circumference - (timeLeft / totalRestTime) * circumference; ring.style.strokeDashoffset = offset; ring.style.stroke = "var(--accent-color)"; if (timeLeft <= 0) ring.style.stroke = "#ffffff"; } }
function openRest() { window.openModal('modal-timer'); if(htmlAudioElement) { htmlAudioElement.play().then(() => { if('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing"; }).catch(e => console.log("Audio play blocked", e)); } else { initAudioEngine(); } let duration = parseInt(userData.restTime) || 60; totalRestTime = duration; restEndTime = Date.now() + (duration * 1000); lastBeepSecond = -1; updateTimerVisuals(duration); if(timerInt) clearInterval(timerInt); timerInt = setInterval(() => { const now = Date.now(); const leftMs = restEndTime - now; const leftSec = Math.ceil(leftMs / 1000); if (leftSec >= 0) { updateTimerVisuals(leftSec); if (leftSec !== lastBeepSecond) { updateMediaSessionMetadata(totalRestTime, totalRestTime - leftSec); } } if (leftSec <= 5 && leftSec > 0) { if (leftSec !== lastBeepSecond) { playTickSound(false); lastBeepSecond = leftSec; } } if (leftSec <= 0) { window.closeTimer(); playTickSound(true); if ("Notification" in window && Notification.permission === "granted") { try { new Notification("¡A LA SERIE!", { body: "Descanso finalizado.", icon: "logo.png" }); } catch(e) {} } } }, 250); }
window.closeTimer = () => { clearInterval(timerInt); window.closeModal('modal-timer'); if ('mediaSession' in navigator) { navigator.mediaSession.metadata = new MediaMetadata({ title: '¡A entrenar!', artist: 'Fit Data Pro', artwork: [{ src: 'logo.png', sizes: '512x512', type: 'image/png' }] }); navigator.mediaSession.playbackState = "paused"; } };
window.addRestTime = (s) => { restEndTime += (s * 1000); if(s > 0) totalRestTime += s; const now = Date.now(); const left = Math.ceil((restEndTime - now) / 1000); updateTimerVisuals(left); updateMediaSessionMetadata(totalRestTime, totalRestTime - left); };

// --- ADMIN & COACH TOOLS ---

window.loadAdminUsers = async () => {
    const l = document.getElementById('admin-list'); l.innerHTML = '↻ Cargando...';
    try {
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const s = await getDocs(q); l.innerHTML = '';
        const usersList = s.docs.map(d => ({id: d.id, ...d.data()}));
        usersList.sort((a, b) => (b.lastWorkoutDate?.seconds || 0) - (a.lastWorkoutDate?.seconds || 0));
        usersList.forEach(u => {
            const avatarHtml = u.photo ? `<img src="${u.photo}" class="mini-avatar">` : `<div class="mini-avatar-placeholder">${u.name.charAt(0).toUpperCase()}</div>`;
            let activeStatus = "";
            if (u.lastWorkoutDate) {
                const last = u.lastWorkoutDate.toDate(); const today = new Date();
                if (last.toDateString() === today.toDateString()) activeStatus = `<span style="color:#00ff88; font-size:0.7rem; margin-left:5px;">🟢 Hoy</span>`;
            }
            const div = document.createElement('div'); div.className = "admin-user-row";
            div.innerHTML=`${avatarHtml}<div style="flex:1;"><div><b>${u.name}</b> ${activeStatus}</div><div style="font-size:0.7rem; color:#888;">${u.email}</div></div><button class="btn-outline btn-small">⚙️</button>`;
            div.onclick = () => openCoachView(u.id, u); l.appendChild(div);
        });
    } catch (e) { l.innerHTML = 'Error.'; }
};

window.loadAdminLibrary = async () => {
    const l = document.getElementById('admin-lib-list'); 
    l.innerHTML = '↻ Cargando...';
    try {
        const s = await getDocs(collection(db, "routines")); 
        l.innerHTML = '';
        const createBtn = document.createElement('button');
        createBtn.className = 'btn'; createBtn.style.cssText = "width:100%; margin-bottom:15px; background:var(--accent-color); color:black; font-weight:bold;";
        createBtn.innerText = "+ CREAR NUEVA RUTINA";
        createBtn.onclick = () => { window.openEditor(); };
        l.appendChild(createBtn);

        s.forEach(d => {
            const r = d.data(); const div = document.createElement('div'); div.className = "assigned-routine-item";
            div.innerHTML = `
                <div style="flex:1;"><b>${r.name}</b></div>
                <div style="display:flex; gap:5px;">
                    <button class="btn-small btn-outline" onclick="window.openEditor('${d.id}')" title="Editar">✏️</button>
                    <button class="btn-small btn-outline" style="border-color:#ffaa00;" onclick="window.openEditor('${d.id}', true)" title="Clonar">🖨</button>
                    <button class="btn-small btn" onclick="window.initMassAssignRoutine('${d.id}')" title="Enviar">📤</button>
                    <button class="btn-small btn-danger" onclick="delRoutine('${d.id}')">🗑️</button>
                </div>`;
            l.appendChild(div);
        });
    } catch (e) { l.innerHTML = 'Error.'; }
};

window.initMassAssignRoutine = async (rid) => {
    assignMode = 'routine'; selectedRoutineForMassAssign = rid;
    const list = document.getElementById('assign-users-list');
    window.openModal('modal-assign-plan');
    try {
        const snap = await getDoc(doc(db, "routines", rid)); 
        if (snap.exists()) document.getElementById('assign-plan-title').innerText = `Enviar "${snap.data().name}" a:`;
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const uSnap = await getDocs(q); list.innerHTML = '';
        uSnap.forEach(d => {
            const u = d.data(); if (u.role === 'athlete') {
                const div = document.createElement('div'); div.className = "selector-item";
                div.innerHTML = `<input type="checkbox" class="user-mass-check selector-checkbox" value="${d.id}" id="u-${d.id}"><label for="u-${d.id}" class="selector-label">${u.name}</label>`;
                list.appendChild(div);
            }
        });
    } catch(e) { console.error(e); }
};

window.distributePlan = async () => {
    const checks = document.querySelectorAll('.user-mass-check:checked');
    if(checks.length === 0) return alert("Selecciona atletas.");
    const userIds = Array.from(checks).map(c => c.value); 
    try {
        if (assignMode === 'plan' && selectedPlanForMassAssign) {
            const pSnap = await getDoc(doc(db, "plans", selectedPlanForMassAssign));
            const promises = pSnap.data().routines.map(rid => updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(...userIds) }));
            await Promise.all(promises); alert(`✅ Plan asignado.`);
        } else if (assignMode === 'routine' && selectedRoutineForMassAssign) {
            await updateDoc(doc(db, "routines", selectedRoutineForMassAssign), { assignedTo: arrayUnion(...userIds) });
            alert(`✅ Rutina enviada.`);
        }
        window.closeModal('modal-assign-plan');
    } catch(e) { alert("Error"); }
};

// ... RESTO DE FUNCIONES (loadAdminPlans, openCoachView, etc. sin cambios significativos) ...
window.loadAdminPlans = async () => { const list = document.getElementById('admin-plans-list'); const selector = document.getElementById('plan-routine-selector'); const routinesSnap = await getDocs(collection(db, "routines")); selector.innerHTML = ''; routinesSnap.forEach(d => { const div = document.createElement('div'); div.className = "selector-item"; div.innerHTML = `<input type="checkbox" class="plan-check selector-checkbox" value="${d.id}" id="chk-${d.id}"><label for="chk-${d.id}" class="selector-label">${d.data().name}</label>`; selector.appendChild(div); }); const plansSnap = await getDocs(collection(db, "plans")); list.innerHTML = ''; if(plansSnap.empty) { list.innerHTML = "<div>Sin planes.</div>"; return; } const uSnap = await getDocs(collection(db, "users")); const userMap = {}; uSnap.forEach(u => userMap[u.id] = u.data().name); plansSnap.forEach(d => { const p = d.data(); const div = document.createElement('div'); div.className = "assigned-routine-item"; div.innerHTML = `<div style="flex:1;"><b>${p.name}</b></div><div style="display:flex; gap:5px;"><button class="btn-small btn" onclick="window.openAssignPlanModal('${d.id}')">📤</button><button class="btn-small btn-danger" onclick="window.deletePlan('${d.id}')">🗑️</button></div>`; list.appendChild(div); }); };
async function openCoachView(uid, u) { selectedUserCoach=uid; const freshSnap = await getDoc(doc(db, "users", uid)); const freshU = freshSnap.data(); selectedUserObj = freshU; switchTab('coach-detail-view'); document.getElementById('coach-user-name').innerText=freshU.name; document.getElementById('coach-user-email').innerText=freshU.email; if(freshU.photo) { document.getElementById('coach-user-img').src = freshU.photo; document.getElementById('coach-user-img').style.display = 'block'; document.getElementById('coach-user-initial').style.display = 'none'; } else { document.getElementById('coach-user-img').style.display = 'none'; document.getElementById('coach-user-initial').style.display = 'block'; document.getElementById('coach-user-initial').innerText = freshU.name.charAt(0).toUpperCase(); } updateCoachPhotoDisplay('front'); document.getElementById('coach-toggle-bio').checked = !!freshU.showBio; document.getElementById('coach-toggle-skinfolds').checked = !!freshU.showSkinfolds; document.getElementById('coach-toggle-measures').checked = !!freshU.showMeasurements; document.getElementById('coach-toggle-videos').checked = !!freshU.showVideos; const rList = document.getElementById('coach-assigned-list'); rList.innerHTML = 'Cargando...'; const allRoutinesSnap = await getDocs(collection(db, "routines")); rList.innerHTML = ''; allRoutinesSnap.forEach(r => { if((r.data().assignedTo || []).includes(uid)) { const div = document.createElement('div'); div.className = "assigned-routine-item"; div.innerHTML = `<span>${r.data().name}</span><button style="color:#f55;border:none;background:none;" onclick="window.unassignRoutine('${r.id}')">❌</button>`; rList.appendChild(div); } }); renderMuscleRadar('coachMuscleChart', freshU.muscleStats || {}); };

// --- RENDERING CHARTS (NECESARIO PARA NO ROMPER EL CODIGO) ---
function renderMuscleRadar(canvasId, stats) { const ctx = document.getElementById(canvasId); if(!ctx) return; if(canvasId === 'userMuscleChart' && userRadarChart) userRadarChart.destroy(); if(canvasId === 'coachMuscleChart' && coachRadarChart) coachRadarChart.destroy(); const muscleGroups = ["Pecho", "Espalda", "Cuádriceps", "Isquios", "Hombros", "Bíceps", "Tríceps", "Glúteos"]; const dataValues = muscleGroups.map(m => stats[m] || 0); const newChart = new Chart(ctx, { type: 'radar', data: { labels: muscleGroups, datasets: [{ label: 'Volumen Relativo', data: dataValues, backgroundColor: 'rgba(255, 51, 51, 0.4)', borderColor: '#ff3333', pointBackgroundColor: '#ff3333', pointBorderColor: '#fff', pointHoverBackgroundColor: '#fff', pointHoverBorderColor: '#ff3333' }] }, options: { scales: { r: { angleLines: { color: '#333' }, grid: { color: '#333' }, pointLabels: { color: '#ccc', font: { size: 10 } }, ticks: { display: false, backdropColor: 'transparent' }, suggestedMin: 0 } }, plugins: { legend: { display: false } }, maintainAspectRatio: false } }); if(canvasId === 'userMuscleChart') userRadarChart = newChart; if(canvasId === 'coachMuscleChart') coachRadarChart = newChart; }

document.getElementById('btn-register').onclick=async()=>{ const secretCode = document.getElementById('reg-code').value; try{ const c=await createUserWithEmailAndPassword(auth,document.getElementById('reg-email').value,document.getElementById('reg-pass').value); await setDoc(doc(db,"users",c.user.uid),{ name:document.getElementById('reg-name').value, email:document.getElementById('reg-email').value, secretCode: secretCode, approved: false, role: 'athlete', gender:document.getElementById('reg-gender').value, age:parseInt(document.getElementById('reg-age').value), height:parseInt(document.getElementById('reg-height').value), weightHistory: [], measureHistory: [], skinfoldHistory: [], bioHistory: [], prs: {}, stats: {workouts:0, totalKg:0, totalSets:0, totalReps:0}, muscleStats: {}, joined: serverTimestamp(), showVideos: false, showBio: false }); }catch(e){alert("Error");} };
document.getElementById('btn-login').onclick=()=>signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value).catch(e=>alert(e.message));
