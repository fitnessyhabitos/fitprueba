import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App Iniciada (v6.2 - Avisos Quick-Access)...");

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

// --- SISTEMA DE AVISOS (v6.2) ---

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
            const isRead = userData?.readNotices?.includes(docSnap.id);
            if (!isRead && (n.target === 'all' || n.target === currentUser.uid)) {
                const card = document.createElement('div');
                card.className = 'card notice-card-animate';
                card.style.borderLeft = n.target === 'all' ? '4px solid var(--warning-color)' : '4px solid var(--success-color)';
                
                const imgHtml = n.image ? `<img src="${n.image}" style="width:100%; border-radius:8px; margin:10px 0; max-height:250px; object-fit:cover;" onclick="window.viewFullImage(this.src)">` : '';
                const linkHtml = n.link ? `<button class="btn-small btn-outline" onclick="window.open('${n.link}', '_blank')" style="margin-top:10px; border-color:var(--accent-color); color:var(--accent-color);">🔗 VER ENLACE</button>` : '';
                
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <h4 style="color:white; margin:0; font-size:0.9rem;">${n.target === 'all' ? '📢 AVISO GLOBAL' : '📩 MENSAJE PERSONAL'}</h4>
                        <button onclick="window.dismissNotice('${docSnap.id}')" style="background:none; border:none; color:#666; font-size:1.2rem; cursor:pointer;">✕</button>
                    </div>
                    <div style="font-weight:bold; color:white; margin:5px 0;">${n.title}</div>
                    <p style="color:#aaa; font-size:0.85rem; line-height:1.4;">${n.text}</p>
                    ${imgHtml}
                    ${linkHtml}
                `;
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
    } catch(e) { console.error("Error dismiss notice:", e); }
};

window.openNoticeModal = (uid, name) => {
    selectedUserCoach = uid;
    const targetLabel = document.getElementById('modal-notice-target-name');
    if (targetLabel) targetLabel.innerText = name || "Atleta";
    window.openModal('modal-send-notice');
};

window.publishNotice = async (target) => {
    const isGlobal = target === 'all';
    const title = document.getElementById(isGlobal ? 'adm-notice-title' : 'ind-notice-title')?.value;
    const text = document.getElementById(isGlobal ? 'adm-notice-text' : 'ind-notice-text')?.value;
    const link = document.getElementById(isGlobal ? 'adm-notice-link' : 'ind-notice-link')?.value;
    const file = document.getElementById(isGlobal ? 'adm-notice-file' : 'ind-notice-file')?.files[0];

    if (!title || !text) return alert("Título y texto obligatorios");

    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "⏳ ENVIANDO...";
    btn.disabled = true;

    try {
        let imageUrl = "";
        if (file) {
            const storageRef = ref(storage, `notices/${Date.now()}_${file.name}`);
            const snap = await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(snap.ref);
        }

        await addDoc(collection(db, "notices"), {
            title, text, link: link || "", image: imageUrl,
            target: target, active: true, createdAt: serverTimestamp(),
            createdBy: currentUser.uid
        });

        alert("✅ Aviso publicado.");
        if(isGlobal) {
            document.getElementById('adm-notice-title').value = "";
            document.getElementById('adm-notice-text').value = "";
            document.getElementById('adm-notice-link').value = "";
        } else {
            window.closeModal('modal-send-notice');
            document.getElementById('ind-notice-title').value = "";
            document.getElementById('ind-notice-text').value = "";
        }
    } catch (e) { alert("Error: " + e.message); }
    finally { btn.innerText = originalText; btn.disabled = false; }
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

const normalizeText = (text) => {
    if(!text) return "";
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};
window.toggleElement = (id) => {
    const el = document.getElementById(id);
    if(el) el.classList.toggle('hidden');
};

// --- AUDIO ENGINE ---
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
    }).catch(e => console.log("Audio play blocked..."));
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
        if(noticesUnsubscribe) noticesUnsubscribe();
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
                    <input type="number" value="${obj.series || 5}" 
                           oninput="window.updateSelectionData(${selectedIndex}, 'series', this.value)" 
                           onclick="event.stopPropagation()"
                           placeholder="Ser" 
                           style="width:60px; text-align:center; padding:8px; background:#000; border:1px solid #444; color:white; border-radius:4px;">
                    <span style="color:#aaa;">x</span>
                    <input type="text" value="${obj.reps || '20-16-16-16-16'}" 
                           onclick="event.stopPropagation()"
                           style="flex:1; padding:8px; background:#000; border:1px solid #444; color:white; border-radius:4px;" 
                           oninput="window.updateSelectionData(${selectedIndex}, 'reps', this.value)" 
                           placeholder="Reps">
                    <span style="font-size:1.8rem; cursor:pointer; margin-left:5px; ${linkActiveStyle}" 
                          onclick="event.stopPropagation(); toggleSuperset(${selectedIndex})" 
                          title="Superserie">🔗</span>
                </div>
            `;
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
    const div = document.getElementById('selected-summary'); 
    div.innerHTML = ''; 
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
        renderExercises(EXERCISES); 
        renderSelectedSummary();
    } else { alert("No puedes hacer superserie con el último ejercicio."); }
};

window.removeSelection = (name) => { 
    currentRoutineSelections = currentRoutineSelections.filter(x => x.n !== name); 
    renderSelectedSummary(); 
    window.filterExercises(document.getElementById('ex-search').value); 
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
    if(!confirm("¿Deseas clonar esta rutina para editarla?")) return;
    try {
        const docRef = doc(db, "routines", id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) return alert("Error: No existe.");
        const originalData = docSnap.data();
        const newName = prompt("Nombre copia:", `${originalData.name} (Copia)`);
        if (!newName) return; 
        const copyData = { ...originalData, name: newName, uid: currentUser.uid, createdAt: serverTimestamp(), assignedTo: [] };
        await addDoc(collection(db, "routines"), copyData);
        alert(`✅ Clonada.`); window.loadAdminLibrary(); 
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

window.loadProfile = async () => {
    document.getElementById('profile-name').innerText = userData.name;
    if(userData.photo) { document.getElementById('avatar-text').style.display='none'; document.getElementById('avatar-img').src = userData.photo; document.getElementById('avatar-img').style.display='block'; }
    updatePhotoDisplay(userData);
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
            histDiv.innerHTML += `<div class="history-row" style="grid-template-columns: 1fr 40px;"><div><span style="color:#accent-color">${date}</span> - ${d.routine}</div><div style="text-align:right;"><button class="btn-small btn-outline" style="margin:0; padding:2px 6px;" onclick="window.viewWorkoutDetails('${d.routine}', '${detailsStr}', '${noteStr}')">🔍</button></div></div>`;
        });
    } catch(e) { histDiv.innerHTML = "Error."; }
    renderMuscleRadar('userMuscleChart', userData.muscleStats || {});
}

window.openDietView = () => { if(!userData.dietFile) return; const url = `nutricion/${userData.dietFile}`; document.getElementById('diet-frame').src = url; window.openModal('modal-diet'); };
window.closeDiet = () => { document.getElementById('diet-frame').src = "about:blank"; window.closeModal('modal-diet'); };
window.assignDiet = async () => { const file = document.getElementById('coach-diet-select').value; if(!selectedUserCoach) return; const val = file === "" ? null : file; await updateDoc(doc(db, "users", selectedUserCoach), { dietFile: val }); alert("Dieta actualizada."); openCoachView(selectedUserCoach, selectedUserObj); };
window.saveSelfConfig = async (feature, value) => { const update = {}; update[feature] = value; await updateDoc(doc(db, "users", currentUser.uid), update); userData[feature] = value; window.loadProfile(); };
window.saveMeasurements = async () => { const data = { date: new Date(), chest: document.getElementById('m-chest').value, waist: document.getElementById('m-waist').value, hip: document.getElementById('m-hip').value, arm: document.getElementById('m-arm').value, thigh: document.getElementById('m-thigh').value, calf: document.getElementById('m-calf').value, shoulder: document.getElementById('m-shoulder').value }; await updateDoc(doc(db, "users", currentUser.uid), { measureHistory: arrayUnion(data), measurements: data }); alert("Guardado ✅"); window.loadProfile(); };
window.calculateAndSaveSkinfolds = async () => { const s = { chest: parseFloat(document.getElementById('p-chest').value)||0, axilla: parseFloat(document.getElementById('p-axilla').value)||0, tricep: parseFloat(document.getElementById('p-tricep').value)||0, subscap: parseFloat(document.getElementById('p-subscap').value)||0, abdo: parseFloat(document.getElementById('p-abdo').value)||0, supra: parseFloat(document.getElementById('p-supra').value)||0, thigh: parseFloat(document.getElementById('p-thigh').value)||0 }; const sum = Object.values(s).reduce((a,b)=>a+b,0); const age = userData.age || 25, gender = userData.gender || 'male'; let bd = (gender === 'male') ? 1.112 - (0.00043499*sum) + (0.00000055*sum*sum) - (0.00028826*age) : 1.097 - (0.00046971*sum) + (0.00000056*sum*sum) - (0.00012828*age); const fat = ((495 / bd) - 450).toFixed(1); await updateDoc(doc(db, "users", currentUser.uid), { skinfoldHistory: arrayUnion({date: new Date(), fat: fat, skinfolds: s}), skinfolds: s, bodyFat: fat }); alert(`Grasa: ${fat}%. Guardado ✅`); window.loadProfile(); };
window.saveBioEntry = async () => { const muscle = parseFloat(document.getElementById('bio-muscle').value) || 0; const fat = parseFloat(document.getElementById('bio-fat').value) || 0; if(muscle === 0 && fat === 0) return alert("Introduce datos válidos."); const entry = { date: new Date(), muscle: muscle, fat: fat }; await updateDoc(doc(db, "users", currentUser.uid), { bioHistory: arrayUnion(entry) }); alert("Datos Guardados ✅"); if(!userData.bioHistory) userData.bioHistory = []; userData.bioHistory.push(entry); window.loadProfile(); };

window.saveConfig = async () => { 
    const rt = document.getElementById('cfg-rest-time').value; 
    const tg = document.getElementById('cfg-telegram')?.value || "";
    await updateDoc(doc(db,"users",currentUser.uid), { restTime: parseInt(rt), telegram: tg }); 
    userData.restTime = parseInt(rt); userData.telegram = tg; alert("Ajustes Guardados"); 
};

window.contactCoach = () => { showToast("💬 Abriendo chat..."); setTimeout(() => { window.open("https://t.me/fityhab", "_blank"); }, 1000); };
window.savePhotoReminder = async () => { const d = document.getElementById('photo-day').value; const t = document.getElementById('photo-time').value; await updateDoc(doc(db,"users",currentUser.uid), { photoDay:d, photoTime:t }); userData.photoDay = d; userData.photoTime = t; alert("Alarma Guardada"); };
window.addWeightEntry = async () => { const wStr = prompt("Introduce tu peso (kg):"); if(!wStr) return; const w = parseFloat(wStr.replace(',','.')); if(isNaN(w)) return alert("Número inválido"); let history = userData.weightHistory || []; history.push(w); try { await updateDoc(doc(db,"users",currentUser.uid), {weightHistory: history}); userData.weightHistory = history; window.loadProfile(); alert("✅ Peso Guardado"); } catch(e) { alert("Error al guardar: " + e.message); } };

function saveLocalWorkout() { localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); }
window.cancelWorkout = () => { if(confirm("⚠ CANCELAR ENTRENAMIENTO?")) { activeWorkout = null; localStorage.removeItem('fit_active_workout'); if(durationInt) clearInterval(durationInt); switchTab('routines-view'); } };

window.startWorkout = async (rid) => {
    if(document.getElementById('cfg-wake').checked && 'wakeLock' in navigator) try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){}
    try {
        const snap = await getDoc(doc(db,"routines",rid)); const r = snap.data();
        let lastWorkoutData = null; const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid)); const wSnap = await getDocs(q); const sameRoutine = wSnap.docs.map(d=>d.data()).filter(d => d.routine === r.name).sort((a,b) => b.date - a.date); if(sameRoutine.length > 0) lastWorkoutData = sameRoutine[0].details;
        const now = Date.now();
        activeWorkout = { name: r.name, startTime: now, exs: r.exercises.map(exObj => {
                const name = typeof exObj === 'string' ? exObj : exObj.n; const isSuperset = exObj.s || false; const customSeriesNum = parseInt(exObj.series) || 5; const repsArray = (exObj.reps || "12").split('-'); const data = getExerciseData(name);
                let sets = Array(customSeriesNum).fill().map((_, i) => ({ r: parseInt(repsArray[i] || repsArray[0]), w: 0, d: false, prev: '-', numDisplay: (i + 1).toString() }));
                if(lastWorkoutData) { const prevEx = lastWorkoutData.find(ld => ld.n === name); if(prevEx && prevEx.s) { sets = sets.map((s, i) => { if(prevEx.s[i]) s.prev = `${prevEx.s[i].r}x${prevEx.s[i].w}kg`; return s; }); } }
                return { n:name, img:data.img, mInfo: data.mInfo, type: data.type, video: data.v, sets: sets, superset: isSuperset, note: "" }; 
            })
        };
        saveLocalWorkout(); renderWorkout(); switchTab('workout-view'); startTimerMini();
    } catch(e) { alert("Error iniciando entreno: " + e.message); }
};

window.addSet = (exIdx) => { activeWorkout.exs[exIdx].sets.push({r:12, w:0, d:false, prev:'-', numDisplay: (activeWorkout.exs[exIdx].sets.length + 1).toString()}); saveLocalWorkout(); renderWorkout(); };
window.removeSet = (exIdx) => { if(activeWorkout.exs[exIdx].sets.length > 1) { activeWorkout.exs[exIdx].sets.pop(); saveLocalWorkout(); renderWorkout(); } };
window.toggleAllSets = (exIdx) => { const ex = activeWorkout.exs[exIdx]; const newState = !ex.sets.every(s => s.d); ex.sets.forEach(s => s.d = newState); saveLocalWorkout(); renderWorkout(); };
window.openNoteModal = (idx) => { noteTargetIndex = idx; document.getElementById('exercise-note-input').value = activeWorkout.exs[idx].note || ""; window.openModal('modal-note'); };
window.saveNote = () => { if (noteTargetIndex === null) return; activeWorkout.exs[noteTargetIndex].note = document.getElementById('exercise-note-input').value; saveLocalWorkout(); renderWorkout(); window.closeModal('modal-note'); };

window.toggleRankingOptIn = async (val) => { try { await updateDoc(doc(db, "users", currentUser.uid), { rankingOptIn: val }); userData.rankingOptIn = val; window.loadRankingView(); } catch(e) { alert("Error"); } };
window.changeRankFilter = (type, val) => { if(type === 'time') rankFilterTime = val; if(type === 'gender') rankFilterGender = val; if(type === 'cat') rankFilterCat = val; window.loadRankingView(); };

window.loadRankingView = async () => {
    switchTab('ranking-view'); const list = document.getElementById('ranking-list'); list.innerHTML = '⏳ Calculando...';
    try {
        let orderByField = rankFilterTime === 'all' ? `stats.total${rankFilterCat.charAt(0).toUpperCase() + rankFilterCat.slice(1)}` : `stats_${rankFilterTime}_${getWeekNumber(new Date())}.${rankFilterCat}`;
        if(rankFilterCat === 'workouts') orderByField = "stats.workouts";
        let q = query(collection(db, "users"), where("rankingOptIn", "==", true), orderBy(orderByField || "stats.totalKg", "desc"), limit(50));
        const snap = await getDocs(q); list.innerHTML = "";
        let rank = 1;
        snap.forEach(d => {
            const u = d.data(); const isMe = d.id === currentUser.uid;
            const div = document.createElement('div'); div.className = "ranking-row"; if(isMe) div.style.borderColor = "var(--accent-color)";
            div.innerHTML = `<div class="ranking-pos">#${rank}</div><div style="flex:1;"><b>${u.name}</b></div><div class="rank-value-highlight">${u.stats?.totalKg ? (u.stats.totalKg/1000).toFixed(1)+'t' : '-'}</div>`;
            list.appendChild(div); rank++;
        });
    } catch(e) { list.innerHTML = "Error cargando ranking."; }
};

window.finishWorkout = async (rpeVal) => {
    try {
        window.closeModal('modal-rpe');
        let totalSets = 0, totalReps = 0, totalKg = 0;
        const cleanLog = activeWorkout.exs.map(e => {
            const done = e.sets.filter(s => s.d).map(s => {
                const r = parseInt(s.r) || 0, w = parseFloat(s.w) || 0;
                totalSets++; totalReps += r; totalKg += (r * w);
                return { r, w, isDrop: !!s.isDrop };
            });
            return { n: e.n, s: done, note: e.note || "" };
        }).filter(e => e.s.length > 0);
        if (cleanLog.length === 0) return alert("No hay series completadas.");
        await addDoc(collection(db, "workouts"), { uid: currentUser.uid, date: serverTimestamp(), routine: activeWorkout.name, rpe: rpeVal, details: cleanLog, sessionVolume: totalKg });
        const updates = { "stats.workouts": increment(1), "stats.totalSets": increment(totalSets), "stats.totalReps": increment(totalReps), "stats.totalKg": increment(totalKg), "lastWorkoutDate": serverTimestamp() };
        await updateDoc(doc(db, "users", currentUser.uid), updates);
        localStorage.removeItem('fit_active_workout'); switchTab('routines-view');
    } catch (e) { alert("Error al guardar."); }
};

window.loadAdminUsers = async () => {
    const l = document.getElementById('admin-list'); l.innerHTML = '↻ Cargando...';
    try {
        let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users");
        const s = await getDocs(q); l.innerHTML = '';
        
        // --- PANEL AVISO GLOBAL (TODOS) ---
        const globalCard = document.createElement('div');
        globalCard.className = 'card'; globalCard.style.borderLeft = '4px solid var(--warning-color)';
        globalCard.innerHTML = `
            <h4 style="color:var(--warning-color); margin-bottom:10px;">📢 AVISO GLOBAL (EQUIPO)</h4>
            <input type="text" id="adm-notice-title" placeholder="Título...">
            <textarea id="adm-notice-text" placeholder="Mensaje..." rows="1"></textarea>
            <div style="display:flex; gap:5px; margin-top:5px;">
                <input type="text" id="adm-notice-link" placeholder="Link" style="flex:1; margin:0;">
                <button class="btn-small btn-outline" onclick="document.getElementById('adm-notice-file').click()">📷</button>
                <input type="file" id="adm-notice-file" class="hidden" accept="image/*">
                <button class="btn-small btn" onclick="window.publishNotice('all')" style="background:var(--warning-color); color:black;">ENVIAR</button>
            </div>
        `;
        l.appendChild(globalCard);

        const usersList = s.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.lastWorkoutDate?.seconds || 0) - (a.lastWorkoutDate?.seconds || 0));
        usersList.forEach(u => {
            const avatarHtml = u.photo ? `<img src="${u.photo}" class="mini-avatar">` : `<div class="mini-avatar-placeholder">${u.name.charAt(0)}</div>`;
            const div = document.createElement('div'); div.className = "admin-user-row";
            div.innerHTML = `
                ${avatarHtml}
                <div style="flex:1; overflow:hidden;" onclick="openCoachView('${u.id}')">
                    <div style="font-weight:bold; color:white;">${u.name}</div>
                    <div style="font-size:0.7rem; color:#666;">${u.email}</div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn-small btn-outline" style="border-color:var(--success-color); color:var(--success-color);" onclick="window.openNoticeModal('${u.id}', '${u.name}')">📩</button>
                    <button class="btn-small btn-outline" onclick="openCoachView('${u.id}')">⚙️</button>
                </div>
            `;
            l.appendChild(div);
        });
    } catch (e) { l.innerHTML = 'Error.'; }
};

window.loadAdminLibrary = async () => {
    const l = document.getElementById('admin-lib-list'); l.innerHTML = '↻ Cargando...';
    try {
        const s = await getDocs(collection(db, "routines")); l.innerHTML = '<button class="btn" style="margin-bottom:15px;" onclick="window.openEditor()">+ NUEVA RUTINA</button>';
        s.forEach(d => {
            const r = d.data(); const div = document.createElement('div'); div.className = "assigned-routine-item";
            div.innerHTML = `<div style="flex:1;"><b>${r.name}</b></div><div style="display:flex; gap:5px;"><button class="btn-small btn-outline" onclick="window.openEditor('${d.id}')">✏️</button><button class="btn-small btn" onclick="window.initMassAssignRoutine('${d.id}')">📤</button><button class="btn-small btn-danger" onclick="delRoutine('${d.id}')">🗑️</button></div>`;
            l.appendChild(div);
        });
    } catch(e) { l.innerHTML = "Error"; }
};

window.loadAdminPlans = async () => {
    const list = document.getElementById('admin-plans-list'); const sel = document.getElementById('plan-routine-selector');
    const rSnap = await getDocs(collection(db, "routines")); sel.innerHTML = '';
    rSnap.forEach(d => { sel.innerHTML += `<div class="selector-item"><input type="checkbox" class="plan-check" value="${d.id}" id="chk-${d.id}"><label for="chk-${d.id}">${d.data().name}</label></div>`; });
    const pSnap = await getDocs(collection(db, "plans")); list.innerHTML = '';
    pSnap.forEach(d => { const p = d.data(); list.innerHTML += `<div class="assigned-routine-item"><div style="flex:1;"><b>${p.name}</b></div><button class="btn-small btn" onclick="window.openAssignPlanModal('${d.id}')">📤</button></div>`; });
};

window.createPlan = async () => {
    const n = document.getElementById('new-plan-name').value; const checks = document.querySelectorAll('.plan-check:checked');
    if(!n || checks.length === 0) return alert("Faltan datos");
    await addDoc(collection(db, "plans"), { name: n, routines: Array.from(checks).map(c => c.value), createdBy: currentUser.uid });
    alert("Plan Creado"); window.loadAdminPlans();
};

window.openAssignPlanModal = async (id) => { assignMode = 'plan'; selectedPlanForMassAssign = id; window.openModal('modal-assign-plan'); loadMassUsers(); };
window.initMassAssignRoutine = async (id) => { assignMode = 'routine'; selectedRoutineForMassAssign = id; window.openModal('modal-assign-plan'); loadMassUsers(); };

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
    } catch(e) { alert("Error"); }
};

async function openCoachView(uid) {
    selectedUserCoach = uid; const snap = await getDoc(doc(db, "users", uid)); selectedUserObj = snap.data();
    switchTab('coach-detail-view'); document.getElementById('coach-user-name').innerText = selectedUserObj.name;
    document.getElementById('coach-user-email').innerText = selectedUserObj.email;
    if(selectedUserObj.photo) { document.getElementById('coach-user-img').src = selectedUserObj.photo; document.getElementById('coach-user-img').style.display='block'; document.getElementById('coach-user-initial').style.display='none'; }
    const rList = document.getElementById('coach-assigned-list'); rList.innerHTML = 'Cargando...';
    const rSnap = await getDocs(collection(db, "routines")); rList.innerHTML = '';
    rSnap.forEach(d => { if(d.data().assignedTo?.includes(uid)) rList.innerHTML += `<div class="assigned-routine-item"><span>${d.data().name}</span><button onclick="window.unassignRoutine('${d.id}')">❌</button></div>`; });
    renderMuscleRadar('coachMuscleChart', selectedUserObj.muscleStats || {});
}

window.approveUser = async () => { await updateDoc(doc(db, "users", selectedUserCoach), { approved: true }); alert("✅ Aprobado"); openCoachView(selectedUserCoach); };
window.unassignRoutine = async (rid) => { await updateDoc(doc(db, "routines", rid), { assignedTo: arrayRemove(selectedUserCoach) }); openCoachView(selectedUserCoach); };

window.viewWorkoutDetails = (title, detailsEnc, noteEnc) => {
    const details = JSON.parse(decodeURIComponent(detailsEnc));
    let html = `<p><i>${decodeURIComponent(noteEnc)}</i></p><hr style="margin:10px 0; border:0; border-top:1px solid #333;">`;
    details.forEach(ex => {
        html += `<div style="margin-bottom:10px;"><b>${ex.n}</b><br>`;
        ex.s.forEach((s, idx) => html += `<small>S${idx+1}: ${s.r}x${s.w}kg ${s.isDrop ? '💧' : ''}</small><br>`);
        html += `</div>`;
    });
    document.getElementById('detail-title').innerText = title;
    document.getElementById('detail-content').innerHTML = html;
    window.openModal('modal-details');
};

function saveLocalWorkout() { localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); }
function startTimerMini() { if(durationInt) clearInterval(durationInt); durationInt = setInterval(() => { if(!activeWorkout) return; const diff = Math.floor((Date.now()-activeWorkout.startTime)/1000); document.getElementById('mini-timer').innerText = `${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,'0')}`; }, 1000); }
function showToast(msg) { const t = document.createElement('div'); t.className = 'toast-msg'; t.innerText = msg; (document.getElementById('toast-container') || document.body).appendChild(t); setTimeout(() => t.remove(), 4000); }

document.getElementById('btn-login').onclick = () => signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-pass').value).catch(e => alert(e.message));
document.getElementById('btn-register').onclick = async () => {
    try {
        const c = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-pass').value);
        await setDoc(doc(db, "users", c.user.uid), {
            name: document.getElementById('reg-name').value, email: document.getElementById('reg-email').value, role: 'athlete', approved: false,
            secretCode: document.getElementById('reg-code').value, stats: {workouts:0, totalKg:0, totalSets:0, totalReps:0}, readNotices: [], joined: serverTimestamp()
        });
    } catch(e) { alert(e.message); }
};
