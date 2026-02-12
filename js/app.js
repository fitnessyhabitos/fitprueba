import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Iniciada (v8.0 - Final Alerts & Fixes)...");

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
let announcementsUnsubscribe = null;

// Filtros Ranking
let rankFilterTime = 'all';     
let rankFilterGender = 'all';   
let rankFilterCat = 'kg';       

// Gráficas
let chartInstance = null; let progressChart = null; let fatChartInstance = null; let bioChartInstance = null; let measureChartInstance = null; let coachFatChart = null; let coachBioChart = null; let coachMeasureChart = null; let radarChartInstance = null; let coachChart = null; let userRadarChart = null; let coachRadarChart = null;

// Admin Variables
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
let alertTargetUid = null; 

// Variables de Asignación Masiva
let selectedPlanForMassAssign = null; 
let selectedRoutineForMassAssign = null;
let selectedAnnouncementForAssign = null;
let assignMode = 'plan'; 

// --- MOTOR DE AUDIO ---
const SILENT_MP3_URL = "https://raw.githubusercontent.com/anars/blank-audio/master/1-minute-of-silence.mp3";
let htmlAudioElement = new Audio(SILENT_MP3_URL);
htmlAudioElement.loop = true;
htmlAudioElement.preload = 'auto';
htmlAudioElement.volume = 1.0; 
let lastBeepSecond = -1; 

// Definición global para evitar ReferenceError
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

window.playTickSound = function(isFinal = false) {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = isFinal ? 600 : 1000; 
    osc.type = isFinal ? 'square' : 'sine';
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    osc.start(now);
    const duration = isFinal ? 0.8 : 0.1;
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.stop(now + duration);
    if("vibrate" in navigator) navigator.vibrate(isFinal ? [500] : [50]);
}

document.body.addEventListener('touchstart', window.initAudioEngine, {once:true});
document.body.addEventListener('click', window.initAudioEngine, {once:true});
window.testSound = () => { window.playTickSound(false); setTimeout(() => window.playTickSound(true), 500); };


// --- INYECCIÓN UI ---
function injectAppUI() {
    const style = document.createElement('style');
    style.textContent = `
        /* Modal Avisos (Cliente) */
        .announcement-modal {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none; transition: opacity 0.3s;
            backdrop-filter: blur(5px);
        }
        .announcement-modal.active { opacity: 1; pointer-events: auto; }
        .announcement-content {
            background: #1a1a1a; width: 90%; max-width: 400px;
            border-radius: 16px; padding: 25px; text-align: center;
            position: relative; border: 1px solid var(--accent-color);
            box-shadow: 0 0 30px rgba(0,0,0,0.8);
            max-height: 85vh; overflow-y: auto;
        }
        .announcement-close {
            position: absolute; top: 10px; right: 15px;
            background: none; border: none; color: #fff;
            font-size: 1.5rem; cursor: pointer; z-index: 2;
        }
        .announcement-img {
            width: 100%; border-radius: 8px; margin-top: 15px;
            max-height: 300px; object-fit: contain; background: #000;
        }
        .announcement-btn {
            background: var(--accent-color); color: #000;
            padding: 12px 24px; border-radius: 50px; text-decoration: none;
            font-weight: bold; display: inline-block; margin-top: 20px;
            width: 100%; box-sizing: border-box; box-shadow: 0 4px 15px rgba(0,0,0,0.4);
        }

        /* Modal Creador Avisos (Admin) */
        .alert-creator-modal {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.95); z-index: 10001;
            display: none; align-items: center; justify-content: center;
        }
        .alert-creator-modal.active { display: flex; }
        .alert-box {
            background: #222; padding: 20px; width: 90%; max-width: 400px;
            border-radius: 12px; border: 1px solid #444;
        }
        .alert-input {
            width: 100%; background: #000; border: 1px solid #444;
            color: white; padding: 10px; margin-bottom: 10px; border-radius: 6px; box-sizing: border-box;
        }

        /* Botón Telegram en Perfil */
        .telegram-btn-profile {
            background: var(--accent-color); color: #000; border: none;
            padding: 10px 24px; border-radius: 50px; font-weight: bold;
            font-size: 0.9rem; cursor: pointer; display: inline-flex;
            align-items: center; justify-content: center; gap: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4); transition: transform 0.1s;
        }
        .telegram-btn-profile:active { transform: scale(0.95); }

        /* Librería Compacta */
        .library-item-compact {
            display: flex; justify-content: space-between; align-items: center;
            background: #1a1a1a; padding: 10px 12px; margin-bottom: 8px;
            border-radius: 8px; border-left: 3px solid var(--accent-color);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .library-info { flex: 1; padding-right: 10px; overflow: hidden; }
        .library-title { font-weight: bold; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: white; }
        .library-sub { font-size: 0.7rem; color: #888; }
        .library-actions { display: flex; gap: 4px; flex-shrink: 0; }
        .btn-icon-lib { background: #222; border: 1px solid #444; color: #ccc; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; padding: 0; }
        .btn-icon-lib.primary { border-color: var(--accent-color); color: var(--accent-color); }
        .btn-icon-lib.danger { border-color: #f55; color: #f55; }
        
        /* Botones de Alerta Admin */
        .btn-alert-global {
            width: 100%; background: #ffaa00; color: #000; font-weight: bold;
            padding: 12px; margin-bottom: 15px; border-radius: 8px; border: none;
            display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;
        }
        .btn-icon-alert {
            background: #331100; border: 1px solid #ffaa00; color: #ffaa00;
            width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
            display: flex; align-items: center; justify-content: center; margin-left: 5px; font-size:0.9rem;
        }
    `;
    document.head.appendChild(style);

    // Inyectar HTML Modal Avisos (Cliente)
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
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // Inyectar HTML Modal Creador (Admin)
    if (!document.getElementById('modal-alert-creator')) {
        const creatorHTML = `
            <div id="modal-alert-creator" class="alert-creator-modal">
                <div class="alert-box">
                    <h3 style="color:#fff; margin-bottom:15px;">📢 Crear Aviso <span id="alert-target-label"></span></h3>
                    <input type="text" id="alert-title" class="alert-input" placeholder="Título (ej: ¡Importante!)">
                    <textarea id="alert-msg" class="alert-input" style="height:80px;" placeholder="Mensaje..."></textarea>
                    <div style="background:#000; padding:10px; border-radius:6px; margin-bottom:10px; border:1px dashed #666;">
                        <label style="color:#aaa; font-size:0.8rem;">📷 Subir Imagen / QR (Opcional):</label>
                        <input type="file" id="alert-file" accept="image/*" style="color:white; margin-top:5px; width:100%;">
                    </div>
                    <input type="text" id="alert-link" class="alert-input" placeholder="Enlace botón (https://...)">
                    <input type="text" id="alert-btn-text" class="alert-input" placeholder="Texto del botón (ej: Ver Info)">
                    <button onclick="window.sendAlert()" id="btn-send-alert" class="btn" style="width:100%;">ENVIAR AVISO</button>
                    <button onclick="document.getElementById('modal-alert-creator').classList.remove('active')" class="btn-outline" style="width:100%; margin-top:10px;">CANCELAR</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', creatorHTML);
    }

    injectTelegramAndFields();
}

function injectTelegramAndFields() {
    const regForm = document.getElementById('register-form');
    const regEmail = document.getElementById('reg-email');
    if (regForm && regEmail && !document.getElementById('reg-telegram')) {
        const input = document.createElement('input');
        input.type = 'text'; input.id = 'reg-telegram'; input.placeholder = 'Usuario Telegram (ej: @juanperez)';
        input.style.marginBottom = '10px';
        regEmail.parentNode.insertBefore(input, regEmail);
    }

    const restInput = document.getElementById('cfg-rest-time');
    if (restInput && !document.getElementById('cfg-telegram')) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = "width: 100%; margin-top: 25px; margin-bottom: 25px; text-align: center; border-top: 1px solid #222; padding-top: 15px;"; 
        wrapper.innerHTML = `
            <label style="display:block; margin-bottom:8px; font-size:0.85rem; color:#aaa; font-weight:bold;">📸 Tu Usuario Telegram</label>
            <input type="text" id="cfg-telegram" placeholder="@usuario" style="width: 70%; max-width: 250px; margin: 0 auto 15px auto; background: #111; border: 1px solid #444; color: white; padding: 10px; border-radius: 8px; text-align: center; display:block;">
            <button onclick="window.contactCoach()" class="telegram-btn-profile">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 11.944 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                Contactar Coach
            </button>
        `;
        const parent = restInput.parentElement; 
        if (parent) parent.insertAdjacentElement('afterend', wrapper);
    }
}

document.addEventListener('DOMContentLoaded', injectAppUI);
setTimeout(injectAppUI, 1000); 

// --- DEFINICIONES DE FUNCIONES CLAVE ---
window.openAlertModal = (uid = null) => {
    alertTargetUid = uid;
    const label = document.getElementById('alert-target-label');
    if (uid) label.innerText = "(A Usuario)";
    else label.innerText = "(A TODOS)";
    
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
    
    if (!title || !content) return alert("Título y Mensaje requeridos.");
    
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
            active: true, 
            createdAt: serverTimestamp(),
            assignedTo: assignedTo
        });

        alert("✅ Aviso enviado correctamente.");
        document.getElementById('modal-alert-creator').classList.remove('active');

    } catch (e) {
        console.error(e);
        alert("Error al enviar: " + e.message);
    } finally {
        btn.innerText = "ENVIAR AVISO"; btn.disabled = false;
    }
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
    
    if(userData.telegram) {
        const tInput = document.getElementById('cfg-telegram');
        if(tInput) tInput.value = userData.telegram;
    }

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
    setTimeout(() => {
        window.open("https://t.me/fityhab", "_blank");
    }, 1000);
};

window.saveConfig = async () => { 
    const rt = document.getElementById('cfg-rest-time').value; 
    const tg = document.getElementById('cfg-telegram')?.value || "";
    await updateDoc(doc(db,"users",currentUser.uid), { restTime: parseInt(rt), telegram: tg }); 
    userData.restTime = parseInt(rt); 
    userData.telegram = tg;
    alert("Ajustes Guardados"); 
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

function initAnnouncementsListener() {
    if(announcementsUnsubscribe) announcementsUnsubscribe();
    const q = query(collection(db, "announcements"), where("assignedTo", "array-contains", currentUser.uid), where("active", "==", true));
    announcementsUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const ann = change.doc.data();
                const annId = change.doc.id;
                const isDismissed = localStorage.getItem(`announcement_dismissed_${annId}`);
                if (!isDismissed) {
                    showAnnouncementModal(ann, annId);
                }
            }
        });
    });
}

window.showAnnouncementModal = (ann, id) => {
    document.getElementById('ann-title').innerText = ann.title;
    document.getElementById('ann-text').innerHTML = ann.content.replace(/\n/g, '<br>');
    const imgEl = document.getElementById('ann-img');
    if (ann.imageUrl) { imgEl.src = ann.imageUrl; imgEl.style.display = 'block'; } 
    else { imgEl.style.display = 'none'; }
    const linkEl = document.getElementById('ann-link');
    if (ann.link) { linkEl.href = ann.link; linkEl.style.display = 'inline-block'; linkEl.innerText = ann.linkText || "VER AHORA"; }
    else { linkEl.style.display = 'none'; }
    document.querySelector('.announcement-close').onclick = () => window.closeAnnouncement(id);
    document.getElementById('modal-announcement').classList.add('active');
};

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
        if(announcementsUnsubscribe) announcementsUnsubscribe();
        injectAppUI();
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

window.toggleAuth = (m) => { document.getElementById('login-form').classList.toggle('hidden',m!=='login'); document.getElementById('register-form').classList.toggle('hidden',m!=='register'); };
window.logout = () => signOut(auth).then(()=>location.reload());

window.recoverPass = async () => {
    const email = prompt("Introduce tu email:");
    if(email) try { await sendPasswordResetEmail(auth, email); alert("📧 Correo enviado."); } catch(e) { alert("Error: " + e.message); }
};
window.dismissNotif = () => { document.getElementById('notif-badge').style.display = 'none'; switchTab('routines-view'); sessionStorage.setItem('notif_dismissed', 'true'); };

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

window.openEditor = async (id = null) => {
    editingRoutineId = id; document.getElementById('editor-name').value = ''; document.getElementById('editor-title').innerText = id ? "EDITAR RUTINA" : "NUEVA RUTINA";
    if (id) {
        const docSnap = await getDoc(doc(db, "routines", id)); const r = docSnap.data(); document.getElementById('editor-name').value = r.name;
        currentRoutineSelections = r.exercises.map(ex => ({ n: ex.n || ex, s: ex.s || false, series: ex.series || 5, reps: ex.reps || "20-16-16-16-16" }));
    } else { currentRoutineSelections = []; }
    window.currentRoutineSelections = currentRoutineSelections;
    renderExercises(EXERCISES); renderSelectedSummary(); switchTab('editor-view');
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

// --- CORE CREADOR DE RUTINAS ---
function renderExercises(l) {
    const c = document.getElementById('exercise-selector-list'); c.innerHTML = '';
    const sortedList = [...l].sort((a, b) => {
        const aSelected = currentRoutineSelections.some(x => x.n === a.n);
        const bSelected = currentRoutineSelections.some(x => x.n === b.n);
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        return 0;
    });

    sortedList.forEach(e => {
        const d = document.createElement('div');
        const selectedIndex = currentRoutineSelections.findIndex(x => x.n === e.n);
        const isSelected = selectedIndex > -1;
        const obj = isSelected ? currentRoutineSelections[selectedIndex] : null;

        d.id = `ex-card-${normalizeText(e.n)}`;
        d.className = 'ex-select-item';
        
        if (isSelected) {
            d.classList.add('selected-red-active');
            d.style.cssText = "background: rgba(50, 10, 10, 0.95); border-left: 4px solid var(--accent-color); border: 1px solid var(--accent-color); padding: 10px; margin-bottom: 5px; border-radius: 8px; flex-direction:column; align-items: stretch;";
            const linkActiveStyle = obj.s ? "color: var(--accent-color); text-shadow: 0 0 5px var(--accent-color);" : "color:rgba(255,255,255,0.2);";

            d.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${e.img}" onerror="this.src='logo.png'" style="width:40px; height:40px; border-radius:4px; object-fit:cover;">
                        <span style="font-weight:bold; color:white;">${e.n}</span>
                    </div>
                    <b class="btn-remove-ex" onclick="event.stopPropagation(); removeSelection('${obj.n}')" style="cursor:pointer; color:#ff5555; font-size:1.2rem; padding:5px;">✕</b>
                </div>
                <div class="summary-inputs" style="display:flex; gap:8px; align-items:center; width:100%;">
                    <input type="number" value="${obj.series || 5}" oninput="window.updateSelectionData(${selectedIndex}, 'series', this.value)" onclick="event.stopPropagation()" placeholder="Ser" style="width:60px; text-align:center; padding:8px; background:#000; border:1px solid #444; color:white; border-radius:4px;">
                    <span style="color:#aaa;">x</span>
                    <input type="text" value="${obj.reps || '20-16-16-16-16'}" onclick="event.stopPropagation()" style="flex:1; padding:8px; background:#000; border:1px solid #444; color:white; border-radius:4px;" oninput="window.updateSelectionData(${selectedIndex}, 'reps', this.value)" placeholder="Reps">
                    <span style="font-size:1.8rem; cursor:pointer; margin-left:5px; ${linkActiveStyle}" onclick="event.stopPropagation(); toggleSuperset(${selectedIndex})" title="Superserie">🔗</span>
                </div>`;
            d.onclick = null; 
        } else {
            d.innerHTML = `<img src="${e.img}" onerror="this.src='logo.png'"><span>${e.n}</span>`;
            d.onclick = () => { 
                currentRoutineSelections.push({ n: e.n, s: false, series: 5, reps: "20-16-16-16-16" });
                renderExercises(sortedList); 
                renderSelectedSummary(); 
            };
        }
        c.appendChild(d);
    });
}

window.renderSelectedSummary = () => {
    const div = document.getElementById('selected-summary'); div.innerHTML = ''; 
    if(currentRoutineSelections.length > 0) {
        const legendDiv = document.createElement('div');
        legendDiv.className = 'editor-legend';
        legendDiv.style.cssText = "display:flex; gap:8px; overflow-x:auto; padding:12px; background:#111; margin-bottom:15px; white-space:nowrap; border-bottom:1px solid #333; align-items:center; border-radius: 8px; position:sticky; top:0; z-index:10; cursor:pointer;";
        legendDiv.onclick = () => { document.getElementById('exercise-selector-list').scrollTo({top:0, behavior:'smooth'}); };

        let legendHTML = '<span style="font-size:0.7rem; color:#888; font-weight:bold; margin-right:5px;">ORDEN:</span>';
        currentRoutineSelections.forEach((obj, idx) => {
            const isLast = idx === currentRoutineSelections.length - 1;
            const linkSymbol = obj.s ? '<span style="color:var(--accent-color); font-weight:bold;">🔗</span>' : '';
            const separator = (isLast && !obj.s) ? '' : '<span style="color:#444">›</span>';
            legendHTML += `<span onclick="event.stopPropagation(); document.getElementById('ex-card-${normalizeText(obj.n)}').scrollIntoView({behavior:'smooth', block:'center'});" style="font-size:0.85rem; color:#fff; cursor:pointer; text-decoration:underline; text-decoration-color:rgba(255,255,255,0.2);">${idx+1}. ${obj.n} ${linkSymbol}</span> ${separator}`;
        });
        legendDiv.innerHTML = legendHTML;
        div.appendChild(legendDiv);
    }
};

window.updateSelectionData = (idx, field, val) => {
    if(currentRoutineSelections[idx]) {
        currentRoutineSelections[idx][field] = field === 'series' ? (parseInt(val)||0) : val;
    }
};

window.toggleSuperset = (idx) => {
    if (idx < currentRoutineSelections.length - 1) { 
        currentRoutineSelections[idx].s = !currentRoutineSelections[idx].s; 
        renderExercises(EXERCISES); renderSelectedSummary();
    } else { alert("No puedes hacer superserie con el último ejercicio."); }
};

window.removeSelection = (name) => { 
    currentRoutineSelections = currentRoutineSelections.filter(x => x.n !== name); 
    renderSelectedSummary(); window.filterExercises(document.getElementById('ex-search').value); 
}

window.saveRoutine = async () => {
    const n = document.getElementById('editor-name').value; const s = window.currentRoutineSelections; 
    if(!n || s.length === 0) return alert("❌ Faltan datos");
    const btn = document.getElementById('btn-save-routine'); btn.innerText = "💾 GUARDANDO...";
    let initialAssignments = [];
    if (userData.role !== 'admin') { initialAssignments.push(currentUser.uid); }

    try {
        const data = { uid: currentUser.uid, name: n, exercises: s, createdAt: serverTimestamp(), assignedTo: initialAssignments };
        if(editingRoutineId) { await updateDoc(doc(db, "routines", editingRoutineId), { name: n, exercises: s }); } 
        else { await addDoc(collection(db, "routines"), data); }
        alert("✅ Guardado"); switchTab('routines-view');
    } catch(e) { alert("Error: " + e.message); } finally { btn.innerText = "GUARDAR"; }
};

window.cloneRoutine = async (id) => {
    if(!confirm("¿Deseas clonar esta rutina?")) return;
    try {
        const docSnap = await getDoc(doc(db, "routines", id));
        if (!docSnap.exists()) return alert("Error.");
        const originalData = docSnap.data();
        const newName = prompt("Nombre copia:", `${originalData.name} (Copia)`);
        if (!newName) return; 
        const copyData = { ...originalData, name: newName, uid: currentUser.uid, createdAt: serverTimestamp(), assignedTo: [] };
        await addDoc(collection(db, "routines"), copyData);
        alert(`✅ Clonada. Ahora puedes editar "${newName}".`);
        window.loadAdminLibrary(); 
    } catch (e) { alert("Error: " + e.message); }
};

window.delRoutine = async (id) => { if(confirm("¿Borrar rutina permanentemente?")) await deleteDoc(doc(db,"routines",id)); window.loadAdminLibrary(); };

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

window.switchCoachPose = (pose) => { coachCurrentPose = pose; document.getElementById('coach-tab-front').classList.toggle('active', pose==='front'); document.getElementById('coach-tab-back').classList.toggle('active', pose==='back'); updateCoachPhotoDisplay(pose); };

function updateCoachPhotoDisplay(pose) {
    const u = selectedUserObj; if(!u) return; const prefix = pose === 'front' ? '' : '_back'; const histField = prefix === '' ? 'photoHistoryFront' : 'photoHistoryBack'; const history = u[histField] || []; const pCont = document.getElementById('coach-photos-container');
    pCont.innerHTML = `<div style="display:flex; gap:5px; margin-bottom:10px;"><select id="c-sel-before" onchange="window.updateCoachSliderImages()" style="margin:0; font-size:0.8rem;"></select><select id="c-sel-after" onchange="window.updateCoachSliderImages()" style="margin:0; font-size:0.8rem;"></select></div><div class="compare-wrapper" style="min-height:250px; background:#000; position:relative;"><div class="slider-labels"><span class="label-tag">ANTES</span><span class="label-tag">AHORA</span></div><img src="" id="c-img-before" class="compare-img" style="width:100%; height:100%; object-fit:contain;"><img src="" id="c-img-after" class="compare-img img-overlay" style="clip-path:inset(0 0 0 0); width:100%; height:100%; object-fit:contain;"><div class="slider-handle" id="coach-slider-handle" style="left:0%"><div class="slider-btn"></div></div></div><input type="range" min="0" max="100" value="0" style="width:100%; margin-top:15px;" oninput="window.moveCoachSlider(this.value)">`;
    const selB = document.getElementById('c-sel-before'); const selA = document.getElementById('c-sel-after');
    if(history.length === 0) { const current = u[`photoBefore${prefix}`]; const opt = new Option(current ? "Actual" : "Sin fotos", current || ""); selB.add(opt); selA.add(opt.cloneNode(true)); } 
    else { history.forEach((h, i) => { const label = h.date || `Foto ${i+1}`; selB.add(new Option(label, h.url)); selA.add(new Option(label, h.url)); }); selB.selectedIndex = 0; selA.selectedIndex = history.length - 1; }
    window.updateCoachSliderImages();
}

window.updateCoachSliderImages = () => { const urlB = document.getElementById('c-sel-before').value; const urlA = document.getElementById('c-sel-after').value; document.getElementById('c-img-before').src = urlB; document.getElementById('c-img-after').src = urlA; };
window.moveCoachSlider = (v) => { document.getElementById('c-img-after').style.clipPath = `inset(0 0 0 ${v}%)`; document.getElementById('coach-slider-handle').style.left = `${v}%`; };

function renderMeasureChart(canvasId, historyData) {
    const ctx = document.getElementById(canvasId);
    let instance = (canvasId === 'chartMeasures') ? measureChartInstance : coachMeasureChart;
    if(instance) instance.destroy();
    const labels = historyData.map(m => new Date(m.date.seconds*1000).toLocaleDateString());
    const parts = [{k:'chest', l:'Pecho', c:'#FF5733'}, {k:'waist', l:'Cintura', c:'#00FF88'}, {k:'hip', l:'Cadera', c:'#3357FF'}, {k:'arm', l:'Brazo', c:'#FF33A8'}, {k:'thigh', l:'Muslo', c:'#F3FF33'}, {k:'calf', l:'Gemelo', c:'#FF8C00'}, {k:'shoulder', l:'Hombros', c:'#A133FF'}];
    const datasets = parts.map(p => ({ label: p.l, data: historyData.map(h => h[p.k] || 0), borderColor: p.c, tension: 0.3, pointRadius: 2 }));
    const newChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: { plugins: { legend: { display: true, labels: { color: '#888', boxWidth: 10, font: {size: 10} } } }, scales: { y: { grid: { color: '#333' } }, x: { display: false } }, maintainAspectRatio: false } });
    if(canvasId === 'chartMeasures') measureChartInstance = newChart; else coachMeasureChart = newChart;
}

function renderBioChart(canvasId, historyData) {
    const ctx = document.getElementById(canvasId);
    let instance = (canvasId === 'chartBio') ? bioChartInstance : coachBioChart;
    if(instance) instance.destroy();
    const labels = historyData.map(m => new Date(m.date.seconds*1000).toLocaleDateString());
    const datasets = [{ label: '% Músculo', data: historyData.map(h => h.muscle || 0), borderColor: '#00ffff', tension: 0.3, pointRadius: 3 }, { label: '% Grasa', data: historyData.map(h => h.fat || 0), borderColor: '#ffaa00', tension: 0.3, pointRadius: 3 }];
    const newChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: { plugins: { legend: { display: true, labels: { color: '#ddd' } } }, scales: { y: { grid: { color: '#333' } }, x: { display: false } }, maintainAspectRatio: false } });
    if(canvasId === 'chartBio') bioChartInstance = newChart; else coachBioChart = newChart;
}

function renderMuscleRadar(canvasId, stats) {
    const ctx = document.getElementById(canvasId); if(!ctx) return;
    if(canvasId === 'userMuscleChart' && userRadarChart) userRadarChart.destroy();
    if(canvasId === 'coachMuscleChart' && coachRadarChart) coachRadarChart.destroy();
    const muscleGroups = ["Pecho", "Espalda", "Cuádriceps", "Isquios", "Hombros", "Bíceps", "Tríceps", "Glúteos"];
    const dataValues = muscleGroups.map(m => stats[m] || 0);
    const newChart = new Chart(ctx, {
        type: 'radar',
        data: { labels: muscleGroups, datasets: [{ label: 'Volumen Relativo', data: dataValues, backgroundColor: 'rgba(255, 51, 51, 0.4)', borderColor: '#ff3333', pointBackgroundColor: '#ff3333', pointBorderColor: '#fff', pointHoverBackgroundColor: '#fff', pointHoverBorderColor: '#ff3333' }] },
        options: { scales: { r: { angleLines: { color: '#333' }, grid: { color: '#333' }, pointLabels: { color: '#ccc', font: { size: 10 } }, ticks: { display: false, backdropColor: 'transparent' }, suggestedMin: 0 } }, plugins: { legend: { display: false } }, maintainAspectRatio: false }
    });
    if(canvasId === 'userMuscleChart') userRadarChart = newChart;
    if(canvasId === 'coachMuscleChart') coachRadarChart = newChart;
}

// --- ADMIN (USERS, LIB, PLANS) ---
window.toggleAdminMode = (mode) => { 
    document.getElementById('tab-users').classList.toggle('active', mode==='users'); 
    document.getElementById('tab-lib').classList.toggle('active', mode==='lib'); 
    document.getElementById('tab-plans').classList.toggle('active', mode==='plans'); 
    
    document.getElementById('admin-users-card').classList.toggle('hidden', mode!=='users'); 
    document.getElementById('admin-lib-card').classList.toggle('hidden', mode!=='lib'); 
    document.getElementById('admin-plans-card').classList.toggle('hidden', mode!=='plans'); 
    
    if(mode==='users') window.loadAdminUsers(); 
    if(mode==='lib') window.loadAdminLibrary(); 
    if(mode==='plans') window.loadAdminPlans();
};

window.openAlertModal = (uid = null) => {
    alertTargetUid = uid;
    const label = document.getElementById('alert-target-label');
    if (uid) label.innerText = "(A Usuario)";
    else label.innerText = "(A TODOS)";
    
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
    
    if (!title || !content) return alert("Título y Mensaje requeridos.");
    
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
            active: true, 
            createdAt: serverTimestamp(),
            assignedTo: assignedTo
        });

        alert("✅ Aviso enviado correctamente.");
        document.getElementById('modal-alert-creator').classList.remove('active');

    } catch (e) {
        console.error(e);
        alert("Error al enviar: " + e.message);
    } finally {
        btn.innerText = "ENVIAR AVISO"; btn.disabled = false;
    }
};

window.loadAdminUsers = async () => {
    const l = document.getElementById('admin-list'); l.innerHTML = '↻ Cargando...';
    try {
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const s = await getDocs(q); l.innerHTML = '';
        
        // BOTÓN GLOBAL DE ALERTAS
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
            div.onclick = (e) => {
                if(e.target.tagName !== 'BUTTON') openCoachView(u.id, u); 
            };
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

window.initMassAssignRoutine = async (rid) => {
    assignMode = 'routine';
    selectedRoutineForMassAssign = rid;
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
    if (assignMode !== 'announcement') assignMode = 'plan';
    if (assignMode === 'plan') selectedPlanForMassAssign = planId;
    const list = document.getElementById('assign-users-list');
    window.openModal('modal-assign-plan');
    try {
        if (assignMode === 'plan') {
            const snap = await getDoc(doc(db, "plans", planId)); 
            if (snap.exists()) document.getElementById('assign-plan-title').innerText = `Asignar "${snap.data().name}" a:`;
        }
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const uSnap = await getDocs(q); list.innerHTML = '';
        
        const allDiv = document.createElement('div'); allDiv.className = "selector-item";
        allDiv.style.background = "#222"; allDiv.style.borderBottom = "1px solid #444";
        allDiv.innerHTML = `<input type="checkbox" id="select-all-users" onchange="document.querySelectorAll('.user-mass-check').forEach(c => c.checked = this.checked)"><label for="select-all-users" class="selector-label" style="font-weight:bold;">SELECCIONAR TODOS</label>`;
        list.appendChild(allDiv);

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
    if(checks.length === 0) return alert("Selecciona al menos un atleta.");
    const userIds = Array.from(checks).map(c => c.value); 
    const btn = document.querySelector('#modal-assign-plan .btn'); 
    btn.innerText = "ENVIANDO...";
    
    try {
        if (assignMode === 'plan' && selectedPlanForMassAssign) {
            const planSnap = await getDoc(doc(db, "plans", selectedPlanForMassAssign));
            const promises = planSnap.data().routines.map(rid => updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(...userIds) }));
            await Promise.all(promises); 
            alert(`✅ Plan asignado correctamente.`);
        } else if (assignMode === 'routine' && selectedRoutineForMassAssign) {
            await updateDoc(doc(db, "routines", selectedRoutineForMassAssign), { assignedTo: arrayUnion(...userIds) });
            alert(`✅ Rutina enviada correctamente.`);
        } else if (assignMode === 'announcement' && selectedAnnouncementForAssign) {
            await updateDoc(doc(db, "announcements", selectedAnnouncementForAssign), { assignedTo: arrayUnion(...userIds) });
            alert(`📢 Aviso enviado a ${userIds.length} atletas.`);
        }
        window.closeModal('modal-assign-plan');
    } catch(e) { alert("Error: " + e.message); } 
    finally { btn.innerText = "✅ ENVIAR A SELECCIONADOS"; assignMode = 'plan'; }
};

window.viewRoutineContent = (name, dataStr) => {
    const exs = JSON.parse(decodeURIComponent(dataStr)).map(e => typeof e === 'string' ? e : e.n); 
    let html = `<ul style="padding-left:20px; margin-top:10px;">`; exs.forEach(e => html += `<li style="margin-bottom:5px;">${e}</li>`); html += `</ul>`;
    document.getElementById('detail-title').innerText = name; document.getElementById('detail-content').innerHTML = html; 
    window.openModal('modal-details');
};

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

async function openCoachView(uid, u) {
    selectedUserCoach=uid; const freshSnap = await getDoc(doc(db, "users", uid)); const freshU = freshSnap.data(); selectedUserObj = freshU; 
    switchTab('coach-detail-view'); document.getElementById('coach-user-name').innerText=freshU.name + (freshU.role === 'assistant' ? ' (Coach 🛡️)' : ''); document.getElementById('coach-user-email').innerText=freshU.email;
    document.getElementById('coach-user-meta').innerText = `${freshU.gender === 'female' ? '♀️' : '♂️'} ${freshU.age} años • ${freshU.height} cm`;
    
    const telegramHtml = freshU.telegram ? `<div style="font-size:0.8rem; color:#0088cc; margin-top:5px;">Telegram: ${freshU.telegram}</div>` : '';
    document.getElementById('coach-user-email').innerHTML += telegramHtml;

    if(freshU.photo) { document.getElementById('coach-user-img').src = freshU.photo; document.getElementById('coach-user-img').style.display = 'block'; document.getElementById('coach-user-initial').style.display = 'none'; }
    else { document.getElementById('coach-user-img').style.display = 'none'; document.getElementById('coach-user-initial').style.display = 'block'; document.getElementById('coach-user-initial').innerText = freshU.name.charAt(0).toUpperCase(); }
    document.getElementById('pending-approval-banner').classList.toggle('hidden', freshU.approved);
    updateCoachPhotoDisplay('front');
    document.getElementById('coach-toggle-bio').checked = !!freshU.showBio; document.getElementById('coach-toggle-skinfolds').checked = !!freshU.showSkinfolds; document.getElementById('coach-toggle-measures').checked = !!freshU.showMeasurements; document.getElementById('coach-toggle-videos').checked = !!freshU.showVideos;
    const dietSel = document.getElementById('coach-diet-select'); dietSel.innerHTML = '<option value="">-- Sin Dieta --</option>';
    AVAILABLE_DIETS.forEach(d => { const opt = new Option(d.name, d.file); if(freshU.dietFile === d.file) opt.selected = true; dietSel.appendChild(opt); });
    const rList = document.getElementById('coach-assigned-list'); rList.innerHTML = 'Cargando...';
    const allRoutinesSnap = await getDocs(collection(db, "routines")); allRoutinesCache = [];
    const s = document.getElementById('coach-routine-select'); s.innerHTML = '<option value="">Selecciona rutina...</option>';
    allRoutinesSnap.forEach(r => { const data = r.data(); allRoutinesCache.push({id: r.id, ...data}); s.add(new Option(data.name, r.id)); });
    const pSelect = document.getElementById('coach-plan-select'); pSelect.innerHTML = '<option value="">Selecciona plan...</option>';
    const allPlansSnap = await getDocs(collection(db, "plans")); allPlansSnap.forEach(p => pSelect.add(new Option(p.data().name, p.id)));
    const assigned = allRoutinesCache.filter(r => (r.assignedTo || []).includes(uid)); rList.innerHTML = assigned.length ? '' : 'Ninguna rutina.';
    assigned.forEach(r => { const div = document.createElement('div'); div.className = "assigned-routine-item"; div.innerHTML = `<span>${r.name}</span><button style="background:none;border:none;color:#f55;font-weight:bold;cursor:pointer;" onclick="window.unassignRoutine('${r.id}')">❌</button>`; rList.appendChild(div); });
    if(freshU.bioHistory) { document.getElementById('coach-view-bio').classList.remove('hidden'); renderBioChart('coachBioChart', freshU.bioHistory); }
    if(freshU.skinfoldHistory) { document.getElementById('coach-view-skinfolds').classList.remove('hidden'); const dataF = freshU.skinfoldHistory.map(f => f.fat || 0); const labels = freshU.skinfoldHistory.map(f => new Date(f.date.seconds*1000).toLocaleDateString()); if(coachFatChart) coachFatChart.destroy(); coachFatChart = new Chart(document.getElementById('coachFatChart'), { type: 'line', data: { labels: labels, datasets: [{ label: '% Grasa', data: dataF, borderColor: '#ffaa00' }] }, options: { maintainAspectRatio: false } }); }
    if(freshU.measureHistory) { document.getElementById('coach-view-measures').classList.remove('hidden'); renderMeasureChart('coachMeasuresChart', freshU.measureHistory); }
    
    renderMuscleRadar('coachMuscleChart', freshU.muscleStats || {});

    const st = freshU.stats || {}; document.getElementById('coach-stats-text').innerHTML = `<div class="stat-pill"><b>${st.workouts||0}</b><span>ENTRENOS</span></div><div class="stat-pill"><b>${(st.totalKg/1000||0).toFixed(1)}t</b><span>CARGA</span></div><div class="stat-pill"><b>${freshU.age||'N/D'}</b><span>AÑOS</span></div>`;
    if(coachChart) coachChart.destroy(); const wData = freshU.weightHistory || [70]; coachChart = new Chart(document.getElementById('coachWeightChart'), { type:'line', data: { labels:wData.map((_,i)=>i+1), datasets:[{label:'Kg', data:wData, borderColor:'#ff3333'}] }, options:{ maintainAspectRatio: false}});
    const hList = document.getElementById('coach-history-list'); hList.innerHTML = 'Cargando...';
    const wSnap = await getDocs(query(collection(db,"workouts"), where("uid","==",uid))); hList.innerHTML = wSnap.empty ? 'Sin datos.' : '';
    wSnap.docs.map(doc => ({id: doc.id, ...doc.data()})).sort((a,b) => b.date - a.date).slice(0, 10).forEach(d => {
        const date = d.date ? new Date(d.date.seconds*1000).toLocaleDateString() : '-';
        hList.innerHTML += `<div class="history-row" style="grid-template-columns: 60px 1fr 30px 80px;"><div>${date}</div><div style="overflow:hidden; text-overflow:ellipsis;">${d.routine}</div><div>${d.rpe === 'Suave' ? '🟢' : (d.rpe === 'Duro' ? '🟠' : '🔴')}</div><button class="btn-small btn-outline" onclick="viewWorkoutDetails('${d.routine}', '${encodeURIComponent(JSON.stringify(d.details))}', '${encodeURIComponent(d.note||"")}')">Ver</button></div>`;
    });
}

window.exportWorkoutHistory = async () => {
    const btn = event.currentTarget; const originalContent = btn.innerHTML;
    if (!window.tempHistoryCache || window.tempHistoryCache.length === 0) { return alert("Primero selecciona un ejercicio en la gráfica para cargar los datos."); }
    btn.disabled = true; btn.innerHTML = `<span>⏳</span> GENERANDO...`; btn.style.opacity = "0.7";
    await new Promise(resolve => setTimeout(resolve, 600));

    try {
        let csvContent = "\uFEFF"; 
        csvContent += "Fecha,Rutina,Ejercicio,Series,Reps Totales,Volumen Ejercicio (kg),RPE,Nota\n";

        window.tempHistoryCache.forEach(w => {
            const date = w.date ? new Date(w.date.seconds * 1000).toLocaleDateString('es-ES') : "-";
            const routine = `"${(w.routine || "Sin nombre").replace(/"/g, '""')}"`;
            const rpe = w.rpe || "-"; const note = `"${(w.note || "").replace(/"/g, '""')}"`;

            w.details.forEach(ex => {
                let exVolumen = 0; let totalReps = 0;
                if (ex.s && Array.isArray(ex.s)) {
                    ex.s.forEach(set => {
                        const r = parseInt(set.r) || 0; const weight = parseFloat(set.w) || 0;
                        totalReps += r; exVolumen += (r * weight);
                    });
                }
                csvContent += `${date},${routine},"${ex.n}",${ex.s ? ex.s.length : 0},${totalReps},${exVolumen},${rpe},${note}\n`;
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); const link = document.createElement("a");
        const fileName = `FitData_${(userData.name || "Usuario").replace(/\s+/g, '_')}.csv`;
        link.setAttribute("href", url); link.setAttribute("download", fileName); link.style.visibility = 'hidden';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        showToast("📊 Archivo CSV descargado");

    } catch (e) { console.error("Error CSV:", e); alert("Error al generar CSV."); } 
    finally { btn.disabled = false; btn.innerHTML = originalContent; btn.style.opacity = "1"; }
};

document.getElementById('btn-register').onclick=async()=>{
    const secretCode = document.getElementById('reg-code').value;
    const tgUser = document.getElementById('reg-telegram')?.value || ""; 
    try{ 
        const c=await createUserWithEmailAndPassword(auth,document.getElementById('reg-email').value,document.getElementById('reg-pass').value);
        await setDoc(doc(db,"users",c.user.uid),{
            name:document.getElementById('reg-name').value, 
            email:document.getElementById('reg-email').value, 
            secretCode: secretCode, 
            telegram: tgUser, 
            approved: false, role: 'athlete', 
            gender:document.getElementById('reg-gender').value, age:parseInt(document.getElementById('reg-age').value), height:parseInt(document.getElementById('reg-height').value), 
            weightHistory: [], measureHistory: [], skinfoldHistory: [], bioHistory: [], prs: {}, stats: {workouts:0, totalKg:0, totalSets:0, totalReps:0}, muscleStats: {}, joined: serverTimestamp(), showVideos: false, showBio: false
        });
    }catch(e){alert("Error: " + e.message);}
};
document.getElementById('btn-login').onclick=()=>signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value).catch(e=>alert(e.message));
