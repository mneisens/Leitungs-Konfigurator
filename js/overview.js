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

const UEBERSICHT_SORT_KEY = 'leitungskonfigurator_uebersicht_sort';
let uebersichtLeitungenSortierung = 'typ';

/**
 * Liest die gespeicherte Sortieroption für die Leitungsübersicht.
 * @returns {'typ'|'gruppe'}
 */
function getUebersichtLeitungenSortierung() {
    try {
        const stored = localStorage.getItem(UEBERSICHT_SORT_KEY);
        return stored === 'gruppe' ? 'gruppe' : 'typ';
    } catch {
        return 'typ';
    }
}

uebersichtLeitungenSortierung = getUebersichtLeitungenSortierung();

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
    renderOverviewLists();

    const empty = document.getElementById('keine-leitungen');
    const hasLeitungen = appState.currentProjekt.leitungen && appState.currentProjekt.leitungen.length > 0;
    const hasBauteile = appState.currentProjekt.bauteile && appState.currentProjekt.bauteile.length > 0;
    if (empty) {
        empty.style.display = (!hasLeitungen && !hasBauteile) ? 'block' : 'none';
    }
}


/**
 * Aggregiert Bauteile für die Übersichtstabelle.
 * @param {object[]} bauteile
 * @returns {object[]}
 */
function buildAggregatedBauteile(bauteile) {
    const grouped = new Map();
    bauteile.forEach(b => {
        const key = `${b.gruppe || ''}|||${b.typ || ''}|||${b.artikelnummer || ''}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                gruppe: b.gruppe || '',
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
    return Array.from(grouped.values());
}


/**
 * @param {object} item
 * @returns {string}
 */
function renderBauteilTableRow(item, { hideGruppe = false } = {}) {
    const canEdit = canEditProject(appState.currentProjekt);
    return `
        <tr>
            ${hideGruppe ? '' : `<td>${escapeHtml(getGruppeSectionTitle(item.gruppe))}</td>`}
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
    `;
}


/**
 * @param {object[]} items
 * @returns {string}
 */
function renderBauteilTableBlock(items, { hideGruppe = false } = {}) {
    return `
        <div class="table-container${hideGruppe ? ' table-container--nested' : ''}">
            <table class="leitung-table">
                <thead>
                    <tr>
                        ${hideGruppe ? '' : '<th>Gruppe</th>'}
                        <th>Typ</th>
                        <th>Hersteller</th>
                        <th>Artikelnr.</th>
                        <th>Bezeichnung</th>
                        <th>Anzahl</th>
                        <th>Aktionen</th>
                    </tr>
                </thead>
                <tbody>${items.map(item => renderBauteilTableRow(item, { hideGruppe })).join('')}</tbody>
            </table>
        </div>
    `;
}


/**
 * @param {HTMLElement} container
 * @returns {void}
 */
function attachBauteilTableEvents(container) {
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
 * Rendert Leitungen und Bauteile je nach Sortiermodus.
 * @returns {void}
 */
function renderOverviewLists() {
    const kategorienContainer = document.getElementById('kategorien-container');
    const bauteileContainer = document.getElementById('bauteile-container');
    const empty = document.getElementById('keine-leitungen');
    if (!kategorienContainer || !bauteileContainer) return;

    const leitungen = appState.currentProjekt?.leitungen || [];
    const bauteile = appState.currentProjekt?.bauteile || [];
    const hasLeitungen = leitungen.length > 0;
    const hasBauteile = bauteile.length > 0;

    updateUebersichtSortToolbar();

    if (!hasLeitungen && !hasBauteile) {
        kategorienContainer.innerHTML = '';
        bauteileContainer.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    if (uebersichtLeitungenSortierung === 'gruppe') {
        const leitungenMitIndex = leitungen.map((l, idx) => ({ ...l, originalIndex: idx }));
        const bauteilItems = buildAggregatedBauteile(bauteile);
        const totalBauteilStueck = bauteile.reduce((s, b) => s + (b.anzahl || 1), 0);
        kategorienContainer.innerHTML = renderCombinedOverviewByGruppe(
            leitungenMitIndex,
            bauteilItems,
            totalBauteilStueck
        );
        bauteileContainer.innerHTML = '';
        attachBauteilTableEvents(kategorienContainer);
        return;
    }

    if (hasLeitungen) {
        const leitungenMitIndex = leitungen.map((l, idx) => ({ ...l, originalIndex: idx }));
        kategorienContainer.innerHTML = renderLeitungTableByTyp(leitungenMitIndex);
    } else {
        kategorienContainer.innerHTML = '';
    }

    if (hasBauteile) {
        const items = buildAggregatedBauteile(bauteile);
        const totalStueck = bauteile.reduce((s, b) => s + (b.anzahl || 1), 0);
        bauteileContainer.innerHTML = renderBauteileOverviewByTyp(items, totalStueck);
        attachBauteilTableEvents(bauteileContainer);
    } else {
        bauteileContainer.innerHTML = '';
    }
}


/**
 * renderBauteileTable.
 * @returns {void}
 */
export function renderBauteileTable() {
    renderOverviewLists();
}


/**
 * @param {object[]} items
 * @param {number} totalStueck
 * @returns {string}
 */
function renderBauteileOverviewByTyp(items, totalStueck) {
    const byTyp = new Map();
    items.forEach(item => {
        const typ = item.typ || '';
        if (!byTyp.has(typ)) byTyp.set(typ, []);
        byTyp.get(typ).push(item);
    });

    const typen = Array.from(byTyp.keys()).sort((a, b) =>
        getBauteilTypName(a).localeCompare(getBauteilTypName(b), 'de')
    );

    const zusammenfassungItems = typen.map(typ => `
        <div class="zusammenfassung-item">
            <span class="icon">⚙️</span>
            <span>${escapeHtml(getBauteilTypName(typ) || 'Ohne Typ')}:</span>
            <span class="count">${byTyp.get(typ).reduce((s, i) => s + i.count, 0)}</span>
        </div>
    `).join('');

    let html = `
        <div class="kategorie-zusammenfassung">
            ${zusammenfassungItems}
            <div class="zusammenfassung-item">
                <span class="icon">📋</span>
                <span>Bauteile gesamt:</span>
                <span class="count">${totalStueck}</span>
            </div>
        </div>
    `;

    typen.forEach(typ => {
        const rows = byTyp.get(typ).sort((a, b) =>
            compareGruppenCode(a.gruppe, b.gruppe)
            || a.artikelnummer.localeCompare(b.artikelnummer, 'de', { numeric: true })
        );
        const stueck = rows.reduce((s, i) => s + i.count, 0);

        html += `
            <div class="kategorie-section">
                <div class="kategorie-header sonstiges">
                    <span class="kategorie-icon">⚙️</span>
                    <span>${escapeHtml(getBauteilTypName(typ) || 'Ohne Typ')}</span>
                    <span class="kategorie-count">${stueck} Stück</span>
                </div>
                ${renderBauteilTableBlock(rows)}
            </div>
        `;
    });

    return html;
}


/**
 * @param {object[]} leitungenMitIndex
 * @param {object[]} bauteilItems
 * @param {number} totalBauteilStueck
 * @returns {string}
 */
function renderCombinedOverviewByGruppe(leitungenMitIndex, bauteilItems, totalBauteilStueck) {
    const leitungenByGruppe = new Map();
    leitungenMitIndex.forEach(l => {
        const code = l.gruppe || '';
        if (!leitungenByGruppe.has(code)) leitungenByGruppe.set(code, []);
        leitungenByGruppe.get(code).push(l);
    });

    const bauteileByGruppe = new Map();
    bauteilItems.forEach(item => {
        const code = item.gruppe || '';
        if (!bauteileByGruppe.has(code)) bauteileByGruppe.set(code, []);
        bauteileByGruppe.get(code).push(item);
    });

    const allCodes = new Set([
        ...leitungenByGruppe.keys(),
        ...bauteileByGruppe.keys()
    ]);
    const gruppenCodes = Array.from(allCodes).sort(compareGruppenCode);

    const formatLeitungenCount = count =>
        `${count} Leitung${count !== 1 ? 'en' : ''}`;
    const formatBauteileCount = count =>
        `${count} Bauteil${count !== 1 ? 'e' : ''}`;

    const zusammenfassungItems = gruppenCodes.map(code => {
        const leitCount = (leitungenByGruppe.get(code) || []).length;
        const bauteilCount = (bauteileByGruppe.get(code) || []).reduce((s, i) => s + i.count, 0);
        const parts = [];
        if (leitCount) parts.push(formatLeitungenCount(leitCount));
        if (bauteilCount) parts.push(formatBauteileCount(bauteilCount));
        return `
        <div class="zusammenfassung-item">
            <span class="icon">🧩</span>
            <span>${escapeHtml(getGruppeSectionTitle(code))}:</span>
            <span class="count">${parts.join(' · ')}</span>
        </div>
    `;
    }).join('');

    const gesamtParts = [];
    if (leitungenMitIndex.length) gesamtParts.push(formatLeitungenCount(leitungenMitIndex.length));
    if (totalBauteilStueck) gesamtParts.push(formatBauteileCount(totalBauteilStueck));

    let html = `
        <div class="kategorie-zusammenfassung">
            ${zusammenfassungItems}
            <div class="zusammenfassung-item">
                <span class="icon">📋</span>
                <span>Gesamt:</span>
                <span class="count">${gesamtParts.join(' · ')}</span>
            </div>
        </div>
    `;

    gruppenCodes.forEach(code => {
        const leitungen = leitungenByGruppe.get(code) || [];
        const bauteile = (bauteileByGruppe.get(code) || []).sort((a, b) =>
            getBauteilTypName(a.typ).localeCompare(getBauteilTypName(b.typ), 'de')
            || a.artikelnummer.localeCompare(b.artikelnummer, 'de', { numeric: true })
        );
        const bauteilStueck = bauteile.reduce((s, i) => s + i.count, 0);

        const headerParts = [];
        if (leitungen.length) headerParts.push(formatLeitungenCount(leitungen.length));
        if (bauteilStueck) headerParts.push(formatBauteileCount(bauteilStueck));

        let sectionContent = '';
        if (leitungen.length) {
            sectionContent += `
                <h4 class="uebersicht-gruppe-subtitle">Leitungen</h4>
                ${renderLeitungTableBlock(leitungen, { hideGruppe: true })}
            `;
        }
        if (bauteile.length) {
            sectionContent += `
                <h4 class="uebersicht-gruppe-subtitle${leitungen.length ? ' uebersicht-gruppe-subtitle--spaced' : ''}">Bauteile</h4>
                ${renderBauteilTableBlock(bauteile, { hideGruppe: true })}
            `;
        }

        html += `
            <div class="kategorie-section">
                <div class="kategorie-header gruppe">
                    <span class="kategorie-icon">🧩</span>
                    <span>${escapeHtml(getGruppeSectionTitle(code))}</span>
                    <span class="kategorie-count">${headerParts.join(' · ')}</span>
                </div>
                ${sectionContent}
            </div>
        `;
    });

    return html;
}


/**
 * @returns {object[]}
 */
function getKategorienDef() {
    return appState.katalog?.kategorien || [
        { id: 'ethercat', name: 'EtherCAT Leitung', icon: '🔗' },
        { id: 'power', name: 'Power Leitung', icon: '⚡' },
        { id: 'sensor', name: 'Sensorleitung', icon: '📡' },
        { id: 'oelflex', name: 'Ölflexleitung', icon: '🔌' },
        { id: 'motor', name: 'Motorleitungen', icon: '⚙️' },
        { id: 'geber', name: 'Geberleitung', icon: '🎛️' },
        { id: 'cplink', name: 'CP-Link Leitung', icon: '🖥️' },
        { id: 'sonstiges', name: 'Sonstiges', icon: '📦' }
    ];
}


/**
 * @param {object} l
 * @returns {string}
 */
function renderLeitungTableRow(l, { hideGruppe = false } = {}) {
    const canEdit = canEditProject(appState.currentProjekt);
    return `
        <tr onclick="editLeitung(${l.originalIndex})" title="${canEdit ? 'Leitung bearbeiten' : 'Leitung ansehen'}">
            <td>${l.position || l.originalIndex + 1}</td>
            <td>${escapeHtml(l.bezeichnung || '-')}</td>
            ${hideGruppe ? '' : `<td>${escapeHtml(getGruppeDisplay(l.gruppe))}</td>`}
            <td>${escapeHtml(l.hersteller || '-')}</td>
            <td>${escapeHtml(l.artikelnummer || l.artikelCustom || '-')}</td>
            <td>${l.laenge ? l.laenge + ' m' : '-'}</td>
            <td>${escapeHtml(l.steckerA || '-')}</td>
            <td>${escapeHtml(l.steckerB || '-')}</td>
            <td>${l.anzahl || 1}</td>
            <td class="table-actions">
                <button class="btn btn-secondary btn-small btn-icon" onclick="event.stopPropagation(); editLeitung(${l.originalIndex})" title="${canEdit ? 'Bearbeiten' : 'Ansehen'}">
                    ${canEdit ? '✏️' : '👁️'}
                </button>
                ${canEdit ? `
                <button class="btn btn-danger btn-small btn-icon" onclick="event.stopPropagation(); deleteLeitung(${l.originalIndex})" title="Löschen">
                    🗑️
                </button>` : ''}
            </td>
        </tr>
    `;
}


/**
 * @param {object[]} leitungen
 * @returns {string}
 */
function renderLeitungTableBlock(leitungen, { hideGruppe = false } = {}) {
    return `
        <div class="table-container${hideGruppe ? ' table-container--nested' : ''}">
            <table class="leitung-table">
                <thead>
                    <tr>
                        <th>Pos.</th>
                        <th>Bezeichnung</th>
                        ${hideGruppe ? '' : '<th>Gruppe</th>'}
                        <th>Hersteller</th>
                        <th>Artikelnr.</th>
                        <th>Länge</th>
                        <th>Stecker A</th>
                        <th>Stecker B</th>
                        <th>Anzahl</th>
                        <th>Aktionen</th>
                    </tr>
                </thead>
                <tbody>
                    ${leitungen.map(l => renderLeitungTableRow(l, { hideGruppe })).join('')}
                </tbody>
            </table>
        </div>
    `;
}


/**
 * Aktualisiert die Sortier-Umschaltung über der Leitungsliste.
 * @returns {void}
 */
function updateUebersichtSortToolbar() {
    const toolbar = document.getElementById('uebersicht-leitungen-toolbar');
    const btnTyp = document.getElementById('uebersicht-sort-typ');
    const btnGruppe = document.getElementById('uebersicht-sort-gruppe');
    if (!toolbar || !btnTyp || !btnGruppe) return;

    const hasLeitungen = (appState.currentProjekt?.leitungen || []).length > 0;
    const hasBauteile = (appState.currentProjekt?.bauteile || []).length > 0;
    toolbar.hidden = !hasLeitungen && !hasBauteile;

    const isGruppe = uebersichtLeitungenSortierung === 'gruppe';
    btnTyp.classList.toggle('active', !isGruppe);
    btnGruppe.classList.toggle('active', isGruppe);
    btnTyp.setAttribute('aria-pressed', String(!isGruppe));
    btnGruppe.setAttribute('aria-pressed', String(isGruppe));
}


/**
 * Schaltet die Sortierung der Leitungsübersicht um.
 * @param {'typ'|'gruppe'} modus
 * @returns {void}
 */
export function setUebersichtLeitungenSortierung(modus) {
    uebersichtLeitungenSortierung = modus === 'gruppe' ? 'gruppe' : 'typ';
    try {
        localStorage.setItem(UEBERSICHT_SORT_KEY, uebersichtLeitungenSortierung);
    } catch {
        // localStorage nicht verfügbar
    }
    renderOverviewLists();
}


/**
 * renderLeitungTable.
 * @returns {void}
 */
export function renderLeitungTable() {
    renderOverviewLists();
}


/**
 * @param {object[]} leitungenMitIndex
 * @returns {string}
 */
function renderLeitungTableByTyp(leitungenMitIndex) {
    const kategorienDef = getKategorienDef();
    const grouped = {};
    kategorienDef.forEach(k => {
        grouped[k.id] = [];
    });

    leitungenMitIndex.forEach(l => {
        const kat = l.kategorie || 'sonstiges';
        if (!grouped[kat]) grouped[kat] = [];
        grouped[kat].push(l);
    });

    const zusammenfassungItems = kategorienDef
        .filter(k => grouped[k.id]?.length)
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
                <span class="count">${leitungenMitIndex.length}</span>
            </div>
        </div>
    `;

    kategorienDef.forEach(kat => {
        const leitungen = grouped[kat.id];
        if (!leitungen?.length) return;

        html += `
            <div class="kategorie-section">
                <div class="kategorie-header ${kat.id}">
                    <span class="kategorie-icon">${kat.icon}</span>
                    <span>${kat.name}</span>
                    <span class="kategorie-count">${leitungen.length} Leitung${leitungen.length !== 1 ? 'en' : ''}</span>
                </div>
                ${renderLeitungTableBlock(leitungen)}
            </div>
        `;
    });

    return html;
}


/**
 * @param {string} code
 * @returns {string}
 */
function getGruppeSectionTitle(code) {
    if (!code) return 'Ohne Gruppe';
    const label = getGruppeDisplay(code);
    return label === '-' ? code : label;
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
    
    renderOverviewLists();
}


/**
 * Normalisiert einen Gruppencode auf das Format „=050“.
 * @param {string} code
 * @returns {string}
 */
export function normalizeGruppenCode(code) {
    const raw = String(code || '').trim();
    if (!raw) return '';
    const nummer = raw.replace(/^=/, '').trim();
    if (/^\d+$/.test(nummer)) return `=${nummer}`;
    return raw.startsWith('=') ? raw : `=${raw}`;
}


/**
 * @param {string} gruppeCode
 * @param {object|null} [projekt]
 * @returns {object|null}
 */
export function getGruppeByCode(gruppeCode, projekt = appState.currentProjekt) {
    if (!gruppeCode) return null;
    const basis = (appState.leitungGruppen || []).find(g => g.code === gruppeCode);
    if (basis) return basis;
    return (projekt?.zusaetzlicheGruppen || []).find(g => g.code === gruppeCode) || null;
}


/**
 * Standard- und projektspezifische Gruppen, sortiert nach Code.
 * @param {object|null} [projekt]
 * @returns {object[]}
 */
export function getAlleGruppenFuerProjekt(projekt = appState.currentProjekt) {
    const byCode = new Map();
    (appState.leitungGruppen || []).forEach(gruppe => {
        byCode.set(gruppe.code, { ...gruppe, custom: false });
    });
    (projekt?.zusaetzlicheGruppen || []).forEach(gruppe => {
        if (!byCode.has(gruppe.code)) {
            byCode.set(gruppe.code, { ...gruppe, custom: true });
        }
    });
    return Array.from(byCode.values()).sort((a, b) => compareGruppenCode(a.code, b.code));
}


/**
 * getGruppeDisplay.
 * @returns {void}
 */
export function getGruppeDisplay(gruppeCode) {
    if (!gruppeCode) return '-';
    const gruppe = getGruppeByCode(gruppeCode);
    return gruppe ? (gruppe.label || `${gruppe.code} ${gruppe.bezeichnung || ''}`.trim()) : gruppeCode;
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
