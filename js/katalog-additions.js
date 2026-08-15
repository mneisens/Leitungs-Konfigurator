/**
 * @file katalog-additions.js – Nachgetragene Katalogartikel laden und speichern.
 *
 * Nachträge liegen bei angemeldeten Nutzern in Firestore, sonst im localStorage.
 * Beide Wege werden hier gekapselt, damit Katalogansicht und Gruppen-Konfigurator
 * denselben Bestand pflegen.
 */
import { appState } from './state.js';
import { mergeKatalogAdditions, mergeBauteileAdditions, ensureBauteilTyp } from './catalog.js';
import {
    getKatalogAdditions,
    persistKatalogAdditions,
    getBauteileAdditions,
    persistBauteileAdditions
} from './firebase.js';

export const LOCAL_LEITUNGEN_KEY = 'leitungskonfigurator_katalog_additions';
export const LOCAL_BAUTEILE_KEY = 'leitungskonfigurator_bauteile_additions';


/**
 * @returns {boolean}
 */
function nutztFirestore() {
    return Boolean(appState.firebaseReady && appState.currentUser);
}


/**
 * @param {string} key
 * @returns {object[]}
 */
function readLocal(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}


/**
 * @returns {Promise<object[]>}
 */
export async function loadLeitungAdditions() {
    return nutztFirestore() ? getKatalogAdditions() : readLocal(LOCAL_LEITUNGEN_KEY);
}


/**
 * @param {object[]} additions
 * @returns {Promise<void>}
 */
export async function saveLeitungAdditions(additions) {
    if (nutztFirestore()) {
        await persistKatalogAdditions(additions);
    } else {
        localStorage.setItem(LOCAL_LEITUNGEN_KEY, JSON.stringify(additions));
    }
    mergeKatalogAdditions(additions);
}


/**
 * @returns {Promise<object[]>}
 */
export async function loadBauteilAdditions() {
    return nutztFirestore() ? getBauteileAdditions() : readLocal(LOCAL_BAUTEILE_KEY);
}


/**
 * @param {object[]} additions
 * @returns {Promise<void>}
 */
export async function saveBauteilAdditions(additions) {
    if (nutztFirestore()) {
        await persistBauteileAdditions(additions);
    } else {
        localStorage.setItem(LOCAL_BAUTEILE_KEY, JSON.stringify(additions));
    }
    mergeBauteileAdditions(additions);
}


/**
 * @param {string} artikelnummer
 * @returns {boolean}
 */
export function bauteilnummerVergeben(artikelnummer) {
    const gesucht = (artikelnummer || '').trim().toLowerCase();
    if (!gesucht) return false;
    return (appState.bauteileKatalog?.artikel || [])
        .some(a => (a.artikelnummer || '').toLowerCase() === gesucht);
}


/**
 * Trägt ein Bauteil dauerhaft in den Katalog ein.
 * @param {object} artikel
 * @returns {Promise<object>}
 */
export async function addBauteilZumKatalog(artikel) {
    const additions = await loadBauteilAdditions();
    additions.push(artikel);
    await saveBauteilAdditions(additions);
    ensureBauteilTyp(artikel);
    return artikel;
}


/**
 * Baut eine Platzhalter-Artikelnummer, solange die echte Nummer fehlt.
 * @param {string} typ
 * @param {string} beschreibung
 * @returns {string}
 */
export function bildePlatzhalterNummer(typ, beschreibung) {
    const kern = (beschreibung || typ || '')
        .replace(/ä/gi, 'ae').replace(/ö/gi, 'oe').replace(/ü/gi, 'ue').replace(/ß/g, 'ss')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40)
        // Ein abgeschnittenes Restwort am Ende lieber ganz weglassen.
        .replace(/-[A-Z0-9]*$/, m => (m.length > 8 ? '' : m))
        .replace(/-$/, '') || 'BAUTEIL';

    let nummer = `PLACEHOLDER-${kern}`;
    let zaehler = 2;
    while (bauteilnummerVergeben(nummer)) {
        nummer = `PLACEHOLDER-${kern}-${zaehler}`;
        zaehler += 1;
    }
    return nummer;
}
