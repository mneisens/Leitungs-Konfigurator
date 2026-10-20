/**
 * @file projects.js
 */
import { appState } from './state.js';
import { generateId, formatDate, escapeHtml } from './utils.js';
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
    getProjectOwnerLabel,
    assertCanEdit,
    renderProjectSharingView,
    updateVisibilityToggle,
    ROLE_EDIT,
    ROLE_VIEW,
    VISIBILITY_PUBLIC,
    VISIBILITY_PRIVATE
} from './project-access.js';
import { METERWARE_KATEGORIEN } from './leitung-optionen.js';
import { scheduleProjectSave, saveProjectNow } from './project-save.js';

/**
 * getProjects.
 * @returns {void}
 */
export function getProjects() {
    return Array.isArray(appState.projectsCache) ? appState.projectsCache : [];
}


/**
 * Legt die Projektliste lokal ab und merkt die geänderten Projekte zum Speichern in Firestore vor.
 * Nur die übergebenen Projekte werden geschrieben – sonst würden veraltete Kopien
 * anderer Projekte deren aktuellen Stand überschreiben.
 * @param {object[]} projects
 * @param {object[]} [geaendert]
 * @returns {void}
 */
export function saveProjects(projects, geaendert = []) {
    appState.projectsCache = Array.isArray(projects) ? projects : [];
    localStorage.setItem(getProjectsStorageKey(), JSON.stringify(appState.projectsCache));
    if (!appState.currentUser) {
        localStorage.setItem('leitungskonfigurator_projekte', JSON.stringify(appState.projectsCache));
    }

    geaendert.filter(Boolean).forEach(scheduleProjectSave);
}


/**
 * Schreibt ein Projekt sofort nach Firestore (ohne Bündelung).
 * @param {object} projekt
 * @returns {Promise<void>}
 */
export function saveProjectToFirestore(projekt) {
    return saveProjectNow(projekt);
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

    const [memberSnap, publicSnap] = await Promise.all([
        col.where('memberIds', 'array-contains', uid).get(),
        col.where('visibility', '==', VISIBILITY_PUBLIC).get()
    ]);

    const byId = new Map();
    memberSnap.docs.forEach(doc => byId.set(doc.id, projectFromFirestore(doc.data())));
    publicSnap.docs.forEach(doc => {
        if (!byId.has(doc.id)) byId.set(doc.id, projectFromFirestore(doc.data()));
    });

    const projects = Array.from(byId.values());

    try {
        await migrateLegacyProjects(projects, uid);
    } catch (error) {
        console.warn('Alte Projektliste konnte nicht übernommen werden:', error);
    }
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
    } else {
        projects.unshift(appState.currentProjekt);
    }
    saveProjects(projects, [appState.currentProjekt]);
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
    if (!projekt.gruppenStatus || typeof projekt.gruppenStatus !== 'object') {
        projekt.gruppenStatus = {};
    }
    if (!Array.isArray(projekt.zusaetzlicheGruppen)) {
        projekt.zusaetzlicheGruppen = [];
    }
    if (!Array.isArray(projekt.cadLinks)) {
        projekt.cadLinks = [];
    }
    if (!Array.isArray(projekt.zeiterfassung)) {
        projekt.zeiterfassung = [];
    }
    if (!Array.isArray(projekt.leitungswege)) {
        projekt.leitungswege = [];
    }
    if (!projekt.ethercatTopologie || typeof projekt.ethercatTopologie !== 'object') {
        projekt.ethercatTopologie = { module: [], verbindungen: [] };
    }
}


/**
 * Ergänzt fehlendes http(s)-Schema an CAD-URLs. Nur http(s) und file sind erlaubt –
 * Schemata wie `javascript:` würden beim Klick Code ausführen.
 * @param {string} url
 * @returns {string}
 */
export function normalizeCadLinkUrl(url) {
    const wert = String(url || '').trim();
    if (!wert) return '';
    const schema = wert.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
    if (!schema) return `https://${wert}`;
    return ['http', 'https', 'file'].includes(schema) ? wert : '';
}


/**
 * @param {string} [label]
 * @param {string} [url]
 * @returns {string}
 */
function cadLinkZeileMarkup(label = '', url = '') {
    const esc = escapeHtml;
    return `
        <div class="cad-link-zeile">
            <input type="text" class="cad-link-label" placeholder="Bezeichnung (optional)"
                   value="${esc(label)}" aria-label="CAD-Link Bezeichnung">
            <input type="text" class="cad-link-url" placeholder="https://cad-server/…"
                   value="${esc(url)}" aria-label="CAD-Link URL">
            <button type="button" class="btn btn-secondary btn-small btn-icon" title="Link entfernen"
                    onclick="removeCadLinkZeile(this)">✕</button>
        </div>
    `;
}


/**
 * Rendert die CAD-Link-Felder im Projektformular.
 * @param {Array<{label?: string, url?: string}>} [links]
 * @returns {void}
 */
export function renderCadLinksForm(links = []) {
    const liste = document.getElementById('projekt-cad-links');
    if (!liste) return;
    const eintraege = Array.isArray(links) && links.length ? links : [{ label: '', url: '' }];
    liste.innerHTML = eintraege.map(l => cadLinkZeileMarkup(l.label || '', l.url || '')).join('');
}


/**
 * Fügt eine leere CAD-Link-Zeile hinzu.
 * @returns {void}
 */
export function addCadLinkZeile() {
    const liste = document.getElementById('projekt-cad-links');
    if (!liste) return;
    liste.insertAdjacentHTML('beforeend', cadLinkZeileMarkup());
    const letzte = liste.querySelector('.cad-link-zeile:last-child .cad-link-url');
    letzte?.focus();
}


/**
 * Entfernt eine CAD-Link-Zeile; behält mindestens eine leere Zeile.
 * @param {HTMLElement} button
 * @returns {void}
 */
export function removeCadLinkZeile(button) {
    const liste = document.getElementById('projekt-cad-links');
    const zeile = button?.closest?.('.cad-link-zeile');
    if (!liste || !zeile) return;
    zeile.remove();
    if (!liste.querySelector('.cad-link-zeile')) {
        liste.innerHTML = cadLinkZeileMarkup();
    }
}


/**
 * Liest gültige CAD-Links aus dem Projektformular.
 * @returns {Array<{id: string, label: string, url: string}>}
 */
export function collectCadLinksFromForm() {
    const liste = document.getElementById('projekt-cad-links');
    if (!liste) return [];

    return Array.from(liste.querySelectorAll('.cad-link-zeile')).map(zeile => {
        const label = zeile.querySelector('.cad-link-label')?.value?.trim() || '';
        const url = normalizeCadLinkUrl(zeile.querySelector('.cad-link-url')?.value || '');
        if (!url) return null;
        return { id: generateId('cad'), label, url };
    }).filter(Boolean);
}


/**
 * resetProjektForm.
 * @returns {void}
 */
export function resetProjektForm() {
    document.getElementById('projekt-form-titel').textContent = 'Neues Projekt anlegen';
    document.getElementById('projekt-form').reset();
    document.getElementById('projekt-id').value = '';
    renderCadLinksForm([]);
    fillProjektVorlagen();
}


/**
 * Füllt die Auswahl „Startpunkt" mit den vorhandenen Projekten.
 * Nur beim Anlegen sichtbar – ein bestehendes Projekt hat schon einen Inhalt.
 * @param {boolean} [sichtbar]
 * @returns {void}
 */
export function fillProjektVorlagen(sichtbar = true) {
    const gruppe = document.getElementById('projekt-vorlage-group');
    const select = document.getElementById('projekt-vorlage');
    if (!gruppe || !select) return;

    const vorlagen = getProjects().filter(p => (p.leitungen?.length || p.bauteile?.length));
    gruppe.hidden = !sichtbar || vorlagen.length === 0;

    select.innerHTML = '<option value="">Leeres Projekt – jede Gruppe einzeln erfassen</option>'
        + vorlagen.map(p => {
            const teile = [];
            if (p.leitungen?.length) teile.push(`${p.leitungen.length} Leitungen`);
            if (p.bauteile?.length) teile.push(`${p.bauteile.length} Bauteile`);
            const label = `${p.projektnummer || ''} ${p.name || ''} (${teile.join(', ')})`.trim();
            return `<option value="${escapeHtml(p.id)}">${escapeHtml(label)}</option>`;
        }).join('');

    onProjektVorlageChange();
}


/**
 * Zeigt die Zusatzoption nur, wenn wirklich eine Vorlage gewählt ist.
 * @returns {void}
 */
export function onProjektVorlageChange() {
    const wrap = document.getElementById('projekt-vorlage-laengen-wrap');
    const select = document.getElementById('projekt-vorlage');
    if (wrap && select) wrap.hidden = !select.value;
}


/**
 * @param {*} value
 * @returns {*}
 */
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}


/**
 * Baut eine vollständige Projektkopie mit neuen IDs (Projekt, Leitungen, Bauteile, Topologie).
 * @param {object} quelle
 * @returns {object}
 */
function buildProjektKopie(quelle) {
    const src = cloneJson(quelle) || {};
    const leitungIdMap = new Map();
    const bauteilIdMap = new Map();
    const modulIdMap = new Map();
    const verbindungIdMap = new Map();

    const leitungen = (src.leitungen || []).map((leitung, index) => {
        const neuId = generateId('ltg');
        if (leitung.id) leitungIdMap.set(leitung.id, neuId);
        return {
            ...leitung,
            id: neuId,
            position: index + 1
        };
    });

    const bauteile = (src.bauteile || []).map(bauteil => {
        const neuId = generateId('btl');
        if (bauteil.id) bauteilIdMap.set(bauteil.id, neuId);
        return {
            ...bauteil,
            id: neuId
        };
    });

    const topoSrc = src.ethercatTopologie && typeof src.ethercatTopologie === 'object'
        ? src.ethercatTopologie
        : { module: [], verbindungen: [] };
    const module = (topoSrc.module || []).map(modul => {
        const neuId = generateId('ep');
        if (modul.id) modulIdMap.set(modul.id, neuId);
        return { ...modul, id: neuId };
    });
    const verbindungen = (topoSrc.verbindungen || []).map(verbindung => {
        const neuId = generateId('ec');
        if (verbindung.id) verbindungIdMap.set(verbindung.id, neuId);
        return {
            ...verbindung,
            id: neuId,
            vonModulId: modulIdMap.get(verbindung.vonModulId) || verbindung.vonModulId,
            nachModulId: modulIdMap.get(verbindung.nachModulId) || verbindung.nachModulId
        };
    });

    leitungen.forEach(leitung => {
        if (leitung.topoVerbindungId && verbindungIdMap.has(leitung.topoVerbindungId)) {
            leitung.topoVerbindungId = verbindungIdMap.get(leitung.topoVerbindungId);
        }
    });

    const statusSrc = src.stuecklisteStatus || { leitungen: {}, bauteile: {} };
    const stuecklisteStatus = { leitungen: {}, bauteile: {} };
    Object.entries(statusSrc.leitungen || {}).forEach(([altId, status]) => {
        const neuId = leitungIdMap.get(altId);
        if (neuId) stuecklisteStatus.leitungen[neuId] = cloneJson(status);
    });
    Object.entries(statusSrc.bauteile || {}).forEach(([altId, status]) => {
        const neuId = bauteilIdMap.get(altId);
        if (neuId) stuecklisteStatus.bauteile[neuId] = cloneJson(status);
    });

    const nummer = String(src.projektnummer || '').trim();
    const name = String(src.name || '').trim();

    return {
        id: generateId('proj'),
        projektnummer: nummer ? `${nummer}-K` : 'KOPIE',
        name: name ? `Kopie – ${name}` : 'Projektkopie',
        kunde: src.kunde || '',
        liefertermin: src.liefertermin || '',
        notiz: src.notiz || '',
        erstellt: new Date().toISOString(),
        cadLinks: Array.isArray(src.cadLinks) ? cloneJson(src.cadLinks) : [],
        leitungen,
        bauteile,
        wizardAnswers: cloneJson(src.wizardAnswers || {}),
        wizardSkipped: cloneJson(src.wizardSkipped || {}),
        gruppenStatus: cloneJson(src.gruppenStatus || {}),
        zusaetzlicheGruppen: cloneJson(src.zusaetzlicheGruppen || []),
        stuecklisteStatus,
        zeiterfassung: [],
        leitungswege: Array.isArray(src.leitungswege) ? src.leitungswege : [],
        eaListe: src.eaListe && Array.isArray(src.eaListe.positionen) ? cloneJson(src.eaListe) : null,
        ethercatTopologie: { module, verbindungen }
    };
}


/**
 * Kopiert ein bestehendes Projekt inkl. Leitungen, Bauteile und Topologie.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function copyProjekt(id) {
    const quelle = getProjects().find(p => p.id === id);
    if (!quelle) return;

    const confirmed = await showModal(
        `Projekt „${quelle.projektnummer || ''} – ${quelle.name || ''}" als Kopie anlegen?\n\n`
        + 'Leitungen, Bauteile, Gruppenstatus, Leitungswege, EA-Liste und Topologie werden übernommen. '
        + 'Die Kopie gehört dir und kann danach bearbeitet werden.',
        {
            type: 'info',
            title: 'Projekt kopieren',
            showCancel: true,
            confirmText: 'Kopieren',
            cancelText: 'Abbrechen'
        }
    );
    if (!confirmed) return;

    const kopie = buildProjektKopie(quelle);
    ensureProjectAccessFields(kopie, true);

    const projects = getProjects();
    projects.unshift(kopie);
    saveProjects(projects, [kopie]);

    appState.currentProjekt = kopie;
    appState.currentLeitungIndex = 0;
    ensureWizardAnswers(appState.currentProjekt);
    showView('uebersicht');

    showModal(
        `Kopie angelegt:\n${kopie.projektnummer} – ${kopie.name}`,
        { type: 'success', title: 'Projekt kopiert' }
    );
}


/**
 * Kopiert Positionen und Gruppenstatus einer Vorlage in ein neues Projekt.
 * Ohne `mitWerten` bleiben Längen und Stückzahlen offen – die Positionen stehen
 * dann als Arbeitsliste bereit und müssen nur noch bemaßt werden.
 * @param {object} projekt
 * @param {string} vorlageId
 * @param {boolean} mitWerten
 * @returns {void}
 */
function applyProjektVorlage(projekt, vorlageId, mitWerten) {
    const vorlage = getProjects().find(p => p.id === vorlageId);
    if (!vorlage) return;

    projekt.leitungen = (vorlage.leitungen || []).map((quelle, index) => {
        const leitung = { ...quelle, id: generateId('ltg'), position: index + 1, notiz: '' };
        if (!mitWerten) {
            leitung.anzahl = 1;
            leitung.laenge = 0;
            // Bei Meterware benennt die Artikelnummer den Typ, nicht die Länge – die bleibt.
            if (!METERWARE_KATEGORIEN.includes(leitung.kategorie) && leitung.artikelPrefix) {
                leitung.artikelnummer = '';
            }
            leitung.artikelCustom = '';
        }
        return leitung;
    });

    projekt.bauteile = (vorlage.bauteile || []).map(quelle => {
        const bauteil = { ...quelle, id: generateId('btl'), notiz: '' };
        if (!mitWerten) bauteil.anzahl = 1;
        return bauteil;
    });

    projekt.zusaetzlicheGruppen = (vorlage.zusaetzlicheGruppen || []).map(g => ({ ...g }));
    projekt.gruppenStatus = {};
    Object.entries(vorlage.gruppenStatus || {}).forEach(([code, status]) => {
        projekt.gruppenStatus[code] = {
            nichtBenoetigt: Boolean(status.nichtBenoetigt),
            notiz: '',
            ausgeblendeteBauteilTypen: [...(status.ausgeblendeteBauteilTypen || [])],
            ausgeblendeteLeitungPresets: [...(status.ausgeblendeteLeitungPresets || [])]
        };
    });
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

    const formular = {
        projektnummer: document.getElementById('projektnummer').value.trim(),
        name: document.getElementById('projektname').value.trim(),
        kunde: document.getElementById('kunde').value.trim(),
        liefertermin: document.getElementById('liefertermin').value,
        notiz: document.getElementById('projekt-notiz').value.trim(),
        cadLinks: collectCadLinksFromForm()
    };

    // Beim Bearbeiten nur die Formularfelder ersetzen, damit Zeiterfassung, Leitungswege,
    // Revision usw. erhalten bleiben.
    const projekt = existingIndex >= 0
        ? {
            ...projects[existingIndex],
            ...formular,
            visibility: projects[existingIndex].visibility || VISIBILITY_PUBLIC
        }
        : {
            id,
            ...formular,
            erstellt: new Date().toISOString(),
            leitungen: [],
            bauteile: [],
            wizardAnswers: {},
            gruppenStatus: {},
            zusaetzlicheGruppen: []
        };

    if (existingIndex >= 0) {
        projects[existingIndex] = projekt;
    } else {
        const vorlageId = document.getElementById('projekt-vorlage')?.value || '';
        const mitWerten = document.getElementById('projekt-vorlage-laengen')?.checked === true;
        if (vorlageId) applyProjektVorlage(projekt, vorlageId, mitWerten);

        ensureProjectAccessFields(projekt, true);
        projects.unshift(projekt);
    }
    
    saveProjects(projects, [projekt]);
    appState.currentProjekt = projekt;
    appState.currentLeitungIndex = 0;
    ensureWizardAnswers(appState.currentProjekt);

    if (isNew) {
        showView('gruppen');
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
        renderCadLinksForm(projekt.cadLinks || []);
        fillProjektVorlagen(false);

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
 * Schaltet die Sichtbarkeit zwischen „für alle sichtbar" und „privat" um.
 * @returns {void}
 */
export function toggleProjectVisibility() {
    const projekt = appState.currentProjekt;
    if (!projekt) return;

    if (!canManageSharing(projekt)) {
        showModal('Nur der Projekteigentümer kann die Sichtbarkeit ändern.', {
            type: 'warning',
            title: 'Keine Berechtigung'
        });
        updateVisibilityToggle();
        return;
    }

    const checkbox = document.getElementById('project-public-toggle');
    projekt.visibility = checkbox?.checked ? VISIBILITY_PUBLIC : VISIBILITY_PRIVATE;

    const projects = getProjects();
    const idx = projects.findIndex(p => p.id === projekt.id);
    if (idx >= 0) projects[idx] = projekt;

    saveProjects(projects);
    saveProjectToFirestore(projekt);
    updateVisibilityToggle();
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
    const toolbar = document.querySelector('#view-home .resource-toolbar');
    if (projects.length === 0) {
        liste.innerHTML = '';
        liste.style.display = 'none';
        empty.style.display = 'block';
        if (toolbar) toolbar.hidden = true;
        const countEl = document.getElementById('projekt-count');
        if (countEl) countEl.textContent = '';
        return;
    }

    if (toolbar) toolbar.hidden = false;
    liste.style.display = 'block';
    empty.style.display = 'none';
    liste.innerHTML = '';
    projects.forEach(p => {
        const fragment = cloneTemplate('project-card');
        const card = fragment.querySelector('.projekt-card');
        card.dataset.projektId = p.id;
        card.dataset.search = [
            p.projektnummer,
            p.name,
            p.kunde,
            p.ownerEmail,
            getProjectOwnerLabel(p)
        ].filter(Boolean).join(' ').toLowerCase();
        setText(fragment, '[data-field="nummer"]', p.projektnummer);
        setText(fragment, '[data-field="name"]', p.name);
        setText(fragment, '[data-field="leitungen-count"]', `${p.leitungen ? p.leitungen.length : 0} Leitungen`);

        const role = getProjectRole(p);
        const badgeEl = fragment.querySelector('[data-field="role-badge"]');
        if (badgeEl && role && appState.firebaseReady) {
            badgeEl.hidden = false;
            badgeEl.textContent = getRoleLabel(role);
            badgeEl.className = `projekt-role-badge role-${role}`;
        }

        const kundeEl = fragment.querySelector('[data-field="kunde"]');
        const ownerEl = fragment.querySelector('[data-field="owner"]');
        if (ownerEl && (p.ownerEmail || p.ownerId)) {
            ownerEl.hidden = false;
            ownerEl.textContent = `Ersteller: ${getProjectOwnerLabel(p)}`;
        }
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
        card.querySelector('[data-action="copy"]')
            ?.addEventListener('click', e => { e.stopPropagation(); copyProjekt(p.id); });
        deleteBtn?.addEventListener('click', e => { e.stopPropagation(); deleteProjekt(p.id); });
        liste.appendChild(fragment);
    });
    filterProjektListe();
}


/**
 * Filtert die Projektliste nach Suchbegriff.
 * @returns {void}
 */
export function filterProjektListe() {
    const input = document.getElementById('projekt-suche');
    const liste = document.getElementById('projekt-liste');
    const countEl = document.getElementById('projekt-count');
    if (!liste) return;

    const query = (input?.value || '').trim().toLowerCase();
    const cards = [...liste.querySelectorAll('.projekt-card')];
    let visible = 0;
    cards.forEach(card => {
        const haystack = card.dataset.search || '';
        const match = !query || haystack.includes(query);
        card.hidden = !match;
        if (match) visible += 1;
    });
    if (countEl) {
        countEl.textContent = cards.length
            ? `${visible} von ${cards.length}`
            : '';
    }
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
