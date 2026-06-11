/**
 * @file Zugriffsrechte und Projekt-Freigaben.
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import { showModal } from './modal.js';
import { loadRegisteredUsers } from './firebase.js';
import { showView } from './navigation.js';

export const ROLE_OWNER = 'owner';
export const ROLE_EDIT = 'edit';
export const ROLE_VIEW = 'view';

const ROLE_LABELS = {
    [ROLE_OWNER]: 'Eigentümer',
    [ROLE_EDIT]: 'Bearbeiten',
    [ROLE_VIEW]: 'Nur ansehen'
};


/**
 * @param {object|null} projekt
 * @returns {string|null}
 */
export function getProjectRole(projekt) {
    if (!projekt) return null;
    if (!appState.currentUser) return ROLE_OWNER;

    const uid = appState.currentUser.uid;
    if (projekt.ownerId === uid) return ROLE_OWNER;

    const member = projekt.members?.[uid];
    return member?.role || null;
}


/**
 * @param {object|null} projekt
 * @returns {boolean}
 */
export function canEditProject(projekt) {
    const role = getProjectRole(projekt);
    return role === ROLE_OWNER || role === ROLE_EDIT;
}


/**
 * @param {object|null} projekt
 * @returns {boolean}
 */
export function canManageSharing(projekt) {
    return getProjectRole(projekt) === ROLE_OWNER;
}


/**
 * @param {object|null} projekt
 * @returns {boolean}
 */
export function canDeleteProject(projekt) {
    return getProjectRole(projekt) === ROLE_OWNER;
}


/**
 * @param {string} [action]
 * @returns {boolean}
 */
export function assertCanEdit(action = 'diese Änderung') {
    if (!appState.currentProjekt) return false;
    if (canEditProject(appState.currentProjekt)) return true;

    showModal(
        `Sie haben nur Lesezugriff und können ${action} nicht vornehmen.\n\nBitte den Projekteigentümer um Bearbeitungsrechte bitten.`,
        { type: 'warning', title: 'Nur Lesezugriff' }
    );
    return false;
}


/**
 * @param {object} projekt
 * @param {boolean} [isNew]
 * @returns {object}
 */
export function ensureProjectAccessFields(projekt, isNew = false) {
    if (!projekt || !appState.currentUser) return projekt;

    const uid = appState.currentUser.uid;
    const email = (appState.currentUser.email || '').toLowerCase();

    if (isNew || !projekt.ownerId) {
        projekt.ownerId = uid;
        projekt.ownerEmail = email;
        projekt.members = {
            [uid]: { email, role: ROLE_OWNER }
        };
        projekt.memberIds = [uid];
    } else if (!projekt.members || !projekt.memberIds) {
        projekt.members = projekt.members || {
            [uid]: { email, role: ROLE_OWNER }
        };
        projekt.memberIds = projekt.memberIds || Object.keys(projekt.members);
        if (!projekt.members[uid]) {
            projekt.members[uid] = { email, role: ROLE_OWNER };
        }
        if (!projekt.memberIds.includes(uid)) {
            projekt.memberIds.push(uid);
        }
    }

    return projekt;
}


/**
 * @param {object} projekt
 * @returns {object}
 */
export function projectToFirestore(projekt) {
    return {
        id: projekt.id,
        projektnummer: projekt.projektnummer,
        name: projekt.name,
        kunde: projekt.kunde || '',
        liefertermin: projekt.liefertermin || '',
        notiz: projekt.notiz || '',
        erstellt: projekt.erstellt || new Date().toISOString(),
        leitungen: projekt.leitungen || [],
        bauteile: projekt.bauteile || [],
        wizardAnswers: projekt.wizardAnswers || {},
        wizardSkipped: projekt.wizardSkipped || {},
        ownerId: projekt.ownerId || null,
        ownerEmail: projekt.ownerEmail || '',
        members: projekt.members || {},
        memberIds: projekt.memberIds || [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
}


/**
 * @param {object} data
 * @returns {object}
 */
export function projectFromFirestore(data) {
    if (!data) return null;
    return {
        id: data.id,
        projektnummer: data.projektnummer,
        name: data.name,
        kunde: data.kunde || '',
        liefertermin: data.liefertermin || '',
        notiz: data.notiz || '',
        erstellt: data.erstellt,
        leitungen: data.leitungen || [],
        bauteile: data.bauteile || [],
        wizardAnswers: data.wizardAnswers || {},
        wizardSkipped: data.wizardSkipped || {},
        ownerId: data.ownerId || null,
        ownerEmail: data.ownerEmail || '',
        members: data.members || {},
        memberIds: data.memberIds || []
    };
}


/**
 * @param {string} role
 * @returns {string}
 */
export function getRoleLabel(role) {
    return ROLE_LABELS[role] || role;
}


/**
 * Füllt das Nutzer-Dropdown für Freigaben.
 * @returns {Promise<void>}
 */
export async function populateShareUserDropdown() {
    const select = document.getElementById('share-user');
    const projekt = appState.currentProjekt;
    if (!select || !projekt || !appState.firebaseReady) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Nutzer wählen --</option>';

    try {
        const users = await loadRegisteredUsers();
        const excluded = new Set([
            appState.currentUser?.uid,
            projekt.ownerId,
            ...Object.keys(projekt.members || {})
        ]);

        const available = users.filter(u => !excluded.has(u.uid));

        if (available.length === 0) {
            select.innerHTML = '<option value="">Keine weiteren Nutzer verfügbar</option>';
            select.disabled = true;
            return;
        }

        select.disabled = false;
        available.forEach(user => {
            const option = document.createElement('option');
            option.value = user.uid;
            option.textContent = user.email;
            option.dataset.email = user.email;
            select.appendChild(option);
        });

        if (currentValue && available.some(u => u.uid === currentValue)) {
            select.value = currentValue;
        }
    } catch (error) {
        console.error('Fehler beim Laden der Nutzerliste:', error);
        select.innerHTML = '<option value="">Nutzerliste konnte nicht geladen werden</option>';
        select.disabled = true;
    }
}


/**
 * Aktualisiert den Lesezugriff-Hinweis in der Projektübersicht.
 * @returns {void}
 */
export function updateReadOnlyBanner() {
    const banner = document.getElementById('projekt-readonly-banner');
    const projekt = appState.currentProjekt;
    if (!banner || !projekt) return;

    const canEdit = canEditProject(projekt);
    banner.hidden = canEdit || !appState.firebaseReady;
}


/**
 * Steuert Sichtbarkeit des Freigaben-Buttons in der Übersicht.
 * @returns {void}
 */
export function updateSharingButton() {
    const btn = document.getElementById('btn-projekt-freigabe');
    const projekt = appState.currentProjekt;
    if (!btn) return;

    const show = appState.firebaseReady
        && appState.currentUser
        && projekt
        && canManageSharing(projekt);

    btn.hidden = !show;
}


/**
 * Rendert die Freigaben-Seite.
 * @returns {void}
 */
export function renderProjectSharingView() {
    const list = document.getElementById('share-members-list');
    const titel = document.getElementById('freigabe-titel');
    const projekt = appState.currentProjekt;

    if (!projekt) {
        showView('home');
        return;
    }

    if (!canManageSharing(projekt)) {
        showView('uebersicht');
        return;
    }

    if (!list) return;

    if (titel) {
        titel.textContent = `Freigaben – ${projekt.projektnummer} – ${projekt.name}`;
    }

    populateShareUserDropdown();

    const members = Object.entries(projekt.members || {})
        .filter(([uid]) => uid !== projekt.ownerId)
        .map(([uid, member]) => ({ uid, ...member }));

    if (members.length === 0) {
        list.innerHTML = '<p class="text-muted">Noch keine Freigaben vergeben.</p>';
        return;
    }

    list.innerHTML = `
        <h4>Freigegeben für</h4>
        <ul class="share-members-list">
            ${members.map(m => `
                <li>
                    <span class="share-email">${escapeHtml(m.email || m.uid)}</span>
                    <span class="share-role-badge">${escapeHtml(getRoleLabel(m.role))}</span>
                    <button type="button" class="btn btn-danger btn-small"
                        onclick="removeProjectShare('${escapeHtml(m.uid)}')">Entfernen</button>
                </li>
            `).join('')}
        </ul>
    `;
}


/**
 * Blendet Bearbeiten-Aktionen aus, wenn nur Lesezugriff.
 * @returns {void}
 */
export function applyReadOnlyUI() {
    const canEdit = appState.currentProjekt ? canEditProject(appState.currentProjekt) : true;
    const selector = [
        '.uebersicht-actions button:not([data-allow-readonly])',
        '#view-konfigurator .btn-success',
        '#view-konfigurator .btn-danger',
        '#view-projekt-wizard .btn-success',
        '#view-projekt-wizard .btn-primary:not(.wizard-progress-btn)'
    ].join(',');

    document.querySelectorAll(selector).forEach(el => {
        el.style.display = canEdit ? '' : 'none';
    });

    const uebersichtActions = document.querySelector('.uebersicht-actions');
    if (uebersichtActions) {
        uebersichtActions.querySelectorAll('[data-allow-readonly]').forEach(el => {
            el.style.display = '';
        });
    }
}
