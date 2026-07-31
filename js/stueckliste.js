/**
 * @file stueckliste.js
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import { showView } from './navigation.js';
import { getBauteilTypName } from './catalog.js';
import { getGruppeDisplay } from './overview.js';
import { isLeitungMeaningful, getLeitungStueckzahl } from './konfigurator-stecker.js';

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

    const tbody = document.getElementById('stueckliste-body');
    const emptyState = document.getElementById('keine-stueckliste');
    const tableContainer = document.getElementById('stueckliste-leitungen-table');
    const leitungen = appState.currentProjekt.leitungen || [];

    if (leitungen.length === 0) {
        tbody.innerHTML = '';
        if (tableContainer) tableContainer.style.display = 'none';
        emptyState.style.display = 'block';
    } else {
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
                    artikelnummer,
                    hersteller,
                    typText,
                    count: getLeitungStueckzahl(l)
                });
            }
        });

        const rows = Array.from(grouped.values())
            .sort((a, b) => b.count - a.count || a.typText.localeCompare(b.typText, 'de'))
            .map(entry => `
                <tr>
                    <td>${escapeHtml(entry.typText)}</td>
                    <td>${escapeHtml(entry.hersteller)}</td>
                    <td>${escapeHtml(entry.artikelnummer)}</td>
                    <td>${entry.count}</td>
                </tr>
            `).join('');

        tbody.innerHTML = rows;
        if (tableContainer) tableContainer.style.display = 'block';
        emptyState.style.display = 'none';
    }

    const bauteileBody = document.getElementById('stueckliste-bauteile-body');
    const bauteileEmpty = document.getElementById('keine-stueckliste-bauteile');
    const bauteileTable = document.getElementById('stueckliste-bauteile-table');
    const bauteile = appState.currentProjekt.bauteile || [];

    if (!bauteileBody || !bauteileEmpty) return;

    if (bauteile.length === 0) {
        bauteileBody.innerHTML = '';
        if (bauteileTable) bauteileTable.style.display = 'none';
        bauteileEmpty.style.display = 'block';
        return;
    }

    const bGrouped = new Map();
    bauteile.forEach(b => {
        const key = `${b.gruppe || ''}|||${b.typ || ''}|||${b.artikelnummer || ''}`;
        if (!bGrouped.has(key)) {
            bGrouped.set(key, {
                gruppe: b.gruppe || '-',
                typ: b.typ,
                hersteller: b.hersteller || '-',
                artikelnummer: b.artikelnummer || '-',
                count: 0
            });
        }
        bGrouped.get(key).count += b.anzahl || 1;
    });

    bauteileBody.innerHTML = Array.from(bGrouped.values())
        .sort((a, b) => a.gruppe.localeCompare(b.gruppe, 'de') || a.artikelnummer.localeCompare(b.artikelnummer, 'de'))
        .map(entry => `
            <tr>
                <td>${escapeHtml(getGruppeDisplay(entry.gruppe))}</td>
                <td>${escapeHtml(getBauteilTypName(entry.typ))}</td>
                <td>${escapeHtml(entry.hersteller)}</td>
                <td>${escapeHtml(entry.artikelnummer)}</td>
                <td>${entry.count}</td>
            </tr>
        `).join('');

    if (bauteileTable) bauteileTable.style.display = 'block';
    bauteileEmpty.style.display = 'none';
}


/**
 * getLeitungstypText.
 * @returns {void}
 */
export function getLeitungstypText(leitung) {
    const kategorie = leitung.kategorie || 'sonstiges';
    const steckerA = leitung.steckerA || '-';
    const steckerB = leitung.steckerB || '-';
    const laenge = leitung.laenge ? `${leitung.laenge} m` : '-';
    return `${kategorie} | ${steckerA} -> ${steckerB} | ${laenge}`;
}
