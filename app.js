/**
 * Leitungs-Konfigurator für Anlagenbau
 * Hauptlogik und Navigation
 */

// ===== Globale Variablen =====
let katalog = null;
let leitungGruppen = [];
let currentProjekt = null;
let currentLeitungIndex = 0;
let currentArtikelVorschlag = null;
let wizardStepIndex = 0;
let abarbeitungOrder = [];
let abarbeitungCursor = 0;
let modalResolve = null;
let projectsCache = [];
let wizardSteps = [];
let firebaseReady = false;
let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;
let currentUserRole = 'user';
let firebaseInitError = '';
let firestoreErrorShown = false;

const DEFAULT_WIZARD_STEPS = [
    { id: '000-zuleitung', gruppe: '=000', frage: 'Zuleitung?' },
    { id: '004-ethercat-1', gruppe: '=004', frage: 'Reihenfolge EtherCAT Strang 1?' },
    { id: '004-ethercat-2', gruppe: '=004', frage: 'Reihenfolge EtherCAT Strang 2?' },
    { id: '004-ethercat-3', gruppe: '=004', frage: 'Reihenfolge EtherCAT Strang 3?' },
    { id: '005-panel-ipc', gruppe: '=005', frage: 'Panel und IPC?' },
    { id: '007-tuerschalter', gruppe: '=007', frage: 'Türschalter?' },
    { id: '007-lichtschranken', gruppe: '=007', frage: 'Lichtschranken?' },
    { id: '007-fussschalter', gruppe: '=007', frage: 'Fußschalter?' },
    { id: '007-zweihand', gruppe: '=007', frage: 'Zweihand Bedienpult?' },
    { id: '010-motorleitung', gruppe: '=010', frage: 'Motorleitung?' },
    { id: '010-geberleitung', gruppe: '=010', frage: 'Geberleitung?' },
    { id: '011-bremsen', gruppe: '=011', frage: 'Bremsen, Sensorleitung?' },
    { id: '012-mts-power', gruppe: '=012', frage: 'MTS, Powerleitung?' },
    { id: '013-dms', gruppe: '=013', frage: 'DMS Sensoren mit M12 Stecker?' },
    { id: '014-temp-tisch', gruppe: '=014', frage: 'Temperatursensor Tisch, Sensorleitung?' },
    { id: '014-temp-stoessel', gruppe: '=014', frage: 'Temperatursensor Stößel, Sensorleitung?' },
    { id: '016-nothalt', gruppe: '=016', frage: 'Not-Halt, Sensorleitung?' },
    { id: '020-motorleitung', gruppe: '=020', frage: 'Motorleitung?' },
    { id: '020-geberleitung', gruppe: '=020', frage: 'Geberleitung?' },
    { id: '021-bremsen', gruppe: '=021', frage: 'Bremsen, Sensorleitung?' },
    { id: '022-mts-power', gruppe: '=022', frage: 'MTS, Powerleitung?' },
    { id: '023-dms', gruppe: '=023', frage: 'DMS Sensoren mit M12 Stecker?' },
    { id: '024-temp-tisch', gruppe: '=024', frage: 'Temperatursensor Tisch, Sensorleitung?' },
    { id: '024-temp-stoessel', gruppe: '=024', frage: 'Temperatursensor Stößel, Sensorleitung?' },
    { id: '026-nothalt', gruppe: '=026', frage: 'Not-Halt, Sensorleitung?' },
    { id: '030-motorleitung', gruppe: '=030', frage: 'Motorleitung?' },
    { id: '030-geberleitung', gruppe: '=030', frage: 'Geberleitung?' },
    { id: '031-bremsen', gruppe: '=031', frage: 'Bremsen, Sensorleitung?' },
    { id: '032-mts-power', gruppe: '=032', frage: 'MTS, Powerleitung?' },
    { id: '033-dms', gruppe: '=033', frage: 'DMS Sensoren mit M12 Stecker?' },
    { id: '034-temp-tisch', gruppe: '=034', frage: 'Temperatursensor Tisch, Sensorleitung?' },
    { id: '034-temp-stoessel', gruppe: '=034', frage: 'Temperatursensor Stößel, Sensorleitung?' },
    { id: '036-nothalt', gruppe: '=036', frage: 'Not-Halt, Sensorleitung?' },
    { id: '040-motorleitung', gruppe: '=040', frage: 'Motorleitung?' },
    { id: '040-geberleitung', gruppe: '=040', frage: 'Geberleitung?' },
    { id: '041-bremsen', gruppe: '=041', frage: 'Bremsen, Sensorleitung?' },
    { id: '042-mts-power', gruppe: '=042', frage: 'MTS, Powerleitung?' },
    { id: '043-dms', gruppe: '=043', frage: 'DMS Sensoren mit M12 Stecker?' },
    { id: '044-temp-tisch', gruppe: '=044', frage: 'Temperatursensor Tisch, Sensorleitung?' },
    { id: '044-temp-stoessel', gruppe: '=044', frage: 'Temperatursensor Stößel, Sensorleitung?' },
    { id: '046-nothalt', gruppe: '=046', frage: 'Not-Halt, Sensorleitung?' }
];

// ===== Modal Dialog Funktionen =====
function showModal(message, options = {}) {
    const overlay = document.getElementById('modal-overlay');
    const icon = document.getElementById('modal-icon');
    const title = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const bodyEl = messageEl.parentElement;
    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');
    
    // Defaults
    const type = options.type || 'info';
    const titleText = options.title || (type === 'danger' ? 'Achtung' : type === 'success' ? 'Erfolg' : 'Hinweis');
    const confirmText = options.confirmText || 'OK';
    const cancelText = options.cancelText || 'Abbrechen';
    const showCancel = options.showCancel !== undefined ? options.showCancel : false;
    const requireTextMatch = options.requireTextMatch || false;
    const expectedText = options.expectedText || '';
    const textMatchLabel = options.textMatchLabel || 'Bestätigung';
    const textMatchPlaceholder = options.textMatchPlaceholder || '';
    
    // Icons basierend auf Typ
    const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        danger: '🗑️'
    };
    
    // Setze Inhalt
    icon.textContent = icons[type] || icons.info;
    title.textContent = titleText;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    
    // Zeige/verstecke Abbrechen-Button
    cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';
    
    // Setze Button-Stil basierend auf Typ
    confirmBtn.className = type === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

    // Eventhandler zurücksetzen, damit bei wiederholtem Öffnen nichts doppelt hängt
    confirmBtn.onclick = () => closeModal(true);
    cancelBtn.onclick = () => closeModal(false);

    // Vorhandene dynamische Eingaben entfernen
    const existingConfirmInput = document.getElementById('modal-text-confirm-group');
    if (existingConfirmInput) {
        existingConfirmInput.remove();
    }

    if (requireTextMatch) {
        const inputGroup = document.createElement('div');
        inputGroup.id = 'modal-text-confirm-group';
        inputGroup.className = 'modal-text-confirm-group';

        const label = document.createElement('label');
        label.setAttribute('for', 'modal-text-confirm-input');
        label.textContent = textMatchLabel;
        label.className = 'modal-text-confirm-label';

        const input = document.createElement('input');
        input.id = 'modal-text-confirm-input';
        input.type = 'text';
        input.placeholder = textMatchPlaceholder;
        input.autocomplete = 'off';
        input.className = 'modal-text-confirm-input';

        inputGroup.appendChild(label);
        inputGroup.appendChild(input);
        bodyEl.appendChild(inputGroup);

        const validateInput = () => {
            const matches = input.value.trim() === expectedText;
            confirmBtn.disabled = !matches;
        };

        confirmBtn.disabled = true;
        input.addEventListener('input', validateInput);
        setTimeout(() => input.focus(), 0);
    } else {
        confirmBtn.disabled = false;
    }
    
    // Entferne alte Typ-Klassen und füge neue hinzu
    overlay.className = 'modal-overlay active modal-' + type;
    
    // Rückgabe als Promise für async/await
    return new Promise(resolve => {
        modalResolve = resolve;
    });
}

function closeModal(result = true) {
    const overlay = document.getElementById('modal-overlay');
    const confirmBtn = document.getElementById('modal-confirm');

    // Bestätigen blockieren, solange Pflicht-Eingabe nicht erfüllt ist
    if (result === true && confirmBtn && confirmBtn.disabled) {
        return;
    }

    overlay.classList.remove('active');
    
    if (modalResolve) {
        modalResolve(result);
        modalResolve = null;
    }
}

// Keyboard-Support für Modal
document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('modal-overlay');
    if (overlay && overlay.classList.contains('active')) {
        if (e.key === 'Escape') {
            closeModal(false);
        } else if (e.key === 'Enter') {
            closeModal(true);
        }
    }
});

// ===== Initialisierung =====
document.addEventListener('DOMContentLoaded', async () => {
    await loadKatalog();
    wizardSteps = [...DEFAULT_WIZARD_STEPS];
    initFirebase();

    if (firebaseReady) {
        firebaseAuth.onAuthStateChanged(async user => {
            if (!user) {
                currentUser = null;
                currentUserRole = 'user';
                currentProjekt = null;
                projectsCache = [];
                updateAuthUI();
                showView('auth');
                return;
            }

            currentUser = user;
            await ensureUserProfile(user);
            await loadWizardQuestions();
            await loadProjects();
            updateAuthUI();
            showView('home');
        });
    } else {
        await loadProjects();
        updateAuthUI();
        showView('home');
        if (window.firebaseConfig?.apiKey) {
            showModal(
                `Firebase konnte nicht aktiviert werden.\n\n${firebaseInitError || 'Unbekannter Fehler'}\n\nAktuell läuft die App nur lokal.`,
                { type: 'warning', title: 'Firebase-Problem' }
            );
        }
    }
});

function initFirebase() {
    if (!window.firebase || !window.firebaseConfig || !window.firebaseConfig.apiKey) {
        console.warn('Firebase nicht konfiguriert - lokale Speicherung aktiv.');
        firebaseReady = false;
        firebaseInitError = 'Firebase-Konfiguration fehlt oder ist unvollständig.';
        return;
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(window.firebaseConfig);
        }
        firebaseAuth = firebase.auth();
        firebaseDb = firebase.firestore();
        firebaseReady = true;
        firebaseInitError = '';
    } catch (error) {
        console.error('Firebase Initialisierung fehlgeschlagen:', error);
        firebaseReady = false;
        firebaseInitError = error?.message || 'Firebase konnte nicht initialisiert werden.';
    }
}

function getProjectsStorageKey() {
    const userPart = currentUser?.uid || 'local';
    return `leitungskonfigurator_projekte_${userPart}`;
}

function getUserProjectsDoc() {
    if (!firebaseReady || !currentUser || !firebaseDb) return null;
    return firebaseDb.collection('users').doc(currentUser.uid).collection('app').doc('projects');
}

function getWizardConfigDoc() {
    if (!firebaseReady || !firebaseDb) return null;
    return firebaseDb.collection('config').doc('wizardQuestions');
}

async function ensureUserProfile(user) {
    if (!firebaseReady || !firebaseDb || !user) return;

    const ref = firebaseDb.collection('users').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
        await ref.set({
            email: user.email || '',
            role: 'user',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        currentUserRole = 'user';
    } else {
        const data = snap.data() || {};
        currentUserRole = data.role || 'user';
    }
}

async function loadWizardQuestions() {
    wizardSteps = [...DEFAULT_WIZARD_STEPS];
    if (!firebaseReady) return;

    try {
        const ref = getWizardConfigDoc();
        if (!ref) return;
        const snap = await ref.get();
        if (!snap.exists) return;
        const data = snap.data() || {};
        if (!Array.isArray(data.steps) || data.steps.length === 0) return;

        const valid = data.steps.filter(step =>
            step && step.id && step.gruppe && step.frage
        );
        if (valid.length > 0) {
            wizardSteps = valid;
        }
    } catch (error) {
        console.error('Fehler beim Laden der Wizard-Fragen:', error);
    }
}

function updateAuthUI() {
    const navLogout = document.getElementById('nav-logout');
    const navUser = document.getElementById('nav-user');
    const navAdmin = document.getElementById('nav-admin');
    if (!navLogout || !navUser || !navAdmin) return;

    if (currentUser) {
        navLogout.classList.remove('hidden');
        navUser.classList.remove('hidden');
        navUser.textContent = currentUser.email || '';
        if (currentUserRole === 'admin') {
            navAdmin.classList.remove('hidden');
        } else {
            navAdmin.classList.add('hidden');
        }
    } else {
        navLogout.classList.add('hidden');
        navUser.classList.add('hidden');
        navAdmin.classList.add('hidden');
        navUser.textContent = '';
    }
}

async function loginUser() {
    if (!firebaseReady || !firebaseAuth) {
        await showModal('Firebase ist nicht konfiguriert. Bitte zuerst `firebase-config.js` ausfüllen.', {
            type: 'warning',
            title: 'Firebase fehlt'
        });
        return;
    }
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) {
        showModal('Bitte E-Mail und Passwort eingeben.', { type: 'warning', title: 'Fehlende Eingabe' });
        return;
    }
    try {
        await firebaseAuth.signInWithEmailAndPassword(email, password);
        await loadProjects();
        updateAuthUI();
        showView('home');
    } catch (error) {
        showModal(`Anmeldung fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
    }
}

async function registerUser() {
    if (!firebaseReady || !firebaseAuth) {
        await showModal('Firebase ist nicht konfiguriert. Bitte zuerst `firebase-config.js` ausfüllen.', {
            type: 'warning',
            title: 'Firebase fehlt'
        });
        return;
    }
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const repeat = document.getElementById('auth-password-repeat').value;
    if (!email || !password) {
        showModal('Bitte E-Mail und Passwort eingeben.', { type: 'warning', title: 'Fehlende Eingabe' });
        return;
    }
    if (password !== repeat) {
        showModal('Passwort und Wiederholung stimmen nicht überein.', { type: 'warning', title: 'Eingabe prüfen' });
        return;
    }
    try {
        await firebaseAuth.createUserWithEmailAndPassword(email, password);
        showModal('Registrierung erfolgreich. Sie sind jetzt angemeldet.', { type: 'success', title: 'Erfolg' });
    } catch (error) {
        showModal(`Registrierung fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
    }
}

async function logoutUser() {
    if (!currentUser) {
        showView('auth');
        return;
    }

    if (firebaseReady && firebaseAuth) {
        await firebaseAuth.signOut();
    } else {
        currentUser = null;
        showView('auth');
    }
}

async function loadKatalog() {
    try {
        const [katalogResponse, gruppenResponse] = await Promise.all([
            fetch('data/leitungen.json'),
            fetch('data/gruppen.json')
        ]);

        katalog = await katalogResponse.json();
        const gruppenData = await gruppenResponse.json();
        leitungGruppen = Array.isArray(gruppenData.gruppen) ? gruppenData.gruppen : [];
        console.log('Katalog geladen:', katalog);
        console.log('Leitungsgruppen geladen:', leitungGruppen.length);
    } catch (error) {
        console.error('Fehler beim Laden des Katalogs:', error);
        katalog = {
            hersteller: [],
            artikel: [],
            steckertypen: [],
            standardlaengen: []
        };
        leitungGruppen = [];
    }
}

// ===== Navigation =====
function showView(viewName) {
    if (firebaseReady && !currentUser && viewName !== 'auth') {
        viewName = 'auth';
    }

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    const view = document.getElementById('view-' + viewName);
    if (view) {
        view.classList.add('active');
    }
    
    switch(viewName) {
        case 'auth':
            break;
        case 'home':
            loadProjects();
            break;
        case 'admin':
            renderAdminView();
            break;
        case 'projekt-form':
            break;
        case 'projekt-wizard':
            renderProjektWizard();
            break;
        case 'konfigurator':
            initKonfigurator();
            break;
        case 'uebersicht':
            renderUebersicht();
            break;
        case 'stueckliste':
            renderStueckliste();
            break;
        case 'abarbeitung':
            renderAbarbeitung();
            break;
    }
}

function openNewProjektForm() {
    resetProjektForm();
    currentProjekt = null;
    showView('projekt-form');
}

function backToOverview() {
    saveCurrentLeitung();
    showView('uebersicht');
}

function saveLeitungAndNotify() {
    saveCurrentLeitung();
    showView('uebersicht');
}

// ===== Projekt-Management =====
function getProjects() {
    return Array.isArray(projectsCache) ? projectsCache : [];
}

function saveProjects(projects) {
    projectsCache = Array.isArray(projects) ? projects : [];
    localStorage.setItem(getProjectsStorageKey(), JSON.stringify(projectsCache));
    if (!currentUser) {
        localStorage.setItem('leitungskonfigurator_projekte', JSON.stringify(projectsCache));
    }

    const ref = getUserProjectsDoc();
    if (ref) {
        ref.set({
            projects: projectsCache,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(error => {
            console.error('Fehler beim Speichern in Firestore:', error);
            if (!firestoreErrorShown) {
                firestoreErrorShown = true;
                showModal(`Firestore-Speichern fehlgeschlagen:\n${error.message}`, {
                    type: 'danger',
                    title: 'Firebase Fehler'
                });
            }
        });
    }
}

function persistCurrentProjekt() {
    if (!currentProjekt) return;
    const projects = getProjects();
    const idx = projects.findIndex(p => p.id === currentProjekt.id);
    if (idx >= 0) {
        projects[idx] = currentProjekt;
        saveProjects(projects);
    }
}

async function loadProjects() {
    const liste = document.getElementById('projekt-liste');
    const empty = document.getElementById('keine-projekte');

    if (firebaseReady && currentUser) {
        try {
            const ref = getUserProjectsDoc();
            const snap = ref ? await ref.get() : null;
            const remoteProjects = snap?.exists ? (snap.data().projects || []) : [];
            projectsCache = Array.isArray(remoteProjects) ? remoteProjects : [];
            localStorage.setItem(getProjectsStorageKey(), JSON.stringify(projectsCache));
        } catch (error) {
            console.error('Fehler beim Laden aus Firestore:', error);
            if (!firestoreErrorShown) {
                firestoreErrorShown = true;
                showModal(`Firestore-Laden fehlgeschlagen:\n${error.message}`, {
                    type: 'danger',
                    title: 'Firebase Fehler'
                });
            }
            const fallback = localStorage.getItem(getProjectsStorageKey());
            projectsCache = fallback ? JSON.parse(fallback) : [];
        }
    } else {
        const data = localStorage.getItem(getProjectsStorageKey()) || localStorage.getItem('leitungskonfigurator_projekte');
        projectsCache = data ? JSON.parse(data) : [];
    }
    
    const projects = getProjects();
    
    if (projects.length === 0) {
        liste.innerHTML = '';
        liste.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    
    liste.style.display = 'grid';
    empty.style.display = 'none';
    
    liste.innerHTML = projects.map(p => `
        <div class="projekt-card" onclick="openProjekt('${p.id}')" title="Projekt öffnen">
            <div class="projekt-info">
                <h3>
                    <span class="projekt-nummer">${escapeHtml(p.projektnummer)}</span>
                    ${escapeHtml(p.name)}
                </h3>
                <div class="projekt-meta">
                    ${p.kunde ? `<span>Kunde: ${escapeHtml(p.kunde)}</span>` : ''}
                    ${p.liefertermin ? `<span>Liefertermin: ${formatDate(p.liefertermin)}</span>` : ''}
                    <span>Leitungen: ${p.leitungen ? p.leitungen.length : 0}</span>
                </div>
            </div>
            <div class="projekt-actions">
                <button class="btn btn-primary btn-small" onclick="event.stopPropagation(); openProjekt('${p.id}')">
                    Öffnen
                </button>
                <button class="btn btn-secondary btn-small" onclick="event.stopPropagation(); editProjekt('${p.id}')">
                    Bearbeiten
                </button>
                <button class="btn btn-danger btn-small" onclick="event.stopPropagation(); deleteProjekt('${p.id}')">
                    Löschen
                </button>
            </div>
        </div>
    `).join('');
}

function ensureWizardAnswers(projekt) {
    if (!projekt) return;
    if (!projekt.wizardAnswers || typeof projekt.wizardAnswers !== 'object') {
        projekt.wizardAnswers = {};
    }
}

// ===== Export / Import Funktionen =====
function exportAllProjects() {
    const projects = getProjects();
    
    if (projects.length === 0) {
        showModal('Keine Projekte zum Speichern vorhanden.', { type: 'warning', title: 'Hinweis' });
        return;
    }
    
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        projects: projects
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const filename = `Leitungsprojekte_${formatDateForFile(new Date())}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showModal(`${projects.length} Projekt(e) wurden gespeichert als:\n${filename}`, { type: 'success', title: 'Gespeichert' });
}

function importProjects(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // Prüfen ob gültiges Format
            if (!importData.projects || !Array.isArray(importData.projects)) {
                throw new Error('Ungültiges Dateiformat');
            }
            
            const existingProjects = getProjects();
            const importCount = importData.projects.length;
            
            // Fragen ob ersetzen oder hinzufügen
            if (existingProjects.length > 0) {
                const choice = await showModal(
                    `Es wurden ${importCount} Projekt(e) gefunden.\n\nSie haben bereits ${existingProjects.length} Projekt(e).\n\nMöchten Sie alle ersetzen?`,
                    { 
                        type: 'warning', 
                        title: 'Projekte importieren',
                        showCancel: true,
                        confirmText: 'Ersetzen',
                        cancelText: 'Abbrechen'
                    }
                );
                if (!choice) {
                    event.target.value = '';
                    return;
                }
            }
            
            // Projekte speichern
            saveProjects(importData.projects);
            loadProjects();
            
            showModal(`${importCount} Projekt(e) wurden erfolgreich importiert.`, { type: 'success', title: 'Import erfolgreich' });
            
        } catch (error) {
            console.error('Import-Fehler:', error);
            showModal('Fehler beim Importieren:\n' + error.message + '\n\nBitte prüfen Sie, ob die Datei ein gültiges Projektformat hat.', { type: 'danger', title: 'Fehler' });
        }
        
        // Input zurücksetzen
        event.target.value = '';
    };
    
    reader.readAsText(file);
}

function resetProjektForm() {
    document.getElementById('projekt-form-titel').textContent = 'Neues Projekt anlegen';
    document.getElementById('projekt-form').reset();
    document.getElementById('projekt-id').value = '';
}

function saveProjekt(event) {
    event.preventDefault();
    
    const id = document.getElementById('projekt-id').value || generateId('proj');
    const isNew = !document.getElementById('projekt-id').value;
    
    const projekt = {
        id: id,
        projektnummer: document.getElementById('projektnummer').value.trim(),
        name: document.getElementById('projektname').value.trim(),
        kunde: document.getElementById('kunde').value.trim(),
        liefertermin: document.getElementById('liefertermin').value,
        notiz: document.getElementById('projekt-notiz').value.trim(),
        erstellt: isNew ? new Date().toISOString() : undefined,
        leitungen: [],
        wizardAnswers: {}
    };
    
    const projects = getProjects();
    const existingIndex = projects.findIndex(p => p.id === id);
    
    if (existingIndex >= 0) {
        projekt.erstellt = projects[existingIndex].erstellt;
        projekt.leitungen = projects[existingIndex].leitungen || [];
        projekt.wizardAnswers = projects[existingIndex].wizardAnswers || {};
        projects[existingIndex] = projekt;
    } else {
        projects.unshift(projekt);
    }
    
    saveProjects(projects);
    currentProjekt = projekt;
    currentLeitungIndex = 0;
    ensureWizardAnswers(currentProjekt);
    wizardStepIndex = 0;

    if (isNew) {
        showView('projekt-wizard');
    } else {
        showView('uebersicht');
    }
}

function openProjekt(id) {
    const projects = getProjects();
    currentProjekt = projects.find(p => p.id === id);
    
    if (currentProjekt) {
        currentLeitungIndex = 0;
        ensureWizardAnswers(currentProjekt);
        showView('uebersicht');
    }
}

function editProjekt(id) {
    const projects = getProjects();
    const projekt = projects.find(p => p.id === id);
    
    if (projekt) {
        document.getElementById('projekt-form-titel').textContent = 'Projekt bearbeiten';
        document.getElementById('projekt-id').value = projekt.id;
        document.getElementById('projektnummer').value = projekt.projektnummer;
        document.getElementById('projektname').value = projekt.name;
        document.getElementById('kunde').value = projekt.kunde || '';
        document.getElementById('liefertermin').value = projekt.liefertermin || '';
        document.getElementById('projekt-notiz').value = projekt.notiz || '';
        
        currentProjekt = projekt;
        ensureWizardAnswers(currentProjekt);
        showView('projekt-form');
    }
}

function startProjektWizard() {
    if (!currentProjekt) return;
    ensureWizardAnswers(currentProjekt);
    if (!wizardSteps.length) {
        showModal('Keine Assistent-Fragen vorhanden. Bitte als Admin Fragen konfigurieren.', {
            type: 'warning',
            title: 'Assistent leer'
        });
        return;
    }

    const firstOpen = wizardSteps.findIndex(step => {
        const val = currentProjekt.wizardAnswers[step.id];
        return !val || !String(val).trim();
    });
    wizardStepIndex = firstOpen >= 0 ? firstOpen : 0;
    showView('projekt-wizard');
}

function getArtikelByNummer(artikelnummer) {
    if (!katalog || !Array.isArray(katalog.artikel) || !artikelnummer) return null;
    const gesucht = artikelnummer.trim().toLowerCase();
    return katalog.artikel.find(a => (a.artikelnummer || '').toLowerCase() === gesucht) || null;
}

function getWizardDefaultBezeichnung(step) {
    if (!step || !step.frage) return '';
    return step.frage.replace(/\?+$/, '').trim();
}

function getWizardArtikelPool() {
    return (katalog && Array.isArray(katalog.artikel)) ? katalog.artikel : [];
}

function getCurrentWizardStep() {
    return wizardSteps[wizardStepIndex] || null;
}

function getWizardDefaultKategorie(step) {
    if (step?.defaultCategory) return step.defaultCategory;
    if (Array.isArray(step?.allowedCategories) && step.allowedCategories.length === 1) {
        return step.allowedCategories[0];
    }
    const text = (step?.frage || '').toLowerCase();
    if (text.includes('ethercat')) return 'ethercat';
    if (text.includes('power')) return 'power';
    if (text.includes('sensor') || text.includes('geber') || text.includes('lichtschranken') || text.includes('not-halt')) {
        return 'sensor';
    }
    return '';
}

function getWizardKategorie() {
    const select = document.getElementById('wizard-kategorie');
    return select ? select.value : '';
}

function getWizardArtikelByKategorie() {
    const kategorie = getWizardKategorie();
    if (!kategorie) return getWizardArtikelPool();
    return getWizardArtikelPool().filter(a => a.kategorie === kategorie);
}

function populateWizardKategorieDropdown() {
    const select = document.getElementById('wizard-kategorie');
    if (!select) return;

    const currentValue = select.value;
    const step = getCurrentWizardStep();
    const allowed = Array.isArray(step?.allowedCategories) ? step.allowedCategories : null;
    const kategorien = (katalog?.kategorien || [])
        .map(k => ({ value: k.id, label: k.name }))
        .filter(k => k.value && (!allowed || allowed.includes(k.value)));

    select.innerHTML = '<option value="">-- Bitte wählen --</option>';
    kategorien.forEach(k => {
        const option = document.createElement('option');
        option.value = k.value;
        option.textContent = k.label;
        select.appendChild(option);
    });

    if (currentValue && kategorien.some(k => k.value === currentValue)) {
        select.value = currentValue;
    }
}

function populateWizardHerstellerDropdown() {
    const select = document.getElementById('wizard-hersteller');
    if (!select) return;

    const currentValue = select.value;
    const hersteller = Array.from(new Set(getWizardArtikelByKategorie().map(a => a.hersteller).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'de'));

    select.innerHTML = '<option value="">-- Bitte wählen --</option>';
    hersteller.forEach(h => {
        const option = document.createElement('option');
        option.value = h;
        option.textContent = h;
        select.appendChild(option);
    });

    if (currentValue && hersteller.includes(currentValue)) {
        select.value = currentValue;
    }
}

function getWizardArtikelByHersteller(hersteller) {
    return getWizardArtikelByKategorie().filter(a => a.hersteller === hersteller);
}

function getWizardPairMatches(hersteller, steckerABase, steckerBBase) {
    const artikel = getWizardArtikelByHersteller(hersteller);
    return artikel.filter(a =>
        (getBaseSteckerTyp(a.steckerA) === steckerABase && getBaseSteckerTyp(a.steckerB) === steckerBBase) ||
        (getBaseSteckerTyp(a.steckerA) === steckerBBase && getBaseSteckerTyp(a.steckerB) === steckerABase)
    );
}

function onWizardKategorieChange() {
    const steckerASelect = document.getElementById('wizard-stecker-a');
    const steckerBSelect = document.getElementById('wizard-stecker-b');
    const laengeSelect = document.getElementById('wizard-laenge');
    steckerASelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    steckerBSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    laengeSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    populateWizardHerstellerDropdown();
    onWizardHerstellerChange();
}

function onWizardHerstellerChange() {
    const hersteller = document.getElementById('wizard-hersteller').value;
    const steckerASelect = document.getElementById('wizard-stecker-a');
    const steckerBSelect = document.getElementById('wizard-stecker-b');
    const laengeSelect = document.getElementById('wizard-laenge');

    steckerASelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    steckerBSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    laengeSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';

    if (!hersteller) {
        updateWizardAutoArtikel();
        return;
    }

    const steckerAOptions = new Set();
    getWizardArtikelByHersteller(hersteller).forEach(a => {
        if (a.steckerA) steckerAOptions.add(getBaseSteckerTyp(a.steckerA));
        if (a.steckerB) steckerAOptions.add(getBaseSteckerTyp(a.steckerB));
    });

    Array.from(steckerAOptions).sort((a, b) => a.localeCompare(b, 'de')).forEach(s => {
        const option = document.createElement('option');
        option.value = s;
        option.textContent = s;
        steckerASelect.appendChild(option);
    });

    updateWizardAutoArtikel();
}

function onWizardSteckerAChange() {
    const hersteller = document.getElementById('wizard-hersteller').value;
    const steckerABase = document.getElementById('wizard-stecker-a').value;
    const steckerBSelect = document.getElementById('wizard-stecker-b');
    const laengeSelect = document.getElementById('wizard-laenge');

    steckerBSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    laengeSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';

    if (!hersteller || !steckerABase) {
        updateWizardAutoArtikel();
        return;
    }

    const steckerBOptions = new Set();
    getWizardArtikelByHersteller(hersteller).forEach(a => {
        const baseA = getBaseSteckerTyp(a.steckerA);
        const baseB = getBaseSteckerTyp(a.steckerB);
        if (baseA === steckerABase && baseB) steckerBOptions.add(baseB);
        if (baseB === steckerABase && baseA) steckerBOptions.add(baseA);
    });

    Array.from(steckerBOptions)
        .sort((a, b) => a.localeCompare(b, 'de'))
        .forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = s;
            steckerBSelect.appendChild(option);
        });

    updateWizardAutoArtikel();
}

function onWizardSteckerBChange() {
    const hersteller = document.getElementById('wizard-hersteller').value;
    const steckerABase = document.getElementById('wizard-stecker-a').value;
    const steckerBBase = document.getElementById('wizard-stecker-b').value;
    const laengeSelect = document.getElementById('wizard-laenge');

    laengeSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';

    if (!hersteller || !steckerABase || !steckerBBase) {
        updateWizardAutoArtikel();
        return;
    }

    const laengen = Array.from(new Set(
        getWizardPairMatches(hersteller, steckerABase, steckerBBase)
            .map(a => a.laenge)
            .filter(l => typeof l === 'number' && l > 0)
    )).sort((a, b) => a - b);

    laengen.forEach(l => {
        const option = document.createElement('option');
        option.value = String(l);
        option.textContent = `${l} m`;
        laengeSelect.appendChild(option);
    });

    updateWizardAutoArtikel();
}

function onWizardLaengeChange() {
    updateWizardAutoArtikel();
}

function updateWizardAutoArtikel() {
    const resultDiv = document.getElementById('wizard-auto-artikel');
    const artikelInput = document.getElementById('wizard-artikelnummer');
    if (!resultDiv || !artikelInput) return;

    const hersteller = document.getElementById('wizard-hersteller').value;
    const steckerABase = document.getElementById('wizard-stecker-a').value;
    const steckerBBase = document.getElementById('wizard-stecker-b').value;
    const laengeRaw = document.getElementById('wizard-laenge').value;
    const laenge = laengeRaw ? parseFloat(laengeRaw) : null;

    if (!hersteller || !steckerABase || !steckerBBase) {
        resultDiv.className = 'wizard-auto-result no-match';
        resultDiv.innerHTML = '<span class="artikel-label">Bitte Hersteller, Stecker A/B und Länge wählen</span>';
        return;
    }

    const matches = getWizardPairMatches(hersteller, steckerABase, steckerBBase);
    if (matches.length === 0) {
        resultDiv.className = 'wizard-auto-result no-match';
        resultDiv.innerHTML = '<span class="artikel-label">Keine passende Leitung gefunden</span>';
        return;
    }

    let artikel = null;
    if (laenge !== null && !Number.isNaN(laenge)) {
        artikel = matches
            .filter(a => a.laenge === laenge)
            .sort((a, b) => {
                const aScore = (a.steckerA.includes('gewinkelt') ? 1 : 0) + (a.steckerB.includes('gewinkelt') ? 1 : 0);
                const bScore = (b.steckerA.includes('gewinkelt') ? 1 : 0) + (b.steckerB.includes('gewinkelt') ? 1 : 0);
                return aScore - bScore;
            })[0] || null;
        if (!artikel) {
            resultDiv.className = 'wizard-auto-result no-match';
            resultDiv.innerHTML = '<span class="artikel-label">Für diese Länge wurde kein Artikel gefunden</span>';
            return;
        }
    } else if (matches.length === 1) {
        artikel = matches[0];
    } else {
        resultDiv.className = 'wizard-auto-result no-match';
        resultDiv.innerHTML = '<span class="artikel-label">Mehrere Treffer - bitte Länge wählen</span>';
        return;
    }

    artikelInput.value = artikel.artikelnummer || '';
    resultDiv.className = 'wizard-auto-result';
    resultDiv.innerHTML = `
        <span class="artikel-nummer">${escapeHtml(artikel.artikelnummer || '')}</span>
        <span class="artikel-beschreibung">${escapeHtml(artikel.beschreibung || '')}</span>
    `;
}

function populateWizardArtikelVorschlaege() {
    const datalist = document.getElementById('wizard-artikel-vorschlaege');
    if (!datalist || !katalog || !Array.isArray(katalog.artikel)) return;

    const uniqueArtikel = Array.from(new Set(
        katalog.artikel
            .map(a => a.artikelnummer)
            .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'de'));

    datalist.innerHTML = uniqueArtikel
        .map(nr => `<option value="${escapeHtml(nr)}"></option>`)
        .join('');
}

function renderWizardCreatedLeitungen(step) {
    const container = document.getElementById('wizard-created-list');
    if (!container || !currentProjekt || !step) return;

    const leitungen = (currentProjekt.leitungen || []).filter(l => l.wizardStepId === step.id);
    if (leitungen.length === 0) {
        container.innerHTML = '<p class="konfig-list-empty">Noch keine Leitungen zu dieser Frage angelegt.</p>';
        return;
    }

    const grouped = new Map();
    leitungen.forEach(l => {
        const artikel = l.artikelnummer || l.artikelCustom || '(ohne Artikelnummer)';
        const bezeichnung = l.bezeichnung || '-';
        const key = `${artikel}|||${bezeichnung}`;
        if (!grouped.has(key)) {
            grouped.set(key, { artikel, bezeichnung, count: 0 });
        }
        grouped.get(key).count += 1;
    });

    const rows = Array.from(grouped.values())
        .sort((a, b) => a.artikel.localeCompare(b.artikel, 'de'))
        .map(item => `
            <li>
                <span class="artikel">${escapeHtml(item.artikel)}</span>
                <span>${escapeHtml(item.bezeichnung)}</span>
                <span class="count">${item.count}</span>
            </li>
        `).join('');

    container.innerHTML = `
        <h4>Zu dieser Frage angelegte Leitungen (${leitungen.length})</h4>
        <ul>${rows}</ul>
    `;
}

function wizardAddLeitungFromStep() {
    if (!currentProjekt) return;
    ensureWizardAnswers(currentProjekt);

    const step = wizardSteps[wizardStepIndex];
    if (!step) return;

    const artikelInput = document.getElementById('wizard-artikelnummer');
    const anzahlInput = document.getElementById('wizard-anzahl');
    const bezInput = document.getElementById('wizard-leitungsbezeichnung');

    const artikelnummerRaw = artikelInput.value.trim();
    if (!artikelnummerRaw) {
        showModal('Bitte eine Artikelnummer eingeben, um eine Leitung anzulegen.', {
            type: 'warning',
            title: 'Artikelnummer fehlt'
        });
        return;
    }

    let anzahl = parseInt(anzahlInput.value, 10);
    if (Number.isNaN(anzahl) || anzahl < 1) anzahl = 1;
    if (anzahl > 200) anzahl = 200;

    const artikel = getArtikelByNummer(artikelnummerRaw);
    const bezeichnung = bezInput.value.trim() || getWizardDefaultBezeichnung(step);

    if (!Array.isArray(currentProjekt.leitungen)) {
        currentProjekt.leitungen = [];
    }

    for (let i = 0; i < anzahl; i++) {
        const leitung = {
            id: generateId('ltg'),
            position: currentProjekt.leitungen.length + 1,
            bezeichnung: bezeichnung,
            kategorie: artikel?.kategorie || 'sonstiges',
            gruppe: step.gruppe,
            hersteller: artikel?.hersteller || '',
            artikelnummer: artikel ? artikel.artikelnummer : artikelnummerRaw,
            artikelCustom: '',
            laenge: artikel?.laenge || 0,
            steckerA: artikel?.steckerA || '',
            steckerB: artikel?.steckerB || '',
            notiz: artikel ? '' : 'Im Schaltplan-Assistent ohne Katalogtreffer angelegt',
            erledigt: false,
            wizardStepId: step.id
        };
        currentProjekt.leitungen.push(leitung);
    }

    currentProjekt.leitungen.forEach((l, idx) => {
        l.position = idx + 1;
    });

    persistCurrentProjekt();
    artikelInput.value = '';
    anzahlInput.value = '1';
    renderWizardCreatedLeitungen(step);
}

function saveCurrentWizardAnswer() {
    if (!currentProjekt) return;
    ensureWizardAnswers(currentProjekt);
    const step = wizardSteps[wizardStepIndex];
    if (!step) return;

    const textarea = document.getElementById('wizard-antwort');
    currentProjekt.wizardAnswers[step.id] = textarea ? textarea.value.trim() : '';
    persistCurrentProjekt();
}

function renderProjektWizard() {
    if (!currentProjekt) {
        showView('home');
        return;
    }

    ensureWizardAnswers(currentProjekt);

    const total = wizardSteps.length;
    if (total === 0) {
        showModal('Keine Assistent-Fragen vorhanden. Bitte als Admin Fragen konfigurieren.', {
            type: 'warning',
            title: 'Assistent leer'
        });
        showView('uebersicht');
        return;
    }
    if (wizardStepIndex < 0) wizardStepIndex = 0;
    if (wizardStepIndex >= total) wizardStepIndex = total - 1;

    const step = getCurrentWizardStep();
    const answer = currentProjekt.wizardAnswers[step.id] || '';

    document.getElementById('wizard-titel').textContent =
        `Schaltplan-Assistent - ${currentProjekt.projektnummer} - ${currentProjekt.name}`;
    document.getElementById('wizard-progress').textContent = `Frage ${wizardStepIndex + 1} von ${total}`;
    document.getElementById('wizard-gruppe').textContent = step.gruppe;
    document.getElementById('wizard-frage').textContent = step.frage;
    document.getElementById('wizard-antwort').value = answer;
    document.getElementById('wizard-hersteller').value = 'Beckhoff';
    document.getElementById('wizard-stecker-a').innerHTML = '<option value="">-- Bitte wählen --</option>';
    document.getElementById('wizard-stecker-b').innerHTML = '<option value="">-- Bitte wählen --</option>';
    document.getElementById('wizard-laenge').innerHTML = '<option value="">-- Bitte wählen --</option>';
    document.getElementById('wizard-artikelnummer').value = '';
    document.getElementById('wizard-anzahl').value = '1';
    document.getElementById('wizard-leitungsbezeichnung').value = '';
    document.getElementById('wizard-leitungsbezeichnung').placeholder = getWizardDefaultBezeichnung(step);

    const prevBtn = document.getElementById('wizard-prev');
    const nextBtn = document.getElementById('wizard-next');
    prevBtn.style.display = wizardStepIndex > 0 ? 'inline-flex' : 'none';
    nextBtn.textContent = wizardStepIndex === total - 1 ? 'Fertig zur Übersicht' : 'Weiter →';

    populateWizardArtikelVorschlaege();
    populateWizardKategorieDropdown();
    document.getElementById('wizard-kategorie').value = getWizardDefaultKategorie(step);
    populateWizardHerstellerDropdown();
    onWizardHerstellerChange();
    renderWizardCreatedLeitungen(step);
}

function wizardPrev() {
    if (wizardStepIndex <= 0) return;
    saveCurrentWizardAnswer();
    wizardStepIndex--;
    renderProjektWizard();
}

function wizardNext() {
    const total = wizardSteps.length;
    saveCurrentWizardAnswer();

    if (wizardStepIndex >= total - 1) {
        showView('uebersicht');
        return;
    }

    wizardStepIndex++;
    renderProjektWizard();
}

function wizardJumpToQuestion() {
    const jumpBox = document.getElementById('wizard-jump-box');
    const jumpInput = document.getElementById('wizard-jump-input');
    const total = wizardSteps.length;
    if (!jumpBox || !jumpInput || total === 0) return;

    jumpBox.style.display = jumpBox.style.display === 'none' ? 'flex' : 'none';
    if (jumpBox.style.display === 'flex') {
        jumpInput.value = String(wizardStepIndex + 1);
        jumpInput.max = String(total);
        setTimeout(() => jumpInput.focus(), 0);
    }
}

function wizardCancelJump() {
    const jumpBox = document.getElementById('wizard-jump-box');
    if (!jumpBox) return;
    jumpBox.style.display = 'none';
}

function wizardApplyJump() {
    const jumpInput = document.getElementById('wizard-jump-input');
    const total = wizardSteps.length;
    if (!jumpInput || total === 0) return;

    const target = parseInt(jumpInput.value, 10);
    if (Number.isNaN(target) || target < 1 || target > total) {
        showModal(`Bitte eine gültige Zahl zwischen 1 und ${total} eingeben.`, {
            type: 'warning',
            title: 'Ungültige Eingabe'
        });
        return;
    }

    saveCurrentWizardAnswer();
    wizardStepIndex = target - 1;
    wizardCancelJump();
    renderProjektWizard();
}

function renderAdminView() {
    if (currentUserRole !== 'admin') {
        showModal('Nur Admin-Benutzer dürfen diese Seite öffnen.', { type: 'warning', title: 'Kein Zugriff' });
        showView('home');
        return;
    }

    const textarea = document.getElementById('admin-wizard-json');
    if (!textarea) return;
    textarea.value = JSON.stringify(wizardSteps, null, 2);
}

async function saveAdminWizardConfig() {
    if (currentUserRole !== 'admin') {
        showModal('Nur Admin-Benutzer dürfen speichern.', { type: 'warning', title: 'Kein Zugriff' });
        return;
    }

    const textarea = document.getElementById('admin-wizard-json');
    if (!textarea) return;

    let parsed = null;
    try {
        parsed = JSON.parse(textarea.value);
    } catch (error) {
        showModal(`JSON ungültig: ${error.message}`, { type: 'danger', title: 'Fehler' });
        return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        showModal('Bitte ein Array mit mindestens einer Frage angeben.', { type: 'warning', title: 'Formatfehler' });
        return;
    }

    const isValid = parsed.every(step =>
        step && typeof step.id === 'string' && typeof step.gruppe === 'string' && typeof step.frage === 'string'
    );
    if (!isValid) {
        showModal('Jeder Eintrag braucht mindestens id, gruppe und frage als Text.', { type: 'warning', title: 'Formatfehler' });
        return;
    }

    wizardSteps = parsed;

    if (firebaseReady) {
        try {
            const ref = getWizardConfigDoc();
            if (ref) {
                await ref.set({
                    steps: parsed,
                    updatedBy: currentUser?.uid || '',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            showModal(`Speichern in Firestore fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
            return;
        }
    }

    showModal('Assistent-Fragen wurden gespeichert.', { type: 'success', title: 'Gespeichert' });
}

async function deleteProjekt(id) {
    const projects = getProjects();
    const projekt = projects.find(p => p.id === id);
    if (!projekt) return;

    const confirmed = await showModal(
        `Möchten Sie das Projekt "${projekt.name}" wirklich löschen?\n\nAlle Leitungsdaten gehen verloren.\n\nBitte geben Sie zur Bestätigung den Projektnamen ein.`,
        { 
            type: 'danger', 
            title: 'Projekt löschen',
            showCancel: true,
            confirmText: 'Löschen',
            cancelText: 'Abbrechen',
            requireTextMatch: true,
            expectedText: projekt.name,
            textMatchLabel: 'Projektnamen zur Bestätigung eingeben',
            textMatchPlaceholder: projekt.name
        }
    );
    
    if (!confirmed) return;

    const updatedProjects = projects.filter(p => p.id !== id);
    saveProjects(updatedProjects);
    
    if (currentProjekt && currentProjekt.id === id) {
        currentProjekt = null;
    }
    
    loadProjects();
}

// ===== Konfigurator =====
function initKonfigurator() {
    if (!currentProjekt) {
        showView('home');
        return;
    }
    
    document.getElementById('konfig-projekt-titel').textContent = 
        `${currentProjekt.projektnummer} - ${currentProjekt.name}`;
    
    populateHerstellerDropdown();
    populateKategorieDropdown();
    populateGruppenDropdown();
    
    if (!currentProjekt.leitungen || currentProjekt.leitungen.length === 0) {
        addNewLeitung();
    }
    
    renderLeitungForm();
}

function populateGruppenDropdown() {
    const select = document.getElementById('leitung-gruppe');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Bitte wählen --</option>';

    leitungGruppen.forEach(gruppe => {
        const option = document.createElement('option');
        option.value = gruppe.code;
        option.textContent = gruppe.label || gruppe.code;
        if (gruppe.bemerkung) {
            option.title = gruppe.bemerkung;
        }
        select.appendChild(option);
    });

    if (currentValue) {
        select.value = currentValue;
    }
}

function getGruppeDisplay(gruppeCode) {
    if (!gruppeCode) return '-';
    const gruppe = leitungGruppen.find(g => g.code === gruppeCode);
    return gruppe ? (gruppe.label || gruppe.code) : gruppeCode;
}

function compareGruppenCode(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    const numA = parseInt(String(a).replace('=', ''), 10);
    const numB = parseInt(String(b).replace('=', ''), 10);

    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return numA - numB;
    }

    return String(a).localeCompare(String(b), 'de');
}

function buildAbarbeitungOrder() {
    if (!currentProjekt || !Array.isArray(currentProjekt.leitungen)) return [];

    return currentProjekt.leitungen
        .map((leitung, index) => ({
            index,
            gruppe: leitung.gruppe || '',
            position: leitung.position || index + 1
        }))
        .sort((a, b) =>
            compareGruppenCode(a.gruppe, b.gruppe) ||
            a.position - b.position ||
            a.index - b.index
        );
}

function startAbarbeitung() {
    if (!currentProjekt) return;
    abarbeitungOrder = buildAbarbeitungOrder();
    const firstOpenIndex = abarbeitungOrder.findIndex(entry => !currentProjekt.leitungen[entry.index]?.erledigt);
    abarbeitungCursor = firstOpenIndex >= 0 ? firstOpenIndex : 0;
    showView('abarbeitung');
}

function renderAbarbeitung() {
    if (!currentProjekt) {
        showView('home');
        return;
    }

    abarbeitungOrder = buildAbarbeitungOrder();
    if (abarbeitungCursor >= abarbeitungOrder.length) {
        abarbeitungCursor = Math.max(abarbeitungOrder.length - 1, 0);
    }

    document.getElementById('abarbeitung-titel').textContent =
        `Abarbeitung - ${currentProjekt.projektnummer} - ${currentProjekt.name}`;

    const progressEl = document.getElementById('abarbeitung-progress');
    const emptyEl = document.getElementById('abarbeitung-empty');
    const cardEl = document.getElementById('abarbeitung-card');
    const nextListEl = document.getElementById('abarbeitung-next-list');
    const prevBtn = document.getElementById('abarbeitung-prev');
    const nextBtn = document.getElementById('abarbeitung-next');
    const toggleBtn = document.getElementById('abarbeitung-toggle');

    if (abarbeitungOrder.length === 0) {
        progressEl.textContent = 'Schritt 0 von 0';
        emptyEl.style.display = 'block';
        cardEl.style.display = 'none';
        nextListEl.innerHTML = '<p class="konfig-list-empty">Noch keine Leitungen vorhanden.</p>';
        return;
    }

    emptyEl.style.display = 'none';
    cardEl.style.display = 'block';

    const total = abarbeitungOrder.length;
    const currentStep = abarbeitungCursor + 1;
    const currentEntry = abarbeitungOrder[abarbeitungCursor];
    const leitung = currentProjekt.leitungen[currentEntry.index];
    const artikelnummer = leitung.artikelnummer || leitung.artikelCustom || '-';
    const isErledigt = !!leitung.erledigt;

    progressEl.textContent = `Schritt ${currentStep} von ${total}`;
    document.getElementById('abarbeitung-gruppe').textContent = getGruppeDisplay(leitung.gruppe || '');
    document.getElementById('abarbeitung-position').textContent = String(leitung.position || currentEntry.index + 1);
    document.getElementById('abarbeitung-artikel').textContent = artikelnummer;
    document.getElementById('abarbeitung-bezeichnung').textContent = leitung.bezeichnung || '-';
    document.getElementById('abarbeitung-status').textContent = isErledigt ? 'Erledigt' : 'Offen';

    prevBtn.style.display = currentStep > 1 ? 'inline-flex' : 'none';
    nextBtn.style.display = currentStep < total ? 'inline-flex' : 'none';
    toggleBtn.textContent = isErledigt ? 'Als offen markieren' : 'Als erledigt markieren';
    toggleBtn.className = isErledigt ? 'btn btn-secondary' : 'btn btn-success';

    const previewEntries = abarbeitungOrder
        .slice(abarbeitungCursor + 1, abarbeitungCursor + 7)
        .map(entry => {
            const nextLeitung = currentProjekt.leitungen[entry.index];
            const nextArtikel = nextLeitung.artikelnummer || nextLeitung.artikelCustom || '-';
            const nextStatus = nextLeitung.erledigt ? '✅' : '⬜';
            return `
                <li>
                    <span>${nextStatus} ${escapeHtml(getGruppeDisplay(nextLeitung.gruppe || ''))}</span>
                    <span>${escapeHtml(nextArtikel)}</span>
                </li>
            `;
        }).join('');

    nextListEl.innerHTML = previewEntries
        ? `<ul>${previewEntries}</ul>`
        : '<p class="konfig-list-empty">Keine weiteren Leitungen mehr.</p>';
}

function abarbeitungPrev() {
    if (abarbeitungCursor <= 0) return;
    abarbeitungCursor--;
    renderAbarbeitung();
}

function abarbeitungNext() {
    if (abarbeitungCursor >= abarbeitungOrder.length - 1) return;
    abarbeitungCursor++;
    renderAbarbeitung();
}

function abarbeitungOpenAktuell() {
    if (!abarbeitungOrder.length) return;
    currentLeitungIndex = abarbeitungOrder[abarbeitungCursor].index;
    showView('konfigurator');
}

function abarbeitungToggleErledigt() {
    if (!abarbeitungOrder.length || !currentProjekt) return;
    const currentEntry = abarbeitungOrder[abarbeitungCursor];
    const leitung = currentProjekt.leitungen[currentEntry.index];
    if (!leitung) return;

    leitung.erledigt = !leitung.erledigt;
    persistCurrentProjekt();
    renderAbarbeitung();
    renderKonfigGruppenliste();
}

function renderKonfigGruppenliste() {
    const container = document.getElementById('konfig-gruppenliste');
    if (!container || !currentProjekt) return;

    const leitungen = currentProjekt.leitungen || [];
    if (leitungen.length === 0) {
        container.innerHTML = '<p class="konfig-list-empty">Noch keine Leitungen vorhanden.</p>';
        return;
    }

    const gruppenMap = new Map();

    leitungen.forEach(leitung => {
        const gruppe = leitung.gruppe || '';
        const artikelnummer = (leitung.artikelnummer || leitung.artikelCustom || '').trim();
        if (!artikelnummer) return;

        if (!gruppenMap.has(gruppe)) {
            gruppenMap.set(gruppe, new Map());
        }

        const artikelMap = gruppenMap.get(gruppe);
        artikelMap.set(artikelnummer, (artikelMap.get(artikelnummer) || 0) + 1);
    });

    if (gruppenMap.size === 0) {
        container.innerHTML = '<p class="konfig-list-empty">Noch keine Artikelnummern vorhanden.</p>';
        return;
    }

    const gruppenCodes = Array.from(gruppenMap.keys()).sort(compareGruppenCode);
    const html = gruppenCodes.map(code => {
        const artikelMap = gruppenMap.get(code);
        const artikelRows = Array.from(artikelMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'de'))
            .map(([artikel, count]) => `
                <li>
                    <span class="artikel">${escapeHtml(artikel)}</span>
                    <span class="count">${count}</span>
                </li>
            `).join('');

        return `
            <div class="konfig-group-block">
                <h4>${escapeHtml(code ? getGruppeDisplay(code) : 'Ohne Gruppe')}</h4>
                <ul>
                    ${artikelRows}
                </ul>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function populateKategorieDropdown() {
    const select = document.getElementById('leitung-kategorie');
    select.innerHTML = '<option value="">-- Bitte wählen --</option>';
    
    if (katalog && katalog.kategorien) {
        katalog.kategorien.forEach(k => {
            const option = document.createElement('option');
            option.value = k.id;
            option.textContent = `${k.icon} ${k.name}`;
            select.appendChild(option);
        });
    }
}

function onKategorieFilterChange() {
    const kategorie = document.getElementById('leitung-kategorie').value;
    const herstellerSelect = document.getElementById('leitung-hersteller');
    
    // Bei EtherCAT, Power und Sensor automatisch Beckhoff auswählen
    if (kategorie === 'ethercat' || kategorie === 'power' || kategorie === 'sensor') {
        herstellerSelect.value = 'Beckhoff';
    }
    
    // Stecker-Dropdowns neu laden (mit Kategorie-Filter)
    onHerstellerChange();

    // Für EtherCAT gewünschte Defaults setzen, sofern verfügbar
    if (kategorie === 'ethercat') {
        const steckerASelect = document.getElementById('leitung-stecker-a');
        const steckerBSelect = document.getElementById('leitung-stecker-b');
        const defaultStecker = 'M8 4-polig';

        const hasSteckerA = Array.from(steckerASelect.options).some(option => option.value === defaultStecker);
        if (hasSteckerA) {
            steckerASelect.value = defaultStecker;
            onSteckerChange();
        }

        const hasSteckerB = Array.from(steckerBSelect.options).some(option => option.value === defaultStecker);
        if (hasSteckerB) {
            steckerBSelect.value = defaultStecker;
        }

        loadLaengen();
        updateArtikelVorschlag();
    }
}

function populateHerstellerDropdown() {
    const select = document.getElementById('leitung-hersteller');
    select.innerHTML = '<option value="">-- Bitte wählen --</option>';
    
    if (katalog && katalog.hersteller) {
        katalog.hersteller.forEach(h => {
            const option = document.createElement('option');
            option.value = h;
            option.textContent = h;
            select.appendChild(option);
        });
    }
}

function getArtikelForHersteller(hersteller) {
    if (!katalog || !katalog.artikel) return [];
    return katalog.artikel.filter(a => a.hersteller === hersteller);
}

// Debug-Funktion - in der Konsole aufrufen: testPowerLeitung()
window.testPowerLeitung = function() {
    console.log('=== Test Power Leitung ZK2020-3200 ===');
    const power = katalog.artikel.filter(a => 
        a.kategorie === 'power' && 
        a.steckerA === 'M8 4-polig gerade' && 
        a.steckerB === 'offen'
    );
    console.log('Gefundene Artikel:', power.length);
    console.log('Erste 5:', power.slice(0, 5));
    
    // Zeige auch aktuelle UI-Werte
    console.log('=== Aktuelle UI Werte ===');
    console.log('Kategorie:', document.getElementById('leitung-kategorie').value);
    console.log('Hersteller:', document.getElementById('leitung-hersteller').value);
    console.log('Stecker A:', document.getElementById('leitung-stecker-a').value);
    console.log('Stecker B:', document.getElementById('leitung-stecker-b').value);
    console.log('Ausrichtung A:', getAusrichtung('a'));
    console.log('Ausrichtung B:', getAusrichtung('b'));
    console.log('Länge Select:', document.getElementById('leitung-laenge-select').value);
    console.log('Länge Input:', document.getElementById('leitung-laenge').value);
    
    return power;
}

// Extrahiert den Basis-Steckertyp ohne Ausrichtung (gerade/gewinkelt)
function getBaseSteckerTyp(stecker) {
    if (!stecker) return '';
    return stecker.replace(/ (gerade|gewinkelt)$/, '');
}

// Prüft ob ein Steckertyp eine Ausrichtung haben kann
function hasAusrichtung(stecker) {
    if (!stecker) return false;
    const base = getBaseSteckerTyp(stecker);
    return base.includes('M8') || base.includes('M12');
}

// Liest die aktuelle Ausrichtung aus dem Toggle-Button
function getAusrichtung(seite) {
    const btn = document.getElementById(`ausrichtung-${seite}`);
    if (!btn) return 'gerade';
    return btn.classList.contains('gewinkelt') ? 'gewinkelt' : 'gerade';
}

// Setzt die Ausrichtung im Toggle-Button
function setAusrichtung(seite, gewinkelt) {
    const btn = document.getElementById(`ausrichtung-${seite}`);
    if (!btn) return;
    const icon = btn.querySelector('.toggle-icon');
    const text = btn.querySelector('.toggle-text');
    
    if (gewinkelt) {
        btn.classList.add('gewinkelt');
        text.textContent = 'gewinkelt';
    } else {
        btn.classList.remove('gewinkelt');
        text.textContent = 'gerade';
    }
}

// Toggle-Funktion für die Ausrichtungs-Buttons
function toggleAusrichtung(seite) {
    const btn = document.getElementById(`ausrichtung-${seite}`);
    if (!btn) return;
    
    const isGewinkelt = btn.classList.contains('gewinkelt');
    setAusrichtung(seite, !isGewinkelt);
    
    onSteckerChange();
}

// Kombiniert Basis-Steckertyp mit Ausrichtung
function getFullSteckerTyp(baseTyp, ausrichtung) {
    if (!baseTyp) return '';
    if (!hasAusrichtung(baseTyp)) return baseTyp;
    return `${baseTyp} ${ausrichtung}`;
}

// Prüft ob ein Steckertyp für die aktuelle Kategorie erlaubt ist
function isSteckerErlaubtFuerKategorie(steckerBase, kategorie) {
    if (!kategorie || kategorie === '') return true;
    
    // Bei EtherCAT nur M8, M12, RJ45 und offen erlaubt
    if (kategorie === 'ethercat') {
        const erlaubt = ['M8 4-polig', 'M12 4-polig', 'RJ45', 'offen'];
        return erlaubt.some(e => steckerBase.includes(e) || steckerBase === e);
    }
    
    return true;
}

function getUniqueSteckerA(hersteller) {
    const artikel = getArtikelForHersteller(hersteller);
    const kategorie = document.getElementById('leitung-kategorie').value;
    const stecker = new Set();
    
    artikel.forEach(a => {
        if (a.steckerA) {
            const baseTyp = getBaseSteckerTyp(a.steckerA);
            // Bei Kategorie-Filter nur passende Stecker anzeigen
            if (kategorie && a.kategorie !== kategorie) return;
            if (!isSteckerErlaubtFuerKategorie(baseTyp, kategorie)) return;
            stecker.add(baseTyp);
        }
    });
    return Array.from(stecker).sort();
}

function getUniqueSteckerB(hersteller, steckerABase, ausrichtungA) {
    const artikel = getArtikelForHersteller(hersteller);
    const kategorie = document.getElementById('leitung-kategorie').value;
    const stecker = new Set();
    
    console.log('getUniqueSteckerB:', { hersteller, steckerABase, ausrichtungA, kategorie });
    
    artikel.forEach(a => {
        if (!a.steckerB) return;
        
        // Bei Kategorie-Filter nur passende Artikel
        if (kategorie && a.kategorie !== kategorie) return;
        
        // Prüfen ob ausgewählter Stecker auf einer der beiden Seiten passt
        if (steckerABase) {
            const fullSteckerA = hasAusrichtung(steckerABase)
                ? getFullSteckerTyp(steckerABase, ausrichtungA || 'gerade')
                : steckerABase;
            const matchesOnA = a.steckerA === fullSteckerA;
            const matchesOnB = a.steckerB === fullSteckerA;
            if (!matchesOnA && !matchesOnB) return;

            // Gegenstück zur gematchten Seite als mögliche Stecker-B-Option verwenden
            const otherStecker = matchesOnA ? a.steckerB : a.steckerA;
            const baseTypOther = getBaseSteckerTyp(otherStecker);
            if (!isSteckerErlaubtFuerKategorie(baseTypOther, kategorie)) return;
            stecker.add(baseTypOther);
            return;
        }
        
        const baseTypB = getBaseSteckerTyp(a.steckerB);
        if (!isSteckerErlaubtFuerKategorie(baseTypB, kategorie)) return;
        
        // Nur Basis-Typ von Stecker B speichern
        stecker.add(baseTypB);
    });
    return Array.from(stecker).sort();
}

function getAvailableLaengen(hersteller, steckerA, steckerB) {
    const artikel = getArtikelForHersteller(hersteller);
    const kategorie = document.getElementById('leitung-kategorie').value;
    const laengen = new Set();
    
    console.log('getAvailableLaengen params:', { hersteller, steckerA, steckerB, kategorie });
    
    // Debug: Zeige alle Power-Artikel mit M8 4-polig gerade + offen
    if (kategorie === 'power') {
        const debugArtikel = artikel.filter(a => 
            a.kategorie === 'power' && 
            a.steckerB === 'offen'
        );
        console.log('Debug - Power + offen Artikel:', debugArtikel.slice(0, 3));
    }
    
    artikel.forEach(a => {
        // Kategorie-Filter
        if (kategorie && a.kategorie !== kategorie) return;
        
        const directMatch = (!steckerA || a.steckerA === steckerA) && (!steckerB || a.steckerB === steckerB);
        const swappedMatch = (!steckerA || a.steckerB === steckerA) && (!steckerB || a.steckerA === steckerB);
        
        if ((directMatch || swappedMatch) && a.laenge > 0) {
            laengen.add(a.laenge);
        }
    });
    
    console.log('getAvailableLaengen result:', Array.from(laengen));
    
    return Array.from(laengen).sort((a, b) => a - b);
}

function findArtikel(hersteller, steckerA, steckerB, laenge) {
    if (!katalog || !katalog.artikel) return null;
    
    const kategorie = document.getElementById('leitung-kategorie').value;
    const laengeNum = parseFloat(laenge);
    
    console.log('findArtikel params:', { hersteller, steckerA, steckerB, laenge, kategorie });
    
    // Exakte Übereinstimmung suchen (mit Kategorie-Filter)
    const exactMatch = katalog.artikel.find(a => 
        a.hersteller === hersteller &&
        (
            (a.steckerA === steckerA && a.steckerB === steckerB) ||
            (a.steckerA === steckerB && a.steckerB === steckerA)
        ) &&
        a.laenge === laengeNum &&
        (!kategorie || a.kategorie === kategorie)
    );
    
    if (exactMatch) return { artikel: exactMatch, exact: true };
    
    // Partielle Übereinstimmungen (mit Kategorie-Filter)
    const partialMatches = katalog.artikel.filter(a =>
        a.hersteller === hersteller &&
        (
            (a.steckerA === steckerA && a.steckerB === steckerB) ||
            (a.steckerA === steckerB && a.steckerB === steckerA)
        ) &&
        (!kategorie || a.kategorie === kategorie)
    );
    
    if (partialMatches.length > 0) {
        const sorted = partialMatches.sort((a, b) => {
            const diffA = Math.abs(a.laenge - laengeNum);
            const diffB = Math.abs(b.laenge - laengeNum);
            return diffA - diffB;
        });
        
        const closest = sorted[0];
        const nextLarger = sorted.find(a => a.laenge >= laengeNum);
        
        return { 
            artikel: nextLarger || closest, 
            exact: false,
            requestedLaenge: laengeNum,
            availableLaengen: partialMatches.map(a => a.laenge).sort((a,b) => a-b)
        };
    }
    
    return null;
}

function onHerstellerChange() {
    const hersteller = document.getElementById('leitung-hersteller').value;
    const selectA = document.getElementById('leitung-stecker-a');
    const selectB = document.getElementById('leitung-stecker-b');
    const laengeSelect = document.getElementById('leitung-laenge-select');
    
    selectA.innerHTML = '<option value="">-- Bitte wählen --</option>';
    selectB.innerHTML = '<option value="">-- Bitte wählen --</option>';
    laengeSelect.innerHTML = '<option value="">-- Länge wählen --</option>';
    
    // Ausrichtung auf Standard (gerade) zurücksetzen
    setAusrichtung('a', false);
    setAusrichtung('b', false);
    
    updateArtikelVorschlag();
    
    if (!hersteller) return;
    
    // Basis-Steckertypen laden (ohne gerade/gewinkelt)
    const steckerA = getUniqueSteckerA(hersteller);
    let defaultSteckerA = '';
    steckerA.forEach(s => {
        const option = document.createElement('option');
        option.value = s;
        option.textContent = s;
        selectA.appendChild(option);
        // Erste Option als Standard
        if (!defaultSteckerA) {
            defaultSteckerA = s;
        }
    });
    
    if (defaultSteckerA) {
        selectA.value = defaultSteckerA;
    }
    
    // Stecker B basierend auf Stecker A laden
    const ausrichtungA = getAusrichtung('a');
    const steckerB = getUniqueSteckerB(hersteller, defaultSteckerA, ausrichtungA);
    let defaultSteckerB = '';
    steckerB.forEach(s => {
        const option = document.createElement('option');
        option.value = s;
        option.textContent = s;
        selectB.appendChild(option);
        if (!defaultSteckerB) {
            defaultSteckerB = s;
        }
    });
    
    if (defaultSteckerB) {
        selectB.value = defaultSteckerB;
    }
    
    // Wenn beide Stecker vorausgewählt, Längen laden
    if (defaultSteckerA && defaultSteckerB) {
        loadLaengen();
    }
    
    updateArtikelVorschlag();
}

function onSteckerChange() {
    const hersteller = document.getElementById('leitung-hersteller').value;
    const steckerABase = document.getElementById('leitung-stecker-a').value;
    const ausrichtungA = getAusrichtung('a');
    
    console.log('onSteckerChange:', { hersteller, steckerABase, ausrichtungA });
    
    if (hersteller && steckerABase) {
        const selectB = document.getElementById('leitung-stecker-b');
        const currentB = selectB.value;
        
        selectB.innerHTML = '<option value="">-- Bitte wählen --</option>';
        const steckerBOptions = getUniqueSteckerB(hersteller, steckerABase, ausrichtungA);
        let defaultSteckerB = '';
        let foundCurrentB = false;
        
        console.log('SteckerB options:', steckerBOptions, 'currentB:', currentB);
        
        steckerBOptions.forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = s;
            if (s === currentB) {
                option.selected = true;
                foundCurrentB = true;
            }
            selectB.appendChild(option);
            if (!defaultSteckerB) {
                defaultSteckerB = s;
            }
        });
        
        // Wenn vorheriger Wert nicht mehr verfügbar, ersten Wert wählen
        if (!foundCurrentB && defaultSteckerB) {
            selectB.value = defaultSteckerB;
            console.log('Stecker B reset to:', defaultSteckerB);
        }
    }
    
    loadLaengen();
    updateArtikelVorschlag();
}

// Lädt verfügbare Längen basierend auf Stecker-Auswahl und Ausrichtung
function loadLaengen() {
    const hersteller = document.getElementById('leitung-hersteller').value;
    const steckerABase = document.getElementById('leitung-stecker-a').value;
    const steckerBBase = document.getElementById('leitung-stecker-b').value;
    const ausrichtungA = getAusrichtung('a');
    const ausrichtungB = getAusrichtung('b');
    const laengeSelect = document.getElementById('leitung-laenge-select');
    
    laengeSelect.innerHTML = '<option value="">-- Länge wählen --</option>';
    
    if (hersteller && steckerABase && steckerBBase) {
        // Vollständige Steckertypen mit Ausrichtung erstellen
        const fullSteckerA = getFullSteckerTyp(steckerABase, ausrichtungA);
        // Für Stecker B: Wenn keine Ausrichtung relevant (z.B. "offen"), nicht modifizieren
        const fullSteckerB = hasAusrichtung(steckerBBase) 
            ? getFullSteckerTyp(steckerBBase, ausrichtungB)
            : steckerBBase;
        
        console.log('loadLaengen:', { hersteller, fullSteckerA, fullSteckerB });
        
        const laengen = getAvailableLaengen(hersteller, fullSteckerA, fullSteckerB);
        laengen.forEach(l => {
            const option = document.createElement('option');
            option.value = l;
            option.textContent = `${l} m`;
            laengeSelect.appendChild(option);
        });
        
        if (laengen.length === 0) {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "Meterware - Länge eingeben";
            laengeSelect.appendChild(option);
        }
    }
    
    updateArtikelVorschlag();
}

function onLaengeChange() {
    const laengeSelect = document.getElementById('leitung-laenge-select');
    const laengeInput = document.getElementById('leitung-laenge');
    
    if (laengeSelect.value) {
        laengeInput.value = laengeSelect.value;
    }
    
    updateArtikelVorschlag();
}

function updateArtikelVorschlag() {
    const hersteller = document.getElementById('leitung-hersteller').value;
    const steckerABase = document.getElementById('leitung-stecker-a').value;
    const steckerBBase = document.getElementById('leitung-stecker-b').value;
    const ausrichtungA = getAusrichtung('a');
    const ausrichtungB = getAusrichtung('b');
    const laengeSelect = document.getElementById('leitung-laenge-select').value;
    const laengeInput = document.getElementById('leitung-laenge').value;
    const laenge = laengeSelect || laengeInput;
    
    const vorschlagDiv = document.getElementById('artikel-vorschlag');
    const kategorieSelect = document.getElementById('leitung-kategorie');
    
    if (!hersteller || !steckerABase || !steckerBBase || !laenge) {
        vorschlagDiv.className = 'artikel-vorschlag no-match';
        vorschlagDiv.innerHTML = '<span class="artikel-label">Bitte alle Felder ausfüllen</span>';
        currentArtikelVorschlag = null;
        return;
    }
    
    // Vollständige Steckertypen mit Ausrichtung erstellen
    const steckerA = getFullSteckerTyp(steckerABase, ausrichtungA);
    // Für Stecker B: Wenn keine Ausrichtung relevant (z.B. "offen", "RJ45"), nicht modifizieren
    const steckerB = hasAusrichtung(steckerBBase) 
        ? getFullSteckerTyp(steckerBBase, ausrichtungB)
        : steckerBBase;
    
    console.log('updateArtikelVorschlag:', { hersteller, steckerA, steckerB, laenge });
    
    const result = findArtikel(hersteller, steckerA, steckerB, laenge);
    
    if (!result) {
        vorschlagDiv.className = 'artikel-vorschlag no-match';
        vorschlagDiv.innerHTML = `
            <span class="artikel-label">Kein passender Artikel gefunden</span>
            <span class="artikel-hinweis">Artikelnummer manuell eingeben</span>
        `;
        currentArtikelVorschlag = null;
        return;
    }
    
    currentArtikelVorschlag = result.artikel;
    
    if (result.artikel.kategorie && !kategorieSelect.value) {
        kategorieSelect.value = result.artikel.kategorie;
    }
    
    if (result.exact) {
        vorschlagDiv.className = 'artikel-vorschlag';
        vorschlagDiv.innerHTML = `
            <span class="artikel-nummer">${escapeHtml(result.artikel.artikelnummer)}</span>
            <span class="artikel-beschreibung">${escapeHtml(result.artikel.beschreibung)}</span>
        `;
    } else {
        vorschlagDiv.className = 'artikel-vorschlag';
        const availableStr = result.availableLaengen.map(l => l + 'm').join(', ');
        vorschlagDiv.innerHTML = `
            <span class="artikel-nummer">${escapeHtml(result.artikel.artikelnummer)}</span>
            <span class="artikel-beschreibung">${escapeHtml(result.artikel.beschreibung)}</span>
            <span class="artikel-hinweis">Nächste verfügbare Länge: ${result.artikel.laenge}m (verfügbar: ${availableStr})</span>
        `;
    }
}

function renderLeitungForm() {
    if (!currentProjekt || !currentProjekt.leitungen) return;
    
    const total = currentProjekt.leitungen.length;
    const position = currentLeitungIndex + 1;
    
    document.getElementById('konfig-position').textContent = `Leitung ${position}`;
    document.getElementById('konfig-total').textContent = total;
    
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const hasPrev = currentLeitungIndex > 0;
    const hasNext = currentLeitungIndex < total - 1;

    prevBtn.disabled = !hasPrev;
    nextBtn.disabled = !hasNext;
    prevBtn.style.display = hasPrev ? 'inline-flex' : 'none';
    nextBtn.style.display = hasNext ? 'inline-flex' : 'none';
    
    const leitung = currentProjekt.leitungen[currentLeitungIndex];
    if (leitung) {
        document.getElementById('leitung-id').value = leitung.id || '';
        document.getElementById('leitung-position').value = leitung.position || position;
        document.getElementById('leitung-bezeichnung').value = leitung.bezeichnung || '';
        document.getElementById('leitung-kategorie').value = leitung.kategorie || '';
        document.getElementById('leitung-gruppe').value = leitung.gruppe || '';
        document.getElementById('leitung-hersteller').value = leitung.hersteller || '';
        
        // Ausrichtung aus gespeicherten Steckern extrahieren
        let ausrichtungA = 'gerade';
        let ausrichtungB = 'gerade';
        let steckerABase = '';
        let steckerBBase = '';
        
        if (leitung.steckerA) {
            steckerABase = getBaseSteckerTyp(leitung.steckerA);
            if (leitung.steckerA.includes('gewinkelt')) {
                ausrichtungA = 'gewinkelt';
            }
        }
        if (leitung.steckerB) {
            steckerBBase = getBaseSteckerTyp(leitung.steckerB);
            if (leitung.steckerB.includes('gewinkelt')) {
                ausrichtungB = 'gewinkelt';
            }
        }
        
        // Hersteller laden (setzt Ausrichtung auf gerade zurück)
        onHerstellerChange();
        
        // Ausrichtung setzen BEVOR Stecker gesetzt werden
        setAusrichtung('a', ausrichtungA === 'gewinkelt');
        setAusrichtung('b', ausrichtungB === 'gewinkelt');
        
        // Basis-Stecker setzen
        if (steckerABase) {
            document.getElementById('leitung-stecker-a').value = steckerABase;
        }
        
        onSteckerChange();
        
        if (steckerBBase) {
            document.getElementById('leitung-stecker-b').value = steckerBBase;
        }
        
        loadLaengen();
        
        if (leitung.laenge) {
            const laengeSelect = document.getElementById('leitung-laenge-select');
            const laengeInput = document.getElementById('leitung-laenge');
            
            let found = false;
            for (let i = 0; i < laengeSelect.options.length; i++) {
                if (parseFloat(laengeSelect.options[i].value) === leitung.laenge) {
                    laengeSelect.selectedIndex = i;
                    found = true;
                    break;
                }
            }
            
            laengeInput.value = leitung.laenge;
        }
        
        document.getElementById('leitung-artikel-custom').value = leitung.artikelCustom || '';
        document.getElementById('leitung-notiz').value = leitung.notiz || '';
        
        if (leitung.kategorie) {
            document.getElementById('leitung-kategorie').value = leitung.kategorie;
        }
        
        updateArtikelVorschlag();
    } else {
        clearLeitungForm();
    }

    renderKonfigGruppenliste();
}

function clearLeitungForm() {
    document.getElementById('leitung-id').value = '';
    document.getElementById('leitung-bezeichnung').value = '';
    document.getElementById('leitung-kategorie').value = '';
    document.getElementById('leitung-gruppe').value = '';
    document.getElementById('leitung-hersteller').value = '';
    document.getElementById('leitung-stecker-a').innerHTML = '<option value="">-- Bitte wählen --</option>';
    document.getElementById('leitung-stecker-b').innerHTML = '<option value="">-- Bitte wählen --</option>';
    document.getElementById('leitung-laenge-select').innerHTML = '<option value="">-- Länge wählen --</option>';
    document.getElementById('leitung-laenge').value = '';
    document.getElementById('leitung-artikel-custom').value = '';
    document.getElementById('leitung-notiz').value = '';
    
    // Ausrichtung auf Standard (gerade) zurücksetzen
    setAusrichtung('a', false);
    setAusrichtung('b', false);
    
    const vorschlagDiv = document.getElementById('artikel-vorschlag');
    vorschlagDiv.className = 'artikel-vorschlag no-match';
    vorschlagDiv.innerHTML = '<span class="artikel-label">Bitte alle Felder ausfüllen</span>';
    
    currentArtikelVorschlag = null;
    renderKonfigGruppenliste();
}

function saveCurrentLeitung() {
    if (!currentProjekt) return;
    
    const laengeSelect = document.getElementById('leitung-laenge-select').value;
    const laengeInput = document.getElementById('leitung-laenge').value;
    const laenge = parseFloat(laengeSelect || laengeInput) || 0;
    
    let artikelnummer = '';
    let kategorie = document.getElementById('leitung-kategorie').value;
    
    if (currentArtikelVorschlag) {
        artikelnummer = currentArtikelVorschlag.artikelnummer;
        if (!kategorie && currentArtikelVorschlag.kategorie) {
            kategorie = currentArtikelVorschlag.kategorie;
        }
    }
    const artikelCustom = document.getElementById('leitung-artikel-custom').value.trim();
    if (artikelCustom) {
        artikelnummer = artikelCustom;
    }
    
    if (!kategorie) {
        kategorie = 'sonstiges';
    }
    
    // Vollständige Steckertypen mit Ausrichtung erstellen
    const steckerABase = document.getElementById('leitung-stecker-a').value;
    const steckerBBase = document.getElementById('leitung-stecker-b').value;
    const ausrichtungA = getAusrichtung('a');
    const ausrichtungB = getAusrichtung('b');
    const fullSteckerA = getFullSteckerTyp(steckerABase, ausrichtungA);
    const fullSteckerB = getFullSteckerTyp(steckerBBase, ausrichtungB);
    
    const leitung = {
        id: document.getElementById('leitung-id').value || generateId('ltg'),
        position: currentLeitungIndex + 1,
        bezeichnung: document.getElementById('leitung-bezeichnung').value.trim(),
        kategorie: kategorie,
        gruppe: document.getElementById('leitung-gruppe').value,
        hersteller: document.getElementById('leitung-hersteller').value,
        artikelnummer: artikelnummer,
        artikelCustom: artikelCustom,
        laenge: laenge,
        steckerA: fullSteckerA,
        steckerB: fullSteckerB,
        notiz: document.getElementById('leitung-notiz').value.trim(),
        erledigt: !!(currentProjekt.leitungen[currentLeitungIndex] && currentProjekt.leitungen[currentLeitungIndex].erledigt)
    };
    
    if (!currentProjekt.leitungen) {
        currentProjekt.leitungen = [];
    }
    
    currentProjekt.leitungen[currentLeitungIndex] = leitung;
    
    persistCurrentProjekt();

    renderKonfigGruppenliste();
}

function saveLeitung(event) {
    event.preventDefault();
    saveCurrentLeitung();
}

function prevLeitung() {
    if (currentLeitungIndex > 0) {
        saveCurrentLeitung();
        currentLeitungIndex--;
        renderLeitungForm();
    }
}

function nextLeitung() {
    if (currentLeitungIndex < currentProjekt.leitungen.length - 1) {
        saveCurrentLeitung();
        currentLeitungIndex++;
        renderLeitungForm();
    }
}

function addNewLeitung() {
    if (!currentProjekt) return;

    const isKonfiguratorActive = document.getElementById('view-konfigurator').classList.contains('active');

    // Nur im aktiven Konfigurator die aktuelle Leitung mitspeichern.
    // So vermeiden wir, dass alte Formularwerte aus anderen Views übernommen werden.
    if (isKonfiguratorActive && currentProjekt.leitungen && currentProjekt.leitungen.length > 0) {
        saveCurrentLeitung();
    }
    
    if (!currentProjekt.leitungen) {
        currentProjekt.leitungen = [];
    }
    
    const newLeitung = {
        id: generateId('ltg'),
        position: currentProjekt.leitungen.length + 1,
        bezeichnung: '',
        kategorie: '',
        gruppe: '',
        hersteller: '',
        artikelnummer: '',
        laenge: 0,
        steckerA: '',
        steckerB: '',
        notiz: '',
        erledigt: false
    };
    
    currentProjekt.leitungen.push(newLeitung);
    currentLeitungIndex = currentProjekt.leitungen.length - 1;
    
    persistCurrentProjekt();

    if (isKonfiguratorActive) {
        renderLeitungForm();
    } else {
        showView('konfigurator');
    }
}

// ===== Übersicht =====
function renderUebersicht() {
    if (!currentProjekt) {
        showView('home');
        return;
    }
    
    document.getElementById('uebersicht-titel').textContent = 
        `${currentProjekt.projektnummer} - ${currentProjekt.name}`;
    
    const infoDiv = document.getElementById('uebersicht-projekt-info');
    infoDiv.innerHTML = `
        <div class="info-item">
            <span class="info-label">Projektnummer</span>
            <span class="info-value">${escapeHtml(currentProjekt.projektnummer)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Projektname</span>
            <span class="info-value">${escapeHtml(currentProjekt.name)}</span>
        </div>
        ${currentProjekt.kunde ? `
        <div class="info-item">
            <span class="info-label">Kunde</span>
            <span class="info-value">${escapeHtml(currentProjekt.kunde)}</span>
        </div>` : ''}
        ${currentProjekt.liefertermin ? `
        <div class="info-item">
            <span class="info-label">Liefertermin</span>
            <span class="info-value">${formatDate(currentProjekt.liefertermin)}</span>
        </div>` : ''}
        <div class="info-item">
            <span class="info-label">Anzahl Leitungen</span>
            <span class="info-value">${currentProjekt.leitungen ? currentProjekt.leitungen.length : 0}</span>
        </div>
    `;
    
    renderLeitungTable();
}

function renderLeitungTable() {
    const container = document.getElementById('kategorien-container');
    const empty = document.getElementById('keine-leitungen');
    
    if (!currentProjekt.leitungen || currentProjekt.leitungen.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    
    empty.style.display = 'none';
    
    const kategorienDef = katalog && katalog.kategorien ? katalog.kategorien : [
        { id: 'ethercat', name: 'EtherCAT Leitung', icon: '🔗' },
        { id: 'power', name: 'Power Leitung', icon: '⚡' },
        { id: 'sensor', name: 'Sensorleitung', icon: '📡' },
        { id: 'oelflex', name: 'Ölflexleitung', icon: '🔌' },
        { id: 'sonstiges', name: 'Sonstiges', icon: '📦' }
    ];
    
    const grouped = {};
    kategorienDef.forEach(k => {
        grouped[k.id] = [];
    });
    
    currentProjekt.leitungen.forEach((l, idx) => {
        const kat = l.kategorie || 'sonstiges';
        if (!grouped[kat]) {
            grouped[kat] = [];
        }
        grouped[kat].push({ ...l, originalIndex: idx });
    });
    
    const zusammenfassungItems = kategorienDef
        .filter(k => grouped[k.id] && grouped[k.id].length > 0)
        .map(k => `
            <div class="zusammenfassung-item">
                <span class="icon">${k.icon}</span>
                <span>${k.name}:</span>
                <span class="count">${grouped[k.id].length}</span>
            </div>
        `).join('');
    
    let html = `
        <div class="kategorie-zusammenfassung">
            ${zusammenfassungItems}
            <div class="zusammenfassung-item">
                <span class="icon">📋</span>
                <span>Gesamt:</span>
                <span class="count">${currentProjekt.leitungen.length}</span>
            </div>
        </div>
    `;
    
    kategorienDef.forEach(kat => {
        const leitungen = grouped[kat.id];
        if (!leitungen || leitungen.length === 0) return;
        
        html += `
            <div class="kategorie-section">
                <div class="kategorie-header ${kat.id}">
                    <span class="kategorie-icon">${kat.icon}</span>
                    <span>${kat.name}</span>
                    <span class="kategorie-count">${leitungen.length} Leitung${leitungen.length !== 1 ? 'en' : ''}</span>
                </div>
                <div class="table-container">
                    <table class="leitung-table">
                        <thead>
                            <tr>
                                <th>Pos.</th>
                                <th>Bezeichnung</th>
                                <th>Gruppe</th>
                                <th>Hersteller</th>
                                <th>Artikelnr.</th>
                                <th>Länge</th>
                                <th>Stecker A</th>
                                <th>Stecker B</th>
                                <th>Aktionen</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${leitungen.map(l => `
                                <tr onclick="editLeitung(${l.originalIndex})" title="Leitung bearbeiten">
                                    <td>${l.position || l.originalIndex + 1}</td>
                                    <td>${escapeHtml(l.bezeichnung || '-')}</td>
                                    <td>${escapeHtml(getGruppeDisplay(l.gruppe))}</td>
                                    <td>${escapeHtml(l.hersteller || '-')}</td>
                                    <td>${escapeHtml(l.artikelnummer || l.artikelCustom || '-')}</td>
                                    <td>${l.laenge ? l.laenge + ' m' : '-'}</td>
                                    <td>${escapeHtml(l.steckerA || '-')}</td>
                                    <td>${escapeHtml(l.steckerB || '-')}</td>
                                    <td class="table-actions">
                                        <button class="btn btn-secondary btn-small btn-icon" onclick="event.stopPropagation(); editLeitung(${l.originalIndex})" title="Bearbeiten">
                                            ✏️
                                        </button>
                                        <button class="btn btn-danger btn-small btn-icon" onclick="event.stopPropagation(); deleteLeitung(${l.originalIndex})" title="Löschen">
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function getLeitungstypText(leitung) {
    const kategorie = leitung.kategorie || 'sonstiges';
    const steckerA = leitung.steckerA || '-';
    const steckerB = leitung.steckerB || '-';
    const laenge = leitung.laenge ? `${leitung.laenge} m` : '-';
    return `${kategorie} | ${steckerA} -> ${steckerB} | ${laenge}`;
}

function renderStueckliste() {
    if (!currentProjekt) {
        showView('home');
        return;
    }

    document.getElementById('stueckliste-titel').textContent =
        `Stückliste - ${currentProjekt.projektnummer} - ${currentProjekt.name}`;

    const tbody = document.getElementById('stueckliste-body');
    const emptyState = document.getElementById('keine-stueckliste');
    const tableContainer = tbody.closest('.table-container');
    const leitungen = currentProjekt.leitungen || [];

    if (leitungen.length === 0) {
        tbody.innerHTML = '';
        tableContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    const grouped = new Map();
    leitungen.forEach(l => {
        const artikelnummer = (l.artikelnummer || l.artikelCustom || '-').trim() || '-';
        const hersteller = (l.hersteller || '-').trim() || '-';
        const typText = getLeitungstypText(l);
        const key = `${artikelnummer}|||${hersteller}|||${typText}`;
        const existing = grouped.get(key);

        if (existing) {
            existing.count += 1;
        } else {
            grouped.set(key, {
                artikelnummer,
                hersteller,
                typText,
                count: 1
            });
        }
    });

    const rows = Array.from(grouped.values())
        .sort((a, b) => b.count - a.count || a.typText.localeCompare(b.typText, 'de'))
        .map(entry => `
            <tr>
                <td>${escapeHtml(entry.typText)}</td>
                <td>${escapeHtml(entry.hersteller)}</td>
                <td>${escapeHtml(entry.artikelnummer)}</td>
                <td>${entry.count}</td>
            </tr>
        `).join('');

    tbody.innerHTML = rows;
    tableContainer.style.display = 'block';
    emptyState.style.display = 'none';
}

function editLeitung(index) {
    currentLeitungIndex = index;
    showView('konfigurator');
}

async function deleteLeitung(index) {
    const confirmed = await showModal(
        'Möchten Sie diese Leitung wirklich löschen?',
        { 
            type: 'danger', 
            title: 'Leitung löschen',
            showCancel: true,
            confirmText: 'Löschen',
            cancelText: 'Abbrechen'
        }
    );
    
    if (!confirmed) return;
    
    currentProjekt.leitungen.splice(index, 1);
    
    currentProjekt.leitungen.forEach((l, i) => {
        l.position = i + 1;
    });
    
    const projects = getProjects();
    const idx = projects.findIndex(p => p.id === currentProjekt.id);
    if (idx >= 0) {
        projects[idx] = currentProjekt;
        saveProjects(projects);
    }
    
    renderLeitungTable();
}

// ===== Export CSV =====
function exportCSV() {
    if (!currentProjekt || !currentProjekt.leitungen || currentProjekt.leitungen.length === 0) {
        showModal('Keine Leitungen zum Exportieren vorhanden.', { type: 'warning', title: 'Hinweis' });
        return;
    }
    
    const kategorienDef = katalog && katalog.kategorien ? katalog.kategorien : [
        { id: 'ethercat', name: 'EtherCAT Leitung' },
        { id: 'power', name: 'Power Leitung' },
        { id: 'sensor', name: 'Sensorleitung' },
        { id: 'oelflex', name: 'Ölflexleitung' },
        { id: 'sonstiges', name: 'Sonstiges' }
    ];
    
    const grouped = {};
    kategorienDef.forEach(k => grouped[k.id] = []);
    
    currentProjekt.leitungen.forEach(l => {
        const kat = l.kategorie || 'sonstiges';
        if (!grouped[kat]) grouped[kat] = [];
        grouped[kat].push(l);
    });
    
    const headers = ['Position', 'Bezeichnung', 'Gruppe', 'Hersteller', 'Artikelnummer', 'Länge (m)', 'Stecker A', 'Stecker B', 'Notiz'];
    
    let csvRows = [
        `# Projekt: ${currentProjekt.projektnummer} - ${currentProjekt.name}`,
        `# Kunde: ${currentProjekt.kunde || '-'}`,
        `# Liefertermin: ${currentProjekt.liefertermin ? formatDate(currentProjekt.liefertermin) : '-'}`,
        `# Erstellt: ${new Date().toLocaleDateString('de-DE')}`,
        ''
    ];
    
    kategorienDef.forEach(kat => {
        const leitungen = grouped[kat.id];
        if (!leitungen || leitungen.length === 0) return;
        
        csvRows.push('');
        csvRows.push(`# === ${kat.name} (${leitungen.length}) ===`);
        csvRows.push(headers.join(';'));
        
        leitungen.forEach(l => {
            const row = [
                l.position,
                l.bezeichnung || '',
                getGruppeDisplay(l.gruppe) === '-' ? '' : getGruppeDisplay(l.gruppe),
                l.hersteller || '',
                l.artikelnummer || l.artikelCustom || '',
                l.laenge || '',
                l.steckerA || '',
                l.steckerB || '',
                l.notiz || ''
            ];
            csvRows.push(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'));
        });
    });
    
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `Leitungsliste_${currentProjekt.projektnummer}_${formatDateForFile(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ===== Export PDF =====
function exportPDF() {
    if (!currentProjekt || !currentProjekt.leitungen || currentProjekt.leitungen.length === 0) {
        showModal('Keine Leitungen zum Exportieren vorhanden.', { type: 'warning', title: 'Hinweis' });
        return;
    }
    
    const kategorienDef = katalog && katalog.kategorien ? katalog.kategorien : [
        { id: 'ethercat', name: 'EtherCAT Leitung', color: [37, 99, 235] },
        { id: 'power', name: 'Power Leitung', color: [245, 158, 11] },
        { id: 'sensor', name: 'Sensorleitung', color: [16, 185, 129] },
        { id: 'oelflex', name: 'Ölflexleitung', color: [139, 92, 246] },
        { id: 'sonstiges', name: 'Sonstiges', color: [107, 114, 128] }
    ];
    
    const kategorieColors = {
        'ethercat': [242, 124, 34],
        'power': [230, 92, 0],
        'sensor': [58, 58, 58],
        'oelflex': [74, 74, 74],
        'sonstiges': [90, 90, 90]
    };
    
    const grouped = {};
    kategorienDef.forEach(k => grouped[k.id] = []);
    
    currentProjekt.leitungen.forEach(l => {
        const kat = l.kategorie || 'sonstiges';
        if (!grouped[kat]) grouped[kat] = [];
        grouped[kat].push(l);
    });
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.setFontSize(18);
    doc.text('Leitungsliste', 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Projekt: ${currentProjekt.projektnummer} - ${currentProjekt.name}`, 14, 30);
    doc.text(`Kunde: ${currentProjekt.kunde || '-'}`, 14, 36);
    doc.text(`Liefertermin: ${currentProjekt.liefertermin ? formatDate(currentProjekt.liefertermin) : '-'}`, 14, 42);
    
    let currentY = 55;
    
    kategorienDef.forEach(kat => {
        const leitungen = grouped[kat.id];
        if (!leitungen || leitungen.length === 0) return;
        
        if (currentY > 170) {
            doc.addPage();
            currentY = 20;
        }
        
        doc.setFontSize(12);
        doc.setTextColor(...(kategorieColors[kat.id] || [0, 0, 0]));
        doc.text(`${kat.name} (${leitungen.length})`, 14, currentY);
        currentY += 5;
        
        const tableData = leitungen.map(l => [
            l.position,
            l.bezeichnung || '-',
            l.hersteller || '-',
            l.artikelnummer || l.artikelCustom || '-',
            l.laenge ? `${l.laenge} m` : '-',
            l.steckerA || '-',
            l.steckerB || '-'
        ]);
        
        doc.autoTable({
            startY: currentY,
            head: [['Pos.', 'Bezeichnung', 'Hersteller', 'Artikelnr.', 'Länge', 'Stecker A', 'Stecker B']],
            body: tableData,
            styles: {
                fontSize: 8,
                cellPadding: 2
            },
            headStyles: {
                fillColor: kategorieColors[kat.id] || [107, 114, 128],
                textColor: 255,
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [245, 247, 250]
            },
            columnStyles: {
                0: { cellWidth: 15 },
                1: { cellWidth: 55 },
                2: { cellWidth: 40 },
                3: { cellWidth: 45 },
                4: { cellWidth: 20 },
                5: { cellWidth: 40 },
                6: { cellWidth: 40 }
            }
        });
        
        currentY = doc.lastAutoTable.finalY + 10;
    });
    
    const pageCount = doc.internal.getNumberOfPages();
    const pageHeight = doc.internal.pageSize.height;
    
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128);
        doc.text(
            `Erstellt am ${new Date().toLocaleDateString('de-DE')} | Seite ${i} von ${pageCount}`,
            14,
            pageHeight - 10
        );
    }
    
    doc.save(`Leitungsliste_${currentProjekt.projektnummer}_${formatDateForFile(new Date())}.pdf`);
}

// ===== Hilfsfunktionen =====
function generateId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatDateForFile(date) {
    return date.toISOString().split('T')[0];
}
