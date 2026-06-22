/**
 * @file Dialog zum Bearbeiten von Bauteilen.
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import { getBauteilByNummer, getBauteileByTyp, getBauteilTypName } from './catalog.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit } from './project-access.js';
import { showModal } from './modal.js';

/** @type {(() => void)|null} */
let onSavedCallback = null;


/**
 * @param {HTMLSelectElement} select
 * @param {string} typ
 * @param {string} selectedArtikelnummer
 * @returns {void}
 */
function populateBauteilEditArtikelSelect(select, typ, selectedArtikelnummer) {
    if (!select) return;
    const bauteile = getBauteileByTyp(typ);
    select.innerHTML = '<option value="">-- Bitte wählen --</option>' + bauteile.map(b =>
        `<option value="${escapeHtml(b.artikelnummer)}" data-hersteller="${escapeHtml(b.hersteller)}">${escapeHtml(b.artikelnummer)} – ${escapeHtml(b.beschreibung)}</option>`
    ).join('');
    if (selectedArtikelnummer) select.value = selectedArtikelnummer;
}


/**
 * @returns {void}
 */
export function filterBauteilEditHersteller() {
    const herstellerSelect = document.getElementById('bauteil-edit-hersteller');
    const artikelSelect = document.getElementById('bauteil-edit-artikel');
    if (!herstellerSelect || !artikelSelect) return;

    const hersteller = herstellerSelect.value;
    Array.from(artikelSelect.options).forEach((opt, idx) => {
        if (idx === 0) return;
        const match = !hersteller || opt.dataset.hersteller === hersteller;
        opt.hidden = !match;
        if (!match && opt.selected) opt.selected = false;
    });
}


/**
 * @param {string} bauteilId
 * @param {() => void} [onSaved]
 * @returns {void}
 */
export function openBauteilEdit(bauteilId, onSaved) {
    if (!appState.currentProjekt || !bauteilId) return;
    if (!assertCanEdit('Bauteile')) return;

    const bauteil = (appState.currentProjekt.bauteile || []).find(b => b.id === bauteilId);
    if (!bauteil) return;

    const overlay = document.getElementById('bauteil-edit-overlay');
    const typEl = document.getElementById('bauteil-edit-typ');
    const herstellerSelect = document.getElementById('bauteil-edit-hersteller');
    const artikelSelect = document.getElementById('bauteil-edit-artikel');
    const anzahlInput = document.getElementById('bauteil-edit-anzahl');
    const idInput = document.getElementById('bauteil-edit-id');
    if (!overlay || !typEl || !herstellerSelect || !artikelSelect || !anzahlInput || !idInput) return;

    onSavedCallback = typeof onSaved === 'function' ? onSaved : null;
    idInput.value = bauteilId;
    typEl.textContent = getBauteilTypName(bauteil.typ);

    const bauteile = getBauteileByTyp(bauteil.typ);
    const hersteller = Array.from(new Set(bauteile.map(b => b.hersteller))).sort((a, b) => a.localeCompare(b, 'de'));
    herstellerSelect.innerHTML = '<option value="">-- Alle --</option>' + hersteller.map(h =>
        `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`
    ).join('');
    if (bauteil.hersteller) herstellerSelect.value = bauteil.hersteller;

    populateBauteilEditArtikelSelect(artikelSelect, bauteil.typ, bauteil.artikelnummer);
    filterBauteilEditHersteller();
    anzahlInput.value = String(bauteil.anzahl || 1);

    overlay.classList.add('active');
    setTimeout(() => anzahlInput.focus(), 0);
}


/**
 * @returns {void}
 */
export function closeBauteilEdit() {
    const overlay = document.getElementById('bauteil-edit-overlay');
    if (overlay) overlay.classList.remove('active');
    onSavedCallback = null;
}


/**
 * @returns {void}
 */
export function saveBauteilEdit() {
    if (!appState.currentProjekt) return;
    if (!assertCanEdit('Bauteile')) return;

    const bauteilId = document.getElementById('bauteil-edit-id')?.value?.trim();
    const artikelSelect = document.getElementById('bauteil-edit-artikel');
    const anzahlInput = document.getElementById('bauteil-edit-anzahl');
    if (!bauteilId || !artikelSelect || !anzahlInput) return;

    const bauteile = appState.currentProjekt.bauteile || [];
    const idx = bauteile.findIndex(b => b.id === bauteilId);
    if (idx < 0) return;

    const artikelnummer = artikelSelect.value?.trim();
    if (!artikelnummer) {
        showModal('Bitte ein Bauteil auswählen.', { type: 'warning', title: 'Bauteil fehlt' });
        return;
    }

    let anzahl = parseInt(anzahlInput.value, 10);
    if (Number.isNaN(anzahl) || anzahl < 1) anzahl = 1;

    const katalogBauteil = getBauteilByNummer(artikelnummer);
    const entry = bauteile[idx];
    entry.artikelnummer = katalogBauteil ? katalogBauteil.artikelnummer : artikelnummer;
    entry.hersteller = katalogBauteil?.hersteller || entry.hersteller || '';
    entry.bezeichnung = katalogBauteil?.beschreibung || entry.bezeichnung || getBauteilTypName(entry.typ);
    entry.anzahl = anzahl;

    persistCurrentProjekt();
    closeBauteilEdit();
    onSavedCallback?.();
}
