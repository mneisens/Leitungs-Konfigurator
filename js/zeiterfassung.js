/**
 * @file Zeiterfassung je Projekt, Schritt und Person.
 */
import { appState } from './state.js';
import { escapeHtml, generateId } from './utils.js';
import { showView } from './navigation.js';
import { persistCurrentProjekt } from './projects.js';
import { canEditProject } from './project-access.js';
import { getAlleGruppenFuerProjekt, getGruppeDisplay } from './overview.js';
import { showModal } from './modal.js';


/**
 * @param {number} minuten
 * @returns {string}
 */
function formatDauer(minuten) {
    const gesamt = Math.max(0, Math.round(Number(minuten) || 0));
    const stunden = Math.floor(gesamt / 60);
    const rest = gesamt % 60;
    if (!stunden) return `${rest} min`;
    if (!rest) return `${stunden} h`;
    return `${stunden} h ${rest} min`;
}


/**
 * @returns {string} YYYY-MM-DD
 */
function heuteISO() {
    const datum = new Date();
    const monat = String(datum.getMonth() + 1).padStart(2, '0');
    const tag = String(datum.getDate()).padStart(2, '0');
    return `${datum.getFullYear()}-${monat}-${tag}`;
}


/**
 * @param {string} iso
 * @returns {string}
 */
function formatDatum(iso) {
    if (!iso) return '';
    const [jahr, monat, tag] = String(iso).split('-');
    if (!jahr || !monat || !tag) return iso;
    return `${tag}.${monat}.${jahr}`;
}


/**
 * @param {object} eintrag
 * @returns {string}
 */
function schrittLabel(eintrag) {
    if (eintrag.schritt) return getGruppeDisplay(eintrag.schritt);
    return (eintrag.schrittName || '').trim() || 'Ohne Schritt';
}


/**
 * @returns {object[]}
 */
function eintraege() {
    const liste = appState.currentProjekt?.zeiterfassung;
    return Array.isArray(liste) ? liste : [];
}


/**
 * @returns {string}
 */
function aktuellePerson() {
    const user = appState.currentUser;
    return (user?.email || user?.displayName || '').trim();
}


/**
 * Personen, die am Projekt hängen oder schon Zeit gebucht haben.
 * @returns {string[]}
 */
function bekanntePersonen() {
    const namen = new Set();
    const projekt = appState.currentProjekt;
    const ich = aktuellePerson();
    if (ich) namen.add(ich);
    if (projekt?.ownerEmail) namen.add(projekt.ownerEmail);
    Object.values(projekt?.members || {}).forEach(member => {
        if (member?.email) namen.add(member.email);
    });
    eintraege().forEach(eintrag => {
        if (eintrag.person) namen.add(eintrag.person);
    });
    return Array.from(namen).sort((a, b) => a.localeCompare(b, 'de'));
}


/**
 * @param {object[]} liste
 * @param {(eintrag: object) => string} schluessel
 * @returns {Array<{name: string, minuten: number}>}
 */
function summiere(liste, schluessel) {
    const map = new Map();
    liste.forEach(eintrag => {
        const name = schluessel(eintrag);
        map.set(name, (map.get(name) || 0) + (Number(eintrag.minuten) || 0));
    });
    return Array.from(map.entries())
        .map(([name, minuten]) => ({ name, minuten }))
        .sort((a, b) => b.minuten - a.minuten || a.name.localeCompare(b.name, 'de'));
}


/**
 * Öffnet die Zeiterfassung und wählt den Schritt vor.
 * @param {string} [schritt]
 * @returns {void}
 */
export function zeitOeffnen(schritt) {
    appState.pendingZeitSchritt = String(schritt || '').trim();
    showView('zeiterfassung');
}


/**
 * Blendet das Freitextfeld für einen eigenen Schritt ein oder aus.
 * @param {string} wert
 * @returns {void}
 */
export function zeitSchrittGeaendert(wert) {
    const feld = document.getElementById('zeit-schritt-frei-wrap');
    if (feld) feld.hidden = wert !== '__frei__';
}


/**
 * Zeichnet die Zeiterfassung des aktuellen Projekts.
 * @returns {void}
 */
export function renderZeiterfassung() {
    const inhalt = document.getElementById('zeit-inhalt');
    if (!appState.currentProjekt) {
        showView('home');
        return;
    }
    if (!inhalt) return;

    const projekt = appState.currentProjekt;
    if (!Array.isArray(projekt.zeiterfassung)) projekt.zeiterfassung = [];

    const titel = document.getElementById('zeit-titel');
    if (titel) titel.textContent = `Zeiterfassung – ${projekt.projektnummer || ''} ${projekt.name || ''}`.trim();

    const gesperrt = !canEditProject(projekt);
    const liste = eintraege().slice().sort((a, b) =>
        String(b.datum || '').localeCompare(String(a.datum || ''))
        || String(b.id || '').localeCompare(String(a.id || ''))
    );
    const gesamt = liste.reduce((summe, eintrag) => summe + (Number(eintrag.minuten) || 0), 0);
    const nachPerson = summiere(liste, eintrag => eintrag.person || 'Ohne Namen');
    const nachSchritt = summiere(liste, schrittLabel);
    const gruppen = getAlleGruppenFuerProjekt(projekt);
    const vorgewaehlt = appState.pendingZeitSchritt || '';
    appState.pendingZeitSchritt = '';
    const schrittVorhanden = gruppen.some(gruppe => gruppe.code === vorgewaehlt);

    inhalt.innerHTML = `
        <div class="zeit-summen">
            <div class="zeit-summe zeit-summe-gesamt">
                <span>Gesamt</span>
                <strong>${escapeHtml(formatDauer(gesamt))}</strong>
            </div>
            <div class="zeit-summe">
                <span>Nach Person</span>
                ${nachPerson.length
                    ? nachPerson.map(zeile => `<p><strong>${escapeHtml(formatDauer(zeile.minuten))}</strong> ${escapeHtml(zeile.name)}</p>`).join('')
                    : '<p class="text-muted">Noch keine Buchungen</p>'}
            </div>
            <div class="zeit-summe">
                <span>Nach Schritt</span>
                ${nachSchritt.length
                    ? nachSchritt.map(zeile => `<p><strong>${escapeHtml(formatDauer(zeile.minuten))}</strong> ${escapeHtml(zeile.name)}</p>`).join('')
                    : '<p class="text-muted">Noch keine Buchungen</p>'}
            </div>
        </div>

        ${gesperrt ? '' : `
        <form class="form-card zeit-formular" onsubmit="zeitSpeichern(event)">
            <h3>Zeit eintragen</h3>
            <div class="form-row">
                <div class="form-group">
                    <label for="zeit-schritt">Schritt</label>
                    <select id="zeit-schritt" onchange="zeitSchrittGeaendert(this.value)">
                        <option value="">Bitte wählen</option>
                        ${gruppen.map(gruppe => `
                            <option value="${escapeHtml(gruppe.code)}"${schrittVorhanden && gruppe.code === vorgewaehlt ? ' selected' : ''}>
                                ${escapeHtml(getGruppeDisplay(gruppe.code))}
                            </option>
                        `).join('')}
                        <option value="__frei__">Anderer Schritt…</option>
                    </select>
                </div>
                <div class="form-group" id="zeit-schritt-frei-wrap" hidden>
                    <label for="zeit-schritt-frei">Bezeichnung</label>
                    <input type="text" id="zeit-schritt-frei" placeholder="z. B. Besprechung, CAD, Inbetriebnahme">
                </div>
                <div class="form-group">
                    <label for="zeit-person">Person</label>
                    <input type="text" id="zeit-person" list="zeit-personen" required
                           value="${escapeHtml(aktuellePerson())}" placeholder="Name oder E-Mail">
                    <datalist id="zeit-personen">
                        ${bekanntePersonen().map(name => `<option value="${escapeHtml(name)}"></option>`).join('')}
                    </datalist>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="zeit-stunden">Stunden</label>
                    <input type="number" id="zeit-stunden" min="0" max="999" step="1" value="0">
                </div>
                <div class="form-group">
                    <label for="zeit-minuten">Minuten</label>
                    <input type="number" id="zeit-minuten" min="0" max="59" step="1" value="0">
                </div>
                <div class="form-group">
                    <label for="zeit-datum">Datum</label>
                    <input type="date" id="zeit-datum" required value="${heuteISO()}">
                </div>
            </div>
            <div class="form-group">
                <label for="zeit-notiz">Notiz</label>
                <input type="text" id="zeit-notiz" placeholder="Optional, z. B. nur Gruppe =010 verdrahtet">
            </div>
            <button type="submit" class="btn btn-primary">Zeit speichern</button>
        </form>
        `}

        <div class="form-card">
            <h3>Buchungen</h3>
            ${liste.length ? `
                <div class="table-container">
                    <table class="leitung-table zeit-tabelle">
                        <thead>
                            <tr>
                                <th>Datum</th>
                                <th>Schritt</th>
                                <th>Person</th>
                                <th>Dauer</th>
                                <th>Notiz</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${liste.map(eintrag => `
                                <tr>
                                    <td>${escapeHtml(formatDatum(eintrag.datum))}</td>
                                    <td>${escapeHtml(schrittLabel(eintrag))}</td>
                                    <td>${escapeHtml(eintrag.person || '')}</td>
                                    <td>${escapeHtml(formatDauer(eintrag.minuten))}</td>
                                    <td>${escapeHtml(eintrag.notiz || '')}</td>
                                    <td>${gesperrt ? '' : `<button type="button" class="btn btn-danger btn-small" onclick="zeitLoeschen('${escapeHtml(eintrag.id)}')">Entfernen</button>`}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<p class="text-muted">Für dieses Projekt ist noch keine Zeit erfasst.</p>'}
        </div>
    `;
}


/**
 * @param {Event} event
 * @returns {void}
 */
export function zeitSpeichern(event) {
    event?.preventDefault?.();
    const projekt = appState.currentProjekt;
    if (!projekt || !canEditProject(projekt)) return;

    const schrittWert = document.getElementById('zeit-schritt')?.value || '';
    const schrittFrei = document.getElementById('zeit-schritt-frei')?.value?.trim() || '';
    const person = document.getElementById('zeit-person')?.value?.trim() || '';
    const stunden = Math.max(0, parseInt(document.getElementById('zeit-stunden')?.value, 10) || 0);
    const minutenTeil = Math.min(59, Math.max(0, parseInt(document.getElementById('zeit-minuten')?.value, 10) || 0));
    const datum = document.getElementById('zeit-datum')?.value || '';
    const notiz = document.getElementById('zeit-notiz')?.value?.trim() || '';
    const minuten = stunden * 60 + minutenTeil;

    if (!schrittWert) {
        showModal('Bitte einen Schritt wählen.', { type: 'warning', title: 'Zeiterfassung' });
        return;
    }
    if (schrittWert === '__frei__' && !schrittFrei) {
        showModal('Bitte die Bezeichnung des Schritts eintragen.', { type: 'warning', title: 'Zeiterfassung' });
        return;
    }
    if (!person) {
        showModal('Bitte die Person eintragen.', { type: 'warning', title: 'Zeiterfassung' });
        return;
    }
    if (minuten < 1) {
        showModal('Die Dauer muss mindestens 1 Minute sein.', { type: 'warning', title: 'Zeiterfassung' });
        return;
    }

    if (!Array.isArray(projekt.zeiterfassung)) projekt.zeiterfassung = [];
    projekt.zeiterfassung.push({
        id: generateId('zeit'),
        schritt: schrittWert === '__frei__' ? '' : schrittWert,
        schrittName: schrittWert === '__frei__' ? schrittFrei : '',
        person,
        personId: person.toLowerCase() === aktuellePerson().toLowerCase() ? (appState.currentUser?.uid || '') : '',
        minuten,
        datum: datum || heuteISO(),
        notiz
    });
    persistCurrentProjekt();
    renderZeiterfassung();
}


/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function zeitLoeschen(id) {
    const projekt = appState.currentProjekt;
    if (!projekt || !canEditProject(projekt)) return;
    const eintrag = eintraege().find(item => item.id === id);
    if (!eintrag) return;

    const bestaetigt = await showModal(
        `${formatDauer(eintrag.minuten)} von ${eintrag.person || 'unbekannt'} am ${formatDatum(eintrag.datum)} wirklich entfernen?`,
        { type: 'warning', title: 'Buchung entfernen', confirmText: 'Entfernen', cancelText: 'Abbrechen', showCancel: true }
    );
    if (!bestaetigt) return;

    projekt.zeiterfassung = eintraege().filter(item => item.id !== id);
    persistCurrentProjekt();
    renderZeiterfassung();
}
