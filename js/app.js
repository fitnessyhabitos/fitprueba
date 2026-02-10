import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Iniciada (Versión Completa + Ranking Semanal + Live Feed + Coach Tools)...");

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

// --- LISTA DE DIETAS ---
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
let communityUnsubscribe = null; // Nuevo listener para notificaciones

// Filtros Ranking
let rankFilterTime = 'all';    // 'all', 'week', 'month', 'year'
let rankFilterGender = 'all';  
let rankFilterCat = 'kg';      

// Gráficos
let chartInstance = null; 
let progressChart = null; 
let fatChartInstance = null; 
let bioChartInstance = null; 
let measureChartInstance = null; 
let coachFatChart = null; 
let coachBioChart = null; 
let coachMeasureChart = null; 
let radarChartInstance = null; // RPE Modal
let coachChart = null;
let userRadarChart = null; // Profile View
let coachRadarChart = null; // Coach View

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
let assignMode = 'plan'; 
let selectedRoutineForMassAssign = null; 

// --- GESTIÓN DE SCROLL LOCK (SOPORTE IOS) ---
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

// ======================================================
// 1. NUEVAS UTILIDADES (Semana ISO & Notificaciones)
// ======================================================

// Calcular número de semana (ISO 8601) para el ranking semanal
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return d.getUTCFullYear() + "_W" + weekNo;
}

// Listener en tiempo real para "Live Feed"
function initCommunityListener() {
    if (communityUnsubscribe) communityUnsubscribe(); 
    
    // Escuchar solo el último workout añadido a la colección global
    const q = query(collection(db, "workouts"), orderBy("date", "desc"), limit(1));
    
    communityUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const w = change.doc.data();
                const now = Date.now() / 1000;
                const workoutTime = w.date ? w.date.seconds : 0;
                
                // Si ocurrió hace menos de 60s y NO es mi propio entreno
                if (now - workoutTime < 60 && w.uid !== currentUser.uid) {
                    showToast(`🔥 Alguien de la comunidad terminó: ${w.routine}`);
                    
                    // Sonido sutil de notificación si está activado
                    if(document.getElementById('cfg-sound')?.checked) {
                         const osc = audioCtx?.createOscillator();
                         if(osc) {
                             const g = audioCtx.createGain();
                             osc.connect(g); 
                             g.connect(audioCtx.destination);
                             osc.frequency.value = 500; 
                             osc.start(); 
                             g.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
                             osc.stop(audioCtx.currentTime + 0.5);
                         }
                    }
                }
            }
        });
    });
}

// --- AUDIO ENGINE (NATIVE SYNC) ---
const SILENT_MP3_URL = "https://raw.githubusercontent.com/anars/blank-audio/master/10-seconds-of-silence.mp3";
let htmlAudioElement = new Audio(SILENT_MP3_URL);
htmlAudioElement.loop = true;
htmlAudioElement.preload = 'auto';
htmlAudioElement.volume = 1.0; 

function initAudioEngine() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    htmlAudioElement.play().then(() => {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => { 
                htmlAudioElement.play(); navigator.mediaSession.playbackState = "playing"; 
            });
            navigator.mediaSession.setActionHandler('pause', () => { 
                navigator.mediaSession.playbackState = "playing"; 
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => window.addRestTime(-10));
            navigator.mediaSession.setActionHandler('nexttrack', () => window.addRestTime(10));
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'Fit Data Pro',
                artist: 'Listo para entrenar',
                artwork: [{ src: 'logo.png', sizes: '512x512', type: 'image/png' }]
            });
        }
    }).catch(e => { console.log("Esperando interacción de usuario..."); });
}

document.body.addEventListener('touchstart', initAudioEngine, {once:true});
document.body.addEventListener('click', initAudioEngine, {once:true});

function play5Beeps() {
    if(!audioCtx) { initAudioEngine(); return; }
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    for(let i=0; i<5; i++) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square'; 
        osc.frequency.setValueAtTime(880, now + (i * 0.6)); 
        osc.connect(gain); gain.connect(audioCtx.destination);
        const start = now + (i * 0.6); const end = start + 0.15;
        osc.start(start); osc.stop(end);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.5, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, end);
    }
}
window.testSound = () => { play5Beeps(); };

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

onAuthStateChanged(auth, async (user) => {
    if(user) {
        currentUser = user;
        const snap = await getDoc(doc(db,"users",user.uid));
        if(snap.exists()){
            userData = snap.data();
            
            // --- NUEVO: Chequeo visual de foto faltante ---
            checkPhotoVisualReminder();
            
            // --- NUEVO: Iniciar Listener de Comunidad ---
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

// Nueva función visual para la foto
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

window.recoverPass = async () => {
    const email = prompt("Introduce tu email:");
    if(email) try { await sendPasswordResetEmail(auth, email); alert("📧 Correo enviado."); } catch(e) { alert("Error: " + e.message); }
};
window.dismissNotif = () => { document.getElementById('notif-badge').style.display = 'none'; switchTab('routines-view'); sessionStorage.setItem('notif_dismissed', 'true'); };

// --- NUEVA FUNCIÓN: RENDER MUSCLE RADAR (Compartida) ---
function renderMuscleRadar(canvasId, stats) {
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    
    // Destruir instancia previa si existe (según ID)
    if(canvasId === 'userMuscleChart' && userRadarChart) userRadarChart.destroy();
    if(canvasId === 'coachMuscleChart' && coachRadarChart) coachRadarChart.destroy();

    const muscleGroups = ["Pecho", "Espalda", "Cuádriceps", "Isquios", "Hombros", "Bíceps", "Tríceps", "Glúteos"];
    // Mapeo seguro de datos (si no existe el músculo, pon 0)
    const dataValues = muscleGroups.map(m => stats[m] || 0);

    const newChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: muscleGroups,
            datasets: [{
                label: 'Volumen Relativo',
                data: dataValues,
                backgroundColor: 'rgba(255, 51, 51, 0.4)',
                borderColor: '#ff3333',
                pointBackgroundColor: '#ff3333',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#ff3333'
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { color: '#333' },
                    grid: { color: '#333' },
                    pointLabels: { color: '#ccc', font: { size: 10 } },
                    ticks: { display: false, backdropColor: 'transparent' },
                    suggestedMin: 0
                }
            },
            plugins: {
                legend: { display: false }
            },
            maintainAspectRatio: false
        }
    });

    if(canvasId === 'userMuscleChart') userRadarChart = newChart;
    if(canvasId === 'coachMuscleChart') coachRadarChart = newChart;
}

function getExerciseData(name) {
    if(!name) return { img: 'logo.png', mInfo: {main:'General', sec:[]}, type:'c', v:null };
    let match = EXERCISES.find(e => e.n === name);
    if (!match) {
        const cleanName = normalizeText(name);
        match = EXERCISES.find(e => normalizeText(e.n) === cleanName);
    }
    if (!match) {
        const cleanName = normalizeText(name);
        match = EXERCISES.find(e => {
            const cleanDbName = normalizeText(e.n);
            return cleanDbName.includes(cleanName) || cleanName.includes(cleanDbName);
        });
    }
    if (!match) {
        const n = normalizeText(name);
        let m = "General", img = "logo.png";
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
    if(m==="Pecho") s=["Tríceps","Hombros"]; 
    else if(m==="Espalda") s=["Bíceps", "Antebrazo"]; 
    else if(m==="Cuádriceps") s=["Glúteos", "Gemelos"]; 
    else if(m==="Isquios") s=["Glúteos", "Espalda Baja"];
    else if(m==="Hombros") s=["Tríceps", "Trapecio"]; 
    else if(m==="Bíceps") s=["Antebrazo"];
    else if(m==="Tríceps") s=["Hombros", "Pecho"];
    else if(m==="Glúteos") s=["Isquios", "Cuádriceps"];
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
                const div = document.createElement('div');
                div.className = 'card';
                div.innerHTML = `<div style="display:flex; justify-content:space-between;"><h3 style="color:${isMine?'white':'var(--accent-color)'}">${r.name}</h3><div>${isMine ? `<button style="background:none;border:none;margin-right:10px;" onclick="openEditor('${d.id}')">✏️</button><button style="background:none;border:none;" onclick="delRoutine('${d.id}')">🗑️</button>` : '🔒'}</div></div><p style="color:#666; font-size:0.8rem; margin:10px 0;">${r.exercises.length} Ejercicios</p><button class="btn" onclick="startWorkout('${d.id}')">ENTRENAR</button>`;
                l.appendChild(div);
            }
        });
        if(l.innerHTML === '') l.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No tienes rutinas asignadas.</div>';
    });
}

window.openEditor = async (id = null) => {
    editingRoutineId = id;
    document.getElementById('editor-name').value = '';
    document.getElementById('editor-title').innerText = id ? "EDITAR RUTINA" : "NUEVA RUTINA";
    
    if (id) {
        const docSnap = await getDoc(doc(db, "routines", id));
        const r = docSnap.data();
        document.getElementById('editor-name').value = r.name;
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

function renderExercises(l) {
    const c = document.getElementById('exercise-selector-list'); 
    c.innerHTML = '';
    l.forEach(e => {
        const d = document.createElement('div'); 
        d.className = 'ex-select-item';
        if(currentRoutineSelections.some(x => x.n === e.n)) d.classList.add('selected');
        d.innerHTML = `<img src="${e.img}" onerror="this.src='logo.png'"><span>${e.n}</span>`;
        d.onclick = () => { 
            const index = currentRoutineSelections.findIndex(x => x.n === e.n);
            if(index > -1) { currentRoutineSelections.splice(index, 1); } 
            else { currentRoutineSelections.push({ n: e.n, s: false, series: 5, reps: "20-16-16-16-16" }); } 
            renderExercises(l); renderSelectedSummary(); 
        };
        c.appendChild(d);
    });
}

window.renderSelectedSummary = () => {
    const div = document.getElementById('selected-summary'); div.innerHTML = '';
    window.currentRoutineSelections = currentRoutineSelections;
    currentRoutineSelections.forEach((obj, idx) => { 
        const pill = document.createElement('div'); pill.className = 'summary-item-card'; 
        let linkStyle = obj.s ? "color: white; font-weight:bold; text-shadow: 0 0 5px white;" : "color:rgba(255,255,255,0.2);";
        pill.innerHTML = `
            <span class="summary-item-name">${obj.n}</span>
            <div class="summary-inputs">
                <input type="number" value="${obj.series || 5}" oninput="window.currentRoutineSelections[${idx}].series = parseInt(this.value) || 0" placeholder="Ser">
                <span>x</span>
                <input type="text" value="${obj.reps || '20-16-16-16-16'}" style="width:110px" oninput="window.currentRoutineSelections[${idx}].reps = this.value" placeholder="Reps">
                <span style="font-size:1.2rem; cursor:pointer; ${linkStyle}" onclick="toggleSuperset(${idx})">🔗</span>
                <b class="btn-remove-ex" onclick="removeSelection('${obj.n}')" style="cursor:pointer; margin-left:10px;">✕</b>
            </div>`; 
        div.appendChild(pill); 
    });
};

window.toggleSuperset = (idx) => {
    if (idx < currentRoutineSelections.length - 1) {
        currentRoutineSelections[idx].s = !currentRoutineSelections[idx].s;
        renderSelectedSummary();
    }
};

window.removeSelection = (name) => { 
    currentRoutineSelections = currentRoutineSelections.filter(x => x.n !== name); 
    renderSelectedSummary(); 
    window.filterExercises(document.getElementById('ex-search').value); 
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

window.delRoutine = async (id) => { if(confirm("¿Borrar?")) await deleteDoc(doc(db,"routines",id)); window.loadAdminLibrary(); };

window.switchPose = (pose) => { currentPose = pose; document.getElementById('tab-front').classList.toggle('active', pose==='front'); document.getElementById('tab-back').classList.toggle('active', pose==='back'); updatePhotoDisplay(userData); };

function updatePhotoDisplay(u) {
    const prefix = currentPose === 'front' ? '' : '_back';
    const b = u[`photoBefore${prefix}`] || '', a = u[`photoAfter${prefix}`] || '';
    const dateB = u[`dateBefore${prefix}`] || '-', dateA = u[`dateAfter${prefix}`] || '-';
    document.getElementById('img-before').src = b; document.getElementById('img-overlay').src = a;
    document.getElementById('date-before').innerText = `ANTES (${dateB})`; document.getElementById('date-after').innerText = `AHORA (${dateA})`;
    document.getElementById('slider-handle').style.left = '0%'; document.getElementById('img-overlay').style.clipPath = 'inset(0 0 0 0)';
}

window.uploadAvatar = (inp) => { 
    if(inp.files[0]) { 
        const file = inp.files[0];
        const path = `users/${currentUser.uid}/avatar.jpg`;
        const storageRef = ref(storage, path);
        uploadBytes(storageRef, file).then(async (snapshot) => {
            const url = await getDownloadURL(snapshot.ref);
            await updateDoc(doc(db,"users",currentUser.uid), {photo: url}); 
            userData.photo = url; window.loadProfile();
        }).catch(e => alert("Error subiendo foto: " + e.message));
    } 
};

window.loadCompImg = (inp, field) => { 
    if(inp.files[0]) { 
        const file = inp.files[0];
        const r = new FileReader(); 
        r.onload = (e) => { 
            const img = new Image(); img.src = e.target.result; 
            img.onload = async () => { 
                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); 
                const scale = 800 / img.width; canvas.width = 800; canvas.height = img.height * scale; 
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height); 
                canvas.toBlob(async (blob) => {
                    const prefix = currentPose === 'front' ? 'front' : 'back';
                    const timestamp = Date.now();
                    const path = `users/${currentUser.uid}/progress/${timestamp}_${prefix}.jpg`;
                    const storageRef = ref(storage, path);
                    try {
                        await uploadBytes(storageRef, blob);
                        const url = await getDownloadURL(storageRef);
                        const fieldPrefix = currentPose === 'front' ? '' : '_back';
                        const fieldName = field === 'before' ? `photoBefore${fieldPrefix}` : `photoAfter${fieldPrefix}`; 
                        const dateField = field === 'before' ? `dateBefore${fieldPrefix}` : `dateAfter${fieldPrefix}`; 
                        const today = new Date().toLocaleDateString(); 
                        const record = { date: today, url: url };
                        let update = {}; update[fieldName] = url; update[dateField] = today;
                        const histField = fieldPrefix === '' ? 'photoHistoryFront' : 'photoHistoryBack';
                        update[histField] = arrayUnion(record);
                        await updateDoc(doc(db, "users", currentUser.uid), update); 
                        userData[fieldName] = url; userData[dateField] = today; 
                        if(!userData[histField]) userData[histField] = [];
                        userData[histField].push(record);
                        updatePhotoDisplay(userData);
                    } catch(err) { alert("Error: " + err.message); }
                }, 'image/jpeg', 0.8);
            }; 
        }; r.readAsDataURL(file); 
    } 
};

window.deletePhoto = async (type) => { 
    if(!confirm("¿Borrar?")) return; 
    const prefix = currentPose === 'front' ? '' : '_back'; 
    const f = type === 'before' ? `photoBefore${prefix}` : `photoAfter${prefix}`; 
    let u={}; u[f]=""; await updateDoc(doc(db,"users",currentUser.uid),u); 
    userData[f]=""; updatePhotoDisplay(userData); 
};

window.moveSlider = (v) => { 
    document.getElementById('img-overlay').style.clipPath = `inset(0 0 0 ${v}%)`; 
    document.getElementById('slider-handle').style.left = `${v}%`; 
};

window.switchCoachPose = (pose) => {
    coachCurrentPose = pose;
    document.getElementById('coach-tab-front').classList.toggle('active', pose==='front');
    document.getElementById('coach-tab-back').classList.toggle('active', pose==='back');
    updateCoachPhotoDisplay(pose);
};

function updateCoachPhotoDisplay(pose) {
    const u = selectedUserObj; if(!u) return;
    const prefix = pose === 'front' ? '' : '_back';
    const histField = prefix === '' ? 'photoHistoryFront' : 'photoHistoryBack';
    const history = u[histField] || [];
    const pCont = document.getElementById('coach-photos-container');
    pCont.innerHTML = `
        <div style="display:flex; gap:5px; margin-bottom:10px;">
             <select id="c-sel-before" onchange="window.updateCoachSliderImages()" style="margin:0; font-size:0.8rem;"></select>
             <select id="c-sel-after" onchange="window.updateCoachSliderImages()" style="margin:0; font-size:0.8rem;"></select>
        </div>
        <div class="compare-wrapper" style="min-height:250px; background:#000; position:relative;">
            <div class="slider-labels"><span class="label-tag">ANTES</span><span class="label-tag">AHORA</span></div>
            <img src="" id="c-img-before" class="compare-img" style="width:100%; height:100%; object-fit:contain;">
            <img src="" id="c-img-after" class="compare-img img-overlay" style="clip-path:inset(0 0 0 0); width:100%; height:100%; object-fit:contain;">
            <div class="slider-handle" id="coach-slider-handle" style="left:0%"><div class="slider-btn"></div></div>
        </div>
        <input type="range" min="0" max="100" value="0" style="width:100%; margin-top:15px;" oninput="window.moveCoachSlider(this.value)">
    `;
    const selB = document.getElementById('c-sel-before');
    const selA = document.getElementById('c-sel-after');
    if(history.length === 0) {
        const current = u[`photoBefore${prefix}`];
        const opt = new Option(current ? "Actual" : "Sin fotos", current || "");
        selB.add(opt); selA.add(opt.cloneNode(true));
    } else {
        history.forEach((h, i) => {
            const label = h.date || `Foto ${i+1}`;
            selB.add(new Option(label, h.url)); selA.add(new Option(label, h.url));
        });
        selB.selectedIndex = 0; selA.selectedIndex = history.length - 1;
    }
    window.updateCoachSliderImages();
}

window.updateCoachSliderImages = () => {
    const urlB = document.getElementById('c-sel-before').value;
    const urlA = document.getElementById('c-sel-after').value;
    const imgB = document.getElementById('c-img-before');
    const imgA = document.getElementById('c-img-after');
    if(imgB) imgB.src = urlB; if(imgA) imgA.src = urlA;
};

window.moveCoachSlider = (v) => {
    const overlay = document.getElementById('c-img-after');
    const handle = document.getElementById('coach-slider-handle');
    if(overlay) overlay.style.clipPath = `inset(0 0 0 ${v}%)`;
    if(handle) handle.style.left = `${v}%`;
};

function renderMeasureChart(canvasId, historyData) {
    const ctx = document.getElementById(canvasId);
    let instance = (canvasId === 'chartMeasures') ? measureChartInstance : coachMeasureChart;
    if(instance) instance.destroy();
    const labels = historyData.map(m => new Date(m.date.seconds*1000).toLocaleDateString());
    const parts = [
        {k:'chest', l:'Pecho', c:'#FF5733'}, {k:'waist', l:'Cintura', c:'#00FF88'},
        {k:'hip', l:'Cadera', c:'#3357FF'}, {k:'arm', l:'Brazo', c:'#FF33A8'},
        {k:'thigh', l:'Muslo', c:'#F3FF33'}, {k:'calf', l:'Gemelo', c:'#FF8C00'},
        {k:'shoulder', l:'Hombros', c:'#A133FF'}
    ];
    const datasets = parts.map(p => ({ label: p.l, data: historyData.map(h => h[p.k] || 0), borderColor: p.c, tension: 0.3, pointRadius: 2 }));
    const newChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: { plugins: { legend: { display: true, labels: { color: '#888', boxWidth: 10, font: {size: 10} } } }, scales: { y: { grid: { color: '#333' } }, x: { display: false } }, maintainAspectRatio: false } });
    if(canvasId === 'chartMeasures') measureChartInstance = newChart; else coachMeasureChart = newChart;
}

function renderBioChart(canvasId, historyData) {
    const ctx = document.getElementById(canvasId);
    let instance = (canvasId === 'chartBio') ? bioChartInstance : coachBioChart;
    if(instance) instance.destroy();
    const labels = historyData.map(m => new Date(m.date.seconds*1000).toLocaleDateString());
    const datasets = [
        { label: '% Músculo', data: historyData.map(h => h.muscle || 0), borderColor: '#00ffff', tension: 0.3, pointRadius: 3 }, 
        { label: '% Grasa', data: historyData.map(h => h.fat || 0), borderColor: '#ffaa00', tension: 0.3, pointRadius: 3 } 
    ];
    const newChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: { plugins: { legend: { display: true, labels: { color: '#ddd' } } }, scales: { y: { grid: { color: '#333' } }, x: { display: false } }, maintainAspectRatio: false } });
    if(canvasId === 'chartBio') bioChartInstance = newChart; else coachBioChart = newChart;
}

window.loadProfile = async () => {
    document.getElementById('profile-name').innerText = userData.name;
    if(userData.photo) { document.getElementById('avatar-text').style.display='none'; document.getElementById('avatar-img').src = userData.photo; document.getElementById('avatar-img').style.display='block'; }
    updatePhotoDisplay(userData);
    
    // --- PHOTO REMINDER AVISO ---
    if(!userData.photo) {
        // Inyectar banner si no hay foto
        const header = document.querySelector('.profile-header');
        if(!document.getElementById('photo-nudge')) {
             const nudge = document.createElement('div');
             nudge.id = 'photo-nudge';
             nudge.className = 'tip-box';
             nudge.style.marginTop = '10px';
             nudge.innerHTML = '📸 ¡Sube una foto para que tu Coach te reconozca mejor!';
             if(header && header.parentNode) header.parentNode.insertBefore(nudge, header.nextSibling);
        }
    } else {
        const nudge = document.getElementById('photo-nudge');
        if(nudge) nudge.remove();
    }

    if(userData.rankingOptIn) { document.getElementById('cfg-ranking').checked = true; document.getElementById('top-btn-ranking').classList.remove('hidden'); } 
    else { document.getElementById('cfg-ranking').checked = false; document.getElementById('top-btn-ranking').classList.add('hidden'); }

    if(userData.showBio) { document.getElementById('user-bio-section').classList.remove('hidden'); if(userData.bioHistory && userData.bioHistory.length > 0) renderBioChart('chartBio', userData.bioHistory); } else { document.getElementById('user-bio-section').classList.add('hidden'); }
    if(userData.dietFile) document.getElementById('btn-diet-view').classList.remove('hidden'); else document.getElementById('btn-diet-view').classList.add('hidden');
    if(userData.showSkinfolds) {
        document.getElementById('user-skinfolds-section').classList.remove('hidden');
        if(userData.skinfoldHistory && userData.skinfoldHistory.length > 0) {
            const ctxF = document.getElementById('chartFat');
            if(fatChartInstance) fatChartInstance.destroy();
            const dataF = userData.skinfoldHistory.map(f => f.fat || 0);
            const labels = userData.skinfoldHistory.map(f => new Date(f.date.seconds*1000).toLocaleDateString());
            fatChartInstance = new Chart(ctxF, { type: 'line', data: { labels: labels, datasets: [{ label: '% Grasa', data: dataF, borderColor: '#ffaa00', tension: 0.3 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#333' } }, x: { display: false } }, maintainAspectRatio: false } });
        }
    } else { document.getElementById('user-skinfolds-section').classList.add('hidden'); }
    if(userData.showMeasurements) {
        document.getElementById('user-measures-section').classList.remove('hidden');
        if(userData.measureHistory && userData.measureHistory.length > 0) renderMeasureChart('chartMeasures', userData.measureHistory);
    } else { document.getElementById('user-measures-section').classList.add('hidden'); }
    if(userData.restTime) document.getElementById('cfg-rest-time').value = userData.restTime;
    document.getElementById('stat-workouts').innerText = userData.stats.workouts || 0;
    document.getElementById('stat-kg').innerText = userData.stats.totalKg ? (userData.stats.totalKg/1000).toFixed(1)+'t' : 0;
    document.getElementById('stat-sets').innerText = userData.stats.totalSets || 0;
    document.getElementById('stat-reps').innerText = userData.stats.totalReps || 0;
    const ctx = document.getElementById('weightChart'); 
    if(chartInstance) chartInstance.destroy();
    const rawData = userData.weightHistory;
    const data = (rawData && rawData.length > 0) ? rawData : [70]; 
    chartInstance = new Chart(ctx, { type:'line', data:{ labels:data.map((_,i)=>`T${i}`), datasets:[{label:'Kg', data:data, borderColor:'#ff3333', backgroundColor:'rgba(255,51,51,0.1)', fill:true, tension:0.4}] }, options:{plugins:{legend:{display:false}}, scales:{x:{display:false},y:{grid:{color:'#333'}}}, maintainAspectRatio:false} });
    const histDiv = document.getElementById('user-history-list'); histDiv.innerHTML = "Cargando...";
    try {
        const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid));
        const snap = await getDocs(q);
        const workouts = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => b.date - a.date).slice(0, 5);
        histDiv.innerHTML = workouts.length ? '' : "Sin historial.";
        workouts.forEach(d => {
            const date = d.date ? new Date(d.date.seconds*1000).toLocaleDateString() : '-';
            const detailsStr = d.details ? encodeURIComponent(JSON.stringify(d.details)) : "";
            const noteStr = d.note ? encodeURIComponent(d.note) : "";
            const btnVer = d.details ? `<button class="btn-small btn-outline" style="margin:0; padding:2px 6px;" onclick="window.viewWorkoutDetails('${d.routine}', '${detailsStr}', '${noteStr}')">🔍</button>` : '';
            histDiv.innerHTML += `<div class="history-row" style="grid-template-columns: 1fr 40px;"><div><span style="color:#accent-color">${date}</span> - ${d.routine}</div><div style="text-align:right;">${btnVer}</div></div>`;
        });
    } catch(e) { histDiv.innerHTML = "Error."; }
    
    // --- RENDERIZADO DEL MAPA MUSCULAR (RADAR CHART) ---
    renderMuscleRadar('userMuscleChart', userData.muscleStats || {});
}

window.openDietView = () => {
    if(!userData.dietFile) return;
    const url = `nutricion/${userData.dietFile}`;
    document.getElementById('diet-frame').src = url;
    window.openModal('modal-diet');
};

window.closeDiet = () => {
    document.getElementById('diet-frame').src = "about:blank";
    window.closeModal('modal-diet');
};

window.assignDiet = async () => {
    const file = document.getElementById('coach-diet-select').value;
    if(!selectedUserCoach) return;
    const val = file === "" ? null : file;
    await updateDoc(doc(db, "users", selectedUserCoach), { dietFile: val });
    alert("Dieta actualizada.");
    openCoachView(selectedUserCoach, selectedUserObj);
};

window.saveSelfConfig = async (feature, value) => {
    const update = {}; update[feature] = value;
    await updateDoc(doc(db, "users", currentUser.uid), update);
    userData[feature] = value; window.loadProfile();
};

window.saveMeasurements = async () => {
    const data = {
        date: new Date(),
        chest: document.getElementById('m-chest').value, waist: document.getElementById('m-waist').value,
        hip: document.getElementById('m-hip').value, arm: document.getElementById('m-arm').value,
        thigh: document.getElementById('m-thigh').value, calf: document.getElementById('m-calf').value,
        shoulder: document.getElementById('m-shoulder').value
    };
    await updateDoc(doc(db, "users", currentUser.uid), { measureHistory: arrayUnion(data), measurements: data });
    alert("Guardado ✅"); window.loadProfile();
};

window.calculateAndSaveSkinfolds = async () => {
    const s = {
        chest: parseFloat(document.getElementById('p-chest').value)||0, axilla: parseFloat(document.getElementById('p-axilla').value)||0,
        tricep: parseFloat(document.getElementById('p-tricep').value)||0, subscap: parseFloat(document.getElementById('p-subscap').value)||0,
        abdo: parseFloat(document.getElementById('p-abdo').value)||0, supra: parseFloat(document.getElementById('p-supra').value)||0,
        thigh: parseFloat(document.getElementById('p-thigh').value)||0
    };
    const sum = Object.values(s).reduce((a,b)=>a+b,0);
    const age = userData.age || 25, gender = userData.gender || 'male';
    let bd = (gender === 'male') ? 1.112 - (0.00043499*sum) + (0.00000055*sum*sum) - (0.00028826*age) : 1.097 - (0.00046971*sum) + (0.00000056*sum*sum) - (0.00012828*age);
    const fat = ((495 / bd) - 450).toFixed(1);
    await updateDoc(doc(db, "users", currentUser.uid), { skinfoldHistory: arrayUnion({date: new Date(), fat: fat, skinfolds: s}), skinfolds: s, bodyFat: fat });
    alert(`Grasa: ${fat}%. Guardado ✅`); window.loadProfile();
};

window.saveBioEntry = async () => {
    const muscle = parseFloat(document.getElementById('bio-muscle').value) || 0;
    const fat = parseFloat(document.getElementById('bio-fat').value) || 0;
    if(muscle === 0 && fat === 0) return alert("Introduce datos válidos.");
    const entry = { date: new Date(), muscle: muscle, fat: fat };
    await updateDoc(doc(db, "users", currentUser.uid), { bioHistory: arrayUnion(entry) });
    alert("Datos Guardados ✅");
    if(!userData.bioHistory) userData.bioHistory = [];
    userData.bioHistory.push(entry); window.loadProfile();
};

window.saveConfig = async () => {
    const rt = document.getElementById('cfg-rest-time').value;
    await updateDoc(doc(db,"users",currentUser.uid), { restTime: parseInt(rt) });
    userData.restTime = parseInt(rt); alert("Ajustes Guardados");
};

window.savePhotoReminder = async () => {
    const d = document.getElementById('photo-day').value;
    const t = document.getElementById('photo-time').value;
    await updateDoc(doc(db,"users",currentUser.uid), { photoDay:d, photoTime:t });
    userData.photoDay = d; userData.photoTime = t; alert("Alarma Guardada");
};

window.addWeightEntry = async () => { 
    const wStr = prompt("Introduce tu peso (kg):");
    if(!wStr) return;
    const w = parseFloat(wStr.replace(',','.'));
    if(isNaN(w)) return alert("Número inválido");
    let history = userData.weightHistory || [];
    history.push(w);
    try {
        await updateDoc(doc(db,"users",currentUser.uid), {weightHistory: history});
        userData.weightHistory = history; window.loadProfile(); alert("✅ Peso Guardado");
    } catch(e) { alert("Error al guardar: " + e.message); }
};

function saveLocalWorkout() {
    localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout));
}

window.cancelWorkout = () => {
    if(confirm("⚠ ¿SEGURO QUE QUIERES CANCELAR?\nSe perderán los datos de este entrenamiento.")) {
        activeWorkout = null;
        localStorage.removeItem('fit_active_workout');
        if(durationInt) clearInterval(durationInt); 
        switchTab('routines-view');
    }
};

window.startWorkout = async (rid) => {
    if(document.getElementById('cfg-wake').checked && 'wakeLock' in navigator) try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){}
    try {
        const snap = await getDoc(doc(db,"routines",rid)); 
        const r = snap.data();
        let lastWorkoutData = null;
        const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid));
        const wSnap = await getDocs(q);
        const sameRoutine = wSnap.docs.map(d=>d.data()).filter(d => d.routine === r.name).sort((a,b) => b.date - a.date); 
        if(sameRoutine.length > 0) lastWorkoutData = sameRoutine[0].details;

        const now = Date.now();
        
        // --- AUDIO TRIGGER (iOS Safe) ---
        if(htmlAudioElement) {
             htmlAudioElement.play().then(() => {
                 htmlAudioElement.pause();
             }).catch(e => {});
        }
        
        activeWorkout = { 
            name: r.name, 
            startTime: now, 
            exs: r.exercises.map(exObj => {
                const isString = typeof exObj === 'string';
                const name = isString ? exObj : exObj.n;
                const isSuperset = isString ? false : (exObj.s || false);
                const customSeriesNum = isString ? 5 : (parseInt(exObj.series) || 5);
                const customRepsPattern = isString ? "20-16-16-16-16" : (exObj.reps || "20-16-16-16-16");
                const repsArray = customRepsPattern.split('-');
                const data = getExerciseData(name);
                
                let sets = Array(customSeriesNum).fill().map((_, i) => ({
                    r: repsArray[i] ? parseInt(repsArray[i]) : parseInt(repsArray[repsArray.length - 1]),
                    w: 0, d: false, prev: '-', numDisplay: (i + 1).toString()
                }));

                if(lastWorkoutData) {
                    const prevEx = lastWorkoutData.find(ld => ld.n === name);
                    if(prevEx && prevEx.s) {
                        sets = sets.map((s, i) => { 
                            if(prevEx.s[i]) {
                                const dLabel = prevEx.s[i].isDrop ? ' (D)' : '';
                                s.prev = `${prevEx.s[i].r}x${prevEx.s[i].w}kg${dLabel}`;
                            }
                            return s; 
                        });
                    }
                }
                return { n:name, img:data.img, mInfo: data.mInfo, type: data.type, video: data.v, sets: sets, superset: isSuperset, note: "" }; 
            })
        };
        saveLocalWorkout(); 
        renderWorkout(); 
        switchTab('workout-view'); 
        startTimerMini();
    } catch(e) { 
        console.error(e);
        alert("Error iniciando entreno: " + e.message); 
    }
};

window.addSet = (exIdx) => { 
    const sets = activeWorkout.exs[exIdx].sets;
    sets.push({r:16, w:0, d:false, prev:'-', numDisplay: (sets.length + 1).toString()}); 
    saveLocalWorkout(); renderWorkout(); 
};
window.removeSet = (exIdx) => { if(activeWorkout.exs[exIdx].sets.length > 1) { activeWorkout.exs[exIdx].sets.pop(); saveLocalWorkout(); renderWorkout(); } };

window.toggleAllSets = (exIdx) => {
    const ex = activeWorkout.exs[exIdx];
    const allDone = ex.sets.every(s => s.d);
    const newState = !allDone;
    ex.sets.forEach(s => { s.d = newState; });
    saveLocalWorkout();
    renderWorkout();
    if(newState) showToast("✅ Todas las series completadas");
};

// --- GESTIÓN DE NOTAS ---
window.openNoteModal = (idx) => {
    noteTargetIndex = idx;
    const existingNote = activeWorkout.exs[idx].note || "";
    document.getElementById('exercise-note-input').value = existingNote;
    window.openModal('modal-note');
};

window.saveNote = () => {
    if (noteTargetIndex === null) return;
    const txt = document.getElementById('exercise-note-input').value.trim();
    activeWorkout.exs[noteTargetIndex].note = txt; 
    saveLocalWorkout();
    renderWorkout(); 
    window.closeModal('modal-note');
    showToast(txt ? "📝 Nota guardada" : "🗑️ Nota borrada");
};

// --- GESTIÓN DE RANKING ---
window.toggleRankingOptIn = async (val) => {
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { rankingOptIn: val });
        userData.rankingOptIn = val;
        const btnRank = document.getElementById('top-btn-ranking');
        if(val) btnRank.classList.remove('hidden'); else btnRank.classList.add('hidden');
        showToast(val ? "🏆 Ahora participas en el Ranking" : "👻 Ranking desactivado");
    } catch(e) { alert("Error actualizando perfil"); }
};

window.changeRankFilter = (type, val) => {
    if(type === 'time') {
        rankFilterTime = val;
        document.querySelectorAll('#ranking-view .pill').forEach(el => el.classList.remove('active')); 
        document.getElementById(`time-${val}`).classList.add('active');
        // document.getElementById(`gender-${rankFilterGender}`).classList.add('active'); // Puede no ser necesario si no se resetea
    }
    if(type === 'gender') {
        rankFilterGender = val;
        document.getElementById('gender-all').classList.remove('active');
        document.getElementById('gender-male').classList.remove('active');
        document.getElementById('gender-female').classList.remove('active');
        document.getElementById(`gender-${val}`).classList.add('active');
    }
    if(type === 'cat') {
        rankFilterCat = val;
        document.querySelectorAll('.pill-cat').forEach(el => el.classList.remove('active'));
        document.getElementById(`cat-${val}`).classList.add('active');
    }
    window.loadRankingView();
};

window.loadRankingView = async () => {
    switchTab('ranking-view');
    const list = document.getElementById('ranking-list');
    list.innerHTML = '<div style="text-align:center; margin-top:50px; color:#666;">⏳ Calculando posiciones...</div>';

    try {
        let orderByField = "";
        let collectionField = ""; 

        if (rankFilterCat === 'kg') collectionField = "kg"; 
        else if (rankFilterCat === 'workouts') collectionField = "workouts";
        else if (rankFilterCat === 'reps') collectionField = "reps";
        else if (rankFilterCat === 'sets') collectionField = "sets";
        else if (rankFilterCat === 'prs') collectionField = "prCount";

        if (rankFilterTime === 'all') {
            if (rankFilterCat === 'kg') orderByField = "stats.totalKg";
            else if (rankFilterCat === 'workouts') orderByField = "stats.workouts";
            else if (rankFilterCat === 'reps') orderByField = "stats.totalReps";
            else if (rankFilterCat === 'sets') orderByField = "stats.totalSets";
            else if (rankFilterCat === 'prs') orderByField = "stats.prCount";
        } else {
            const now = new Date();
            let timeKey = "";
            
            // --- LOGICA DE RANKING TEMPORAL ---
            if(rankFilterTime === 'week') timeKey = `week_${getWeekNumber(now)}`;
            else if(rankFilterTime === 'month') timeKey = `month_${now.getFullYear()}_${now.getMonth()}`;
            else if(rankFilterTime === 'year') timeKey = `year_${now.getFullYear()}`;
            
            if (rankFilterCat === 'prs') {
                list.innerHTML = "<div class='tip-box'>🏆 Los Récords solo se contabilizan en el Ranking Histórico.</div>";
                return;
            }
            orderByField = `stats_${timeKey}.${collectionField}`;
        }

        let q = query(
            collection(db, "users"), 
            where("rankingOptIn", "==", true),
            orderBy(orderByField, "desc"),
            limit(50)
        );

        if (rankFilterGender !== 'all') {
            q = query(
                collection(db, "users"), 
                where("rankingOptIn", "==", true),
                where("gender", "==", rankFilterGender),
                orderBy(orderByField, "desc"),
                limit(50)
            );
        }
        
        const snap = await getDocs(q);
        list.innerHTML = "";
        
        if(snap.empty) {
            list.innerHTML = "<div class='tip-box'>No hay datos para este periodo/filtro todavía. ¡Entrena para inaugurarlo!</div>";
            return;
        }

        let rank = 1;
        snap.forEach(d => {
            const u = d.data();
            const isMe = d.id === currentUser.uid;
            
            let rawValue = 0;
            if (rankFilterTime === 'all') {
                const fieldName = orderByField.split('.')[1];
                rawValue = u.stats ? u.stats[fieldName] : 0;
            } else {
                const rootKey = orderByField.split('.')[0]; 
                const subKey = orderByField.split('.')[1];
                rawValue = (u[rootKey] && u[rootKey][subKey]) ? u[rootKey][subKey] : 0;
            }

            let displayValue = rawValue;
            if(rankFilterCat === 'kg') displayValue = (rawValue / 1000).toFixed(1) + 't';
            else if(rankFilterCat === 'prs') displayValue = rawValue + ' 🏆';
            else displayValue = rawValue.toLocaleString();

            let posClass = "";
            if(rank === 1) posClass = "ranking-1";
            if(rank === 2) posClass = "ranking-2";
            if(rank === 3) posClass = "ranking-3";
            
            const avatarHtml = u.photo 
                ? `<img src="${u.photo}" class="mini-avatar" style="width:35px;height:35px;">` 
                : `<div class="mini-avatar-placeholder" style="width:35px;height:35px;font-size:0.8rem;">${u.name.charAt(0)}</div>`;

            const div = document.createElement('div');
            div.className = "ranking-row";
            if(isMe) div.style.borderColor = "var(--accent-color)";
            
            div.innerHTML = `
                <div class="ranking-pos ${posClass}">#${rank}</div>
                <div style="margin-right:10px;">${avatarHtml}</div>
                <div style="flex:1;">
                    <div style="font-weight:bold; color:${isMe ? 'var(--accent-color)' : 'white'}">${u.name}</div>
                    <div style="font-size:0.65rem; color:#666;">${u.stats?.workouts || 0} entrenos totales</div>
                </div>
                <div class="rank-value-highlight">${displayValue}</div>
            `;
            list.appendChild(div);
            rank++;
        });

    } catch(e) {
        console.error("Rank Error:", e);
        if(e.message.includes("index")) {
            const url = e.message.match(/https:\/\/\S+/);
            const link = url ? url[0] : "#";
            list.innerHTML = `<div class="tip-box" style="cursor:pointer; border-color:red; color:#f88;" onclick="window.open('${link}', '_blank')">
                ⚠️ SISTEMA: Falta Índice de Base de Datos.<br>
                <b>Haz click AQUÍ para crearlo automáticamente</b><br>
                (Es necesario para cada combinación de filtros nueva)
            </div>`;
        } else {
            list.innerHTML = `<div style="text-align:center; color:#666;">Error cargando datos.<br><small>${e.message}</small></div>`;
        }
    }
};

window.initSwap = (idx) => {
    swapTargetIndex = idx;
    const currentEx = activeWorkout.exs[idx];
    const muscle = currentEx.mInfo.main; 
    const list = document.getElementById('swap-list');
    list.innerHTML = '';
    const alternatives = EXERCISES.filter(e => getMuscleInfoByGroup(e.m).main === muscle && e.n !== currentEx.n);
    if(alternatives.length === 0) list.innerHTML = '<div style="padding:10px;">No hay alternativas directas.</div>';
    else alternatives.forEach(alt => {
        const d = document.createElement('div'); d.style.padding = "10px"; d.style.borderBottom = "1px solid #333"; d.style.cursor = "pointer";
        d.innerHTML = `<b>${alt.n}</b>`; d.onclick = () => window.performSwap(alt.n); list.appendChild(d);
    });
    window.openModal('modal-swap');
};

window.performSwap = (newName) => {
    if(swapTargetIndex === null) return;
    const data = getExerciseData(newName);
    const currentSets = activeWorkout.exs[swapTargetIndex].sets.map(s => ({...s, prev:'-', d: false})); 
    activeWorkout.exs[swapTargetIndex].n = newName; activeWorkout.exs[swapTargetIndex].img = data.img;
    activeWorkout.exs[swapTargetIndex].video = data.v; activeWorkout.exs[swapTargetIndex].sets = currentSets;
    saveLocalWorkout(); renderWorkout(); window.closeModal('modal-swap');
};

function renderWorkout() {
    const c = document.getElementById('workout-exercises'); c.innerHTML = '';
    document.getElementById('workout-title').innerText = activeWorkout.name;
    activeWorkout.exs.forEach((e, i) => {
        let cardStyle = "border-left:3px solid var(--accent-color);";
        let connector = "";
        if (e.superset) {
            cardStyle += " margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: 1px dashed #444;";
            connector = `<div style="text-align:center; background:var(--card-color); color:var(--accent-color); font-size:1.2rem; line-height:0.5;">🔗</div>`;
        } else if (i > 0 && activeWorkout.exs[i-1].superset) cardStyle += " border-top-left-radius: 0; border-top-right-radius: 0; margin-top:0;";

        const card = document.createElement('div'); card.className = 'card'; card.style.cssText = cardStyle;
        let videoBtnHtml = (userData.showVideos && e.video) ? `<button class="btn-small btn-outline" style="float:right; width:auto; margin:0; padding:2px 8px; border-color:#f00; color:#f55;" onclick="window.openVideo('${e.video}')">🎥</button>` : '';
        const swapBtn = `<button class="btn-small btn-outline" style="float:right; width:auto; margin:0 5px 0 0; padding:2px 8px; border-color:#aaa; color:#fff;" onclick="window.initSwap(${i})">🔄</button>`;
        
        // BOTÓN NOTA
        const hasNote = e.note && e.note.length > 0;
        const noteBtn = `<button class="ex-note-btn ${hasNote ? 'has-note' : ''}" onclick="window.openNoteModal(${i})">📝</button>`;

        let bars = (e.type === 'i') ? `<div class="mini-bar-label"><span>${e.mInfo.main}</span><span>100%</span></div><div class="mini-track"><div class="mini-fill fill-primary"></div></div>` : `<div class="mini-bar-label"><span>${e.mInfo.main}</span><span>70%</span></div><div class="mini-track"><div class="mini-fill fill-primary" style="width:70%"></div></div>`;
        let setsHtml = `<div class="set-header"><div>#</div><div>PREV</div><div>REPS</div><div>KG</div><div></div></div>`;
        
        e.sets.forEach((s, j) => {
            const weightVal = s.w === 0 ? '' : s.w;
            const isDisabled = s.d ? 'disabled' : '';
            const rowOpacity = s.d ? 'opacity:0.5; pointer-events:none;' : '';
            const isDropClass = s.isDrop ? 'is-dropset' : '';
            const displayNum = s.numDisplay || (j + 1);

            setsHtml += `
            <div class="set-row ${isDropClass}" style="${rowOpacity}">
                <div class="set-num" style="${s.isDrop ? 'color:var(--warning-color); font-size:0.7rem;' : ''}">${displayNum}</div>
                <div class="prev-data">${s.prev}</div>
                <div><input type="number" value="${s.r}" ${isDisabled} onchange="uS(${i},${j},'r',this.value)"></div>
                <div><input type="number" placeholder="kg" value="${weightVal}" ${isDisabled} onchange="uS(${i},${j},'w',this.value)"></div>
                <div style="display:flex; flex-direction:column; gap:2px; pointer-events: auto;">
                    <button id="btn-${i}-${j}" class="btn-outline ${s.d ? 'btn-done' : ''}" style="margin:0;padding:0;height:32px;" onclick="tS(${i},${j})">${s.d ? '✓' : ''}</button>
                    ${(!s.d && !s.isDrop) ? `<button class="btn-small btn-outline" style="padding:2px; font-size:0.5rem; border-color:var(--warning-color); color:var(--warning-color);" onclick="window.addDropset(${i},${j})">💧 DROP</button>` : ''}
                </div>
            </div>`;
        });
        setsHtml += `
        <div class="sets-actions">
            <button class="btn-set-control" style="border-color:var(--success-color); color:var(--success-color); margin-right:auto;" onclick="window.toggleAllSets(${i})">✓ TODO</button>
            <button class="btn-set-control" onclick="removeSet(${i})">- Serie</button>
            <button class="btn-set-control" onclick="addSet(${i})">+ Serie</button>
        </div>`;
        
        card.innerHTML = `
            <div class="workout-split"><div class="workout-visual"><img src="${e.img}" onerror="this.src='logo.png'"></div><div class="workout-bars" style="width:100%">${bars}</div></div>
            <h3 style="margin-bottom:10px; border:none; display:flex; align-items:center; justify-content:space-between;">
                <span>${e.n}</span>
                <div>${noteBtn} ${videoBtnHtml} ${swapBtn}</div>
            </h3>
            ${setsHtml}`;
        c.appendChild(card);
        if (e.superset) c.innerHTML += connector; 
    });
}

window.addDropset = (exIdx, setIdx) => {
    const currentSet = activeWorkout.exs[exIdx].sets[setIdx];
    currentSet.d = true; 
    const newSet = {
        r: Math.floor(currentSet.r * 0.8) || 10,
        w: Math.floor(currentSet.w * 0.7) || 0,
        d: false, prev: 'DROPSET', isDrop: true,
        numDisplay: (parseInt(currentSet.numDisplay) || (setIdx + 1)) + ".5"
    };
    activeWorkout.exs[exIdx].sets.splice(setIdx + 1, 0, newSet);
    saveLocalWorkout(); renderWorkout(); showToast(`💧 Serie ${newSet.numDisplay} añadida`);
};

window.uS = (i,j,k,v) => { activeWorkout.exs[i].sets[j][k]=v; saveLocalWorkout(); };

// --- LÓGICA DE RÉCORD 1RM (Fuerza Real) & CONFETI ---
window.tS = async (i, j) => { 
    const s = activeWorkout.exs[i].sets[j]; 
    const exerciseName = activeWorkout.exs[i].n;
    s.d = !s.d; 
    
    if(s.d) { 
        const weight = parseFloat(s.w) || 0;
        const reps = parseInt(s.r) || 0;

        if (weight > 0 && reps > 0) {
            // 1. Cálculo del 1RM Estimado (Fórmula Brzycki)
            const estimated1RM = Math.round(weight / (1.0278 - (0.0278 * reps)));

            // 2. Obtenemos el récord anterior del perfil del usuario
            if (!userData.rmRecords) userData.rmRecords = {};
            const currentRecord = userData.rmRecords[exerciseName] || 0;

            // 3. ¿Es un NUEVO RÉCORD de Fuerza?
            if (estimated1RM > currentRecord) {
                userData.rmRecords[exerciseName] = estimated1RM;
                updateDoc(doc(db, "users", currentUser.uid), { [`rmRecords.${exerciseName}`]: estimated1RM });

                // 4. ¡CELEBRACIÓN! 🎉
                if(typeof confetti === 'function') {
                    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#00ff88', '#ffffff'] });
                    setTimeout(() => confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } }), 200);
                    setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } }), 200);
                }
                showToast(`🔥 ¡NUEVO NIVEL DE FUERZA!<br>1RM Est: <b>${estimated1RM}kg</b> en ${exerciseName}`);
            } 
            // Si no es 1RM, revisamos si es PR de peso absoluto
            else {
                const currentWeightPR = userData.prs ? (userData.prs[exerciseName] || 0) : 0;
                if (weight > currentWeightPR) {
                    if(!userData.prs) userData.prs = {};
                    userData.prs[exerciseName] = weight;
                    // --- CONTADOR DE LOGROS ---
                    const newPrCount = (userData.stats.prCount || 0) + 1;
                    updateDoc(doc(db, "users", currentUser.uid), { 
                        [`prs.${exerciseName}`]: weight,
                        "stats.prCount": newPrCount 
                    });
                    userData.stats.prCount = newPrCount;

                    showToast(`💪 Peso Máximo Superado: ${weight}kg`);
                }
            }
        }
        openRest(); 
    } 
    saveLocalWorkout(); 
    renderWorkout();
};

window.requestNotifPermission = () => {
    if ("Notification" in window) {
        Notification.requestPermission().then(p => {
            if(p === 'granted') showToast("✅ Notificaciones activadas");
            else showToast("❌ Permiso denegado");
        });
    } else {
        showToast("⚠️ Tu navegador no soporta notificaciones");
    }
};

const updateMediaSession = (titleText, artistText) => {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: titleText,        
            artist: artistText,    
            album: 'Fit Data Pro',
            artwork: [{ src: 'logo.png', sizes: '512x512', type: 'image/png' }]
        });
        navigator.mediaSession.playbackState = "playing";
    }
};

// --- VISUALES DEL CRONÓMETRO SVG (ROJO CORPORATIVO) + TIME FIX ---
function updateTimerVisuals(timeLeft) {
    const display = document.getElementById('timer-display');
    const ring = document.getElementById('timer-progress-ring');
    
    if(display) {
        display.innerText = timeLeft;
        // Parpadeo final
        display.style.color = timeLeft <= 5 ? "#fff" : "var(--accent-color)";
        display.style.textShadow = timeLeft <= 5 ? "0 0 20px #fff" : "none";
    }
    
    if(ring) {
        const circumference = 565; 
        const offset = circumference - (timeLeft / totalRestTime) * circumference;
        ring.style.strokeDashoffset = offset;
        ring.style.stroke = "var(--accent-color)"; // SIEMPRE ROJO
        if (timeLeft <= 0) ring.style.stroke = "#ffffff";
    }
}

// --- OPEN REST CON TIEMPO DELTA Y MEDIA SESSION SYNC ---
function openRest() {
    window.openModal('modal-timer');
    
    // 1. Activar Audio (VITAL PARA IOS)
    if(htmlAudioElement) {
        htmlAudioElement.play()
            .then(() => { if('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing"; })
            .catch(e => console.log("Audio play blocked", e));
    } else {
        initAudioEngine();
    }
    
    let duration = parseInt(userData.restTime) || 60;
    totalRestTime = duration; 
    
    // Marca de tiempo absoluta: AHORA + DURACIÓN
    restEndTime = Date.now() + (duration * 1000);

    updateTimerVisuals(duration);
    
    // 2. CONFIGURAR BARRA DE PROGRESO NATIVA (EL TRUCO PARA QUE NO SE CONGELE)
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: `Descanso...`, 
            artist: 'Fit Data Pro',
            album: 'Recuperando',
            artwork: [{ src: 'logo.png', sizes: '512x512', type: 'image/png' }]
        });
        
        // ESTO ES LO QUE HACE QUE LA BARRA SE MUEVA SOLA
        navigator.mediaSession.setPositionState({
            duration: duration,
            playbackRate: 1,
            position: 0
        });
    }

    if(timerInt) clearInterval(timerInt);
    
    // 3. INTERVALO DE SEGURIDAD (JS)
    timerInt = setInterval(() => {
        // Cálculo DELTA: Tiempo final - Tiempo actual
        const now = Date.now();
        const left = Math.ceil((restEndTime - now) / 1000);
        
        if (left >= 0) {
             updateTimerVisuals(left);
        } 
        else {
            window.closeTimer();
            if(document.getElementById('cfg-sound') && document.getElementById('cfg-sound').checked) {
                play5Beeps();
            }
            if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
            
            if ("Notification" in window && Notification.permission === "granted") {
                 try {
                    new Notification("¡A LA SERIE!", { body: "Descanso finalizado.", icon: "logo.png" });
                 } catch(e) {}
            }
        }
    }, 1000);
}

window.closeTimer = () => {
    clearInterval(timerInt);
    window.closeModal('modal-timer');
    // No pausamos el audio para no perder el foco de la isla dinámica
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Entrenando 💪',
            artist: 'Fit Data Pro',
            album: 'Dale duro',
            artwork: [{ src: 'logo.png', sizes: '512x512', type: 'image/png' }]
        });
        // Reseteamos posición para que no parezca que sigue contando
        navigator.mediaSession.setPositionState({
            duration: 100, // Dummy
            playbackRate: 0, // Pausado visualmente
            position: 0
        });
    }
};

window.addRestTime = (s) => { 
    clearInterval(timerInt);
    
    // Sumamos tiempo a la marca final
    restEndTime += (s * 1000);
    
    // Recalculamos lo que queda
    const now = Date.now();
    const left = Math.ceil((restEndTime - now) / 1000);
    
    if(s > 0) totalRestTime += s; 
    
    updateTimerVisuals(left);
    
    // Actualizamos la barra nativa
    if ('mediaSession' in navigator) {
        // Calculamos nueva posición relativa
        const currentPos = totalRestTime - left;
        navigator.mediaSession.setPositionState({
            duration: totalRestTime,
            playbackRate: 1,
            position: Math.max(0, currentPos)
        });
    }
    
    timerInt = setInterval(() => {
        const currentNow = Date.now();
        const currentLeft = Math.ceil((restEndTime - currentNow) / 1000);
        
        if(currentLeft >= 0) {
            updateTimerVisuals(currentLeft);
        } else {
            window.closeTimer();
            if(document.getElementById('cfg-sound').checked) play5Beeps();
            if("vibrate" in navigator) navigator.vibrate([500]);
        }
    }, 1000);
};

function startTimerMini() { 
    if(durationInt) clearInterval(durationInt);
    const d = document.getElementById('mini-timer'); 
    if(!activeWorkout.startTime) activeWorkout.startTime = Date.now();
    const startTime = activeWorkout.startTime; 
    durationInt = setInterval(()=>{
        const diff = Math.floor((Date.now() - startTime)/1000); 
        const m = Math.floor(diff/60);
        const s = diff % 60;
        if(d) d.innerText = `${m}:${s.toString().padStart(2,'0')}`;
    }, 1000); 
}

window.promptRPE = () => {
    const radarCtx = document.getElementById('muscleRadarChart');
    if (!radarCtx) return;
    if (radarChartInstance) radarChartInstance.destroy();

    const muscleCounts = { "Pecho":0, "Espalda":0, "Pierna":0, "Hombros":0, "Brazos":0, "Abs":0 };
    if (activeWorkout && activeWorkout.exs) {
        activeWorkout.exs.forEach(e => {
            const m = e.mInfo?.main || "General";
            let key = "";
            if (["Pecho", "Espalda", "Hombros", "Abs"].includes(m)) key = m;
            else if (["Cuádriceps", "Isquios", "Glúteos", "Gemelos"].includes(m)) key = "Pierna";
            else if (["Bíceps", "Tríceps"].includes(m)) key = "Brazos";

            if (key && muscleCounts.hasOwnProperty(key)) {
                const completedSets = e.sets?.filter(s => s.d).length || 0;
                muscleCounts[key] += completedSets;
            }
        });
    }

    radarChartInstance = new Chart(radarCtx, {
        type: 'radar',
        data: {
            labels: Object.keys(muscleCounts),
            datasets: [{
                label: 'Series Finalizadas',
                data: Object.values(muscleCounts),
                backgroundColor: 'rgba(255, 51, 51, 0.4)',
                borderColor: '#ff3333',
                borderWidth: 2,
                pointBackgroundColor: '#ff3333'
            }]
        },
        options: {
            scales: {
                r: {
                    beginAtZero: true, min: 0,
                    ticks: { display: false, stepSize: 1 },
                    grid: { color: '#333' },
                    angleLines: { color: '#333' },
                    pointLabels: { color: '#ffffff', font: { size: 10 } }
                }
            },
            plugins: { legend: { display: false } },
            maintainAspectRatio: false, responsive: true
        }
    });
    const notesEl = document.getElementById('workout-notes');
    if (notesEl) notesEl.value = ''; 
    window.openModal('modal-rpe');
};

function showToast(msg) {
    const container = document.getElementById('toast-container') || createToastContainer();
    const t = document.createElement('div'); t.className = 'toast-msg'; t.innerText = msg;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000);
}

function createToastContainer() {
    const div = document.createElement('div'); div.id = 'toast-container'; document.body.appendChild(div); return div;
}

// --- GUARDADO INTELIGENTE (RANKING SEMANAL) ---
window.finishWorkout = async (rpeVal) => {
    try {
        window.closeModal('modal-rpe');
        const note = document.getElementById('workout-notes')?.value || "";
        let totalSets = 0, totalReps = 0, totalKg = 0;
        let muscleCounts = {};

        const cleanLog = activeWorkout.exs.map(e => {
            const completedSets = e.sets.filter(set => set.d).map(set => {
                const r = parseInt(set.r) || 0;
                const w = parseFloat(set.w) || 0;
                totalSets++; totalReps += r; totalKg += (r * w);
                const mName = e.mInfo?.main || "General";
                muscleCounts[mName] = (muscleCounts[mName] || 0) + 1;
                return { r, w, isDrop: !!set.isDrop, numDisplay: String(set.numDisplay || "") };
            });
            return { 
                n: e.n, 
                s: completedSets, 
                superset: !!e.superset,
                note: e.note || "" 
            };
        }).filter(e => e.s.length > 0);

        if (cleanLog.length === 0) { alert("No hay series completadas para guardar."); return; }

        const workoutNum = (userData.stats?.workouts || 0) + 1;
        const volumeDisplay = totalKg >= 1000 ? (totalKg / 1000).toFixed(2) + "t" : totalKg.toFixed(0) + "kg";

        // FECHAS PARA RANKING (Semana, Mes, Año)
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}_${now.getMonth()}`; 
        const currentYearKey = `${now.getFullYear()}`; 
        const currentWeekKey = getWeekNumber(now); // NUEVO

        await addDoc(collection(db, "workouts"), {
            uid: currentUser.uid, date: serverTimestamp(),
            routine: activeWorkout.name || "Rutina sin nombre",
            rpe: rpeVal, note: note, details: cleanLog,
            workoutNumber: workoutNum, sessionVolume: Number(totalKg.toFixed(2)),
            monthKey: currentMonthKey, 
            yearKey: currentYearKey,
            weekKey: currentWeekKey
        });

        const updates = {
            "stats.workouts": increment(1),
            "stats.totalSets": increment(totalSets),
            "stats.totalReps": increment(totalReps),
            "stats.totalKg": increment(totalKg),
            "prs": userData.prs || {},
            "lastWorkoutDate": serverTimestamp()
        };
        
        // Actualizaciones Temporales (Semana/Mes/Año)
        updates[`stats_week_${currentWeekKey}.kg`] = increment(totalKg);
        updates[`stats_week_${currentWeekKey}.workouts`] = increment(1);
        updates[`stats_week_${currentWeekKey}.reps`] = increment(totalReps);

        updates[`stats_month_${currentMonthKey}.kg`] = increment(totalKg);
        updates[`stats_month_${currentMonthKey}.workouts`] = increment(1);
        updates[`stats_month_${currentMonthKey}.reps`] = increment(totalReps);
        updates[`stats_month_${currentMonthKey}.sets`] = increment(totalSets);

        updates[`stats_year_${currentYearKey}.kg`] = increment(totalKg);
        updates[`stats_year_${currentYearKey}.workouts`] = increment(1);
        updates[`stats_year_${currentYearKey}.reps`] = increment(totalReps);

        for (const [muscle, count] of Object.entries(muscleCounts)) {
            updates[`muscleStats.${muscle}`] = increment(count);
        }
        await updateDoc(doc(db, "users", currentUser.uid), updates);

        showToast(`🏆 ¡Entreno nº ${workoutNum} completado! Volumen total: ${volumeDisplay}`);
        
        localStorage.removeItem('fit_active_workout');
        if (durationInt) clearInterval(durationInt);
        if (wakeLock) { await wakeLock.release(); wakeLock = null; }
        window.switchTab('routines-view');

    } catch (error) {
        console.error("Error al finalizar entrenamiento:", error);
        alert("Error crítico al guardar. Revisa tu conexión.");
    }
};

window.openProgress = async () => {
    const m = document.getElementById('modal-progress'); const s = document.getElementById('progress-select');
    s.innerHTML = '<option>Cargando datos...</option>'; 
    window.openModal('modal-progress');
    try {
        const snap = await getDocs(query(collection(db, "workouts"), where("uid", "==", currentUser.uid)));
        if (snap.empty) { s.innerHTML = '<option>Sin historial</option>'; return; }
        const history = snap.docs.map(d => d.data()).sort((a,b) => a.date - b.date);
        const uniqueExercises = new Set(); history.forEach(w => { if (w.details) w.details.forEach(ex => uniqueExercises.add(ex.n)); });
        s.innerHTML = '<option value="">-- Selecciona Ejercicio --</option>';
        Array.from(uniqueExercises).sort().forEach(exName => { const opt = document.createElement('option'); opt.value = exName; opt.innerText = exName; s.appendChild(opt); });
        window.tempHistoryCache = history;
    } catch (e) { s.innerHTML = '<option>Error cargando</option>'; }
};

window.renderProgressChart = (exName) => {
    if (!exName || !window.tempHistoryCache) return;
    const ctx = document.getElementById('progressChart'); 
    if (progressChart) progressChart.destroy();

    const labels = [];
    const volumenData = []; 
    const prData = [];      
    const rmData = []; 

    window.tempHistoryCache.forEach(w => {
        const exerciseData = w.details.find(d => d.n === exName);
        if (exerciseData) {
            let totalVolumenSesion = 0;
            let maxPesoSesion = 0;
            let bestRM = 0; 

            exerciseData.s.forEach(set => {
                const weight = parseFloat(set.w) || 0;
                const reps = parseInt(set.r) || 0;
                totalVolumenSesion += (weight * reps);
                if (weight > maxPesoSesion) maxPesoSesion = weight;
                if (reps > 0 && weight > 0) {
                    const currentRM = weight / (1.0278 - (0.0278 * reps));
                    if (currentRM > bestRM) bestRM = currentRM;
                }
            });

            if (totalVolumenSesion > 0) {
                const dateObj = new Date(w.date.seconds * 1000);
                labels.push(dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }));
                volumenData.push(totalVolumenSesion);
                prData.push(maxPesoSesion);
                rmData.push(Math.round(bestRM));
            }
        }
    });

    progressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Volumen Total (Kg)',
                    data: volumenData,
                    borderColor: '#00ff88',
                    backgroundColor: 'rgba(0, 255, 136, 0.1)',
                    yAxisID: 'y',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3
                },
                {
                    label: '1RM Est. (Fuerza Real)',
                    data: rmData,
                    borderColor: '#ffaa00', 
                    yAxisID: 'y1', 
                    tension: 0.3,
                    pointRadius: 4,
                    borderWidth: 3
                },
                {
                    label: 'PR Máximo (Kg)',
                    data: prData,
                    borderColor: '#ff3333',
                    borderDash: [5, 5],
                    yAxisID: 'y1',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear', display: true, position: 'left',
                    title: { display: true, text: 'Volumen (Kg)', color: '#00ff88' },
                    ticks: { color: '#888' }, grid: { color: '#333' }
                },
                y1: {
                    type: 'linear', display: true, position: 'right',
                    title: { display: true, text: 'Fuerza / RM (Kg)', color: '#ffaa00' },
                    ticks: { color: '#888' }, grid: { drawOnChartArea: false } 
                },
                x: { ticks: { color: '#888' }, grid: { display: false } }
            },
            plugins: { legend: { position: 'top', labels: { color: 'white', padding: 15, font: { size: 10 } } } }
        }
    });
};

window.toggleAdminMode = (mode) => {
    document.getElementById('tab-users').classList.toggle('active', mode==='users');
    document.getElementById('tab-lib').classList.toggle('active', mode==='lib');
    document.getElementById('tab-plans').classList.toggle('active', mode==='plans');
    document.getElementById('admin-users-card').classList.toggle('hidden', mode!=='users');
    document.getElementById('admin-lib-card').classList.toggle('hidden', mode!=='lib');
    document.getElementById('admin-plans-card').classList.toggle('hidden', mode!=='plans');
    if(mode==='users') window.loadAdminUsers(); if(mode==='lib') window.loadAdminLibrary(); if(mode==='plans') window.loadAdminPlans();
};

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

window.viewPlanContent = async (planName, planId) => {
    const snap = await getDoc(doc(db, "plans", planId)); if(!snap.exists()) return;
    const p = snap.data(); let html = `<ul style="padding-left:20px; margin-top:10px;">`;
    if(allRoutinesCache.length === 0) { const rSnap = await getDocs(collection(db, "routines")); rSnap.forEach(r => allRoutinesCache.push({id:r.id, ...r.data()})); }
    p.routines.forEach(rid => { const rObj = allRoutinesCache.find(x => x.id === rid); html += `<li style="margin-bottom:5px; color:#ddd;">${rObj ? rObj.name : "Rutina no encontrada"}</li>`; });
    html += `</ul>`; document.getElementById('detail-title').innerText = planName; document.getElementById('detail-content').innerHTML = html; 
    window.openModal('modal-details');
};

window.createPlan = async () => {
    const name = document.getElementById('new-plan-name').value; const checks = document.querySelectorAll('.plan-check:checked');
    if(!name || checks.length === 0) return alert("Pon un nombre y selecciona rutinas");
    await addDoc(collection(db, "plans"), { name: name, routines: Array.from(checks).map(c => c.value), createdBy: currentUser.uid });
    alert("Plan Creado"); document.getElementById('new-plan-name').value = ''; window.loadAdminPlans();
};

window.deletePlan = async (id) => { if(confirm("¿Borrar plan?")) { await deleteDoc(doc(db, "plans", id)); window.loadAdminPlans(); } };

window.openAssignPlanModal = async (planId) => {
    selectedPlanForMassAssign = planId; const list = document.getElementById('assign-users-list');
    window.openModal('modal-assign-plan');
    try {
        const snap = await getDoc(doc(db, "plans", planId)); if (snap.exists()) document.getElementById('assign-plan-title').innerText = `Asignar "${snap.data().name}" a:`;
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
    if(!selectedPlanForMassAssign) return; const checks = document.querySelectorAll('.user-mass-check:checked');
    if(checks.length === 0) return alert("Selecciona al menos un atleta.");
    const userIds = Array.from(checks).map(c => c.value); const btn = document.querySelector('#modal-assign-plan .btn'); btn.innerText = "ENVIANDO...";
    try {
        const planSnap = await getDoc(doc(db, "plans", selectedPlanForMassAssign));
        const promises = planSnap.data().routines.map(rid => updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(...userIds) }));
        await Promise.all(promises); alert(`✅ Plan asignado.`); window.closeModal('modal-assign-plan');
    } catch(e) { alert("Error: " + e.message); } finally { btn.innerText = "✅ ENVIAR A SELECCIONADOS"; }
};

// --- LISTA DE ATLETAS (Con Punto Verde 🟢) ---
window.loadAdminUsers = async () => {
    const l = document.getElementById('admin-list'); l.innerHTML = '↻ Cargando...';
    try {
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const s = await getDocs(q); l.innerHTML = '';
        
        // Ordenar: más recientes primero
        const usersList = s.docs.map(d => ({id: d.id, ...d.data()}));
        usersList.sort((a, b) => {
            const dateA = a.lastWorkoutDate ? a.lastWorkoutDate.seconds : 0;
            const dateB = b.lastWorkoutDate ? b.lastWorkoutDate.seconds : 0;
            return dateB - dateA;
        });

        usersList.forEach(u => {
            const avatarHtml = u.photo 
                ? `<img src="${u.photo}" class="mini-avatar">` 
                : `<div class="mini-avatar-placeholder">${u.name.charAt(0).toUpperCase()}</div>`;
            
            let rowClass = "admin-user-row";
            if(u.id === currentUser.uid) rowClass += " is-me"; 
            if(u.role === 'assistant') rowClass += " is-coach";

            let activeStatus = "";
            if (u.lastWorkoutDate) {
                const last = u.lastWorkoutDate.toDate();
                const today = new Date();
                const isToday = last.getDate() === today.getDate() && 
                                last.getMonth() === today.getMonth() && 
                                last.getFullYear() === today.getFullYear();
                
                if (isToday) {
                    const timeStr = last.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    activeStatus = `<span style="color:#00ff88; font-size:0.75rem; margin-left:6px; font-weight:bold; background:rgba(0,255,136,0.1); padding:2px 5px; border-radius:4px;">🟢 ${timeStr}</span>`;
                }
            }

            const div = document.createElement('div'); 
            div.className = rowClass;
            div.innerHTML=`
                ${avatarHtml}
                <div style="overflow:hidden;">
                    <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:white; display:flex; align-items:center;">
                        ${u.name} ${u.role === 'assistant' ? '🛡️' : ''} ${activeStatus}
                    </div>
                    <div style="font-size:0.75rem; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${u.email}
                    </div>
                </div>
                <button class="btn-outline btn-small" style="margin:0; border-color:#444; color:#ccc;">⚙️</button>
            `;
            div.onclick = () => openCoachView(u.id, u); 
            l.appendChild(div);
        });
    } catch (e) { l.innerHTML = 'Error de permisos.'; }
};

window.loadAdminLibrary = async () => {
    const l = document.getElementById('admin-lib-list'); l.innerHTML = '↻ Cargando...';
    try {
        const uSnap = await getDocs(collection(db, "users")); const userMap = {}; uSnap.forEach(u => userMap[u.id] = u.data().name);
        const s = await getDocs(collection(db, "routines")); l.innerHTML = '';
        s.forEach(d => {
            const r = d.data(); const div = document.createElement('div'); div.className = "assigned-routine-item";
            let author = r.uid === currentUser.uid ? "Mía (Admin)" : (userMap[r.uid] || "Admin");
            div.innerHTML = `<div style="flex:1;"><b>${r.name}</b><br><span style="font-size:0.7rem; color:#666;">Creado por: ${author}</span></div><div style="display:flex; gap:10px;"><button class="btn-small btn-outline" onclick="viewRoutineContent('${r.name}','${encodeURIComponent(JSON.stringify(r.exercises))}')">👁️</button><button class="btn-small btn-danger" onclick="delRoutine('${d.id}')">🗑️</button></div>`;
            l.appendChild(div);
        });
    } catch (e) { l.innerHTML = 'Error.'; }
};

window.viewRoutineContent = (name, dataStr) => {
    const exs = JSON.parse(decodeURIComponent(dataStr)).map(e => typeof e === 'string' ? e : e.n); 
    let html = `<ul style="padding-left:20px; margin-top:10px;">`; exs.forEach(e => html += `<li style="margin-bottom:5px;">${e}</li>`); html += `</ul>`;
    document.getElementById('detail-title').innerText = name; document.getElementById('detail-content').innerHTML = html; 
    window.openModal('modal-details');
};

window.openVideo = (url) => {
    if (!url) return;
    let embedUrl = url.includes("watch?v=") ? url.replace("watch?v=", "embed/") : url.replace("youtu.be/", "youtube.com/embed/");
    document.getElementById('youtube-frame').src = embedUrl + "?autoplay=1&rel=0"; 
    window.openModal('modal-video');
};

window.closeVideo = () => { window.closeModal('modal-video'); document.getElementById('youtube-frame').src = ""; };

// --- VISOR DE IMÁGENES ---
window.viewFullImage = (src) => {
    if (!src || src === window.location.href) return; // Evitar abrir si no hay imagen
    document.getElementById('full-image-src').src = src;
    window.openModal('modal-image-viewer');
};

window.approveUser = async () => {
    if(!selectedUserCoach) return;
    if(confirm("¿Aprobar atleta?")) { try { await updateDoc(doc(db, "users", selectedUserCoach), { approved: true }); alert("✅ Aprobado."); openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert("Error: " + e.message); } }
};

window.deleteUser = async () => {
    if(!selectedUserCoach) return;
    if(prompt("⚠ IRREVERSIBLE: Escribe 'BORRAR' para eliminar:") === 'BORRAR') { try { await deleteDoc(doc(db, "users", selectedUserCoach)); alert("🗑️ Eliminado."); window.loadAdminUsers(); window.switchTab('admin-view'); } catch(e) { alert("Error: " + e.message); } }
};

window.toggleUserFeature = async (feature, value) => { if(!selectedUserCoach) return; await updateDoc(doc(db, "users", selectedUserCoach), { [feature]: value }); openCoachView(selectedUserCoach, selectedUserObj); };

window.updateUserRole = async (newRole) => { if(!selectedUserCoach) return; if(confirm(`¿Cambiar rol a ${newRole}?`)) { await updateDoc(doc(db,"users",selectedUserCoach), {role: newRole}); alert("Rol actualizado"); openCoachView(selectedUserCoach, selectedUserObj); } };

window.assignToAssistant = async (assistantId) => { if(!selectedUserCoach) return; await updateDoc(doc(db,"users",selectedUserCoach), {assignedCoach: assistantId}); alert("Atleta reasignado"); openCoachView(selectedUserCoach, selectedUserObj); };

window.goToCreateRoutine = () => { window.switchTab('routines-view'); window.openEditor(); };

window.filterCoachRoutines = (text) => {
    const s = document.getElementById('coach-routine-select'); s.innerHTML = ''; const term = normalizeText(text);
    const filtered = allRoutinesCache.filter(r => normalizeText(r.name).includes(term));
    if(filtered.length === 0) s.innerHTML = '<option value="">No encontrada</option>'; 
    else filtered.forEach(r => { const o = document.createElement('option'); o.value = r.id; o.innerText = r.name; s.appendChild(o); });
};

window.assignRoutine = async () => {
    const rid = document.getElementById('coach-routine-select').value; if(!rid || rid === "") return alert("❌ Selecciona una rutina.");
    try { await updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(selectedUserCoach) }); alert("✅ Asignada"); openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert("Error: " + e.message); }
};

window.assignPlan = async () => {
    const planId = document.getElementById('coach-plan-select').value; if(!planId) return alert("Selecciona un plan.");
    try {
        const planSnap = await getDoc(doc(db, "plans", planId));
        const promises = planSnap.data().routines.map(rid => updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(selectedUserCoach) }));
        await Promise.all(promises); alert("✅ Plan asignado."); openCoachView(selectedUserCoach, selectedUserObj);
    } catch(e) { alert("Error: " + e.message); }
};

window.unassignRoutine = async (rid) => { if(confirm("¿Quitar rutina?")) { await updateDoc(doc(db, "routines", rid), { assignedTo: arrayRemove(selectedUserCoach) }); openCoachView(selectedUserCoach, selectedUserObj); } };

document.getElementById('btn-register').onclick=async()=>{
    const secretCode = document.getElementById('reg-code').value;
    try{ 
        const c=await createUserWithEmailAndPassword(auth,document.getElementById('reg-email').value,document.getElementById('reg-pass').value);
        await setDoc(doc(db,"users",c.user.uid),{
            name:document.getElementById('reg-name').value, email:document.getElementById('reg-email').value, secretCode: secretCode, approved: false, role: 'athlete', 
            gender:document.getElementById('reg-gender').value, age:parseInt(document.getElementById('reg-age').value), height:parseInt(document.getElementById('reg-height').value), 
            weightHistory: [], measureHistory: [], skinfoldHistory: [], bioHistory: [], prs: {}, stats: {workouts:0, totalKg:0, totalSets:0, totalReps:0}, muscleStats: {}, joined: serverTimestamp(), showVideos: false, showBio: false
        });
    }catch(e){alert("Error: " + e.message);}
};
document.getElementById('btn-login').onclick=()=>signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value).catch(e=>alert(e.message));
