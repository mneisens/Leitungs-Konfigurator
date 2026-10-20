/**
 * @file gk-leitung-formular.js – Formular für noch nicht katalogisierte Leitungen.
 */
import { appState } from './state.js';
import { escapeHtml, generateId } from './utils.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit } from './project-access.js';
import { getFullSteckerTyp } from './stecker-utils.js';
import { getKategorien, istMeterwareKategorie } from './leitung-optionen.js';
import { getLeitungPreset } from './gruppen-config.js';
import { addLeitungZumKatalog, leitungsnummerVergeben } from './katalog-additions.js';
import { showModal } from './modal.js';
import { gk, findLeitung, optionen, renumberLeitungen } from './gk-state.js';
import { renderGruppenListe, renderGruppenPanel } from './gk-gruppen.js';
import { renderEditorOverlay } from './gk-bauteile.js';
import { bildeNeueLeitungBezeichnung } from './gk-picker.js';
import { fokussiereLeitungEditor } from './gk-leitungen.js';


/**
 * Formular für eine Leitung, die es noch nicht im Katalog gibt.
 * @returns {string}
 */
export function renderNeuesLeitungFormular() {
    if (!gk.neuesLeitungFormular) return '';

    const zielLeitung = gk.neuesLeitungFormular.leitungId ? findLeitung(gk.neuesLeitungFormular.leitungId) : null;
    const kategorien = getKategorien();
    const hersteller = Array.from(new Set(appState.katalog?.hersteller || [])).sort((a, b) => a.localeCompare(b, 'de'));
    const stecker = appState.katalog?.steckertypen || [];
    const form = gk.neuesLeitungFormular;

    return renderEditorOverlay({
        onClose: 'gruppeCancelLeitungFormular()',
        inhalt: `
        <div class="gruppen-karte leitung-neu-formular">
            <h5>Neue Leitung im Katalog anlegen</h5>
            <p class="text-muted">
                Die Leitung wird in den Katalog übernommen und steht danach in jedem Projekt zur Verfügung.
                ${zielLeitung ? 'Sie wird direkt der bearbeiteten Position zugeordnet.' : ''}
            </p>

            <div class="gruppen-karte-grid">
                <div class="form-group">
                    <label for="neu-leitung-kategorie">Leitungstyp *</label>
                    <select id="neu-leitung-kategorie" onchange="gruppeOnNeuLeitungKategorieChange(this.value)">
                        ${optionen([
                            { value: '', label: '-- Bitte wählen --' },
                            ...kategorien.map(k => ({ value: k.id, label: `${k.icon} ${k.name}` }))
                        ], form.kategorie)}
                    </select>
                </div>
                <div class="form-group">
                    <label for="neu-leitung-hersteller">Hersteller *</label>
                    <input type="text" id="neu-leitung-hersteller" list="neu-leitung-hersteller-liste"
                           value="${escapeHtml(form.hersteller || '')}" placeholder="z. B. Beckhoff">
                    <datalist id="neu-leitung-hersteller-liste">
                        ${hersteller.map(h => `<option value="${escapeHtml(h)}"></option>`).join('')}
                    </datalist>
                </div>
                <div class="form-group">
                    <label for="neu-leitung-artikelnummer">Artikelnummer *</label>
                    <input type="text" id="neu-leitung-artikelnummer" value="${escapeHtml(form.artikelnummer || '')}"
                           placeholder="z. B. ZK1090-3131-0050">
                </div>
                <div class="form-group gruppen-karte-breit">
                    <label for="neu-leitung-beschreibung">Bezeichnung</label>
                    <input type="text" id="neu-leitung-beschreibung" value="${escapeHtml(form.beschreibung || '')}"
                           placeholder="Leer lassen → wird automatisch erzeugt">
                </div>
                <div class="form-group">
                    <label for="neu-leitung-stecker-a">Stecker A *</label>
                    <input type="text" id="neu-leitung-stecker-a" list="neu-leitung-stecker-liste"
                           value="${escapeHtml(form.steckerA || '')}" placeholder="z. B. M8 4-polig gerade">
                </div>
                <div class="form-group">
                    <label for="neu-leitung-stecker-b">Stecker B *</label>
                    <input type="text" id="neu-leitung-stecker-b" list="neu-leitung-stecker-liste"
                           value="${escapeHtml(form.steckerB || '')}" placeholder="z. B. offen">
                </div>
                <datalist id="neu-leitung-stecker-liste">
                    ${stecker.map(s => `<option value="${escapeHtml(s)}"></option>`).join('')}
                </datalist>
                <div class="form-group">
                    <label for="neu-leitung-laenge">Länge (m)</label>
                    <input type="number" min="0" step="0.01" id="neu-leitung-laenge"
                           value="${form.laenge !== undefined && form.laenge !== '' ? escapeHtml(String(form.laenge)) : ''}"
                           placeholder="z. B. 5"${form.meterware ? ' disabled' : ''}>
                </div>
                <div class="form-group">
                    <label class="wizard-skip-label">
                        <input type="checkbox" id="neu-leitung-meterware"${form.meterware ? ' checked' : ''}
                               onchange="gruppeOnNeuLeitungMeterwareChange(this.checked)">
                        Meterware (Länge wird im Projekt festgelegt)
                    </label>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="gruppeCancelLeitungFormular()">Abbrechen</button>
                <button type="button" class="btn btn-primary" onclick="gruppeSaveNeuesLeitung()">In Katalog speichern &amp; übernehmen</button>
            </div>
        </div>
    `
    });
}


/**
 * Öffnet das Anlageformular für eine neue Katalog-Leitung.
 * @param {string} leitungId
 * @param {string} presetId
 * @returns {void}
 */
export function gruppeOpenLeitungFormular(leitungId, presetId) {
    if (!assertCanEdit('Leitungen anlegen')) return;

    const preset = getLeitungPreset(presetId) || {};
    const leitung = leitungId ? findLeitung(leitungId) : null;
    const kategorie = leitung?.kategorie || preset.kategorie || '';

    gk.neuesLeitungFormular = {
        leitungId: leitungId || '',
        kategorie,
        hersteller: leitung?.hersteller || preset.hersteller || '',
        artikelnummer: leitung?.artikelnummer || leitung?.artikelCustom || preset.artikelnummer || '',
        beschreibung: '',
        steckerA: leitung?.steckerA || getFullSteckerTyp(preset.steckerA || '', preset.ausrichtungA) || '',
        steckerB: leitung?.steckerB || getFullSteckerTyp(preset.steckerB || '', preset.ausrichtungB) || '',
        laenge: leitung?.laenge || preset.laenge || '',
        meterware: istMeterwareKategorie(kategorie)
    };

    gk.neuesBauteilFormular = null;
    gk.pickerState = null;
    renderGruppenPanel();
    document.getElementById('neu-leitung-beschreibung')?.focus();
}


/**
 * Öffnet das Katalogformular mit den Werten der aktuellen Leitung.
 * @param {string} leitungId
 * @returns {void}
 */
export function gruppeOpenLeitungFormularAusLeitung(leitungId) {
    gruppeOpenLeitungFormular(leitungId, '');
}


/**
 * @returns {void}
 */
export function gruppeCancelLeitungFormular() {
    gk.neuesLeitungFormular = null;
    renderGruppenPanel();
}


/**
 * @param {string} kategorie
 * @returns {void}
 */
export function gruppeOnNeuLeitungKategorieChange(kategorie) {
    if (!gk.neuesLeitungFormular) return;
    gk.neuesLeitungFormular.kategorie = kategorie;
    gk.neuesLeitungFormular.meterware = istMeterwareKategorie(kategorie);
    renderGruppenPanel();
}


/**
 * @param {boolean} meterware
 * @returns {void}
 */
export function gruppeOnNeuLeitungMeterwareChange(meterware) {
    const laengeInput = document.getElementById('neu-leitung-laenge');
    if (laengeInput) laengeInput.disabled = meterware;
    if (gk.neuesLeitungFormular) gk.neuesLeitungFormular.meterware = meterware;
}


/**
 * Legt die Leitung im Katalog an und übernimmt sie in die aktuelle Gruppe.
 * @returns {Promise<void>}
 */
export async function gruppeSaveNeuesLeitung() {
    if (!gk.neuesLeitungFormular || !assertCanEdit('Leitungen anlegen')) return;

    const kategorie = document.getElementById('neu-leitung-kategorie')?.value?.trim() || '';
    const hersteller = document.getElementById('neu-leitung-hersteller')?.value?.trim() || '';
    const artikelnummer = document.getElementById('neu-leitung-artikelnummer')?.value?.trim() || '';
    let beschreibung = document.getElementById('neu-leitung-beschreibung')?.value?.trim() || '';
    const steckerA = document.getElementById('neu-leitung-stecker-a')?.value?.trim() || '';
    const steckerB = document.getElementById('neu-leitung-stecker-b')?.value?.trim() || '';
    const meterware = document.getElementById('neu-leitung-meterware')?.checked === true;
    const laengeRaw = document.getElementById('neu-leitung-laenge')?.value;

    if (!kategorie || !hersteller || !artikelnummer || !steckerA || !steckerB) {
        showModal('Bitte Leitungstyp, Hersteller, Artikelnummer und beide Stecker ausfüllen.', {
            type: 'warning',
            title: 'Eingabe unvollständig'
        });
        return;
    }

    let laenge = parseFloat(String(laengeRaw).replace(',', '.'));
    if (meterware) {
        laenge = 0;
    } else if (Number.isNaN(laenge) || laenge < 0) {
        showModal('Bitte eine gültige Länge eingeben (oder Meterware markieren).', {
            type: 'warning',
            title: 'Länge fehlt'
        });
        return;
    }

    if (!beschreibung) {
        beschreibung = bildeNeueLeitungBezeichnung({
            kategorie,
            hersteller,
            artikelnummer,
            steckerA,
            steckerB,
            laenge,
            meterware
        });
        const beschreibungFeld = document.getElementById('neu-leitung-beschreibung');
        if (beschreibungFeld) beschreibungFeld.value = beschreibung;
    }

    if (leitungsnummerVergeben(artikelnummer)) {
        showModal(`Artikelnummer ${artikelnummer} ist bereits im Katalog.`, {
            type: 'warning',
            title: 'Bereits vorhanden'
        });
        return;
    }

    const artikel = {
        hersteller,
        artikelnummer,
        beschreibung,
        steckerA,
        steckerB,
        laenge,
        kategorie,
        custom: true
    };
    if (meterware) artikel.meterware = true;

    try {
        await addLeitungZumKatalog(artikel);
    } catch (error) {
        showModal(`Speichern im Katalog fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
        return;
    }

    const zielLeitung = gk.neuesLeitungFormular.leitungId ? findLeitung(gk.neuesLeitungFormular.leitungId) : null;
    if (zielLeitung) {
        zielLeitung.kategorie = kategorie;
        zielLeitung.hersteller = hersteller;
        zielLeitung.steckerA = steckerA;
        zielLeitung.steckerB = steckerB;
        zielLeitung.laenge = laenge;
        zielLeitung.artikelnummer = artikelnummer;
        zielLeitung.artikelCustom = '';
        zielLeitung.bezeichnung = zielLeitung.bezeichnung || beschreibung;
        gk.aktiveLeitungId = zielLeitung.id;
    } else {
        const leitung = {
            id: generateId('ltg'),
            position: (appState.currentProjekt.leitungen || []).length + 1,
            bezeichnung: '',
            kategorie,
            gruppe: gk.aktiveGruppe,
            hersteller,
            artikelnummer,
            artikelCustom: '',
            laenge,
            steckerA,
            steckerB,
            notiz: '',
            anzahl: 1,
            erledigt: false
        };
        if (!appState.currentProjekt.leitungen) appState.currentProjekt.leitungen = [];
        appState.currentProjekt.leitungen.push(leitung);
        gk.aktiveLeitungId = leitung.id;
        renumberLeitungen();
    }

    gk.neuesLeitungFormular = null;
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereLeitungEditor();

    if (gk.aktiveLeitungId) gk.standardAngebotIds.add(gk.aktiveLeitungId);
    renderGruppenPanel();

    showModal(`${beschreibung} (${artikelnummer}) wurde im Katalog angelegt.`, {
        type: 'success',
        title: 'Leitung gespeichert'
    });
}
