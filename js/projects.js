/**
 * @file projects.js
 */
import { appState } from './state.js';
import { generateId, escapeHtml, formatDate, formatDateForFile } from './utils.js';
import { showModal, closeModal } from './modal.js';
import { showView } from './navigation.js';
import { cloneTemplate, setText } from './templates.js';
import { getProjectsStorageKey, getUserProjectsDoc } from './firebase.js';

/**
 * getProjects.
 * @returns {void}
 */
export function getProjects() {
    return Array.isArray(appState.projectsCache) ? appState.projectsCache : [];
}


/**
 * saveProjects.
 * @returns {void}
 */
export function saveProjects(projects) {
    appState.projectsCache = Array.isArray(projects) ? projects : [];
    localStorage.setItem(getProjectsStorageKey(), JSON.stringify(appState.projectsCache));
    if (!appState.currentUser) {
        localStorage.setItem('leitungskonfigurator_projekte', JSON.stringify(appState.projectsCache));
    }

    const ref = getUserProjectsDoc();
    if (ref) {
        ref.set({
            projects: appState.projectsCache,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(error => {
            console.error('Fehler beim Speichern in Firestore:', error);
            if (!appState.firestoreErrorShown) {
                appState.firestoreErrorShown = true;
                showModal(`Firestore-Speichern fehlgeschlagen:\n${error.message}`, {
                    type: 'danger',
                    title: 'Firebase Fehler'
                });
            }
        });
    }
}


/**
 * persistCurrentProjekt.
 * @returns {void}
 */
export function persistCurrentProjekt() {
    if (!appState.currentProjekt) return;
    const projects = getProjects();
    const idx = projects.findIndex(p => p.id === appState.currentProjekt.id);
    if (idx >= 0) {
        projects[idx] = appState.currentProjekt;
        saveProjects(projects);
    }
}


/**
 * ensureWizardAnswers.
 * @returns {void}
 */
export function ensureWizardAnswers(projekt) {
    if (!projekt) return;
    if (!projekt.wizardAnswers || typeof projekt.wizardAnswers !== 'object') {
        projekt.wizardAnswers = {};
    }
    if (!Array.isArray(projekt.bauteile)) {
        projekt.bauteile = [];
    }
}


/**
 * resetProjektForm.
 * @returns {void}
 */
export function resetProjektForm() {
    document.getElementById('projekt-form-titel').textContent = 'Neues Projekt anlegen';
    document.getElementById('projekt-form').reset();
    document.getElementById('projekt-id').value = '';
}


/**
 * saveProjekt.
 * @returns {void}
 */
export function saveProjekt(event) {
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
        bauteile: [],
        wizardAnswers: {}
    };
    
    const projects = getProjects();
    const existingIndex = projects.findIndex(p => p.id === id);
    
    if (existingIndex >= 0) {
        projekt.erstellt = projects[existingIndex].erstellt;
        projekt.leitungen = projects[existingIndex].leitungen || [];
        projekt.bauteile = projects[existingIndex].bauteile || [];
        projekt.wizardAnswers = projects[existingIndex].wizardAnswers || {};
        projects[existingIndex] = projekt;
    } else {
        projects.unshift(projekt);
    }
    
    saveProjects(projects);
    appState.currentProjekt = projekt;
    appState.currentLeitungIndex = 0;
    ensureWizardAnswers(appState.currentProjekt);
    appState.wizardStepIndex = 0;

    if (isNew) {
        showView('projekt-wizard');
    } else {
        showView('uebersicht');
    }
}


/**
 * openProjekt.
 * @returns {void}
 */
export function openProjekt(id) {
    const projects = getProjects();
    appState.currentProjekt = projects.find(p => p.id === id);
    
    if (appState.currentProjekt) {
        appState.currentLeitungIndex = 0;
        ensureWizardAnswers(appState.currentProjekt);
        showView('uebersicht');
    }
}


/**
 * editProjekt.
 * @returns {void}
 */
export function editProjekt(id) {
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
        
        appState.currentProjekt = projekt;
        ensureWizardAnswers(appState.currentProjekt);
        showView('projekt-form');
    }
}


/**
 * deleteProjekt.
 * @returns {void}
 */
export async function deleteProjekt(id) {
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
    
    if (appState.currentProjekt && appState.currentProjekt.id === id) {
        appState.currentProjekt = null;
    }
    
    loadProjects();
}


/**
 * startProjektWizard.
 * @returns {void}
 */

/**
 * Lädt Projekte und rendert die Projektliste.
 * @returns {Promise<void>}
 */
export async function loadProjects() {
    const liste = document.getElementById('projekt-liste');
    const empty = document.getElementById('keine-projekte');
    if (!liste || !empty) return;

    if (appState.firebaseReady && appState.currentUser) {
        try {
            const ref = getUserProjectsDoc();
            const snap = ref ? await ref.get() : null;
            const remoteProjects = snap?.exists ? (snap.data().projects || []) : [];
            appState.projectsCache = Array.isArray(remoteProjects) ? remoteProjects : [];
            localStorage.setItem(getProjectsStorageKey(), JSON.stringify(appState.projectsCache));
        } catch (error) {
            console.error('Fehler beim Laden aus Firestore:', error);
            if (!appState.firestoreErrorShown) {
                appState.firestoreErrorShown = true;
                showModal(`Firestore-Laden fehlgeschlagen:\n${error.message}`, {
                    type: 'danger',
                    title: 'Firebase Fehler'
                });
            }
            const fallback = localStorage.getItem(getProjectsStorageKey());
            appState.projectsCache = fallback ? JSON.parse(fallback) : [];
        }
    } else {
        const data = localStorage.getItem(getProjectsStorageKey())
            || localStorage.getItem('leitungskonfigurator_projekte');
        appState.projectsCache = data ? JSON.parse(data) : [];
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
    liste.innerHTML = '';
    projects.forEach(p => {
        const fragment = cloneTemplate('project-card');
        const card = fragment.querySelector('.projekt-card');
        card.dataset.projektId = p.id;
        setText(fragment, '[data-field="nummer"]', p.projektnummer);
        setText(fragment, '[data-field="name"]', p.name);
        setText(fragment, '[data-field="leitungen-count"]', `Leitungen: ${p.leitungen ? p.leitungen.length : 0}`);
        const kundeEl = fragment.querySelector('[data-field="kunde"]');
        if (p.kunde && kundeEl) {
            kundeEl.hidden = false;
            kundeEl.textContent = `Kunde: ${p.kunde}`;
        }
        const ltEl = fragment.querySelector('[data-field="liefertermin"]');
        if (p.liefertermin && ltEl) {
            ltEl.hidden = false;
            ltEl.textContent = `Liefertermin: ${formatDate(p.liefertermin)}`;
        }
        card.addEventListener('click', () => openProjekt(p.id));
        card.querySelector('[data-action="open"]')
            ?.addEventListener('click', e => { e.stopPropagation(); openProjekt(p.id); });
        card.querySelector('[data-action="edit"]')
            ?.addEventListener('click', e => { e.stopPropagation(); editProjekt(p.id); });
        card.querySelector('[data-action="delete"]')
            ?.addEventListener('click', e => { e.stopPropagation(); deleteProjekt(p.id); });
        liste.appendChild(fragment);
    });
}


/**
 * Öffnet das Formular für ein neues Projekt.
 * @returns {void}
 */
export function openNewProjektForm() {
    resetProjektForm();
    appState.currentProjekt = null;
    showView('projekt-form');
}

export function startProjektWizard() {
    if (!appState.currentProjekt) return;
    ensureWizardAnswers(appState.currentProjekt);
    if (!appState.wizardSteps.length) {
        showModal('Keine Assistent-Fragen vorhanden. Bitte als Admin Fragen konfigurieren.', {
            type: 'warning',
            title: 'Assistent leer'
        });
        return;
    }

    const firstOpen = appState.wizardSteps.findIndex(step => {
        const val = appState.currentProjekt.wizardAnswers[step.id];
        return !val || !String(val).trim();
    });
    appState.wizardStepIndex = firstOpen >= 0 ? firstOpen : 0;
    showView('projekt-wizard');
}
