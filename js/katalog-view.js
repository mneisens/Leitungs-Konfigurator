/**
 * @file Katalog-Ansicht: Leitungen nach Kategorie filtern und nachtragen.
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import { showModal } from './modal.js';
import { mergeKatalogAdditions, ensureKatalogLists } from './catalog.js';
import { getKatalogAdditions, persistKatalogAdditions } from './firebase.js';

const LOCAL_ADDITIONS_KEY = 'leitungskonfigurator_katalog_additions';


/**
 * @returns {object[]}
 */
function getLocalAdditions() {
    try {
        const raw = localStorage.getItem(LOCAL_ADDITIONS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}


/**
 * @param {object[]} additions
 * @returns {void}
 */
function saveLocalAdditions(additions) {
    localStorage.setItem(LOCAL_ADDITIONS_KEY, JSON.stringify(additions));
}


/**
 * @returns {Promise<object[]>}
 */
async function loadAdditions() {
    if (appState.firebaseReady && appState.currentUser) {
        return getKatalogAdditions();
    }
    return getLocalAdditions();
}


/**
 * @param {object[]} additions
 * @returns {Promise<void>}
 */
async function saveAdditions(additions) {
    if (appState.firebaseReady && appState.currentUser) {
        await persistKatalogAdditions(additions);
    } else {
        saveLocalAdditions(additions);
    }
    mergeKatalogAdditions(additions);
}


/**
 * @returns {void}
 */
function populateKatalogFormOptions() {
    const katalog = appState.katalog;
    if (!katalog) return;

    const kategorieSelect = document.getElementById('katalog-form-kategorie');
    const herstellerSelect = document.getElementById('katalog-form-hersteller');
    const steckerList = document.getElementById('katalog-stecker-vorschlaege');

    if (kategorieSelect) {
        const current = kategorieSelect.value;
        kategorieSelect.innerHTML = (katalog.kategorien || [])
            .map(k => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.name)}</option>`)
            .join('');
        if (current && [...kategorieSelect.options].some(o => o.value === current)) {
            kategorieSelect.value = current;
        } else {
            kategorieSelect.value = 'ethercat';
        }
    }

    if (herstellerSelect) {
        const current = herstellerSelect.value;
        herstellerSelect.innerHTML = '<option value="">-- Hersteller wählen --</option>'
            + (katalog.hersteller || [])
                .map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`)
                .join('')
            + '<option value="__custom__">Anderer Hersteller…</option>';
        if (current && [...herstellerSelect.options].some(o => o.value === current)) {
            herstellerSelect.value = current;
        }
    }

    if (steckerList) {
        steckerList.innerHTML = (katalog.steckertypen || [])
            .map(s => `<option value="${escapeHtml(s)}"></option>`)
            .join('');
    }
}


/**
 * @returns {void}
 */
export function onKatalogHerstellerChange() {
    const select = document.getElementById('katalog-form-hersteller');
    const customGroup = document.getElementById('katalog-hersteller-custom-group');
    const customInput = document.getElementById('katalog-form-hersteller-custom');
    if (!select || !customGroup) return;

    const isCustom = select.value === '__custom__';
    customGroup.hidden = !isCustom;
    if (isCustom) customInput?.focus();
}


/**
 * @returns {void}
 */
export function onKatalogKategorieChange() {
    const kategorie = document.getElementById('katalog-kategorie-filter')?.value || '';
    const formKategorie = document.getElementById('katalog-form-kategorie');
    if (formKategorie && kategorie) {
        formKategorie.value = kategorie;
    }
    renderKatalogListe();
}


/**
 * @returns {void}
 */
export function onKatalogSearch() {
    renderKatalogListe();
}


/**
 * @returns {object[]}
 */
function getFilteredArtikel() {
    const artikel = appState.katalog?.artikel || [];
    const kategorie = document.getElementById('katalog-kategorie-filter')?.value || '';
    const search = (document.getElementById('katalog-search')?.value || '').trim().toLowerCase();

    return artikel
        .filter(a => !kategorie || a.kategorie === kategorie)
        .filter(a => {
            if (!search) return true;
            const hay = [
                a.artikelnummer,
                a.beschreibung,
                a.hersteller,
                a.steckerA,
                a.steckerB
            ].join(' ').toLowerCase();
            return hay.includes(search);
        })
        .sort((a, b) => {
            const herstellerCmp = (a.hersteller || '').localeCompare(b.hersteller || '', 'de');
            if (herstellerCmp !== 0) return herstellerCmp;
            return (a.artikelnummer || '').localeCompare(b.artikelnummer || '', 'de', { numeric: true });
        });
}


/**
 * @returns {void}
 */
export function renderKatalogListe() {
    const tbody = document.getElementById('katalog-tabelle-body');
    const countEl = document.getElementById('katalog-count');
    if (!tbody) return;

    const rows = getFilteredArtikel();
    if (countEl) {
        countEl.textContent = `${rows.length} Leitung${rows.length === 1 ? '' : 'en'}`;
    }

    if (rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-muted" style="text-align:center;padding:1.5rem;">
                    Keine Leitungen für diese Auswahl gefunden.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(a => {
        const laengeText = a.meterware
            ? 'Meterware'
            : (a.laenge != null ? `${a.laenge} m` : '–');
        const customBadge = a.custom
            ? '<span class="katalog-badge-custom">Nachgetragen</span>'
            : '';
        const deleteBtn = a.custom
            ? `<button type="button" class="btn btn-danger btn-small" onclick='deleteKatalogArtikel(${JSON.stringify(a.artikelnummer || "")})'>Entfernen</button>`
            : '';

        return `
            <tr class="${a.custom ? 'katalog-row-custom' : ''}">
                <td>
                    <strong>${escapeHtml(a.artikelnummer || '')}</strong>
                    ${customBadge}
                </td>
                <td>${escapeHtml(a.hersteller || '')}</td>
                <td>${escapeHtml(a.beschreibung || '')}</td>
                <td>${escapeHtml(a.steckerA || '')}</td>
                <td>${escapeHtml(a.steckerB || '')}</td>
                <td>${escapeHtml(laengeText)}</td>
                <td>${escapeHtml(a.kategorie || '')}</td>
                <td class="table-actions">${deleteBtn}</td>
            </tr>
        `;
    }).join('');
}


/**
 * @returns {void}
 */
function resetKatalogForm() {
    const form = document.getElementById('katalog-add-form');
    if (!form) return;
    form.reset();

    const filterKategorie = document.getElementById('katalog-kategorie-filter')?.value;
    const formKategorie = document.getElementById('katalog-form-kategorie');
    if (formKategorie) {
        formKategorie.value = filterKategorie || 'ethercat';
    }

    const customGroup = document.getElementById('katalog-hersteller-custom-group');
    if (customGroup) customGroup.hidden = true;

    const meterware = document.getElementById('katalog-form-meterware');
    if (meterware) meterware.checked = false;
}


/**
 * @returns {Promise<void>}
 */
export async function addKatalogArtikel() {
    const kategorie = document.getElementById('katalog-form-kategorie')?.value?.trim();
    const herstellerSelect = document.getElementById('katalog-form-hersteller')?.value;
    const herstellerCustom = document.getElementById('katalog-form-hersteller-custom')?.value?.trim();
    const hersteller = herstellerSelect === '__custom__' ? herstellerCustom : herstellerSelect;
    const artikelnummer = document.getElementById('katalog-form-artikelnummer')?.value?.trim();
    const beschreibung = document.getElementById('katalog-form-beschreibung')?.value?.trim();
    const steckerA = document.getElementById('katalog-form-stecker-a')?.value?.trim();
    const steckerB = document.getElementById('katalog-form-stecker-b')?.value?.trim();
    const laengeRaw = document.getElementById('katalog-form-laenge')?.value;
    const meterware = document.getElementById('katalog-form-meterware')?.checked === true;

    if (!kategorie || !hersteller || !artikelnummer || !beschreibung || !steckerA || !steckerB) {
        showModal('Bitte alle Pflichtfelder ausfüllen.', { type: 'warning', title: 'Eingabe unvollständig' });
        return;
    }

    let laenge = parseFloat(laengeRaw);
    if (meterware) {
        laenge = 0;
    } else if (Number.isNaN(laenge) || laenge < 0) {
        showModal('Bitte eine gültige Länge eingeben (oder Meterware markieren).', {
            type: 'warning',
            title: 'Länge fehlt'
        });
        return;
    }

    const exists = (appState.katalog?.artikel || []).some(
        a => (a.artikelnummer || '').toLowerCase() === artikelnummer.toLowerCase()
    );
    if (exists) {
        showModal(`Artikelnummer ${artikelnummer} ist bereits im Katalog.`, {
            type: 'warning',
            title: 'Bereits vorhanden'
        });
        return;
    }

    const article = {
        hersteller,
        artikelnummer,
        beschreibung,
        steckerA,
        steckerB,
        laenge,
        kategorie,
        custom: true
    };
    if (meterware) article.meterware = true;

    try {
        const additions = await loadAdditions();
        additions.push(article);
        await saveAdditions(additions);
        ensureKatalogLists(article);
        resetKatalogForm();
        populateKatalogFormOptions();
        renderKatalogListe();
        showModal(`Leitung ${artikelnummer} wurde nachgetragen und steht ab sofort zur Verfügung.`, {
            type: 'success',
            title: 'Gespeichert'
        });
    } catch (error) {
        showModal(`Speichern fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
    }
}


/**
 * @param {string} artikelnummer
 * @returns {Promise<void>}
 */
export async function deleteKatalogArtikel(artikelnummer) {
    if (!artikelnummer) return;

    const confirmed = await showModal(
        `Nachgetragene Leitung ${artikelnummer} wirklich entfernen?`,
        { type: 'warning', title: 'Entfernen', confirmText: 'Entfernen', cancelText: 'Abbrechen', showCancel: true }
    );
    if (!confirmed) return;

    try {
        const additions = (await loadAdditions()).filter(
            a => (a.artikelnummer || '').toLowerCase() !== artikelnummer.toLowerCase()
        );
        await saveAdditions(additions);
        renderKatalogListe();
        showModal('Leitung wurde entfernt.', { type: 'success', title: 'Entfernt' });
    } catch (error) {
        showModal(`Entfernen fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
    }
}


/**
 * @returns {Promise<void>}
 */
export async function renderKatalogView() {
    const filter = document.getElementById('katalog-kategorie-filter');
    if (filter && !filter.dataset.populated) {
        const kategorien = appState.katalog?.kategorien || [];
        filter.innerHTML = '<option value="">Alle Kategorien</option>'
            + kategorien.map(k => `<option value="${escapeHtml(k.id)}">${escapeHtml(k.icon || '')} ${escapeHtml(k.name)}</option>`).join('');
        filter.dataset.populated = '1';
        filter.value = 'ethercat';
    }

    populateKatalogFormOptions();

    // Sicherstellen, dass Nachträge (auch lokal) im Speicher sind
    const additions = await loadAdditions();
    mergeKatalogAdditions(additions);

    const formKategorie = document.getElementById('katalog-form-kategorie');
    if (formKategorie && filter?.value) {
        formKategorie.value = filter.value;
    }

    renderKatalogListe();
}
