/**
 * @file EA-Liste – grobe Checkliste je Projekt.
 *
 * Jedes Projekt startet mit dem Standard einer Maschine (`data/ea-standard.json`).
 * Abgewählte Punkte bleiben sichtbar, sind durchgestrichen und landen in der Excel mit Anzahl 0.
 * Entfernte Standardpunkte bleiben weg, bis die Liste auf den Standard zurückgesetzt wird.
 * Eigene Punkte und Abschnitte kommen dazu.
 */
import { appState } from './state.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit, canEditProject } from './project-access.js';
import { escapeHtml, escapeAttr, generateId } from './utils.js';
import { showModal } from './modal.js';
import { baueXlsx } from './xlsx-writer.js';

/** Dabei, Anzahl, Bezeichnung, Typ, Hersteller, Beistellung, Bemerkung, Aktion. */
const SPALTEN = 8;

/** @type {object|null} */
let standardDaten = null;
let nurBenoetigte = false;
let ereignisseGebunden = false;


/**
 * @returns {Promise<object>}
 */
async function ladeStandard() {
    if (standardDaten) return standardDaten;
    const antwort = await fetch('data/ea-standard.json', { cache: 'no-cache' });
    if (!antwort.ok) throw new Error('Standardliste nicht erreichbar');
    standardDaten = await antwort.json();
    return standardDaten;
}


/**
 * @param {object} vorlage
 * @returns {object}
 */
function positionAusVorlage(vorlage) {
    const anzahl = vorlage.anzahl == null ? null : Number(vorlage.anzahl) || 0;
    return {
        id: generateId('ea'),
        abschnitt: vorlage.abschnitt,
        standard: true,
        aktiv: anzahl == null || anzahl > 0,
        anzahl,
        bezeichnung: vorlage.bezeichnung || '',
        typ: vorlage.typ || '',
        hersteller: vorlage.hersteller || '',
        beistellung: vorlage.beistellung || '',
        bemerkung: vorlage.bemerkung || '',
        io: { ...(vorlage.io || {}) }
    };
}


/**
 * @param {object} standard
 * @returns {{version: number, abschnitte: string[], positionen: object[]}}
 */
function ausStandard(standard) {
    return {
        version: standard.version || 1,
        abschnitte: [...(standard.abschnitte || [])],
        positionen: (standard.positionen || []).map(positionAusVorlage)
    };
}


/**
 * Legt die Standardliste an und holt neue Standardpunkte nach, ohne Bestehendes zu überschreiben.
 * @param {object} projekt
 * @returns {Promise<void>}
 */
async function sicherstellen(projekt) {
    const standard = await ladeStandard();
    if (!projekt.eaListe || !Array.isArray(projekt.eaListe.positionen)) {
        projekt.eaListe = ausStandard(standard);
        persistCurrentProjekt();
        return;
    }
    const liste = projekt.eaListe;
    if (!Array.isArray(liste.abschnitte)) liste.abschnitte = [];
    let geaendert = false;
    (standard.abschnitte || []).forEach(name => {
        if (!liste.abschnitte.includes(name)) {
            liste.abschnitte.push(name);
            geaendert = true;
        }
    });
    const vorhanden = new Set(
        liste.positionen.filter(punkt => punkt.standard).map(punkt => `${punkt.abschnitt}\0${punkt.bezeichnung}`)
    );
    const entfernt = new Set(liste.entfernt || []);
    (standard.positionen || []).forEach(vorlage => {
        const schluessel = `${vorlage.abschnitt}\0${vorlage.bezeichnung || ''}`;
        if (vorhanden.has(schluessel) || entfernt.has(schluessel)) return;
        liste.positionen.push(positionAusVorlage(vorlage));
        geaendert = true;
    });
    if (geaendert) persistCurrentProjekt();
}


/**
 * @param {object} liste
 * @returns {Array<{name: string, positionen: object[]}>}
 */
function gruppiert(liste) {
    const namen = [...(liste.abschnitte || [])];
    liste.positionen.forEach(punkt => {
        if (punkt.abschnitt && !namen.includes(punkt.abschnitt)) namen.push(punkt.abschnitt);
    });
    return namen.map(name => ({
        name,
        positionen: liste.positionen.filter(punkt => punkt.abschnitt === name)
    }));
}


/**
 * @param {string} name
 * @returns {void}
 */
function aktualisiereAbschnittZaehler(name) {
    const positionen = appState.currentProjekt?.eaListe?.positionen || [];
    document.querySelectorAll(`[data-ea-zaehler="${CSS.escape(name)}"]`).forEach(el => {
        const alle = positionen.filter(punkt => punkt.abschnitt === name);
        el.textContent = `${alle.filter(punkt => punkt.aktiv).length} von ${alle.length}`;
    });
}


/**
 * @returns {void}
 */
function wendeFilter() {
    document.querySelectorAll('#ea-root tr[data-ea-id]').forEach(zeile => {
        zeile.hidden = nurBenoetigte && zeile.classList.contains('ea-raus');
    });
}


/**
 * @param {object} punkt
 * @param {string[]} optionen
 * @returns {string}
 */
function beistellungAuswahl(punkt, optionen) {
    const werte = [...optionen];
    if (punkt.beistellung && !werte.includes(punkt.beistellung)) werte.unshift(punkt.beistellung);
    return `<select data-ea-feld="beistellung" aria-label="Beistellung">
        <option value=""></option>
        ${werte.map(wert => `<option value="${escapeAttr(wert)}"${wert === punkt.beistellung ? ' selected' : ''}>${escapeHtml(wert)}</option>`).join('')}
    </select>`;
}


const MUELL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V5h6v2M8 7l1 13h6l1-13"/></svg>`;

/**
 * @param {object} punkt
 * @param {boolean} gesperrt
 * @param {string[]} optionen
 * @returns {string}
 */
function zeileHtml(punkt, gesperrt, optionen) {
    const sperre = gesperrt ? ' disabled' : '';
    const entfernen = gesperrt ? '' : `<button type="button" class="ea-loeschen" data-ea-aktion="delete" data-ea-id="${escapeAttr(punkt.id)}" title="Punkt entfernen" aria-label="Punkt entfernen">${MUELL_ICON}</button>`;
    return `<tr data-ea-id="${escapeAttr(punkt.id)}" data-ea-abschnitt="${escapeAttr(punkt.abschnitt)}" class="${punkt.aktiv ? '' : 'ea-raus'}">
        <td class="ea-c1"><input type="checkbox" data-ea-feld="aktiv" ${punkt.aktiv ? 'checked' : ''} aria-label="Im Projekt"${sperre}></td>
        <td class="ea-c2 ea-anzahl"><input type="number" min="0" step="1" inputmode="numeric" data-ea-feld="anzahl" value="${punkt.anzahl ?? ''}" aria-label="Anzahl"${sperre}></td>
        <td class="ea-c3">
            ${punkt.standard ? '' : '<span class="ea-zusatz">zusätzlich</span>'}
            <input type="text" data-ea-feld="bezeichnung" value="${escapeAttr(punkt.bezeichnung)}" aria-label="Bezeichnung"${sperre}>
        </td>
        <td><input type="text" data-ea-feld="typ" value="${escapeAttr(punkt.typ)}" aria-label="Typ"${sperre}></td>
        <td><input type="text" data-ea-feld="hersteller" value="${escapeAttr(punkt.hersteller)}" aria-label="Hersteller"${sperre}></td>
        <td>${beistellungAuswahl(punkt, optionen).replace('<select', `<select${sperre}`)}</td>
        <td><textarea data-ea-feld="bemerkung" rows="2" aria-label="Bemerkung"${sperre}>${escapeHtml(punkt.bemerkung)}</textarea></td>
        <td class="ea-aktion">${entfernen}</td>
    </tr>`;
}


/**
 * @param {object} projekt
 * @returns {void}
 */
function zeichne(projekt) {
    const root = document.getElementById('ea-root');
    if (!root) return;
    const liste = projekt.eaListe;
    const gesperrt = !canEditProject(projekt);
    const optionen = standardDaten?.beistellung || [];
    const standardAbschnitte = new Set(standardDaten?.abschnitte || []);

    root.innerHTML = `
        <label class="ea-filter">
            <input type="checkbox" id="ea-nur-benoetigte" ${nurBenoetigte ? 'checked' : ''}>
            Nur benötigte Punkte
        </label>
        <div class="ea-wrap">
            <table class="ea-table">
                <colgroup>
                    <col class="ea-col-check">
                    <col class="ea-col-anzahl">
                    <col class="ea-col-bez">
                    <col class="ea-col-typ">
                    <col class="ea-col-herst">
                    <col class="ea-col-beist">
                    <col class="ea-col-bem">
                    <col class="ea-col-aktion">
                </colgroup>
                <thead>
                    <tr>
                        <th class="ea-c1">Dabei</th>
                        <th class="ea-c2">Anzahl</th>
                        <th class="ea-c3">Bezeichnung</th>
                        <th>Typ</th>
                        <th>Hersteller</th>
                        <th>Beistellung</th>
                        <th>Bemerkung</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${gruppiert(liste).map(gruppe => {
                        const loeschen = !gesperrt && !standardAbschnitte.has(gruppe.name)
                            ? `<button type="button" class="btn btn-secondary btn-small" data-ea-aktion="abschnitt-loeschen" data-ea-abschnitt="${escapeAttr(gruppe.name)}">Abschnitt entfernen</button>`
                            : '';
                        const hinzufuegen = gesperrt ? '' : `<button type="button" class="btn btn-primary btn-small ea-add" data-ea-aktion="add" data-ea-abschnitt="${escapeAttr(gruppe.name)}">Punkt hinzufügen</button>`;
                        const an = gruppe.positionen.filter(punkt => punkt.aktiv).length;
                        return `<tr class="ea-abschnitt">
                            <td colspan="${SPALTEN}">
                                <div class="ea-abschnitt-zeile">
                                    ${hinzufuegen}
                                    <strong>${escapeHtml(gruppe.name)}</strong>
                                    <span class="ea-abschnitt-zahl" data-ea-zaehler="${escapeAttr(gruppe.name)}">${an} von ${gruppe.positionen.length}</span>
                                    ${loeschen}
                                </div>
                            </td>
                        </tr>
                        ${gruppe.positionen.map(punkt => zeileHtml(punkt, gesperrt, optionen)).join('')}`;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ${gesperrt ? '' : `
            <form class="ea-neu-abschnitt" data-ea-aktion="abschnitt">
                <input type="text" id="ea-neuer-abschnitt" placeholder="Neuer Abschnitt, z. B. Ziehkissen" aria-label="Neuer Abschnitt">
                <button type="submit" class="btn btn-secondary">Abschnitt hinzufügen</button>
            </form>
        `}
    `;
    wendeFilter();
}


/**
 * @param {string} id
 * @returns {object|null}
 */
function finde(id) {
    return appState.currentProjekt?.eaListe?.positionen?.find(punkt => punkt.id === id) || null;
}


/**
 * @param {Event} event
 * @returns {void}
 */
function onChange(event) {
    const ziel = event.target;
    if (!(ziel instanceof HTMLElement)) return;
    if (ziel.id === 'ea-nur-benoetigte' && ziel instanceof HTMLInputElement) {
        nurBenoetigte = ziel.checked;
        wendeFilter();
        return;
    }
    const feld = ziel.dataset.eaFeld;
    const zeile = ziel.closest('tr[data-ea-id]');
    if (!feld || !zeile) return;
    if (!assertCanEdit('die EA-Liste ändern')) {
        zeichne(appState.currentProjekt);
        return;
    }
    const punkt = finde(zeile.dataset.eaId);
    if (!punkt) return;

    if (feld === 'aktiv' && ziel instanceof HTMLInputElement) {
        punkt.aktiv = ziel.checked;
    } else if (feld === 'anzahl' && ziel instanceof HTMLInputElement) {
        const roh = ziel.value.trim();
        punkt.anzahl = roh === '' ? null : Math.max(0, Math.round(Number(roh) || 0));
        if (punkt.anzahl === 0) punkt.aktiv = false;
        else if (punkt.anzahl > 0) punkt.aktiv = true;
        const haken = zeile.querySelector('[data-ea-feld="aktiv"]');
        if (haken instanceof HTMLInputElement) haken.checked = punkt.aktiv;
    } else if (ziel instanceof HTMLInputElement || ziel instanceof HTMLTextAreaElement || ziel instanceof HTMLSelectElement) {
        punkt[feld] = ziel.value;
    }

    zeile.classList.toggle('ea-raus', !punkt.aktiv);
    aktualisiereAbschnittZaehler(punkt.abschnitt);
    wendeFilter();
    persistCurrentProjekt();
}


/**
 * @param {string} abschnitt
 * @returns {void}
 */
function punktHinzufuegen(abschnitt) {
    const liste = appState.currentProjekt.eaListe;
    const punkt = {
        id: generateId('ea'),
        abschnitt,
        standard: false,
        aktiv: true,
        anzahl: 1,
        bezeichnung: '',
        typ: '',
        hersteller: '',
        beistellung: '',
        bemerkung: '',
        io: {}
    };
    const letzte = liste.positionen.reduce((index, eintrag, aktuell) => (
        eintrag.abschnitt === abschnitt ? aktuell : index
    ), -1);
    liste.positionen.splice(letzte + 1, 0, punkt);
    persistCurrentProjekt();
    zeichne(appState.currentProjekt);
    document.querySelector(`tr[data-ea-id="${CSS.escape(punkt.id)}"] [data-ea-feld="bezeichnung"]`)?.focus();
}


/**
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function onClick(event) {
    const ziel = event.target;
    if (!(ziel instanceof Element)) return;
    const knopf = ziel.closest('[data-ea-aktion]');
    if (!knopf || knopf.dataset.eaAktion === 'abschnitt') return;
    if (!assertCanEdit('die EA-Liste ändern')) return;
    const aktion = knopf.dataset.eaAktion;
    const liste = appState.currentProjekt.eaListe;

    if (aktion === 'add') {
        punktHinzufuegen(knopf.dataset.eaAbschnitt || 'Zusatz');
        return;
    }
    if (aktion === 'delete') {
        const punkt = finde(knopf.dataset.eaId);
        if (!punkt) return;
        const bestaetigt = await showModal(
            `Punkt „${punkt.bezeichnung || 'ohne Bezeichnung'}“ entfernen?`,
            { type: 'danger', title: 'Punkt entfernen', showCancel: true, confirmText: 'Entfernen' }
        );
        if (!bestaetigt) return;
        if (punkt.standard) {
            const schluessel = `${punkt.abschnitt}\0${punkt.bezeichnung}`;
            if (!Array.isArray(liste.entfernt)) liste.entfernt = [];
            if (!liste.entfernt.includes(schluessel)) liste.entfernt.push(schluessel);
        }
        liste.positionen = liste.positionen.filter(eintrag => eintrag.id !== punkt.id);
        persistCurrentProjekt();
        zeichne(appState.currentProjekt);
        return;
    }
    if (aktion === 'abschnitt-loeschen') {
        const name = knopf.dataset.eaAbschnitt || '';
        const bestaetigt = await showModal(
            `Abschnitt „${name}“ und seine Punkte entfernen?`,
            { type: 'danger', title: 'Abschnitt entfernen', showCancel: true, confirmText: 'Entfernen' }
        );
        if (!bestaetigt) return;
        liste.abschnitte = liste.abschnitte.filter(eintrag => eintrag !== name);
        liste.positionen = liste.positionen.filter(eintrag => eintrag.abschnitt !== name);
        persistCurrentProjekt();
        zeichne(appState.currentProjekt);
    }
}


/**
 * @param {SubmitEvent} event
 * @returns {void}
 */
function onSubmit(event) {
    const formular = event.target;
    if (!(formular instanceof HTMLFormElement) || formular.dataset.eaAktion !== 'abschnitt') return;
    event.preventDefault();
    if (!assertCanEdit('einen Abschnitt hinzufügen')) return;
    const feld = document.getElementById('ea-neuer-abschnitt');
    const name = feld instanceof HTMLInputElement ? feld.value.trim() : '';
    if (!name) return;
    const liste = appState.currentProjekt.eaListe;
    if (liste.abschnitte.some(eintrag => eintrag.toLowerCase() === name.toLowerCase())) {
        showModal(`Den Abschnitt „${name}“ gibt es schon.`, { type: 'warning', title: 'Abschnitt' });
        return;
    }
    liste.abschnitte.push(name);
    persistCurrentProjekt();
    zeichne(appState.currentProjekt);
    document.querySelector(`[data-ea-aktion="add"][data-ea-abschnitt="${CSS.escape(name)}"]`)?.focus();
}


/**
 * @returns {void}
 */
function binde() {
    if (ereignisseGebunden) return;
    const root = document.getElementById('ea-root');
    if (!root) return;
    ereignisseGebunden = true;
    root.addEventListener('input', event => {
        const ziel = event.target;
        if (ziel instanceof HTMLSelectElement) return;
        if (ziel instanceof HTMLInputElement && (ziel.type === 'checkbox' || ziel.type === 'radio')) return;
        onChange(event);
    });
    root.addEventListener('change', event => {
        const ziel = event.target;
        const haken = ziel instanceof HTMLInputElement && (ziel.type === 'checkbox' || ziel.id === 'ea-nur-benoetigte');
        if (haken || ziel instanceof HTMLSelectElement) onChange(event);
    });
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('wheel', () => {
        if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') {
            document.activeElement.blur();
        }
    }, { passive: true });
}


/**
 * Zeichnet die EA-Liste des aktuellen Projekts.
 * @returns {Promise<void>}
 */
export async function renderEaListe() {
    const projekt = appState.currentProjekt;
    const root = document.getElementById('ea-root');
    if (!projekt || !root) return;
    const reset = document.getElementById('ea-reset');
    if (reset) reset.hidden = !canEditProject(projekt);
    try {
        await sicherstellen(projekt);
    } catch (error) {
        root.innerHTML = '<p class="text-muted">Die Standardliste konnte nicht geladen werden.</p>';
        console.error(error);
        return;
    }
    const titel = document.getElementById('ea-titel');
    if (titel) {
        const nummer = projekt.projektnummer || '';
        titel.textContent = nummer ? `EA-Liste · ${nummer}` : 'EA-Liste';
    }
    zeichne(projekt);
    binde();
}


/**
 * Verwirft die Projektliste und lädt den Standard neu.
 * @returns {Promise<void>}
 */
export async function eaListeZuruecksetzen() {
    if (!appState.currentProjekt || !assertCanEdit('die EA-Liste zurücksetzen')) return;
    const bestaetigt = await showModal(
        'Die EA-Liste wird auf den Standard zurückgesetzt. Eigene Punkte und Änderungen an Mengen und Texten gehen verloren.',
        { type: 'warning', title: 'Standard wiederherstellen', showCancel: true, confirmText: 'Zurücksetzen' }
    );
    if (!bestaetigt) return;
    appState.currentProjekt.eaListe = ausStandard(await ladeStandard());
    persistCurrentProjekt();
    zeichne(appState.currentProjekt);
}


/**
 * Baut das Arbeitsblatt im Aufbau der Vorlage.
 * @param {object} projekt
 * @returns {object}
 */
export function eaArbeitsblatt(projekt) {
    const liste = projekt.eaListe || { abschnitte: [], positionen: [] };
    const leer = (anzahl, s) => Array.from({ length: anzahl }, () => (s ? { s } : null));
    const kopf = (text, s = 2) => ({ v: text, s });
    const nummer = String(projekt.projektnummer || '');
    const nummerZelle = /^\d+$/.test(nummer) ? { v: Number(nummer), s: 1 } : { v: nummer, s: 1 };

    const rows = [
        [kopf('E/A Liste', 1), null, nummerZelle, ...leer(4)],
        [kopf('Ort'), kopf('Anzahl'), kopf('Bezeichnung'), kopf('Typ'), kopf('Hersteller'), kopf('Beistellung von'), kopf('Bemerkung')]
    ];

    const merges = ['A1:B1', 'C1:D1'];
    gruppiert(liste).forEach(gruppe => {
        const zeile = rows.length + 1;
        rows.push([kopf(gruppe.name, 4), ...leer(6)]);
        merges.push(`A${zeile}:G${zeile}`);
        gruppe.positionen.forEach(punkt => {
            const anzahl = punkt.aktiv ? punkt.anzahl : 0;
            rows.push([
                null,
                anzahl == null ? null : { v: anzahl, s: 5 },
                { v: punkt.bezeichnung || '' },
                { v: punkt.typ || '' },
                { v: punkt.hersteller || '' },
                { v: punkt.beistellung || '' },
                { v: punkt.bemerkung || '' }
            ]);
        });
    });

    const letzte = rows.length;
    return {
        name: 'EA-Liste',
        cols: [14, 10, 62, 46, 22, 28, 70],
        rows,
        merges,
        freeze: 2,
        rowHeights: { 1: 22, 2: 18 },
        validation: letzte > 2 ? { sqref: `F3:F${letzte}`, list: standardDaten?.beistellung || [] } : null
    };
}


/**
 * Lädt die EA-Liste des aktuellen Projekts als Excel-Datei herunter.
 * @returns {Promise<void>}
 */
export async function exportEaListe() {
    const projekt = appState.currentProjekt;
    if (!projekt) return;
    try {
        await sicherstellen(projekt);
    } catch (error) {
        showModal('Die Standardliste konnte nicht geladen werden.', { type: 'warning', title: 'EA-Liste' });
        console.error(error);
        return;
    }
    const blob = baueXlsx(eaArbeitsblatt(projekt));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const datum = new Date().toISOString().slice(0, 10);
    const nummer = String(projekt.projektnummer || 'Projekt').replace(/[\\/:*?"<>|]/g, '-');
    link.href = url;
    link.download = `${datum} EA Liste ${nummer}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
