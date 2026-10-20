/**
 * @file gk-vorschlaege.js – Leitungssuche, Leitungs-/Bauteilvorschläge und Schnellwahl der Gruppe.
 */
import { escapeHtml, escapeAttr, jsArg, formatLaenge } from './utils.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit } from './project-access.js';
import { getArtikelByNummer, getBauteilTypName } from './catalog.js';
import { getFullSteckerTyp } from './stecker-utils.js';
import { formatSteckerKurz, getKategorieName, getLaengenOptionen, istMeterwareKategorie } from './leitung-optionen.js';
import { getGruppenVorgaben, getLeitungPreset } from './gruppen-config.js';
import {
    gk,
    getBauteileDerGruppe,
    getGruppe,
    getGruppenStatus,
    getLeitungenDerGruppe,
    istSchreibgeschuetzt
} from './gk-state.js';
import { renderGruppenListe, renderGruppenPanel, renderGruppenRahmen } from './gk-gruppen.js';
import { getArtikelAuswahlFuerGruppe, gruppeAddBauteil } from './gk-bauteile.js';
import { renderPickerErgebnisse, renderPickerFilter } from './gk-picker.js';
import { gruppeAddLeitung } from './gk-leitungen.js';


/**
 * Suchfeld über der Leitungstabelle; die Treffer klappen darunter auf.
 * @returns {string}
 */
export function renderLeitungSuche() {
    return `
        <div class="gk-suche" id="gk-suche">
            <label class="gk-suche-feld">
                <span class="gk-suche-slash" aria-hidden="true">/</span>
                <input type="search" id="gk-suche-input" autocomplete="off" spellcheck="false"
                       placeholder="Leitung suchen: M12 offen, ZK1090, Ölflex …"
                       aria-label="Leitung suchen und hinzufügen"
                       onfocus="gruppeSucheOeffnen()"
                       oninput="gruppeOnPickerSuche(this.value)"
                       onkeydown="gruppeOnPickerTaste(event)">
                <span class="gk-suche-treffer" id="gk-treffer"></span>
            </label>
            <div class="gk-dropdown" id="gk-dropdown" hidden>
                <div class="picker-filter" id="gk-filter"></div>
                <div class="picker-ergebnisse" id="gk-ergebnisse" onkeydown="gruppeOnPickerListeTaste(event)"></div>
                <div class="gk-dropdown-fuss">
                    <span class="picker-tipp">Länge anklicken = sofort übernehmen · ↑↓ ⏎ · Esc</span>
                    <button type="button" class="btn btn-secondary btn-small"
                            onclick="gruppeAddLeitungMitKategorie()">Selbst zusammenstellen</button>
                    <button type="button" class="btn btn-secondary btn-small"
                            onclick="gruppeOpenLeitungFormular('', '')">+ Neu im Katalog</button>
                </div>
            </div>
        </div>
    `;
}


/**
 * Öffnet bzw. aktualisiert die Trefferliste unter dem Suchfeld.
 * @returns {void}
 */
export function aktualisiereLeitungDropdown() {
    const dropdown = document.getElementById('gk-dropdown');
    if (!dropdown) return;

    const offen = gk.pickerState?.art === 'leitung';
    dropdown.hidden = !offen;
    document.getElementById('gk-suche')?.classList.toggle('offen', offen);
    const treffer = document.getElementById('gk-treffer');
    if (!offen) {
        if (treffer) treffer.textContent = '';
        return;
    }

    const filter = document.getElementById('gk-filter');
    if (filter) filter.innerHTML = renderPickerFilter();
    const ergebnisse = document.getElementById('gk-ergebnisse');
    if (ergebnisse) ergebnisse.innerHTML = renderPickerErgebnisse();

    if (treffer) {
        const anzahl = ergebnisse ? ergebnisse.querySelectorAll('.picker-eintrag').length : 0;
        treffer.textContent = gk.pickerState.suche.trim() || gk.pickerState.kategorie
            ? `${anzahl} Treffer`
            : '';
    }
}


/**
 * Fokus im Suchfeld: Trefferliste öffnen.
 * @returns {void}
 */
export function gruppeSucheOeffnen() {
    if (istSchreibgeschuetzt()) return;
    if (gk.pickerState?.art !== 'leitung') {
        const input = document.getElementById('gk-suche-input');
        gk.pickerState = { art: 'leitung', suche: input?.value || '', kategorie: '' };
    }
    aktualisiereLeitungDropdown();
}


/**
 * Vorschläge der Gruppe als Pillen unter der Tabelle – ein Klick übernimmt.
 * @param {object} gruppe
 * @returns {string}
 */
export function renderLeitungVorschlaege(gruppe) {
    const vorschlaege = getOffeneLeitungVorschlaege(gruppe.code);
    const ausgeblendet = renderLeitungVorschlaegeAktion();
    if (!vorschlaege.length && !ausgeblendet) return '';

    const pillen = vorschlaege.map(preset => {
        const id = jsArg(preset.id);
        // Ohne Katalog-Längen (Meterware) braucht es das Fenster für Typ und Länge.
        const imFenster = !getPresetLaengen(preset).length && istMeterwareKategorie(preset.kategorie);
        const laenge = Number(preset.laenge) > 0 ? ` · ${formatLaenge(preset.laenge)} m` : '';
        return `
            <span class="gk-vorschlag">
                <button type="button" title="${escapeAttr(getPresetBeschreibung(preset))}"
                        onclick="${imFenster ? `gruppeAddLeitung('${id}')` : `gruppeVorschlagUebernehmen('${id}', '')`}">
                    + ${escapeHtml(preset.label)}${laenge}
                </button>
                <button type="button" class="gk-vorschlag-weg" title="Vorschlag in diesem Projekt ausblenden"
                        aria-label="Vorschlag ausblenden" onclick="gruppeVorschlagAusblenden('${id}')">×</button>
            </span>
        `;
    }).join('');

    return `
        <div class="gk-vorschlaege">
            <span class="gk-label">Typisch für ${escapeHtml(gruppe.bezeichnung)}</span>
            ${pillen}
            ${vorschlaege.length > 1 ? `<button type="button" class="gk-link"
                    onclick="gruppeAlleVorschlaegeUebernehmen()">Alle übernehmen</button>` : ''}
            ${ausgeblendet}
        </div>
    `;
}


/* -------------------------------------------------------------------------- */
/* Gruppenstatus                                                               */
/* -------------------------------------------------------------------------- */

/**
 * @param {boolean} checked
 * @returns {void}
 */
export function toggleGruppeNichtBenoetigt(checked) {
    if (!assertCanEdit('Gruppen ändern')) return;
    getGruppenStatus(gk.aktiveGruppe).nichtBenoetigt = Boolean(checked);
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenRahmen();
}


/* -------------------------------------------------------------------------- */
/* Bauteile                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Einstellungen zum Ein-/Ausblenden von Bauteil-Vorschlägen je Gruppe.
 * @param {string[]} alleTypen
 * @returns {string}
 */
function renderBauteilSchnellwahlEinstellungen(alleTypen) {
    if (!alleTypen.length) return '';

    const ausgeblendet = new Set(getGruppenStatus(gk.aktiveGruppe).ausgeblendeteBauteilTypen || []);
    const checks = alleTypen.map(typ => {
        const name = getBauteilTypName(typ);
        return `
            <label class="admin-check gruppen-schnellwahl-check">
                <input type="checkbox"${ausgeblendet.has(typ) ? '' : ' checked'}
                       onchange="toggleBauteilTypSchnellwahl('${jsArg(typ)}', this.checked)">
                ${escapeHtml(name)}
            </label>
        `;
    }).join('');

    return `
        <div class="gruppen-schnellwahl-block">
            <h6>Vorgeschlagene Bauteile (${ausgeblendet.size} ausgeblendet)</h6>
            <p class="text-muted">
                Abgewählte Typen werden in dieser Gruppe nicht mehr vorgeschlagen.
                Über „+ Bauteil“ bleiben sie auffindbar. Gilt nur für dieses Projekt.
            </p>
            <div class="gruppen-schnellwahl-checks">${checks}</div>
        </div>
    `;
}


/**
 * Blendet einen Bauteiltyp in der Schnellwahl ein oder aus.
 * @param {string} typ
 * @param {boolean} sichtbar
 * @returns {void}
 */
export function toggleBauteilTypSchnellwahl(typ, sichtbar) {
    if (!assertCanEdit('Schnellwahl anpassen')) return;

    const status = getGruppenStatus(gk.aktiveGruppe);
    let ausgeblendet = [...(status.ausgeblendeteBauteilTypen || [])];

    if (sichtbar) {
        ausgeblendet = ausgeblendet.filter(id => id !== typ);
    } else if (!ausgeblendet.includes(typ)) {
        ausgeblendet.push(typ);
    }

    status.ausgeblendeteBauteilTypen = ausgeblendet;
    persistCurrentProjekt();
    renderGruppenPanel();
}






/**
 * Aktion für ausgeblendete Leitungsvorschläge neben der Abschnittsüberschrift.
 * @returns {string}
 */
function renderLeitungVorschlaegeAktion() {
    const ausgeblendet = getGruppenStatus(gk.aktiveGruppe).ausgeblendeteLeitungPresets.length;
    if (!ausgeblendet) return '';

    return `<button type="button" class="btn btn-secondary btn-small"
                    onclick="gruppeVorschlaegeZuruecksetzen()">
                ${ausgeblendet === 1 ? '1 ausgeblendeten Vorschlag' : `${ausgeblendet} ausgeblendete Vorschläge`} einblenden
            </button>`;
}


/**
 * Bauteiltypen der Gruppe, die noch nicht erfasst und nicht ausgeblendet sind.
 * @param {string} code
 * @returns {string[]}
 */
export function getOffeneBauteilVorschlaege(code) {
    const gruppe = getGruppe(code);
    if (!gruppe || istSchreibgeschuetzt()) return [];

    const erfasst = new Set(getBauteileDerGruppe(code).map(b => b.typ));
    const ausgeblendet = new Set(getGruppenStatus(code).ausgeblendeteBauteilTypen || []);
    return getGruppenVorgaben(gruppe).standardBauteilTypen
        .filter(typ => !erfasst.has(typ) && !ausgeblendet.has(typ));
}




/**
 * Übernimmt einen vorgeschlagenen Bauteiltyp, optional mit Länge.
 * Bei mehreren Katalogartikeln öffnet sich die Auswahl statt den ersten zu nehmen.
 * Sonst landet das Bauteil direkt in der Liste – ohne Editor.
 * @param {string} typ
 * @param {string|number} laenge
 * @returns {void}
 */
export function gruppeBauteilVorschlagUebernehmen(typ, laenge) {
    if (!assertCanEdit('Bauteile hinzufügen')) return;
    const wert = parseFloat(String(laenge).replace(',', '.'));
    const mitLaenge = !Number.isNaN(wert) && wert > 0;

    if (!mitLaenge && getArtikelAuswahlFuerGruppe(typ).length > 1) {
        gk.pickerState = { art: 'bauteil', suche: '', typFilter: typ };
        renderGruppenPanel();
        document.getElementById('picker-suche')?.focus();
        return;
    }

    gruppeAddBauteil(typ, {
        laenge: mitLaenge ? wert : undefined,
        direkt: true
    });
}


/**
 * Kurzbeschreibung der Ausführung für die Übersichtstabelle.
 * @param {object} leitung
 * @returns {string}
 */
export function getLeitungAusfuehrung(leitung) {
    const artikel = getArtikelByNummer(leitung.artikelnummer);
    if (artikel?.beschreibung) return artikel.beschreibung;

    const stecker = [leitung.steckerA, leitung.steckerB].filter(Boolean);
    return stecker.length ? stecker.join(' → ') : '–';
}


/* -------------------------------------------------------------------------- */
/* Standardleitungen als Vorschlagszeilen                                      */
/* -------------------------------------------------------------------------- */

/**
 * Presets mit Artikelreihe (z. B. ZK1090-3131) dürfen mehrfach erfasst werden –
 * in der Praxis braucht man oft viele gleiche Steckerpaare in unterschiedlichen Längen.
 * @param {object} preset
 * @returns {boolean}
 */
export function presetMehrfachMoeglich(preset) {
    return Boolean(preset?.artikelPrefix);
}


/**
 * Prüft, ob eine Standardleitung in dieser Gruppe schon erfasst ist.
 * Ältere Projekte kennen `presetId` noch nicht, daher der Rückfall auf Reihe und Bezeichnung.
 * @param {object} preset
 * @param {object[]} leitungen
 * @returns {boolean}
 */
export function presetIstErfasst(preset, leitungen) {
    if (presetMehrfachMoeglich(preset)) return false;

    const label = (preset.bezeichnung || preset.label || '').trim().toLowerCase();
    return leitungen.some(leitung => {
        if (leitung.presetId) return leitung.presetId === preset.id;
        if (preset.artikelPrefix && leitung.artikelPrefix) {
            return leitung.artikelPrefix === preset.artikelPrefix;
        }
        return Boolean(label) && (leitung.bezeichnung || '').trim().toLowerCase() === label;
    });
}


/**
 * Standardleitungen der Gruppe, die noch nicht erfasst und nicht ausgeblendet sind.
 * @param {string} code
 * @returns {object[]}
 */
export function getOffeneLeitungVorschlaege(code) {
    const gruppe = getGruppe(code);
    if (!gruppe || istSchreibgeschuetzt()) return [];

    const leitungen = getLeitungenDerGruppe(code);
    const ausgeblendet = new Set(getGruppenStatus(code).ausgeblendeteLeitungPresets);
    return getGruppenVorgaben(gruppe).standardLeitungen
        .filter(preset => !ausgeblendet.has(preset.id) && !presetIstErfasst(preset, leitungen));
}


/**
 * Katalog-Längen, die es zu einem Preset gibt.
 * Bei bekannter Artikelreihe: zuerst mit Steckern, sonst nur über die Reihe
 * (sonst erscheint fälschlich „im Formular“, wenn die Steckerangabe nicht exakt passt).
 * @param {object} preset
 * @returns {number[]}
 */
export function getPresetLaengen(preset) {
    if (!preset.kategorie || istMeterwareKategorie(preset.kategorie) || preset.festLeitungstyp) return [];

    const steckerA = getFullSteckerTyp(preset.steckerA || '', preset.ausrichtungA);
    const steckerB = getFullSteckerTyp(preset.steckerB || '', preset.ausrichtungB);
    if (!preset.artikelPrefix && !(steckerA && steckerB)) return [];

    const mitSteckern = getLaengenOptionen(
        preset.kategorie, preset.hersteller, steckerA, steckerB, preset.artikelPrefix
    );
    if (mitSteckern.length || !preset.artikelPrefix) return mitSteckern;

    return getLaengenOptionen(preset.kategorie, preset.hersteller, '', '', preset.artikelPrefix);
}


/**
 * Kurzbeschreibung eines Presets für Vorschlagszeilen und Auswahldialog.
 * @param {object} preset
 * @returns {string}
 */
export function getPresetBeschreibung(preset) {
    const teile = [];
    if (preset.steckerA || preset.steckerB) {
        const steckerA = getFullSteckerTyp(preset.steckerA || '', preset.ausrichtungA) || preset.steckerA;
        const steckerB = getFullSteckerTyp(preset.steckerB || '', preset.ausrichtungB) || preset.steckerB;
        teile.push(`${formatSteckerKurz(steckerA)} → ${formatSteckerKurz(steckerB)}`);
    }
    if (preset.hersteller) teile.push(preset.hersteller);
    if (preset.artikelPrefix) teile.push(`Reihe ${preset.artikelPrefix}`);
    else if (istMeterwareKategorie(preset.kategorie)) teile.push('Meterware – Typ und Länge wählen');
    return teile.join(' · ') || getKategorieName(preset.kategorie) || 'Frei konfigurierbar';
}




/**
 * Legt eine Standardleitung an und belässt sie in der Liste (ohne Editor).
 * Ohne gewählte Länge wird die Preset-Standardlänge verwendet.
 * @param {string} presetId
 * @param {string|number} laenge
 * @returns {void}
 */
export function gruppeVorschlagUebernehmen(presetId, laenge) {
    if (!assertCanEdit('Leitungen hinzufügen')) return;
    const preset = getLeitungPreset(presetId) || {};
    let wert = parseFloat(String(laenge ?? '').replace(',', '.'));
    if (Number.isNaN(wert) || wert <= 0) {
        wert = Number(preset.laenge) || 0;
    }
    gruppeAddLeitung(presetId, {
        laenge: wert,
        direkt: true
    });
}


/**
 * Blendet eine Standardleitung für dieses Projekt aus.
 * @param {string} presetId
 * @returns {void}
 */
export function gruppeVorschlagAusblenden(presetId) {
    if (!assertCanEdit('Vorschläge ausblenden')) return;
    const status = getGruppenStatus(gk.aktiveGruppe);
    if (!status.ausgeblendeteLeitungPresets.includes(presetId)) {
        status.ausgeblendeteLeitungPresets.push(presetId);
    }
    persistCurrentProjekt();
    renderGruppenPanel();
}


/**
 * Holt alle ausgeblendeten Standardleitungen der Gruppe zurück.
 * @returns {void}
 */
export function gruppeVorschlaegeZuruecksetzen() {
    if (!assertCanEdit('Vorschläge einblenden')) return;
    getGruppenStatus(gk.aktiveGruppe).ausgeblendeteLeitungPresets = [];
    persistCurrentProjekt();
    renderGruppenPanel();
}


/**
 * Übernimmt alle offenen Standardleitungen mit ihrer Standardlänge.
 * @returns {void}
 */
export function gruppeAlleVorschlaegeUebernehmen() {
    if (!assertCanEdit('Leitungen hinzufügen')) return;
    getOffeneLeitungVorschlaege(gk.aktiveGruppe).forEach(preset => {
        gruppeAddLeitung(preset.id, { laenge: preset.laenge || 0, direkt: true, stillsam: true });
    });
    renderGruppenListe();
    renderGruppenPanel();
}
