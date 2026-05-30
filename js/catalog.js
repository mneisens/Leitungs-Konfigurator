/**
 * @file catalog.js
 */
import { appState } from './state.js';
import { generateId, escapeHtml, formatDate, formatDateForFile } from './utils.js';
import { showModal, closeModal } from './modal.js';

/**
 * loadKatalog.
 * @returns {void}
 */
export async function loadKatalog() {
    try {
        const [katalogResponse, gruppenResponse, bauteileResponse] = await Promise.all([
            fetch('data/leitungen.json'),
            fetch('data/gruppen.json'),
            fetch('data/bauteile.json')
        ]);

        appState.katalog = await katalogResponse.json();
        const gruppenData = await gruppenResponse.json();
        appState.leitungGruppen = Array.isArray(gruppenData.gruppen) ? gruppenData.gruppen : [];
        appState.bauteileKatalog = await bauteileResponse.json();
        console.log('Katalog geladen:', appState.katalog);
        console.log('Leitungsgruppen geladen:', appState.leitungGruppen.length);
        console.log('Bauteile geladen:', appState.bauteileKatalog?.artikel?.length || 0);
    } catch (error) {
        console.error('Fehler beim Laden des Katalogs:', error);
        appState.katalog = {
            hersteller: [],
            artikel: [],
            steckertypen: [],
            standardlaengen: []
        };
        appState.leitungGruppen = [];
        appState.bauteileKatalog = { bauteiltypen: [], artikel: [] };
    }
}


/**
 * getArtikelByNummer.
 * @returns {void}
 */
export function getArtikelByNummer(artikelnummer) {
    if (!appState.katalog || !Array.isArray(appState.katalog.artikel) || !artikelnummer) return null;
    const gesucht = artikelnummer.trim().toLowerCase();
    return appState.katalog.artikel.find(a => (a.artikelnummer || '').toLowerCase() === gesucht) || null;
}


/**
 * getBauteilByNummer.
 * @returns {void}
 */
export function getBauteilByNummer(artikelnummer) {
    if (!appState.bauteileKatalog || !Array.isArray(appState.bauteileKatalog.artikel) || !artikelnummer) return null;
    const gesucht = artikelnummer.trim().toLowerCase();
    return appState.bauteileKatalog.artikel.find(a => (a.artikelnummer || '').toLowerCase() === gesucht) || null;
}


/**
 * getBauteilTypName.
 * @returns {void}
 */
export function getBauteilTypName(typId) {
    const t = (appState.bauteileKatalog?.bauteiltypen || []).find(x => x.id === typId);
    return t ? t.name : typId;
}


/**
 * getBauteileByTyp.
 * @returns {void}
 */
export function getBauteileByTyp(typ) {
    return (appState.bauteileKatalog?.artikel || []).filter(a => a.typ === typ);
}
