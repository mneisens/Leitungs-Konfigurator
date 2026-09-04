/**
 * @file Katalog-Ansicht: Leitungen und Bauteile getrennt filtern und nachtragen.
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import { showModal } from './modal.js';
import {
    mergeKatalogAdditions,
    ensureKatalogLists,
    mergeBauteileAdditions,
    ensureBauteilTyp,
    getBauteilTypName,
    getBauteilByNummer,
    bauteilPasstZuGruppe,
    normalizeGruppeNummer
} from './catalog.js';
import {
    loadLeitungAdditions as loadAdditions,
    saveLeitungAdditions as saveAdditions,
    loadBauteilAdditions as loadBauteileAdditionsList,
    saveBauteilAdditions as saveBauteileAdditionsList,
    bauteilnummerVergeben,
    upsertBauteilKatalogEntry,
    renameBauteilKatalogEntry
} from './katalog-additions.js';
import { getGruppeDisplay } from './overview.js';

let katalogTab = 'leitungen';
let editingBauteilNr = null;


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
 * Wechselt zwischen Leitungen- und Bauteile-Tab.
 * @param {'leitungen'|'bauteile'} tab
 * @returns {void}
 */
export function setKatalogTab(tab) {
    katalogTab = tab === 'bauteile' ? 'bauteile' : 'leitungen';

    const tabLeitungen = document.getElementById('katalog-tab-leitungen');
    const tabBauteile = document.getElementById('katalog-tab-bauteile');
    const panelLeitungen = document.getElementById('katalog-panel-leitungen');
    const panelBauteile = document.getElementById('katalog-panel-bauteile');

    const isBauteile = katalogTab === 'bauteile';
    if (tabLeitungen) {
        tabLeitungen.classList.toggle('active', !isBauteile);
        tabLeitungen.setAttribute('aria-selected', String(!isBauteile));
    }
    if (tabBauteile) {
        tabBauteile.classList.toggle('active', isBauteile);
        tabBauteile.setAttribute('aria-selected', String(isBauteile));
    }
    if (panelLeitungen) panelLeitungen.hidden = isBauteile;
    if (panelBauteile) panelBauteile.hidden = !isBauteile;

    if (isBauteile) {
        renderKatalogBauteileListe();
    } else {
        renderKatalogListe();
    }
}


/**
 * @returns {void}
 */
function populateBauteileFormOptions() {
    const typSelect = document.getElementById('katalog-bauteil-form-typ');
    const typFilter = document.getElementById('katalog-bauteil-typ-filter');
    const herstellerSelect = document.getElementById('katalog-bauteil-form-hersteller');
    const typen = appState.bauteileKatalog?.bauteiltypen || [];

    if (typSelect) {
        const current = typSelect.value;
        typSelect.innerHTML = typen
            .map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
            .join('');
        if (current && [...typSelect.options].some(o => o.value === current)) {
            typSelect.value = current;
        }
    }

    if (typFilter && !typFilter.dataset.populated) {
        typFilter.innerHTML = '<option value="">Alle Typen</option>'
            + typen.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
        typFilter.dataset.populated = '1';
    } else if (typFilter) {
        const current = typFilter.value;
        typFilter.innerHTML = '<option value="">Alle Typen</option>'
            + typen.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
        if (current && [...typFilter.options].some(o => o.value === current)) {
            typFilter.value = current;
        }
    }

    if (herstellerSelect) {
        const fromArtikel = (appState.bauteileKatalog?.artikel || []).map(a => a.hersteller).filter(Boolean);
        const fromLeitungen = appState.katalog?.hersteller || [];
        const hersteller = Array.from(new Set([...fromLeitungen, ...fromArtikel]))
            .sort((a, b) => a.localeCompare(b, 'de'));
        const current = herstellerSelect.value;
        herstellerSelect.innerHTML = '<option value="">-- Hersteller wählen --</option>'
            + hersteller.map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('')
            + '<option value="__custom__">Anderer Hersteller…</option>';
        if (current && [...herstellerSelect.options].some(o => o.value === current)) {
            herstellerSelect.value = current;
        }
    }

    populateBauteileGruppeFilter();
    populateBauteileGruppeDatalist();
}


/**
 * Füllt den Gruppen-Filter und die Vorschlagsliste für Gruppenzuordnungen.
 * @returns {void}
 */
function populateBauteileGruppeFilter() {
    const gruppeFilter = document.getElementById('katalog-bauteil-gruppe-filter');
    if (!gruppeFilter) return;

    const current = gruppeFilter.value;
    const gruppen = appState.leitungGruppen || [];
    gruppeFilter.innerHTML = '<option value="">Alle Gruppen</option>'
        + gruppen.map(g => `<option value="${escapeHtml(g.code)}">${escapeHtml(getGruppeDisplay(g.code))}</option>`).join('');

    if (current && [...gruppeFilter.options].some(o => o.value === current)) {
        gruppeFilter.value = current;
    }
}


/**
 * @returns {void}
 */
function populateBauteileGruppeDatalist() {
    const datalist = document.getElementById('katalog-gruppe-vorschlaege');
    if (!datalist) return;

    datalist.innerHTML = (appState.leitungGruppen || [])
        .map(g => {
            const nummer = normalizeGruppeNummer(g.code);
            return `<option value="${escapeHtml(nummer)}" label="${escapeHtml(getGruppeDisplay(g.code))}"></option>`;
        })
        .join('');
}


/**
 * @returns {void}
 */
export function onKatalogBauteilHerstellerChange() {
    const select = document.getElementById('katalog-bauteil-form-hersteller');
    const customGroup = document.getElementById('katalog-bauteil-hersteller-custom-group');
    const customInput = document.getElementById('katalog-bauteil-form-hersteller-custom');
    if (!select || !customGroup) return;
    const isCustom = select.value === '__custom__';
    customGroup.hidden = !isCustom;
    if (isCustom) customInput?.focus();
}


/**
 * @returns {void}
 */
export function onKatalogBauteilTypChange() {
    const typ = document.getElementById('katalog-bauteil-typ-filter')?.value || '';
    const formTyp = document.getElementById('katalog-bauteil-form-typ');
    if (formTyp && typ) formTyp.value = typ;
    renderKatalogBauteileListe();
}


/**
 * @returns {void}
 */
export function onKatalogBauteilGruppeChange() {
    renderKatalogBauteileListe();
}


/**
 * @returns {void}
 */
export function onKatalogBauteilSearch() {
    renderKatalogBauteileListe();
}


/**
 * @returns {object[]}
 */
function getFilteredBauteile() {
    const artikel = appState.bauteileKatalog?.artikel || [];
    const typ = document.getElementById('katalog-bauteil-typ-filter')?.value || '';
    const gruppe = document.getElementById('katalog-bauteil-gruppe-filter')?.value || '';
    const search = (document.getElementById('katalog-bauteil-search')?.value || '').trim().toLowerCase();

    return artikel
        .filter(a => !typ || a.typ === typ)
        .filter(a => !gruppe || bauteilPasstZuGruppe(a, gruppe))
        .filter(a => {
            if (!search) return true;
            const hay = [
                a.artikelnummer,
                a.beschreibung,
                a.hersteller,
                a.typ,
                a.gruppe,
                a.lieferant,
                getBauteilTypName(a.typ)
            ].join(' ').toLowerCase();
            return hay.includes(search);
        })
        .sort((a, b) => {
            const typCmp = (getBauteilTypName(a.typ) || '').localeCompare(getBauteilTypName(b.typ) || '', 'de');
            if (typCmp !== 0) return typCmp;
            return (a.artikelnummer || '').localeCompare(b.artikelnummer || '', 'de', { numeric: true });
        });
}


/**
 * @returns {void}
 */
export function renderKatalogBauteileListe() {
    const tbody = document.getElementById('katalog-bauteile-tabelle-body');
    const countEl = document.getElementById('katalog-bauteil-count');
    if (!tbody) return;

    const rows = getFilteredBauteile();
    if (countEl) {
        countEl.textContent = `${rows.length} Bauteil${rows.length === 1 ? '' : 'e'}`;
    }

    if (rows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-muted" style="text-align:center;padding:1.5rem;">
                    Keine Bauteile für diese Auswahl gefunden.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows.map(a => {
        const placeholderBadge = a.placeholder
            ? '<span class="katalog-badge-placeholder">Platzhalter</span>'
            : '';
        const customBadge = a.custom && !a.modified
            ? '<span class="katalog-badge-custom">Nachgetragen</span>'
            : '';
        const modifiedBadge = a.modified
            ? '<span class="katalog-badge-modified">Geändert</span>'
            : '';
        const gruppeLabel = formatBauteilGruppeLabel(a.gruppe);
        const editBtn = `<button type="button" class="btn btn-secondary btn-small"
            onclick='editKatalogBauteil(${JSON.stringify(a.artikelnummer || "")})'>Bearbeiten</button>`;
        const deleteBtn = (a.custom && !a.modified) || a.placeholder
            ? `<button type="button" class="btn btn-danger btn-small"
                onclick='deleteKatalogBauteil(${JSON.stringify(a.artikelnummer || "")})'>Entfernen</button>`
            : (a.modified
                ? `<button type="button" class="btn btn-secondary btn-small"
                    onclick='revertKatalogBauteil(${JSON.stringify(a.artikelnummer || "")})'>Zurücksetzen</button>`
                : '');

        return `
            <tr class="${a.custom || a.modified ? 'katalog-row-custom' : ''}">
                <td>
                    <strong>${escapeHtml(a.artikelnummer || '')}</strong>
                    ${placeholderBadge}
                    ${customBadge}
                    ${modifiedBadge}
                </td>
                <td>${escapeHtml(a.hersteller || '')}</td>
                <td>${escapeHtml(a.beschreibung || '')}</td>
                <td>${escapeHtml(getBauteilTypName(a.typ) || a.typ || '')}</td>
                <td>${escapeHtml(gruppeLabel)}</td>
                <td>${escapeHtml(a.lieferant || '–')}</td>
                <td class="table-actions">${editBtn}${deleteBtn}</td>
            </tr>
        `;
    }).join('');
}


/**
 * @param {string} gruppeRaw
 * @returns {string}
 */
function formatBauteilGruppeLabel(gruppeRaw) {
    if (!gruppeRaw) return '–';
    return String(gruppeRaw)
        .split('/')
        .map(part => {
            const nummer = normalizeGruppeNummer(part.trim());
            if (!nummer) return part.trim();
            const code = `=${nummer}`;
            const label = getGruppeDisplay(code);
            return label === code ? nummer : label;
        })
        .join(' / ');
}


/**
 * Schaltet das Bauteil-Formular in den Bearbeitungsmodus.
 * @param {string} artikelnummer
 * @returns {void}
 */
export function editKatalogBauteil(artikelnummer) {
    const artikel = getBauteilByNummer(artikelnummer);
    if (!artikel) return;

    editingBauteilNr = artikelnummer;
    updateBauteilFormMode();

    document.getElementById('katalog-bauteil-form-typ').value = artikel.typ || '';
    document.getElementById('katalog-bauteil-form-artikelnummer').value = artikel.artikelnummer || '';
    document.getElementById('katalog-bauteil-form-beschreibung').value = artikel.beschreibung || '';
    document.getElementById('katalog-bauteil-form-gruppe').value = artikel.gruppe || '';
    document.getElementById('katalog-bauteil-form-lieferant').value = artikel.lieferant || '';
    document.getElementById('katalog-bauteil-form-placeholder').checked = Boolean(artikel.placeholder);

    const herstellerSelect = document.getElementById('katalog-bauteil-form-hersteller');
    if (herstellerSelect) {
        const hersteller = artikel.hersteller || '';
        if (hersteller && ![...herstellerSelect.options].some(o => o.value === hersteller)) {
            const option = document.createElement('option');
            option.value = hersteller;
            option.textContent = hersteller;
            herstellerSelect.insertBefore(option, herstellerSelect.querySelector('option[value="__custom__"]'));
        }
        herstellerSelect.value = hersteller || '';
    }

    const customGroup = document.getElementById('katalog-bauteil-hersteller-custom-group');
    if (customGroup) customGroup.hidden = true;

    document.getElementById('katalog-bauteil-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/**
 * @returns {void}
 */
export function cancelEditKatalogBauteil() {
    editingBauteilNr = null;
    resetBauteilForm();
    updateBauteilFormMode();
}


function canEditBauteilArtikelnummer(artikelnummer) {
    const artikel = artikelnummer ? getBauteilByNummer(artikelnummer) : null;
    return Boolean(artikel?.placeholder);
}


/**
 * Passt Titel, Buttons und Felder des Bauteil-Formulars an.
 * @returns {void}
 */
function updateBauteilFormMode() {
    const title = document.getElementById('katalog-bauteil-form-title');
    const submitBtn = document.getElementById('katalog-bauteil-form-submit');
    const cancelBtn = document.getElementById('katalog-bauteil-form-cancel');
    const artikelInput = document.getElementById('katalog-bauteil-form-artikelnummer');
    const isEdit = Boolean(editingBauteilNr);
    const artikelnummerEditable = isEdit && canEditBauteilArtikelnummer(editingBauteilNr);

    if (title) title.textContent = isEdit ? 'Bauteil bearbeiten' : 'Bauteil nachtragen';
    if (submitBtn) submitBtn.textContent = isEdit ? 'Änderungen speichern' : '+ Bauteil speichern';
    if (cancelBtn) cancelBtn.hidden = !isEdit;
    if (artikelInput) {
        artikelInput.readOnly = isEdit && !artikelnummerEditable;
        artikelInput.title = artikelnummerEditable
            ? 'Platzhalter durch die echte Artikelnummer ersetzen'
            : (isEdit ? 'Artikelnummer kann beim Bearbeiten nicht geändert werden' : '');
    }
}


/**
 * @returns {void}
 */
function resetBauteilForm() {
    const form = document.getElementById('katalog-bauteil-add-form');
    if (!form) return;
    form.reset();
    const filterTyp = document.getElementById('katalog-bauteil-typ-filter')?.value;
    const formTyp = document.getElementById('katalog-bauteil-form-typ');
    if (formTyp && filterTyp) formTyp.value = filterTyp;
    const customGroup = document.getElementById('katalog-bauteil-hersteller-custom-group');
    if (customGroup) customGroup.hidden = true;
    const artikelInput = document.getElementById('katalog-bauteil-form-artikelnummer');
    if (artikelInput) artikelInput.readOnly = false;
}


/**
 * Liest die Formularwerte für ein Bauteil aus.
 * @returns {object|null}
 */
function readBauteilFormValues() {
    const typ = document.getElementById('katalog-bauteil-form-typ')?.value?.trim();
    const herstellerSelect = document.getElementById('katalog-bauteil-form-hersteller')?.value;
    const herstellerCustom = document.getElementById('katalog-bauteil-form-hersteller-custom')?.value?.trim();
    const hersteller = herstellerSelect === '__custom__' ? herstellerCustom : herstellerSelect;
    const artikelnummer = document.getElementById('katalog-bauteil-form-artikelnummer')?.value?.trim();
    const beschreibung = document.getElementById('katalog-bauteil-form-beschreibung')?.value?.trim();
    const gruppe = document.getElementById('katalog-bauteil-form-gruppe')?.value?.trim() || '';
    const lieferant = document.getElementById('katalog-bauteil-form-lieferant')?.value?.trim() || '';
    const placeholder = document.getElementById('katalog-bauteil-form-placeholder')?.checked === true;

    if (!typ || !hersteller || !artikelnummer || !beschreibung) {
        showModal('Bitte alle Pflichtfelder ausfüllen.', { type: 'warning', title: 'Eingabe unvollständig' });
        return null;
    }

    const article = {
        hersteller,
        artikelnummer,
        beschreibung,
        typ,
        gruppe
    };
    if (lieferant) article.lieferant = lieferant;
    if (placeholder) article.placeholder = true;
    return article;
}


/**
 * @returns {Promise<void>}
 */
export async function addKatalogBauteil() {
    const article = readBauteilFormValues();
    if (!article) return;

    if (editingBauteilNr) {
        await saveKatalogBauteilEdit(article);
        return;
    }

    if (bauteilnummerVergeben(article.artikelnummer)) {
        showModal(`Artikelnummer ${article.artikelnummer} ist bereits im Bauteile-Katalog.`, {
            type: 'warning',
            title: 'Bereits vorhanden'
        });
        return;
    }

    article.custom = true;

    try {
        await upsertBauteilKatalogEntry(article, { isNew: true });
        resetBauteilForm();
        populateBauteileFormOptions();
        renderKatalogBauteileListe();
        showModal(`Bauteil ${article.artikelnummer} wurde nachgetragen.`, {
            type: 'success',
            title: 'Gespeichert'
        });
    } catch (error) {
        showModal(`Speichern fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
    }
}


/**
 * @param {object} article
 * @returns {Promise<void>}
 */
async function saveKatalogBauteilEdit(article) {
    if (!editingBauteilNr) return;

    const alteNr = editingBauteilNr.trim();
    const neueNr = (article.artikelnummer || '').trim();
    const altesBauteil = getBauteilByNummer(alteNr);

    if (neueNr.toLowerCase() !== alteNr.toLowerCase()) {
        if (!altesBauteil?.placeholder) {
            showModal('Die Artikelnummer kann bei bestehenden Bauteilen nicht geändert werden.', {
                type: 'warning',
                title: 'Artikelnummer gesperrt'
            });
            return;
        }
        if (bauteilnummerVergeben(neueNr)) {
            showModal(`Artikelnummer ${neueNr} ist bereits im Bauteile-Katalog.`, {
                type: 'warning',
                title: 'Bereits vorhanden'
            });
            return;
        }
    }

    try {
        if (neueNr.toLowerCase() !== alteNr.toLowerCase()) {
            await renameBauteilKatalogEntry(alteNr, article);
        } else {
            await upsertBauteilKatalogEntry(article, { isNew: false });
        }
        editingBauteilNr = null;
        resetBauteilForm();
        updateBauteilFormMode();
        populateBauteileFormOptions();
        renderKatalogBauteileListe();
        showModal(`Bauteil ${neueNr} wurde aktualisiert.`, {
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
export async function deleteKatalogBauteil(artikelnummer) {
    if (!artikelnummer) return;

    const artikel = getBauteilByNummer(artikelnummer);
    const istNachgetragen = Boolean(artikel?.custom && !artikel?.modified);
    const label = artikel?.beschreibung || artikelnummer;

    let message;
    if (istNachgetragen) {
        message = `Nachgetragenes Bauteil ${artikelnummer} wirklich entfernen?`;
    } else if (artikel?.placeholder) {
        message = `Platzhalter „${label}“ aus dem Katalog entfernen?\n\nEr erscheint danach nicht mehr in Auswahllisten. Bereits erfasste Projekt-Einträge bleiben erhalten.`;
    } else {
        message = `Bauteil „${label}“ aus dem Katalog ausblenden?\n\nBereits erfasste Projekt-Einträge bleiben erhalten.`;
    }

    const confirmed = await showModal(message, {
        type: 'warning',
        title: 'Entfernen',
        confirmText: 'Entfernen',
        cancelText: 'Abbrechen',
        showCancel: true
    });
    if (!confirmed) return;

    try {
        const key = artikelnummer.toLowerCase();
        let additions = await loadBauteileAdditionsList();

        if (istNachgetragen) {
            additions = additions.filter(
                a => (a.artikelnummer || '').toLowerCase() !== key
            );
        } else {
            const idx = additions.findIndex(a => (a.artikelnummer || '').toLowerCase() === key);
            const entry = { artikelnummer, hidden: true, override: true };
            if (idx >= 0) {
                additions[idx] = { ...additions[idx], ...entry };
            } else {
                additions.push(entry);
            }
        }

        await saveBauteileAdditionsList(additions);
        if (editingBauteilNr?.toLowerCase() === key) {
            cancelEditKatalogBauteil();
        }
        renderKatalogBauteileListe();
        showModal(
            istNachgetragen ? 'Bauteil wurde entfernt.' : 'Bauteil wurde aus dem Katalog entfernt.',
            { type: 'success', title: 'Entfernt' }
        );
    } catch (error) {
        showModal(`Entfernen fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
    }
}


/**
 * Setzt Änderungen an einem Basis-Bauteil zurück.
 * @param {string} artikelnummer
 * @returns {Promise<void>}
 */
export async function revertKatalogBauteil(artikelnummer) {
    if (!artikelnummer) return;

    const confirmed = await showModal(
        `Änderungen an ${artikelnummer} verwerfen und den Standardwert wiederherstellen?`,
        { type: 'warning', title: 'Zurücksetzen', confirmText: 'Zurücksetzen', cancelText: 'Abbrechen', showCancel: true }
    );
    if (!confirmed) return;

    try {
        const additions = (await loadBauteileAdditionsList()).filter(
            a => (a.artikelnummer || '').toLowerCase() !== artikelnummer.toLowerCase()
        );
        await saveBauteileAdditionsList(additions);
        if (editingBauteilNr?.toLowerCase() === artikelnummer.toLowerCase()) {
            cancelEditKatalogBauteil();
        }
        renderKatalogBauteileListe();
        showModal('Bauteil wurde auf den Standard zurückgesetzt.', { type: 'success', title: 'Zurückgesetzt' });
    } catch (error) {
        showModal(`Zurücksetzen fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
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
    populateBauteileFormOptions();
    updateBauteilFormMode();

    const additions = await loadAdditions();
    mergeKatalogAdditions(additions);

    const bauteilAdditions = await loadBauteileAdditionsList();
    mergeBauteileAdditions(bauteilAdditions);
    bauteilAdditions.forEach(a => ensureBauteilTyp(a));
    populateBauteileFormOptions();

    const formKategorie = document.getElementById('katalog-form-kategorie');
    if (formKategorie && filter?.value) {
        formKategorie.value = filter.value;
    }

    setKatalogTab(katalogTab);
}
