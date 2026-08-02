import { appState } from './state.js';
import { showModal } from './modal.js';
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
 * @returns {firebase.firestore.CollectionReference|null}
 */
export function getProjectsCollection() {
    if (!appState.firebaseReady || !appState.firebaseDb) return null;
    return appState.firebaseDb.collection('projects');
}


/**
 * @param {string} projectId
 * @returns {firebase.firestore.DocumentReference|null}
 */
export function getProjectDocRef(projectId) {
    const col = getProjectsCollection();
    return col && projectId ? col.doc(projectId) : null;
}


/**
 * @returns {Promise<{uid: string, email: string, role: string}[]>}
 */
export async function loadRegisteredUsers() {
    if (!appState.firebaseReady || !appState.firebaseDb) return [];

    const snap = await appState.firebaseDb.collection('users').get();
    return snap.docs
        .map(doc => ({
            uid: doc.id,
            email: doc.data().email || '',
            role: doc.data().role || 'user'
        }))
        .filter(u => u.email)
        .sort((a, b) => a.email.localeCompare(b.email, 'de'));
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
 * Firestore-Dokument für nachgetragene Katalog-Leitungen.
 * @returns {firebase.firestore.DocumentReference|null}
 */
export function getKatalogConfigDoc() {
    if (!appState.firebaseReady || !appState.firebaseDb) return null;
    return appState.firebaseDb.collection('config').doc('leitungenKatalog');
}


/**
 * Lädt nachgetragene Leitungen aus Firestore.
 * @returns {Promise<object[]>}
 */
export async function getKatalogAdditions() {
    const ref = getKatalogConfigDoc();
    if (!ref) return [];

    const snap = await ref.get();
    if (!snap.exists) return [];
    const data = snap.data() || {};
    return Array.isArray(data.additions) ? data.additions : [];
}


/**
 * Speichert nachgetragene Leitungen in Firestore.
 * @param {object[]} additions
 * @returns {Promise<void>}
 */
export async function persistKatalogAdditions(additions) {
    const ref = getKatalogConfigDoc();
    if (!ref) throw new Error('Firebase ist nicht bereit.');

    await ref.set({
        additions: additions || [],
        updatedBy: appState.currentUser?.uid || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}


/**
 * Lädt Katalog-Nachträge und mischt sie in den lokalen Katalog.
 * @returns {Promise<void>}
 */
export async function loadKatalogAdditions() {
    if (!appState.firebaseReady) return;
    try {
        const { mergeKatalogAdditions, ensureKatalogLists } = await import('./catalog.js');
        const additions = await getKatalogAdditions();
        mergeKatalogAdditions(additions);
        additions.forEach(a => ensureKatalogLists(a));
    } catch (error) {
        console.error('Katalog-Nachträge konnten nicht geladen werden:', error);
    }
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
            email: (user.email || '').toLowerCase(),
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
            const defaultsById = new Map(DEFAULT_WIZARD_STEPS.map(s => [s.id, s]));
            appState.wizardSteps = valid.map((s, i) => {
                const normalized = normalizeWizardStep(s, i);
                const fallback = defaultsById.get(normalized.id);
                // Fehlende Vorauswahl/Standard-Kategorie aus den Code-Defaults ergänzen
                if (fallback) {
                    if (!normalized.defaultCategory && fallback.defaultCategory) {
                        normalized.defaultCategory = fallback.defaultCategory;
                    }
                    if (!normalized.vorauswahl && fallback.vorauswahl) {
                        normalized.vorauswahl = { ...fallback.vorauswahl };
                    }
                }
                return normalized;
            });
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
    const navKatalog = document.getElementById('nav-katalog');
    if (!navLogout || !navUser || !navAdmin) return;

    if (appState.currentUser) {
        navLogout.classList.remove('hidden');
        navUser.classList.remove('hidden');
        navUser.textContent = appState.currentUser.email || '';
        navKatalog?.classList.remove('hidden');
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
        // Ohne Firebase (lokaler Modus) Katalog trotzdem zugänglich
        if (!appState.firebaseReady) {
            navKatalog?.classList.remove('hidden');
        } else {
            navKatalog?.classList.add('hidden');
        }
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
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const repeat = document.getElementById('reg-password-repeat').value;
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
 * Wechselt zwischen Login-, Registrierungs- und Passwort-Reset-Ansicht.
 * @param {'login'|'register'|'reset'} mode
 * @returns {void}
 */
export function showAuthMode(mode) {
    const loginBox = document.getElementById('auth-login-box');
    const registerBox = document.getElementById('auth-register-box');
    const resetBox = document.getElementById('auth-reset-box');
    if (!loginBox || !registerBox || !resetBox) return;

    const showRegister = mode === 'register';
    const showReset = mode === 'reset';

    loginBox.hidden = showRegister || showReset;
    registerBox.hidden = !showRegister;
    resetBox.hidden = !showReset;

    if (showReset) {
        const loginEmail = document.getElementById('auth-email')?.value?.trim() || '';
        const resetEmail = document.getElementById('reset-email');
        if (resetEmail && loginEmail && !resetEmail.value) {
            resetEmail.value = loginEmail;
        }
        resetEmail?.focus();
        return;
    }

    const focusField = document.getElementById(showRegister ? 'reg-email' : 'auth-email');
    focusField?.focus();
}


/**
 * Sendet eine E-Mail zum Zurücksetzen des Passworts.
 * @returns {Promise<void>}
 */
export async function resetPassword() {
    if (!appState.firebaseReady || !appState.firebaseAuth) {
        await showModal('Firebase ist nicht konfiguriert. Bitte zuerst `firebase-config.js` ausfüllen.', {
            type: 'warning',
            title: 'Firebase fehlt'
        });
        return;
    }

    const email = document.getElementById('reset-email')?.value.trim();
    if (!email) {
        showModal('Bitte E-Mail-Adresse eingeben.', { type: 'warning', title: 'Fehlende Eingabe' });
        return;
    }

    try {
        await appState.firebaseAuth.sendPasswordResetEmail(email);
        showModal(
            `Falls ein Konto mit ${email} existiert, wurde ein Link zum Zurücksetzen gesendet. Bitte prüfe auch den Spam-Ordner.`,
            { type: 'success', title: 'E-Mail gesendet' }
        );
        showAuthMode('login');
    } catch (error) {
        showModal(`Passwort-Reset fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
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
