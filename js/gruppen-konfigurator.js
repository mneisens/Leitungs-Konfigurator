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
    getHerstellerFuerKategorie,
    getKategorieName,
    getKategorien,
    getLaengenOptionen,
    getMeterwareArtikel,
    getPassendeArtikel,
    getSteckerAOptionen,
    getSteckerBOptionen,
    istMeterwareKategorie
} from './leitung-optionen.js';
import { getGruppenVorgaben, getLeitungPreset } from './gruppen-config.js';
import { addBauteilZumKatalog, bauteilnummerVergeben, bildePlatzhalterNummer } from './katalog-additions.js';
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
        const istAktiv = String(value) === aktuell ? ' selected' : '';
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

            <div class="gruppen-abschnitt">
                <div class="gruppen-abschnitt-kopf">
                    <h4>Leitungen <span class="gruppen-anzahl">${leitungen.length}</span></h4>
                </div>
                <div id="gruppen-leitungen-tabelle">${renderLeitungTabelle(leitungen)}</div>
                ${gesperrt ? '' : renderLeitungButtons(vorgaben.leitungPresets)}
                <div id="gruppen-leitung-editor">${renderLeitungEditor()}</div>
            </div>

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
    const schnellwahl = typen.map(typ => `
        <button type="button" class="btn btn-secondary btn-small" onclick="gruppeAddBauteil('${escapeHtml(typ)}')">
            + ${escapeHtml(getBauteilTypName(typ))}
        </button>
    `).join('');

    return `<div class="gruppen-add-buttons gruppen-add-buttons-unten">
        <span class="gruppen-add-hinweis">Bauteil hinzufügen:</span>
        ${schnellwahl}
        <button type="button" class="btn btn-secondary btn-small" onclick="gruppeAddBauteil('')">+ Anderes Bauteil</button>
        <button type="button" class="btn btn-primary btn-small" onclick="gruppeOpenBauteilFormular('', '')">➕ Bauteil neu anlegen</button>
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

    return `
        <div class="gruppen-karte bauteil-neu-formular">
            <h5>Neues Bauteil anlegen</h5>
            <p class="text-muted">
                Das Bauteil wird in den Katalog übernommen und steht danach in jedem Projekt zur Verfügung.
                ${zielBauteil ? 'Es wird direkt der bearbeiteten Position zugeordnet.' : ''}
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
    return bauteil.bezeichnung
        || bauteil.artikelnummer
        || getBauteilTypName(bauteil.typ)
        || 'Bauteil';
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
                <td class="table-actions leitung-tabelle-aktionen">
                    <button type="button" class="btn btn-secondary btn-small btn-icon" title="Bauteil bearbeiten"
                            onclick="gruppeEditBauteil('${id}')">✏️</button>
                    ${gesperrt ? '' : `
                        <button type="button" class="btn btn-danger btn-small btn-icon" title="Bauteil entfernen"
                                onclick="gruppeDeleteBauteil('${id}')">🗑️</button>
                    `}
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
                        <th class="leitung-tabelle-aktionen"></th>
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

    const artikel = typ ? getArtikelAuswahlFuerGruppe(typ)[0] : null;
    const bauteil = {
        id: generateId('btl'),
        gruppe: aktiveGruppe,
        typ: typ || '',
        hersteller: artikel?.hersteller || '',
        artikelnummer: artikel?.artikelnummer || '',
        bezeichnung: artikel?.beschreibung || '',
        notiz: '',
        anzahl: 1
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
        const artikel = getArtikelAuswahlFuerGruppe(wert)[0] || null;
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
    const buttons = presets.map((preset, i) => `
        <button type="button" class="btn ${i === 0 ? 'btn-success' : 'btn-secondary'} btn-small"
                onclick="gruppeAddLeitung('${escapeHtml(preset.id)}')">
            + ${escapeHtml(preset.label)}
        </button>
    `).join('');

    return `<div class="gruppen-add-buttons gruppen-add-buttons-unten">
        <span class="gruppen-add-hinweis">Leitung hinzufügen:</span>
        ${buttons}
        <button type="button" class="btn btn-secondary btn-small" onclick="gruppeAddLeitung('')">+ Leere Leitung</button>
    </div>`;
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
                <td class="table-actions leitung-tabelle-aktionen">
                    <button type="button" class="btn btn-secondary btn-small btn-icon" title="Leitung bearbeiten"
                            onclick="gruppeEditLeitung('${id}')">✏️</button>
                    ${gesperrt ? '' : `
                        <button type="button" class="btn btn-secondary btn-small btn-icon" title="Leitung kopieren"
                                onclick="gruppeCopyLeitung('${id}')">📋</button>
                        <button type="button" class="btn btn-danger btn-small btn-icon" title="Leitung löschen"
                                onclick="gruppeDeleteLeitung('${id}')">🗑️</button>
                    `}
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
                        <th class="leitung-tabelle-aktionen"></th>
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
        const artikel = getMeterwareArtikel(leitung.kategorie)
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
        bevorzugt: leitung.artikelnummer
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
                ${meterware ? renderMeterwareFelder(leitung, disabled) : renderSteckerFelder(leitung, disabled)}
                <div class="form-group gruppen-karte-anzahl">
                    <label>Anzahl</label>
                    <input type="number" min="1" step="1" value="${leitung.anzahl || 1}"${disabled}
                           onchange="gruppeUpdateLeitung('${id}', 'anzahl', this.value)">
                </div>
            </div>

            <div class="artikel-vorschlag gruppen-karte-artikel-box ${artikelInfo.klasse}">
                <span class="artikel-label">${escapeHtml(artikelInfo.text)}</span>
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
    const laengen = getLaengenOptionen(leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB);
    const freieLaenge = freieLaengeIds.has(leitung.id) || !laengen.length
        || (leitung.laenge > 0 && !laengen.includes(leitung.laenge));

    // Artikel ohne feste Länge (Meterware, Konfektion nach Maß) lassen sich nicht über
    // die Länge unterscheiden – dann braucht es eine eigene Auswahl.
    const ausfuehrungen = (leitung.steckerA && leitung.steckerB && !laengen.length)
        ? getPassendeArtikel(leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB)
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
    const artikel = getMeterwareArtikel(leitung.kategorie);

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
        bezeichnung: '',
        kategorie: preset.kategorie || '',
        gruppe: aktiveGruppe,
        hersteller: preset.hersteller || '',
        artikelnummer: preset.artikelnummer || '',
        artikelCustom: '',
        laenge: preset.laenge || 0,
        steckerA: getFullSteckerTyp(preset.steckerA || '', preset.ausrichtungA),
        steckerB: getFullSteckerTyp(preset.steckerB || '', preset.ausrichtungB),
        notiz: '',
        anzahl: 1,
        erledigt: false
    };

    appState.currentProjekt.leitungen.push(leitung);
    aktualisiereArtikel(leitung);
    renumberLeitungen();
    persistCurrentProjekt();

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
        leitung.laenge = 0;
        freieLaengeIds.delete(id);
    } else if (feld === 'hersteller') {
        leitung.hersteller = wert;
        leitung.artikelnummer = '';
    } else if (feld === 'steckerA') {
        const ausrichtung = zerlegeStecker(leitung.steckerA).ausrichtung;
        leitung.steckerA = getFullSteckerTyp(wert, ausrichtung);
        leitung.steckerB = '';
        leitung.laenge = 0;
        leitung.artikelnummer = '';
    } else if (feld === 'steckerB') {
        const ausrichtung = zerlegeStecker(leitung.steckerB).ausrichtung;
        leitung.steckerB = getFullSteckerTyp(wert, ausrichtung);
        leitung.laenge = 0;
        leitung.artikelnummer = '';
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
