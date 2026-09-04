/**
 * @file gruppen-konfigurator.js – Konfiguration des Schaltplans entlang der Gruppen.
 *
 * Statt einzelner Assistenten-Fragen wird hier je Gruppe (=001, =004, …) direkt
 * gearbeitet: Leitungen und Bauteile werden als Karten hinzugefügt und sofort gespeichert.
 */
import { appState } from './state.js';
import { escapeHtml, generateId } from './utils.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit, canEditProject } from './project-access.js';
import {
    getArtikelByNummer,
    getBauteilTypName,
    getBauteileFuerGruppenAuswahl,
    bauteilPasstZuGruppe
} from './catalog.js';
import { getBaseSteckerTyp, getFullSteckerTyp, hasAusrichtung } from './stecker-utils.js';
import {
    findArtikel,
    deriveArtikelPrefix,
    formatSteckerKurz,
    getHerstellerFuerKategorie,
    getKategorieName,
    getKategorien,
    getKonfektionierteKatalogArtikel,
    getLaengenOptionen,
    getMeterwareArtikel,
    getPassendeArtikel,
    getSteckerAOptionen,
    getSteckerBOptionen,
    istMeterwareKategorie,
    splitSteckerAngabe
} from './leitung-optionen.js';
import { getGruppenVorgaben, getLeitungPreset } from './gruppen-config.js';
import {
    addCustomGruppenPreset,
    deleteCustomGruppenPreset,
    getCustomPresetIdsForGruppe,
    presetFromLeitung
} from './gruppen-preset-store.js';
import { addBauteilZumKatalog, addLeitungZumKatalog, bauteilnummerVergeben, leitungsnummerVergeben, bildePlatzhalterNummer } from './katalog-additions.js';
import { compareGruppenCode, getAlleGruppenFuerProjekt, normalizeGruppenCode } from './overview.js';
import { showModal } from './modal.js';

/** Code der aktuell geöffneten Gruppe. */
let aktiveGruppe = '';
/** Suchtext der Gruppenliste. */
let gruppenSuche = '';
/** Leitungen, bei denen die Länge frei eingegeben statt aus dem Katalog gewählt wird. */
const freieLaengeIds = new Set();
/** Leitung, die gerade im Formular unter der Übersicht bearbeitet wird. */
let aktiveLeitungId = '';
/** Bauteil, das gerade im Formular unter der Übersicht bearbeitet wird. */
let aktivesBauteilId = '';
/**
 * Offenes Formular für ein noch nicht katalogisiertes Bauteil.
 * @type {{bauteilId: string, typ: string}|null}
 */
let neuesBauteilFormular = null;
/**
 * Offenes Formular für eine noch nicht katalogisierte Leitung.
 * @type {{leitungId: string, kategorie: string, hersteller: string, artikelnummer: string, beschreibung: string, steckerA: string, steckerB: string, laenge: string|number, meterware: boolean}|null}
 */
let neuesLeitungFormular = null;
/**
 * Offenes Formular für einen eigenen Leitungs-Button.
 * @type {object|null}
 */
let eigenerButtonFormular = null;


/**
 * @returns {boolean}
 */
function istSchreibgeschuetzt() {
    return !canEditProject(appState.currentProjekt);
}


/**
 * @returns {object[]}
 */
function getGruppen() {
    return getAlleGruppenFuerProjekt(appState.currentProjekt);
}


/**
 * @param {string} code
 * @returns {object|null}
 */
function getGruppe(code) {
    return getGruppen().find(g => g.code === code) || null;
}


/**
 * @param {string} code
 * @returns {object}
 */
function getGruppenStatus(code) {
    const projekt = appState.currentProjekt;
    if (!projekt) return {};
    if (!projekt.gruppenStatus) projekt.gruppenStatus = {};
    if (!projekt.gruppenStatus[code]) {
        projekt.gruppenStatus[code] = { nichtBenoetigt: false, notiz: '', ausgeblendeteBauteilTypen: [] };
    }
    if (!Array.isArray(projekt.gruppenStatus[code].ausgeblendeteBauteilTypen)) {
        projekt.gruppenStatus[code].ausgeblendeteBauteilTypen = [];
    }
    return projekt.gruppenStatus[code];
}


/**
 * @param {string} code
 * @returns {object[]}
 */
function getLeitungenDerGruppe(code) {
    return (appState.currentProjekt?.leitungen || []).filter(l => l.gruppe === code);
}


/**
 * @param {string} code
 * @returns {object[]}
 */
function getBauteileDerGruppe(code) {
    return (appState.currentProjekt?.bauteile || []).filter(b => b.gruppe === code);
}


/**
 * @param {string} id
 * @returns {object|null}
 */
function findLeitung(id) {
    return (appState.currentProjekt?.leitungen || []).find(l => l.id === id) || null;
}


/**
 * @param {string} id
 * @returns {object|null}
 */
function findBauteil(id) {
    return (appState.currentProjekt?.bauteile || []).find(b => b.id === id) || null;
}


/**
 * @returns {void}
 */
function renumberLeitungen() {
    (appState.currentProjekt?.leitungen || []).forEach((l, i) => { l.position = i + 1; });
}


/**
 * @param {number} wert
 * @returns {string}
 */
function formatLaenge(wert) {
    if (!wert) return '';
    return String(wert).replace('.', ',');
}


/**
 * Baut Options-Markup für ein Select.
 * @param {Array<string|number|{value: string, label: string}>} werte
 * @param {string|number} selected
 * @returns {string}
 */
function optionen(werte, selected) {
    const aktuell = selected === null || selected === undefined ? '' : String(selected);
    return werte.map(eintrag => {
        const value = typeof eintrag === 'object' ? eintrag.value : eintrag;
        const label = typeof eintrag === 'object' ? eintrag.label : eintrag;
        const istAktiv = String(value) === aktuell
            || (Number(value) === Number(selected) && !Number.isNaN(Number(value)))
            ? ' selected'
            : '';
        return `<option value="${escapeHtml(String(value))}"${istAktiv}>${escapeHtml(String(label))}</option>`;
    }).join('');
}


/* -------------------------------------------------------------------------- */
/* View                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Baut die komplette Ansicht auf.
 * @returns {void}
 */
export function renderGruppenKonfigurator() {
    const projekt = appState.currentProjekt;
    const titel = document.getElementById('gruppen-titel');

    if (!projekt) {
        if (titel) titel.textContent = 'Gruppen-Konfigurator';
        const main = document.getElementById('gruppen-main');
        if (main) main.innerHTML = '<div class="form-card"><p class="text-muted">Bitte zuerst ein Projekt öffnen.</p></div>';
        return;
    }

    if (!projekt.gruppenStatus) projekt.gruppenStatus = {};
    if (!projekt.leitungen) projekt.leitungen = [];
    if (!projekt.bauteile) projekt.bauteile = [];
    if (!Array.isArray(projekt.zusaetzlicheGruppen)) projekt.zusaetzlicheGruppen = [];

    if (titel) {
        titel.textContent = `Gruppen-Konfigurator – ${projekt.projektnummer || ''} ${projekt.name || ''}`.trim();
    }

    if (!getGruppe(aktiveGruppe)) {
        aktiveGruppe = getGruppen()[0]?.code || '';
    }

    renderGruppenListe();
    renderGruppenPanel();
}


/**
 * Zeichnet die Gruppenliste in der Seitenleiste.
 * @returns {void}
 */
function renderGruppenListe() {
    const container = document.getElementById('gruppen-liste');
    if (!container) return;

    const suche = gruppenSuche.trim().toLowerCase();
    const gruppen = getGruppen().filter(g => {
        if (!suche) return true;
        return `${g.code} ${g.bezeichnung}`.toLowerCase().includes(suche);
    });

    if (!gruppen.length) {
        container.innerHTML = '<p class="text-muted gruppen-leer">Keine Gruppe gefunden.</p>';
        return;
    }

    container.innerHTML = gruppen.map(gruppe => {
        const anzLeitungen = getLeitungenDerGruppe(gruppe.code).length;
        const anzBauteile = getBauteileDerGruppe(gruppe.code).length;
        const status = appState.currentProjekt?.gruppenStatus?.[gruppe.code];
        const klassen = ['gruppen-listen-eintrag'];
        if (gruppe.code === aktiveGruppe) klassen.push('active');
        if (status?.nichtBenoetigt) klassen.push('entfaellt');
        if (anzLeitungen || anzBauteile) klassen.push('befuellt');

        const badges = [];
        if (anzLeitungen) badges.push(`<span class="gruppen-badge leitung">${anzLeitungen} Ltg.</span>`);
        if (anzBauteile) badges.push(`<span class="gruppen-badge bauteil">${anzBauteile} Btl.</span>`);
        if (status?.nichtBenoetigt) badges.push('<span class="gruppen-badge entfaellt">entfällt</span>');
        if (gruppe.custom) badges.push('<span class="gruppen-badge zusaetzlich">Zusatz</span>');

        return `
            <button type="button" class="${klassen.join(' ')}" onclick="selectGruppe('${escapeHtml(gruppe.code)}')">
                <span class="gruppen-code">${escapeHtml(gruppe.code)}</span>
                <span class="gruppen-name">${escapeHtml(gruppe.bezeichnung)}</span>
                <span class="gruppen-badges">${badges.join('')}</span>
            </button>
        `;
    }).join('');

    updateGruppenNeuFormular();
}


/**
 * Blendet das Formular für Zusatzgruppen je nach Schreibrecht ein/aus.
 * @returns {void}
 */
function updateGruppenNeuFormular() {
    const wrap = document.getElementById('gruppen-neu-form-wrap');
    if (!wrap) return;
    wrap.hidden = istSchreibgeschuetzt();
}


/**
 * Legt eine projektspezifische Zusatzgruppe an.
 * @returns {void}
 */
export function gruppeSaveNeueGruppe() {
    if (!assertCanEdit('Zusatzgruppen anlegen')) return;

    const projekt = appState.currentProjekt;
    if (!projekt) return;

    const nummerRaw = document.getElementById('gruppen-neu-nummer')?.value?.trim() || '';
    const bezeichnung = document.getElementById('gruppen-neu-bezeichnung')?.value?.trim() || '';

    if (!nummerRaw || !bezeichnung) {
        showModal('Bitte Gruppennummer und Bezeichnung eingeben.', {
            type: 'warning',
            title: 'Eingabe unvollständig'
        });
        return;
    }

    const code = normalizeGruppenCode(nummerRaw);
    if (!/^=\d+$/.test(code)) {
        showModal('Die Gruppennummer muss numerisch sein (z. B. 050 oder =050).', {
            type: 'warning',
            title: 'Ungültige Nummer'
        });
        return;
    }

    if (getGruppe(code)) {
        showModal(`Gruppe ${code} ist bereits vorhanden.`, {
            type: 'warning',
            title: 'Bereits vorhanden'
        });
        return;
    }

    if (!Array.isArray(projekt.zusaetzlicheGruppen)) projekt.zusaetzlicheGruppen = [];
    projekt.zusaetzlicheGruppen.push({
        code,
        bezeichnung,
        label: `${code} ${bezeichnung}`,
        custom: true
    });
    projekt.zusaetzlicheGruppen.sort((a, b) => compareGruppenCode(a.code, b.code));

    persistCurrentProjekt();
    aktiveGruppe = code;

    document.getElementById('gruppen-neu-nummer').value = '';
    document.getElementById('gruppen-neu-bezeichnung').value = '';

    renderGruppenListe();
    renderGruppenPanel();
    showModal(`Gruppe ${code} ${bezeichnung} wurde angelegt.`, {
        type: 'success',
        title: 'Gruppe erstellt'
    });
}


/**
 * Entfernt eine projektspezifische Zusatzgruppe inkl. zugehöriger Bauteile und Leitungen.
 * @returns {Promise<void>}
 */
export async function gruppeDeleteZusaetzlicheGruppe() {
    if (!assertCanEdit('Zusatzgruppen entfernen')) return;

    const projekt = appState.currentProjekt;
    const gruppe = getGruppe(aktiveGruppe);
    if (!projekt || !gruppe?.custom) return;

    const leitungen = getLeitungenDerGruppe(gruppe.code);
    const bauteile = getBauteileDerGruppe(gruppe.code);
    const teile = [];
    if (bauteile.length) {
        teile.push(`${bauteile.length} Bauteil${bauteile.length === 1 ? '' : 'e'}`);
    }
    if (leitungen.length) {
        teile.push(`${leitungen.length} Leitung${leitungen.length === 1 ? '' : 'en'}`);
    }

    let message = `Zusatzgruppe ${gruppe.code} ${gruppe.bezeichnung} wirklich entfernen?`;
    if (teile.length) {
        message += `\n\nDabei werden auch ${teile.join(' und ')} aus dem Projekt gelöscht.`;
    }

    const confirmed = await showModal(message, {
        type: 'warning',
        title: 'Gruppe entfernen',
        confirmText: 'Entfernen',
        cancelText: 'Abbrechen',
        showCancel: true
    });
    if (!confirmed) return;

    if (bauteile.length) {
        const bauteilIds = new Set(bauteile.map(b => b.id));
        projekt.bauteile = (projekt.bauteile || []).filter(b => !bauteilIds.has(b.id));
    }

    if (leitungen.length) {
        const leitungIds = new Set(leitungen.map(l => l.id));
        projekt.leitungen = (projekt.leitungen || []).filter(l => !leitungIds.has(l.id));
        leitungen.forEach(l => freieLaengeIds.delete(l.id));
        renumberLeitungen();
    }

    projekt.zusaetzlicheGruppen = (projekt.zusaetzlicheGruppen || [])
        .filter(g => g.code !== gruppe.code);
    delete projekt.gruppenStatus?.[gruppe.code];

    const verbleibend = getGruppen();
    aktiveGruppe = verbleibend[0]?.code || '';

    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();

    const hinweis = teile.length
        ? `Zusatzgruppe und ${teile.join(' sowie ')} wurden entfernt.`
        : 'Zusatzgruppe wurde entfernt.';
    showModal(hinweis, { type: 'success', title: 'Entfernt' });
}


/**
 * @returns {void}
 */
export function filterGruppenListe() {
    gruppenSuche = document.getElementById('gruppen-suche')?.value || '';
    renderGruppenListe();
}


/**
 * @param {string} code
 * @returns {void}
 */
export function selectGruppe(code) {
    aktiveGruppe = code;
    aktiveLeitungId = '';
    aktivesBauteilId = '';
    neuesBauteilFormular = null;
    neuesLeitungFormular = null;
    renderGruppenListe();
    renderGruppenPanel();
    document.getElementById('gruppen-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/**
 * Springt zur vorherigen oder nächsten Gruppe.
 * @param {number} richtung
 * @returns {void}
 */
export function gruppeWechseln(richtung) {
    const gruppen = getGruppen();
    const index = gruppen.findIndex(g => g.code === aktiveGruppe);
    const ziel = gruppen[index + richtung];
    if (ziel) selectGruppe(ziel.code);
}


/**
 * Zeichnet das Panel der aktiven Gruppe.
 * @returns {void}
 */
function renderGruppenPanel() {
    const main = document.getElementById('gruppen-main');
    if (!main) return;

    const gruppe = getGruppe(aktiveGruppe);
    if (!gruppe) {
        main.innerHTML = '<div class="form-card"><p class="text-muted">Keine Gruppe ausgewählt.</p></div>';
        return;
    }

    const vorgaben = getGruppenVorgaben(gruppe);
    const status = getGruppenStatus(gruppe.code);
    const leitungen = getLeitungenDerGruppe(gruppe.code);
    const bauteile = getBauteileDerGruppe(gruppe.code);
    const gesperrt = istSchreibgeschuetzt();
    const disabled = gesperrt ? ' disabled' : '';

    const gruppen = getGruppen();
    const index = gruppen.findIndex(g => g.code === gruppe.code);
    const zeigeBauteile = !vorgaben.nurLeitungen || bauteile.length > 0;
    const zeigeLeitungen = !vorgaben.nurBauteile || leitungen.length > 0;

    main.innerHTML = `
        <div class="form-card gruppen-panel">
            <div class="gruppen-panel-kopf">
                <div>
                    <span class="gruppen-panel-code">${escapeHtml(gruppe.code)}</span>
                    <h3>${escapeHtml(gruppe.bezeichnung)}${gruppe.custom ? ' <span class="gruppen-badge zusaetzlich">Zusatzgruppe</span>' : ''}</h3>
                </div>
                <div class="gruppen-panel-meta">
                    <span class="gruppen-panel-position">Gruppe ${index + 1} von ${gruppen.length}</span>
                    ${!gesperrt && gruppe.custom ? `<button type="button" class="btn btn-danger btn-small" onclick="gruppeDeleteZusaetzlicheGruppe()">Gruppe entfernen</button>` : ''}
                </div>
            </div>

            ${vorgaben.hinweis ? `<p class="gruppen-hinweis">${escapeHtml(vorgaben.hinweis)}</p>` : ''}

            <label class="wizard-skip-label gruppen-entfaellt-label">
                <input type="checkbox" id="gruppen-nicht-benoetigt"
                       ${status.nichtBenoetigt ? 'checked' : ''}${disabled}
                       onchange="toggleGruppeNichtBenoetigt(this.checked)">
                Für dieses Projekt nicht benötigt
            </label>

            <div class="form-group">
                <label for="gruppen-notiz">Notiz zur Gruppe</label>
                <textarea id="gruppen-notiz" rows="2" placeholder="Optionale Bemerkung…"${disabled}
                          oninput="updateGruppeNotiz(this.value)">${escapeHtml(status.notiz || '')}</textarea>
            </div>

            ${zeigeBauteile ? `
            <div class="gruppen-abschnitt">
                <div class="gruppen-abschnitt-kopf">
                    <h4>Bauteile <span class="gruppen-anzahl">${bauteile.length}</span></h4>
                </div>
                <div id="gruppen-bauteile-tabelle">${renderBauteilTabelle(bauteile)}</div>
                ${gesperrt ? '' : renderBauteilButtons(getSichtbareBauteilTypen(vorgaben.bauteilTypen))}
                ${gesperrt ? '' : renderBauteilSchnellwahlEinstellungen(vorgaben.bauteilTypen)}
                ${gesperrt ? '' : renderNeuesBauteilFormular()}
                <div id="gruppen-bauteil-editor">${renderBauteilEditor()}</div>
            </div>
            ` : ''}

            ${zeigeLeitungen ? `
            <div class="gruppen-abschnitt">
                <div class="gruppen-abschnitt-kopf">
                    <h4>Leitungen <span class="gruppen-anzahl">${leitungen.length}</span></h4>
                </div>
                <div id="gruppen-leitungen-tabelle">${renderLeitungTabelle(leitungen)}</div>
                ${gesperrt ? '' : renderLeitungButtons(vorgaben.leitungPresets)}
                ${gesperrt ? '' : renderEigeneButtonVerwaltung(gruppe.code)}
                ${gesperrt ? '' : renderNeuesLeitungFormular()}
                <div id="gruppen-leitung-editor">${renderLeitungEditor()}</div>
            </div>
            ` : ''}

            <div class="form-actions gruppen-nav">
                <button type="button" class="btn btn-secondary" onclick="gruppeWechseln(-1)"${index <= 0 ? ' disabled' : ''}>
                    ← Vorherige Gruppe
                </button>
                <button type="button" class="btn btn-secondary" onclick="showView('uebersicht')">Zur Übersicht</button>
                <button type="button" class="btn btn-primary" onclick="gruppeWechseln(1)"${index >= gruppen.length - 1 ? ' disabled' : ''}>
                    Nächste Gruppe →
                </button>
            </div>
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
    getGruppenStatus(aktiveGruppe).nichtBenoetigt = Boolean(checked);
    persistCurrentProjekt();
    renderGruppenListe();
}


/**
 * @param {string} wert
 * @returns {void}
 */
export function updateGruppeNotiz(wert) {
    if (istSchreibgeschuetzt()) return;
    getGruppenStatus(aktiveGruppe).notiz = wert;
    persistCurrentProjekt();
}


/* -------------------------------------------------------------------------- */
/* Bauteile                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Bauteiltypen, die in der Schnellwahl dieser Gruppe sichtbar sind.
 * @param {string[]} alleTypen
 * @returns {string[]}
 */
function getSichtbareBauteilTypen(alleTypen) {
    const ausgeblendet = new Set(getGruppenStatus(aktiveGruppe).ausgeblendeteBauteilTypen || []);
    return (alleTypen || []).filter(typ => !ausgeblendet.has(typ));
}


/**
 * Einstellungen zum Ein-/Ausblenden von Schnellwahl-Buttons je Gruppe.
 * @param {string[]} alleTypen
 * @returns {string}
 */
function renderBauteilSchnellwahlEinstellungen(alleTypen) {
    if (!alleTypen.length) return '';

    const vorgaben = getGruppenVorgaben(getGruppe(aktiveGruppe));
    if (vorgaben.nurFestgelegteBauteile && vorgaben.nurBauteile) return '';

    const ausgeblendet = new Set(getGruppenStatus(aktiveGruppe).ausgeblendeteBauteilTypen || []);
    const checks = alleTypen.map(typ => {
        const name = getBauteilTypName(typ);
        return `
            <label class="admin-check gruppen-schnellwahl-check">
                <input type="checkbox"${ausgeblendet.has(typ) ? '' : ' checked'}
                       onchange="toggleBauteilTypSchnellwahl('${escapeHtml(typ)}', this.checked)">
                ${escapeHtml(name)}
            </label>
        `;
    }).join('');

    return `
        <details class="gruppen-schnellwahl-details">
            <summary>Schnellwahl anpassen (${ausgeblendet.size} ausgeblendet)</summary>
            <p class="text-muted">
                Abgewählte Typen erscheinen nicht mehr als +‑Button in dieser Gruppe.
                Über „+ Anderes Bauteil" sind sie weiterhin verfügbar. Gilt nur für dieses Projekt.
            </p>
            <div class="gruppen-schnellwahl-checks">${checks}</div>
        </details>
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

    const status = getGruppenStatus(aktiveGruppe);
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
 * @param {string[]} typen
 * @returns {string}
 */
function renderBauteilButtons(typen) {
    const vorgaben = getGruppenVorgaben(getGruppe(aktiveGruppe));
    const nurFest = vorgaben.nurFestgelegteBauteile && vorgaben.nurBauteile;

    const schnellwahl = typen.map(typ => `
        <button type="button" class="btn btn-success btn-small" onclick="gruppeAddBauteil('${escapeHtml(typ)}')">
            + ${escapeHtml(getBauteilTypName(typ))}
        </button>
    `).join('');

    return `<div class="gruppen-add-buttons gruppen-add-buttons-unten">
        <span class="gruppen-add-hinweis">Bauteil hinzufügen:</span>
        ${schnellwahl}
        ${nurFest ? '' : `
        <button type="button" class="btn btn-secondary btn-small" onclick="gruppeAddBauteil('')">+ Anderes Bauteil</button>
        <button type="button" class="btn btn-primary btn-small" onclick="gruppeOpenBauteilFormular('', '')">➕ Bauteil neu anlegen</button>
        `}
    </div>`;
}


/**
 * Formular für ein Bauteil, das es noch nicht im Katalog gibt.
 * @returns {string}
 */
function renderNeuesBauteilFormular() {
    if (!neuesBauteilFormular) return '';

    const typen = appState.bauteileKatalog?.bauteiltypen || [];
    const hersteller = Array.from(new Set(
        (appState.bauteileKatalog?.artikel || []).map(a => a.hersteller).filter(Boolean)
    )).sort((x, y) => x.localeCompare(y, 'de'));
    const zielBauteil = neuesBauteilFormular.bauteilId ? findBauteil(neuesBauteilFormular.bauteilId) : null;
    const vorauswahlTyp = neuesBauteilFormular.typ || '';

    return `
        <div class="gruppen-karte bauteil-neu-formular">
            <h5>Neues Bauteil anlegen</h5>
            <p class="text-muted">
                Das Bauteil wird in den Katalog übernommen und steht danach in jedem Projekt zur Verfügung.
                ${zielBauteil ? 'Es wird direkt der bearbeiteten Position zugeordnet.' : ''}
                ${vorauswahlTyp && !zielBauteil ? ` Typ „${escapeHtml(getBauteilTypName(vorauswahlTyp))}" ist noch nicht im Katalog – bitte Artikeldaten ergänzen.` : ''}
            </p>

            <div class="gruppen-karte-grid">
                <div class="form-group">
                    <label for="neu-bauteil-typ">Bauteiltyp *</label>
                    <select id="neu-bauteil-typ" onchange="gruppeOnNeuBauteilTypChange(this.value)">
                        ${optionen([
                            { value: '', label: '-- Bitte wählen --' },
                            ...typen.map(t => ({ value: t.id, label: t.name })),
                            { value: '__neu__', label: '➕ Neuer Bauteiltyp…' }
                        ], neuesBauteilFormular.typ)}
                    </select>
                </div>
                <div class="form-group" id="neu-bauteil-typ-neu-group" hidden>
                    <label for="neu-bauteil-typ-neu">Name des neuen Typs *</label>
                    <input type="text" id="neu-bauteil-typ-neu" placeholder="z. B. Sicherheitsrelais">
                </div>
                <div class="form-group">
                    <label for="neu-bauteil-hersteller">Hersteller *</label>
                    <input type="text" id="neu-bauteil-hersteller" list="neu-bauteil-hersteller-liste" placeholder="z. B. Pilz">
                    <datalist id="neu-bauteil-hersteller-liste">
                        ${hersteller.map(h => `<option value="${escapeHtml(h)}"></option>`).join('')}
                    </datalist>
                </div>
                <div class="form-group">
                    <label for="neu-bauteil-artikelnummer">Artikelnummer</label>
                    <input type="text" id="neu-bauteil-artikelnummer" placeholder="Leer lassen, wenn noch unbekannt">
                </div>
                <div class="form-group gruppen-karte-breit">
                    <label for="neu-bauteil-beschreibung">Bezeichnung *</label>
                    <input type="text" id="neu-bauteil-beschreibung" placeholder="z. B. Sicherheitsrelais PNOZ s3">
                </div>
                <div class="form-group">
                    <label for="neu-bauteil-lieferant">Lieferant</label>
                    <input type="text" id="neu-bauteil-lieferant" placeholder="optional">
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="gruppeCancelBauteilFormular()">Abbrechen</button>
                <button type="button" class="btn btn-primary" onclick="gruppeSaveNeuesBauteil()">In Katalog speichern &amp; übernehmen</button>
            </div>
        </div>
    `;
}


/**
 * Öffnet das Anlageformular, optional für eine bestehende Position.
 * @param {string} bauteilId
 * @param {string} typ
 * @returns {void}
 */
export function gruppeOpenBauteilFormular(bauteilId, typ) {
    if (!assertCanEdit('Bauteile anlegen')) return;
    neuesBauteilFormular = { bauteilId: bauteilId || '', typ: typ || '' };
    neuesLeitungFormular = null;
    renderGruppenPanel();

    const select = document.getElementById('neu-bauteil-typ');
    gruppeOnNeuBauteilTypChange(select?.value || '');
    document.getElementById('neu-bauteil-beschreibung')?.focus();
}


/**
 * @returns {void}
 */
export function gruppeCancelBauteilFormular() {
    neuesBauteilFormular = null;
    renderGruppenPanel();
}


/**
 * Blendet das Feld für einen neuen Bauteiltyp ein.
 * @param {string} wert
 * @returns {void}
 */
export function gruppeOnNeuBauteilTypChange(wert) {
    const gruppe = document.getElementById('neu-bauteil-typ-neu-group');
    if (gruppe) gruppe.hidden = wert !== '__neu__';
    if (wert === '__neu__') document.getElementById('neu-bauteil-typ-neu')?.focus();
}


/**
 * Legt das Bauteil im Katalog an und übernimmt es in die aktuelle Gruppe.
 * @returns {Promise<void>}
 */
export async function gruppeSaveNeuesBauteil() {
    if (!neuesBauteilFormular || !assertCanEdit('Bauteile anlegen')) return;

    const typAuswahl = document.getElementById('neu-bauteil-typ')?.value || '';
    const typName = document.getElementById('neu-bauteil-typ-neu')?.value?.trim() || '';
    const hersteller = document.getElementById('neu-bauteil-hersteller')?.value?.trim() || '';
    const beschreibung = document.getElementById('neu-bauteil-beschreibung')?.value?.trim() || '';
    const lieferant = document.getElementById('neu-bauteil-lieferant')?.value?.trim() || '';
    let artikelnummer = document.getElementById('neu-bauteil-artikelnummer')?.value?.trim() || '';

    const typ = typAuswahl === '__neu__' ? typName.toLowerCase().replace(/\s+/g, '-') : typAuswahl;
    if (!typ || !hersteller || !beschreibung) {
        showModal('Bitte Bauteiltyp, Hersteller und Bezeichnung ausfüllen.', {
            type: 'warning',
            title: 'Eingabe unvollständig'
        });
        return;
    }

    const istPlatzhalter = !artikelnummer;
    if (istPlatzhalter) {
        artikelnummer = bildePlatzhalterNummer(typ, beschreibung);
    } else if (bauteilnummerVergeben(artikelnummer)) {
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
        typ,
        typName: typAuswahl === '__neu__' ? typName : undefined,
        gruppe: aktiveGruppe.replace('=', ''),
        custom: true
    };
    if (lieferant) artikel.lieferant = lieferant;
    if (istPlatzhalter) artikel.placeholder = true;
    if (!artikel.typName) delete artikel.typName;

    try {
        await addBauteilZumKatalog(artikel);
    } catch (error) {
        showModal(`Speichern im Katalog fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
        return;
    }

    const zielBauteil = neuesBauteilFormular.bauteilId ? findBauteil(neuesBauteilFormular.bauteilId) : null;
    if (zielBauteil) {
        zielBauteil.typ = typ;
        zielBauteil.hersteller = hersteller;
        zielBauteil.artikelnummer = artikelnummer;
        zielBauteil.bezeichnung = beschreibung;
        aktivesBauteilId = zielBauteil.id;
    } else {
        const bauteil = {
            id: generateId('btl'),
            gruppe: aktiveGruppe,
            typ,
            hersteller,
            artikelnummer,
            bezeichnung: beschreibung,
            notiz: '',
            anzahl: 1
        };
        appState.currentProjekt.bauteile.push(bauteil);
        aktivesBauteilId = bauteil.id;
    }

    neuesBauteilFormular = null;
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();

    showModal(
        istPlatzhalter
            ? `${beschreibung} wurde mit der Platzhalter-Nummer ${artikelnummer} im Katalog angelegt.`
            : `${beschreibung} (${artikelnummer}) wurde im Katalog angelegt.`,
        { type: 'success', title: 'Bauteil gespeichert' }
    );
}


/**
 * Kurzbezeichnung eines Bauteils für Listen und Dialoge.
 * @param {object} bauteil
 * @returns {string}
 */
function getBauteilLabel(bauteil) {
    const basis = bauteil.bezeichnung
        || bauteil.artikelnummer
        || getBauteilTypName(bauteil.typ)
        || 'Bauteil';
    if (bauteil.laenge) {
        return `${basis} (${formatLaenge(bauteil.laenge)} m)`;
    }
    return basis;
}


/**
 * Übersicht aller Bauteile der Gruppe als Tabelle.
 * @param {object[]} bauteile
 * @returns {string}
 */
function renderBauteilTabelle(bauteile) {
    if (!bauteile.length) {
        return '<p class="text-muted gruppen-leer">Noch keine Bauteile. Unten ein Bauteil hinzufügen.</p>';
    }

    const gesperrt = istSchreibgeschuetzt();
    const zeilen = bauteile.map((bauteil, index) => {
        const id = escapeHtml(bauteil.id);
        const typName = getBauteilTypName(bauteil.typ);
        const zusatz = [typName, bauteil.notiz].filter(Boolean).join(' · ');
        const klassen = [];
        if (bauteil.id === aktivesBauteilId) klassen.push('aktiv');
        if (!bauteil.artikelnummer) klassen.push('unvollstaendig');

        return `
            <tr class="${klassen.join(' ')}" title="Doppelklick zum Bearbeiten"
                ondblclick="gruppeEditBauteil('${id}')">
                <td class="leitung-tabelle-nr">${index + 1}</td>
                <td>
                    <span class="leitung-tabelle-verwendung">${escapeHtml(getBauteilLabel(bauteil))}</span>
                    ${zusatz ? `<span class="leitung-tabelle-typ">${escapeHtml(zusatz)}</span>` : ''}
                </td>
                <td class="leitung-tabelle-artikel">${escapeHtml(bauteil.artikelnummer || 'offen')}</td>
                <td class="leitung-tabelle-anzahl">${bauteil.anzahl || 1}×</td>
                <td class="leitung-tabelle-aktionen">
                    <div class="table-actions">
                    <button type="button" class="btn btn-secondary btn-small btn-icon" title="Bauteil bearbeiten"
                            onclick="gruppeEditBauteil('${id}')">✏️</button>
                    ${gesperrt ? '' : `
                        <button type="button" class="btn btn-danger btn-small btn-icon" title="Bauteil entfernen"
                                onclick="gruppeDeleteBauteil('${id}')">🗑️</button>
                    `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const gesamt = bauteile.reduce((summe, b) => summe + (b.anzahl || 1), 0);

    return `
        <div class="table-container gruppen-tabelle-container">
            <table class="leitung-table leitung-tabelle">
                <thead>
                    <tr>
                        <th>Nr.</th>
                        <th>Bauteil / Verwendung</th>
                        <th>Artikelnr.</th>
                        <th>Anz.</th>
                        <th class="leitung-tabelle-aktionen">Aktionen</th>
                    </tr>
                </thead>
                <tbody>${zeilen}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="3">Gesamt</td>
                        <td class="leitung-tabelle-anzahl">${gesamt}×</td>
                        <td class="leitung-tabelle-aktionen"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
}


/**
 * Zeichnet nur die Bauteilübersicht neu.
 * @returns {void}
 */
function aktualisiereBauteilTabelle() {
    const container = document.getElementById('gruppen-bauteile-tabelle');
    if (container) container.innerHTML = renderBauteilTabelle(getBauteileDerGruppe(aktiveGruppe));
}


/**
 * Formular für das gerade ausgewählte Bauteil. Es ist immer nur eines geöffnet.
 * @returns {string}
 */
function renderBauteilEditor() {
    const bauteil = aktivesBauteilId ? findBauteil(aktivesBauteilId) : null;
    if (!bauteil || bauteil.gruppe !== aktiveGruppe) return '';
    return renderBauteilKarte(bauteil);
}


/**
 * Springt zum Bauteilformular und setzt den Cursor ins Verwendungsfeld.
 * @returns {void}
 */
function fokussiereBauteilEditor() {
    const karte = document.getElementById(`bauteil-karte-${aktivesBauteilId}`);
    if (!karte) return;

    karte.scrollIntoView({ behavior: 'smooth', block: 'center' });
    karte.classList.add('gerade-angelegt');
}


/**
 * Öffnet ein bestehendes Bauteil im Formular.
 * @param {string} id
 * @returns {void}
 */
export function gruppeEditBauteil(id) {
    if (!findBauteil(id)) return;
    aktivesBauteilId = id;
    renderGruppenPanel();
    fokussiereBauteilEditor();
}


/**
 * Schließt das Bauteilformular, das Bauteil bleibt in der Übersicht.
 * @returns {void}
 */
export function gruppeCloseBauteilEditor() {
    aktivesBauteilId = '';
    renderGruppenPanel();
}


/**
 * @param {object} bauteil
 * @returns {string}
 */
function renderBauteilKarte(bauteil) {
    const gesperrt = istSchreibgeschuetzt();
    const disabled = gesperrt ? ' disabled' : '';
    const vorgaben = getGruppenVorgaben(getGruppe(bauteil.gruppe));
    const laengen = vorgaben.bauteilLaengen || [];

    if (laengen.length) {
        return renderBauteilKarteMitLaenge(bauteil, laengen, disabled, gesperrt);
    }

    const typen = getTypenFuerGruppe(aktiveGruppe);
    const artikelliste = bauteil.typ
        ? getArtikelAuswahlFuerGruppe(bauteil.typ, bauteil.artikelnummer)
        : [];

    const artikelOptionen = [
        { value: '', label: artikelliste.length ? '-- Bitte wählen --' : '-- Kein Katalogartikel --' },
        ...artikelliste.map(a => ({
            value: a.artikelnummer,
            label: `${a.beschreibung}${a.hersteller ? ` (${a.hersteller})` : ''}${a.projektOnly ? ' · im Projekt' : ''}`
        })),
        { value: '__neu__', label: '➕ Bauteil neu anlegen…' }
    ];

    const nummer = getBauteileDerGruppe(bauteil.gruppe).findIndex(b => b.id === bauteil.id) + 1;

    return `
        <div class="gruppen-karte bauteil-karte" id="bauteil-karte-${escapeHtml(bauteil.id)}">
            <div class="gruppen-karte-kopf">
                <strong class="gruppen-karte-titel">Bauteil ${nummer} bearbeiten</strong>
                <div class="leitung-karte-aktionen">
                    ${gesperrt ? '' : `<button type="button" class="btn btn-danger btn-small"
                        onclick="gruppeDeleteBauteil('${escapeHtml(bauteil.id)}')">Entfernen</button>`}
                    <button type="button" class="btn btn-primary btn-small" title="Bearbeitung beenden"
                            onclick="gruppeCloseBauteilEditor()">Fertig</button>
                </div>
            </div>
            <div class="gruppen-karte-grid">
                <div class="form-group">
                    <label>Bauteiltyp</label>
                    <select${disabled} onchange="gruppeUpdateBauteil('${escapeHtml(bauteil.id)}', 'typ', this.value)">
                        ${optionen([{ value: '', label: '-- Bitte wählen --' },
                            ...typen.map(t => ({ value: t.id, label: t.name }))], bauteil.typ)}
                    </select>
                </div>
                <div class="form-group gruppen-karte-breit">
                    <label>Artikel</label>
                    <select${disabled} onchange="gruppeUpdateBauteil('${escapeHtml(bauteil.id)}', 'artikelnummer', this.value)">
                        ${optionen(artikelOptionen, bauteil.artikelnummer)}
                    </select>
                </div>
                <div class="form-group gruppen-karte-anzahl">
                    <label>Anzahl</label>
                    <input type="number" min="1" step="1" value="${bauteil.anzahl || 1}"${disabled}
                           onchange="gruppeUpdateBauteil('${escapeHtml(bauteil.id)}', 'anzahl', this.value)">
                </div>
            </div>
            <div class="form-group">
                <label>Verwendung / Kommentar</label>
                <input type="text" value="${escapeHtml(bauteil.notiz || '')}" placeholder="z. B. Bedienpult links"${disabled}
                       oninput="gruppeUpdateBauteilText('${escapeHtml(bauteil.id)}', 'notiz', this.value)">
            </div>
            ${bauteil.artikelnummer ? `<p class="gruppen-karte-artikel">${escapeHtml(bauteil.bezeichnung || '')}
                <strong>${escapeHtml(bauteil.artikelnummer)}</strong></p>` : ''}
        </div>
    `;
}


/**
 * Vereinfachte Bauteil-Karte mit fester Artikelwahl und Längenauswahl (z. B. DMS).
 * @param {object} bauteil
 * @param {number[]} laengen
 * @param {string} disabled
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderBauteilKarteMitLaenge(bauteil, laengen, disabled, gesperrt) {
    const id = escapeHtml(bauteil.id);
    const nummer = getBauteileDerGruppe(bauteil.gruppe).findIndex(b => b.id === bauteil.id) + 1;
    const typName = getBauteilTypName(bauteil.typ);
    const artikelLabel = bauteil.bezeichnung
        ? `${bauteil.bezeichnung} (${bauteil.artikelnummer || ''})`
        : (bauteil.artikelnummer || typName);

    return `
        <div class="gruppen-karte bauteil-karte" id="bauteil-karte-${id}">
            <div class="gruppen-karte-kopf">
                <strong class="gruppen-karte-titel">Bauteil ${nummer} bearbeiten</strong>
                <div class="leitung-karte-aktionen">
                    ${gesperrt ? '' : `<button type="button" class="btn btn-danger btn-small"
                        onclick="gruppeDeleteBauteil('${id}')">Entfernen</button>`}
                    <button type="button" class="btn btn-primary btn-small" title="Bearbeitung beenden"
                            onclick="gruppeCloseBauteilEditor()">Fertig</button>
                </div>
            </div>
            <div class="gruppen-karte-grid">
                <div class="form-group gruppen-karte-breit">
                    <label>Bauteil</label>
                    <p class="gruppen-preset-info text-muted">${escapeHtml(typName)} · ${escapeHtml(artikelLabel)}</p>
                </div>
                <div class="form-group">
                    <label>Länge</label>
                    <select${disabled} onchange="gruppeUpdateBauteil('${id}', 'laenge', this.value)">
                        ${optionen(laengen.map(l => ({ value: l, label: `${formatLaenge(l)} m` })), bauteil.laenge || '')}
                    </select>
                </div>
                <div class="form-group gruppen-karte-anzahl">
                    <label>Anzahl</label>
                    <input type="number" min="1" step="1" value="${bauteil.anzahl || 1}"${disabled}
                           onchange="gruppeUpdateBauteil('${id}', 'anzahl', this.value)">
                </div>
            </div>
            <div class="form-group">
                <label>Verwendung / Kommentar</label>
                <input type="text" value="${escapeHtml(bauteil.notiz || '')}" placeholder="z. B. Kraftsensor Stößel"${disabled}
                       oninput="gruppeUpdateBauteilText('${id}', 'notiz', this.value)">
            </div>
        </div>
    `;
}


function getProjektBauteile() {
    return appState.currentProjekt?.bauteile || [];
}


/**
 * Optionen für die Artikelauswahl im Gruppen-Konfigurator.
 * @param {string} typ
 * @param {string} [aktuelleArtikelnummer]
 * @returns {object[]}
 */
function getArtikelAuswahlFuerGruppe(typ, aktuelleArtikelnummer = '') {
    return getBauteileFuerGruppenAuswahl(typ, aktiveGruppe, {
        projektBauteile: getProjektBauteile(),
        aktuelleArtikelnummer
    });
}


/**
 * Bauteiltypen, die für eine Gruppe im Katalog hinterlegt sind.
 * @param {string} gruppeCode
 * @returns {{ id: string, name: string }[]}
 */
function getTypenFuerGruppe(gruppeCode) {
    const vorgaben = getGruppenVorgaben(getGruppe(gruppeCode));
    const ids = new Set(vorgaben.bauteilTypen || []);
    (appState.bauteileKatalog?.artikel || []).forEach(artikel => {
        if (artikel.typ && bauteilPasstZuGruppe(artikel, gruppeCode)) {
            ids.add(artikel.typ);
        }
    });
    getProjektBauteile().forEach(b => {
        if (b.typ && b.gruppe === gruppeCode) ids.add(b.typ);
    });

    const alleTypen = appState.bauteileKatalog?.bauteiltypen || [];
    return Array.from(ids)
        .map(id => alleTypen.find(t => t.id === id) || { id, name: getBauteilTypName(id) })
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}


/**
 * @param {string} typ
 * @returns {void}
 */
export function gruppeAddBauteil(typ) {
    if (!assertCanEdit('Bauteile hinzufügen')) return;
    if (!appState.currentProjekt.bauteile) appState.currentProjekt.bauteile = [];

    if (typ) {
        const artikelListe = getArtikelAuswahlFuerGruppe(typ);
        if (!artikelListe.length) {
            const bauteil = {
                id: generateId('btl'),
                gruppe: aktiveGruppe,
                typ,
                hersteller: '',
                artikelnummer: '',
                bezeichnung: '',
                notiz: '',
                anzahl: 1
            };
            appState.currentProjekt.bauteile.push(bauteil);
            persistCurrentProjekt();
            gruppeOpenBauteilFormular(bauteil.id, typ);
            return;
        }
    }

    const artikel = typ ? getArtikelAuswahlFuerGruppe(typ)[0] : null;
    const vorgaben = getGruppenVorgaben(getGruppe(aktiveGruppe));
    const standardLaenge = vorgaben.bauteilStandardLaenge
        ?? vorgaben.bauteilLaengen?.[0]
        ?? undefined;

    const bauteil = {
        id: generateId('btl'),
        gruppe: aktiveGruppe,
        typ: typ || '',
        hersteller: artikel?.hersteller || '',
        artikelnummer: artikel?.artikelnummer || '',
        bezeichnung: artikel?.beschreibung || '',
        notiz: '',
        anzahl: 1,
        laenge: standardLaenge
    };
    appState.currentProjekt.bauteile.push(bauteil);

    persistCurrentProjekt();
    aktivesBauteilId = bauteil.id;
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereBauteilEditor();
}


/**
 * Ändert ein Auswahlfeld eines Bauteils und zeichnet die Karte neu.
 * @param {string} id
 * @param {string} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeUpdateBauteil(id, feld, wert) {
    const bauteil = findBauteil(id);
    if (!bauteil || istSchreibgeschuetzt()) return;

    if (feld === 'artikelnummer' && wert === '__neu__') {
        gruppeOpenBauteilFormular(id, bauteil.typ);
        return;
    }

    if (feld === 'typ') {
        bauteil.typ = wert;
        const artikelListe = getArtikelAuswahlFuerGruppe(wert);
        if (wert && !artikelListe.length) {
            persistCurrentProjekt();
            gruppeOpenBauteilFormular(id, wert);
            return;
        }
        const artikel = artikelListe[0] || null;
        bauteil.artikelnummer = artikel?.artikelnummer || '';
        bauteil.hersteller = artikel?.hersteller || '';
        bauteil.bezeichnung = artikel?.beschreibung || '';
    } else if (feld === 'artikelnummer') {
        const artikel = getArtikelAuswahlFuerGruppe(bauteil.typ, bauteil.artikelnummer)
            .find(a => a.artikelnummer === wert) || null;
        bauteil.artikelnummer = wert;
        bauteil.hersteller = artikel?.hersteller || bauteil.hersteller;
        bauteil.bezeichnung = artikel?.beschreibung || bauteil.bezeichnung;
    } else if (feld === 'anzahl') {
        const anzahl = parseInt(wert, 10);
        bauteil.anzahl = Number.isNaN(anzahl) || anzahl < 1 ? 1 : anzahl;
    } else if (feld === 'laenge') {
        bauteil.laenge = parseFloat(String(wert).replace(',', '.')) || 0;
    }

    persistCurrentProjekt();
    ersetzeKarte(`bauteil-karte-${id}`, renderBauteilKarte(bauteil));
    aktualisiereBauteilTabelle();
}


/**
 * Übernimmt Texteingaben, ohne die Karte neu zu zeichnen.
 * @param {string} id
 * @param {string} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeUpdateBauteilText(id, feld, wert) {
    const bauteil = findBauteil(id);
    if (!bauteil || istSchreibgeschuetzt()) return;
    bauteil[feld] = wert;
    persistCurrentProjekt();
    aktualisiereBauteilTabelle();
}


/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function gruppeDeleteBauteil(id) {
    if (!assertCanEdit('Bauteile löschen')) return;
    const liste = appState.currentProjekt?.bauteile || [];
    const bauteil = liste.find(b => b.id === id);
    if (!bauteil) return;

    const label = getBauteilLabel(bauteil);
    const confirmed = await showModal(
        `${label} wirklich aus der Gruppe entfernen?`,
        { type: 'warning', title: 'Bauteil entfernen', confirmText: 'Entfernen', cancelText: 'Abbrechen', showCancel: true }
    );
    if (!confirmed) return;

    const index = liste.findIndex(b => b.id === id);
    if (index === -1) return;

    liste.splice(index, 1);
    if (aktivesBauteilId === id) aktivesBauteilId = '';
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();
}


/* -------------------------------------------------------------------------- */
/* Leitungen                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @param {object[]} presets
 * @returns {string}
 */
function renderLeitungButtons(presets) {
    const buttons = presets.map((preset, i) => {
        const eigen = preset.custom ? ' title="Eigener Button"' : '';
        const klasse = preset.custom ? 'btn-secondary gruppen-btn-eigen' : (i === 0 ? 'btn-success' : 'btn-secondary');
        return `
        <button type="button" class="btn ${klasse} btn-small"${eigen}
                onclick="gruppeAddLeitung('${escapeHtml(preset.id)}')">
            + ${escapeHtml(preset.label)}${preset.custom ? ' ★' : ''}
        </button>
    `;
    }).join('');

    return `<div class="gruppen-add-buttons gruppen-add-buttons-unten">
        <span class="gruppen-add-hinweis">Leitung hinzufügen:</span>
        ${buttons}
        <button type="button" class="btn btn-secondary btn-small" onclick="gruppeAddLeitung('')">+ Leere Leitung</button>
        <button type="button" class="btn btn-primary btn-small" onclick="gruppeOpenLeitungFormular('', '')">➕ Leitung neu anlegen</button>
    </div>`;
}


/**
 * @param {string} gruppenCode
 * @returns {object}
 */
function getDefaultEigenerButtonFormular(gruppenCode) {
    return {
        gruppeCode: gruppenCode || aktiveGruppe,
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
                            onclick="gruppeDeleteEigenerButton('${escapeHtml(preset.id)}')">Entfernen</button>
                </li>
            `).join('')}
           </ul>`
        : '<p class="text-muted gruppen-eigene-button-leer">Noch keine eigenen Buttons für diese Gruppe.</p>';

    const formOpen = Boolean(eigenerButtonFormular && eigenerButtonFormular.gruppeCode === gruppenCode);

    return `
        <details class="gruppen-eigene-button-wrap"${formOpen ? ' open' : ''}>
            <summary>Eigene Buttons verwalten</summary>
            <p class="text-muted">Eigene Buttons gelten für alle Nutzer und erscheinen mit ★ neben den Standard-Buttons.</p>
            ${liste}
            ${formOpen ? renderEigenerButtonFormular() : `
                <button type="button" class="btn btn-secondary btn-small"
                        onclick="gruppeOpenEigenerButtonFormular('${escapeHtml(gruppenCode)}')">
                    + Eigenen Button anlegen
                </button>
            `}
        </details>
    `;
}


/**
 * @returns {string}
 */
function renderEigenerButtonFormular() {
    const form = eigenerButtonFormular;
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
            <h5>Neuen Button anlegen</h5>
            <div class="gruppen-karte-grid">
                <div class="form-group">
                    <label>Button-Name *</label>
                    <input type="text" value="${escapeHtml(form.label)}" placeholder="z. B. Zuleitung"
                           oninput="gruppeOnEigenerButtonField('label', this.value)">
                </div>
                <div class="form-group">
                    <label>Verwendung</label>
                    <input type="text" value="${escapeHtml(form.bezeichnung)}" placeholder="Optional, sonst wie Button-Name"
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
                <button type="button" class="btn btn-primary btn-small" onclick="gruppeSaveEigenerButton()">Button speichern</button>
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
    if (!assertCanEdit('Eigene Buttons anlegen')) return;
    eigenerButtonFormular = getDefaultEigenerButtonFormular(gruppenCode);
    renderGruppenPanel();
}


/**
 * @returns {void}
 */
export function gruppeCancelEigenerButtonFormular() {
    eigenerButtonFormular = null;
    renderGruppenPanel();
}


/**
 * @param {string} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeOnEigenerButtonField(feld, wert) {
    if (!eigenerButtonFormular) return;
    eigenerButtonFormular[feld] = wert;
}


/**
 * @param {string} kategorie
 * @returns {void}
 */
export function gruppeOnEigenerButtonKategorieChange(kategorie) {
    if (!eigenerButtonFormular) return;
    eigenerButtonFormular.kategorie = kategorie;
    if (kategorie && eigenerButtonFormular.vorgabeTyp !== 'katalog') {
        const hersteller = getHerstellerFuerKategorie(kategorie);
        eigenerButtonFormular.hersteller = hersteller[0] || '';
    }
    if (istMeterwareKategorie(kategorie) && eigenerButtonFormular.vorgabeTyp === 'basic') {
        eigenerButtonFormular.vorgabeTyp = 'meterware';
    }
    eigenerButtonFormular.artikelWhitelist = [];
    clearKatalogAuswahlImButtonFormular();
    renderGruppenPanel();
}


/**
 * @param {string} hersteller
 * @returns {void}
 */
export function gruppeOnEigenerButtonHerstellerChange(hersteller) {
    if (!eigenerButtonFormular) return;
    eigenerButtonFormular.hersteller = hersteller;
    clearKatalogAuswahlImButtonFormular();
    renderGruppenPanel();
}


/**
 * Setzt die Katalog-Auswahl im Button-Formular zurück.
 * @returns {void}
 */
function clearKatalogAuswahlImButtonFormular() {
    if (!eigenerButtonFormular) return;
    eigenerButtonFormular.katalogArtikelnummer = '';
    eigenerButtonFormular.steckerLabel = '';
    eigenerButtonFormular.artikelPrefix = '';
    eigenerButtonFormular.artikelnummer = '';
    eigenerButtonFormular.laenge = '';
    eigenerButtonFormular.steckerA = '';
    eigenerButtonFormular.steckerB = '';
}


/**
 * @param {string} suche
 * @returns {void}
 */
export function gruppeOnEigenerButtonKatalogSuche(suche) {
    if (!eigenerButtonFormular) return;
    eigenerButtonFormular.katalogSuche = suche;
    if (getArtikelByNummer(suche.trim())) {
        applyKatalogArtikelToButtonForm(eigenerButtonFormular, suche.trim());
    } else if (eigenerButtonFormular.katalogArtikelnummer
        && suche.trim().toLowerCase() !== eigenerButtonFormular.katalogArtikelnummer.toLowerCase()) {
        clearKatalogAuswahlImButtonFormular();
    }
    renderGruppenPanel();
}


/**
 * @param {string} artikelnummer
 * @returns {void}
 */
export function gruppeOnEigenerButtonKatalogArtikel(artikelnummer) {
    if (!eigenerButtonFormular) return;
    const nr = (artikelnummer || '').trim();
    eigenerButtonFormular.katalogSuche = nr;
    if (!nr) {
        clearKatalogAuswahlImButtonFormular();
        renderGruppenPanel();
        return;
    }
    if (!applyKatalogArtikelToButtonForm(eigenerButtonFormular, nr)) {
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
    if (!eigenerButtonFormular) return;
    eigenerButtonFormular.vorgabeTyp = vorgabeTyp;
    clearKatalogAuswahlImButtonFormular();
    eigenerButtonFormular.katalogSuche = '';
    renderGruppenPanel();
}


/**
 * @param {boolean} alle
 * @returns {void}
 */
export function gruppeOnEigenerButtonAlleTypen(alle) {
    if (!eigenerButtonFormular) return;
    eigenerButtonFormular.alleTypen = alle;
    if (alle) eigenerButtonFormular.artikelWhitelist = [];
    renderGruppenPanel();
}


/**
 * @param {string} artikelnummer
 * @param {boolean} aktiv
 * @returns {void}
 */
export function gruppeOnEigenerButtonWhitelistToggle(artikelnummer, aktiv) {
    if (!eigenerButtonFormular) return;
    const liste = new Set(eigenerButtonFormular.artikelWhitelist || []);
    if (aktiv) liste.add(artikelnummer);
    else liste.delete(artikelnummer);
    eigenerButtonFormular.artikelWhitelist = Array.from(liste);
    eigenerButtonFormular.alleTypen = eigenerButtonFormular.artikelWhitelist.length === 0;
}


/**
 * Baut aus dem Formular die Preset-Daten.
 * @returns {object}
 */
function buildPresetFromEigenerButtonFormular() {
    const form = eigenerButtonFormular;
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
    if (!assertCanEdit('Eigene Buttons speichern')) return;
    if (!eigenerButtonFormular) return;

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
        await addCustomGruppenPreset(eigenerButtonFormular.gruppeCode, data);
        eigenerButtonFormular = null;
        renderGruppenPanel();
        await showModal('Der Button wurde gespeichert und steht ab sofort in dieser Gruppe zur Verfügung.', {
            type: 'success',
            title: 'Button gespeichert'
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
    if (!assertCanEdit('Eigene Buttons löschen')) return;
    const preset = getLeitungPreset(presetId);
    const confirmed = await showModal(
        preset ? `Button „${preset.label}“ wirklich entfernen?` : 'Diesen Button wirklich entfernen?',
        { type: 'danger', title: 'Button entfernen', showCancel: true, confirmText: 'Entfernen', cancelText: 'Abbrechen' }
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
    if (!assertCanEdit('Eigene Buttons anlegen')) return;
    const leitung = findLeitung(leitungId);
    if (!leitung) return;

    const label = (leitung.bezeichnung || '').trim()
        || prompt('Name für den Button:', leitung.bezeichnung || 'Eigener Button');
    if (!label) return;

    try {
        const preset = presetFromLeitung(leitung, label.trim());
        await addCustomGruppenPreset(leitung.gruppe || aktiveGruppe, preset);
        renderGruppenPanel();
        await showModal(`Button „${label.trim()}“ wurde für diese Gruppe gespeichert.`, {
            type: 'success',
            title: 'Button gespeichert'
        });
    } catch (error) {
        await showModal(error.message || 'Speichern fehlgeschlagen.', { type: 'danger', title: 'Fehler' });
    }
}


/**
 * Formular für eine Leitung, die es noch nicht im Katalog gibt.
 * @returns {string}
 */
function renderNeuesLeitungFormular() {
    if (!neuesLeitungFormular) return '';

    const zielLeitung = neuesLeitungFormular.leitungId ? findLeitung(neuesLeitungFormular.leitungId) : null;
    const kategorien = getKategorien();
    const hersteller = Array.from(new Set(appState.katalog?.hersteller || [])).sort((a, b) => a.localeCompare(b, 'de'));
    const stecker = appState.katalog?.steckertypen || [];
    const form = neuesLeitungFormular;

    return `
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
                    <label for="neu-leitung-beschreibung">Bezeichnung *</label>
                    <input type="text" id="neu-leitung-beschreibung" value="${escapeHtml(form.beschreibung || '')}"
                           placeholder="z. B. EtherCAT Kabel M8-M8 5,00 m">
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
    `;
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

    neuesLeitungFormular = {
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

    neuesBauteilFormular = null;
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
    neuesLeitungFormular = null;
    renderGruppenPanel();
}


/**
 * @param {string} kategorie
 * @returns {void}
 */
export function gruppeOnNeuLeitungKategorieChange(kategorie) {
    if (!neuesLeitungFormular) return;
    neuesLeitungFormular.kategorie = kategorie;
    neuesLeitungFormular.meterware = istMeterwareKategorie(kategorie);
    renderGruppenPanel();
}


/**
 * @param {boolean} meterware
 * @returns {void}
 */
export function gruppeOnNeuLeitungMeterwareChange(meterware) {
    const laengeInput = document.getElementById('neu-leitung-laenge');
    if (laengeInput) laengeInput.disabled = meterware;
    if (neuesLeitungFormular) neuesLeitungFormular.meterware = meterware;
}


/**
 * Legt die Leitung im Katalog an und übernimmt sie in die aktuelle Gruppe.
 * @returns {Promise<void>}
 */
export async function gruppeSaveNeuesLeitung() {
    if (!neuesLeitungFormular || !assertCanEdit('Leitungen anlegen')) return;

    const kategorie = document.getElementById('neu-leitung-kategorie')?.value?.trim() || '';
    const hersteller = document.getElementById('neu-leitung-hersteller')?.value?.trim() || '';
    const artikelnummer = document.getElementById('neu-leitung-artikelnummer')?.value?.trim() || '';
    const beschreibung = document.getElementById('neu-leitung-beschreibung')?.value?.trim() || '';
    const steckerA = document.getElementById('neu-leitung-stecker-a')?.value?.trim() || '';
    const steckerB = document.getElementById('neu-leitung-stecker-b')?.value?.trim() || '';
    const meterware = document.getElementById('neu-leitung-meterware')?.checked === true;
    const laengeRaw = document.getElementById('neu-leitung-laenge')?.value;

    if (!kategorie || !hersteller || !artikelnummer || !beschreibung || !steckerA || !steckerB) {
        showModal('Bitte Leitungstyp, Hersteller, Artikelnummer, Bezeichnung und beide Stecker ausfüllen.', {
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

    const zielLeitung = neuesLeitungFormular.leitungId ? findLeitung(neuesLeitungFormular.leitungId) : null;
    if (zielLeitung) {
        zielLeitung.kategorie = kategorie;
        zielLeitung.hersteller = hersteller;
        zielLeitung.steckerA = steckerA;
        zielLeitung.steckerB = steckerB;
        zielLeitung.laenge = laenge;
        zielLeitung.artikelnummer = artikelnummer;
        zielLeitung.artikelCustom = '';
        zielLeitung.bezeichnung = zielLeitung.bezeichnung || beschreibung;
        aktiveLeitungId = zielLeitung.id;
    } else {
        const leitung = {
            id: generateId('ltg'),
            position: (appState.currentProjekt.leitungen || []).length + 1,
            bezeichnung: '',
            kategorie,
            gruppe: aktiveGruppe,
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
        aktiveLeitungId = leitung.id;
        renumberLeitungen();
    }

    neuesLeitungFormular = null;
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereLeitungEditor();

    showModal(`${beschreibung} (${artikelnummer}) wurde im Katalog angelegt.`, {
        type: 'success',
        title: 'Leitung gespeichert'
    });
}


/**
 * Kurzbeschreibung der Ausführung für die Übersichtstabelle.
 * @param {object} leitung
 * @returns {string}
 */
function getLeitungAusfuehrung(leitung) {
    const artikel = getArtikelByNummer(leitung.artikelnummer);
    if (artikel?.beschreibung) return artikel.beschreibung;

    const stecker = [leitung.steckerA, leitung.steckerB].filter(Boolean);
    return stecker.length ? stecker.join(' → ') : '–';
}


/**
 * Übersicht aller Leitungen der Gruppe als Tabelle.
 * @param {object[]} leitungen
 * @returns {string}
 */
function renderLeitungTabelle(leitungen) {
    if (!leitungen.length) {
        return '<p class="text-muted gruppen-leer">Noch keine Leitungen. Unten eine Leitung hinzufügen.</p>';
    }

    const gesperrt = istSchreibgeschuetzt();
    const zeilen = leitungen.map((leitung, index) => {
        aktualisiereArtikel(leitung);
        const id = escapeHtml(leitung.id);
        const artikelnummer = leitung.artikelnummer || leitung.artikelCustom;
        const klassen = [];
        if (leitung.id === aktiveLeitungId) klassen.push('aktiv');
        if (!artikelnummer) klassen.push('unvollstaendig');

        return `
            <tr class="${klassen.join(' ')}" title="Doppelklick zum Bearbeiten"
                ondblclick="gruppeEditLeitung('${id}')">
                <td class="leitung-tabelle-nr">${index + 1}</td>
                <td>
                    <span class="leitung-tabelle-verwendung">${escapeHtml(leitung.bezeichnung || '— ohne Verwendung —')}</span>
                    <span class="leitung-tabelle-typ">${escapeHtml(getLeitungAusfuehrung(leitung))}</span>
                </td>
                <td class="leitung-tabelle-laenge">${leitung.laenge ? `${formatLaenge(leitung.laenge)} m` : '–'}</td>
                <td class="leitung-tabelle-artikel">${escapeHtml(artikelnummer || 'offen')}</td>
                <td class="leitung-tabelle-anzahl">${leitung.anzahl || 1}×</td>
                <td class="leitung-tabelle-aktionen">
                    <div class="table-actions">
                    <button type="button" class="btn btn-secondary btn-small btn-icon" title="Leitung bearbeiten"
                            onclick="gruppeEditLeitung('${id}')">✏️</button>
                    ${gesperrt ? '' : `
                        <button type="button" class="btn btn-secondary btn-small btn-icon" title="Leitung kopieren"
                                onclick="gruppeCopyLeitung('${id}')">📋</button>
                        <button type="button" class="btn btn-danger btn-small btn-icon" title="Leitung löschen"
                                onclick="gruppeDeleteLeitung('${id}')">🗑️</button>
                    `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const gesamt = leitungen.reduce((summe, l) => summe + (l.anzahl || 1), 0);

    return `
        <div class="table-container gruppen-tabelle-container">
            <table class="leitung-table leitung-tabelle">
                <thead>
                    <tr>
                        <th>Nr.</th>
                        <th>Verwendung / Ausführung</th>
                        <th>Länge</th>
                        <th>Artikelnr.</th>
                        <th>Anz.</th>
                        <th class="leitung-tabelle-aktionen">Aktionen</th>
                    </tr>
                </thead>
                <tbody>${zeilen}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="4">Gesamt</td>
                        <td class="leitung-tabelle-anzahl">${gesamt}×</td>
                        <td class="leitung-tabelle-aktionen"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
}


/**
 * Zeichnet nur die Übersichtstabelle neu.
 * @returns {void}
 */
function aktualisiereLeitungsTabelle() {
    const container = document.getElementById('gruppen-leitungen-tabelle');
    if (container) container.innerHTML = renderLeitungTabelle(getLeitungenDerGruppe(aktiveGruppe));
}


/**
 * Liest Basistyp und Ausrichtung aus dem gespeicherten Steckertyp.
 * @param {string} stecker
 * @returns {{basis: string, ausrichtung: string}}
 */
function zerlegeStecker(stecker) {
    return {
        basis: getBaseSteckerTyp(stecker),
        ausrichtung: (stecker || '').endsWith('gewinkelt') ? 'gewinkelt' : 'gerade'
    };
}


/**
 * Ermittelt den passenden Katalogartikel und schreibt ihn in die Leitung.
 * @param {object} leitung
 * @returns {{text: string, klasse: string}}
 */
function aktualisiereArtikel(leitung) {
    if (leitung.artikelCustom) {
        leitung.artikelnummer = leitung.artikelCustom;
        return { text: `Manuell: ${leitung.artikelCustom}`, klasse: 'manuell' };
    }

    if (istMeterwareKategorie(leitung.kategorie)) {
        const artikel = getMeterwareArtikel(leitung.kategorie, leitung.hersteller, leitung.artikelWhitelist)
            .find(a => a.artikelnummer === leitung.artikelnummer);
        if (!artikel) {
            leitung.artikelnummer = leitung.artikelnummer || '';
            return { text: 'Bitte Leitungstyp wählen', klasse: 'no-match' };
        }
        return { text: `${artikel.beschreibung} · ${artikel.artikelnummer}`, klasse: 'match' };
    }

    const treffer = findArtikel({
        kategorie: leitung.kategorie,
        hersteller: leitung.hersteller,
        steckerA: leitung.steckerA,
        steckerB: leitung.steckerB,
        laenge: leitung.laenge,
        bevorzugt: leitung.artikelnummer,
        artikelPrefix: leitung.artikelPrefix
    });

    if (treffer?.artikel) {
        leitung.artikelnummer = treffer.artikel.artikelnummer;
        if (!treffer.exakt) {
            return {
                text: `${treffer.artikel.beschreibung} · ${treffer.artikel.artikelnummer} (nächste Katalog-Länge ${formatLaenge(treffer.artikel.laenge)} m)`,
                klasse: 'partial'
            };
        }
        return { text: `${treffer.artikel.beschreibung} · ${treffer.artikel.artikelnummer}`, klasse: 'match' };
    }

    // Ohne Katalogtreffer bleibt eine bereits erfasste Artikelnummer erhalten.
    if (leitung.artikelnummer) {
        return { text: `Artikelnummer: ${leitung.artikelnummer}`, klasse: 'manuell' };
    }

    const laengen = treffer?.verfuegbareLaengen || [];
    if (laengen.length) {
        return { text: `Bitte Länge wählen (${laengen.map(formatLaenge).join(', ')} m)`, klasse: 'no-match' };
    }
    return { text: 'Kein Katalogartikel – Artikelnummer manuell eintragen', klasse: 'no-match' };
}


/**
 * @param {object} leitung
 * @returns {string}
 */
function renderLeitungKarte(leitung) {
    const gesperrt = istSchreibgeschuetzt();
    const disabled = gesperrt ? ' disabled' : '';
    const id = escapeHtml(leitung.id);
    const meterware = istMeterwareKategorie(leitung.kategorie);
    const artikelInfo = aktualisiereArtikel(leitung);

    const kategorieOptionen = [
        { value: '', label: '-- Leitungstyp --' },
        ...getKategorien().map(k => ({ value: k.id, label: `${k.icon} ${k.name}` }))
    ];
    const herstellerOptionen = [
        { value: '', label: '-- Hersteller --' },
        ...getHerstellerFuerKategorie(leitung.kategorie).map(h => ({ value: h, label: h }))
    ];

    const nummer = getLeitungenDerGruppe(leitung.gruppe).findIndex(l => l.id === leitung.id) + 1;
    const zusatzOffen = leitung.artikelCustom || leitung.notiz ? ' open' : '';

    return `
        <div class="gruppen-karte leitung-karte" id="leitung-karte-${id}">
            <div class="leitung-karte-kopf">
                <span class="leitung-karte-nummer">Leitung ${nummer} bearbeiten</span>
                <input type="text" class="leitung-karte-verwendung" value="${escapeHtml(leitung.bezeichnung || '')}"
                       title="Verwendung / wofür ist die Leitung?"
                       placeholder="Verwendung, z. B. Klemmkasten 1 → EP-Modul Stößel"${disabled}
                       oninput="gruppeUpdateLeitungText('${id}', 'bezeichnung', this.value)">
                <div class="leitung-karte-aktionen">
                    ${gesperrt ? '' : `
                        <button type="button" class="btn btn-secondary btn-small" title="Als Button für diese Gruppe speichern"
                                onclick="gruppeSaveLeitungAlsButton('${id}')">Als Button</button>
                        <button type="button" class="btn btn-secondary btn-small" title="Leitung kopieren"
                                onclick="gruppeCopyLeitung('${id}')">Kopieren</button>
                        <button type="button" class="btn btn-danger btn-small" title="Leitung löschen"
                                onclick="gruppeDeleteLeitung('${id}')">Löschen</button>
                    `}
                    <button type="button" class="btn btn-primary btn-small" title="Bearbeitung beenden"
                            onclick="gruppeCloseLeitungEditor()">Fertig</button>
                </div>
            </div>

            <div class="gruppen-karte-grid">
                ${(leitung.artikelPrefix || leitung.festLeitungstyp) ? '' : `
                <div class="form-group">
                    <label>Leitungstyp</label>
                    <select${disabled} onchange="gruppeUpdateLeitung('${id}', 'kategorie', this.value)">
                        ${optionen(kategorieOptionen, leitung.kategorie)}
                    </select>
                </div>
                <div class="form-group">
                    <label>Hersteller</label>
                    <select${disabled} onchange="gruppeUpdateLeitung('${id}', 'hersteller', this.value)">
                        ${optionen(herstellerOptionen, leitung.hersteller)}
                    </select>
                </div>
                `}
                ${meterware
                    ? renderMeterwareFelder(leitung, disabled)
                    : (leitung.artikelPrefix
                        ? renderPresetLeitungFelder(leitung, disabled)
                        : renderSteckerFelder(leitung, disabled))}
                <div class="form-group gruppen-karte-anzahl">
                    <label>Anzahl</label>
                    <input type="number" min="1" step="1" value="${leitung.anzahl || 1}"${disabled}
                           onchange="gruppeUpdateLeitung('${id}', 'anzahl', this.value)">
                </div>
            </div>

            <div class="artikel-vorschlag gruppen-karte-artikel-box ${artikelInfo.klasse}">
                <span class="artikel-label">${escapeHtml(artikelInfo.text)}</span>
                ${!gesperrt && artikelInfo.klasse === 'no-match' ? `
                    <button type="button" class="btn btn-secondary btn-small"
                            onclick="gruppeOpenLeitungFormularAusLeitung('${id}')">
                        Im Katalog anlegen…
                    </button>
                ` : ''}
            </div>

            <details class="gruppen-karte-details"${zusatzOffen}>
                <summary>Artikelnummer überschreiben / Notiz</summary>
                <div class="gruppen-karte-grid">
                    <div class="form-group gruppen-karte-breit">
                        <label>Artikelnummer manuell überschreiben</label>
                        <input type="text" value="${escapeHtml(leitung.artikelCustom || '')}" placeholder="Nur ausfüllen, wenn abweichend"${disabled}
                               oninput="gruppeUpdateLeitungText('${id}', 'artikelCustom', this.value)">
                    </div>
                    <div class="form-group gruppen-karte-breit">
                        <label>Notiz</label>
                        <input type="text" value="${escapeHtml(leitung.notiz || '')}" placeholder="Optionale Bemerkung"${disabled}
                               oninput="gruppeUpdateLeitungText('${id}', 'notiz', this.value)">
                    </div>
                </div>
            </details>
        </div>
    `;
}


/**
 * Formular für die gerade ausgewählte Leitung. Es ist immer nur eines geöffnet.
 * @returns {string}
 */
function renderLeitungEditor() {
    const leitung = aktiveLeitungId ? findLeitung(aktiveLeitungId) : null;
    if (!leitung || leitung.gruppe !== aktiveGruppe) return '';
    return renderLeitungKarte(leitung);
}


/**
 * Springt zum Formular und setzt den Cursor ins Verwendungsfeld.
 * @returns {void}
 */
function fokussiereLeitungEditor() {
    const karte = document.getElementById(`leitung-karte-${aktiveLeitungId}`);
    if (!karte) return;

    karte.scrollIntoView({ behavior: 'smooth', block: 'center' });
    karte.classList.add('gerade-angelegt');
    karte.querySelector('.leitung-karte-verwendung')?.focus({ preventScroll: true });
}


/**
 * Öffnet eine bestehende Leitung im Formular.
 * @param {string} id
 * @returns {void}
 */
export function gruppeEditLeitung(id) {
    if (!findLeitung(id)) return;
    aktiveLeitungId = id;
    renderGruppenPanel();
    fokussiereLeitungEditor();
}


/**
 * Schließt das Formular, die Leitung bleibt in der Übersicht.
 * @returns {void}
 */
export function gruppeCloseLeitungEditor() {
    aktiveLeitungId = '';
    renderGruppenPanel();
}


/**
 * Felder für vorgegebene Leitungsreihen (=011 Bremse): nur Länge wählen.
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderPresetLeitungFelder(leitung, disabled) {
    const id = escapeHtml(leitung.id);
    const prefix = leitung.artikelPrefix || '';
    const laengen = getLaengenOptionen(
        leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, prefix
    );
    const beispiel = getPassendeArtikel(
        leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, prefix
    )[0];
    const typLabel = beispiel
        ? (beispiel.beschreibung || '').replace(/\s+\d[\d.,]*\s*m\s*$/i, '').trim() || prefix
        : prefix;

    return `
        <div class="form-group gruppen-karte-breit">
            <label>Leitung</label>
            <p class="gruppen-preset-info text-muted">${escapeHtml(typLabel)} · ${escapeHtml(leitung.hersteller || '')}</p>
        </div>
        <div class="form-group">
            <label>Länge</label>
            <select${disabled} onchange="gruppeUpdateLeitung('${id}', 'laenge', this.value)">
                ${optionen([{ value: '', label: '-- Länge --' },
                    ...laengen.map(l => ({ value: l, label: `${formatLaenge(l)} m` }))], leitung.laenge || '')}
            </select>
        </div>
    `;
}


/**
 * Felder für konfektionierte Leitungen mit Steckern.
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderSteckerFelder(leitung, disabled) {
    const id = escapeHtml(leitung.id);
    const a = zerlegeStecker(leitung.steckerA);
    const b = zerlegeStecker(leitung.steckerB);

    const steckerAListe = getSteckerAOptionen(leitung.kategorie, leitung.hersteller);
    const steckerBListe = getSteckerBOptionen(leitung.kategorie, leitung.hersteller, leitung.steckerA);
    const laengen = getLaengenOptionen(
        leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, leitung.artikelPrefix
    );
    const freieLaenge = freieLaengeIds.has(leitung.id) || !laengen.length
        || (leitung.laenge > 0 && !laengen.includes(leitung.laenge));

    // Artikel ohne feste Länge (Meterware, Konfektion nach Maß) lassen sich nicht über
    // die Länge unterscheiden – dann braucht es eine eigene Auswahl.
    const ausfuehrungen = (leitung.steckerA && leitung.steckerB && !laengen.length)
        ? getPassendeArtikel(
            leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, leitung.artikelPrefix
        )
        : [];
    const ausfuehrungFeld = ausfuehrungen.length > 1
        ? `<div class="form-group gruppen-karte-breit">
                <label>Ausführung</label>
                <select${disabled} onchange="gruppeUpdateLeitung('${id}', 'artikelnummer', this.value)">
                    ${optionen(ausfuehrungen.map(artikel => ({
                        value: artikel.artikelnummer,
                        label: `${artikel.beschreibung} (${artikel.artikelnummer})`
                    })), leitung.artikelnummer)}
                </select>
           </div>`
        : '';

    const laengeFeld = freieLaenge
        ? `<input type="number" min="0" step="0.1" value="${leitung.laenge || ''}" placeholder="Meter"${disabled}
                  onchange="gruppeUpdateLeitung('${id}', 'laenge', this.value)">`
        : `<select${disabled} onchange="gruppeUpdateLeitung('${id}', 'laenge', this.value)">
                ${optionen([{ value: '', label: '-- Länge --' },
                    ...laengen.map(l => ({ value: l, label: `${formatLaenge(l)} m` }))], leitung.laenge || '')}
           </select>`;

    return `
        <div class="form-group">
            <label>Stecker A</label>
            <select${disabled} onchange="gruppeUpdateLeitung('${id}', 'steckerA', this.value)">
                ${optionen([{ value: '', label: '-- Stecker A --' }, ...steckerAListe], a.basis)}
            </select>
            ${renderAusrichtung(leitung.id, 'A', a)}
        </div>
        <div class="form-group">
            <label>Stecker B</label>
            <select${disabled} onchange="gruppeUpdateLeitung('${id}', 'steckerB', this.value)">
                ${optionen([{ value: '', label: '-- Stecker B --' }, ...steckerBListe], b.basis)}
            </select>
            ${renderAusrichtung(leitung.id, 'B', b)}
        </div>
        ${ausfuehrungFeld}
        <div class="form-group">
            <label>
                Länge
                ${laengen.length ? `<button type="button" class="gruppen-laenge-toggle"
                    onclick="gruppeToggleFreieLaenge('${id}')">${freieLaenge ? 'aus Katalog' : 'frei eingeben'}</button>` : ''}
            </label>
            ${laengeFeld}
        </div>
    `;
}


/**
 * @param {string} leitungId
 * @param {string} seite
 * @param {{basis: string, ausrichtung: string}} stecker
 * @returns {string}
 */
function renderAusrichtung(leitungId, seite, stecker) {
    if (!hasAusrichtung(stecker.basis)) return '';
    const gewinkelt = stecker.ausrichtung === 'gewinkelt';
    const disabled = istSchreibgeschuetzt() ? ' disabled' : '';

    return `
        <div class="ausrichtung-toggle">
            <button type="button" class="toggle-btn${gewinkelt ? ' gewinkelt' : ''}"${disabled}
                    onclick="gruppeToggleAusrichtung('${escapeHtml(leitungId)}', '${seite}')">
                <span class="toggle-icon">${gewinkelt ? '↳' : '↑'}</span>
                <span class="toggle-text">${gewinkelt ? 'gewinkelt' : 'gerade'}</span>
            </button>
        </div>
    `;
}


/**
 * Felder für Meterware (Ölflex-, Motor- und Geberleitungen).
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderMeterwareFelder(leitung, disabled) {
    const id = escapeHtml(leitung.id);
    const artikel = getMeterwareArtikel(leitung.kategorie, leitung.hersteller, leitung.artikelWhitelist);

    const typFeld = artikel.length
        ? `<select${disabled} onchange="gruppeUpdateLeitung('${id}', 'artikelnummer', this.value)">
                ${optionen([{ value: '', label: '-- Leitungstyp --' },
                    ...artikel.map(a => ({ value: a.artikelnummer, label: `${a.beschreibung} (${a.artikelnummer})` }))],
                    leitung.artikelnummer)}
           </select>`
        : `<input type="text" value="${escapeHtml(leitung.artikelnummer || '')}" placeholder="Artikelnummer eintragen"${disabled}
                  oninput="gruppeUpdateLeitungText('${id}', 'artikelCustom', this.value)">`;

    return `
        <div class="form-group gruppen-karte-breit">
            <label>Leitungstyp / Querschnitt</label>
            ${typFeld}
        </div>
        <div class="form-group">
            <label>Länge (Meter)</label>
            <input type="number" min="0" step="0.1" value="${leitung.laenge || ''}" placeholder="z. B. 12,5"${disabled}
                   onchange="gruppeUpdateLeitung('${id}', 'laenge', this.value)">
        </div>
    `;
}


/**
 * Legt eine neue Leitung anhand eines Presets an.
 * @param {string} presetId
 * @returns {void}
 */
export function gruppeAddLeitung(presetId) {
    if (!assertCanEdit('Leitungen hinzufügen')) return;
    if (!appState.currentProjekt.leitungen) appState.currentProjekt.leitungen = [];

    const preset = getLeitungPreset(presetId) || {};
    const leitung = {
        id: generateId('ltg'),
        position: appState.currentProjekt.leitungen.length + 1,
        bezeichnung: preset.bezeichnung || preset.label || '',
        kategorie: preset.kategorie || '',
        gruppe: aktiveGruppe,
        hersteller: preset.hersteller || '',
        artikelnummer: preset.artikelnummer || '',
        artikelPrefix: preset.artikelPrefix || '',
        artikelWhitelist: preset.artikelWhitelist || null,
        artikelCustom: '',
        laenge: preset.laenge || 0,
        steckerA: getFullSteckerTyp(preset.steckerA || '', preset.ausrichtungA),
        steckerB: getFullSteckerTyp(preset.steckerB || '', preset.ausrichtungB),
        festLeitungstyp: preset.festLeitungstyp === true,
        notiz: '',
        anzahl: 1,
        erledigt: false
    };

    appState.currentProjekt.leitungen.push(leitung);
    const artikelInfo = aktualisiereArtikel(leitung);
    renumberLeitungen();
    persistCurrentProjekt();

    if (artikelInfo.klasse === 'no-match' && (preset.kategorie || preset.artikelnummer || presetId)) {
        aktiveLeitungId = leitung.id;
        renderGruppenListe();
        gruppeOpenLeitungFormular(leitung.id, presetId);
        return;
    }

    aktiveLeitungId = leitung.id;
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereLeitungEditor();
}


/**
 * Ändert ein Auswahlfeld einer Leitung und zeichnet die Karte neu.
 * @param {string} id
 * @param {string} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeUpdateLeitung(id, feld, wert) {
    const leitung = findLeitung(id);
    if (!leitung || istSchreibgeschuetzt()) return;

    if (feld === 'kategorie') {
        leitung.kategorie = wert;
        const hersteller = getHerstellerFuerKategorie(wert);
        leitung.hersteller = hersteller.length === 1 ? hersteller[0] : '';
        leitung.steckerA = '';
        leitung.steckerB = '';
        leitung.artikelnummer = '';
        leitung.artikelPrefix = '';
        leitung.laenge = 0;
        freieLaengeIds.delete(id);
    } else if (feld === 'hersteller') {
        leitung.hersteller = wert;
        leitung.artikelnummer = '';
        leitung.artikelPrefix = '';
    } else if (feld === 'steckerA') {
        const ausrichtung = zerlegeStecker(leitung.steckerA).ausrichtung;
        leitung.steckerA = getFullSteckerTyp(wert, ausrichtung);
        leitung.steckerB = '';
        leitung.laenge = 0;
        leitung.artikelnummer = '';
        leitung.artikelPrefix = '';
    } else if (feld === 'steckerB') {
        const ausrichtung = zerlegeStecker(leitung.steckerB).ausrichtung;
        leitung.steckerB = getFullSteckerTyp(wert, ausrichtung);
        leitung.laenge = 0;
        leitung.artikelnummer = '';
        leitung.artikelPrefix = '';
    } else if (feld === 'laenge') {
        leitung.laenge = parseFloat(String(wert).replace(',', '.')) || 0;
        // Bei Meterware bestimmt die Typauswahl die Artikelnummer, nicht die Länge.
        if (!istMeterwareKategorie(leitung.kategorie)) leitung.artikelnummer = '';
    } else if (feld === 'anzahl') {
        const anzahl = parseInt(wert, 10);
        leitung.anzahl = Number.isNaN(anzahl) || anzahl < 1 ? 1 : anzahl;
    } else if (feld === 'artikelnummer') {
        leitung.artikelnummer = wert;
    }

    aktualisiereArtikel(leitung);
    persistCurrentProjekt();
    ersetzeKarte(`leitung-karte-${id}`, renderLeitungKarte(leitung));
    aktualisiereLeitungsTabelle();
}


/**
 * Übernimmt Texteingaben, ohne die Karte neu zu zeichnen.
 * @param {string} id
 * @param {string} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeUpdateLeitungText(id, feld, wert) {
    const leitung = findLeitung(id);
    if (!leitung || istSchreibgeschuetzt()) return;

    leitung[feld] = wert;
    if (feld === 'artikelCustom') {
        // Ohne manuelle Nummer soll wieder der Katalog entscheiden.
        if (!wert) leitung.artikelnummer = '';
        const info = aktualisiereArtikel(leitung);
        const box = document.querySelector(`#leitung-karte-${CSS.escape(id)} .gruppen-karte-artikel-box`);
        if (box) {
            box.className = `artikel-vorschlag gruppen-karte-artikel-box ${info.klasse}`;
            box.innerHTML = `<span class="artikel-label">${escapeHtml(info.text)}</span>`;
        }
    }
    persistCurrentProjekt();
    aktualisiereLeitungsTabelle();
}


/**
 * @param {string} id
 * @param {string} seite - 'A' oder 'B'.
 * @returns {void}
 */
export function gruppeToggleAusrichtung(id, seite) {
    const leitung = findLeitung(id);
    if (!leitung || istSchreibgeschuetzt()) return;

    const feld = seite === 'A' ? 'steckerA' : 'steckerB';
    const { basis, ausrichtung } = zerlegeStecker(leitung[feld]);
    leitung[feld] = getFullSteckerTyp(basis, ausrichtung === 'gewinkelt' ? 'gerade' : 'gewinkelt');
    leitung.laenge = 0;
    leitung.artikelnummer = '';

    aktualisiereArtikel(leitung);
    persistCurrentProjekt();
    ersetzeKarte(`leitung-karte-${id}`, renderLeitungKarte(leitung));
    aktualisiereLeitungsTabelle();
}


/**
 * @param {string} id
 * @returns {void}
 */
export function gruppeToggleFreieLaenge(id) {
    const leitung = findLeitung(id);
    if (!leitung) return;

    if (freieLaengeIds.has(id)) freieLaengeIds.delete(id);
    else freieLaengeIds.add(id);

    ersetzeKarte(`leitung-karte-${id}`, renderLeitungKarte(leitung));
}


/**
 * Legt eine Kopie der Leitung direkt darunter an.
 * @param {string} id
 * @returns {void}
 */
export function gruppeCopyLeitung(id) {
    if (!assertCanEdit('Leitungen kopieren')) return;
    const liste = appState.currentProjekt?.leitungen || [];
    const index = liste.findIndex(l => l.id === id);
    if (index === -1) return;

    const kopie = { ...liste[index], id: generateId('ltg') };
    liste.splice(index + 1, 0, kopie);
    renumberLeitungen();
    persistCurrentProjekt();

    aktiveLeitungId = kopie.id;
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereLeitungEditor();
}


/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function gruppeDeleteLeitung(id) {
    if (!assertCanEdit('Leitungen löschen')) return;
    const liste = appState.currentProjekt?.leitungen || [];
    const index = liste.findIndex(l => l.id === id);
    if (index === -1) return;

    const bezeichnung = liste[index].bezeichnung;
    const confirmed = await showModal(
        bezeichnung ? `Leitung „${bezeichnung}“ wirklich löschen?` : 'Diese Leitung wirklich löschen?',
        { type: 'danger', title: 'Leitung löschen', showCancel: true, confirmText: 'Löschen', cancelText: 'Abbrechen' }
    );
    if (!confirmed) return;
    if (liste[index]?.id !== id) return;

    liste.splice(index, 1);
    freieLaengeIds.delete(id);
    if (aktiveLeitungId === id) aktiveLeitungId = '';
    renumberLeitungen();
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();
}


/**
 * Tauscht eine einzelne Karte aus, damit Scrollposition und Fokus erhalten bleiben.
 * @param {string} elementId
 * @param {string} html
 * @returns {void}
 */
function ersetzeKarte(elementId, html) {
    const element = document.getElementById(elementId);
    if (element) element.outerHTML = html;
}
