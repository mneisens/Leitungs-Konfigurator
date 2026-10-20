/**
 * @file Speichern von Projekten nach Firestore.
 *
 * Änderungen werden pro Projekt gesammelt und verzögert geschrieben. Jedes Dokument trägt
 * eine `revision`; ist die Version in Firestore neuer als die zuletzt geladene, hat jemand
 * anderes zwischendurch gespeichert – dann wird nicht still überschrieben, sondern gefragt.
 */
import { appState } from './state.js';
import { showModal } from './modal.js';
import { getProjectDocRef } from './firebase.js';
import { canEditProject, projectToFirestore, projectFromFirestore } from './project-access.js';

const SAVE_DELAY_MS = 600;
const FIRESTORE_LIMIT_BYTES = 1024 * 1024;
const GROESSE_WARNUNG_BYTES = 750 * 1024;

/** @type {Map<string, {projekt: object, timer: number}>} */
const pending = new Map();
/** @type {Map<string, Promise<void>>} */
const inFlight = new Map();
const groesseGewarnt = new Set();

let statusTimer = 0;


/**
 * @param {'saving'|'saved'|'error'|'conflict'} zustand
 * @param {string} [text]
 * @returns {void}
 */
function setSaveStatus(zustand, text) {
    const el = document.getElementById('save-status');
    if (!el) return;

    const texte = {
        saving: 'Speichert…',
        saved: 'Gespeichert ✓',
        error: 'Speichern fehlgeschlagen – erneuter Versuch läuft',
        conflict: 'Konflikt – bitte entscheiden'
    };

    clearTimeout(statusTimer);
    el.dataset.state = zustand;
    el.textContent = text || texte[zustand] || '';
    el.hidden = false;

    if (zustand === 'saved') {
        statusTimer = setTimeout(() => { el.hidden = true; }, 1800);
    }
}


/**
 * Merkt ein Projekt zum Speichern vor; mehrere Änderungen kurz hintereinander werden gebündelt.
 * @param {object} projekt
 * @returns {void}
 */
export function scheduleProjectSave(projekt) {
    if (!appState.firebaseReady || !appState.currentUser || !projekt?.id) return;
    if (!canEditProject(projekt)) return;

    const eintrag = pending.get(projekt.id);
    if (eintrag) clearTimeout(eintrag.timer);

    const timer = setTimeout(() => {
        pending.delete(projekt.id);
        enqueueWrite(projekt);
    }, SAVE_DELAY_MS);

    pending.set(projekt.id, { projekt, timer });
    setSaveStatus('saving');
}


/**
 * Speichert ein Projekt ohne Verzögerung (z. B. bei Freigaben).
 * @param {object} projekt
 * @param {{force?: boolean}} [optionen] force: ohne Konfliktabfrage überschreiben (Import)
 * @returns {Promise<void>}
 */
export function saveProjectNow(projekt, optionen = {}) {
    if (!appState.firebaseReady || !appState.currentUser || !projekt?.id) return Promise.resolve();
    if (!canEditProject(projekt)) return Promise.resolve();

    const eintrag = pending.get(projekt.id);
    if (eintrag) {
        clearTimeout(eintrag.timer);
        pending.delete(projekt.id);
    }
    setSaveStatus('saving');
    return enqueueWrite(projekt, optionen);
}


/**
 * Schreibt alle vorgemerkten Projekte sofort.
 * @returns {Promise<void>}
 */
export function flushProjectSaves() {
    const offen = Array.from(pending.values()).map(e => e.projekt);
    offen.forEach(projekt => {
        clearTimeout(pending.get(projekt.id)?.timer);
        pending.delete(projekt.id);
    });
    return Promise.all(offen.map(projekt => enqueueWrite(projekt))).then(() => {});
}


/**
 * @returns {boolean}
 */
export function hasPendingSaves() {
    return pending.size > 0 || inFlight.size > 0;
}


/**
 * Hängt einen Schreibvorgang hinter den laufenden desselben Projekts,
 * damit die Revisionen in der richtigen Reihenfolge hochgezählt werden.
 * @param {object} projekt
 * @returns {Promise<void>}
 */
function enqueueWrite(projekt, optionen = {}) {
    const vorher = inFlight.get(projekt.id) || Promise.resolve();
    const lauf = vorher.then(() => writeProject(projekt, optionen)).finally(() => {
        if (inFlight.get(projekt.id) === lauf) inFlight.delete(projekt.id);
        if (!hasPendingSaves() && document.getElementById('save-status')?.dataset.state === 'saving') {
            setSaveStatus('saved');
        }
    });
    inFlight.set(projekt.id, lauf);
    return lauf;
}


/**
 * @param {object} daten
 * @param {object} projekt
 * @returns {boolean} false, wenn das Dokument zu groß für Firestore ist
 */
function pruefeGroesse(daten, projekt) {
    const bytes = new Blob([JSON.stringify(daten)]).size;
    if (bytes >= FIRESTORE_LIMIT_BYTES) {
        setSaveStatus('error', 'Projekt zu groß zum Speichern');
        showModal(
            `Das Projekt „${projekt.name || projekt.id}" ist mit ${Math.round(bytes / 1024)} KB zu groß für Firestore (max. 1024 KB).\n\n`
            + 'Die Änderungen sind nur lokal in diesem Browser gespeichert. Bitte z. B. alte Zeiterfassungs-Einträge oder lange Kommentare entfernen.',
            { type: 'danger', title: 'Projekt zu groß' }
        );
        return false;
    }
    if (bytes >= GROESSE_WARNUNG_BYTES && !groesseGewarnt.has(projekt.id)) {
        groesseGewarnt.add(projekt.id);
        showModal(
            `Das Projekt „${projekt.name || projekt.id}" belegt bereits ${Math.round(bytes / 1024)} KB von maximal 1024 KB in Firestore.`,
            { type: 'warning', title: 'Projekt wird groß' }
        );
    }
    return true;
}


/**
 * @param {object} projekt
 * @param {{force?: boolean}} [optionen]
 * @returns {Promise<void>}
 */
async function writeProject(projekt, optionen = {}) {
    const ref = getProjectDocRef(projekt.id);
    const db = appState.firebaseDb;
    if (!ref || !db) return;

    const daten = projectToFirestore(projekt);
    if (!pruefeGroesse(daten, projekt)) return;

    const basis = Number(projekt.revision) || 0;

    try {
        const neueRevision = await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            const remote = snap.exists ? (Number(snap.data().revision) || 0) : 0;
            if (snap.exists && remote > basis && !optionen.force) {
                const fehler = new Error('revision-conflict');
                fehler.conflict = { remote, by: snap.data().updatedByEmail || '' };
                throw fehler;
            }
            const revision = Math.max(remote, basis) + 1;
            tx.set(ref, { ...daten, revision });
            return revision;
        });
        projekt.revision = neueRevision;
        appState.firestoreErrorShown = false;
    } catch (error) {
        if (error?.conflict) {
            await handleConflict(projekt, error.conflict);
            return;
        }
        // Ältere Regeln erlauben das Lesen eines noch nicht existierenden Dokuments nicht –
        // ein neues Projekt dann ohne Revisionsprüfung anlegen.
        if (error?.code === 'permission-denied' && basis === 0) {
            try {
                await ref.set({ ...daten, revision: 1 });
                projekt.revision = 1;
                return;
            } catch (fallbackError) {
                handleWriteError(projekt, fallbackError);
                return;
            }
        }
        handleWriteError(projekt, error);
    }
}


/**
 * @param {object} projekt
 * @param {Error} error
 * @returns {void}
 */
function handleWriteError(projekt, error) {
    console.error('Fehler beim Speichern in Firestore:', error);
    setSaveStatus('error');

    if (error?.code === 'permission-denied') {
        setSaveStatus('error', 'Keine Berechtigung zum Speichern');
        if (!appState.firestoreErrorShown) {
            appState.firestoreErrorShown = true;
            showModal(`Speichern abgelehnt (keine Berechtigung):\n${error.message}`, {
                type: 'danger',
                title: 'Firebase Fehler'
            });
        }
        return;
    }

    // Netzwerk- o. ä. Fehler: später erneut versuchen, die Daten liegen bis dahin im localStorage.
    const eintrag = pending.get(projekt.id);
    if (eintrag) return;
    const timer = setTimeout(() => {
        pending.delete(projekt.id);
        enqueueWrite(projekt);
    }, 5000);
    pending.set(projekt.id, { projekt, timer });
}


/**
 * @param {object} projekt
 * @param {{remote: number, by: string}} info
 * @returns {Promise<void>}
 */
async function handleConflict(projekt, info) {
    setSaveStatus('conflict');
    const wer = info.by ? ` von ${info.by}` : '';
    const neuLaden = await showModal(
        `Das Projekt „${projekt.name || projekt.id}" wurde zwischenzeitlich${wer} geändert.\n\n`
        + '„Neu laden" übernimmt den Stand aus der Datenbank (deine letzten Änderungen gehen verloren).\n'
        + '„Meine Version speichern" überschreibt den anderen Stand.',
        {
            type: 'warning',
            title: 'Gleichzeitige Bearbeitung',
            showCancel: true,
            confirmText: 'Neu laden',
            cancelText: 'Meine Version speichern'
        }
    );

    if (neuLaden) {
        await reloadProject(projekt.id);
        setSaveStatus('saved', 'Neu geladen ✓');
        return;
    }
    await writeProject(projekt, { force: true });
    if (!hasPendingSaves()) setSaveStatus('saved');
}


/**
 * Ersetzt ein Projekt im Cache durch den Stand aus Firestore und zeichnet die Ansicht neu.
 * @param {string} projectId
 * @returns {Promise<void>}
 */
async function reloadProject(projectId) {
    const ref = getProjectDocRef(projectId);
    if (!ref) return;
    const snap = await ref.get();
    if (!snap.exists) return;

    const frisch = projectFromFirestore(snap.data());
    const cache = appState.projectsCache || [];
    const idx = cache.findIndex(p => p.id === projectId);
    if (idx >= 0) cache[idx] = frisch;

    if (appState.currentProjekt?.id === projectId) {
        appState.currentProjekt = frisch;
        const { ensureWizardAnswers } = await import('./projects.js');
        ensureWizardAnswers(frisch);
        const { showView } = await import('./navigation.js');
        showView(appState.currentView || 'uebersicht');
    }
}


window.addEventListener('pagehide', () => { flushProjectSaves(); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushProjectSaves();
});
window.addEventListener('beforeunload', event => {
    if (!hasPendingSaves()) return;
    flushProjectSaves();
    event.preventDefault();
    event.returnValue = '';
});
