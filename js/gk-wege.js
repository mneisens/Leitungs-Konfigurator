/**
 * @file gk-wege.js – Leitungswege: Wegschritte, Wegvorlagen und Wege-Dialog.
 */
import { appState } from './state.js';
import { escapeHtml, jsArg, formatLaenge, generateId } from './utils.js';
import { persistCurrentProjekt } from './projects.js';
import { gk, findLeitung, istSchreibgeschuetzt, optionen } from './gk-state.js';
import { renderGruppenPanel } from './gk-gruppen.js';
import { aktualisiereArtikel, aktualisiereLeitungsTabelle, ersetzeKarte, renderLeitungKarte } from './gk-leitungen.js';


/**
 * @param {object} leitung
 * @returns {object[]}
 */
export function wegschritte(leitung) {
    return Array.isArray(leitung?.wegschritte) ? leitung.wegschritte : [];
}


/**
 * @param {object} leitung
 * @returns {boolean}
 */
export function hatWeg(leitung) {
    return wegVorlagenDerLeitung(leitung).length > 0
        || wegschritte(leitung).some(schritt => (schritt.name || '').trim() || Number(schritt.meter) > 0);
}


/**
 * @param {object} leitung
 * @returns {number}
 */
function wegSumme(leitung) {
    const summe = wegschritte(leitung).reduce((gesamt, schritt) => gesamt + (Number(schritt.meter) || 0), 0);
    return Math.round(summe * 1000) / 1000;
}


/**
 * Gespeicherte Wege dieses Projekts.
 * @returns {object[]}
 */
export function leitungswege() {
    const projekt = appState.currentProjekt;
    if (!projekt) return [];
    if (!Array.isArray(projekt.leitungswege)) projekt.leitungswege = [];
    return projekt.leitungswege;
}


/**
 * @param {object} vorlage
 * @returns {number}
 */
export function summeWegVorlage(vorlage) {
    const summe = (vorlage?.schritte || []).reduce((gesamt, schritt) => gesamt + (Number(schritt.meter) || 0), 0);
    return Math.round(summe * 1000) / 1000;
}


/**
 * @param {object} leitung
 * @returns {string[]}
 */
function wegVorlagenIds(leitung) {
    return Array.isArray(leitung?.wegVorlagen) ? leitung.wegVorlagen : [];
}


/**
 * @param {object} leitung
 * @returns {object[]}
 */
export function wegVorlagenDerLeitung(leitung) {
    const ids = new Set(wegVorlagenIds(leitung));
    return leitungswege().filter(vorlage => ids.has(vorlage.id));
}


/**
 * @param {object[]} schritte
 * @returns {string}
 */
export function formatWegFormel(schritte) {
    return (schritte || [])
        .filter(schritt => Number(schritt.meter) > 0)
        .map(schritt => `${formatLaenge(schritt.meter)} m`)
        .join(' + ');
}


/**
 * Gespeicherte Wege plus eigene Abschnitte.
 * @param {object} leitung
 * @returns {number}
 */
function gesamtWegMeter(leitung) {
    const ausVorlagen = wegVorlagenDerLeitung(leitung)
        .reduce((gesamt, vorlage) => gesamt + summeWegVorlage(vorlage), 0);
    return Math.round((ausVorlagen + wegSumme(leitung)) * 1000) / 1000;
}


/**
 * Summe der Abschnitte, solange schon Meter eingetragen sind.
 * Sonst bleibt die bisherige Leitungslänge sichtbar.
 * @param {object} leitung
 * @returns {number}
 */
export function anzeigeWegSumme(leitung) {
    if (wegVorlagenDerLeitung(leitung).some(vorlage => summeWegVorlage(vorlage) > 0)
        || wegschritte(leitung).some(schritt => Number(schritt.meter) > 0)) {
        return gesamtWegMeter(leitung);
    }
    return Number(leitung.laenge) || 0;
}


/**
 * Die Summe der Wegabschnitte ist die Leitungslänge.
 * @param {object} leitung
 * @returns {void}
 */
function uebernehmeWegLaenge(leitung) {
    const hatVorlage = wegVorlagenDerLeitung(leitung).some(vorlage => summeWegVorlage(vorlage) > 0);
    const hatLokal = wegschritte(leitung).some(schritt => Number(schritt.meter) > 0);
    if (!hatVorlage && !hatLokal) return;
    leitung.laenge = gesamtWegMeter(leitung);
}


/**
 * Schreibt die Länge aller Leitungen neu, die diesen gespeicherten Weg nutzen.
 * @param {string} vorlageId
 * @returns {void}
 */
function aktualisiereLeitungenMitVorlage(vorlageId) {
    (appState.currentProjekt?.leitungen || []).forEach(leitung => {
        if (!wegVorlagenIds(leitung).includes(vorlageId)) return;
        uebernehmeWegLaenge(leitung);
        aktualisiereArtikel(leitung);
    });
}


/**
 * @param {string|number} wert
 * @returns {number}
 */
export function parseMeter(wert) {
    const text = String(wert ?? '')
        .trim()
        .replace(/\s*m\s*$/i, '')
        .replace(/\s/g, '')
        .replace(',', '.');
    const zahl = parseFloat(text);
    if (!Number.isFinite(zahl) || zahl <= 0) return 0;
    return Math.round(zahl * 1000) / 1000;
}


/**
 * Meterfeld, das 1.6, 1,6 und 1,6m annimmt.
 * @param {number} wert
 * @param {string} attrs
 * @returns {string}
 */
function renderMeterFeld(wert, attrs) {
    const anzeige = Number(wert) > 0 ? formatLaenge(wert) : '';
    return `<input type="text" inputmode="decimal" class="gk-weg-meter" value="${escapeHtml(anzeige)}" placeholder="m" ${attrs}>`;
}


/**
 * @param {object} leitung
 * @param {boolean} gesperrt
 * @returns {string}
 */
export function renderWeg(leitung, gesperrt) {
    const id = jsArg(leitung.id);
    const schritte = wegschritte(leitung);
    const zeilen = schritte.map((schritt, index) => `
        <li class="gk-weg-zeile">
            <span class="gk-weg-nr">${index + 1}</span>
            <input type="text" data-weg="${escapeHtml(schritt.id)}" value="${escapeHtml(schritt.name || '')}"${gesperrt ? ' disabled' : ''}
                   placeholder="z. B. Schaltschrank bis Kabelrinne" aria-label="Bezeichnung Wegabschnitt ${index + 1}"
                   onchange="gruppeUpdateWegschritt('${id}', '${jsArg(schritt.id)}', 'name', this.value)">
            ${renderMeterFeld(schritt.meter, `${gesperrt ? 'disabled' : ''}
                   aria-label="Meter Wegabschnitt ${index + 1}"
                   onchange="gruppeUpdateWegschritt('${id}', '${jsArg(schritt.id)}', 'meter', this.value)"`)}
            ${gesperrt ? '' : `<button type="button" class="gk-weg-entfernen" title="Abschnitt entfernen" aria-label="Abschnitt entfernen"
                    onclick="gruppeDeleteWegschritt('${id}', '${jsArg(schritt.id)}')">×</button>`}
        </li>
    `).join('');

    return `
        <div class="gk-weg-editor">
            <div class="gk-weg-kopf">
                <span class="chip-feld-label">Weg</span>
                ${hatWeg(leitung) ? `<strong>${formatLaenge(anzeigeWegSumme(leitung))} m</strong>` : ''}
            </div>
            <p class="text-muted">Abschnitte eintragen oder einen gespeicherten Weg wählen. Die Summe ist die Leitungslänge.</p>
            ${renderGewaehlteWege(leitung, gesperrt)}
            ${zeilen ? `<ol class="gk-weg-liste">${zeilen}</ol>` : ''}
            ${gesperrt ? '' : `<button type="button" class="gk-link" onclick="gruppeAddWegschritt('${id}')">+ Wegabschnitt</button>`}
            ${renderWegAuswahl(leitung, gesperrt)}
        </div>
    `;
}


/**
 * Bereits gewählte Projektwege auf dieser Leitung.
 * @param {object} leitung
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderGewaehlteWege(leitung, gesperrt) {
    const vorlagen = wegVorlagenDerLeitung(leitung);
    if (!vorlagen.length) return '';
    const id = jsArg(leitung.id);
    return `
        <ul class="gk-weg-gewaehlt">
            ${vorlagen.map(vorlage => `
                <li>
                    <span>${escapeHtml(vorlage.name)}</span>
                    <strong>${formatLaenge(summeWegVorlage(vorlage))} m</strong>
                    ${gesperrt ? '' : `<button type="button" class="gk-weg-entfernen" title="Weg von dieser Leitung nehmen" aria-label="Weg von dieser Leitung nehmen"
                        onclick="gruppeWegVorlageWaehlen('${id}', '${jsArg(vorlage.id)}')">×</button>`}
                    ${renderVorlageSchritte(vorlage, gesperrt)}
                </li>
            `).join('')}
        </ul>
    `;
}


/**
 * Abschnitte eines gespeicherten Wegs zum Bearbeiten.
 * @param {object} vorlage
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderVorlageSchritte(vorlage, gesperrt) {
    const schritte = (vorlage.schritte || []).map((schritt, index) => `
        <li class="gk-weg-zeile">
            <span class="gk-weg-nr">${index + 1}</span>
            <input type="text" value="${escapeHtml(schritt.name || '')}"${gesperrt ? ' disabled' : ''}
                   aria-label="Bezeichnung ${escapeHtml(vorlage.name)} Abschnitt ${index + 1}"
                   onchange="gruppeUpdateWegVorlage('${jsArg(vorlage.id)}', '${jsArg(schritt.id)}', 'name', this.value)">
            ${renderMeterFeld(schritt.meter, `${gesperrt ? 'disabled' : ''}
                   aria-label="Meter ${escapeHtml(vorlage.name)} Abschnitt ${index + 1}"
                   onchange="gruppeUpdateWegVorlage('${jsArg(vorlage.id)}', '${jsArg(schritt.id)}', 'meter', this.value)"`)}
            ${gesperrt ? '' : `<button type="button" class="gk-weg-entfernen" title="Abschnitt entfernen" aria-label="Abschnitt entfernen"
                onclick="gruppeDeleteWegVorlageSchritt('${jsArg(vorlage.id)}', '${jsArg(schritt.id)}')">×</button>`}
        </li>
    `).join('');

    return `
        ${schritte ? `<ol class="gk-weg-liste">${schritte}</ol>` : ''}
        ${gesperrt ? '' : `<button type="button" class="gk-link" onclick="gruppeAddWegVorlageSchritt('${jsArg(vorlage.id)}')">+ Abschnitt</button>`}
    `;
}


/**
 * Kurze Auswahl im Leitungsfenster: Weg übernehmen oder die gemessenen Abschnitte merken.
 * @param {object} leitung
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderWegAuswahl(leitung, gesperrt) {
    const id = jsArg(leitung.id);
    const vorlagen = leitungswege();
    const gewaehlt = new Set(wegVorlagenIds(leitung));
    const offen = vorlagen.filter(vorlage => !gewaehlt.has(vorlage.id));
    const kannMerken = wegschritte(leitung).some(schritt => Number(schritt.meter) > 0);
    const optionen = offen.map(vorlage => `
        <option value="${jsArg(vorlage.id)}">${escapeHtml(vorlage.name)} · ${formatLaenge(summeWegVorlage(vorlage))} m</option>
    `).join('');

    return `
        <div class="gk-weg-auswahl">
            ${vorlagen.length && !gesperrt ? `
                <label class="chip-feld-label" for="gk-weg-wahl-${id}">Gespeicherten Weg verwenden</label>
                <select id="gk-weg-wahl-${id}"${offen.length ? '' : ' disabled'} aria-label="Gespeicherten Weg verwenden"
                        onchange="if (this.value) gruppeWegVorlageWaehlen('${id}', this.value)">
                    <option value="">${offen.length ? 'Weg wählen…' : 'Alle Wege sind gewählt'}</option>
                    ${optionen}
                </select>
            ` : ''}
            <div class="gk-weg-auswahl-aktionen">
                ${!gesperrt && kannMerken ? `
                    <div class="gk-weg-merken">
                        <input type="text" placeholder="z. B. In der Presse" aria-label="Name für den gemessenen Weg">
                        <button type="button" class="gk-link" onclick="gruppeWegMerken('${id}', this.previousElementSibling.value)">Weg merken</button>
                    </div>
                ` : ''}
                <button type="button" class="gk-link" onclick="gruppeOpenWegeDialog()">Gespeicherte Wege${vorlagen.length ? ` (${vorlagen.length})` : ''}</button>
            </div>
        </div>
    `;
}


/**
 * Eine gespeicherte Wegvorlage im eigenen Fenster.
 * @param {object} vorlage
 * @param {object|null} leitung
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderWegVorlageEditor(vorlage, leitung, gesperrt) {
    const aktiv = !!(leitung && wegVorlagenIds(leitung).includes(vorlage.id));

    return `
        <li class="gk-weg-vorlage${aktiv ? ' aktiv' : ''}" data-weg-vorlage="${escapeHtml(vorlage.id)}">
            <div class="gk-weg-vorlage-kopf${leitung ? '' : ' ohne-wahl'}">
                ${leitung && !gesperrt ? `
                    <button type="button" class="gk-weg-vorlage-wahl"
                            onclick="gruppeWegVorlageWaehlen('${jsArg(leitung.id)}', '${jsArg(vorlage.id)}')">
                        ${aktiv ? 'Gewählt' : 'Verwenden'}
                    </button>
                ` : ''}
                <input type="text" value="${escapeHtml(vorlage.name || '')}"${gesperrt ? ' disabled' : ''}
                       aria-label="Name des gespeicherten Wegs"
                       onchange="gruppeWegVorlageUmbenennen('${jsArg(vorlage.id)}', this.value)">
                <strong>${formatLaenge(summeWegVorlage(vorlage))} m</strong>
                ${gesperrt ? '' : `<button type="button" class="gk-weg-entfernen" title="Gespeicherten Weg löschen" aria-label="Gespeicherten Weg löschen"
                    onclick="gruppeWegVorlageLoeschen('${jsArg(vorlage.id)}')">×</button>`}
            </div>
            ${renderVorlageSchritte(vorlage, gesperrt)}
        </li>
    `;
}


/**
 * Inhalt des Fensters „Gespeicherte Wege“.
 * @returns {string}
 */
function renderWegeDialogKarte() {
    const gesperrt = istSchreibgeschuetzt();
    const leitung = gk.aktiveLeitungId ? findLeitung(gk.aktiveLeitungId) : null;
    const vorlagen = leitungswege();
    const liste = vorlagen.map(vorlage => renderWegVorlageEditor(vorlage, leitung, gesperrt)).join('');

    return `
        <div class="gruppen-karte" id="gk-wege-dialog">
            <div class="gruppen-karte-kopf">
                <strong class="gruppen-karte-titel">Gespeicherte Wege</strong>
            </div>
            <p class="text-muted">Einmal ausmessen und benennen. Die Wege gelten für dieses Projekt und können jeder Leitung zugeordnet werden.</p>
            ${liste
                ? `<ul class="gk-weg-bibliothek-liste">${liste}</ul>`
                : '<p class="text-muted">Noch kein Weg gespeichert.</p>'}
            ${gesperrt ? '' : `
                <div class="gk-weg-merken">
                    <input type="text" id="gk-weg-neu-name" placeholder="z. B. In der Presse" aria-label="Name für einen neuen Weg">
                    <button type="button" class="gk-link" onclick="gruppeWegAnlegen(document.getElementById('gk-weg-neu-name').value)">Weg anlegen</button>
                </div>
            `}
            <div class="leitung-karte-aktionen leitung-karte-aktionen-unten">
                <button type="button" class="btn btn-primary" onclick="gruppeCloseWegeDialog()">Fertig</button>
            </div>
        </div>
    `;
}


/**
 * @returns {string}
 */
export function renderWegeDialog() {
    if (!gk.wegeDialogOffen) return '';
    return `
        <div class="editor-overlay gk-wege-overlay" id="gk-wege-overlay" onclick="gruppeCloseWegeDialog()">
            <div class="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="gk-wege-dialog"
                 onclick="event.stopPropagation()">
                ${renderWegeDialogKarte()}
            </div>
        </div>
    `;
}


/**
 * Zeichnet nur das Wege-Fenster neu, das Leitungsfenster darunter bleibt.
 * @returns {void}
 */
function zeichneWegeDialogNeu() {
    const dialog = document.getElementById('gk-wege-dialog');
    if (!gk.wegeDialogOffen || !dialog) return;
    dialog.outerHTML = renderWegeDialogKarte();
}


/**
 * Öffnet die gespeicherten Wege in einem eigenen Fenster.
 * @returns {void}
 */
export function gruppeOpenWegeDialog() {
    gk.wegeDialogOffen = true;
    if (document.getElementById('gk-wege-overlay')) {
        zeichneWegeDialogNeu();
        return;
    }
    renderGruppenPanel();
    document.getElementById('gk-weg-neu-name')?.focus();
}


/**
 * Schließt das Fenster der gespeicherten Wege.
 * @returns {void}
 */
export function gruppeCloseWegeDialog() {
    gk.wegeDialogOffen = false;
    document.getElementById('gk-wege-overlay')?.remove();
}


/**
 * Legt einen leeren Weg in diesem Projekt an.
 * @param {string} name
 * @returns {void}
 */
export function gruppeWegAnlegen(name) {
    const titel = String(name || '').trim();
    if (!titel || istSchreibgeschuetzt()) return;
    const liste = leitungswege();
    let vorlage = liste.find(eintrag => eintrag.name.trim().toLowerCase() === titel.toLowerCase());
    if (!vorlage) {
        vorlage = {
            id: generateId('wegv'),
            name: titel,
            schritte: [{ id: generateId('weg'), name: '', meter: 0 }]
        };
        liste.push(vorlage);
    } else if (!(vorlage.schritte || []).length) {
        vorlage.schritte = [{ id: generateId('weg'), name: '', meter: 0 }];
    }
    aktualisiereWegBibliothek();
    document.querySelector(`#gk-wege-dialog [data-weg-vorlage="${CSS.escape(vorlage.id)}"] input`)?.focus();
}


/**
 * @param {object} leitung
 * @param {string} schrittId
 * @returns {object|null}
 */
function findWegschritt(leitung, schrittId) {
    return wegschritte(leitung).find(schritt => schritt.id === schrittId) || null;
}


/**
 * Zeichnet Karte und Tabelle neu und setzt den Fokus auf den neuen Abschnitt.
 * @param {object} leitung
 * @param {string} [fokusSchrittId]
 * @returns {void}
 */
function aktualisiereWeg(leitung, fokusSchrittId) {
    uebernehmeWegLaenge(leitung);
    aktualisiereArtikel(leitung);
    persistCurrentProjekt();
    if (document.getElementById(`leitung-karte-${leitung.id}`)) {
        ersetzeKarte(`leitung-karte-${leitung.id}`, renderLeitungKarte(leitung));
    }
    aktualisiereLeitungsTabelle();
    if (!fokusSchrittId) return;
    document.querySelector(
        `#leitung-karte-${CSS.escape(leitung.id)} .gk-weg-zeile input[data-weg="${CSS.escape(fokusSchrittId)}"]`
    )?.focus();
}


/**
 * Hängt einen leeren Wegabschnitt an.
 * @param {string} leitungId
 * @returns {void}
 */
export function gruppeAddWegschritt(leitungId) {
    const leitung = findLeitung(leitungId);
    if (!leitung || istSchreibgeschuetzt()) return;
    if (!Array.isArray(leitung.wegschritte)) leitung.wegschritte = [];
    const schritt = { id: generateId('weg'), name: '', meter: 0 };
    leitung.wegschritte.push(schritt);
    aktualisiereWeg(leitung, schritt.id);
}


/**
 * @param {string} leitungId
 * @param {string} schrittId
 * @param {'name'|'meter'} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeUpdateWegschritt(leitungId, schrittId, feld, wert) {
    const leitung = findLeitung(leitungId);
    const schritt = leitung ? findWegschritt(leitung, schrittId) : null;
    if (!schritt || istSchreibgeschuetzt()) return;
    if (feld === 'name') schritt.name = String(wert || '').trim();
    else if (feld === 'meter') schritt.meter = parseMeter(wert);
    else return;
    aktualisiereWeg(leitung);
}


/**
 * @param {string} leitungId
 * @param {string} schrittId
 * @returns {void}
 */
export function gruppeDeleteWegschritt(leitungId, schrittId) {
    const leitung = findLeitung(leitungId);
    if (!leitung || istSchreibgeschuetzt()) return;
    const entfernt = findWegschritt(leitung, schrittId);
    leitung.wegschritte = wegschritte(leitung).filter(schritt => schritt.id !== schrittId);
    if (!wegVorlagenDerLeitung(leitung).length && wegschritte(leitung).length && Number(entfernt?.meter) > 0) {
        leitung.laenge = wegSumme(leitung);
    }
    aktualisiereWeg(leitung);
}


/**
 * @param {string} vorlageId
 * @returns {object|null}
 */
function findWegVorlage(vorlageId) {
    return leitungswege().find(vorlage => vorlage.id === vorlageId) || null;
}


/**
 * Zeichnet die offene Leitung und die Tabelle neu, nachdem sich ein Projektweg geändert hat.
 * @param {string} [vorlageId]
 * @returns {void}
 */
function aktualisiereWegBibliothek(vorlageId) {
    if (vorlageId) aktualisiereLeitungenMitVorlage(vorlageId);
    persistCurrentProjekt();
    const offen = gk.aktiveLeitungId ? findLeitung(gk.aktiveLeitungId) : null;
    if (offen && document.getElementById(`leitung-karte-${offen.id}`)) {
        ersetzeKarte(`leitung-karte-${offen.id}`, renderLeitungKarte(offen));
    }
    zeichneWegeDialogNeu();
    aktualisiereLeitungsTabelle();
}


/**
 * Speichert die gerade eingetragenen Abschnitte als Weg dieses Projekts
 * und verwendet ihn auf der Leitung.
 * @param {string} leitungId
 * @param {string} name
 * @returns {void}
 */
export function gruppeWegMerken(leitungId, name) {
    const leitung = findLeitung(leitungId);
    const titel = String(name || '').trim();
    if (!leitung || !titel || istSchreibgeschuetzt()) return;
    const schritte = wegschritte(leitung).filter(schritt => (schritt.name || '').trim() || Number(schritt.meter) > 0);
    if (!schritte.some(schritt => Number(schritt.meter) > 0)) return;

    const liste = leitungswege();
    let vorlage = liste.find(eintrag => eintrag.name.trim().toLowerCase() === titel.toLowerCase());
    if (!vorlage) {
        vorlage = { id: generateId('wegv'), name: titel, schritte: [] };
        liste.push(vorlage);
    } else {
        vorlage.name = titel;
    }
    vorlage.schritte = schritte.map(schritt => ({
        id: generateId('weg'),
        name: (schritt.name || '').trim(),
        meter: Number(schritt.meter) || 0
    }));

    if (!Array.isArray(leitung.wegVorlagen)) leitung.wegVorlagen = [];
    if (!leitung.wegVorlagen.includes(vorlage.id)) leitung.wegVorlagen.push(vorlage.id);
    leitung.wegschritte = [];
    uebernehmeWegLaenge(leitung);
    aktualisiereArtikel(leitung);
    aktualisiereLeitungenMitVorlage(vorlage.id);
    persistCurrentProjekt();
    if (document.getElementById(`leitung-karte-${leitung.id}`)) {
        ersetzeKarte(`leitung-karte-${leitung.id}`, renderLeitungKarte(leitung));
    }
    zeichneWegeDialogNeu();
    aktualisiereLeitungsTabelle();
}


/**
 * Wählt einen gespeicherten Weg für diese Leitung oder nimmt ihn wieder herunter.
 * @param {string} leitungId
 * @param {string} vorlageId
 * @returns {void}
 */
export function gruppeWegVorlageWaehlen(leitungId, vorlageId) {
    const leitung = findLeitung(leitungId);
    if (!leitung || !findWegVorlage(vorlageId) || istSchreibgeschuetzt()) return;
    if (!Array.isArray(leitung.wegVorlagen)) leitung.wegVorlagen = [];
    const index = leitung.wegVorlagen.indexOf(vorlageId);
    if (index >= 0) leitung.wegVorlagen.splice(index, 1);
    else leitung.wegVorlagen.push(vorlageId);
    if (wegVorlagenDerLeitung(leitung).some(vorlage => summeWegVorlage(vorlage) > 0)
        || wegschritte(leitung).some(schritt => Number(schritt.meter) > 0)) {
        leitung.laenge = gesamtWegMeter(leitung);
    } else {
        leitung.laenge = 0;
    }
    aktualisiereArtikel(leitung);
    persistCurrentProjekt();
    if (document.getElementById(`leitung-karte-${leitung.id}`)) {
        ersetzeKarte(`leitung-karte-${leitung.id}`, renderLeitungKarte(leitung));
    }
    zeichneWegeDialogNeu();
    aktualisiereLeitungsTabelle();
}


/**
 * @param {string} vorlageId
 * @param {string} name
 * @returns {void}
 */
export function gruppeWegVorlageUmbenennen(vorlageId, name) {
    const vorlage = findWegVorlage(vorlageId);
    const titel = String(name || '').trim();
    if (!vorlage || !titel || istSchreibgeschuetzt()) return;
    vorlage.name = titel;
    aktualisiereWegBibliothek(vorlageId);
}


/**
 * @param {string} vorlageId
 * @param {string} schrittId
 * @param {'name'|'meter'} feld
 * @param {string} wert
 * @returns {void}
 */
export function gruppeUpdateWegVorlage(vorlageId, schrittId, feld, wert) {
    const vorlage = findWegVorlage(vorlageId);
    const schritt = vorlage?.schritte?.find(eintrag => eintrag.id === schrittId);
    if (!schritt || istSchreibgeschuetzt()) return;
    if (feld === 'name') schritt.name = String(wert || '').trim();
    else if (feld === 'meter') schritt.meter = parseMeter(wert);
    else return;
    aktualisiereWegBibliothek(vorlageId);
}


/**
 * @param {string} vorlageId
 * @returns {void}
 */
export function gruppeAddWegVorlageSchritt(vorlageId) {
    const vorlage = findWegVorlage(vorlageId);
    if (!vorlage || istSchreibgeschuetzt()) return;
    if (!Array.isArray(vorlage.schritte)) vorlage.schritte = [];
    vorlage.schritte.push({ id: generateId('weg'), name: '', meter: 0 });
    aktualisiereWegBibliothek(vorlageId);
}


/**
 * @param {string} vorlageId
 * @param {string} schrittId
 * @returns {void}
 */
export function gruppeDeleteWegVorlageSchritt(vorlageId, schrittId) {
    const vorlage = findWegVorlage(vorlageId);
    if (!vorlage || istSchreibgeschuetzt()) return;
    vorlage.schritte = (vorlage.schritte || []).filter(schritt => schritt.id !== schrittId);
    aktualisiereWegBibliothek(vorlageId);
}


/**
 * Entfernt einen gespeicherten Weg. Leitungen, die ihn nutzen, behalten die Meter als eigene Abschnitte.
 * @param {string} vorlageId
 * @returns {void}
 */
export function gruppeWegVorlageLoeschen(vorlageId) {
    const projekt = appState.currentProjekt;
    const vorlage = findWegVorlage(vorlageId);
    if (!projekt || !vorlage || istSchreibgeschuetzt()) return;
    (projekt.leitungen || []).forEach(leitung => {
        if (!wegVorlagenIds(leitung).includes(vorlageId)) return;
        const uebernommen = (vorlage.schritte || []).map(schritt => ({
            id: generateId('weg'),
            name: schritt.name || '',
            meter: Number(schritt.meter) || 0
        }));
        leitung.wegschritte = [...uebernommen, ...wegschritte(leitung)];
        leitung.wegVorlagen = wegVorlagenIds(leitung).filter(id => id !== vorlageId);
        uebernehmeWegLaenge(leitung);
    });
    projekt.leitungswege = leitungswege().filter(eintrag => eintrag.id !== vorlageId);
    aktualisiereWegBibliothek();
}
