/**
 * @file Beschriftungsschilder je Projekt.
 *
 * Freie Liste für Leitungen, EP-Module und Beckhoff-Klemmen.
 * Gedruckt und abgehakt sind zwei getrennte Zustände.
 */
import { appState } from './state.js';
import { persistCurrentProjekt } from './projects.js';
import { assertCanEdit, canEditProject } from './project-access.js';
import { escapeHtml, jsArg, generateId } from './utils.js';
import { showView } from './navigation.js';
import { showModal } from './modal.js';

const ARTEN = [
    { id: 'leitung', label: 'Leitung' },
    { id: 'ep', label: 'EP-Modul' },
    { id: 'klemme', label: 'Beckhoff-Klemme' }
];

/** @type {'alle'|'offen'|'offen-druck'|'leitung'|'ep'|'klemme'} */
let filter = 'alle';


/**
 * @param {object} projekt
 * @returns {object[]}
 */
function schilder(projekt) {
    if (!projekt) return [];
    if (!Array.isArray(projekt.beschriftung)) projekt.beschriftung = [];
    return projekt.beschriftung;
}


/**
 * @param {object} schild
 * @returns {boolean}
 */
function passtFilter(schild) {
    if (filter === 'offen') return !schild.erledigt;
    if (filter === 'offen-druck') return !schild.gedruckt;
    if (filter === 'alle') return true;
    return schild.art === filter;
}


/**
 * @param {object[]} liste
 * @returns {string}
 */
function renderFilter(liste) {
    const knoepfe = [
        { id: 'alle', label: 'Alle' },
        { id: 'offen', label: 'Offen' },
        { id: 'offen-druck', label: 'Nicht gedruckt' },
        ...ARTEN.map(art => ({ id: art.id, label: art.label }))
    ];
    return `
        <div class="beschriftung-filter" role="group" aria-label="Schilder filtern">
            ${knoepfe.map(knopf => {
                const anzahl = knopf.id === 'alle'
                    ? liste.length
                    : knopf.id === 'offen'
                        ? liste.filter(schild => !schild.erledigt).length
                        : knopf.id === 'offen-druck'
                            ? liste.filter(schild => !schild.gedruckt).length
                            : liste.filter(schild => schild.art === knopf.id).length;
                return `
                    <button type="button" class="btn btn-secondary btn-small${filter === knopf.id ? ' active' : ''}"
                            aria-pressed="${filter === knopf.id ? 'true' : 'false'}"
                            onclick="beschriftungFilter('${knopf.id}')">
                        ${escapeHtml(knopf.label)}${anzahl ? ` <span class="beschriftung-filter-zahl">${anzahl}</span>` : ''}
                    </button>
                `;
            }).join('')}
        </div>
    `;
}


/**
 * @param {object} schild
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderSchild(schild, gesperrt) {
    const id = jsArg(schild.id);
    const disabled = gesperrt ? ' disabled' : '';
    return `
        <li class="beschriftung-zeile${schild.erledigt ? ' erledigt' : ''}${schild.gedruckt ? ' gedruckt' : ''}">
            <label class="beschriftung-haken" title="Schild sitzt">
                <input type="checkbox" ${schild.erledigt ? 'checked' : ''}${disabled}
                       aria-label="Abgehakt"
                       onchange="beschriftungSetzen('${id}', 'erledigt', this.checked)">
                <span>Abgehakt</span>
            </label>
            <input type="text" class="beschriftung-text" value="${escapeHtml(schild.text || '')}"${disabled}
                   aria-label="Text auf dem Schild"
                   onchange="beschriftungSetzen('${id}', 'text', this.value)">
            <select aria-label="Art des Schilds"${disabled}
                    onchange="beschriftungSetzen('${id}', 'art', this.value)">
                ${ARTEN.map(art => `
                    <option value="${art.id}"${schild.art === art.id ? ' selected' : ''}>${escapeHtml(art.label)}</option>
                `).join('')}
            </select>
            <input type="text" class="beschriftung-notiz" value="${escapeHtml(schild.notiz || '')}"${disabled}
                   placeholder="wo es hingehört" aria-label="Notiz"
                   onchange="beschriftungSetzen('${id}', 'notiz', this.value)">
            <label class="beschriftung-druck" title="Schild ist gedruckt">
                <input type="checkbox" ${schild.gedruckt ? 'checked' : ''}${disabled}
                       aria-label="Gedruckt"
                       onchange="beschriftungSetzen('${id}', 'gedruckt', this.checked)">
                <span>Gedruckt</span>
            </label>
            ${gesperrt ? '' : `
                <button type="button" class="beschriftung-entfernen" title="Schild entfernen" aria-label="Schild entfernen"
                        onclick="beschriftungLoeschen('${id}')">×</button>
            `}
        </li>
    `;
}


/**
 * Zeichnet die Beschriftungsliste des aktuellen Projekts.
 * @returns {void}
 */
export function renderBeschriftung() {
    const inhalt = document.getElementById('beschriftung-inhalt');
    if (!appState.currentProjekt) {
        showView('home');
        return;
    }
    if (!inhalt) return;

    const projekt = appState.currentProjekt;
    const liste = schilder(projekt);
    const gesperrt = !canEditProject(projekt);
    const titel = document.getElementById('beschriftung-titel');
    if (titel) {
        titel.textContent = `Beschriftung – ${projekt.projektnummer || ''} ${projekt.name || ''}`.trim();
    }

    const offen = liste.filter(schild => !schild.erledigt).length;
    const nichtGedruckt = liste.filter(schild => !schild.gedruckt).length;
    const sichtbar = liste.filter(passtFilter);

    inhalt.innerHTML = `
        <p class="text-muted beschriftung-hinweis">
            Schilder für Leitungen, EP-Module und Beckhoff-Klemmen.
            Aufschreiben, als gedruckt markieren und abhaken, wenn das Schild sitzt.
        </p>
        <div class="beschriftung-stand">
            <span><strong>${liste.length}</strong> Schilder</span>
            <span><strong>${offen}</strong> offen</span>
            <span><strong>${nichtGedruckt}</strong> noch nicht gedruckt</span>
        </div>
        ${gesperrt ? '' : `
            <form class="beschriftung-neu" onsubmit="beschriftungHinzufuegen(event)">
                <input type="text" id="beschriftung-neu-text" required placeholder="Text auf dem Schild, z. B. =004 X1 Motor Spindel"
                       aria-label="Text auf dem Schild">
                <select id="beschriftung-neu-art" aria-label="Art des Schilds">
                    ${ARTEN.map(art => `<option value="${art.id}">${escapeHtml(art.label)}</option>`).join('')}
                </select>
                <input type="text" id="beschriftung-neu-notiz" placeholder="wo es hingehört" aria-label="Notiz">
                <button type="submit" class="btn btn-primary">Schild aufnehmen</button>
            </form>
        `}
        ${liste.length ? renderFilter(liste) : ''}
        ${sichtbar.length ? `
            <ul class="beschriftung-liste">
                ${sichtbar.map(schild => renderSchild(schild, gesperrt)).join('')}
            </ul>
        ` : `
            <p class="beschriftung-leer">
                ${liste.length
                    ? 'In dieser Ansicht ist nichts offen.'
                    : 'Noch keine Schilder. Trag ein, was beim Schließen noch beschriftet werden muss.'}
            </p>
        `}
    `;
}


/**
 * @param {string} wert
 * @returns {void}
 */
export function beschriftungFilter(wert) {
    filter = ['alle', 'offen', 'offen-druck', 'leitung', 'ep', 'klemme'].includes(wert) ? wert : 'alle';
    renderBeschriftung();
}


/**
 * @param {Event} [event]
 * @returns {void}
 */
export function beschriftungHinzufuegen(event) {
    event?.preventDefault();
    const projekt = appState.currentProjekt;
    if (!projekt || !assertCanEdit('Schilder aufnehmen')) return;

    const text = document.getElementById('beschriftung-neu-text')?.value?.trim() || '';
    if (!text) return;
    const art = document.getElementById('beschriftung-neu-art')?.value || 'leitung';
    const notiz = document.getElementById('beschriftung-neu-notiz')?.value?.trim() || '';

    schilder(projekt).push({
        id: generateId('schild'),
        text,
        art: ARTEN.some(eintrag => eintrag.id === art) ? art : 'leitung',
        notiz,
        gedruckt: false,
        erledigt: false
    });
    persistCurrentProjekt();
    renderBeschriftung();
    document.getElementById('beschriftung-neu-text')?.focus();
}


/**
 * @param {string} id
 * @param {string} feld
 * @param {string|boolean} wert
 * @returns {void}
 */
export function beschriftungSetzen(id, feld, wert) {
    const projekt = appState.currentProjekt;
    const schild = schilder(projekt).find(eintrag => eintrag.id === id);
    if (!schild || !assertCanEdit('Schilder ändern')) return;

    if (feld === 'text') schild.text = String(wert || '').trim();
    else if (feld === 'notiz') schild.notiz = String(wert || '').trim();
    else if (feld === 'art') schild.art = ARTEN.some(eintrag => eintrag.id === wert) ? wert : 'leitung';
    else if (feld === 'gedruckt' || feld === 'erledigt') schild[feld] = wert === true || wert === 'true';
    else return;

    persistCurrentProjekt();
    if (feld === 'gedruckt' || feld === 'erledigt' || feld === 'art') renderBeschriftung();
}


/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function beschriftungLoeschen(id) {
    const projekt = appState.currentProjekt;
    const schild = schilder(projekt).find(eintrag => eintrag.id === id);
    if (!schild || !assertCanEdit('Schilder entfernen')) return;

    const bestaetigt = await showModal(
        `„${schild.text || 'Schild'}" wirklich aus der Liste nehmen?`,
        { type: 'warning', title: 'Schild entfernen', confirmText: 'Entfernen', cancelText: 'Abbrechen', showCancel: true }
    );
    if (!bestaetigt) return;

    projekt.beschriftung = schilder(projekt).filter(eintrag => eintrag.id !== id);
    persistCurrentProjekt();
    renderBeschriftung();
}
