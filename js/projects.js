/**
 * @file projects.js
 */
import { appState } from './state.js';
import { generateId, formatDate } from './utils.js';
import { showModal } from './modal.js';
import { showView } from './navigation.js';
import { cloneTemplate, setText } from './templates.js';
import {
    getProjectsStorageKey,
    getUserProjectsDoc,
    getProjectsCollection,
    getProjectDocRef
} from './firebase.js';
import {
    ensureProjectAccessFields,
    projectToFirestore,
    projectFromFirestore,
    canEditProject,
    canDeleteProject,
    canManageSharing,
    getProjectRole,
    getRoleLabel,
    assertCanEdit,
    renderProjectSharingView,
    ROLE_EDIT,
    ROLE_VIEW
} from './project-access.js';

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

    if (appState.firebaseReady && appState.currentUser) {
        appState.projectsCache.forEach(projekt => {
            saveProjectToFirestore(projekt);
        });
    } else {
        const ref = getUserProjectsDoc();
        if (ref) {
            ref.set({
                projects: appState.projectsCache,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(handleFirestoreSaveError);
        }
    }
}


/**
 * @param {Error} error
 * @returns {void}
 */
function handleFirestoreSaveError(error) {
    console.error('Fehler beim Speichern in Firestore:', error);
    if (!appState.firestoreErrorShown) {
        appState.firestoreErrorShown = true;
        showModal(`Firestore-Speichern fehlgeschlagen:\n${error.message}`, {
            type: 'danger',
            title: 'Firebase Fehler'
        });
    }
}


/**
 * @param {object} projekt
 * @returns {void}
 */
export function saveProjectToFirestore(projekt) {
    if (!appState.firebaseReady || !appState.currentUser || !projekt?.id) return;
    if (!canEditProject(projekt)) return;

    const ref = getProjectDocRef(projekt.id);
    if (!ref) return;

    ref.set(projectToFirestore(projekt)).catch(handleFirestoreSaveError);
}


/**
 * @param {string} projectId
 * @returns {Promise<void>}
 */
async function deleteProjectFromFirestore(projectId) {
    const ref = getProjectDocRef(projectId);
    if (ref) await ref.delete();
}


/**
 * @returns {Promise<object[]>}
 */
async function loadProjectsFromFirestore() {
    if (!appState.firebaseReady || !appState.currentUser || !appState.firebaseDb) return [];

    const uid = appState.currentUser.uid;
    const col = getProjectsCollection();
    if (!col) return [];

    const snap = await col.where('memberIds', 'array-contains', uid).get();
    const projects = snap.docs.map(doc => projectFromFirestore(doc.data()));

    await migrateLegacyProjects(projects, uid);
    return projects;
}


/**
 * @param {object[]} existing
 * @param {string} uid
 * @returns {Promise<void>}
 */
async function migrateLegacyProjects(existing, uid) {
    const legacyRef = getUserProjectsDoc();
    if (!legacyRef) return;

    const legacySnap = await legacyRef.get();
    if (!legacySnap.exists) return;

    const legacyProjects = legacySnap.data().projects || [];
    if (!Array.isArray(legacyProjects) || legacyProjects.length === 0) return;

    const existingIds = new Set(existing.map(p => p.id));
    const col = getProjectsCollection();
    if (!col) return;

    const batch = appState.firebaseDb.batch();

    legacyProjects.forEach(raw => {
        if (!raw?.id || existingIds.has(raw.id)) return;

        const projekt = ensureProjectAccessFields({ ...raw }, true);
        projekt.ownerId = uid;
        projekt.ownerEmail = (appState.currentUser.email || '').toLowerCase();

        batch.set(col.doc(projekt.id), projectToFirestore(projekt));
        existing.push(projekt);
    });

    batch.delete(legacyRef);
    await batch.commit();
}


/**
 * persistCurrentProjekt.
 * @returns {void}
 */
export function persistCurrentProjekt() {
    if (!appState.currentProjekt) return;
    if (!canEditProject(appState.currentProjekt)) return;

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
    if (!projekt.wizardSkipped || typeof projekt.wizardSkipped !== 'object') {
        projekt.wizardSkipped = {};
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
    const projects = getProjects();
    const existingIndex = projects.findIndex(p => p.id === id);

    if (!isNew && existingIndex >= 0 && !canEditProject(projects[existingIndex])) {
        showModal('Sie haben nur Lesezugriff auf dieses Projekt.', {
            type: 'warning',
            title: 'Keine Berechtigung'
        });
        return;
    }

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
    
    if (existingIndex >= 0) {
        projekt.erstellt = projects[existingIndex].erstellt;
        projekt.leitungen = projects[existingIndex].leitungen || [];
        projekt.bauteile = projects[existingIndex].bauteile || [];
        projekt.wizardAnswers = projects[existingIndex].wizardAnswers || {};
        projekt.wizardSkipped = projects[existingIndex].wizardSkipped || {};
        projekt.ownerId = projects[existingIndex].ownerId;
        projekt.ownerEmail = projects[existingIndex].ownerEmail;
        projekt.members = projects[existingIndex].members;
        projekt.memberIds = projects[existingIndex].memberIds;
        projects[existingIndex] = projekt;
    } else {
        ensureProjectAccessFields(projekt, true);
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

    if (projekt && !canEditProject(projekt)) {
        showModal('Sie haben nur Lesezugriff auf dieses Projekt.', {
            type: 'warning',
            title: 'Keine Berechtigung'
        });
        return;
    }

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

    if (!canDeleteProject(projekt)) {
        showModal('Nur der Projekteigentümer kann das Projekt löschen.', {
            type: 'warning',
            title: 'Keine Berechtigung'
        });
        return;
    }

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

    if (appState.firebaseReady) {
        try {
            await deleteProjectFromFirestore(id);
        } catch (error) {
            console.error('Fehler beim Löschen in Firestore:', error);
        }
    }

    if (appState.currentProjekt && appState.currentProjekt.id === id) {
        appState.currentProjekt = null;
    }

    loadProjects();
}


/**
 * @returns {Promise<void>}
 */
export async function shareProjectWithUser() {
    if (!appState.currentProjekt || !canManageSharing(appState.currentProjekt)) {
        showModal('Nur der Projekteigentümer kann Freigaben verwalten.', {
            type: 'warning',
            title: 'Keine Berechtigung'
        });
        return;
    }

    const userSelect = document.getElementById('share-user');
    const roleSelect = document.getElementById('share-role');
    const selectedUid = userSelect?.value;
    const role = roleSelect?.value === ROLE_EDIT ? ROLE_EDIT : ROLE_VIEW;

    if (!selectedUid) {
        showModal('Bitte einen Nutzer aus der Liste auswählen.', { type: 'warning', title: 'Auswahl fehlt' });
        return;
    }

    const selectedOption = userSelect.options[userSelect.selectedIndex];
    const user = {
        uid: selectedUid,
        email: selectedOption?.dataset?.email || selectedOption?.textContent || selectedUid
    };

    if (user.uid === appState.currentUser?.uid) {
        showModal('Sie können sich nicht selbst freigeben.', { type: 'warning', title: 'Ungültige Auswahl' });
        return;
    }

    const projekt = appState.currentProjekt;
    projekt.members = projekt.members || {};
    projekt.memberIds = projekt.memberIds || [projekt.ownerId];

    if (projekt.members[user.uid]?.role === 'owner') {
        showModal('Der Eigentümer ist bereits im Projekt.', { type: 'info', title: 'Hinweis' });
        return;
    }

    projekt.members[user.uid] = { email: user.email, role };
    if (!projekt.memberIds.includes(user.uid)) {
        projekt.memberIds.push(user.uid);
    }

    const projects = getProjects();
    const idx = projects.findIndex(p => p.id === projekt.id);
    if (idx >= 0) projects[idx] = projekt;

    saveProjects(projects);
    saveProjectToFirestore(projekt);

    if (userSelect) userSelect.value = '';
    renderProjectSharingView();

    showModal(
        `„${projekt.name}" wurde für ${user.email} freigegeben (${getRoleLabel(role)}).`,
        { type: 'success', title: 'Freigabe gespeichert' }
    );
}


/**
 * @param {string} memberUid
 * @returns {Promise<void>}
 */
export async function removeProjectShare(memberUid) {
    if (!appState.currentProjekt || !canManageSharing(appState.currentProjekt)) return;

    const projekt = appState.currentProjekt;
    if (!projekt.members?.[memberUid]) return;

    const email = projekt.members[memberUid].email || memberUid;
    const confirmed = await showModal(
        `Freigabe für ${email} wirklich entfernen?`,
        { type: 'warning', title: 'Freigabe entfernen', showCancel: true, confirmText: 'Entfernen' }
    );
    if (!confirmed) return;

    delete projekt.members[memberUid];
    projekt.memberIds = (projekt.memberIds || []).filter(id => id !== memberUid);

    const projects = getProjects();
    const idx = projects.findIndex(p => p.id === projekt.id);
    if (idx >= 0) projects[idx] = projekt;

    saveProjects(projects);
    saveProjectToFirestore(projekt);
    renderProjectSharingView();
}


/**
 * Öffnet die Freigaben-Seite (nur Eigentümer).
 * @returns {void}
 */
export function openProjectSharing() {
    if (!appState.currentProjekt) {
        showView('home');
        return;
    }

    if (!canManageSharing(appState.currentProjekt)) {
        showModal('Nur der Projekteigentümer kann Freigaben verwalten.', {
            type: 'warning',
            title: 'Keine Berechtigung'
        });
        return;
    }

    showView('projekt-freigabe');
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
            appState.projectsCache = await loadProjectsFromFirestore();
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

        const role = getProjectRole(p);
        const badgeEl = fragment.querySelector('[data-field="role-badge"]');
        if (badgeEl && role && appState.firebaseReady) {
            badgeEl.hidden = false;
            badgeEl.textContent = getRoleLabel(role);
            badgeEl.className = `projekt-role-badge role-${role}`;
        }

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
        const editBtn = card.querySelector('[data-action="edit"]');
        const deleteBtn = card.querySelector('[data-action="delete"]');
        if (!canEditProject(p) && editBtn) editBtn.style.display = 'none';
        if (!canDeleteProject(p) && deleteBtn) deleteBtn.style.display = 'none';

        editBtn?.addEventListener('click', e => { e.stopPropagation(); editProjekt(p.id); });
        deleteBtn?.addEventListener('click', e => { e.stopPropagation(); deleteProjekt(p.id); });
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
    if (!assertCanEdit('den Schaltplan-Assistenten')) return;
    ensureWizardAnswers(appState.currentProjekt);
    if (!appState.wizardSteps.length) {
        showModal('Keine Assistent-Fragen vorhanden. Bitte als Admin Fragen konfigurieren.', {
            type: 'warning',
            title: 'Assistent leer'
        });
        return;
    }

    const firstOpen = appState.wizardSteps.findIndex(step => {
        const hasLeitung = (appState.currentProjekt.leitungen || []).some(l => l.wizardStepId === step.id);
        const hasBauteil = (appState.currentProjekt.bauteile || []).some(b => b.wizardStepId === step.id);
        const skipped = appState.currentProjekt.wizardSkipped?.[step.id] === true;
        const note = appState.currentProjekt.wizardAnswers[step.id];
        return !(hasLeitung || hasBauteil || skipped || (note && String(note).trim()));
    });
    appState.wizardStepIndex = firstOpen >= 0 ? firstOpen : 0;
    showView('projekt-wizard');
}
