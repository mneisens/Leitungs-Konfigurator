/**
 * @file catalog.js – Laden und Erweitern des Leitungskatalogs.
 */
import { appState } from './state.js';

/** Basis-Artikel aus data/leitungen.json (ohne Nachträge). */
let baseArtikel = [];


/**
 * Lädt Katalogdaten aus den lokalen JSON-Dateien.
 * @returns {Promise<void>}
 */
export async function loadKatalog() {
    try {
        const [katalogResponse, gruppenResponse, bauteileResponse] = await Promise.all([
            fetch('data/leitungen.json'),
            fetch('data/gruppen.json'),
            fetch('data/bauteile.json')
        ]);

        appState.katalog = await katalogResponse.json();
        baseArtikel = Array.isArray(appState.katalog.artikel)
            ? appState.katalog.artikel.map(a => ({ ...a }))
            : [];
        appState.katalog.artikel = baseArtikel.map(a => ({ ...a }));

        const gruppenData = await gruppenResponse.json();
        appState.leitungGruppen = Array.isArray(gruppenData.gruppen) ? gruppenData.gruppen : [];
        appState.bauteileKatalog = await bauteileResponse.json();
    } catch (error) {
        console.error('Fehler beim Laden des Katalogs:', error);
        appState.katalog = {
            hersteller: [],
            kategorien: [],
            artikel: [],
            steckertypen: [],
            standardlaengen: []
        };
        baseArtikel = [];
        appState.leitungGruppen = [];
        appState.bauteileKatalog = { bauteiltypen: [], artikel: [] };
    }
}


/**
 * Mischt Basis-Katalog mit nachgetragenen Artikeln.
 * @param {object[]} additions
 * @returns {void}
 */
export function mergeKatalogAdditions(additions) {
    if (!appState.katalog) return;

    const byNr = new Map();
    baseArtikel.forEach(a => {
        const key = (a.artikelnummer || '').toLowerCase();
        if (key) byNr.set(key, { ...a, custom: false });
    });

    (additions || []).forEach(a => {
        const key = (a.artikelnummer || '').toLowerCase();
        if (!key) return;
        byNr.set(key, { ...a, custom: true });
    });

    appState.katalog.artikel = Array.from(byNr.values());
}


/**
 * Ergänzt Hersteller-/Steckertypen-Listen um Werte aus einem Artikel.
 * @param {object} article
 * @returns {void}
 */
export function ensureKatalogLists(article) {
    if (!appState.katalog || !article) return;

    if (article.hersteller && !appState.katalog.hersteller.includes(article.hersteller)) {
        appState.katalog.hersteller = [...appState.katalog.hersteller, article.hersteller]
            .sort((a, b) => a.localeCompare(b, 'de'));
    }

    for (const stecker of [article.steckerA, article.steckerB]) {
        if (stecker && !(appState.katalog.steckertypen || []).includes(stecker)) {
            appState.katalog.steckertypen = [...(appState.katalog.steckertypen || []), stecker]
                .sort((a, b) => a.localeCompare(b, 'de'));
        }
    }
}


/**
 * getArtikelByNummer.
 * @param {string} artikelnummer
 * @returns {object|null}
 */
export function getArtikelByNummer(artikelnummer) {
    if (!appState.katalog || !Array.isArray(appState.katalog.artikel) || !artikelnummer) return null;
    const gesucht = artikelnummer.trim().toLowerCase();
    return appState.katalog.artikel.find(a => (a.artikelnummer || '').toLowerCase() === gesucht) || null;
}


/**
 * getBauteilByNummer.
 * @param {string} artikelnummer
 * @returns {object|null}
 */
export function getBauteilByNummer(artikelnummer) {
    if (!appState.bauteileKatalog || !Array.isArray(appState.bauteileKatalog.artikel) || !artikelnummer) return null;
    const gesucht = artikelnummer.trim().toLowerCase();
    return appState.bauteileKatalog.artikel.find(a => (a.artikelnummer || '').toLowerCase() === gesucht) || null;
}


/**
 * getBauteilTypName.
 * @param {string} typId
 * @returns {string}
 */
export function getBauteilTypName(typId) {
    const t = (appState.bauteileKatalog?.bauteiltypen || []).find(x => x.id === typId);
    return t ? t.name : typId;
}


/**
 * getBauteileByTyp.
 * @param {string} typ
 * @returns {object[]}
 */
export function getBauteileByTyp(typ) {
    return (appState.bauteileKatalog?.artikel || []).filter(a => a.typ === typ);
}
