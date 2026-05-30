/**
 * @file abarbeitung.js
 */
import { appState } from './state.js';
import { generateId, escapeHtml, formatDate, formatDateForFile } from './utils.js';
import { showModal, closeModal } from './modal.js';
import { showView } from './navigation.js';
import { cloneTemplate, setText } from './templates.js';

/**
 * buildAbarbeitungOrder.
 * @returns {void}
 */
export function buildAbarbeitungOrder() {
    if (!appState.currentProjekt || !Array.isArray(appState.currentProjekt.leitungen)) return [];

    return appState.currentProjekt.leitungen
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


/**
 * startAbarbeitung.
 * @returns {void}
 */
export function startAbarbeitung() {
    if (!appState.currentProjekt) return;
    appState.abarbeitungOrder = buildAbarbeitungOrder();
    const firstOpenIndex = appState.abarbeitungOrder.findIndex(entry => !appState.currentProjekt.leitungen[entry.index]?.erledigt);
    appState.abarbeitungCursor = firstOpenIndex >= 0 ? firstOpenIndex : 0;
    showView('abarbeitung');
}


/**
 * renderAbarbeitung.
 * @returns {void}
 */
export function renderAbarbeitung() {
    if (!appState.currentProjekt) {
        showView('home');
        return;
    }

    appState.abarbeitungOrder = buildAbarbeitungOrder();
    if (appState.abarbeitungCursor >= appState.abarbeitungOrder.length) {
        appState.abarbeitungCursor = Math.max(appState.abarbeitungOrder.length - 1, 0);
    }

    document.getElementById('abarbeitung-titel').textContent =
        `Abarbeitung - ${appState.currentProjekt.projektnummer} - ${appState.currentProjekt.name}`;

    const progressEl = document.getElementById('abarbeitung-progress');
    const emptyEl = document.getElementById('abarbeitung-empty');
    const cardEl = document.getElementById('abarbeitung-card');
    const nextListEl = document.getElementById('abarbeitung-next-list');
    const prevBtn = document.getElementById('abarbeitung-prev');
    const nextBtn = document.getElementById('abarbeitung-next');
    const toggleBtn = document.getElementById('abarbeitung-toggle');

    if (appState.abarbeitungOrder.length === 0) {
        progressEl.textContent = 'Schritt 0 von 0';
        emptyEl.style.display = 'block';
        cardEl.style.display = 'none';
        nextListEl.innerHTML = '<p class="konfig-list-empty">Noch keine Leitungen vorhanden.</p>';
        return;
    }

    emptyEl.style.display = 'none';
    cardEl.style.display = 'block';

    const total = appState.abarbeitungOrder.length;
    const currentStep = appState.abarbeitungCursor + 1;
    const currentEntry = appState.abarbeitungOrder[appState.abarbeitungCursor];
    const leitung = appState.currentProjekt.leitungen[currentEntry.index];
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

    const previewEntries = appState.abarbeitungOrder
        .slice(appState.abarbeitungCursor + 1, appState.abarbeitungCursor + 7)
        .map(entry => {
            const nextLeitung = appState.currentProjekt.leitungen[entry.index];
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


/**
 * abarbeitungPrev.
 * @returns {void}
 */
export function abarbeitungPrev() {
    if (appState.abarbeitungCursor <= 0) return;
    appState.abarbeitungCursor--;
    renderAbarbeitung();
}


/**
 * abarbeitungNext.
 * @returns {void}
 */
export function abarbeitungNext() {
    if (appState.abarbeitungCursor >= appState.abarbeitungOrder.length - 1) return;
    appState.abarbeitungCursor++;
    renderAbarbeitung();
}


/**
 * abarbeitungOpenAktuell.
 * @returns {void}
 */
export function abarbeitungOpenAktuell() {
    if (!appState.abarbeitungOrder.length) return;
    appState.currentLeitungIndex = appState.abarbeitungOrder[appState.abarbeitungCursor].index;
    showView('konfigurator');
}


/**
 * abarbeitungToggleErledigt.
 * @returns {void}
 */
export function abarbeitungToggleErledigt() {
    if (!appState.abarbeitungOrder.length || !appState.currentProjekt) return;
    const currentEntry = appState.abarbeitungOrder[appState.abarbeitungCursor];
    const leitung = appState.currentProjekt.leitungen[currentEntry.index];
    if (!leitung) return;

    leitung.erledigt = !leitung.erledigt;
    persistCurrentProjekt();
    renderAbarbeitung();
    renderKonfigGruppenliste();
}
