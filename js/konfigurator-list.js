/**
 * @file konfigurator-list.js
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import { compareGruppenCode, getGruppeDisplay } from './overview.js';

export function renderKonfigGruppenliste() {
    const container = document.getElementById('konfig-gruppenliste');
    if (!container || !appState.currentProjekt) return;

    const leitungen = appState.currentProjekt.leitungen || [];
    if (leitungen.length === 0) {
        container.innerHTML = '<p class="konfig-list-empty">Noch keine Leitungen vorhanden.</p>';
        return;
    }

    const gruppenMap = new Map();

    leitungen.forEach(leitung => {
        const gruppe = leitung.gruppe || '';
        const artikelnummer = (leitung.artikelnummer || leitung.artikelCustom || '').trim();
        if (!artikelnummer) return;

        if (!gruppenMap.has(gruppe)) {
            gruppenMap.set(gruppe, new Map());
        }

        const artikelMap = gruppenMap.get(gruppe);
        artikelMap.set(artikelnummer, (artikelMap.get(artikelnummer) || 0) + 1);
    });

    if (gruppenMap.size === 0) {
        container.innerHTML = '<p class="konfig-list-empty">Noch keine Artikelnummern vorhanden.</p>';
        return;
    }

    const gruppenCodes = Array.from(gruppenMap.keys()).sort(compareGruppenCode);
    const html = gruppenCodes.map(code => {
        const artikelMap = gruppenMap.get(code);
        const artikelRows = Array.from(artikelMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0], 'de'))
            .map(([artikel, count]) => `
                <li>
                    <span class="artikel">${escapeHtml(artikel)}</span>
                    <span class="count">${count}</span>
                </li>
            `).join('');

        return `
            <div class="konfig-group-block">
                <h4>${escapeHtml(code ? getGruppeDisplay(code) : 'Ohne Gruppe')}</h4>
                <ul>
                    ${artikelRows}
                </ul>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}
