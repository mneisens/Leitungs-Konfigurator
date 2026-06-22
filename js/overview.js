/**
 * @file overview.js
 */
import { appState } from './state.js';
import { escapeHtml, formatDate } from './utils.js';
import { showModal } from './modal.js';
import { showView } from './navigation.js';
import { getBauteilTypName } from './catalog.js';
import { getProjects, saveProjects, persistCurrentProjekt } from './projects.js';
import { openBauteilEdit } from './bauteil-edit.js';
import {
    canEditProject,
    getProjectRole,
    getRoleLabel,
    getProjectOwnerLabel,
    updateReadOnlyBanner,
    updateSharingButton,
    applyReadOnlyUI
} from './project-access.js';

/**
 * renderUebersicht.
 * @returns {void}
 */
export function renderUebersicht() {
    if (!appState.currentProjekt) {
        showView('home');
        return;
    }
    
    document.getElementById('uebersicht-titel').textContent = 
        `${appState.currentProjekt.projektnummer} - ${appState.currentProjekt.name}`;
    
    const infoDiv = document.getElementById('uebersicht-projekt-info');
    infoDiv.innerHTML = `
        <div class="info-item">
            <span class="info-label">Projektnummer</span>
            <span class="info-value">${escapeHtml(appState.currentProjekt.projektnummer)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Projektname</span>
            <span class="info-value">${escapeHtml(appState.currentProjekt.name)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Ersteller</span>
            <span class="info-value">${escapeHtml(getProjectOwnerLabel(appState.currentProjekt))}</span>
        </div>
        ${appState.currentProjekt.kunde ? `
        <div class="info-item">
            <span class="info-label">Kunde</span>
            <span class="info-value">${escapeHtml(appState.currentProjekt.kunde)}</span>
        </div>` : ''}
        ${appState.currentProjekt.liefertermin ? `
        <div class="info-item">
            <span class="info-label">Liefertermin</span>
            <span class="info-value">${formatDate(appState.currentProjekt.liefertermin)}</span>
        </div>` : ''}
        <div class="info-item">
            <span class="info-label">Anzahl Leitungen</span>
            <span class="info-value">${appState.currentProjekt.leitungen ? appState.currentProjekt.leitungen.length : 0}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Anzahl Bauteile</span>
            <span class="info-value">${(appState.currentProjekt.bauteile || []).reduce((sum, b) => sum + (b.anzahl || 1), 0)}</span>
        </div>
        ${getProjectRole(appState.currentProjekt) ? `
        <div class="info-item">
            <span class="info-label">Ihre Berechtigung</span>
            <span class="info-value">${escapeHtml(getRoleLabel(getProjectRole(appState.currentProjekt)))}</span>
        </div>` : ''}
    `;

    updateReadOnlyBanner();
    updateSharingButton();
    applyReadOnlyUI();
    renderLeitungTable();
    renderBauteileTable();

    const empty = document.getElementById('keine-leitungen');
    const hasLeitungen = appState.currentProjekt.leitungen && appState.currentProjekt.leitungen.length > 0;
    const hasBauteile = appState.currentProjekt.bauteile && appState.currentProjekt.bauteile.length > 0;
    if (empty) {
        empty.style.display = (!hasLeitungen && !hasBauteile) ? 'block' : 'none';
    }
}


/**
 * renderBauteileTable.
 * @returns {void}
 */
export function renderBauteileTable() {
    const container = document.getElementById('bauteile-container');
    if (!container) return;

    const bauteile = appState.currentProjekt.bauteile || [];
    if (bauteile.length === 0) {
        container.innerHTML = '';
        return;
    }

    const grouped = new Map();
    bauteile.forEach(b => {
        const key = `${b.gruppe || ''}|||${b.typ || ''}|||${b.artikelnummer || ''}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                gruppe: b.gruppe || '-',
                typ: b.typ,
                hersteller: b.hersteller || '-',
                artikelnummer: b.artikelnummer || '-',
                bezeichnung: b.bezeichnung || '-',
                count: 0,
                ids: []
            });
        }
        const g = grouped.get(key);
        g.count += b.anzahl || 1;
        if (b.id) g.ids.push(b.id);
    });

    const canEdit = canEditProject(appState.currentProjekt);
    const rows = Array.from(grouped.values())
        .sort((a, b) => a.gruppe.localeCompare(b.gruppe, 'de') || a.artikelnummer.localeCompare(b.artikelnummer, 'de'))
        .map(item => `
            <tr>
                <td>${escapeHtml(getGruppeDisplay(item.gruppe))}</td>
                <td>${escapeHtml(getBauteilTypName(item.typ))}</td>
                <td>${escapeHtml(item.hersteller)}</td>
                <td>${escapeHtml(item.artikelnummer)}</td>
                <td>${escapeHtml(item.bezeichnung)}</td>
                <td>${item.count}</td>
                <td class="table-actions">
                    ${canEdit ? `
                    <button type="button" class="btn btn-secondary btn-small btn-icon" data-action="edit-bauteil" data-bauteil-id="${escapeHtml(item.ids[0] || '')}" title="Bearbeiten">
                        ✏️
                    </button>
                    <button type="button" class="btn btn-danger btn-small btn-icon" data-action="delete-bauteil" data-bauteil-id="${escapeHtml(item.ids[0] || '')}" title="Eine entfernen">
                        🗑️
                    </button>` : ''}
                </td>
            </tr>
        `).join('');

    container.innerHTML = `
        <div class="kategorie-section">
            <div class="kategorie-header sonstiges">
                <span class="kategorie-icon">⚙️</span>
                <span>Bauteile</span>
                <span class="kategorie-count">${bauteile.reduce((s, b) => s + (b.anzahl || 1), 0)} Stück</span>
            </div>
            <div class="table-container">
                <table class="leitung-table">
                    <thead>
                        <tr>
                            <th>Gruppe</th>
                            <th>Typ</th>
                            <th>Hersteller</th>
                            <th>Artikelnr.</th>
                            <th>Bezeichnung</th>
                            <th>Anzahl</th>
                            <th>Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;

    container.querySelectorAll('[data-action="edit-bauteil"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            openBauteilEdit(btn.getAttribute('data-bauteil-id'), () => renderUebersicht());
        });
    });

    container.querySelectorAll('[data-action="delete-bauteil"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            deleteBauteil(btn.getAttribute('data-bauteil-id'));
        });
    });
}


/**
 * renderLeitungTable.
 * @returns {void}
 */
export function renderLeitungTable() {
    const container = document.getElementById('kategorien-container');
    const empty = document.getElementById('keine-leitungen');
    
    if (!appState.currentProjekt.leitungen || appState.currentProjekt.leitungen.length === 0) {
        container.innerHTML = '';
        if (!appState.currentProjekt.bauteile || appState.currentProjekt.bauteile.length === 0) {
            empty.style.display = 'block';
        } else {
            empty.style.display = 'none';
        }
        return;
    }
    
    empty.style.display = 'none';
    
    const kategorienDef = appState.katalog && appState.katalog.kategorien ? appState.katalog.kategorien : [
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
    
    appState.currentProjekt.leitungen.forEach((l, idx) => {
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
                <span class="count">${appState.currentProjekt.leitungen.length}</span>
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
                                <tr onclick="editLeitung(${l.originalIndex})" title="${canEditProject(appState.currentProjekt) ? 'Leitung bearbeiten' : 'Leitung ansehen'}">
                                    <td>${l.position || l.originalIndex + 1}</td>
                                    <td>${escapeHtml(l.bezeichnung || '-')}</td>
                                    <td>${escapeHtml(getGruppeDisplay(l.gruppe))}</td>
                                    <td>${escapeHtml(l.hersteller || '-')}</td>
                                    <td>${escapeHtml(l.artikelnummer || l.artikelCustom || '-')}</td>
                                    <td>${l.laenge ? l.laenge + ' m' : '-'}</td>
                                    <td>${escapeHtml(l.steckerA || '-')}</td>
                                    <td>${escapeHtml(l.steckerB || '-')}</td>
                                    <td class="table-actions">
                                        <button class="btn btn-secondary btn-small btn-icon" onclick="event.stopPropagation(); editLeitung(${l.originalIndex})" title="${canEditProject(appState.currentProjekt) ? 'Bearbeiten' : 'Ansehen'}">
                                            ${canEditProject(appState.currentProjekt) ? '✏️' : '👁️'}
                                        </button>
                                        ${canEditProject(appState.currentProjekt) ? `
                                        <button class="btn btn-danger btn-small btn-icon" onclick="event.stopPropagation(); deleteLeitung(${l.originalIndex})" title="Löschen">
                                            🗑️
                                        </button>` : ''}
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


/**
 * Entfernt ein Bauteil (oder verringert die Anzahl um 1).
 * @param {string} bauteilId
 * @returns {void}
 */
export function deleteBauteil(bauteilId) {
    if (!appState.currentProjekt || !bauteilId) return;
    if (!canEditProject(appState.currentProjekt)) {
        showModal('Sie haben nur Lesezugriff auf dieses Projekt.', { type: 'warning', title: 'Keine Berechtigung' });
        return;
    }

    const bauteile = appState.currentProjekt.bauteile || [];
    const idx = bauteile.findIndex(b => b.id === bauteilId);
    if (idx < 0) return;

    const bauteil = bauteile[idx];
    if ((bauteil.anzahl || 1) > 1) {
        bauteil.anzahl -= 1;
    } else {
        appState.currentProjekt.bauteile = bauteile.filter(b => b.id !== bauteilId);
    }

    persistCurrentProjekt();
    renderUebersicht();
}


/**
 * editLeitung.
 * @returns {void}
 */
export function editLeitung(index) {
    appState.currentLeitungIndex = index;
    showView('konfigurator');
}


/**
 * deleteLeitung.
 * @returns {void}
 */
export async function deleteLeitung(index) {
    if (!canEditProject(appState.currentProjekt)) {
        showModal('Sie haben nur Lesezugriff auf dieses Projekt.', { type: 'warning', title: 'Keine Berechtigung' });
        return;
    }

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
    
    appState.currentProjekt.leitungen.splice(index, 1);
    
    appState.currentProjekt.leitungen.forEach((l, i) => {
        l.position = i + 1;
    });
    
    const projects = getProjects();
    const idx = projects.findIndex(p => p.id === appState.currentProjekt.id);
    if (idx >= 0) {
        projects[idx] = appState.currentProjekt;
        saveProjects(projects);
    }
    
    renderLeitungTable();
}


/**
 * getGruppeDisplay.
 * @returns {void}
 */
export function getGruppeDisplay(gruppeCode) {
    if (!gruppeCode) return '-';
    const gruppe = appState.leitungGruppen.find(g => g.code === gruppeCode);
    return gruppe ? (gruppe.label || gruppe.code) : gruppeCode;
}


/**
 * compareGruppenCode.
 * @returns {void}
 */
export function compareGruppenCode(a, b) {
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
