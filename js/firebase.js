import { appState } from './state.js';
import { generateId, escapeHtml, formatDate, formatDateForFile } from './utils.js';
import { showModal, closeModal } from './modal.js';
import { DEFAULT_WIZARD_STEPS } from './config.js';
import { normalizeWizardStep } from './wizard-config.js';
import { showView } from './navigation.js';

/**
 * initFirebase.
 * @returns {void}
 */
export function initFirebase() {
    if (!window.firebase || !window.firebaseConfig || !window.firebaseConfig.apiKey) {
        console.warn('Firebase nicht konfiguriert - lokale Speicherung aktiv.');
        appState.firebaseReady = false;
        appState.firebaseInitError = 'Firebase-Konfiguration fehlt oder ist unvollständig.';
        return;
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(window.firebaseConfig);
        }
        appState.firebaseAuth = firebase.auth();
        appState.firebaseDb = firebase.firestore();
        appState.firebaseReady = true;
        appState.firebaseInitError = '';
    } catch (error) {
        console.error('Firebase Initialisierung fehlgeschlagen:', error);
        appState.firebaseReady = false;
        appState.firebaseInitError = error?.message || 'Firebase konnte nicht initialisiert werden.';
    }
}


/**
 * getProjectsStorageKey.
 * @returns {void}
 */
export function getProjectsStorageKey() {
    const userPart = appState.currentUser?.uid || 'local';
    return `leitungskonfigurator_projekte_${userPart}`;
}


/**
 * getUserProjectsDoc.
 * @returns {void}
 */
export function getUserProjectsDoc() {
    if (!appState.firebaseReady || !appState.currentUser || !appState.firebaseDb) return null;
    return appState.firebaseDb.collection('users').doc(appState.currentUser.uid).collection('app').doc('projects');
}


/**
 * getWizardConfigDoc.
 * @returns {void}
 */
export function getWizardConfigDoc() {
    if (!appState.firebaseReady || !appState.firebaseDb) return null;
    return appState.firebaseDb.collection('config').doc('wizardQuestions');
}


/**
 * ensureUserProfile.
 * @returns {void}
 */
export async function ensureUserProfile(user) {
    if (!appState.firebaseReady || !appState.firebaseDb || !user) return;

    const ref = appState.firebaseDb.collection('users').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
        await ref.set({
            email: user.email || '',
            role: 'user',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        appState.currentUserRole = 'user';
    } else {
        const data = snap.data() || {};
        appState.currentUserRole = data.role || 'user';
    }
}


/**
 * loadWizardQuestions.
 * @returns {void}
 */
export async function loadWizardQuestions() {
    appState.wizardSteps = [...DEFAULT_WIZARD_STEPS];
    if (!appState.firebaseReady) return;

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
            appState.wizardSteps = valid.map((s, i) => normalizeWizardStep(s, i));
        }
    } catch (error) {
        console.error('Fehler beim Laden der Wizard-Fragen:', error);
    }
}


/**
 * updateAuthUI.
 * @returns {void}
 */
export function updateAuthUI() {
    const navLogout = document.getElementById('nav-logout');
    const navUser = document.getElementById('nav-user');
    const navAdmin = document.getElementById('nav-admin');
    if (!navLogout || !navUser || !navAdmin) return;

    if (appState.currentUser) {
        navLogout.classList.remove('hidden');
        navUser.classList.remove('hidden');
        navUser.textContent = appState.currentUser.email || '';
        if (appState.currentUserRole === 'admin') {
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


/**
 * loginUser.
 * @returns {void}
 */
export async function loginUser() {
    if (!appState.firebaseReady || !appState.firebaseAuth) {
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
        await appState.firebaseAuth.signInWithEmailAndPassword(email, password);
        await import("./projects.js").then(m => m.loadProjects());
        updateAuthUI();
        showView('home');
    } catch (error) {
        showModal(`Anmeldung fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
    }
}


/**
 * registerUser.
 * @returns {void}
 */
export async function registerUser() {
    if (!appState.firebaseReady || !appState.firebaseAuth) {
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
        await appState.firebaseAuth.createUserWithEmailAndPassword(email, password);
        showModal('Registrierung erfolgreich. Sie sind jetzt angemeldet.', { type: 'success', title: 'Erfolg' });
    } catch (error) {
        showModal(`Registrierung fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
    }
}


/**
 * logoutUser.
 * @returns {void}
 */
export async function logoutUser() {
    if (!appState.currentUser) {
        showView('auth');
        return;
    }

    if (appState.firebaseReady && appState.firebaseAuth) {
        await appState.firebaseAuth.signOut();
    } else {
        appState.currentUser = null;
        showView('auth');
    }
}
