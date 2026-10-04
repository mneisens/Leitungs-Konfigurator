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
import { syncTopologieLeitungen, uebernehmeLeitungInTopologie } from './topologie-sync.js';

/** Code der aktuell geöffneten Gruppe. */
let aktiveGruppe = '';
/** Suchtext der Gruppenliste. */
let gruppenSuche = '';
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
 * Geöffneter Auswahldialog für Leitungen bzw. Bauteile.
 * Bei Bauteilen kann `typFilter` auf einen Typ gesetzt sein – dann zeigt der
 * Dialog die Katalogartikel dieses Typs zur Auswahl (Drill-down).
 * @type {{art: string, suche: string, typFilter?: string}|null}
 */
let pickerState = null;
/** Leitungen, denen gerade angeboten wird, sie als Standard der Gruppe zu merken. */
const standardAngebotIds = new Set();


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
    if (!Array.isArray(projekt.gruppenStatus[code].ausgeblendeteLeitungPresets)) {
        projekt.gruppenStatus[code].ausgeblendeteLeitungPresets = [];
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


/**
 * Warenkorb-Steuerung für die Stückzahl (+ / −).
 * @param {'leitung'|'bauteil'} art
 * @param {string} id
 * @param {number} anzahl
 * @param {boolean} [gesperrt]
 * @returns {string}
 */
function renderAnzahlStepper(art, id, anzahl, gesperrt = false) {
    const wert = Math.max(1, Number(anzahl) || 1);
    const safeId = escapeHtml(id);
    const safeArt = escapeHtml(art);

    if (gesperrt) {
        return `<span class="anzahl-stepper anzahl-stepper-readonly">${wert}×</span>`;
    }

    return `
        <div class="anzahl-stepper" onclick="event.stopPropagation()" ondblclick="event.stopPropagation()">
            <button type="button" class="anzahl-stepper-btn" title="Weniger"
                    ${wert <= 1 ? 'disabled' : ''}
                    onclick="event.stopPropagation(); gruppeAendereAnzahl('${safeArt}', '${safeId}', -1)">−</button>
            <span class="anzahl-stepper-wert" aria-live="polite">${wert}</span>
            <button type="button" class="anzahl-stepper-btn" title="Mehr"
                    onclick="event.stopPropagation(); gruppeAendereAnzahl('${safeArt}', '${safeId}', 1)">+</button>
        </div>
    `;
}


/**
 * Ändert die Stückzahl einer Leitung oder eines Bauteils um `delta`.
 * @param {'leitung'|'bauteil'} art
 * @param {string} id
 * @param {number} delta
 * @returns {void}
 */
export function gruppeAendereAnzahl(art, id, delta) {
    if (!assertCanEdit('Stückzahl ändern')) return;

    if (art === 'bauteil') {
        const bauteil = findBauteil(id);
        if (!bauteil) return;
        const neu = Math.max(1, (bauteil.anzahl || 1) + Number(delta || 0));
        bauteil.anzahl = neu;
        persistCurrentProjekt();
        if (document.getElementById(`bauteil-karte-${id}`)) {
            ersetzeKarte(`bauteil-karte-${id}`, renderBauteilKarte(bauteil));
        }
        aktualisiereBauteilTabelle();
        return;
    }

    const leitung = findLeitung(id);
    if (!leitung) return;
    const neu = Math.max(1, (leitung.anzahl || 1) + Number(delta || 0));
    leitung.anzahl = neu;
    persistCurrentProjekt();
    if (document.getElementById(`leitung-karte-${id}`)) {
        ersetzeKarte(`leitung-karte-${id}`, renderLeitungKarte(leitung));
    }
    aktualisiereLeitungsTabelle();
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
    registriereGruppenEreignisse();

    if (!projekt) {
        const main = document.getElementById('gruppen-main');
        if (main) main.innerHTML = '<p class="gk-leer">Bitte zuerst ein Projekt öffnen.</p>';
        return;
    }

    if (!projekt.gruppenStatus) projekt.gruppenStatus = {};
    if (!projekt.leitungen) projekt.leitungen = [];
    if (!projekt.bauteile) projekt.bauteile = [];
    if (!Array.isArray(projekt.zusaetzlicheGruppen)) projekt.zusaetzlicheGruppen = [];
    // Verbindungen aus der EtherCAT-Topologie stehen als Leitungen in =004.
    if (syncTopologieLeitungen(projekt)) persistCurrentProjekt();

    const pendingCode = appState.pendingGruppenCode || '';
    const pendingLeitungId = appState.pendingGruppenEditLeitungId || '';
    appState.pendingGruppenCode = '';
    appState.pendingGruppenEditLeitungId = '';

    if (pendingCode && getGruppe(pendingCode)) {
        aktiveGruppe = pendingCode;
    } else if (!getGruppe(aktiveGruppe)) {
        aktiveGruppe = getGruppen()[0]?.code || '';
    }

    renderGruppenListe();
    renderGruppenPanel();

    if (pendingLeitungId) {
        setTimeout(() => {
            if (findLeitung(pendingLeitungId)) {
                gruppeEditLeitung(pendingLeitungId);
            }
        }, 0);
    }
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
    pickerState = null;
    renderGruppenListe();
    renderGruppenPanel();
    document.getElementById('gruppen-main')?.scrollTo({ top: 0 });
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
 * Zeichnet die Mitte (Suche, Leitungen, Vorschläge) und den Rahmen der aktiven Gruppe.
 * @returns {void}
 */
function renderGruppenPanel() {
    const main = document.getElementById('gruppen-main');
    if (!main) return;

    const gruppe = getGruppe(aktiveGruppe);
    if (!gruppe) {
        main.innerHTML = '<p class="gk-leer">Keine Gruppe ausgewählt.</p>';
        renderGruppenRahmen();
        return;
    }

    const vorgaben = getGruppenVorgaben(gruppe);
    const leitungen = getLeitungenDerGruppe(gruppe.code);
    const gesperrt = istSchreibgeschuetzt();
    const zeigeLeitungen = !vorgaben.nurBauteile || leitungen.length > 0;

    main.innerHTML = `
        ${zeigeLeitungen ? `
            ${gesperrt ? '' : renderLeitungSuche()}
            <div id="gruppen-leitungen-tabelle">${renderLeitungTabelle(leitungen)}</div>
            ${gesperrt ? '' : `<div id="gk-vorschlaege">${renderLeitungVorschlaege(gruppe)}</div>`}
        ` : `
            <div class="gk-leer">
                <p>In ${escapeHtml(gruppe.code)} werden nur Bauteile erfasst.</p>
                ${gesperrt ? '' : `<button type="button" class="btn btn-secondary btn-small"
                        onclick="gruppeOpenPicker('bauteil')">+ Bauteil hinzufügen</button>`}
            </div>
        `}
        ${gesperrt ? '' : renderNeuesBauteilFormular()}
        ${gesperrt ? '' : renderNeuesLeitungFormular()}
        ${renderBauteilEditor()}
        ${renderLeitungEditor()}
        ${renderPicker()}
    `;

    renderGruppenRahmen();
    if (pickerState?.art === 'leitung') {
        const input = document.getElementById('gk-suche-input');
        if (input) input.value = pickerState.suche || '';
        aktualisiereLeitungDropdown();
    }
}


/**
 * Kopfzeile, linke und rechte Spalte – alles, was sich bei Änderungen an
 * Leitungen oder Bauteilen mitändert (Zähler, Fortschritt, Stückliste).
 * @returns {void}
 */
function renderGruppenRahmen() {
    const kopf = document.getElementById('gk-kopf');
    if (kopf) kopf.innerHTML = renderGruppenKopf();
    const links = document.getElementById('gk-gruppe');
    if (links) links.innerHTML = renderGruppeLinks();
    const rechts = document.getElementById('gk-rechts');
    if (rechts) rechts.innerHTML = renderGruppeRechts();
}


/**
 * Status einer Gruppe ohne ihn anzulegen (für Listen über alle Gruppen).
 * @param {string} code
 * @returns {object}
 */
function leseGruppenStatus(code) {
    return appState.currentProjekt?.gruppenStatus?.[code] || {};
}


/**
 * @param {object} gruppe
 * @returns {string} CSS-Klasse für Fortschritt und Listen.
 */
function getGruppenZustand(gruppe) {
    const status = leseGruppenStatus(gruppe.code);
    if (status.abgeschlossen) return 'fertig';
    if (status.nichtBenoetigt) return 'entfaellt';
    if (getLeitungenDerGruppe(gruppe.code).length || getBauteileDerGruppe(gruppe.code).length) return 'befuellt';
    return 'offen';
}


/**
 * Projekt, Fortschrittsleiste über alle Gruppen und Navigation.
 * @returns {string}
 */
function renderGruppenKopf() {
    const projekt = appState.currentProjekt;
    if (!projekt) return '';

    const gruppen = getGruppen();
    const index = gruppen.findIndex(g => g.code === aktiveGruppe);
    const fertig = gruppen.filter(g => leseGruppenStatus(g.code).abgeschlossen).length;
    const zustandText = { fertig: 'abgeschlossen', entfaellt: 'nicht benötigt', befuellt: 'in Arbeit', offen: 'offen' };

    const segmente = gruppen.map(g => {
        const zustand = getGruppenZustand(g);
        const aktiv = g.code === aktiveGruppe ? ' aktiv' : '';
        const titel = `${g.code} ${g.bezeichnung} – ${zustandText[zustand]}`;
        return `<button type="button" class="gk-seg ${zustand}${aktiv}" title="${escapeAttr(titel)}"
                        aria-label="${escapeAttr(titel)}" onclick="selectGruppe('${jsArg(g.code)}')"></button>`;
    }).join('');

    return `
        <button type="button" class="gk-projekt" onclick="showView('uebersicht')" title="Zur Projektübersicht">
            <span class="gk-label">Projekt ${escapeHtml(projekt.projektnummer || '')}</span>
            <strong>${escapeHtml(projekt.name || 'Ohne Namen')}</strong>
        </button>
        <div class="gk-fortschritt">
            <div class="gk-segmente">${segmente}</div>
            <div class="gk-fortschritt-text">
                <span>${escapeHtml(gruppen[0]?.code || '')}</span>
                <span class="gk-akzent">Gruppe ${index + 1} / ${gruppen.length} · ${fertig} abgeschlossen</span>
                <span>${escapeHtml(gruppen[gruppen.length - 1]?.code || '')}</span>
            </div>
        </div>
        <nav class="gk-kopf-aktionen">
            <button type="button" class="btn btn-secondary" onclick="showView('uebersicht')">Übersicht</button>
            <button type="button" class="btn btn-secondary" onclick="showView('stueckliste')">Stückliste</button>
        </nav>
    `;
}


/**
 * Linke Spalte: aktuelle Gruppe groß, Hinweise, CAD und die nächsten Gruppen.
 * @returns {string}
 */
function renderGruppeLinks() {
    const gruppe = getGruppe(aktiveGruppe);
    if (!gruppe) return '';

    const gesperrt = istSchreibgeschuetzt();
    const status = leseGruppenStatus(gruppe.code);
    const vorgaben = getGruppenVorgaben(gruppe);
    const gruppen = getGruppen();
    const index = gruppen.findIndex(g => g.code === gruppe.code);
    const naechste = gruppen.slice(index + 1, index + 6);

    const cad = (appState.currentProjekt?.cadLinks || []).filter(l => l?.url).map(link => {
        const label = (link.label || '').trim() || 'CAD öffnen';
        return `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer"
                   title="${escapeAttr(link.url)}">${escapeHtml(label)}</a>`;
    });

    return `
        <p class="gk-label gk-akzent">Aktuelle Gruppe${status.abgeschlossen ? ' · abgeschlossen ✓' : ''}</p>
        <div class="gk-code">${escapeHtml(gruppe.code)}</div>
        <h2 class="gk-name">${escapeHtml(gruppe.bezeichnung)}</h2>
        ${gruppe.custom ? '<span class="gruppen-badge zusaetzlich">Zusatzgruppe</span>' : ''}
        ${vorgaben.hinweis ? `<p class="gk-meta">${escapeHtml(vorgaben.hinweis)}</p>` : ''}
        ${cad.length ? `<p class="gk-meta">CAD: ${cad.join(' · ')}</p>` : ''}

        <div class="gk-optionen">
            <label class="gk-schalter">
                <input type="checkbox" ${status.nichtBenoetigt ? 'checked' : ''}${gesperrt ? ' disabled' : ''}
                       onchange="toggleGruppeNichtBenoetigt(this.checked)">
                Nicht benötigt
            </label>
            ${!gesperrt && gruppe.custom ? `<button type="button" class="gk-link gk-link-gefahr"
                    onclick="gruppeDeleteZusaetzlicheGruppe()">Gruppe entfernen</button>` : ''}
        </div>

        ${naechste.length ? `
            <p class="gk-label gk-naechste-label">Als Nächstes</p>
            <ol class="gk-naechste">
                ${naechste.map(g => `
                    <li>
                        <button type="button" class="${getGruppenZustand(g)}" onclick="selectGruppe('${jsArg(g.code)}')">
                            <span class="gk-naechste-code">${escapeHtml(g.code)}</span>
                            <span>${escapeHtml(g.bezeichnung)}</span>
                        </button>
                    </li>
                `).join('')}
            </ol>
        ` : ''}
    `;
}


/**
 * Rechte Spalte: Kennzahlen, Bauteile der Gruppe und Abschluss.
 * @returns {string}
 */
function renderGruppeRechts() {
    const gruppe = getGruppe(aktiveGruppe);
    if (!gruppe) return '';

    const gesperrt = istSchreibgeschuetzt();
    const vorgaben = getGruppenVorgaben(gruppe);
    const leitungen = getLeitungenDerGruppe(gruppe.code);
    const bauteile = getBauteileDerGruppe(gruppe.code);
    const bauteilVorschlaege = getOffeneBauteilVorschlaege(gruppe.code);
    const zeigeBauteile = !vorgaben.nurLeitungen || bauteile.length > 0;

    const stueck = liste => liste.reduce((summe, e) => summe + (Number(e.anzahl) || 1), 0);
    const gesamtLaenge = leitungen.reduce((summe, l) => summe + (Number(l.laenge) || 0) * (Number(l.anzahl) || 1), 0);
    const offen = getOffeneLeitungVorschlaege(gruppe.code).length + bauteilVorschlaege.length;

    return `
        <p class="gk-label">Stückliste ${escapeHtml(gruppe.code)}</p>
        <div class="gk-stats">
            <div><strong>${stueck(leitungen)}</strong><span>Leitungen</span></div>
            <div><strong>${formatLaenge(Math.round(gesamtLaenge * 10) / 10) || 0}<small>m</small></strong><span>Gesamtlänge</span></div>
            <div><strong>${stueck(bauteile)}</strong><span>Bauteile</span></div>
            <div class="${offen ? 'gk-akzent' : ''}"><strong>${offen}</strong><span>Vorschläge offen</span></div>
        </div>

        ${zeigeBauteile ? `
            <p class="gk-label">Bauteile</p>
            <div id="gruppen-bauteile-tabelle">${renderBauteilListe(bauteile, gesperrt ? [] : bauteilVorschlaege)}</div>
            ${gesperrt ? '' : `<button type="button" class="gk-link" onclick="gruppeOpenPicker('bauteil')">+ Bauteil</button>`}
        ` : ''}

        <div class="gk-abschluss">${renderGruppenAbschluss(gruppe, gesperrt)}</div>
    `;
}


/**
 * „Gruppe abschließen“ bzw. – wenn schon erledigt – weiter zur nächsten Gruppe.
 * @param {object} gruppe
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderGruppenAbschluss(gruppe, gesperrt) {
    const gruppen = getGruppen();
    const naechste = gruppen[gruppen.findIndex(g => g.code === gruppe.code) + 1];
    const weiterText = naechste
        ? `weiter zu ${escapeHtml(naechste.code)} ${escapeHtml(naechste.bezeichnung)}`
        : 'Das ist die letzte Gruppe';

    if (leseGruppenStatus(gruppe.code).abgeschlossen) {
        return `
            <p class="gk-erledigt">✓ ${escapeHtml(gruppe.code)} ist abgeschlossen
                ${gesperrt ? '' : '<button type="button" class="gk-link" onclick="gruppeWiederOeffnen()">wieder öffnen</button>'}
            </p>
            ${naechste ? `<button type="button" class="gk-abschliessen" onclick="gruppeWechseln(1)">
                Weiter zu ${escapeHtml(naechste.code)} →</button>` : ''}
        `;
    }

    return `
        <button type="button" class="gk-abschliessen" onclick="gruppeAbschliessen()"${gesperrt ? ' disabled' : ''}>
            Gruppe abschließen <kbd>⌘ ⏎</kbd>
        </button>
        <p class="gk-weiter">${weiterText}</p>
    `;
}


/**
 * Markiert die aktive Gruppe als abgeschlossen und springt zur nächsten.
 * @returns {void}
 */
export function gruppeAbschliessen() {
    if (!assertCanEdit('Gruppen abschließen')) return;
    const gruppen = getGruppen();
    const index = gruppen.findIndex(g => g.code === aktiveGruppe);
    if (index === -1) return;

    getGruppenStatus(aktiveGruppe).abgeschlossen = true;
    persistCurrentProjekt();

    const naechste = gruppen[index + 1];
    if (naechste) {
        selectGruppe(naechste.code);
        return;
    }
    renderGruppenListe();
    renderGruppenPanel();
}


/**
 * @returns {void}
 */
export function gruppeWiederOeffnen() {
    if (!assertCanEdit('Gruppen ändern')) return;
    getGruppenStatus(aktiveGruppe).abgeschlossen = false;
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();
}


/**
 * Tastenkürzel des Arbeitsbereichs: / Suche, J/K Gruppe wechseln, ⌘/Strg+Enter abschließen.
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function gruppeTastenkuerzel(event) {
    if (!document.getElementById('view-gruppen')?.classList.contains('active')) return;
    if (document.querySelector('.editor-overlay, .picker-overlay, #modal-overlay.active, #bauteil-edit-overlay.active')) return;

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (leseGruppenStatus(aktiveGruppe).abgeschlossen) gruppeWechseln(1);
        else gruppeAbschliessen();
        return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;

    if (event.key === '/') {
        event.preventDefault();
        gruppeOpenPicker('leitung');
    } else if (event.key === 'j' || event.key === 'J') {
        gruppeWechseln(1);
    } else if (event.key === 'k' || event.key === 'K') {
        gruppeWechseln(-1);
    }
}


let gruppenTastenAktiv = false;

/**
 * Tastenkürzel und „Klick daneben schließt die Suche“ einmalig registrieren.
 * @returns {void}
 */
function registriereGruppenEreignisse() {
    if (gruppenTastenAktiv) return;
    gruppenTastenAktiv = true;
    document.addEventListener('keydown', gruppeTastenkuerzel);
    document.addEventListener('mousedown', event => {
        if (pickerState?.art === 'leitung' && !event.target.closest?.('#gk-suche')) gruppeClosePicker();
    });
}


/**
 * Suchfeld über der Leitungstabelle; die Treffer klappen darunter auf.
 * @returns {string}
 */
function renderLeitungSuche() {
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
function aktualisiereLeitungDropdown() {
    const dropdown = document.getElementById('gk-dropdown');
    if (!dropdown) return;

    const offen = pickerState?.art === 'leitung';
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
        treffer.textContent = pickerState.suche.trim() || pickerState.kategorie
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
    if (pickerState?.art !== 'leitung') {
        const input = document.getElementById('gk-suche-input');
        pickerState = { art: 'leitung', suche: input?.value || '', kategorie: '' };
    }
    aktualisiereLeitungDropdown();
}


/**
 * Vorschläge der Gruppe als Pillen unter der Tabelle – ein Klick übernimmt.
 * @param {object} gruppe
 * @returns {string}
 */
function renderLeitungVorschlaege(gruppe) {
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
    getGruppenStatus(aktiveGruppe).nichtBenoetigt = Boolean(checked);
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
 * Aktion für ausgeblendete Leitungsvorschläge neben der Abschnittsüberschrift.
 * @returns {string}
 */
function renderLeitungVorschlaegeAktion() {
    const ausgeblendet = getGruppenStatus(aktiveGruppe).ausgeblendeteLeitungPresets.length;
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
function getOffeneBauteilVorschlaege(code) {
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
        pickerState = { art: 'bauteil', suche: '', typFilter: typ };
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

    return renderEditorOverlay({
        onClose: 'gruppeCancelBauteilFormular()',
        inhalt: `
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
    `
    });
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
    pickerState = null;
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
 * Bauteile der Gruppe als schlichte Liste (rechte Spalte); ein Klick öffnet das Bauteil.
 * Darunter die offenen Standardbauteile – mit Längen-Chips, falls die Gruppe welche vorgibt.
 * @param {object[]} bauteile
 * @param {string[]} [vorschlaege]
 * @returns {string}
 */
function renderBauteilListe(bauteile, vorschlaege = []) {
    if (!bauteile.length && !vorschlaege.length) {
        return '<p class="gk-leer-klein">Noch keine Bauteile.</p>';
    }

    const laengen = getGruppenVorgaben(getGruppe(aktiveGruppe)).bauteilLaengen || [];
    const erfasst = bauteile.map(bauteil => `
        <li>
            <button type="button" class="gk-bauteil${bauteil.artikelnummer ? '' : ' unvollstaendig'}${bauteil.id === aktivesBauteilId ? ' aktiv' : ''}"
                    title="${escapeAttr([getBauteilTypName(bauteil.typ), bauteil.artikelnummer || 'Artikel offen'].filter(Boolean).join(' · '))}"
                    onclick="gruppeEditBauteil('${jsArg(bauteil.id)}')">
                <span>${escapeHtml(getBauteilLabel(bauteil))}</span>
                <span class="gk-bauteil-anzahl">${Math.max(1, Number(bauteil.anzahl) || 1)}×</span>
            </button>
        </li>
    `).join('');

    const offen = vorschlaege.map(typ => {
        const id = jsArg(typ);
        const chips = laengen.map(l => renderChip({
            label: `${formatLaenge(l)} m`,
            onclick: `gruppeBauteilVorschlagUebernehmen('${id}', '${l}')`,
            klasse: 'chip-klein chip-laenge'
        })).join('');
        return `
            <li class="gk-bauteil-vorschlag">
                <button type="button" onclick="gruppeBauteilVorschlagUebernehmen('${id}', '')">+ ${escapeHtml(getBauteilTypName(typ))}</button>
                ${chips}
                <button type="button" class="gk-vorschlag-weg" title="Vorschlag in diesem Projekt ausblenden"
                        aria-label="Vorschlag ausblenden" onclick="toggleBauteilTypSchnellwahl('${id}', false)">×</button>
            </li>
        `;
    }).join('');

    return `<ul class="gk-bauteile">${erfasst}${offen}</ul>`;
}


/**
 * Bauteile stehen in der rechten Spalte – die wird samt Kennzahlen neu gezeichnet.
 * @returns {void}
 */
function aktualisiereBauteilTabelle() {
    renderGruppenRahmen();
}


/**
 * Zentriertes Bearbeitungsfenster über dem abgedunkelten Hintergrund.
 * Klick neben dem Dialog schließt ihn.
 * @param {{onClose: string, inhalt: string}} options
 * @returns {string}
 */
function renderEditorOverlay({ onClose, inhalt }) {
    if (!inhalt) return '';
    return `
        <div class="editor-overlay" onclick="${onClose}">
            <div class="editor-dialog" role="dialog" aria-modal="true"
                 onclick="event.stopPropagation()">
                ${inhalt}
            </div>
        </div>
    `;
}


/**
 * Formular für das gerade ausgewählte Bauteil. Es ist immer nur eines geöffnet.
 * @returns {string}
 */
function renderBauteilEditor() {
    if (neuesBauteilFormular || neuesLeitungFormular || pickerState) return '';
    const bauteil = aktivesBauteilId ? findBauteil(aktivesBauteilId) : null;
    if (!bauteil || bauteil.gruppe !== aktiveGruppe) return '';
    return renderEditorOverlay({
        onClose: 'gruppeCloseBauteilEditor()',
        inhalt: renderBauteilKarte(bauteil)
    });
}


/**
 * Springt zum Bauteilformular und setzt den Fokus.
 * @returns {void}
 */
function fokussiereBauteilEditor() {
    const karte = document.getElementById(`bauteil-karte-${aktivesBauteilId}`);
    if (!karte) return;

    karte.classList.add('gerade-angelegt');
    karte.querySelector('select, input')?.focus({ preventScroll: true });
}


/**
 * Öffnet ein bestehendes Bauteil im Formular.
 * @param {string} id
 * @returns {void}
 */
export function gruppeEditBauteil(id) {
    if (!findBauteil(id)) return;
    aktiveLeitungId = '';
    neuesBauteilFormular = null;
    neuesLeitungFormular = null;
    pickerState = null;
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
                    ${renderAnzahlStepper('bauteil', bauteil.id, bauteil.anzahl, gesperrt)}
                </div>
            </div>
            <div class="form-group">
                <label>Verwendung / Kommentar</label>
                <input type="text" value="${escapeHtml(bauteil.notiz || '')}" placeholder="z. B. Bedienpult links"${disabled}
                       oninput="gruppeUpdateBauteilText('${escapeHtml(bauteil.id)}', 'notiz', this.value)">
            </div>
            ${bauteil.artikelnummer ? `<p class="gruppen-karte-artikel">${escapeHtml(bauteil.bezeichnung || '')}
                <strong>${escapeHtml(bauteil.artikelnummer)}</strong></p>` : ''}
            <div class="leitung-karte-aktionen leitung-karte-aktionen-unten">
                ${gesperrt ? '' : `<button type="button" class="btn btn-danger"
                    onclick="gruppeDeleteBauteil('${escapeHtml(bauteil.id)}')">Entfernen</button>`}
                <button type="button" class="btn btn-primary" title="Bearbeitung beenden"
                        onclick="gruppeCloseBauteilEditor()">Fertig</button>
            </div>
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
                    ${renderAnzahlStepper('bauteil', bauteil.id, bauteil.anzahl, gesperrt)}
                </div>
            </div>
            <div class="form-group">
                <label>Verwendung / Kommentar</label>
                <input type="text" value="${escapeHtml(bauteil.notiz || '')}" placeholder="z. B. Kraftsensor Stößel"${disabled}
                       oninput="gruppeUpdateBauteilText('${id}', 'notiz', this.value)">
            </div>
            <div class="leitung-karte-aktionen leitung-karte-aktionen-unten">
                ${gesperrt ? '' : `<button type="button" class="btn btn-danger"
                    onclick="gruppeDeleteBauteil('${id}')">Entfernen</button>`}
                <button type="button" class="btn btn-primary" title="Bearbeitung beenden"
                        onclick="gruppeCloseBauteilEditor()">Fertig</button>
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
 * @param {{laenge?: number, direkt?: boolean}} [options] - `direkt` übernimmt ohne Formular.
 * @returns {void}
 */
export function gruppeAddBauteil(typ, options = {}) {
    if (!assertCanEdit('Bauteile hinzufügen')) return;
    if (!appState.currentProjekt.bauteile) appState.currentProjekt.bauteile = [];
    pickerState = null;

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
        anzahl: 1
    };
    const laenge = options.laenge ?? standardLaenge;
    if (laenge != null && !Number.isNaN(laenge)) {
        bauteil.laenge = laenge;
    }
    appState.currentProjekt.bauteile.push(bauteil);
    persistCurrentProjekt();

    if (options.direkt) {
        renderGruppenListe();
        renderGruppenPanel();
        return;
    }

    aktivesBauteilId = bauteil.id;
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereBauteilEditor();
}


/**
 * Übernimmt ein Bauteil direkt aus dem Katalog in die aktive Gruppe.
 * @param {string} artikelnummer
 * @returns {Promise<void>}
 */
export async function gruppeAddBauteilAusArtikel(artikelnummer) {
    if (!assertCanEdit('Bauteile hinzufügen')) return;

    const artikel = (appState.bauteileKatalog?.artikel || [])
        .find(a => a.artikelnummer === artikelnummer);
    if (!artikel) return;

    pickerState = null;
    if (!appState.currentProjekt.bauteile) appState.currentProjekt.bauteile = [];

    const bauteil = {
        id: generateId('btl'),
        gruppe: aktiveGruppe,
        typ: artikel.typ || '',
        hersteller: artikel.hersteller || '',
        artikelnummer: artikel.artikelnummer,
        bezeichnung: artikel.beschreibung || '',
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

/* -------------------------------------------------------------------------- */
/* Auswahldialog für Leitungen und Bauteile                                    */
/* -------------------------------------------------------------------------- */

/**
 * Ein Listeneintrag im Auswahldialog.
 * @param {{onclick: string, titel: string, meta: string, marke?: string}} eintrag
 * @returns {string}
 */
function renderPickerEintrag(eintrag) {
    const knopf = `
        <button type="button" class="picker-eintrag" onclick="${eintrag.onclick}">
            <span class="picker-eintrag-titel">${markiereSuche(eintrag.titel, pickerState?.suche)}${eintrag.marke || ''}</span>
            <span class="picker-eintrag-meta">${escapeHtml(eintrag.meta)}</span>
        </button>
    `;
    if (!eintrag.laengen?.length) return knopf;

    // Ein Klick auf eine Länge übernimmt die Leitung sofort – ohne Bearbeitungsfenster.
    const chips = eintrag.laengen.map(l => renderChip({
        label: escapeHtml(l.label),
        onclick: l.onclick,
        title: l.title || '',
        klasse: `chip-klein chip-laenge${l.standard ? ' chip-standard' : ''}`
    })).join('');
    return `<div class="picker-zeile">${knopf}<div class="picker-laengen">${chips}</div></div>`;
}


/**
 * Text escapen und die Suchbegriffe darin hervorheben.
 * @param {string} text
 * @param {string} [suche]
 * @returns {string}
 */
function markiereSuche(text, suche) {
    const sicher = escapeHtml(text || '');
    const woerter = String(suche || '').trim().split(/\s+/).filter(w => w.length >= 2);
    if (!woerter.length) return sicher;
    const muster = woerter
        .map(w => escapeHtml(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    return sicher.replace(new RegExp(`(${muster})`, 'gi'), '<mark>$1</mark>');
}


/**
 * Wenige Längen für den Schnellzugriff im Auswahlfenster: die üblichen Katalog-
 * Standardlängen plus die Vorgabe des Presets. Alles Weitere über das Fenster.
 * @param {number[]} laengen
 * @param {number} [vorgabe]
 * @returns {number[]}
 */
function waehleSchnellLaengen(laengen, vorgabe) {
    if (laengen.length <= 5) return laengen;

    const ueblich = appState.katalog?.standardlaengen?.length
        ? appState.katalog.standardlaengen
        : [1, 2, 3, 5, 10, 15, 20];
    const auswahl = new Set(laengen.filter(l => ueblich.includes(l)));
    if (vorgabe && laengen.includes(Number(vorgabe))) auswahl.add(Number(vorgabe));

    const sortiert = Array.from(auswahl).sort((a, b) => a - b).slice(0, 5);
    return sortiert.length ? sortiert : laengen.slice(0, 5);
}


/**
 * Längen-Chips eines Picker-Eintrags inkl. „…“ für alle übrigen Längen.
 * @param {number[]} laengen
 * @param {(laenge: number) => string} onclick
 * @param {string} weitereOnclick - Öffnet die Leitung im Fenster mit allen Längen.
 * @param {number} [vorgabe]
 * @returns {{label: string, onclick: string, standard?: boolean, title?: string}[]}
 */
function bildeLaengenChips(laengen, onclick, weitereOnclick, vorgabe) {
    const schnell = waehleSchnellLaengen(laengen, vorgabe);
    const chips = schnell.map(l => ({
        label: `${formatLaenge(l)} m`,
        onclick: onclick(l),
        standard: Number(vorgabe) === l,
        title: Number(vorgabe) === l ? 'Standardlänge' : `${formatLaenge(l)} m übernehmen`
    }));
    if (laengen.length > schnell.length) {
        chips.push({ label: '…', onclick: weitereOnclick, title: `Alle ${laengen.length} Längen` });
    }
    return chips;
}


/**
 * @param {string} titel
 * @param {string[]} eintraege
 * @returns {string}
 */
function renderPickerSektion(titel, eintraege) {
    if (!eintraege.length) return '';
    return `
        <div class="picker-sektion">
            <h6 class="picker-sektion-titel">${escapeHtml(titel)}</h6>
            ${eintraege.join('')}
        </div>
    `;
}


/**
 * @param {string} text
 * @param {string} suche
 * @returns {boolean}
 */
function passtZurSuche(text, suche) {
    if (!suche) return true;
    // Jedes Wort muss vorkommen – „m12 off“ findet „M12 Buchse → offenes Ende“.
    const heuhaufen = String(text || '').toLowerCase();
    return suche.toLowerCase().split(/\s+/).filter(Boolean).every(wort => heuhaufen.includes(wort));
}


/**
 * Entfernt die Längenangabe am Ende einer Katalog-Beschreibung.
 * @param {string} beschreibung
 * @returns {string}
 */
function ohneLaengenangabe(beschreibung) {
    return String(beschreibung || '').replace(/[\s-]*\d+([.,]\d+)?\s*m\s*$/i, '').trim();
}


/**
 * @param {object} artikel
 * @returns {boolean}
 */
function istBeckhoffLeitung(artikel) {
    return String(artikel?.hersteller || '').toLowerCase() === 'beckhoff';
}


/**
 * Kurztitel der Kategorie für Beckhoff-Picker (z. B. Powerleitung).
 * @param {string} kategorie
 * @returns {string}
 */
function beckhoffKategorieLabel(kategorie) {
    const labels = {
        power: 'Powerleitung',
        ethercat: 'EtherCAT-Leitung',
        sensor: 'Sensorleitung',
        cplink: 'CP-Link-Leitung',
        motor: 'Motorleitung',
        geber: 'Geberleitung',
        oelflex: 'Ölflexleitung',
        sonstiges: 'Leitung'
    };
    if (labels[kategorie]) return labels[kategorie];
    return getKategorieName(kategorie) || 'Leitung';
}


/**
 * Bezeichnung für neue Katalog-Leitungen, wenn das Feld leer bleibt.
 * @param {{kategorie: string, hersteller: string, artikelnummer: string, steckerA: string, steckerB: string, laenge: number, meterware: boolean}} daten
 * @returns {string}
 */
function bildeNeueLeitungBezeichnung(daten) {
    const typ = beckhoffKategorieLabel(daten.kategorie);
    const artikel = String(daten.artikelnummer || '').trim();
    const stecker = [
        formatBeckhoffSteckerAnzeige(daten.steckerA),
        formatBeckhoffSteckerAnzeige(daten.steckerB)
    ].filter(Boolean).join(' → ');
    const laengeText = daten.meterware
        ? 'Meterware'
        : (daten.laenge > 0 ? `${formatLaenge(daten.laenge)} m` : '');

    if (String(daten.hersteller || '').toLowerCase() === 'beckhoff' || /^ZK/i.test(artikel)) {
        return [typ && artikel ? `${typ} | ${artikel}` : (typ || artikel), stecker, laengeText]
            .filter(Boolean)
            .join(' · ');
    }

    return [typ, stecker, laengeText, artikel].filter(Boolean).join(' · ') || artikel || typ;
}


/**
 * Steckeranzeige für Beckhoff: „M8 4-polig gerade“ → „M8 gerade“.
 * @param {string} stecker
 * @returns {string}
 */
function formatBeckhoffSteckerAnzeige(stecker) {
    if (!stecker || /^offen$/i.test(stecker)) return 'offen';
    return String(stecker)
        .replace(/\s+\d+-polig/gi, '')
        .replace(/\s+(Stecker|Buchse)/gi, '')
        .replace(/\s+/g, ' ')
        .trim() || stecker;
}


/**
 * Titel und Metazeile eines Katalog-Reiheneintrags im Picker.
 * @param {string} prefix
 * @param {object[]} artikel
 * @returns {{titel: string, meta: string}}
 */
function formatKatalogReihenLabel(prefix, artikel) {
    const erste = artikel[0];
    const laengen = artikel.map(a => a.laenge).filter(l => l > 0).sort((a, b) => a - b);
    const laengenText = !laengen.length
        ? ''
        : (artikel.length === 1
            ? `${formatLaenge(erste.laenge)} m`
            : `${laengen.length} Längen (${formatLaenge(laengen[0])}–${formatLaenge(laengen[laengen.length - 1])} m)`);

    if (istBeckhoffLeitung(erste)) {
        const titel = `${beckhoffKategorieLabel(erste.kategorie)} | ${prefix}-0xxx`;
        const stecker = `${formatBeckhoffSteckerAnzeige(erste.steckerA)} → ${formatBeckhoffSteckerAnzeige(erste.steckerB)}`;
        return {
            titel,
            meta: [stecker, erste.hersteller || '', laengenText].filter(Boolean).join(' · ')
        };
    }

    if (artikel.length === 1) {
        return {
            titel: erste.beschreibung || erste.artikelnummer,
            meta: `${erste.artikelnummer} · ${erste.hersteller || ''} · ${formatLaenge(erste.laenge)} m`
        };
    }

    return {
        titel: ohneLaengenangabe(erste.beschreibung) || prefix,
        meta: `Reihe ${prefix} · ${erste.hersteller || ''} · ${laengenText}`
    };
}


/**
 * Katalogtreffer nach Leitungsreihe zusammenfassen – sonst unterscheiden sich
 * die Einträge nur in der Länge und die Liste wird unlesbar.
 * @param {string} suche
 * @param {string} [kategorie]
 * @returns {string[]}
 */
function renderKatalogReihen(suche, kategorie = '') {
    const reihen = new Map();

    getKonfektionierteKatalogArtikel({ suche, kategorie, limit: 600 }).forEach(artikel => {
        const prefix = deriveArtikelPrefix(artikel.artikelnummer) || artikel.artikelnummer;
        if (!reihen.has(prefix)) reihen.set(prefix, []);
        reihen.get(prefix).push(artikel);
    });

    return Array.from(reihen.entries()).slice(0, 30).map(([prefix, artikel]) => {
        const erste = artikel[0];
        const { titel, meta } = formatKatalogReihenLabel(prefix, artikel);

        if (artikel.length === 1) {
            return renderPickerEintrag({
                onclick: `gruppeAddLeitungAusArtikel('${jsArg(erste.artikelnummer)}')`,
                titel,
                meta
            });
        }

        const reiheOeffnen = `gruppeAddLeitungAusReihe('${jsArg(prefix)}', '${jsArg(erste.artikelnummer)}')`;
        const nachLaenge = new Map(artikel.filter(a => a.laenge > 0).map(a => [Number(a.laenge), a]));
        return renderPickerEintrag({
            onclick: reiheOeffnen,
            titel,
            meta,
            laengen: bildeLaengenChips(
                Array.from(nachLaenge.keys()).sort((a, b) => a - b),
                l => `gruppeAddKatalogArtikelDirekt('${jsArg(nachLaenge.get(l).artikelnummer)}')`,
                reiheOeffnen
            )
        });
    });
}


/**
 * Leitungen, die in diesem Projekt zuletzt erfasst wurden – je Ausführung einmal.
 * In Anlagen wiederholen sich dieselben Leitungen ständig.
 * @param {number} [anzahl]
 * @returns {object[]}
 */
function getZuletztVerwendeteLeitungen(anzahl = 5) {
    const alle = appState.currentProjekt?.leitungen || [];
    const gesehen = new Set();
    const ergebnis = [];

    for (let i = alle.length - 1; i >= 0 && ergebnis.length < anzahl; i--) {
        const leitung = alle[i];
        const artikelnummer = leitung.artikelCustom || leitung.artikelnummer;
        if (!artikelnummer) continue;

        const schluessel = istMeterwareKategorie(leitung.kategorie) || leitung.artikelCustom
            ? artikelnummer
            : [leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, leitung.artikelPrefix].join('|');
        if (gesehen.has(schluessel)) continue;
        gesehen.add(schluessel);
        ergebnis.push(leitung);
    }
    return ergebnis;
}


/**
 * @param {object} leitung
 * @returns {number[]}
 */
function getLaengenFuerLeitung(leitung) {
    if (istMeterwareKategorie(leitung.kategorie) || leitung.artikelCustom) return [];
    if (!leitung.artikelPrefix && !(leitung.steckerA && leitung.steckerB)) return [];
    return getLaengenOptionen(
        leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, leitung.artikelPrefix
    );
}


/**
 * Kategorien, nach denen im Auswahlfenster gefiltert werden kann.
 * @returns {object[]}
 */
function getPickerKategorien() {
    const vorhanden = new Set((appState.katalog?.artikel || []).map(a => a.kategorie));
    return getKategorien().filter(k => vorhanden.has(k.id));
}


/**
 * Filter-Chips über der Trefferliste.
 * @returns {string}
 */
function renderPickerFilter() {
    if (!pickerState || pickerState.art !== 'leitung') return '';
    const aktiv = pickerState.kategorie || '';

    return [{ id: '', name: 'Alle', icon: '' }, ...getPickerKategorien()].map(k => renderChip({
        label: `${k.icon ? `${escapeHtml(k.icon)} ` : ''}${escapeHtml(k.name)}`,
        onclick: `gruppePickerKategorie('${jsArg(k.id)}')`,
        aktiv: aktiv === k.id,
        klasse: 'chip-klein'
    })).join('');
}


/**
 * Trefferliste für Leitungen: Standard der Gruppe, zuletzt verwendet, weitere
 * übliche Leitungen, Katalog. Ein Klick auf eine Länge übernimmt sofort.
 * @param {string} suche
 * @returns {string}
 */
function renderPickerLeitungen(suche) {
    const vorgaben = getGruppenVorgaben(getGruppe(aktiveGruppe));
    const erfasst = getLeitungenDerGruppe(aktiveGruppe);
    const kategorie = pickerState?.kategorie || '';

    const presetEintrag = preset => {
        const id = jsArg(preset.id);
        const anzahl = erfasst.filter(l => {
            if (l.presetId === preset.id) return true;
            return preset.artikelPrefix && l.artikelPrefix === preset.artikelPrefix;
        }).length;
        let meta = getPresetBeschreibung(preset);
        if (presetMehrfachMoeglich(preset) && anzahl) {
            meta += ` · ${anzahl}× erfasst`;
        } else if (presetIstErfasst(preset, erfasst)) {
            meta += ' · bereits erfasst';
        }
        return renderPickerEintrag({
            onclick: `gruppeAddLeitung('${id}')`,
            titel: preset.label,
            meta,
            marke: preset.custom ? ' <span class="picker-marke">★ eigener Standard</span>' : '',
            laengen: bildeLaengenChips(
                getPresetLaengen(preset),
                l => `gruppeVorschlagUebernehmen('${id}', '${l}')`,
                `gruppeAddLeitung('${id}')`,
                preset.laenge
            )
        });
    };

    const filter = preset => (!kategorie || preset.kategorie === kategorie) && passtZurSuche(
        `${preset.label} ${preset.bezeichnung || ''} ${getPresetBeschreibung(preset)} ${preset.artikelnummer || ''}`,
        suche
    );

    const standard = vorgaben.standardLeitungen.filter(filter).map(presetEintrag);
    const weitere = vorgaben.weitereLeitungen.filter(filter).map(presetEintrag);

    const zuletzt = getZuletztVerwendeteLeitungen()
        .filter(l => !kategorie || l.kategorie === kategorie)
        .filter(l => passtZurSuche(
            `${l.bezeichnung || ''} ${getLeitungAusfuehrung(l)} ${l.artikelnummer || ''} ${l.artikelCustom || ''}`,
            suche
        ))
        .map(l => {
            const id = jsArg(l.id);
            const laenge = Number(l.laenge) || 0;
            return renderPickerEintrag({
                onclick: `gruppeAddLeitungWie('${id}', '')`,
                titel: l.bezeichnung || getLeitungAusfuehrung(l),
                meta: [getLeitungAusfuehrung(l), laenge ? `zuletzt ${formatLaenge(laenge)} m` : '', l.gruppe]
                    .filter(Boolean).join(' · '),
                laengen: bildeLaengenChips(
                    getLaengenFuerLeitung(l),
                    wert => `gruppeAddLeitungWie('${id}', '${wert}')`,
                    `gruppeAddLeitungWie('${id}', '', true)`,
                    laenge
                )
            });
        });

    // Eigene Zusammenstellung: für die gefilterte Kategorie bzw. passende Suchbegriffe.
    const zusammenstellen = getKategorien()
        .filter(k => kategorie
            ? k.id === kategorie
            : suche.length >= 2 && passtZurSuche(`${k.name} ${k.id}`, suche))
        .map(k => renderPickerEintrag({
            onclick: `gruppeAddLeitungMitKategorie('${jsArg(k.id)}')`,
            titel: `${k.icon || ''} ${k.name} selbst zusammenstellen`.trim(),
            meta: istMeterwareKategorie(k.id)
                ? 'Typ / Querschnitt und Länge wählen'
                : 'Stecker A, Stecker B und Länge wählen'
        }));

    const katalog = suche.length >= 2 || kategorie ? renderKatalogReihen(suche, kategorie) : [];

    const treffer = renderPickerSektion(`Standard in ${aktiveGruppe}`, standard)
        + renderPickerSektion('Zuletzt im Projekt verwendet', zuletzt)
        + renderPickerSektion('Weitere übliche Leitungen', weitere)
        + renderPickerSektion('Selbst zusammenstellen', zusammenstellen)
        + renderPickerSektion('Aus dem Katalog', katalog);

    if (treffer) return treffer;

    return `<p class="picker-leer">Kein Treffer${suche ? ` für „${escapeHtml(suche)}“` : ''}.
            Lege die Leitung unten neu im Katalog an.</p>`;
}


/**
 * Artikel eines Bauteiltyps zur Auswahl – wenn ein Typ mehrere Varianten hat.
 * @param {string} typ
 * @param {string} suche
 * @returns {string}
 */
function renderPickerBauteilArtikel(typ, suche) {
    const name = getBauteilTypName(typ);
    const artikelliste = getArtikelAuswahlFuerGruppe(typ)
        .filter(a => passtZurSuche(
            `${a.artikelnummer} ${a.beschreibung || ''} ${a.hersteller || ''}`,
            suche
        ));

    const eintraege = artikelliste.map(artikel => renderPickerEintrag({
        onclick: `gruppeAddBauteilAusArtikel('${escapeHtml(artikel.artikelnummer)}')`,
        titel: artikel.beschreibung || artikel.artikelnummer,
        meta: `${artikel.artikelnummer}${artikel.hersteller ? ` · ${artikel.hersteller}` : ''}`
    }));

    const treffer = renderPickerSektion(`${name} – Artikel wählen`, eintraege);
    if (treffer) return treffer;

    return `<p class="picker-leer">Kein Artikel zu „${escapeHtml(name)}“ gefunden.
            Lege das Bauteil unten neu im Katalog an.</p>`;
}


/**
 * Trefferliste für Bauteile: erst die Typen der Gruppe, dann der Bauteilkatalog.
 * @param {string} suche
 * @returns {string}
 */
function renderPickerBauteile(suche) {
    if (pickerState?.typFilter) {
        return renderPickerBauteilArtikel(pickerState.typFilter, suche);
    }

    const vorgaben = getGruppenVorgaben(getGruppe(aktiveGruppe));
    const erfasst = new Set(getBauteileDerGruppe(aktiveGruppe).map(b => b.typ));

    const typEintrag = typ => {
        const name = getBauteilTypName(typ);
        const anzahl = getArtikelAuswahlFuerGruppe(typ).length;
        return renderPickerEintrag({
            onclick: `gruppePickerBauteilTyp('${escapeHtml(typ)}')`,
            titel: name,
            meta: [
                anzahl ? `${anzahl} Artikel im Katalog` : 'noch kein Katalogartikel',
                erfasst.has(typ) ? 'bereits erfasst' : ''
            ].filter(Boolean).join(' · ')
        });
    };

    const filter = typ => passtZurSuche(getBauteilTypName(typ), suche);
    const standard = vorgaben.standardBauteilTypen.filter(filter).map(typEintrag);
    const weitere = vorgaben.weitereBauteilTypen.filter(filter).map(typEintrag);

    const katalog = suche.length >= 2
        ? (appState.bauteileKatalog?.artikel || [])
            .filter(a => passtZurSuche(`${a.artikelnummer} ${a.beschreibung} ${a.hersteller}`, suche))
            .slice(0, 25)
            .map(artikel => renderPickerEintrag({
                onclick: `gruppeAddBauteilAusArtikel('${escapeHtml(artikel.artikelnummer)}')`,
                titel: artikel.beschreibung || artikel.artikelnummer,
                meta: `${artikel.artikelnummer} · ${artikel.hersteller || ''} · ${getBauteilTypName(artikel.typ)}`
            }))
        : [];

    const treffer = renderPickerSektion(`Standard in ${aktiveGruppe}`, standard)
        + renderPickerSektion('Weitere Bauteiltypen', weitere)
        + renderPickerSektion('Aus dem Bauteilkatalog', katalog);

    if (treffer) return treffer;

    return `<p class="picker-leer">Kein Treffer für „${escapeHtml(suche)}“.
            Lege das Bauteil unten neu im Katalog an.</p>`;
}


/**
 * @returns {string}
 */
function renderPickerErgebnisse() {
    if (!pickerState) return '';
    const suche = pickerState.suche.trim().toLowerCase();
    return pickerState.art === 'bauteil'
        ? renderPickerBauteile(suche)
        : renderPickerLeitungen(suche);
}


/**
 * Overlay zur Auswahl einer Leitung bzw. eines Bauteils.
 * @returns {string}
 */
function renderPicker() {
    // Leitungen werden über das Suchfeld über der Tabelle gewählt (siehe renderLeitungSuche).
    if (pickerState?.art !== 'bauteil') return '';

    const typFilter = pickerState.typFilter || '';
    const gruppe = getGruppe(aktiveGruppe);
    const titel = typFilter ? `${getBauteilTypName(typFilter)} wählen` : 'Bauteil hinzufügen';
    const suchePlaceholder = typFilter
        ? 'Artikel suchen: Nummer, Bezeichnung…'
        : 'Bauteil suchen: Typ, Artikelnummer, Hersteller…';

    return `
        <div class="picker-overlay" onclick="gruppeClosePicker()">
            <div class="picker-dialog" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
                <div class="picker-kopf">
                    <h4>${escapeHtml(titel)}</h4>
                    <span class="picker-gruppe">${escapeHtml(aktiveGruppe)} ${escapeHtml(gruppe?.bezeichnung || '')}</span>
                    <button type="button" class="picker-close" title="Schließen"
                            onclick="gruppeClosePicker()">✕</button>
                </div>
                ${typFilter ? `
                    <button type="button" class="picker-zurueck" onclick="gruppePickerZurueck()">
                        ← Alle Bauteiltypen
                    </button>
                ` : ''}
                <input type="search" id="picker-suche" class="picker-suche" autocomplete="off"
                       value="${escapeHtml(pickerState.suche)}"
                       placeholder="${suchePlaceholder}"
                       oninput="gruppeOnPickerSuche(this.value)"
                       onkeydown="gruppeOnPickerTaste(event)">
                <div class="picker-ergebnisse" id="picker-ergebnisse"
                     onkeydown="gruppeOnPickerListeTaste(event)">${renderPickerErgebnisse()}</div>
                <div class="picker-fuss">
                    <button type="button" class="btn btn-secondary btn-small"
                            onclick="gruppeAddBauteil('')">Leeres Bauteil</button>
                    <button type="button" class="btn btn-primary btn-small"
                            onclick="gruppeOpenBauteilFormular('', '${jsArg(typFilter)}')">+ Neu im Katalog anlegen</button>
                </div>
            </div>
        </div>
    `;
}


/**
 * @param {string} art - 'leitung' oder 'bauteil'.
 * @returns {void}
 */
export function gruppeOpenPicker(art) {
    if (!assertCanEdit('Positionen hinzufügen')) return;
    if (art !== 'bauteil') {
        const input = document.getElementById('gk-suche-input');
        if (!input) return;
        input.focus();
        input.select();
        gruppeSucheOeffnen();
        return;
    }
    pickerState = { art: 'bauteil', suche: '' };
    renderGruppenPanel();
    document.getElementById('picker-suche')?.focus();
}


/**
 * @returns {void}
 */
export function gruppeClosePicker() {
    if (!pickerState) return;
    if (pickerState.art === 'leitung') {
        // Die Suche steht fest über der Tabelle – nur die Trefferliste schließen.
        pickerState = null;
        const input = document.getElementById('gk-suche-input');
        if (input) {
            input.value = '';
            input.blur();
        }
        aktualisiereLeitungDropdown();
        return;
    }
    pickerState = null;
    renderGruppenPanel();
}


/**
 * Container der Trefferliste – Suchfeld über der Tabelle bzw. Bauteil-Dialog.
 * @returns {HTMLElement|null}
 */
function getPickerErgebnisse() {
    return document.getElementById(pickerState?.art === 'leitung' ? 'gk-ergebnisse' : 'picker-ergebnisse');
}


/**
 * Bauteiltyp im Picker gewählt: bei einem Artikel direkt übernehmen,
 * bei mehreren die Artikelliste öffnen, sonst leeres Formular.
 * @param {string} typ
 * @returns {void}
 */
export function gruppePickerBauteilTyp(typ) {
    if (!assertCanEdit('Bauteile hinzufügen')) return;
    if (!pickerState || pickerState.art !== 'bauteil') {
        gruppeAddBauteil(typ);
        return;
    }

    const artikelliste = getArtikelAuswahlFuerGruppe(typ);
    if (artikelliste.length <= 1) {
        gruppeAddBauteil(typ);
        return;
    }

    pickerState = { art: 'bauteil', suche: '', typFilter: typ };
    renderGruppenPanel();
    document.getElementById('picker-suche')?.focus();
}


/**
 * Aus der Artikelauswahl zurück zur Typenliste.
 * @returns {void}
 */
export function gruppePickerZurueck() {
    if (!pickerState) return;
    pickerState = { art: pickerState.art, suche: '' };
    renderGruppenPanel();
    document.getElementById('picker-suche')?.focus();
}


/**
 * Zeichnet nur die Trefferliste neu, damit der Cursor im Suchfeld bleibt.
 * @param {string} wert
 * @returns {void}
 */
export function gruppeOnPickerSuche(wert) {
    if (!pickerState) gruppeSucheOeffnen();
    if (!pickerState) return;
    pickerState.suche = wert;
    if (pickerState.art === 'leitung') {
        aktualisiereLeitungDropdown();
        return;
    }
    const container = getPickerErgebnisse();
    if (container) container.innerHTML = renderPickerErgebnisse();
}


/**
 * Enter übernimmt den ersten Treffer, Escape schließt bzw. geht eine Ebene zurück.
 * @param {KeyboardEvent} event
 * @returns {void}
 */
export function gruppeOnPickerTaste(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        if (pickerState?.typFilter) {
            gruppePickerZurueck();
            return;
        }
        gruppeClosePicker();
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        getPickerErgebnisse()?.querySelector('.picker-eintrag')?.click();
        return;
    }
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        getPickerErgebnisse()?.querySelector('.picker-eintrag')?.focus();
    }
}


/**
 * Pfeiltasten in der Trefferliste: hoch/runter zwischen den Einträgen,
 * links/rechts zu den Längen-Chips. Ganz oben geht es zurück ins Suchfeld.
 * @param {KeyboardEvent} event
 * @returns {void}
 */
export function gruppeOnPickerListeTaste(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        gruppeClosePicker();
        return;
    }

    const container = event.currentTarget;
    if (!container || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const zeile = event.target.closest('.picker-zeile');
        if (!zeile) return;
        const knoepfe = Array.from(zeile.querySelectorAll('button'));
        const index = knoepfe.indexOf(event.target);
        knoepfe[index + (event.key === 'ArrowRight' ? 1 : -1)]?.focus();
        return;
    }

    const eintraege = Array.from(container.querySelectorAll('.picker-eintrag'));
    const aktuell = event.target.closest('.picker-zeile')?.querySelector('.picker-eintrag') || event.target;
    const index = eintraege.indexOf(aktuell);
    const ziel = eintraege[index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (ziel) ziel.focus();
    else if (event.key === 'ArrowUp') {
        document.getElementById(pickerState?.art === 'leitung' ? 'gk-suche-input' : 'picker-suche')?.focus();
    }
}


/**
 * Filtert das Auswahlfenster auf eine Leitungskategorie (erneuter Klick hebt auf).
 * @param {string} kategorie
 * @returns {void}
 */
export function gruppePickerKategorie(kategorie) {
    if (!pickerState || pickerState.art !== 'leitung') return;
    pickerState.kategorie = pickerState.kategorie === kategorie ? '' : kategorie;
    aktualisiereLeitungDropdown();
    const ergebnisse = document.getElementById('gk-ergebnisse');
    if (ergebnisse) ergebnisse.scrollTop = 0;
    document.getElementById('gk-suche-input')?.focus();
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
        : '<p class="text-muted gruppen-eigene-button-leer">Noch keine eigenen Standardleitungen für diese Gruppe.</p>';

    const formOpen = Boolean(eigenerButtonFormular && eigenerButtonFormular.gruppeCode === gruppenCode);

    return `
        <div class="gruppen-eigene-button-wrap">
            <h6>Selbst angelegte Standardleitungen</h6>
            <p class="text-muted">
                Gelten für alle Nutzer und alle Projekte und erscheinen mit ★ in den Vorschlägen dieser Gruppe.
            </p>
            ${liste}
            ${formOpen ? renderEigenerButtonFormular() : `
                <button type="button" class="btn btn-secondary btn-small"
                        onclick="gruppeOpenEigenerButtonFormular('${escapeHtml(gruppenCode)}')">
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
    if (!assertCanEdit('Standardleitungen speichern')) return;
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

    const gruppenCode = leitung.gruppe || aktiveGruppe;
    try {
        const preset = presetFromLeitung(leitung, label.trim());
        leitung.presetId = await addCustomGruppenPreset(gruppenCode, preset);
        standardAngebotIds.delete(leitungId);
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
    pickerState = null;
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

    if (aktiveLeitungId) standardAngebotIds.add(aktiveLeitungId);
    renderGruppenPanel();

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


/* -------------------------------------------------------------------------- */
/* Standardleitungen als Vorschlagszeilen                                      */
/* -------------------------------------------------------------------------- */

/**
 * Presets mit Artikelreihe (z. B. ZK1090-3131) dürfen mehrfach erfasst werden –
 * in der Praxis braucht man oft viele gleiche Steckerpaare in unterschiedlichen Längen.
 * @param {object} preset
 * @returns {boolean}
 */
function presetMehrfachMoeglich(preset) {
    return Boolean(preset?.artikelPrefix);
}


/**
 * Prüft, ob eine Standardleitung in dieser Gruppe schon erfasst ist.
 * Ältere Projekte kennen `presetId` noch nicht, daher der Rückfall auf Reihe und Bezeichnung.
 * @param {object} preset
 * @param {object[]} leitungen
 * @returns {boolean}
 */
function presetIstErfasst(preset, leitungen) {
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
function getOffeneLeitungVorschlaege(code) {
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
function getPresetLaengen(preset) {
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
function getPresetBeschreibung(preset) {
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
    const status = getGruppenStatus(aktiveGruppe);
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
    getGruppenStatus(aktiveGruppe).ausgeblendeteLeitungPresets = [];
    persistCurrentProjekt();
    renderGruppenPanel();
}


/**
 * Übernimmt alle offenen Standardleitungen mit ihrer Standardlänge.
 * @returns {void}
 */
export function gruppeAlleVorschlaegeUebernehmen() {
    if (!assertCanEdit('Leitungen hinzufügen')) return;
    getOffeneLeitungVorschlaege(aktiveGruppe).forEach(preset => {
        gruppeAddLeitung(preset.id, { laenge: preset.laenge || 0, direkt: true, stillsam: true });
    });
    renderGruppenListe();
    renderGruppenPanel();
}


/**
 * Längenzelle einer erfassten Leitung – immer direkt in der Liste änderbar.
 * @param {object} leitung
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderLaengeZelle(leitung, gesperrt) {
    if (gesperrt) {
        return leitung.laenge ? `${formatLaenge(leitung.laenge)} m` : '–';
    }

    const id = escapeHtml(leitung.id);
    const meterware = istMeterwareKategorie(leitung.kategorie);
    const laengen = meterware
        ? []
        : getLaengenOptionen(
            leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, leitung.artikelPrefix
        );
    const freieEingabe = meterware
        || !laengen.length
        || (leitung.laenge > 0 && !laengen.includes(Number(leitung.laenge)) && !laengen.includes(leitung.laenge));

    if (freieEingabe) {
        return `
            <span class="laenge-zelle" onclick="event.stopPropagation()" ondblclick="event.stopPropagation()">
                <input type="number" class="laenge-zelle-input" min="0" step="0.1"
                       value="${leitung.laenge || ''}" placeholder="m" aria-label="Länge in Metern"
                       onchange="event.stopPropagation(); gruppeUpdateLeitung('${id}', 'laenge', this.value)"
                       onclick="event.stopPropagation()">
                <span class="laenge-zelle-einheit">m</span>
            </span>
        `;
    }

    return `
        <select class="vorschlag-laenge" aria-label="Länge wählen"
                onclick="event.stopPropagation()"
                ondblclick="event.stopPropagation()"
                onchange="event.stopPropagation(); gruppeUpdateLeitung('${id}', 'laenge', this.value)">
            ${optionen([{ value: '', label: 'Länge…' },
                ...laengen.map(l => ({ value: l, label: `${formatLaenge(l)} m` }))], leitung.laenge || '')}
        </select>
    `;
}


/**
 * Stecker kurz für die Spalte „Verbindung“ (z. B. „M12 Buchse“, „offen“).
 * @param {string} stecker
 * @returns {string}
 */
function formatSteckerTag(stecker) {
    if (!stecker) return '?';
    if (stecker === 'offen') return 'offen';
    return formatSteckerKurz(stecker).replace(/\s+gewinkelt$/, ' ↳');
}


/**
 * Steckerpaar als zwei Etiketten: A gefüllt, B gestrichelt.
 * @param {object} leitung
 * @returns {string}
 */
function renderVerbindung(leitung) {
    const meterware = istMeterwareKategorie(leitung.kategorie);
    const a = meterware ? 'offen' : formatSteckerTag(leitung.steckerA);
    const b = meterware ? 'offen' : formatSteckerTag(leitung.steckerB);
    const klasse = wert => (wert === '?' ? ' fehlt' : '');
    return `
        <span class="gk-stecker gk-stecker-a${klasse(a)}">${escapeHtml(a)}</span>
        <span class="gk-stecker-strich" aria-hidden="true">–</span>
        <span class="gk-stecker gk-stecker-b${klasse(b)}">${escapeHtml(b)}</span>
    `;
}


/**
 * Leitungen der Gruppe: Verbindung, Leitung, Länge, Stück. Ein Klick auf die Zeile öffnet sie.
 * @param {object[]} leitungen
 * @returns {string}
 */
function renderLeitungTabelle(leitungen) {
    if (!leitungen.length) {
        return `<p class="gk-tabelle-leer">Noch keine Leitungen in ${escapeHtml(aktiveGruppe)}.
                ${istSchreibgeschuetzt() ? '' : 'Oben suchen oder unten einen Vorschlag übernehmen.'}</p>`;
    }

    const gesperrt = istSchreibgeschuetzt();
    const zeilen = leitungen.map(leitung => {
        aktualisiereArtikel(leitung);
        const id = jsArg(leitung.id);
        const artikelnummer = leitung.artikelnummer || leitung.artikelCustom;
        const klassen = ['gk-zeile'];
        if (leitung.id === aktiveLeitungId) klassen.push('aktiv');
        if (!artikelnummer) klassen.push('unvollstaendig');
        const name = leitung.bezeichnung || getLeitungAusfuehrung(leitung);
        const meta = [leitung.hersteller, artikelnummer || 'Artikel offen', leitung.topoVerbindungId ? 'aus Topologie' : '']
            .filter(Boolean).join(' · ');

        return `
            <tr class="${klassen.join(' ')}" title="Klicken zum Bearbeiten" onclick="gruppeEditLeitung('${id}')">
                <td class="gk-verbindung">${renderVerbindung(leitung)}</td>
                <td class="gk-leitung">
                    <span class="gk-leitung-name">${escapeHtml(name)}</span>
                    <span class="gk-leitung-meta">${escapeHtml(meta)}</span>
                </td>
                <td class="gk-laenge">${renderLaengeZelle(leitung, gesperrt)}</td>
                <td class="gk-stueck">${renderAnzahlStepper('leitung', leitung.id, leitung.anzahl, gesperrt)}</td>
                <td class="gk-aktion">${gesperrt ? '' : `
                    <button type="button" class="gk-loeschen" title="Leitung löschen" aria-label="Leitung löschen"
                            onclick="event.stopPropagation(); gruppeDeleteLeitung('${id}')">×</button>`}
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="table-container gk-tabelle-wrap">
            <table class="gk-tabelle">
                <thead>
                    <tr>
                        <th>Verbindung</th>
                        <th>Leitung</th>
                        <th class="gk-laenge">Länge</th>
                        <th class="gk-stueck">Stück</th>
                        <th class="gk-aktion"><span class="sr-only">Aktionen</span></th>
                    </tr>
                </thead>
                <tbody>${zeilen}</tbody>
            </table>
        </div>
    `;
}


/**
 * Zeichnet Leitungstabelle, Vorschläge und Rahmen neu (Suche bleibt unangetastet).
 * @returns {void}
 */
function aktualisiereLeitungsTabelle() {
    const container = document.getElementById('gruppen-leitungen-tabelle');
    if (container) container.innerHTML = renderLeitungTabelle(getLeitungenDerGruppe(aktiveGruppe));
    const vorschlaege = document.getElementById('gk-vorschlaege');
    const gruppe = getGruppe(aktiveGruppe);
    if (vorschlaege && gruppe) vorschlaege.innerHTML = renderLeitungVorschlaege(gruppe);
    renderGruppenRahmen();
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
        const whitelist = leitung.presetId === 'oelflex-werkzeugspanner'
            ? null
            : leitung.artikelWhitelist;
        const artikel = getMeterwareArtikel(leitung.kategorie, leitung.hersteller, whitelist)
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

    if (!leitung.artikelPrefix && leitung.kategorie && !(leitung.steckerA && leitung.steckerB)
        && getSteckerVarianten(leitung.kategorie, leitung.hersteller).length) {
        return {
            text: leitung.steckerA || leitung.steckerB ? 'Bitte den zweiten Stecker wählen' : 'Bitte Stecker A und B wählen',
            klasse: 'laenge-fehlt'
        };
    }

    const laengen = treffer?.verfuegbareLaengen || [];
    if (laengen.length) {
        // Die Leitung steht im Katalog, es fehlt nur die Länge – kein Fall für „neu anlegen“.
        const bereich = laengen.length > 6
            ? `${formatLaenge(laengen[0])}–${formatLaenge(laengen[laengen.length - 1])} m`
            : `${laengen.map(formatLaenge).join(', ')} m`;
        return { text: `Bitte Länge wählen (${bereich})`, klasse: 'laenge-fehlt' };
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

    const nummer = getLeitungenDerGruppe(leitung.gruppe).findIndex(l => l.id === leitung.id) + 1;
    const zusatzOffen = leitung.artikelCustom || leitung.notiz ? ' open' : '';
    const typFrei = !(leitung.artikelPrefix || leitung.festLeitungstyp);

    return `
        <div class="gruppen-karte leitung-karte" id="leitung-karte-${id}">
            <div class="leitung-karte-kopf">
                <span class="leitung-karte-nummer">Leitung ${nummer} bearbeiten</span>
            </div>

            <div class="artikel-vorschlag gruppen-karte-artikel-box leitung-ergebnis ${artikelInfo.klasse}">
                <span class="artikel-label">${escapeHtml(artikelInfo.text)}</span>
                ${!gesperrt && artikelInfo.klasse === 'no-match' ? `
                    <button type="button" class="btn btn-secondary btn-small"
                            onclick="gruppeOpenLeitungFormularAusLeitung('${id}')">
                        Im Katalog anlegen…
                    </button>
                ` : ''}
            </div>

            <div class="form-group">
                <label>Verwendung</label>
                <input type="text" class="leitung-karte-verwendung" value="${escapeHtml(leitung.bezeichnung || '')}"
                       title="Verwendung / wofür ist die Leitung?"
                       placeholder="z. B. Klemmkasten 1 → EP-Modul Stößel"${disabled}
                       oninput="gruppeUpdateLeitungText('${id}', 'bezeichnung', this.value)">
            </div>

            <div class="leitung-auswahl">
                ${typFrei ? renderKategorieChips(leitung, disabled) : ''}
                ${typFrei && leitung.kategorie ? renderHerstellerChips(leitung, disabled) : ''}
                ${meterware
                    ? renderMeterwareFelder(leitung, disabled)
                    : (leitung.artikelPrefix
                        ? renderPresetLeitungFelder(leitung, disabled)
                        : (leitung.kategorie ? renderSteckerFelder(leitung, disabled) : ''))}
                <div class="chip-feld">
                    <span class="chip-feld-label">Anzahl</span>
                    ${renderAnzahlStepper('leitung', leitung.id, leitung.anzahl, gesperrt)}
                </div>
            </div>

            ${gesperrt ? '' : renderStandardAngebot(leitung)}

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

            <div class="leitung-karte-aktionen leitung-karte-aktionen-unten">
                ${gesperrt ? '' : `
                    ${standardAngebotIds.has(leitung.id) ? '' : `
                    <button type="button" class="btn btn-secondary"
                            title="Diese Leitung künftig in dieser Gruppe vorschlagen"
                            onclick="gruppeSaveLeitungAlsButton('${id}')">Als Standard merken</button>
                    `}
                    <button type="button" class="btn btn-danger" title="Leitung löschen"
                            onclick="gruppeDeleteLeitung('${id}')">Löschen</button>
                `}
                <button type="button" class="btn btn-primary" title="Bearbeitung beenden"
                        onclick="gruppeCloseLeitungEditor()">Fertig</button>
            </div>
        </div>
    `;
}


/**
 * Schließt das aktuell offene Bearbeitungs- oder Anlagefenster (Escape / Overlay).
 * @returns {boolean} true, wenn etwas geschlossen wurde.
 */
export function gruppeCloseAktivenEditor() {
    if (neuesLeitungFormular) {
        gruppeCancelLeitungFormular();
        return true;
    }
    if (neuesBauteilFormular) {
        gruppeCancelBauteilFormular();
        return true;
    }
    if (aktiveLeitungId) {
        gruppeCloseLeitungEditor();
        return true;
    }
    if (aktivesBauteilId) {
        gruppeCloseBauteilEditor();
        return true;
    }
    return false;
}


/**
 * Formular für die gerade ausgewählte Leitung. Es ist immer nur eines geöffnet.
 * @returns {string}
 */
function renderLeitungEditor() {
    if (neuesBauteilFormular || neuesLeitungFormular || pickerState) return '';
    const leitung = aktiveLeitungId ? findLeitung(aktiveLeitungId) : null;
    if (!leitung || leitung.gruppe !== aktiveGruppe) return '';
    return renderEditorOverlay({
        onClose: 'gruppeCloseLeitungEditor()',
        inhalt: renderLeitungKarte(leitung)
    });
}


/**
 * Setzt den Fokus auf das Verwendungsfeld im Leitungseditor.
 * @returns {void}
 */
function fokussiereLeitungEditor() {
    const karte = document.getElementById(`leitung-karte-${aktiveLeitungId}`);
    if (!karte) return;

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
    aktivesBauteilId = '';
    neuesBauteilFormular = null;
    neuesLeitungFormular = null;
    pickerState = null;
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
 * Text für ein HTML-Attribut – anders als escapeHtml auch mit Anführungszeichen.
 * @param {string} wert
 * @returns {string}
 */
function escapeAttr(wert) {
    return String(wert ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}


/**
 * Wert als String-Argument in einem onclick-Attribut (`fn('…')`). Stecker wie
 * „7/8" 5-polig“ enthalten Anführungszeichen, die sonst das Attribut beenden.
 * @param {string} wert
 * @returns {string}
 */
function jsArg(wert) {
    return escapeAttr(String(wert ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}


/**
 * Eine beschriftete Reihe anklickbarer Chips.
 * @param {string} label
 * @param {string} inhalt - Bereits gerenderte Chips bzw. Hinweis.
 * @returns {string}
 */
function renderChipFeld(label, inhalt) {
    return `
        <div class="chip-feld">
            <span class="chip-feld-label">${escapeHtml(label)}</span>
            <div class="chip-liste">${inhalt}</div>
        </div>
    `;
}


/**
 * @param {{label: string, onclick: string, aktiv?: boolean, gesperrt?: boolean, title?: string, klasse?: string}} chip
 *        `label` wird unverändert übernommen und muss bereits escaped sein.
 * @returns {string}
 */
function renderChip(chip) {
    const klassen = ['chip', chip.klasse, chip.aktiv ? 'aktiv' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${klassen}"${chip.gesperrt ? ' disabled' : ''}
                    ${chip.title ? `title="${escapeAttr(chip.title)}"` : ''}
                    ${'aktiv' in chip ? `aria-pressed="${chip.aktiv ? 'true' : 'false'}"` : ''}
                    onclick="${chip.onclick}">${chip.label}</button>`;
}


/**
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderKategorieChips(leitung, disabled) {
    const id = escapeHtml(leitung.id);
    const chips = getKategorien().map(k => renderChip({
        label: `${escapeHtml(k.icon || '')} ${escapeHtml(k.name)}`,
        onclick: `gruppeUpdateLeitung('${id}', 'kategorie', '${jsArg(k.id)}')`,
        aktiv: leitung.kategorie === k.id,
        gesperrt: Boolean(disabled)
    })).join('');
    return renderChipFeld('Leitungstyp', chips);
}


/**
 * Hersteller nur anbieten, wenn es überhaupt eine Wahl gibt.
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderHerstellerChips(leitung, disabled) {
    const hersteller = getHerstellerFuerKategorie(leitung.kategorie);
    if (hersteller.length < 2) return '';

    const id = escapeHtml(leitung.id);
    const chips = [{ value: '', label: 'Alle' }, ...hersteller.map(h => ({ value: h, label: h }))]
        .map(h => renderChip({
            label: escapeHtml(h.label),
            onclick: `gruppeUpdateLeitung('${id}', 'hersteller', '${jsArg(h.value)}')`,
            aktiv: (leitung.hersteller || '') === h.value,
            gesperrt: Boolean(disabled)
        })).join('');
    return renderChipFeld('Hersteller', chips);
}


/**
 * Alle Steckervarianten (inkl. gerade/gewinkelt) im Katalog-Pool. Mit `gegenstecker`
 * nur die Stecker, die es zusammen mit diesem Gegenstecker als Artikel gibt.
 * @param {string} kategorie
 * @param {string} hersteller
 * @param {string} [gegenstecker]
 * @returns {string[]}
 */
function getSteckerVarianten(kategorie, hersteller, gegenstecker = '') {
    const erlaubt = new Set(getSteckerAOptionen(kategorie, hersteller));
    const varianten = new Set();

    getPassendeArtikel(kategorie, hersteller, gegenstecker, '', '').forEach(a => {
        if (!gegenstecker) {
            [a.steckerA, a.steckerB].forEach(s => s && varianten.add(s));
            return;
        }
        if (a.steckerA === gegenstecker && a.steckerB) varianten.add(a.steckerB);
        if (a.steckerB === gegenstecker && a.steckerA) varianten.add(a.steckerA);
    });

    return Array.from(varianten)
        .filter(s => erlaubt.has(getBaseSteckerTyp(s)))
        .sort((a, b) => {
            if (a === 'offen') return 1;
            if (b === 'offen') return -1;
            return a.localeCompare(b, 'de');
        });
}


/**
 * Chip-Beschriftung eines Steckers – die Ausrichtung als Symbol, damit es kein
 * eigenes Umschaltfeld mehr braucht.
 * @param {string} stecker
 * @returns {string}
 */
function formatSteckerChip(stecker) {
    if (!stecker || stecker === 'offen') return 'offenes Ende';
    const { basis, ausrichtung } = zerlegeStecker(stecker);
    const kurz = escapeHtml(basis.replace(/-polig\b/, '-pol'));
    if (!hasAusrichtung(basis)) return kurz;
    return ausrichtung === 'gewinkelt'
        ? `${kurz} <span class="chip-sub">↳ gewinkelt</span>`
        : `${kurz} <span class="chip-sub">↑ gerade</span>`;
}


/**
 * Längen als Chips plus Feld für eine abweichende Wunschlänge.
 * Eine Wunschlänge ohne Katalogartikel führt zur nächstgrößeren Katalog-Länge.
 * @param {object} leitung
 * @param {number[]} laengen
 * @param {string} disabled
 * @returns {string}
 */
function renderLaengenChips(leitung, laengen, disabled) {
    const id = escapeHtml(leitung.id);
    const aktuell = Number(leitung.laenge) || 0;
    const imKatalog = laengen.includes(aktuell);

    const chips = laengen.map(l => renderChip({
        label: `${formatLaenge(l)} m`,
        onclick: `gruppeUpdateLeitung('${id}', 'laenge', '${l}')`,
        aktiv: aktuell === l,
        gesperrt: Boolean(disabled),
        klasse: 'chip-laenge'
    })).join('');

    const eingabe = `
        <span class="chip-eingabe${aktuell && !imKatalog ? ' aktiv' : ''}">
            <input type="number" min="0" step="0.1" placeholder="${laengen.length ? 'andere' : 'Meter'}"
                   value="${aktuell && !imKatalog ? aktuell : ''}" aria-label="Länge in Metern"${disabled}
                   onchange="gruppeUpdateLeitung('${id}', 'laenge', this.value)">
            <span>m</span>
        </span>
    `;
    return renderChipFeld('Länge', chips + eingabe);
}


/**
 * Felder für vorgegebene Leitungsreihen (=011 Bremse): nur Länge wählen.
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderPresetLeitungFelder(leitung, disabled) {
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
        ${renderChipFeld('Leitung', `<span class="chip-info">${escapeHtml(typLabel)} · ${escapeHtml(leitung.hersteller || '')}</span>`)}
        ${renderLaengenChips(leitung, laengen, disabled)}
    `;
}


/**
 * Stecker A, Stecker B und Länge für konfektionierte Leitungen. Nicht kombinierbare
 * Stecker bleiben sichtbar, sind aber gesperrt – so sieht man, was es gibt.
 * @param {object} leitung
 * @param {string} disabled
 * @returns {string}
 */
function renderSteckerFelder(leitung, disabled) {
    const id = escapeHtml(leitung.id);
    const alle = getSteckerVarianten(leitung.kategorie, leitung.hersteller);
    const passendZuA = leitung.steckerA
        ? new Set(getSteckerVarianten(leitung.kategorie, leitung.hersteller, leitung.steckerA))
        : null;
    const passendZuB = leitung.steckerB
        ? new Set(getSteckerVarianten(leitung.kategorie, leitung.hersteller, leitung.steckerB))
        : null;

    const steckerChips = (seite, aktuell, passend) => {
        // Gespeicherte Stecker, die nicht (mehr) im Katalog stehen, trotzdem anzeigen.
        const liste = aktuell && !alle.includes(aktuell) ? [aktuell, ...alle] : alle;
        if (!liste.length) return '<span class="chip-hinweis">Keine Stecker im Katalog</span>';
        return liste.map(stecker => renderChip({
            label: formatSteckerChip(stecker),
            onclick: `gruppeWaehleStecker('${id}', '${seite}', '${jsArg(stecker)}')`,
            aktiv: aktuell === stecker,
            gesperrt: Boolean(disabled) || (passend && aktuell !== stecker && !passend.has(stecker)),
            title: passend && !passend.has(stecker) ? 'Mit dem anderen Stecker nicht im Katalog' : ''
        })).join('');
    };

    const beideGewaehlt = Boolean(leitung.steckerA && leitung.steckerB);
    const laengen = beideGewaehlt
        ? getLaengenOptionen(leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, '')
        : [];

    // Artikel ohne feste Länge (Konfektion nach Maß) lassen sich nicht über
    // die Länge unterscheiden – dann braucht es eine eigene Auswahl.
    const ausfuehrungen = beideGewaehlt && !laengen.length
        ? getPassendeArtikel(leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, '')
        : [];
    const ausfuehrungFeld = ausfuehrungen.length > 1
        ? renderChipFeld('Ausführung', ausfuehrungen.map(artikel => renderChip({
            label: escapeHtml(artikel.beschreibung || artikel.artikelnummer),
            title: artikel.artikelnummer,
            onclick: `gruppeUpdateLeitung('${id}', 'artikelnummer', '${jsArg(artikel.artikelnummer)}')`,
            aktiv: leitung.artikelnummer === artikel.artikelnummer,
            gesperrt: Boolean(disabled)
        })).join(''))
        : '';

    return `
        ${renderChipFeld('Stecker A', steckerChips('A', leitung.steckerA, passendZuB))}
        ${renderChipFeld('Stecker B', steckerChips('B', leitung.steckerB, passendZuA))}
        ${ausfuehrungFeld}
        ${beideGewaehlt
            ? renderLaengenChips(leitung, laengen, disabled)
            : renderChipFeld('Länge', '<span class="chip-hinweis">Erst beide Stecker wählen</span>')}
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
    // Frühere Werkzeugspanner-Whitelist (nur 4G1,5/12G1,5/18G1,5) nicht mehr anwenden.
    const whitelist = leitung.presetId === 'oelflex-werkzeugspanner'
        ? null
        : leitung.artikelWhitelist;
    const artikel = getMeterwareArtikel(leitung.kategorie, leitung.hersteller, whitelist);

    const typFeld = artikel.length
        ? `<select${disabled} onchange="gruppeUpdateLeitung('${id}', 'artikelnummer', this.value)">
                ${optionen([{ value: '', label: '-- Leitungstyp --' },
                    ...artikel.map(a => ({ value: a.artikelnummer, label: `${a.beschreibung} (${a.artikelnummer})` }))],
                    leitung.artikelnummer)}
           </select>`
        : `<input type="text" value="${escapeHtml(leitung.artikelnummer || '')}" placeholder="Artikelnummer eintragen"${disabled}
                  oninput="gruppeUpdateLeitungText('${id}', 'artikelCustom', this.value)">`;

    return `
        <div class="chip-feld">
            <span class="chip-feld-label">Typ / Querschnitt</span>
            <div class="chip-feld-eingabe">${typFeld}</div>
        </div>
        ${renderLaengenChips(leitung, [], disabled)}
    `;
}


/**
 * Legt eine neue Leitung anhand eines Presets an.
 * @param {string} presetId
 * @param {{laenge?: number, direkt?: boolean, stillsam?: boolean, kategorie?: string}} [options]
 *        `direkt` übernimmt ohne Editor, `stillsam` unterdrückt das Neuzeichnen (Sammelaktion),
 *        `kategorie` gibt einer Leitung ohne Preset den Leitungstyp vor.
 * @returns {void}
 */
export function gruppeAddLeitung(presetId, options = {}) {
    if (!assertCanEdit('Leitungen hinzufügen')) return;
    if (!appState.currentProjekt.leitungen) appState.currentProjekt.leitungen = [];
    pickerState = null;

    const preset = getLeitungPreset(presetId) || {};
    const kategorie = preset.kategorie || options.kategorie || '';
    const einzigerHersteller = !preset.kategorie && kategorie
        ? getHerstellerFuerKategorie(kategorie)
        : [];
    const leitung = {
        id: generateId('ltg'),
        position: appState.currentProjekt.leitungen.length + 1,
        presetId: presetId || '',
        bezeichnung: preset.bezeichnung || preset.label || '',
        kategorie,
        gruppe: aktiveGruppe,
        hersteller: preset.hersteller || (einzigerHersteller.length === 1 ? einzigerHersteller[0] : ''),
        artikelnummer: preset.artikelnummer || '',
        artikelPrefix: preset.artikelPrefix || '',
        artikelWhitelist: preset.artikelWhitelist || null,
        artikelCustom: '',
        laenge: options.laenge || preset.laenge || 0,
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

    if (options.stillsam) return;

    // Übernehmen / Direktzugabe: immer in der Liste belassen, Editor nur bei Bedarf manuell öffnen.
    if (options.direkt) {
        renderGruppenListe();
        renderGruppenPanel();
        return;
    }

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
 * Übernimmt eine Katalog-Leitung direkt in die aktive Gruppe und bietet an,
 * sie künftig als Standard dieser Gruppe vorzuschlagen.
 * @param {string} artikelnummer
 * @returns {Promise<void>}
 */
export async function gruppeAddLeitungAusArtikel(artikelnummer) {
    await addLeitungAusKatalog(artikelnummer, '');
}


/**
 * Übernimmt eine ganze Leitungsreihe – die Länge wird danach in der Karte gewählt.
 * @param {string} prefix
 * @param {string} referenzArtikelnummer
 * @returns {Promise<void>}
 */
export async function gruppeAddLeitungAusReihe(prefix, referenzArtikelnummer) {
    await addLeitungAusKatalog(referenzArtikelnummer, prefix);
}


/**
 * Längen-Chip einer Katalogreihe im Auswahlfenster: Artikel sofort übernehmen.
 * @param {string} artikelnummer
 * @returns {Promise<void>}
 */
export async function gruppeAddKatalogArtikelDirekt(artikelnummer) {
    await addLeitungAusKatalog(artikelnummer, '', { direkt: true });
}


/**
 * Neue Leitung eines Leitungstyps, die im Fenster per Chips zusammengestellt wird.
 * @param {string} [kategorie] - Ohne Angabe gilt der Filter im Auswahlfenster.
 * @returns {void}
 */
export function gruppeAddLeitungMitKategorie(kategorie) {
    gruppeAddLeitung('', { kategorie: kategorie ?? pickerState?.kategorie ?? '' });
}


/**
 * Legt eine Kopie einer bereits erfassten Leitung in der aktiven Gruppe an.
 * @param {string} quelleId
 * @param {string|number} laenge - Leer: Länge der Vorlage übernehmen.
 * @param {boolean} [imFenster] - Kopie im Bearbeitungsfenster öffnen statt direkt übernehmen.
 * @returns {void}
 */
export function gruppeAddLeitungWie(quelleId, laenge, imFenster = false) {
    if (!assertCanEdit('Leitungen hinzufügen')) return;
    const quelle = findLeitung(quelleId);
    if (!quelle) return;

    const neueLaenge = parseFloat(String(laenge ?? '').replace(',', '.'));
    const laengeGeaendert = neueLaenge > 0 && neueLaenge !== Number(quelle.laenge);
    // Bei anderer Länge muss der Katalog den Artikel neu bestimmen (außer Meterware).
    const artikelNeu = laengeGeaendert && !istMeterwareKategorie(quelle.kategorie);

    const leitung = {
        id: generateId('ltg'),
        position: appState.currentProjekt.leitungen.length + 1,
        presetId: quelle.presetId || '',
        bezeichnung: quelle.bezeichnung || '',
        kategorie: quelle.kategorie || '',
        gruppe: aktiveGruppe,
        hersteller: quelle.hersteller || '',
        artikelnummer: artikelNeu ? '' : (quelle.artikelnummer || ''),
        artikelPrefix: quelle.artikelPrefix || '',
        artikelWhitelist: quelle.artikelWhitelist || null,
        artikelCustom: artikelNeu ? '' : (quelle.artikelCustom || ''),
        laenge: laengeGeaendert ? neueLaenge : (Number(quelle.laenge) || 0),
        steckerA: quelle.steckerA || '',
        steckerB: quelle.steckerB || '',
        festLeitungstyp: quelle.festLeitungstyp === true,
        notiz: '',
        anzahl: 1,
        erledigt: false
    };

    pickerState = null;
    appState.currentProjekt.leitungen.push(leitung);
    aktualisiereArtikel(leitung);
    renumberLeitungen();
    persistCurrentProjekt();

    if (imFenster) aktiveLeitungId = leitung.id;
    renderGruppenListe();
    renderGruppenPanel();
    if (imFenster) fokussiereLeitungEditor();
}


/**
 * @param {string} artikelnummer
 * @param {string} reihenPrefix - Gesetzt, wenn nur die Reihe feststeht und die Länge noch fehlt.
 * @param {{direkt?: boolean}} [options] - `direkt` übernimmt ohne Bearbeitungsfenster.
 * @returns {Promise<void>}
 */
async function addLeitungAusKatalog(artikelnummer, reihenPrefix, options = {}) {
    if (!assertCanEdit('Leitungen hinzufügen')) return;

    const artikel = getArtikelByNummer(artikelnummer);
    if (!artikel) return;

    pickerState = null;
    if (!appState.currentProjekt.leitungen) appState.currentProjekt.leitungen = [];

    const gruppenCode = aktiveGruppe;
    const nurReihe = Boolean(reihenPrefix);
    const leitung = {
        id: generateId('ltg'),
        position: appState.currentProjekt.leitungen.length + 1,
        presetId: '',
        bezeichnung: nurReihe || options.direkt
            ? ohneLaengenangabe(artikel.beschreibung) || artikel.artikelnummer
            : (artikel.beschreibung || artikel.artikelnummer),
        kategorie: artikel.kategorie || '',
        gruppe: gruppenCode,
        hersteller: artikel.hersteller || '',
        artikelnummer: nurReihe ? '' : artikel.artikelnummer,
        artikelPrefix: artikel.meterware ? '' : (reihenPrefix || deriveArtikelPrefix(artikel.artikelnummer)),
        artikelWhitelist: null,
        artikelCustom: '',
        laenge: nurReihe ? 0 : (artikel.laenge || 0),
        steckerA: artikel.steckerA || '',
        steckerB: artikel.steckerB || '',
        festLeitungstyp: false,
        notiz: '',
        anzahl: 1,
        erledigt: false
    };

    appState.currentProjekt.leitungen.push(leitung);
    renumberLeitungen();
    persistCurrentProjekt();

    if (options.direkt) {
        renderGruppenListe();
        renderGruppenPanel();
        return;
    }

    standardAngebotIds.add(leitung.id);
    aktiveLeitungId = leitung.id;
    renderGruppenListe();
    renderGruppenPanel();
    fokussiereLeitungEditor();
}


/**
 * Angebot in der Leitungskarte, eine Sonderposition künftig immer vorzuschlagen.
 * @param {object} leitung
 * @returns {string}
 */
function renderStandardAngebot(leitung) {
    if (leitung.presetId || !standardAngebotIds.has(leitung.id)) return '';
    const id = escapeHtml(leitung.id);

    return `
        <div class="standard-angebot">
            <span>Diese Leitung künftig in ${escapeHtml(leitung.gruppe)} immer vorschlagen?</span>
            <div class="standard-angebot-aktionen">
                <button type="button" class="btn btn-primary btn-small"
                        onclick="gruppeSaveLeitungAlsButton('${id}')">Ja, merken</button>
                <button type="button" class="btn btn-secondary btn-small"
                        onclick="gruppeStandardAngebotVerwerfen('${id}')">Nur dieses Projekt</button>
            </div>
        </div>
    `;
}


/**
 * @param {string} leitungId
 * @returns {void}
 */
export function gruppeStandardAngebotVerwerfen(leitungId) {
    standardAngebotIds.delete(leitungId);
    renderGruppenPanel();
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
    } else if (feld === 'hersteller') {
        leitung.hersteller = wert;
        leitung.artikelnummer = '';
        leitung.artikelPrefix = '';
        // Stecker, die es bei diesem Hersteller nicht gibt, verwerfen.
        if (!istMeterwareKategorie(leitung.kategorie)) {
            const varianten = getSteckerVarianten(leitung.kategorie, wert);
            if (!varianten.includes(leitung.steckerA)) leitung.steckerA = '';
            if (!varianten.includes(leitung.steckerB)) leitung.steckerB = '';
            passeLaengeAn(leitung);
        }
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
    uebernehmeLeitungInTopologie(leitung);
    persistCurrentProjekt();
    ersetzeKarte(`leitung-karte-${id}`, renderLeitungKarte(leitung));
    aktualisiereLeitungsTabelle();
}


/**
 * Behält die Länge nur, wenn es sie für die neue Steckerkombination gibt.
 * Gibt es genau eine Länge, wird sie gleich gesetzt.
 * @param {object} leitung
 * @returns {void}
 */
function passeLaengeAn(leitung) {
    if (!leitung.steckerA || !leitung.steckerB) {
        leitung.laenge = 0;
        return;
    }
    const laengen = getLaengenOptionen(
        leitung.kategorie, leitung.hersteller, leitung.steckerA, leitung.steckerB, leitung.artikelPrefix
    );
    if (laengen.length === 1) leitung.laenge = laengen[0];
    else if (laengen.length && !laengen.includes(Number(leitung.laenge))) leitung.laenge = 0;
}


/**
 * Stecker-Chip angeklickt. Ein zweiter Klick hebt die Auswahl auf. Passt der andere
 * Stecker nicht mehr, wird er verworfen; gibt es nur einen Gegenstecker, wird er gesetzt.
 * @param {string} id
 * @param {string} seite - 'A' oder 'B'.
 * @param {string} stecker - Vollständiger Steckertyp inkl. Ausrichtung.
 * @returns {void}
 */
export function gruppeWaehleStecker(id, seite, stecker) {
    const leitung = findLeitung(id);
    if (!leitung || istSchreibgeschuetzt()) return;

    const feld = seite === 'A' ? 'steckerA' : 'steckerB';
    const anderes = seite === 'A' ? 'steckerB' : 'steckerA';
    leitung[feld] = leitung[feld] === stecker ? '' : stecker;

    if (leitung[feld]) {
        const passend = getSteckerVarianten(leitung.kategorie, leitung.hersteller, leitung[feld]);
        if (leitung[anderes] && !passend.includes(leitung[anderes])) leitung[anderes] = '';
        if (!leitung[anderes] && passend.length === 1) leitung[anderes] = passend[0];
    }

    leitung.artikelnummer = '';
    leitung.artikelPrefix = '';
    passeLaengeAn(leitung);

    aktualisiereArtikel(leitung);
    uebernehmeLeitungInTopologie(leitung);
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
        uebernehmeLeitungInTopologie(leitung);
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
 * @returns {Promise<void>}
 */
export async function gruppeDeleteLeitung(id) {
    if (!assertCanEdit('Leitungen löschen')) return;
    const liste = appState.currentProjekt?.leitungen || [];
    const index = liste.findIndex(l => l.id === id);
    if (index === -1) return;

    const bezeichnung = liste[index].bezeichnung;
    const frage = bezeichnung ? `Leitung „${bezeichnung}“ wirklich löschen?` : 'Diese Leitung wirklich löschen?';
    const confirmed = await showModal(
        liste[index].topoVerbindungId
            ? `${frage}\n\nDie Verbindung in der EtherCAT-Topologie wird dabei ebenfalls entfernt.`
            : frage,
        { type: 'danger', title: 'Leitung löschen', showCancel: true, confirmText: 'Löschen', cancelText: 'Abbrechen' }
    );
    if (!confirmed) return;
    if (liste[index]?.id !== id) return;

    liste.splice(index, 1);
    if (aktiveLeitungId === id) aktiveLeitungId = '';
    renumberLeitungen();
    // Stammt die Leitung aus der Topologie, entfällt dort auch die Verbindung.
    syncTopologieLeitungen();
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
