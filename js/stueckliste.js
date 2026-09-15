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
import { istMeterwareKategorie } from './leitung-optionen.js';
import { persistCurrentProjekt } from './projects.js';
import { canEditProject } from './project-access.js';
import { showModal } from './modal.js';


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
 * @param {string} artikelnummer
 * @returns {string}
 */
function normalizeArtikelnummer(artikelnummer) {
    const nr = String(artikelnummer || '').trim();
    return nr && nr !== '-' ? nr : '';
}


/**
 * @param {number|string} wert
 * @returns {string}
 */
function formatLaenge(wert) {
    const n = Number(wert);
    if (Number.isNaN(n)) return String(wert || '');
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(1).replace(/\.0$/, '');
}


/**
 * @param {object} leitung
 * @returns {string}
 */
function getLeitungGruppenschluessel(leitung) {
    const nr = normalizeArtikelnummer(leitung.artikelnummer || leitung.artikelCustom);
    if (nr) return nr;

    if (istMeterwareKategorie(leitung.kategorie)) {
        const whitelist = (leitung.artikelWhitelist || []).slice().sort().join('|');
        if (whitelist) return `mw:${whitelist}`;
        if (leitung.kategorie && leitung.hersteller) {
            return `mw:${leitung.kategorie}:${leitung.hersteller}`;
        }
    }

    return `__einzel__${leitung.id}`;
}


/**
 * @param {object} leitung
 * @returns {{istMeterware: boolean, stueck: number, meter: number|null}}
 */
function getLeitungMenge(leitung) {
    const stueck = getLeitungStueckzahl(leitung);
    const laenge = Number(leitung.laenge);
    const istMw = istMeterwareKategorie(leitung.kategorie);
    const meter = istMw && laenge > 0 ? stueck * laenge : null;
    return { istMeterware: istMw, stueck, meter };
}


/**
 * @param {object} entry
 * @returns {boolean}
 */
function sollQuellenInfoAnzeigen(entry) {
    if (!entry.quellen?.length) return false;
    if (entry.quellen.length > 1) return true;
    return Boolean(entry.meterware);
}


/**
 * @param {object} q
 * @param {object} entry
 * @returns {string}
 */
function formatQuelleZeile(q, entry) {
    const teile = [];
    if (q.position) teile.push(`Pos. ${q.position}`);
    if (q.gruppe && q.gruppe !== '-') teile.push(getGruppeDisplay(q.gruppe));

    if (entry.meterware && q.laenge > 0) {
        const meterText = `${formatLaenge(q.laenge)} m`;
        teile.push(q.stueck > 1 ? `${q.stueck}× ${meterText}` : meterText);
        if (q.meter != null && q.stueck > 1) teile.push(`= ${formatLaenge(q.meter)} m`);
    } else {
        teile.push(`${q.count}×`);
    }

    if (q.bezeichnung) teile.push(q.bezeichnung);
    return teile.join(' · ');
}


/**
 * @param {object} entry
 * @returns {string}
 */
function formatAnzahlAnzeige(entry) {
    if (entry.meterware) return `${formatLaenge(entry.count)} m`;
    return String(entry.count);
}


/**
 * @param {'leitungen'|'bauteile'} art
 * @param {string} key
 * @returns {{status: string, lieferdatum: string}}
 */
function getEintragStatus(art, key) {
    const store = getStatusStore();
    let raw = store[art]?.[key] || {};

    if (!raw.status && !raw.lieferdatum && key && !key.startsWith('__einzel__')) {
        const legacyKey = Object.keys(store[art] || {}).find(k =>
            k === key
            || k.includes(`|||${key}|||`)
            || k.endsWith(`|||${key}`)
            || k.startsWith(`${key}|||`)
        );
        if (legacyKey) raw = store[art][legacyKey] || {};
    }

    return {
        status: normalisiereStatus(raw),
        lieferdatum: raw.lieferdatum || ''
    };
}


/**
 * Alte Checkbox-Werte und früheres „bestellt“ auf den neuen Ablauf abbilden.
 * @param {object} raw
 * @returns {'offen'|'beosys'|'geliefert'|'kommissioniert'|'verbaut'}
 */
function normalisiereStatus(raw) {
    const erlaubt = new Set(['offen', 'beosys', 'geliefert', 'kommissioniert', 'verbaut']);
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
 * @returns {'offen'|'beosys'|'geliefert'|'kommissioniert'|'verbaut'}
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

    if (wert === 'verbaut') {
        return { id: 'verbaut', label: 'Verbaut', klasse: 'status-verbaut' };
    }
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
 * Sortierreihenfolge für Hersteller in der Stückliste (Beckhoff zuerst).
 * @param {string} hersteller
 * @returns {string}
 */
function herstellerSortKey(hersteller) {
    const name = String(hersteller || '').trim().toLowerCase();
    if (!name || name === '-') return '99';
    if (name === 'beckhoff') return '0';
    if (name.startsWith('lapp')) return '1';
    if (name.startsWith('murr')) return '2';
    if (name.startsWith('igus')) return '3';
    return `9-${name}`;
}


/**
 * @param {Array<object>} quellen
 * @returns {string}
 */
function gruppeAnzeigeAusQuellen(quellen) {
    const gruppen = new Set((quellen || []).map(q => q.gruppe).filter(g => g && g !== '-'));
    if (gruppen.size <= 1) return getGruppeDisplay(quellen?.[0]?.gruppe || '-');
    return 'mehrere';
}


/**
 * @param {object} entry
 * @returns {string}
 */
function renderQuellenPrint(entry) {
    if (!sollQuellenInfoAnzeigen(entry)) return '';

    const zeilen = entry.quellen.map(q => formatQuelleZeile(q, entry));
    return `<div class="stueckliste-print-quellen">${escapeHtml(zeilen.join(' | '))}</div>`;
}


/**
 * @param {object} entry
 * @returns {string}
 */
function renderQuellenInfo(entry) {
    if (!sollQuellenInfoAnzeigen(entry)) return '';

    const label = entry.meterware && entry.quellen.length === 1
        ? 'Details'
        : `${entry.quellen.length} Pos.`;

    return `
        ${renderQuellenPrint(entry)}
        <details class="stueckliste-quellen no-print">
            <summary class="stueckliste-quellen-trigger" title="Einzelpositionen anzeigen">
                ${label}
            </summary>
            <div class="stueckliste-quellen-panel">
                <ul class="stueckliste-quellen-liste">
                    ${entry.quellen.map(q => `
                        <li>
                            <span class="stueckliste-quellen-kopf">
                                ${q.position ? `<span class="stueckliste-quellen-pos">Pos. ${q.position}</span>` : ''}
                                <span class="stueckliste-quellen-gruppe">${escapeHtml(getGruppeDisplay(q.gruppe))}</span>
                                <span class="stueckliste-quellen-anzahl">${
                                    entry.meterware && q.laenge > 0
                                        ? escapeHtml(q.stueck > 1
                                            ? `${q.stueck}× ${formatLaenge(q.laenge)} m`
                                            : `${formatLaenge(q.laenge)} m`)
                                        : `${q.count}×`
                                }</span>
                            </span>
                            <span class="stueckliste-quellen-text">${escapeHtml(q.bezeichnung)}</span>
                            ${q.detail && !entry.meterware ? `<span class="stueckliste-quellen-detail">${escapeHtml(q.detail)}</span>` : ''}
                            ${q.typ ? `<span class="stueckliste-quellen-detail">${escapeHtml(q.typ)}</span>` : ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        </details>
    `;
}


/**
 * Aggregierte Leitungspositionen inkl. Status (zusammengefasst nach Artikelnummer).
 * @returns {Array<object>}
 */
function getLeitungEintraege() {
    const leitungen = appState.currentProjekt?.leitungen || [];
    const grouped = new Map();

    leitungen.filter(isLeitungMeaningful).forEach(l => {
        const artikelnummer = normalizeArtikelnummer(l.artikelnummer || l.artikelCustom);
        const key = getLeitungGruppenschluessel(l);
        const bezeichnung = (l.bezeichnung || '').trim() || '— ohne Bezeichnung —';
        const hersteller = (l.hersteller || '-').trim() || '-';
        const menge = getLeitungMenge(l);
        const typText = menge.istMeterware
            ? `${l.kategorie || 'sonstiges'} | ${hersteller} | Meterware`
            : getLeitungstypText(l);
        const quelle = {
            position: l.position,
            gruppe: l.gruppe || '-',
            bezeichnung,
            count: menge.meter != null ? menge.meter : menge.stueck,
            stueck: menge.stueck,
            laenge: Number(l.laenge) || 0,
            meter: menge.meter,
            detail: getLeitungstypText(l)
        };
        const existing = grouped.get(key);

        if (existing) {
            if (menge.meter != null) {
                existing.count += menge.meter;
                existing.meterware = true;
            } else {
                existing.count += menge.stueck;
            }
            existing.quellen.push(quelle);
        } else {
            grouped.set(key, {
                key,
                art: 'leitungen',
                bezeichnung,
                artikelnummer: artikelnummer || '-',
                hersteller,
                typText,
                meterware: menge.meter != null,
                count: menge.meter != null ? menge.meter : menge.stueck,
                quellen: [quelle],
                status: getEintragStatus('leitungen', key)
            });
        }
    });

    return Array.from(grouped.values())
        .sort((a, b) => herstellerSortKey(a.hersteller).localeCompare(herstellerSortKey(b.hersteller), 'de')
            || a.artikelnummer.localeCompare(b.artikelnummer, 'de')
            || a.bezeichnung.localeCompare(b.bezeichnung, 'de'));
}


/**
 * Aggregierte Bauteilpositionen inkl. Status (zusammengefasst nach Artikelnummer).
 * @returns {Array<object>}
 */
function getBauteilEintraege() {
    const bauteile = appState.currentProjekt?.bauteile || [];
    const grouped = new Map();

    bauteile.forEach(b => {
        const artikelnummer = normalizeArtikelnummer(b.artikelnummer);
        const key = artikelnummer || `__einzel__${b.id}`;
        const bezeichnung = (b.bezeichnung || '').trim() || getBauteilTypName(b.typ) || '—';
        const stueck = b.anzahl || 1;
        const quelle = {
            gruppe: b.gruppe || '-',
            bezeichnung,
            count: stueck,
            typ: getBauteilTypName(b.typ)
        };
        const existing = grouped.get(key);

        if (existing) {
            existing.count += stueck;
            existing.quellen.push(quelle);
        } else {
            grouped.set(key, {
                key,
                art: 'bauteile',
                gruppe: b.gruppe || '-',
                bezeichnung,
                typ: b.typ,
                hersteller: b.hersteller || '-',
                artikelnummer: artikelnummer || '-',
                count: stueck,
                quellen: [quelle],
                status: getEintragStatus('bauteile', key)
            });
        }
    });

    return Array.from(grouped.values()).map(entry => ({
        ...entry,
        gruppe: gruppeAnzeigeAusQuellen(entry.quellen)
    })).sort((a, b) => herstellerSortKey(a.hersteller).localeCompare(herstellerSortKey(b.hersteller), 'de')
        || a.artikelnummer.localeCompare(b.artikelnummer, 'de')
        || a.bezeichnung.localeCompare(b.bezeichnung, 'de'));
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
        if (s.status === 'geliefert' || s.status === 'kommissioniert' || s.status === 'verbaut') return;
        if (s.lieferdatum > heute) return;

        const label = `${entry.bezeichnung} (${entry.artikelnummer})`;

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
        ? `<span class="stueckliste-liefer-hinweis no-print ${info.klasse}">${escapeHtml(info.label)}</span>`
        : '';

    const lieferdatumDruck = formatDatumDe(s.lieferdatum) || '–';

    return `
        <td class="stueckliste-status">
            <span class="stueckliste-print-only">${escapeHtml(info.label)}</span>
            <select class="stueckliste-status-select no-print ${info.klasse}"${disabled}
                    aria-label="Status"
                    onchange="stuecklisteUpdateStatus('${art}', decodeURIComponent('${key}'), 'status', this.value)">
                <option value="offen"${wert === 'offen' ? ' selected' : ''}>Offen</option>
                <option value="beosys"${wert === 'beosys' ? ' selected' : ''}>In Beosys</option>
                <option value="geliefert"${wert === 'geliefert' ? ' selected' : ''}>Geliefert</option>
                <option value="kommissioniert"${wert === 'kommissioniert' ? ' selected' : ''}>Kommissioniert</option>
                <option value="verbaut"${wert === 'verbaut' ? ' selected' : ''}>Verbaut</option>
            </select>
            ${hinweis}
        </td>
        <td class="stueckliste-lieferdatum">
            <span class="stueckliste-print-only">${escapeHtml(lieferdatumDruck)}</span>
            <input class="no-print" type="date" value="${escapeHtml(s.lieferdatum)}"${disabled}
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

    const projekt = appState.currentProjekt;
    document.getElementById('stueckliste-titel').textContent =
        `Stückliste - ${projekt.projektnummer} - ${projekt.name}`;

    const druckMeta = document.getElementById('stueckliste-druck-meta');
    if (druckMeta) {
        const metaTeile = [
            `Projekt: ${projekt.projektnummer || '–'} – ${projekt.name || '–'}`,
            projekt.kunde ? `Kunde: ${projekt.kunde}` : '',
            projekt.liefertermin ? `Liefertermin: ${formatDatumDe(projekt.liefertermin)}` : '',
            `Druck: ${new Date().toLocaleDateString('de-DE')}`
        ].filter(Boolean);
        druckMeta.textContent = metaTeile.join(' · ');
    }

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
                <td>${escapeHtml(entry.bezeichnung)}</td>
                <td>${escapeHtml(entry.typText)}</td>
                <td>${escapeHtml(entry.hersteller)}</td>
                <td>${escapeHtml(entry.artikelnummer)}</td>
                <td class="stueckliste-anzahl">
                    <span class="stueckliste-anzahl-wert">${escapeHtml(formatAnzahlAnzeige(entry))}</span>
                    ${renderQuellenInfo(entry)}
                </td>
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
            <td>${escapeHtml(entry.gruppe === 'mehrere' ? 'mehrere' : getGruppeDisplay(entry.gruppe))}</td>
            <td>${escapeHtml(entry.bezeichnung)}</td>
            <td>${escapeHtml(getBauteilTypName(entry.typ))}</td>
            <td>${escapeHtml(entry.hersteller)}</td>
            <td>${escapeHtml(entry.artikelnummer)}</td>
            <td class="stueckliste-anzahl">
                <span class="stueckliste-anzahl-wert">${entry.count}</span>
                ${renderQuellenInfo(entry)}
            </td>
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


/**
 * Öffnet den Druckdialog für die aggregierte Stückliste.
 * @returns {void}
 */
export function printStueckliste() {
    if (!appState.currentProjekt) return;

    const hatLeitungen = (appState.currentProjekt.leitungen || []).some(isLeitungMeaningful);
    const hatBauteile = (appState.currentProjekt.bauteile || []).length > 0;
    if (!hatLeitungen && !hatBauteile) {
        showModal('Keine Positionen zum Drucken vorhanden.', { type: 'warning', title: 'Hinweis' });
        return;
    }

    renderStueckliste();
    window.print();
}
