/**
 * @file gk-eigene-buttons.js – Eigene Leitungs-Buttons (Gruppen-Presets) anlegen und verwalten.
 */
import { escapeHtml, jsArg } from './utils.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit } from './project-access.js';
import { getArtikelByNummer } from './catalog.js';
import {
    deriveArtikelPrefix,
    formatSteckerKurz,
    getHerstellerFuerKategorie,
    getKategorieName,
    getKategorien,
    getKonfektionierteKatalogArtikel,
    getMeterwareArtikel,
    getSteckerAOptionen,
    getSteckerBOptionen,
    istMeterwareKategorie,
    splitSteckerAngabe
} from './leitung-optionen.js';
import { getLeitungPreset } from './gruppen-config.js';
import { addCustomGruppenPreset, deleteCustomGruppenPreset, getCustomPresetIdsForGruppe, presetFromLeitung } from './gruppen-preset-store.js';
import { showModal } from './modal.js';
import { gk, findLeitung, optionen } from './gk-state.js';
import { renderGruppenPanel } from './gk-gruppen.js';


/**
 * @param {string} gruppenCode
 * @returns {object}
 */
function getDefaultEigenerButtonFormular(gruppenCode) {
    return {
        gruppeCode: gruppenCode || gk.aktiveGruppe,
        label: '',
        bezeichnung: '',
        kategorie: '',
        hersteller: '',
        vorgabeTyp: 'katalog',
        katalogSuche: '',
        katalogArtikelnummer: '',
        steckerLabel: '',
        artikelPrefix: '',
        artikelnummer: '',
        laenge: '',
        steckerA: '',
        steckerB: '',
        ausrichtungA: 'gerade',
        ausrichtungB: 'gerade',
        alleTypen: true,
        artikelWhitelist: []
    };
}


/**
 * Übernimmt Katalogdaten einer Leitung ins Button-Formular.
 * @param {object} form
 * @param {string} artikelnummer
 * @returns {boolean}
 */
function applyKatalogArtikelToButtonForm(form, artikelnummer) {
    const artikel = getArtikelByNummer(artikelnummer);
    if (!artikel || artikel.meterware) return false;

    const steckerA = splitSteckerAngabe(artikel.steckerA);
    const steckerB = splitSteckerAngabe(artikel.steckerB);

    form.katalogArtikelnummer = artikel.artikelnummer;
    form.katalogSuche = artikel.artikelnummer;
    form.kategorie = artikel.kategorie || form.kategorie;
    form.hersteller = artikel.hersteller || form.hersteller;
    form.artikelnummer = artikel.artikelnummer;
    form.artikelPrefix = deriveArtikelPrefix(artikel.artikelnummer);
    form.laenge = artikel.laenge || '';
    form.steckerA = steckerA.basis;
    form.steckerB = steckerB.basis;
    form.ausrichtungA = steckerA.ausrichtung;
    form.ausrichtungB = steckerB.ausrichtung;
    form.steckerLabel = `${formatSteckerKurz(artikel.steckerA)} → ${formatSteckerKurz(artikel.steckerB)}`;
    return true;
}


/**
 * @param {string} gruppenCode
 * @returns {string}
 */
function renderEigeneButtonVerwaltung(gruppenCode) {
    const customIds = getCustomPresetIdsForGruppe(gruppenCode);
    const customPresets = customIds.map(id => getLeitungPreset(id)).filter(Boolean);

    const liste = customPresets.length
        ? `<ul class="gruppen-eigene-button-liste">
            ${customPresets.map(preset => `
                <li>
                    <span>${escapeHtml(preset.label)} <span class="text-muted">(${escapeHtml(getKategorieName(preset.kategorie) || preset.kategorie)})</span></span>
                    <button type="button" class="btn btn-danger btn-small"
                            onclick="gruppeDeleteEigenerButton('${jsArg(preset.id)}')">Entfernen</button>
                </li>
            `).join('')}
           </ul>`
        : '<p class="text-muted gruppen-eigene-button-leer">Noch keine eigenen Standardleitungen für diese Gruppe.</p>';

    const formOpen = Boolean(gk.eigenerButtonFormular && gk.eigenerButtonFormular.gruppeCode === gruppenCode);

    return `
        <div class="gruppen-eigene-button-wrap">
            <h6>Selbst angelegte Standardleitungen</h6>
            <p class="text-muted">
                Gelten für alle Nutzer und alle Projekte und erscheinen mit ★ in den Vorschlägen dieser Gruppe.
            </p>
            ${liste}
            ${formOpen ? renderEigenerButtonFormular() : `
                <button type="button" class="btn btn-secondary btn-small"
                        onclick="gruppeOpenEigenerButtonFormular('${jsArg(gruppenCode)}')">
                    + Standardleitung anlegen
                </button>
            `}
        </div>
    `;
}


/**
 * @returns {string}
 */
function renderEigenerButtonFormular() {
    const form = gk.eigenerButtonFormular;
    if (!form) return '';

    const kategorieOptionen = getKategorien().map(k => ({ value: k.id, label: `${k.icon} ${k.name}` }));
    const herstellerOptionen = getHerstellerFuerKategorie(form.kategorie).map(h => ({ value: h, label: h }));
    const steckerAListe = getSteckerAOptionen(form.kategorie, form.hersteller);
    const steckerBListe = getSteckerBOptionen(form.kategorie, form.hersteller, form.steckerA);

    const meterwareTypen = istMeterwareKategorie(form.kategorie)
        ? getMeterwareArtikel(form.kategorie, form.hersteller)
        : [];

    const katalogArtikel = form.vorgabeTyp === 'katalog'
        ? getKonfektionierteKatalogArtikel({
            kategorie: form.kategorie || undefined,
            hersteller: form.hersteller || undefined,
            suche: form.katalogSuche
        })
        : [];

    const katalogFeld = form.vorgabeTyp === 'katalog'
        ? `<div class="form-group gruppen-karte-breit">
                <label>Katalog-Leitung *</label>
                <input type="text" value="${escapeHtml(form.katalogSuche || '')}"
                       list="gruppen-katalog-artikel-liste"
                       placeholder="Artikelnummer suchen, z. B. ZK2000-6200-0100"
                       oninput="gruppeOnEigenerButtonKatalogSuche(this.value)"
                       onchange="gruppeOnEigenerButtonKatalogArtikel(this.value)">
                <datalist id="gruppen-katalog-artikel-liste">
                    ${katalogArtikel.map(a => `
                        <option value="${escapeHtml(a.artikelnummer)}">${escapeHtml(a.beschreibung || a.artikelnummer)}</option>
                    `).join('')}
                </datalist>
                ${form.steckerLabel ? `
                    <p class="gruppen-preset-info text-muted">
                        ${escapeHtml(form.steckerLabel)}
                        · ${escapeHtml(form.hersteller || '')}
                        · Reihe ${escapeHtml(form.artikelPrefix || '')}
                        ${form.laenge ? ` · Standard ${escapeHtml(String(form.laenge))} m` : ''}
                    </p>
                ` : '<p class="text-muted">Stecker und Leitungsreihe werden aus dem Katalog übernommen.</p>'}
           </div>`
        : '';

    const whitelistFeld = form.vorgabeTyp === 'meterware' && meterwareTypen.length
        ? `<div class="form-group gruppen-karte-breit">
                <label>Katalog-Typen (optional einschränken)</label>
                <label class="admin-check">
                    <input type="checkbox" ${form.alleTypen ? 'checked' : ''}
                           onchange="gruppeOnEigenerButtonAlleTypen(this.checked)">
                    Alle Typen dieses Herstellers anbieten
                </label>
                ${form.alleTypen ? '' : `<div class="gruppen-whitelist-checks">
                    ${meterwareTypen.map(a => `
                        <label class="admin-check">
                            <input type="checkbox" value="${escapeHtml(a.artikelnummer)}"
                                   ${form.artikelWhitelist.includes(a.artikelnummer) ? 'checked' : ''}
                                   onchange="gruppeOnEigenerButtonWhitelistToggle(this.value, this.checked)">
                            ${escapeHtml(a.beschreibung || a.artikelnummer)}
                        </label>
                    `).join('')}
                </div>`}
           </div>`
        : '';

    const steckerFeld = form.vorgabeTyp === 'stecker'
        ? `<div class="form-group">
                <label>Stecker A</label>
                <select onchange="gruppeOnEigenerButtonField('steckerA', this.value)">
                    ${optionen([{ value: '', label: '-- Stecker A --' }, ...steckerAListe], form.steckerA)}
                </select>
           </div>
           <div class="form-group">
                <label>Stecker B</label>
                <select onchange="gruppeOnEigenerButtonField('steckerB', this.value)">
                    ${optionen([{ value: '', label: '-- Stecker B --' }, ...steckerBListe], form.steckerB)}
                </select>
           </div>`
        : '';

    return `
        <div class="gruppen-eigener-button-form">
            <h5>Neue Standardleitung anlegen</h5>
            <div class="gruppen-karte-grid">
                <div class="form-group">
                    <label>Name *</label>
                    <input type="text" value="${escapeHtml(form.label)}" placeholder="z. B. Zuleitung"
                           oninput="gruppeOnEigenerButtonField('label', this.value)">
                </div>
                <div class="form-group">
                    <label>Verwendung</label>
                    <input type="text" value="${escapeHtml(form.bezeichnung)}" placeholder="Optional, sonst wie der Name"
                           oninput="gruppeOnEigenerButtonField('bezeichnung', this.value)">
                </div>
                <div class="form-group">
                    <label>Leitungstyp</label>
                    <select onchange="gruppeOnEigenerButtonKategorieChange(this.value)">
                        ${optionen([{ value: '', label: '-- optional filtern --' }, ...kategorieOptionen], form.kategorie)}
                    </select>
                </div>
                <div class="form-group">
                    <label>Hersteller</label>
                    <select onchange="gruppeOnEigenerButtonHerstellerChange(this.value)">
                        ${optionen([{ value: '', label: '-- optional filtern --' }, ...herstellerOptionen], form.hersteller)}
                    </select>
                </div>
                <div class="form-group gruppen-karte-breit">
                    <label>Vorgabe</label>
                    <select onchange="gruppeOnEigenerButtonVorgabeTypChange(this.value)">
                        ${optionen([
                            { value: 'katalog', label: 'Leitung aus Katalog – Stecker und Längenreihe automatisch' },
                            { value: 'meterware', label: 'Meterware – Typ und Länge wählen (Ölflex, Motor, Geber)' },
                            { value: 'stecker', label: 'Stecker-Leitung – Stecker und Länge manuell wählen' },
                            { value: 'basic', label: 'Nur Kategorie/Hersteller vorgeben' }
                        ], form.vorgabeTyp)}
                    </select>
                </div>
                ${katalogFeld}
                ${steckerFeld}
                ${whitelistFeld}
            </div>
            <div class="gruppen-eigener-button-aktionen">
                <button type="button" class="btn btn-primary btn-small" onclick="gruppeSaveEigenerButton()">Standardleitung speichern</button>
                <button type="button" class="btn btn-secondary btn-small" onclick="gruppeCancelEigenerButtonFormular()">Abbrechen</button>
            </div>
        </div>
    `;
}


/**
 * @param {string} gruppenCode
 * @returns {void}
 */
export function gruppeOpenEigenerButtonFormular(gruppenCode) {
    if (!assertCanEdit('Standardleitungen anlegen')) return;
    gk.eigenerButtonFormular = getDefaultEigenerButtonFormular(gruppenCode);
    renderGruppenPanel();
}


/**
 * @returns {void}
 */
export function gruppeCancelEigenerButtonFormular() {
    gk.eigenerButtonFormular = null;
    renderGruppenPanel();
}


/**
 * @param {string} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeOnEigenerButtonField(feld, wert) {
    if (!gk.eigenerButtonFormular) return;
    gk.eigenerButtonFormular[feld] = wert;
}


/**
 * @param {string} kategorie
 * @returns {void}
 */
export function gruppeOnEigenerButtonKategorieChange(kategorie) {
    if (!gk.eigenerButtonFormular) return;
    gk.eigenerButtonFormular.kategorie = kategorie;
    if (kategorie && gk.eigenerButtonFormular.vorgabeTyp !== 'katalog') {
        const hersteller = getHerstellerFuerKategorie(kategorie);
        gk.eigenerButtonFormular.hersteller = hersteller[0] || '';
    }
    if (istMeterwareKategorie(kategorie) && gk.eigenerButtonFormular.vorgabeTyp === 'basic') {
        gk.eigenerButtonFormular.vorgabeTyp = 'meterware';
    }
    gk.eigenerButtonFormular.artikelWhitelist = [];
    clearKatalogAuswahlImButtonFormular();
    renderGruppenPanel();
}


/**
 * @param {string} hersteller
 * @returns {void}
 */
export function gruppeOnEigenerButtonHerstellerChange(hersteller) {
    if (!gk.eigenerButtonFormular) return;
    gk.eigenerButtonFormular.hersteller = hersteller;
    clearKatalogAuswahlImButtonFormular();
    renderGruppenPanel();
}


/**
 * Setzt die Katalog-Auswahl im Button-Formular zurück.
 * @returns {void}
 */
function clearKatalogAuswahlImButtonFormular() {
    if (!gk.eigenerButtonFormular) return;
    gk.eigenerButtonFormular.katalogArtikelnummer = '';
    gk.eigenerButtonFormular.steckerLabel = '';
    gk.eigenerButtonFormular.artikelPrefix = '';
    gk.eigenerButtonFormular.artikelnummer = '';
    gk.eigenerButtonFormular.laenge = '';
    gk.eigenerButtonFormular.steckerA = '';
    gk.eigenerButtonFormular.steckerB = '';
}


/**
 * @param {string} suche
 * @returns {void}
 */
export function gruppeOnEigenerButtonKatalogSuche(suche) {
    if (!gk.eigenerButtonFormular) return;
    gk.eigenerButtonFormular.katalogSuche = suche;
    if (getArtikelByNummer(suche.trim())) {
        applyKatalogArtikelToButtonForm(gk.eigenerButtonFormular, suche.trim());
    } else if (gk.eigenerButtonFormular.katalogArtikelnummer
        && suche.trim().toLowerCase() !== gk.eigenerButtonFormular.katalogArtikelnummer.toLowerCase()) {
        clearKatalogAuswahlImButtonFormular();
    }
    renderGruppenPanel();
}


/**
 * @param {string} artikelnummer
 * @returns {void}
 */
export function gruppeOnEigenerButtonKatalogArtikel(artikelnummer) {
    if (!gk.eigenerButtonFormular) return;
    const nr = (artikelnummer || '').trim();
    gk.eigenerButtonFormular.katalogSuche = nr;
    if (!nr) {
        clearKatalogAuswahlImButtonFormular();
        renderGruppenPanel();
        return;
    }
    if (!applyKatalogArtikelToButtonForm(gk.eigenerButtonFormular, nr)) {
        renderGruppenPanel();
        return;
    }
    renderGruppenPanel();
}


/**
 * @param {string} vorgabeTyp
 * @returns {void}
 */
export function gruppeOnEigenerButtonVorgabeTypChange(vorgabeTyp) {
    if (!gk.eigenerButtonFormular) return;
    gk.eigenerButtonFormular.vorgabeTyp = vorgabeTyp;
    clearKatalogAuswahlImButtonFormular();
    gk.eigenerButtonFormular.katalogSuche = '';
    renderGruppenPanel();
}


/**
 * @param {boolean} alle
 * @returns {void}
 */
export function gruppeOnEigenerButtonAlleTypen(alle) {
    if (!gk.eigenerButtonFormular) return;
    gk.eigenerButtonFormular.alleTypen = alle;
    if (alle) gk.eigenerButtonFormular.artikelWhitelist = [];
    renderGruppenPanel();
}


/**
 * @param {string} artikelnummer
 * @param {boolean} aktiv
 * @returns {void}
 */
export function gruppeOnEigenerButtonWhitelistToggle(artikelnummer, aktiv) {
    if (!gk.eigenerButtonFormular) return;
    const liste = new Set(gk.eigenerButtonFormular.artikelWhitelist || []);
    if (aktiv) liste.add(artikelnummer);
    else liste.delete(artikelnummer);
    gk.eigenerButtonFormular.artikelWhitelist = Array.from(liste);
    gk.eigenerButtonFormular.alleTypen = gk.eigenerButtonFormular.artikelWhitelist.length === 0;
}


/**
 * Baut aus dem Formular die Preset-Daten.
 * @returns {object}
 */
function buildPresetFromEigenerButtonFormular() {
    const form = gk.eigenerButtonFormular;
    const data = {
        label: form.label,
        bezeichnung: form.bezeichnung || form.label,
        kategorie: form.kategorie,
        hersteller: form.hersteller,
        vorgabeTyp: form.vorgabeTyp
    };

    if (form.vorgabeTyp === 'katalog' || form.vorgabeTyp === 'prefix') {
        data.artikelPrefix = form.artikelPrefix;
        data.artikelnummer = form.artikelnummer || '';
        if (form.laenge) data.laenge = Number(form.laenge);
        if (form.steckerA) {
            data.steckerA = form.steckerA;
            data.ausrichtungA = form.ausrichtungA || 'gerade';
        }
        if (form.steckerB) {
            data.steckerB = form.steckerB;
            data.ausrichtungB = form.ausrichtungB || 'gerade';
        }
    } else if (form.vorgabeTyp === 'meterware') {
        data.festLeitungstyp = true;
        if (!form.alleTypen && form.artikelWhitelist?.length) {
            data.artikelWhitelist = form.artikelWhitelist.slice();
        }
    } else if (form.vorgabeTyp === 'stecker') {
        data.steckerA = form.steckerA;
        data.steckerB = form.steckerB;
        data.ausrichtungA = form.ausrichtungA || 'gerade';
        data.ausrichtungB = form.ausrichtungB || 'gerade';
        if (form.laenge) data.laenge = Number(form.laenge);
    }

    return data;
}


/**
 * @returns {Promise<void>}
 */
export async function gruppeSaveEigenerButton() {
    if (!assertCanEdit('Standardleitungen speichern')) return;
    if (!gk.eigenerButtonFormular) return;

    try {
        const data = buildPresetFromEigenerButtonFormular();
        if ((data.vorgabeTyp === 'katalog' || data.vorgabeTyp === 'prefix') && !data.artikelPrefix) {
            await showModal('Bitte eine Leitung aus dem Katalog auswählen (z. B. ZK2000-6200-0100).', {
                type: 'warning',
                title: 'Angaben unvollständig'
            });
            return;
        }
        if (data.vorgabeTyp === 'katalog' && !data.kategorie) {
            await showModal('Die gewählte Katalog-Leitung konnte nicht zugeordnet werden.', {
                type: 'warning',
                title: 'Angaben unvollständig'
            });
            return;
        }
        await addCustomGruppenPreset(gk.eigenerButtonFormular.gruppeCode, data);
        gk.eigenerButtonFormular = null;
        renderGruppenPanel();
        await showModal('Die Standardleitung wird ab sofort in dieser Gruppe vorgeschlagen – auch in neuen Projekten.', {
            type: 'success',
            title: 'Standardleitung gespeichert'
        });
    } catch (error) {
        await showModal(error.message || 'Speichern fehlgeschlagen.', { type: 'danger', title: 'Fehler' });
    }
}


/**
 * @param {string} presetId
 * @returns {Promise<void>}
 */
export async function gruppeDeleteEigenerButton(presetId) {
    if (!assertCanEdit('Standardleitungen löschen')) return;
    const preset = getLeitungPreset(presetId);
    const confirmed = await showModal(
        preset ? `Standardleitung „“ wirklich entfernen?` : 'Diese Standardleitung wirklich entfernen?',
        { type: 'danger', title: 'Standardleitung entfernen', showCancel: true, confirmText: 'Entfernen', cancelText: 'Abbrechen' }
    );
    if (!confirmed) return;

    try {
        await deleteCustomGruppenPreset(presetId);
        renderGruppenPanel();
    } catch (error) {
        await showModal(error.message || 'Löschen fehlgeschlagen.', { type: 'danger', title: 'Fehler' });
    }
}


/**
 * @param {string} leitungId
 * @returns {Promise<void>}
 */
export async function gruppeSaveLeitungAlsButton(leitungId) {
    if (!assertCanEdit('Standardleitungen anlegen')) return;
    const leitung = findLeitung(leitungId);
    if (!leitung) return;

    const label = (leitung.bezeichnung || '').trim()
        || prompt('Name der Standardleitung:', leitung.bezeichnung || 'Eigene Leitung');
    if (!label) return;

    const gruppenCode = leitung.gruppe || gk.aktiveGruppe;
    try {
        const preset = presetFromLeitung(leitung, label.trim());
        leitung.presetId = await addCustomGruppenPreset(gruppenCode, preset);
        gk.standardAngebotIds.delete(leitungId);
        persistCurrentProjekt();
        renderGruppenPanel();
        await showModal(
            `„${label.trim()}“ wird in ${gruppenCode} ab sofort immer vorgeschlagen – auch in neuen Projekten.`,
            { type: 'success', title: 'Als Standard gemerkt' }
        );
    } catch (error) {
        await showModal(error.message || 'Speichern fehlgeschlagen.', { type: 'danger', title: 'Fehler' });
    }
}
