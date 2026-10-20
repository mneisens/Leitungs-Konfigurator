/**
 * @file gk-gruppen.js – Gruppenliste, Gruppenpanel, Abschluss, Prüfliste und Tastenkürzel.
 */
import { appState } from './state.js';
import { escapeHtml, escapeAttr, jsArg, formatLaenge } from './utils.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit } from './project-access.js';
import { getGruppenVorgaben } from './gruppen-config.js';
import { compareGruppenCode, normalizeGruppenCode } from './overview.js';
import { showModal } from './modal.js';
import { syncTopologieLeitungen } from './topologie-sync.js';
import { isLeitungMeaningful } from './leitung-utils.js';
import { getPositionsBeschaffung, getStuecklisteStatusInfo, setPositionsBeschaffung } from './stueckliste.js';
import {
    gk,
    findBauteil,
    findLeitung,
    getBauteileDerGruppe,
    getGruppe,
    getGruppen,
    getGruppenStatus,
    getLeitungenDerGruppe,
    istSchreibgeschuetzt,
    optionen,
    renumberLeitungen
} from './gk-state.js';
import {
    aktualisiereLeitungDropdown,
    getLeitungAusfuehrung,
    getOffeneBauteilVorschlaege,
    getOffeneLeitungVorschlaege,
    renderLeitungSuche,
    renderLeitungVorschlaege
} from './gk-vorschlaege.js';
import {
    aktualisiereBauteilTabelle,
    getBauteilLabel,
    gruppeEditBauteil,
    renderBauteilEditor,
    renderBauteilListe,
    renderNeuesBauteilFormular
} from './gk-bauteile.js';
import { gruppeClosePicker, gruppeOpenPicker, renderPicker } from './gk-picker.js';
import { renderNeuesLeitungFormular } from './gk-leitung-formular.js';
import { leitungswege, renderWegeDialog } from './gk-wege.js';
import {
    aktualisiereLeitungsTabelle,
    gruppeEditLeitung,
    passeKommentarHoeheAn,
    renderLeitungEditor,
    renderLeitungTabelle,
    renderStandKommentar,
    renderStandSelect
} from './gk-leitungen.js';


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
        gk.aktiveGruppe = pendingCode;
    } else if (!getGruppe(gk.aktiveGruppe)) {
        gk.aktiveGruppe = getGruppen()[0]?.code || '';
    }

    if (gk.prueflisteProjektId !== projekt.id) {
        gk.prueflisteOffen = false;
        gk.prueflisteFilter = 'alle';
        gk.prueflisteProjektId = projekt.id;
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
export function renderGruppenListe() {
    const container = document.getElementById('gruppen-liste');
    if (!container) return;

    const suche = gk.gruppenSuche.trim().toLowerCase();
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
        if (gruppe.code === gk.aktiveGruppe) klassen.push('active');
        if (status?.nichtBenoetigt) klassen.push('entfaellt');
        if (anzLeitungen || anzBauteile) klassen.push('befuellt');

        const badges = [];
        if (anzLeitungen) badges.push(`<span class="gruppen-badge leitung">${anzLeitungen} Ltg.</span>`);
        if (anzBauteile) badges.push(`<span class="gruppen-badge bauteil">${anzBauteile} Btl.</span>`);
        if (status?.nichtBenoetigt) badges.push('<span class="gruppen-badge entfaellt">entfällt</span>');
        if (gruppe.custom) badges.push('<span class="gruppen-badge zusaetzlich">Zusatz</span>');

        return `
            <button type="button" class="${klassen.join(' ')}" onclick="selectGruppe('${jsArg(gruppe.code)}')">
                <span class="gruppen-code">${escapeHtml(gruppe.code)}</span>
                <span class="gruppen-name">${escapeHtml(gruppe.bezeichnung)}</span>
                <span class="gruppen-badges">${badges.join('')}</span>
            </button>
        `;
    }).join('');

    updateGruppenNeuFormular();
}


/**
 * Blendet den Button „Gruppe hinzufügen“ je nach Schreibrecht ein/aus.
 * @returns {void}
 */
function updateGruppenNeuFormular() {
    const btn = document.getElementById('gruppen-neu-btn');
    if (!btn) return;
    btn.hidden = istSchreibgeschuetzt();
}


/**
 * Öffnet den Dialog zum Anlegen einer Zusatzgruppe.
 * @returns {void}
 */
export function gruppeOpenNeueGruppe() {
    if (!assertCanEdit('Zusatzgruppen anlegen')) return;
    const overlay = document.getElementById('gruppen-neu-overlay');
    if (!overlay) return;

    const nummer = document.getElementById('gruppen-neu-nummer');
    const bezeichnung = document.getElementById('gruppen-neu-bezeichnung');
    if (nummer) nummer.value = '';
    if (bezeichnung) bezeichnung.value = '';

    overlay.classList.add('active');
    requestAnimationFrame(() => nummer?.focus());
}


/**
 * Schließt den Dialog zum Anlegen einer Zusatzgruppe.
 * @returns {void}
 */
export function gruppeCloseNeueGruppe() {
    document.getElementById('gruppen-neu-overlay')?.classList.remove('active');
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
    gk.aktiveGruppe = code;

    gruppeCloseNeueGruppe();
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
    const gruppe = getGruppe(gk.aktiveGruppe);
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
    gk.aktiveGruppe = verbleibend[0]?.code || '';

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
    gk.gruppenSuche = document.getElementById('gruppen-suche')?.value || '';
    renderGruppenListe();
}


/**
 * @param {string} code
 * @returns {void}
 */
export function selectGruppe(code) {
    gk.aktiveGruppe = code;
    gk.aktiveLeitungId = '';
    gk.aktivesBauteilId = '';
    gk.neuesBauteilFormular = null;
    gk.neuesLeitungFormular = null;
    gk.pickerState = null;
    renderGruppenListe();
    renderGruppenPanel();
    document.getElementById('gruppen-main')?.scrollTo({ top: 0 });
    requestAnimationFrame(() => {
        document.querySelector('#gruppen-liste .gruppen-listen-eintrag.active')
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
}


/**
 * Springt zur vorherigen oder nächsten Gruppe.
 * @param {number} richtung
 * @returns {void}
 */
export function gruppeWechseln(richtung) {
    const gruppen = getGruppen();
    const index = gruppen.findIndex(g => g.code === gk.aktiveGruppe);
    const ziel = gruppen[index + richtung];
    if (ziel) selectGruppe(ziel.code);
}


/**
 * Zeichnet die Mitte (Suche, Leitungen, Vorschläge) und den Rahmen der aktiven Gruppe.
 * @returns {void}
 */
export function renderGruppenPanel() {
    const main = document.getElementById('gruppen-main');
    if (!main) return;

    const gruppe = getGruppe(gk.aktiveGruppe);
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
        ${renderWegeDialog()}
        ${renderPicker()}
    `;

    renderGruppenRahmen();
    renderPruefliste();
    passeKommentarHoeheAn(document.getElementById('view-gruppen'));
    if (gk.pickerState?.art === 'leitung') {
        const input = document.getElementById('gk-suche-input');
        if (input) input.value = gk.pickerState.suche || '';
        aktualisiereLeitungDropdown();
    }
}


/**
 * Kopfzeile, linke und rechte Spalte – alles, was sich bei Änderungen an
 * Leitungen oder Bauteilen mitändert (Zähler, Fortschritt, Stückliste).
 * @returns {void}
 */
export function renderGruppenRahmen() {
    const kopf = document.getElementById('gk-kopf');
    if (kopf) kopf.innerHTML = renderGruppenKopf();
    const links = document.getElementById('gk-gruppe');
    if (links) links.innerHTML = renderGruppeLinks();
    const rechts = document.getElementById('gk-rechts');
    if (rechts) rechts.innerHTML = renderGruppeRechts();
    import('./theme.js').then(m => m.updateThemeToggleLabels()).catch(() => {});
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
    const index = gruppen.findIndex(g => g.code === gk.aktiveGruppe);
    const fertig = gruppen.filter(g => leseGruppenStatus(g.code).abgeschlossen).length;
    const zustandText = { fertig: 'abgeschlossen', entfaellt: 'nicht benötigt', befuellt: 'in Arbeit', offen: 'offen' };

    const aktive = gruppen[index];
    const segmente = gruppen.map(g => {
        const zustand = getGruppenZustand(g);
        const istAktiv = g.code === gk.aktiveGruppe;
        const aktiv = istAktiv ? ' aktiv' : '';
        const titel = `${g.code} ${g.bezeichnung} – ${zustandText[zustand]}`;
        const label = istAktiv ? `<span class="gk-seg-label">${escapeHtml(g.code)}</span>` : '';
        return `<button type="button" class="gk-seg ${zustand}${aktiv}" title="${escapeAttr(titel)}"
                        aria-label="${escapeAttr(titel)}" aria-current="${istAktiv ? 'true' : 'false'}"
                        onclick="selectGruppe('${jsArg(g.code)}')">${label}</button>`;
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
                <span class="gk-akzent">${escapeHtml(aktive?.code || '–')} · ${index + 1} / ${gruppen.length} · ${fertig} abgeschlossen</span>
                <span>${escapeHtml(gruppen[gruppen.length - 1]?.code || '')}</span>
            </div>
        </div>
        <nav class="gk-kopf-aktionen">
            <button type="button" class="btn btn-secondary theme-toggle" data-theme-toggle onclick="toggleTheme()" aria-label="Darstellung wechseln">
                <span data-theme-label>${document.documentElement.getAttribute('data-theme') === 'light' ? 'Dunkel' : 'Hell'}</span>
            </button>
            <button type="button" class="btn btn-secondary" onclick="showView('uebersicht')">Übersicht</button>
            <button type="button" class="btn btn-secondary" onclick="gruppeOpenWegeDialog()"
                    title="Gemessene Wege dieses Projekts, für alle Leitungen">
                Wege${leitungswege().length ? ` · ${leitungswege().length}` : ''}
            </button>
            <button type="button" class="btn btn-secondary" onclick="gruppeOeffnePruefliste('klaerung')"
                    title="Leitungen und Bauteile mit Kommentar, die noch nicht verbaut sind">
                In Klärung${prueflisteHinweis() ? `<span class="stueckliste-nav-badge">${prueflisteHinweis()}</span>` : ''}
            </button>
            <button type="button" class="btn btn-secondary" onclick="gruppeTogglePruefliste()">Prüfliste</button>
            <button type="button" class="btn btn-secondary" onclick="showView('stueckliste')">Stückliste</button>
            <button type="button" class="btn btn-secondary" onclick="zeitOeffnen('${jsArg(gk.aktiveGruppe)}')">Zeit</button>
        </nav>
    `;
}


/**
 * Linke Spalte: aktuelle Gruppe kompakt; die vollständige Liste ist darunter scrollbar.
 * @returns {string}
 */
function renderGruppeLinks() {
    const gruppe = getGruppe(gk.aktiveGruppe);
    if (!gruppe) return '';

    const status = leseGruppenStatus(gruppe.code);

    return `
        <p class="gk-label gk-akzent">Aktuelle Gruppe${status.abgeschlossen ? ' · abgeschlossen ✓' : ''}</p>
        <div class="gk-code">${escapeHtml(gruppe.code)}</div>
        <h2 class="gk-name">${escapeHtml(gruppe.bezeichnung)}</h2>
        ${gruppe.custom ? '<span class="gruppen-badge zusaetzlich">Zusatzgruppe</span>' : ''}
    `;
}


/**
 * Rechte Spalte: Kennzahlen, Bauteile der Gruppe und Abschluss.
 * @returns {string}
 */
function renderGruppeRechts() {
    const gruppe = getGruppe(gk.aktiveGruppe);
    if (!gruppe) return '';

    const gesperrt = istSchreibgeschuetzt();
    const vorgaben = getGruppenVorgaben(gruppe);
    const leitungen = getLeitungenDerGruppe(gruppe.code);
    const bauteile = getBauteileDerGruppe(gruppe.code);
    const bauteilVorschlaege = getOffeneBauteilVorschlaege(gruppe.code);

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

        <p class="gk-label">Bauteile</p>
        <div id="gruppen-bauteile-tabelle">${renderBauteilListe(bauteile, gesperrt ? [] : bauteilVorschlaege)}</div>
        ${gesperrt ? '' : `<button type="button" class="gk-link" onclick="gruppeOpenPicker('bauteil')">+ Bauteil</button>`}

        <div class="gk-optionen">
            <label class="gk-schalter">
                <input type="checkbox" ${leseGruppenStatus(gruppe.code).nichtBenoetigt ? 'checked' : ''}${gesperrt ? ' disabled' : ''}
                       onchange="toggleGruppeNichtBenoetigt(this.checked)">
                Nicht benötigt
            </label>
            ${!gesperrt && gruppe.custom ? `<button type="button" class="gk-link gk-link-gefahr"
                    onclick="gruppeDeleteZusaetzlicheGruppe()">Gruppe entfernen</button>` : ''}
        </div>

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
    const index = gruppen.findIndex(g => g.code === gk.aktiveGruppe);
    if (index === -1) return;

    getGruppenStatus(gk.aktiveGruppe).abgeschlossen = true;
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
    getGruppenStatus(gk.aktiveGruppe).abgeschlossen = false;
    persistCurrentProjekt();
    renderGruppenListe();
    renderGruppenPanel();
}


/**
 * Alle erfassten Leitungen und Bauteile mit Stand und Kommentar.
 * @returns {Array<object>}
 */
function sammlePruefpositionen() {
    const projekt = appState.currentProjekt;
    if (!projekt) return [];

    const leitungen = (projekt.leitungen || []).filter(isLeitungMeaningful).map(leitung => {
        const stand = getPositionsBeschaffung('leitungen', leitung);
        return {
            art: 'leitungen',
            artLabel: 'Leitung',
            id: leitung.id,
            gruppe: leitung.gruppe || '',
            name: leitung.bezeichnung || getLeitungAusfuehrung(leitung),
            status: stand.status,
            kommentar: stand.kommentar
        };
    });
    const bauteile = (projekt.bauteile || []).map(bauteil => {
        const stand = getPositionsBeschaffung('bauteile', bauteil);
        return {
            art: 'bauteile',
            artLabel: 'Bauteil',
            id: bauteil.id,
            gruppe: bauteil.gruppe || '',
            name: getBauteilLabel(bauteil),
            status: stand.status,
            kommentar: stand.kommentar
        };
    });

    return [...leitungen, ...bauteile].sort((a, b) =>
        compareGruppenCode(a.gruppe, b.gruppe)
        || a.art.localeCompare(b.art)
        || a.name.localeCompare(b.name, 'de')
    );
}


/**
 * @param {object} position
 * @returns {boolean}
 */
function istInKlaerung(position) {
    return Boolean(position.kommentar) && position.status !== 'verbaut';
}


/**
 * @param {object} position
 * @returns {boolean}
 */
function pruefpositionSichtbar(position) {
    if (gk.prueflisteFilter === 'klaerung') return istInKlaerung(position);
    if (gk.prueflisteFilter === 'kommentar') return Boolean(position.kommentar);
    if (gk.prueflisteFilter === 'offen') return position.status !== 'verbaut';
    return true;
}


/**
 * Anzahl der Kommentare, sonst der noch nicht verbauten Positionen.
 * @returns {string}
 */
function prueflisteHinweis() {
    const anzahl = sammlePruefpositionen().filter(istInKlaerung).length;
    return anzahl ? String(anzahl) : '';
}


/**
 * Öffnet oder schließt die Prüfliste.
 * @param {boolean} [offen]
 * @returns {void}
 */
export function gruppeTogglePruefliste(offen) {
    gk.prueflisteOffen = typeof offen === 'boolean' ? offen : !gk.prueflisteOffen;
    renderPruefliste();
    renderGruppenRahmen();
}


/**
 * @param {string} filter
 * @returns {void}
 */
export function gruppeSetPrueflisteFilter(filter) {
    const erlaubt = new Set(['alle', 'offen', 'kommentar', 'klaerung']);
    gk.prueflisteFilter = erlaubt.has(filter) ? filter : 'alle';
    renderPruefliste();
}


/**
 * Öffnet die Prüfliste direkt mit einem Filter.
 * @param {string} filter
 * @returns {void}
 */
export function gruppeOeffnePruefliste(filter) {
    const erlaubt = new Set(['alle', 'offen', 'kommentar', 'klaerung']);
    gk.prueflisteFilter = erlaubt.has(filter) ? filter : 'klaerung';
    gk.prueflisteOffen = true;
    renderPruefliste();
    renderGruppenRahmen();
}


/**
 * Springt zur Position und öffnet sie.
 * @param {'leitungen'|'bauteile'} art
 * @param {string} id
 * @returns {void}
 */
export function gruppeZeigePosition(art, id) {
    const item = art === 'leitungen' ? findLeitung(id) : findBauteil(id);
    if (!item?.gruppe) return;
    gk.prueflisteOffen = false;
    renderPruefliste();
    selectGruppe(item.gruppe);
    if (art === 'leitungen') gruppeEditLeitung(id);
    else gruppeEditBauteil(id);
}


/**
 * Speichert Status oder Kommentar einer Position.
 * @param {'leitungen'|'bauteile'} art
 * @param {string} id
 * @param {'status'|'kommentar'} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeSetBeschaffung(art, id, feld, wert) {
    if (istSchreibgeschuetzt()) return;
    const item = art === 'leitungen' ? findLeitung(id) : findBauteil(id);
    if (!item) return;

    setPositionsBeschaffung(art, item, feld, wert);
    persistCurrentProjekt();

    if (art === 'leitungen') aktualisiereLeitungsTabelle();
    else aktualisiereBauteilTabelle();

    const editorOffen = (art === 'leitungen' && gk.aktiveLeitungId === id)
        || (art === 'bauteile' && gk.aktivesBauteilId === id);
    if (feld === 'status' && editorOffen) renderGruppenPanel();
    else renderPruefliste();
}


/**
 * @returns {void}
 */
function renderPruefliste() {
    const box = document.getElementById('gk-pruefliste');
    if (!box) return;
    if (!gk.prueflisteOffen) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }

    const alle = sammlePruefpositionen();
    const sichtbar = alle.filter(pruefpositionSichtbar);
    const klaerung = alle.filter(istInKlaerung).length;
    const kommentare = alle.filter(p => p.kommentar).length;
    const nichtVerbaut = alle.filter(p => p.status !== 'verbaut').length;
    const leertext = gk.prueflisteFilter === 'klaerung'
        ? 'Keine Positionen in Klärung. Ein Kommentar an einer noch nicht verbauten Leitung oder einem Bauteil erscheint hier.'
        : 'Nichts für diesen Filter.';
    const filterButton = (id, label) => `
        <button type="button" class="btn btn-secondary btn-small${gk.prueflisteFilter === id ? ' active' : ''}"
                aria-pressed="${gk.prueflisteFilter === id}"
                onclick="gruppeSetPrueflisteFilter('${id}')">${label}</button>`;

    let letzteGruppe = null;
    const zeilen = sichtbar.map(position => {
        const gruppe = getGruppe(position.gruppe);
        const gruppenzeile = position.gruppe !== letzteGruppe
            ? `<tr class="gk-pruef-gruppe"><td colspan="4">${escapeHtml(position.gruppe || '–')} ${escapeHtml(gruppe?.bezeichnung || '')}</td></tr>`
            : '';
        letzteGruppe = position.gruppe;
        const info = getStuecklisteStatusInfo({ status: position.status, lieferdatum: '' });
        return `
            ${gruppenzeile}
            <tr class="${info.klasse}${position.kommentar ? ' hat-kommentar' : ''}">
                <td>${escapeHtml(position.artLabel)}</td>
                <td>${escapeHtml(position.name)}</td>
                <td>${renderStandSelect(position.art, position.id, position.status, istSchreibgeschuetzt())}</td>
                <td><button type="button" class="gk-link" onclick="gruppeZeigePosition('${position.art}', '${jsArg(position.id)}')">In der Gruppe</button></td>
            </tr>
            <tr class="gk-kommentar-zeile">
                <td colspan="4">${renderStandKommentar(position.art, position.id, position.kommentar, istSchreibgeschuetzt())}</td>
            </tr>
        `;
    }).join('');

    box.hidden = false;
    box.innerHTML = `
        <div class="gk-pruef-overlay" onclick="gruppeTogglePruefliste(false)">
            <div class="gk-pruef-dialog" role="dialog" aria-modal="true" aria-labelledby="gk-pruef-titel"
                 onclick="event.stopPropagation()">
                <header class="gk-pruef-kopf">
                    <div>
                        <h2 id="gk-pruef-titel">${gk.prueflisteFilter === 'klaerung' ? 'In Klärung' : 'Prüfliste'}</h2>
                        <p class="text-muted">${klaerung} in Klärung · ${kommentare} mit Kommentar · ${nichtVerbaut} nicht verbaut</p>
                    </div>
                    <button type="button" class="btn btn-secondary btn-small" onclick="gruppeTogglePruefliste(false)">Schließen</button>
                </header>
                <div class="gk-pruef-filter">
                    ${filterButton('klaerung', 'In Klärung')}
                    ${filterButton('kommentar', 'Alle mit Kommentar')}
                    ${filterButton('offen', 'Nicht verbaut')}
                    ${filterButton('alle', 'Alle')}
                </div>
                ${sichtbar.length ? `
                    <div class="table-container">
                        <table class="gk-pruef-tabelle">
                            <thead>
                                <tr>
                                    <th>Art</th>
                                    <th>Bezeichnung</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>${zeilen}</tbody>
                        </table>
                    </div>
                ` : `<p class="gk-leer">${escapeHtml(leertext)}</p>`}
            </div>
        </div>
    `;
    passeKommentarHoeheAn(box);
}


/**
 * Tastenkürzel des Arbeitsbereichs: / Suche, J/K Gruppe wechseln, ⌘/Strg+Enter abschließen.
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function gruppeTastenkuerzel(event) {
    if (!document.getElementById('view-gruppen')?.classList.contains('active')) return;
    if (event.key === 'Escape' && gk.prueflisteOffen) {
        event.preventDefault();
        gruppeTogglePruefliste(false);
        return;
    }
    if (event.key === 'Escape' && document.getElementById('gruppen-neu-overlay')?.classList.contains('active')) {
        event.preventDefault();
        gruppeCloseNeueGruppe();
        return;
    }
    if (document.querySelector('.editor-overlay, .picker-overlay, #modal-overlay.active, #bauteil-edit-overlay.active, #gruppen-neu-overlay.active')) return;

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (leseGruppenStatus(gk.aktiveGruppe).abgeschlossen) gruppeWechseln(1);
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



/**
 * Tastenkürzel und „Klick daneben schließt die Suche“ einmalig registrieren.
 * @returns {void}
 */
function registriereGruppenEreignisse() {
    if (gk.gruppenTastenAktiv) return;
    gk.gruppenTastenAktiv = true;
    document.addEventListener('keydown', gruppeTastenkuerzel);
    document.addEventListener('mousedown', event => {
        if (gk.pickerState?.art === 'leitung' && !event.target.closest?.('#gk-suche')) gruppeClosePicker();
    });
}
