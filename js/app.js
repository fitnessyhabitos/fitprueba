import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Iniciada (v10.0 - FINAL PRODUCTION)...");

// --- 1. CONFIGURACIÓN ---
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

// --- 2. ESTADO GLOBAL ---
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
let announcementsUnsubscribe = null;

// Filtros y Gráficas
let rankFilterTime = 'all'; let rankFilterGender = 'all'; let rankFilterCat = 'kg';       
let chartInstance = null; let progressChart = null; let fatChartInstance = null; let bioChartInstance = null; let measureChartInstance = null; let coachFatChart = null; let coachBioChart = null; let coachMeasureChart = null; let radarChartInstance = null; let coachChart = null; let userRadarChart = null; let coachRadarChart = null;

// Variables Admin / Editor
let selectedUserCoach = null; 
let selectedUserObj = null; 
let editingRoutineId = null; 
let currentPose = 'front'; 
let coachCurrentPose = 'front'; 
let allRoutinesCache = []; 
let assistantsCache = [];
let currentRoutineSelections = [];
// Hacer accesible globalmente para inputs inline
window.currentRoutineSelections = currentRoutineSelections; 
let swapTargetIndex = null; 
let alertTargetUid = null; 

// Variables Asignación
let selectedPlanForMassAssign = null; 
let selectedRoutineForMassAssign = null;
let selectedAnnouncementForAssign = null;
let assignMode = 'plan'; 


// --- 3. UTILIDADES Y HELPERS (GLOBALES) ---
window.showToast = (msg) => { 
    const container = document.getElementById('toast-container') || createToastContainer(); 
    const t = document.createElement('div'); t.className = 'toast-msg'; t.innerText = msg; 
    container.appendChild(t); 
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000); 
};

function createToastContainer() { 
    const div = document.createElement('div'); div.id = 'toast-container'; 
    document.body.appendChild(div); return div; 
}

const normalizeText = (text) => {
    if(!text) return "";
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};
// Exponer para uso en HTML si fuera necesario
window.normalizeText = normalizeText;

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return d.getUTCFullYear() + "_W" + weekNo;
}

window.toggleElement = (id) => {
    const el = document.getElementById(id);
    if(el) el.classList.toggle('hidden');
};

// --- 4. INYECCIÓN DE UI (CSS + HTML NUEVO) ---
function injectAppUI() {
    // A. CSS
    const style = document.createElement('style');
    style.textContent = `
        /* Modal Avisos */
        .announcement-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s; backdrop-filter: blur(5px); }
        .announcement-modal.active { opacity: 1; pointer-events: auto; }
        .announcement-content { background: #1a1a1a; width: 90%; max-width: 400px; border-radius: 16px; padding: 25px; text-align: center; position: relative; border: 1px solid var(--accent-color); box-shadow: 0 0 30px rgba(0,0,0,0.8); max-height: 85vh; overflow-y: auto; }
        .announcement-close { position: absolute; top: 10px; right: 15px; background: none; border: none; color: #fff; font-size: 1.5rem; cursor: pointer; z-index: 2; }
        .announcement-img { width: 100%; border-radius: 8px; margin-top: 15px; max-height: 300px; object-fit: contain; background: #000; }
        .announcement-btn { background: var(--accent-color); color: #000; padding: 12px 24px; border-radius: 50px; text-decoration: none; font-weight: bold; display: inline-block; margin-top: 20px; width: 100%; box-sizing: border-box; }

        /* Modal Creador Avisos (Admin) */
        .alert-creator-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 10001; display: none; align-items: center; justify-content: center; }
        .alert-creator-modal.active { display: flex; }
        .alert-box { background: #222; padding: 20px; width: 90%; max-width: 400px; border-radius: 12px; border: 1px solid #444; }
        .alert-input { width: 100%; background: #000; border: 1px solid #444; color: white; padding: 10px; margin-bottom: 10px; border-radius: 6px; box-sizing: border-box; }

        /* Botones Especiales */
        .btn-alert-global { width: 100%; background: #ffaa00; color: #000; font-weight: bold; padding: 10px; margin-bottom: 15px; border-radius: 8px; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
        .btn-icon-alert { background: #331100; border: 1px solid #ffaa00; color: #ffaa00; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: 5px; }
        .telegram-btn-profile { background: var(--accent-color); color: #000; border: none; padding: 10px 24px; border-radius: 50px; font-weight: bold; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); transition: transform 0.1s; }
        .telegram-btn-profile:active { transform: scale(0.95); }

        /* Librería Compacta */
        .library-item-compact { display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; padding: 10px 12px; margin-bottom: 8px; border-radius: 8px; border-left: 3px solid var(--accent-color); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
        .library-info { flex: 1; padding-right: 10px; overflow: hidden; }
        .library-title { font-weight: bold; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: white; }
        .library-sub { font-size: 0.7rem; color: #888; }
        .library-actions { display: flex; gap: 4px; flex-shrink: 0; }
        .btn-icon-lib { background: #222; border: 1px solid #444; color: #ccc; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; padding: 0; }
        .btn-icon-lib.primary { border-color: var(--accent-color); color: var(--accent-color); }
        .btn-icon-lib.danger { border-color: #f55; color: #f55; }
        
        /* Editor Rutinas: Cards Rojas Activas */
        .selected-red-active { background: rgba(50, 10, 10, 0.95); border-left: 4px solid var(--accent-color); border: 1px solid var(--accent-color); padding: 10px; margin-bottom: 5px; border-radius: 8px; display: flex; flex-direction: column; align-items: stretch; }
    `;
    document.head.appendChild(style);

    // B. HTML Modales
    if (!document.getElementById('modal-announcement')) {
        const modalHTML = `
            <div id="modal-announcement" class="announcement-modal">
                <div class="announcement-content">
                    <button class="announcement-close" onclick="window.closeAnnouncement()">✕</button>
                    <h2 id="ann-title" style="color:var(--accent-color); margin-bottom:10px; font-size:1.5rem;"></h2>
                    <div id="ann-text" style="color:#ddd; line-height:1.6; font-size:0.95rem;"></div>
                    <img id="ann-img" class="announcement-img" style="display:none;">
                    <a id="ann-link" class="announcement-btn" href="#" target="_blank" style="display:none;">VER MÁS</a>
                </div>
            </div>
            <div id="modal-alert-creator" class="alert-creator-modal">
                <div class="alert-box">
                    <h3 style="color:#fff; margin-bottom:15px;">📢 Crear Aviso <span id="alert-target-label"></span></h3>
                    <input type="text" id="alert-title" class="alert-input" placeholder="Título">
                    <textarea id="alert-msg" class="alert-input" style="height:80px;" placeholder="Mensaje..."></textarea>
                    <div style="background:#000; padding:10px; border-radius:6px; margin-bottom:10px; border:1px dashed #666;">
                        <label style="color:#aaa; font-size:0.8rem;">📷 Imagen/QR:</label>
                        <input type="file" id="alert-file" accept="image/*" style="color:white; margin-top:5px; width:100%;">
                    </div>
                    <input type="text" id="alert-link" class="alert-input" placeholder="Link Botón">
                    <input type="text" id="alert-btn-text" class="alert-input" placeholder="Texto Botón">
                    <button onclick="window.sendAlert()" id="btn-send-alert" class="btn" style="width:100%;">ENVIAR</button>
                    <button onclick="document.getElementById('modal-alert-creator').classList.remove('active')" class="btn-outline" style="width:100%; margin-top:10px;">CANCELAR</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    // C. Campos Telegram
    injectTelegramUI();
}

function injectTelegramUI() {
    const regForm = document.getElementById('register-form');
    const regEmail = document.getElementById('reg-email');
    if (regForm && regEmail && !document.getElementById('reg-telegram')) {
        const input = document.createElement('input');
        input.type = 'text'; input.id = 'reg-telegram'; input.placeholder = 'Usuario Telegram'; input.style.marginBottom = '10px';
        regEmail.parentNode.insertBefore(input, regEmail);
    }

    const restInput = document.getElementById('cfg-rest-time');
    if (restInput && !document.getElementById('cfg-telegram')) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = "width: 100%; margin-top: 25px; margin-bottom: 25px; text-align: center; border-top: 1px solid #222; padding-top: 15px;"; 
        wrapper.innerHTML = `
            <label style="display:block; margin-bottom:8px; font-size:0.85rem; color:#aaa; font-weight:bold;">📸 Tu Usuario Telegram</label>
            <input type="text" id="cfg-telegram" placeholder="@usuario" style="width: 70%; max-width: 250px; margin: 0 auto 15px auto; background: #111; border: 1px solid #444; color: white; padding: 10px; border-radius: 8px; text-align: center; display:block;">
            <button onclick="window.contactCoach()" class="telegram-btn-profile"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 11.944 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg> Contactar Coach</button>
        `;
        const parent = restInput.parentElement; 
        if (parent) parent.insertAdjacentElement('afterend', wrapper);
    }
}

document.addEventListener('DOMContentLoaded', injectAppUI);
setTimeout(injectAppUI, 1000); 

// --- 5. FUNCIONES GLOBALES (TODAS EN WINDOW) ---

window.openAlertModal = (uid = null) => {
    alertTargetUid = uid;
    const label = document.getElementById('alert-target-label');
    if (uid) label.innerText = "(A Usuario)"; else label.innerText = "(A TODOS)";
    document.getElementById('alert-title').value = "";
    document.getElementById('alert-msg').value = "";
    document.getElementById('alert-link').value = "";
    document.getElementById('alert-btn-text').value = "";
    document.getElementById('alert-file').value = "";
    document.getElementById('modal-alert-creator').classList.add('active');
};

window.sendAlert = async () => {
    const title = document.getElementById('alert-title').value;
    const content = document.getElementById('alert-msg').value;
    const link = document.getElementById('alert-link').value;
    const linkText = document.getElementById('alert-btn-text').value || "VER MÁS";
    const fileInp = document.getElementById('alert-file');
    
    if (!title || !content) return alert("Faltan datos");
    
    const btn = document.getElementById('btn-send-alert');
    btn.innerText = "ENVIANDO..."; btn.disabled = true;

    try {
        let imageUrl = "";
        if (fileInp.files[0]) {
            const file = fileInp.files[0];
            const storagePath = `alerts/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, storagePath);
            await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(storageRef);
        }

        let assignedTo = [];
        if (alertTargetUid) {
            assignedTo.push(alertTargetUid);
        } else {
            const q = query(collection(db, "users"), where("role", "==", "athlete"));
            const snap = await getDocs(q);
            snap.forEach(doc => assignedTo.push(doc.id));
        }

        await addDoc(collection(db, "announcements"), {
            title, content, link, linkText, imageUrl,
            active: true, createdAt: serverTimestamp(), assignedTo: assignedTo
        });

        alert("✅ Aviso enviado");
        document.getElementById('modal-alert-creator').classList.remove('active');
    } catch (e) { alert("Error: " + e.message); } 
    finally { btn.innerText = "ENVIAR AVISO"; btn.disabled = false; }
};

window.loadProfile = async () => {
    if(!userData) return;
    document.getElementById('profile-name').innerText = userData.name;
    if(userData.photo) { document.getElementById('avatar-text').style.display='none'; document.getElementById('avatar-img').src = userData.photo; document.getElementById('avatar-img').style.display='block'; }
    updatePhotoDisplay(userData);
    
    if(!userData.photo) {
        const header = document.querySelector('.profile-header');
        if(header && !document.getElementById('photo-nudge')) {
             const nudge = document.createElement('div');
             nudge.id = 'photo-nudge'; nudge.className = 'tip-box'; nudge.style.marginTop = '10px';
             nudge.innerHTML = '📸 ¡Sube una foto para que tu Coach te reconozca mejor!';
             header.parentNode.insertBefore(nudge, header.nextSibling);
        }
    } else {
        const nudge = document.getElementById('photo-nudge');
        if(nudge) nudge.remove();
    }

    if(userData.showBio) document.getElementById('user-bio-section').classList.remove('hidden'); else document.getElementById('user-bio-section').classList.add('hidden');
    if(userData.dietFile) document.getElementById('btn-diet-view').classList.remove('hidden'); else document.getElementById('btn-diet-view').classList.add('hidden');
    if(userData.telegram) { const tInput = document.getElementById('cfg-telegram'); if(tInput) tInput.value = userData.telegram; }

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
    
    renderMuscleRadar('userMuscleChart', userData.muscleStats || {});
    
    // Skinfolds & Measures
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
};

window.switchTab = (t) => {
    document.querySelectorAll('.view-container').forEach(e => e.classList.remove('active'));
    document.getElementById(t).classList.add('active');
    document.getElementById('main-container').scrollTop = 0;
    document.querySelectorAll('.top-nav-item').forEach(n => n.classList.remove('active'));
    if (t === 'routines-view') document.getElementById('top-btn-routines').classList.add('active');
    if (t === 'profile-view') {
        document.getElementById('top-btn-profile').classList.add('active');
        if(typeof window.loadProfile === 'function') window.loadProfile(); 
    }
    if (t === 'admin-view' || t === 'coach-detail-view') {
        document.getElementById('top-btn-coach').classList.add('active');
    }
};

window.closeAnnouncement = (id) => {
    document.getElementById('modal-announcement').classList.remove('active');
    if(id) { localStorage.setItem(`announcement_dismissed_${id}`, 'true'); }
};

window.contactCoach = () => {
    showToast("💬 Abriendo chat... Te responderemos lo antes posible.");
    setTimeout(() => { window.open("https://t.me/fityhab", "_blank"); }, 1000);
};

window.saveConfig = async () => { 
    const rt = document.getElementById('cfg-rest-time').value; 
    const tg = document.getElementById('cfg-telegram')?.value || "";
    await updateDoc(doc(db,"users",currentUser.uid), { restTime: parseInt(rt), telegram: tg }); 
    userData.restTime = parseInt(rt); 
    userData.telegram = tg;
    alert("Ajustes Guardados"); 
};

window.savePhotoReminder = async () => { const d = document.getElementById('photo-day').value; const t = document.getElementById('photo-time').value; await updateDoc(doc(db,"users",currentUser.uid), { photoDay:d, photoTime:t }); userData.photoDay = d; userData.photoTime = t; alert("Alarma Guardada"); };
window.addWeightEntry = async () => { const wStr = prompt("Introduce tu peso (kg):"); if(!wStr) return; const w = parseFloat(wStr.replace(',','.')); if(isNaN(w)) return alert("Número inválido"); let history = userData.weightHistory || []; history.push(w); try { await updateDoc(doc(db,"users",currentUser.uid), {weightHistory: history}); userData.weightHistory = history; window.loadProfile(); alert("✅ Peso Guardado"); } catch(e) { alert("Error al guardar: " + e.message); } };

window.cancelWorkout = () => { if(confirm("⚠ ¿SEGURO QUE QUIERES CANCELAR?\nSe perderán los datos de este entrenamiento.")) { activeWorkout = null; localStorage.removeItem('fit_active_workout'); if(durationInt) clearInterval(durationInt); window.switchTab('routines-view'); } };

// --- AUDIO ENGINE ---
window.initAudioEngine = function() {
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
            navigator.mediaSession.setActionHandler('pause', () => { navigator.mediaSession.playbackState = "paused"; });
            navigator.mediaSession.setActionHandler('previoustrack', () => window.addRestTime(-10));
            navigator.mediaSession.setActionHandler('nexttrack', () => window.addRestTime(10));
        }
    }).catch(e => console.log("Esperando interacción..."));
}

window.playTickSound = function(isFinal = false) {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = isFinal ? 600 : 1000; osc.type = isFinal ? 'square' : 'sine';
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    osc.start(now);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal?0.8:0.1));
    osc.stop(now + (isFinal?0.8:0.1));
    if("vibrate" in navigator) navigator.vibrate(isFinal ? [500] : [50]);
}

window.testSound = () => { window.playTickSound(false); setTimeout(() => window.playTickSound(true), 500); };
document.body.addEventListener('touchstart', window.initAudioEngine, {once:true});
document.body.addEventListener('click', window.initAudioEngine, {once:true});

// --- AUTH ---
onAuthStateChanged(auth, async (user) => {
    if(user) {
        currentUser = user;
        const snap = await getDoc(doc(db,"users",user.uid));
        if(snap.exists()){
            userData = snap.data();
            checkPhotoVisualReminder();
            initCommunityListener();
            checkPhotoReminder();
            injectAppUI();
            initAnnouncementsListener();
            
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
                    window.switchTab('workout-view');
                    startTimerMini();
                } else { window.switchTab('routines-view'); }
            } else { alert("Cuenta en revisión."); signOut(auth); }
        }
    } else {
        setTimeout(() => { document.getElementById('loading-screen').classList.add('hidden'); }, 1500);
        window.switchTab('auth-view');
        document.getElementById('main-header').classList.add('hidden');
        if(communityUnsubscribe) communityUnsubscribe();
        if(announcementsUnsubscribe) announcementsUnsubscribe();
        injectAppUI();
    }
});

// --- LÓGICA DE RUTINAS Y ENTRENAMIENTO ---
function initAnnouncementsListener() {
    if(announcementsUnsubscribe) announcementsUnsubscribe();
    const q = query(collection(db, "announcements"), where("assignedTo", "array-contains", currentUser.uid), where("active", "==", true));
    announcementsUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const ann = change.doc.data();
                const annId = change.doc.id;
                const isDismissed = localStorage.getItem(`announcement_dismissed_${annId}`);
                if (!isDismissed) { window.showAnnouncementModal(ann, annId); }
            }
        });
    });
}

window.showAnnouncementModal = (ann, id) => {
    document.getElementById('ann-title').innerText = ann.title;
    document.getElementById('ann-text').innerHTML = ann.content.replace(/\n/g, '<br>');
    const imgEl = document.getElementById('ann-img');
    if (ann.imageUrl) { imgEl.src = ann.imageUrl; imgEl.style.display = 'block'; } else { imgEl.style.display = 'none'; }
    const linkEl = document.getElementById('ann-link');
    if (ann.link) { linkEl.href = ann.link; linkEl.style.display = 'inline-block'; linkEl.innerText = ann.linkText || "VER AHORA"; } else { linkEl.style.display = 'none'; }
    document.querySelector('.announcement-close').onclick = () => window.closeAnnouncement(id);
    document.getElementById('modal-announcement').classList.add('active');
};

window.startWorkout = async (rid) => {
    if(document.getElementById('cfg-wake').checked && 'wakeLock' in navigator) try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){}
    try {
        const snap = await getDoc(doc(db,"routines",rid)); const r = snap.data();
        let lastWorkoutData = null; const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid)); const wSnap = await getDocs(q); const sameRoutine = wSnap.docs.map(d=>d.data()).filter(d => d.routine === r.name).sort((a,b) => b.date - a.date); if(sameRoutine.length > 0) lastWorkoutData = sameRoutine[0].details;
        const now = Date.now();
        if(htmlAudioElement) { htmlAudioElement.play().then(() => { htmlAudioElement.pause(); }).catch(e => {}); } 
        activeWorkout = { name: r.name, startTime: now, exs: r.exercises.map(exObj => {
                const isString = typeof exObj === 'string'; const name = isString ? exObj : exObj.n; const isSuperset = isString ? false : (exObj.s || false); const customSeriesNum = isString ? 5 : (parseInt(exObj.series) || 5); const customRepsPattern = isString ? "20-16-16-16-16" : (exObj.reps || "20-16-16-16-16"); const repsArray = customRepsPattern.split('-'); const data = getExerciseData(name);
                let sets = Array(customSeriesNum).fill().map((_, i) => ({ r: repsArray[i] ? parseInt(repsArray[i]) : parseInt(repsArray[repsArray.length - 1]), w: 0, d: false, prev: '-', numDisplay: (i + 1).toString() }));
                if(lastWorkoutData) { const prevEx = lastWorkoutData.find(ld => ld.n === name); if(prevEx && prevEx.s) { sets = sets.map((s, i) => { if(prevEx.s[i]) { const dLabel = prevEx.s[i].isDrop ? ' (D)' : ''; s.prev = `${prevEx.s[i].r}x${prevEx.s[i].w}kg${dLabel}`; } return s; }); } }
                return { n:name, img:data.img, mInfo: data.mInfo, type: data.type, video: data.v, sets: sets, superset: isSuperset, note: "" }; 
            })
        };
        localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout));
        renderWorkout(); window.switchTab('workout-view'); startTimerMini();
    } catch(e) { console.error(e); alert("Error iniciando entreno: " + e.message); }
};

window.addSet = (exIdx) => { const sets = activeWorkout.exs[exIdx].sets; sets.push({r:16, w:0, d:false, prev:'-', numDisplay: (sets.length + 1).toString()}); localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); renderWorkout(); };
window.removeSet = (exIdx) => { if(activeWorkout.exs[exIdx].sets.length > 1) { activeWorkout.exs[exIdx].sets.pop(); localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); renderWorkout(); } };
window.toggleAllSets = (exIdx) => { const ex = activeWorkout.exs[exIdx]; const allDone = ex.sets.every(s => s.d); const newState = !allDone; ex.sets.forEach(s => { s.d = newState; }); localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); renderWorkout(); if(newState) showToast("✅ Todas las series completadas"); };

window.uS = (i,j,k,v) => { activeWorkout.exs[i].sets[j][k]=v; localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); };
window.tS = async (i, j) => { 
    const s = activeWorkout.exs[i].sets[j]; const exerciseName = activeWorkout.exs[i].n; s.d = !s.d; 
    if(s.d) { 
        const weight = parseFloat(s.w) || 0; const reps = parseInt(s.r) || 0;
        if (weight > 0 && reps > 0) {
            const estimated1RM = Math.round(weight / (1.0278 - (0.0278 * reps)));
            if (!userData.rmRecords) userData.rmRecords = {}; const currentRecord = userData.rmRecords[exerciseName] || 0;
            if (estimated1RM > currentRecord) { userData.rmRecords[exerciseName] = estimated1RM; updateDoc(doc(db, "users", currentUser.uid), { [`rmRecords.${exerciseName}`]: estimated1RM }); showToast(`🔥 ¡NUEVO NIVEL DE FUERZA!<br>1RM Est: <b>${estimated1RM}kg</b> en ${exerciseName}`); } 
            else { const currentWeightPR = userData.prs ? (userData.prs[exerciseName] || 0) : 0; if (weight > currentWeightPR) { if(!userData.prs) userData.prs = {}; userData.prs[exerciseName] = weight; const newPrCount = (userData.stats.prCount || 0) + 1; updateDoc(doc(db, "users", currentUser.uid), { [`prs.${exerciseName}`]: weight, "stats.prCount": newPrCount }); userData.stats.prCount = newPrCount; showToast(`💪 Peso Máximo Superado: ${weight}kg`); } }
        }
        openRest(); 
    } 
    localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); renderWorkout();
};

window.addDropset = (exIdx, setIdx) => { const currentSet = activeWorkout.exs[exIdx].sets[setIdx]; currentSet.d = true; const newSet = { r: Math.floor(currentSet.r * 0.8) || 10, w: Math.floor(currentSet.w * 0.7) || 0, d: false, prev: 'DROPSET', isDrop: true, numDisplay: (parseInt(currentSet.numDisplay) || (setIdx + 1)) + ".5" }; activeWorkout.exs[exIdx].sets.splice(setIdx + 1, 0, newSet); localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); renderWorkout(); showToast(`💧 Serie ${newSet.numDisplay} añadida`); };

// --- ADMIN USERS (CON BOTONES DE AVISO) ---
window.loadAdminUsers = async () => {
    const l = document.getElementById('admin-list'); l.innerHTML = '↻ Cargando...';
    try {
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const s = await getDocs(q); l.innerHTML = '';
        
        const globalBtn = document.createElement('button');
        globalBtn.className = 'btn-alert-global';
        globalBtn.innerHTML = `⚠️ ENVIAR AVISO A TODOS`;
        globalBtn.onclick = () => window.openAlertModal(null);
        l.appendChild(globalBtn);

        const usersList = s.docs.map(d => ({id: d.id, ...d.data()}));
        usersList.sort((a, b) => {
            const dateA = a.lastWorkoutDate ? a.lastWorkoutDate.seconds : 0;
            const dateB = b.lastWorkoutDate ? b.lastWorkoutDate.seconds : 0;
            return dateB - dateA;
        });

        usersList.forEach(u => {
            const avatarHtml = u.photo ? `<img src="${u.photo}" class="mini-avatar">` : `<div class="mini-avatar-placeholder">${u.name.charAt(0).toUpperCase()}</div>`;
            let rowClass = "admin-user-row";
            if(u.id === currentUser.uid) rowClass += " is-me"; 
            if(u.role === 'assistant') rowClass += " is-coach";

            let activeStatus = "";
            if (u.lastWorkoutDate) {
                const last = u.lastWorkoutDate.toDate();
                const today = new Date();
                const isToday = last.getDate() === today.getDate() && last.getMonth() === today.getMonth() && last.getFullYear() === today.getFullYear();
                if (isToday) {
                    const timeStr = last.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    activeStatus = `<span style="color:#00ff88; font-size:0.75rem; margin-left:6px; font-weight:bold; background:rgba(0,255,136,0.1); padding:2px 5px; border-radius:4px;">🟢 ${timeStr}</span>`;
                }
            }

            const div = document.createElement('div'); 
            div.className = rowClass;
            div.innerHTML=`
                ${avatarHtml}
                <div style="overflow:hidden; flex:1;">
                    <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:white; display:flex; align-items:center;">
                        ${u.name} ${u.role === 'assistant' ? '🛡️' : ''} ${activeStatus}
                    </div>
                    <div style="font-size:0.75rem; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.email}</div>
                </div>
                <div style="display:flex; align-items:center;">
                    <button class="btn-icon-alert" onclick="event.stopPropagation(); window.openAlertModal('${u.id}')">⚠️</button>
                    <button class="btn-outline btn-small" style="margin:0; margin-left:5px; border-color:#444; color:#ccc;">⚙️</button>
                </div>
            `;
            div.onclick = (e) => { if(e.target.tagName !== 'BUTTON') openCoachView(u.id, u); };
            l.appendChild(div);
        });
    } catch (e) { l.innerHTML = 'Error de permisos o conexión.'; console.log(e); }
};

window.loadAdminLibrary = async () => {
    const l = document.getElementById('admin-lib-list'); l.innerHTML = '↻ Cargando...';
    try {
        const uSnap = await getDocs(collection(db, "users")); const userMap = {}; uSnap.forEach(u => userMap[u.id] = u.data().name);
        const s = await getDocs(collection(db, "routines")); l.innerHTML = '';
        
        const createBtn = document.createElement('button');
        createBtn.className = 'btn';
        createBtn.style.cssText = "width:100%; margin-bottom:15px; background:var(--accent-color); color:black; font-weight:bold;";
        createBtn.innerText = "+ CREAR NUEVA RUTINA";
        createBtn.onclick = () => { window.openEditor(); };
        l.appendChild(createBtn);

        s.forEach(d => {
            const r = d.data(); 
            const div = document.createElement('div'); 
            div.className = "library-item-compact";
            let author = r.uid === currentUser.uid ? "Mía" : (userMap[r.uid] || "Admin");
            
            div.innerHTML = `
                <div class="library-info">
                    <div class="library-title">${r.name}</div>
                    <div class="library-sub">${author} • ${r.exercises.length} Ex</div>
                </div>
                <div class="library-actions">
                    <button class="btn-icon-lib" onclick="window.cloneRoutine('${d.id}')" title="Clonar">🖨</button>
                    <button class="btn-icon-lib primary" onclick="window.openEditor('${d.id}')" title="Editar">✏️</button>
                    <button class="btn-icon-lib" onclick="window.initMassAssignRoutine('${d.id}')" title="Enviar">📤</button>
                    <button class="btn-icon-lib" onclick="viewRoutineContent('${r.name}','${encodeURIComponent(JSON.stringify(r.exercises))}')" title="Ver">👁️</button>
                    <button class="btn-icon-lib danger" onclick="delRoutine('${d.id}')" title="Borrar">🗑️</button>
                </div>`;
            l.appendChild(div);
        });
    } catch (e) { l.innerHTML = 'Error.'; }
};

// ... Resto de asignaciones window. para evitar ReferenceErrors ...
window.toggleAdminMode = (mode) => { document.getElementById('tab-users').classList.toggle('active', mode==='users'); document.getElementById('tab-lib').classList.toggle('active', mode==='lib'); document.getElementById('tab-plans').classList.toggle('active', mode==='plans'); document.getElementById('admin-users-card').classList.toggle('hidden', mode!=='users'); document.getElementById('admin-lib-card').classList.toggle('hidden', mode!=='lib'); document.getElementById('admin-plans-card').classList.toggle('hidden', mode!=='plans'); if(mode==='users') window.loadAdminUsers(); if(mode==='lib') window.loadAdminLibrary(); if(mode==='plans') window.loadAdminPlans(); };
window.loadAdminPlans = async () => { const list = document.getElementById('admin-plans-list'); const selector = document.getElementById('plan-routine-selector'); const routinesSnap = await getDocs(collection(db, "routines")); selector.innerHTML = ''; routinesSnap.forEach(d => { const div = document.createElement('div'); div.className = "selector-item"; div.innerHTML = `<input type="checkbox" class="plan-check selector-checkbox" value="${d.id}" id="chk-${d.id}"><label for="chk-${d.id}" class="selector-label">${d.data().name}</label>`; selector.appendChild(div); }); const plansSnap = await getDocs(collection(db, "plans")); list.innerHTML = ''; if(plansSnap.empty) { list.innerHTML = "<div style='text-align:center; padding:20px; color:#666;'>No hay planes creados.</div>"; return; } const uSnap = await getDocs(collection(db, "users")); const userMap = {}; uSnap.forEach(u => userMap[u.id] = u.data().name); plansSnap.forEach(d => { const p = d.data(); const div = document.createElement('div'); div.className = "assigned-routine-item"; let author = p.createdBy === currentUser.uid ? "Mía (Admin)" : (userMap[p.createdBy] || "Admin"); div.innerHTML = `<div style="flex:1;"><b>${p.name}</b><br><span style="font-size:0.7rem; color:#666;">Creado por: ${author} • ${p.routines.length} Rutinas</span></div><div style="display:flex; gap:5px;"><button class="btn-small btn-outline" style="margin:0; width:auto; border-color:#666;" onclick="window.viewPlanContent('${p.name}', '${d.id}')">👁️</button><button class="btn-small btn" style="margin:0; width:auto;" onclick="window.openAssignPlanModal('${d.id}')">📤</button><button class="btn-small btn-danger" style="margin:0; width:auto; border:none;" onclick="window.deletePlan('${d.id}')">🗑️</button></div>`; list.appendChild(div); }); };
window.viewPlanContent = async (planName, planId) => { const snap = await getDoc(doc(db, "plans", planId)); if(!snap.exists()) return; const p = snap.data(); let html = `<ul style="padding-left:20px; margin-top:10px;">`; if(allRoutinesCache.length === 0) { const rSnap = await getDocs(collection(db, "routines")); rSnap.forEach(r => allRoutinesCache.push({id:r.id, ...r.data()})); } p.routines.forEach(rid => { const rObj = allRoutinesCache.find(x => x.id === rid); html += `<li style="margin-bottom:5px; color:#ddd;">${rObj ? rObj.name : "Rutina no encontrada"}</li>`; }); html += `</ul>`; document.getElementById('detail-title').innerText = planName; document.getElementById('detail-content').innerHTML = html; window.openModal('modal-details'); };
window.createPlan = async () => { const name = document.getElementById('new-plan-name').value; const checks = document.querySelectorAll('.plan-check:checked'); if(!name || checks.length === 0) return alert("Pon un nombre y selecciona rutinas"); await addDoc(collection(db, "plans"), { name: name, routines: Array.from(checks).map(c => c.value), createdBy: currentUser.uid }); alert("Plan Creado"); document.getElementById('new-plan-name').value = ''; window.loadAdminPlans(); };
window.deletePlan = async (id) => { if(confirm("¿Borrar plan?")) { await deleteDoc(doc(db, "plans", id)); window.loadAdminPlans(); } };
window.openAssignPlanModal = async (planId) => { assignMode = 'plan'; selectedPlanForMassAssign = planId; const list = document.getElementById('assign-users-list'); window.openModal('modal-assign-plan'); try { const snap = await getDoc(doc(db, "plans", planId)); if (snap.exists()) document.getElementById('assign-plan-title').innerText = `Asignar "${snap.data().name}" a:`; let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users"); const uSnap = await getDocs(q); list.innerHTML = ''; uSnap.forEach(d => { const u = d.data(); if (u.role === 'athlete') { const div = document.createElement('div'); div.className = "selector-item"; div.innerHTML = `<input type="checkbox" class="user-mass-check selector-checkbox" value="${d.id}" id="u-${d.id}"><label for="u-${d.id}" class="selector-label">${u.name}</label>`; list.appendChild(div); } }); } catch(e) { console.error(e); } };
window.distributePlan = async () => { const checks = document.querySelectorAll('.user-mass-check:checked'); if(checks.length === 0) return alert("Selecciona al menos un atleta."); const userIds = Array.from(checks).map(c => c.value); const btn = document.querySelector('#modal-assign-plan .btn'); btn.innerText = "ENVIANDO..."; try { if (assignMode === 'plan' && selectedPlanForMassAssign) { const planSnap = await getDoc(doc(db, "plans", selectedPlanForMassAssign)); const promises = planSnap.data().routines.map(rid => updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(...userIds) })); await Promise.all(promises); alert(`✅ Plan asignado correctamente.`); } else if (assignMode === 'routine' && selectedRoutineForMassAssign) { await updateDoc(doc(db, "routines", selectedRoutineForMassAssign), { assignedTo: arrayUnion(...userIds) }); alert(`✅ Rutina enviada correctamente.`); } else if (assignMode === 'announcement' && selectedAnnouncementForAssign) { await updateDoc(doc(db, "announcements", selectedAnnouncementForAssign), { assignedTo: arrayUnion(...userIds) }); alert(`📢 Aviso enviado a ${userIds.length} atletas.`); } window.closeModal('modal-assign-plan'); } catch(e) { alert("Error: " + e.message); } finally { btn.innerText = "✅ ENVIAR A SELECCIONADOS"; } };
window.viewRoutineContent = (name, dataStr) => { const exs = JSON.parse(decodeURIComponent(dataStr)).map(e => typeof e === 'string' ? e : e.n); let html = `<ul style="padding-left:20px; margin-top:10px;">`; exs.forEach(e => html += `<li style="margin-bottom:5px;">${e}</li>`); html += `</ul>`; document.getElementById('detail-title').innerText = name; document.getElementById('detail-content').innerHTML = html; window.openModal('modal-details'); };
window.openVideo = (url) => { if (!url) return; let embedUrl = url.includes("watch?v=") ? url.replace("watch?v=", "embed/") : url.replace("youtu.be/", "youtube.com/embed/"); document.getElementById('youtube-frame').src = embedUrl + "?autoplay=1&rel=0"; window.openModal('modal-video'); };
window.closeVideo = () => { window.closeModal('modal-video'); document.getElementById('youtube-frame').src = ""; };
window.viewFullImage = (src) => { if (!src || src === window.location.href) return; document.getElementById('full-image-src').src = src; window.openModal('modal-image-viewer'); };
window.approveUser = async () => { if(!selectedUserCoach) return; if(confirm("¿Aprobar atleta?")) { try { await updateDoc(doc(db, "users", selectedUserCoach), { approved: true }); alert("✅ Aprobado."); openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert("Error: " + e.message); } } };
window.deleteUser = async () => { if(!selectedUserCoach) return; if(prompt("⚠ IRREVERSIBLE: Escribe 'BORRAR' para eliminar:") === 'BORRAR') { try { await deleteDoc(doc(db, "users", selectedUserCoach)); alert("🗑️ Eliminado."); window.loadAdminUsers(); window.switchTab('admin-view'); } catch(e) { alert("Error: " + e.message); } } };
window.toggleUserFeature = async (feature, value) => { if(!selectedUserCoach) return; await updateDoc(doc(db, "users", selectedUserCoach), { [feature]: value }); openCoachView(selectedUserCoach, selectedUserObj); };
window.updateUserRole = async (newRole) => { if(!selectedUserCoach) return; if(confirm(`¿Cambiar rol a ${newRole}?`)) { await updateDoc(doc(db,"users",selectedUserCoach), {role: newRole}); alert("Rol actualizado"); openCoachView(selectedUserCoach, selectedUserObj); } };
window.assignToAssistant = async (assistantId) => { if(!selectedUserCoach) return; await updateDoc(doc(db,"users",selectedUserCoach), {assignedCoach: assistantId}); alert("Atleta reasignado"); openCoachView(selectedUserCoach, selectedUserObj); };
window.goToCreateRoutine = () => { window.switchTab('routines-view'); window.openEditor(); };
window.filterCoachRoutines = (text) => { const s = document.getElementById('coach-routine-select'); s.innerHTML = ''; const term = normalizeText(text); const filtered = allRoutinesCache.filter(r => normalizeText(r.name).includes(term)); if(filtered.length === 0) s.innerHTML = '<option value="">No encontrada</option>'; else filtered.forEach(r => { const o = document.createElement('option'); o.value = r.id; o.innerText = r.name; s.appendChild(o); }); };
window.assignRoutine = async () => { const rid = document.getElementById('coach-routine-select').value; if(!rid || rid === "") return alert("❌ Selecciona una rutina."); try { await updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(selectedUserCoach) }); alert("✅ Asignada"); openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert("Error: " + e.message); } };
window.assignPlan = async () => { const planId = document.getElementById('coach-plan-select').value; if(!planId) return alert("Selecciona un plan."); try { const planSnap = await getDoc(doc(db, "plans", planId)); const promises = planSnap.data().routines.map(rid => updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(selectedUserCoach) })); await Promise.all(promises); alert("✅ Plan asignado."); openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert("Error: " + e.message); } };
window.unassignRoutine = async (rid) => { if(confirm("¿Quitar rutina?")) { await updateDoc(doc(db, "routines", rid), { assignedTo: arrayRemove(selectedUserCoach) }); openCoachView(selectedUserCoach, selectedUserObj); } };
window.addRestTime = (s) => { restEndTime += (s * 1000); if(s > 0) totalRestTime += s; const now = Date.now(); const left = Math.ceil((restEndTime - now) / 1000); updateTimerVisuals(left); updateMediaSessionMetadata(totalRestTime, totalRestTime - left); };
window.initMassAssignRoutine = async (rid) => { assignMode = 'routine'; selectedRoutineForMassAssign = rid; const list = document.getElementById('assign-users-list'); window.openModal('modal-assign-plan'); try { const snap = await getDoc(doc(db, "routines", rid)); if (snap.exists()) document.getElementById('assign-plan-title').innerText = `Enviar "${snap.data().name}" a:`; let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users"); const uSnap = await getDocs(q); list.innerHTML = ''; uSnap.forEach(d => { const u = d.data(); if (u.role === 'athlete') { const div = document.createElement('div'); div.className = "selector-item"; div.innerHTML = `<input type="checkbox" class="user-mass-check selector-checkbox" value="${d.id}" id="u-${d.id}"><label for="u-${d.id}" class="selector-label">${u.name}</label>`; list.appendChild(div); } }); } catch(e) { console.error(e); } };
