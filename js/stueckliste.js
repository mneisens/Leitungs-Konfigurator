/**
 * @file stueckliste.js
 * Aggregierte Stückliste mit Bestell-/Liefer-/Kommissionier-Status.
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import { showView } from './navigation.js';
import { getBauteilTypName } from './catalog.js';
import { getGruppeDisplay } from './overview.js';
import { isLeitungMeaningful, getLeitungStueckzahl } from './konfigurator-stecker.js';
import { persistCurrentProjekt } from './projects.js';
import { canEditProject } from './project-access.js';


/**
 * @returns {object}
 */
function getStatusStore() {
    const projekt = appState.currentProjekt;
    if (!projekt) return { leitungen: {}, bauteile: {} };
    if (!projekt.stuecklisteStatus || typeof projekt.stuecklisteStatus !== 'object') {
        projekt.stuecklisteStatus = { leitungen: {}, bauteile: {} };
    }
    if (!projekt.stuecklisteStatus.leitungen) projekt.stuecklisteStatus.leitungen = {};
    if (!projekt.stuecklisteStatus.bauteile) projekt.stuecklisteStatus.bauteile = {};
    return projekt.stuecklisteStatus;
}


/**
 * @param {'leitungen'|'bauteile'} art
 * @param {string} key
 * @returns {{status: string, lieferdatum: string}}
 */
function getEintragStatus(art, key) {
    const store = getStatusStore();
    const raw = store[art]?.[key] || {};
    return {
        status: normalisiereStatus(raw),
        lieferdatum: raw.lieferdatum || ''
    };
}


/**
 * Alte Checkbox-Werte und früheres „bestellt“ auf den neuen Ablauf abbilden.
 * @param {object} raw
 * @returns {'offen'|'beosys'|'geliefert'|'kommissioniert'}
 */
function normalisiereStatus(raw) {
    const erlaubt = new Set(['offen', 'beosys', 'geliefert', 'kommissioniert']);
    let status = String(raw.status || '').trim();

    if (status === 'bestellt') status = 'beosys';
    if (erlaubt.has(status)) return status;

    if (raw.kommissioniert) return 'kommissioniert';
    if (raw.bestellt) return 'beosys';
    return 'offen';
}


/**
 * @returns {string} YYYY-MM-DD in lokaler Zeitzone
 */
function heuteISO() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}


/**
 * @param {{status: string, lieferdatum: string}} status
 * @returns {'offen'|'beosys'|'geliefert'|'kommissioniert'}
 */
export function getStuecklisteStatusWert(status) {
    return normalisiereStatus(status);
}


/**
 * @param {{status: string, lieferdatum: string}} status
 * @returns {{id: string, label: string, klasse: string}}
 */
export function getStuecklisteStatusInfo(status) {
    const wert = getStuecklisteStatusWert(status);

    if (wert === 'kommissioniert') {
        return { id: 'kommissioniert', label: 'Kommissioniert', klasse: 'status-ok' };
    }
    if (wert === 'geliefert') {
        return { id: 'geliefert', label: 'Geliefert', klasse: 'status-ok' };
    }

    if (status.lieferdatum && (wert === 'offen' || wert === 'beosys')) {
        const heute = heuteISO();
        if (status.lieferdatum < heute) {
            return { id: 'ueberfaellig', label: 'Lieferung überfällig', klasse: 'status-danger' };
        }
        if (status.lieferdatum === heute) {
            return { id: 'faellig', label: 'Lieferung heute', klasse: 'status-warn' };
        }
    }

    if (wert === 'beosys') {
        return { id: 'beosys', label: 'In Beosys', klasse: 'status-info' };
    }
    return { id: 'offen', label: 'Offen', klasse: 'status-muted' };
}


/**
 * @param {string} key
 * @returns {string}
 */
function encodeKey(key) {
    return encodeURIComponent(key);
}


/**
 * Aggregierte Leitungspositionen inkl. Status.
 * @returns {Array<object>}
 */
function getLeitungEintraege() {
    const leitungen = appState.currentProjekt?.leitungen || [];
    const grouped = new Map();

    leitungen.filter(isLeitungMeaningful).forEach(l => {
        const artikelnummer = (l.artikelnummer || l.artikelCustom || '-').trim() || '-';
        const hersteller = (l.hersteller || '-').trim() || '-';
        const typText = getLeitungstypText(l);
        const key = `${artikelnummer}|||${hersteller}|||${typText}`;
        const existing = grouped.get(key);

        if (existing) {
            existing.count += getLeitungStueckzahl(l);
        } else {
            grouped.set(key, {
                key,
                art: 'leitungen',
                artikelnummer,
                hersteller,
                typText,
                count: getLeitungStueckzahl(l),
                status: getEintragStatus('leitungen', key)
            });
        }
    });

    return Array.from(grouped.values())
        .sort((a, b) => b.count - a.count || a.typText.localeCompare(b.typText, 'de'));
}


/**
 * Aggregierte Bauteilpositionen inkl. Status.
 * @returns {Array<object>}
 */
function getBauteilEintraege() {
    const bauteile = appState.currentProjekt?.bauteile || [];
    const grouped = new Map();

    bauteile.forEach(b => {
        const key = `${b.gruppe || ''}|||${b.typ || ''}|||${b.artikelnummer || ''}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                key,
                art: 'bauteile',
                gruppe: b.gruppe || '-',
                typ: b.typ,
                hersteller: b.hersteller || '-',
                artikelnummer: b.artikelnummer || '-',
                count: 0,
                status: getEintragStatus('bauteile', key)
            });
        }
        grouped.get(key).count += b.anzahl || 1;
    });

    return Array.from(grouped.values())
        .sort((a, b) => a.gruppe.localeCompare(b.gruppe, 'de')
            || a.artikelnummer.localeCompare(b.artikelnummer, 'de'));
}


/**
 * Positionen, deren Lieferdatum heute oder überfällig ist und die noch nicht kommissioniert sind.
 * Bezieht sich auf das aktuelle Projekt.
 * @returns {Array<{art: string, label: string, lieferdatum: string, ueberfaellig: boolean}>}
 */
export function getStuecklisteErinnerungen() {
    if (!appState.currentProjekt) return [];
    const heute = heuteISO();
    const treffer = [];

    [...getLeitungEintraege(), ...getBauteilEintraege()].forEach(entry => {
        const s = entry.status;
        if (!s.lieferdatum) return;
        if (s.status === 'geliefert' || s.status === 'kommissioniert') return;
        if (s.lieferdatum > heute) return;

        const label = entry.art === 'leitungen'
            ? `${entry.typText} (${entry.artikelnummer})`
            : `${getBauteilTypName(entry.typ)} (${entry.artikelnummer})`;

        treffer.push({
            art: entry.art,
            label,
            lieferdatum: s.lieferdatum,
            ueberfaellig: s.lieferdatum < heute
        });
    });

    return treffer;
}


/**
 * @param {object} entry
 * @param {boolean} gesperrt
 * @returns {string}
 */
function renderStatusZellen(entry, gesperrt) {
    const s = entry.status;
    const info = getStuecklisteStatusInfo(s);
    const wert = getStuecklisteStatusWert(s);
    const key = encodeKey(entry.key);
    const art = entry.art;
    const disabled = gesperrt ? ' disabled' : '';
    const hinweis = (info.id === 'faellig' || info.id === 'ueberfaellig')
        ? `<span class="stueckliste-liefer-hinweis ${info.klasse}">${escapeHtml(info.label)}</span>`
        : '';

    return `
        <td class="stueckliste-status">
            <select class="stueckliste-status-select ${info.klasse}"${disabled}
                    aria-label="Status"
                    onchange="stuecklisteUpdateStatus('${art}', decodeURIComponent('${key}'), 'status', this.value)">
                <option value="offen"${wert === 'offen' ? ' selected' : ''}>Offen</option>
                <option value="beosys"${wert === 'beosys' ? ' selected' : ''}>In Beosys</option>
                <option value="geliefert"${wert === 'geliefert' ? ' selected' : ''}>Geliefert</option>
                <option value="kommissioniert"${wert === 'kommissioniert' ? ' selected' : ''}>Kommissioniert</option>
            </select>
            ${hinweis}
        </td>
        <td class="stueckliste-lieferdatum">
            <input type="date" value="${escapeHtml(s.lieferdatum)}"${disabled}
                   aria-label="Lieferdatum"
                   onchange="stuecklisteUpdateStatus('${art}', decodeURIComponent('${key}'), 'lieferdatum', this.value)">
        </td>
    `;
}


/**
 * @param {Array} erinnerungen
 * @returns {string}
 */
function renderErinnerungsBanner(erinnerungen) {
    const box = document.getElementById('stueckliste-erinnerung');
    if (!box) return;

    if (!erinnerungen.length) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }

    const ueberfaellig = erinnerungen.filter(e => e.ueberfaellig).length;
    const heute = erinnerungen.length - ueberfaellig;
    const teile = [];
    if (ueberfaellig) teile.push(`${ueberfaellig} überfällig`);
    if (heute) teile.push(`${heute} heute fällig`);

    box.hidden = false;
    box.innerHTML = `
        <strong>Liefererinnerung:</strong> ${teile.join(', ')}.
        <ul class="stueckliste-erinnerung-liste">
            ${erinnerungen.slice(0, 8).map(e => `
                <li>
                    <span>${escapeHtml(e.label)}</span>
                    <span class="stueckliste-erinnerung-datum ${e.ueberfaellig ? 'ueberfaellig' : ''}">
                        ${e.ueberfaellig ? 'seit' : 'am'} ${formatDatumDe(e.lieferdatum)}
                    </span>
                </li>
            `).join('')}
            ${erinnerungen.length > 8 ? `<li>… und ${erinnerungen.length - 8} weitere</li>` : ''}
        </ul>
    `;
}


/**
 * @param {string} iso
 * @returns {string}
 */
function formatDatumDe(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}.${m}.${y}`;
}


/**
 * Aktualisiert den Badge am Stückliste-Button in der Übersicht.
 * @returns {void}
 */
export function aktualisiereStuecklisteBadge() {
    const btn = document.querySelector('button[onclick="showView(\'stueckliste\')"]');
    if (!btn) return;

    const anzahl = getStuecklisteErinnerungen().length;
    let badge = btn.querySelector('.stueckliste-nav-badge');
    if (!anzahl) {
        badge?.remove();
        btn.title = 'Stückliste';
        return;
    }

    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'stueckliste-nav-badge';
        btn.appendChild(badge);
    }
    badge.textContent = String(anzahl);
    btn.title = `${anzahl} Liefererinnerung${anzahl === 1 ? '' : 'en'}`;
}


/**
 * renderStueckliste.
 * @returns {void}
 */
export function renderStueckliste() {
    if (!appState.currentProjekt) {
        showView('home');
        return;
    }

    document.getElementById('stueckliste-titel').textContent =
        `Stückliste - ${appState.currentProjekt.projektnummer} - ${appState.currentProjekt.name}`;

    const gesperrt = !canEditProject(appState.currentProjekt);
    const erinnerungen = getStuecklisteErinnerungen();
    renderErinnerungsBanner(erinnerungen);
    aktualisiereStuecklisteBadge();

    const tbody = document.getElementById('stueckliste-body');
    const emptyState = document.getElementById('keine-stueckliste');
    const tableContainer = document.getElementById('stueckliste-leitungen-table');
    const leitungEintraege = getLeitungEintraege();

    if (leitungEintraege.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) tableContainer.style.display = 'none';
        emptyState.style.display = 'block';
    } else {
        tbody.innerHTML = leitungEintraege.map(entry => `
            <tr class="${getStuecklisteStatusInfo(entry.status).klasse}">
                <td>${escapeHtml(entry.typText)}</td>
                <td>${escapeHtml(entry.hersteller)}</td>
                <td>${escapeHtml(entry.artikelnummer)}</td>
                <td>${entry.count}</td>
                ${renderStatusZellen(entry, gesperrt)}
            </tr>
        `).join('');
        if (tableContainer) tableContainer.style.display = 'block';
        emptyState.style.display = 'none';
    }

    const bauteileBody = document.getElementById('stueckliste-bauteile-body');
    const bauteileEmpty = document.getElementById('keine-stueckliste-bauteile');
    const bauteileTable = document.getElementById('stueckliste-bauteile-table');
    if (!bauteileBody || !bauteileEmpty) return;

    const bauteilEintraege = getBauteilEintraege();

    if (bauteilEintraege.length === 0) {
        bauteileBody.innerHTML = '';
        if (bauteileTable) bauteileTable.style.display = 'none';
        bauteileEmpty.style.display = 'block';
        return;
    }

    bauteileBody.innerHTML = bauteilEintraege.map(entry => `
        <tr class="${getStuecklisteStatusInfo(entry.status).klasse}">
            <td>${escapeHtml(getGruppeDisplay(entry.gruppe))}</td>
            <td>${escapeHtml(getBauteilTypName(entry.typ))}</td>
            <td>${escapeHtml(entry.hersteller)}</td>
            <td>${escapeHtml(entry.artikelnummer)}</td>
            <td>${entry.count}</td>
            ${renderStatusZellen(entry, gesperrt)}
        </tr>
    `).join('');

    if (bauteileTable) bauteileTable.style.display = 'block';
    bauteileEmpty.style.display = 'none';
}


/**
 * Speichert ein Statusfeld einer aggregierten Stücklistenposition.
 * @param {'leitungen'|'bauteile'} art
 * @param {string} key
 * @param {'status'|'lieferdatum'} feld
 * @param {boolean|string} wert
 * @returns {void}
 */
export function stuecklisteUpdateStatus(art, key, feld, wert) {
    if (!appState.currentProjekt || !canEditProject(appState.currentProjekt)) return;
    if (art !== 'leitungen' && art !== 'bauteile') return;

    const store = getStatusStore();
    const aktuell = getEintragStatus(art, key);

    if (feld === 'status') {
        const status = normalisiereStatus({ status: wert });
        aktuell.status = status;
        if (status === 'geliefert' && !aktuell.lieferdatum) {
            aktuell.lieferdatum = heuteISO();
        }
    } else if (feld === 'lieferdatum') {
        aktuell.lieferdatum = String(wert || '').trim();
    } else {
        return;
    }

    store[art][key] = {
        status: aktuell.status,
        lieferdatum: aktuell.lieferdatum
    };
    persistCurrentProjekt();
    renderStueckliste();
}


/**
 * getLeitungstypText.
 * @param {object} leitung
 * @returns {string}
 */
export function getLeitungstypText(leitung) {
    const kategorie = leitung.kategorie || 'sonstiges';
    const steckerA = leitung.steckerA || '-';
    const steckerB = leitung.steckerB || '-';
    const laenge = leitung.laenge ? `${leitung.laenge} m` : '-';
    return `${kategorie} | ${steckerA} -> ${steckerB} | ${laenge}`;
}
