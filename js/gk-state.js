/**
 * @file gk-state.js – Gemeinsamer Zustand und Grundfunktionen des Gruppen-Konfigurators.
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit, canEditProject } from './project-access.js';
import { getAlleGruppenFuerProjekt } from './overview.js';
import { aktualisiereBauteilTabelle, renderBauteilKarte } from './gk-bauteile.js';
import { aktualisiereLeitungsTabelle, ersetzeKarte, renderLeitungKarte } from './gk-leitungen.js';

/**
 * Zustand, den sich alle gk-*-Module teilen. Als Objekt, weil importierte
 * Bindungen in anderen Modulen nicht neu zugewiesen werden können.
 */
export const gk = {
    /** Code der aktuell geöffneten Gruppe. */
    aktiveGruppe: '',
    /** Prüfliste über alle Gruppen ist geöffnet. */
    prueflisteOffen: false,
    /** Filter der Prüfliste: alle, offen, kommentar oder klaerung. */
    prueflisteFilter: 'klaerung',
    /** Projekt, für das Filter und Prüfliste gelten. */
    prueflisteProjektId: null,
    /** Suchtext der Gruppenliste. */
    gruppenSuche: '',
    /** Leitung, die gerade im Formular unter der Übersicht bearbeitet wird. */
    aktiveLeitungId: '',
    /** Bauteil, das gerade im Formular unter der Übersicht bearbeitet wird. */
    aktivesBauteilId: '',
    /**
     * Offenes Formular für ein noch nicht katalogisiertes Bauteil.
     * @type {{bauteilId: string, typ: string}|null}
     */
    neuesBauteilFormular: null,
    /**
     * Offenes Formular für eine noch nicht katalogisierte Leitung.
     * @type {{leitungId: string, kategorie: string, hersteller: string, artikelnummer: string, beschreibung: string, steckerA: string, steckerB: string, laenge: string|number, meterware: boolean}|null}
     */
    neuesLeitungFormular: null,
    /**
     * Offenes Formular für einen eigenen Leitungs-Button.
     * @type {object|null}
     */
    eigenerButtonFormular: null,
    /**
     * Geöffneter Auswahldialog für Leitungen bzw. Bauteile.
     * Bei Bauteilen kann `typFilter` auf einen Typ gesetzt sein – dann zeigt der
     * Dialog die Katalogartikel dieses Typs zur Auswahl (Drill-down).
     * @type {{art: string, suche: string, typFilter?: string}|null}
     */
    pickerState: null,
    /** Eigenes Fenster für die gespeicherten Wege des Projekts. */
    wegeDialogOffen: false,
    /** Tastenkürzel und Klick-Handler sind registriert. */
    gruppenTastenAktiv: false,
    /** Leitungen, denen gerade angeboten wird, sie als Standard der Gruppe zu merken. */
    standardAngebotIds: new Set()
};


/**
 * @returns {boolean}
 */
export function istSchreibgeschuetzt() {
    return !canEditProject(appState.currentProjekt);
}


/**
 * @returns {object[]}
 */
export function getGruppen() {
    return getAlleGruppenFuerProjekt(appState.currentProjekt);
}


/**
 * @param {string} code
 * @returns {object|null}
 */
export function getGruppe(code) {
    return getGruppen().find(g => g.code === code) || null;
}


/**
 * @param {string} code
 * @returns {object}
 */
export function getGruppenStatus(code) {
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
export function getLeitungenDerGruppe(code) {
    return (appState.currentProjekt?.leitungen || []).filter(l => l.gruppe === code);
}


/**
 * @param {string} code
 * @returns {object[]}
 */
export function getBauteileDerGruppe(code) {
    return (appState.currentProjekt?.bauteile || []).filter(b => b.gruppe === code);
}


/**
 * @param {string} id
 * @returns {object|null}
 */
export function findLeitung(id) {
    return (appState.currentProjekt?.leitungen || []).find(l => l.id === id) || null;
}


/**
 * @param {string} id
 * @returns {object|null}
 */
export function findBauteil(id) {
    return (appState.currentProjekt?.bauteile || []).find(b => b.id === id) || null;
}


/**
 * @returns {void}
 */
export function renumberLeitungen() {
    (appState.currentProjekt?.leitungen || []).forEach((l, i) => { l.position = i + 1; });
}


/**
 * Baut Options-Markup für ein Select.
 * @param {Array<string|number|{value: string, label: string}>} werte
 * @param {string|number} selected
 * @returns {string}
 */
export function optionen(werte, selected) {
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
export function renderAnzahlStepper(art, id, anzahl, gesperrt = false) {
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
