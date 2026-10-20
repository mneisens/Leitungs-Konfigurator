/**
 * @file Beckhoff-Preisliste: mitgelieferte Datei und eingelesene Jahresliste.
 */

/** Mitgelieferte Liste. Eine eingelesene Datei ersetzt sie, bis sie zurückgesetzt wird. */
const STANDARD_DATEI = 'data/beckhoff_preisliste_05_2026_EP1957_erganzt.json';
const DB_NAME = 'leitungskonfigurator';
const DB_STORE = 'preisliste';
const DB_KEY = 'aktiv';

/** @type {Map<string, object>} */
let preiseNachNummer = new Map();

/** @type {{titel: string, anzahl: number, dateiname: string, importiert: boolean, importiertAm: string}} */
let preislisteInfo = {
    titel: 'Beckhoff-Preisliste',
    anzahl: 0,
    dateiname: '',
    importiert: false,
    importiertAm: ''
};


/**
 * @param {string} artikelnummer
 * @returns {string}
 */
function preisSchluessel(artikelnummer) {
    return String(artikelnummer || '').trim().toLowerCase().replace(/\s+/g, '');
}


/**
 * @param {number} wert
 * @returns {string}
 */
export function formatEuro(wert) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(wert);
}


/**
 * Bestätigte Preise verdrängen unsichere Doppeleinträge derselben Artikelnummer.
 * @param {object} eintrag
 * @returns {number}
 */
function preisGuete(eintrag) {
    let guete = 0;
    if (eintrag?.preis_eur != null && !Number.isNaN(Number(eintrag.preis_eur))) guete += 2;
    if (eintrag?.pruefen === false) guete += 4;
    if (eintrag?.herkunft && eintrag.herkunft !== 'alte_extraktion_nicht_bestaetigt') guete += 3;
    return guete;
}


/**
 * @param {object} data
 * @param {{dateiname?: string, importiert?: boolean, importiertAm?: string}} [herkunft]
 * @returns {void}
 */
function uebernehmePreisliste(data, herkunft = {}) {
    const map = new Map();
    (data?.artikel || []).forEach(eintrag => {
        const key = preisSchluessel(eintrag?.artikelnummer);
        if (!key) return;
        const vorhanden = map.get(key);
        if (!vorhanden || preisGuete(eintrag) >= preisGuete(vorhanden)) {
            map.set(key, eintrag);
        }
    });
    preiseNachNummer = map;
    const meta = data?.metadaten || {};
    preislisteInfo = {
        titel: meta.quelle || meta.titel || 'Beckhoff-Preisliste',
        anzahl: map.size,
        dateiname: herkunft.dateiname || STANDARD_DATEI.split('/').pop(),
        importiert: Boolean(herkunft.importiert),
        importiertAm: herkunft.importiertAm || ''
    };
}


/**
 * @returns {IDBDatabase}
 */
function oeffnePreisDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(DB_STORE)) {
                request.result.createObjectStore(DB_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}


/**
 * @returns {Promise<object|null>}
 */
async function liesGespeichertePreisliste() {
    try {
        const db = await oeffnePreisDb();
        return await new Promise((resolve, reject) => {
            const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(DB_KEY);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Gespeicherte Preisliste konnte nicht gelesen werden:', error);
        return null;
    }
}


/**
 * @param {object|null} datensatz
 * @returns {Promise<void>}
 */
async function schreibeGespeichertePreisliste(datensatz) {
    const db = await oeffnePreisDb();
    await new Promise((resolve, reject) => {
        const store = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE);
        const request = datensatz ? store.put(datensatz, DB_KEY) : store.delete(DB_KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}


/**
 * Lädt die eingelesene Liste oder, wenn keine vorliegt, die mitgelieferte Datei.
 * @returns {Promise<void>}
 */
export async function loadPreisliste() {
    const gespeichert = await liesGespeichertePreisliste();
    if (gespeichert?.daten?.artikel) {
        uebernehmePreisliste(gespeichert.daten, {
            dateiname: gespeichert.dateiname,
            importiert: true,
            importiertAm: gespeichert.importiertAm
        });
        return;
    }

    try {
        const response = await fetch(STANDARD_DATEI, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Preisliste HTTP ${response.status}`);
        uebernehmePreisliste(await response.json(), {
            dateiname: STANDARD_DATEI.split('/').pop(),
            importiert: false
        });
    } catch (error) {
        console.error('Beckhoff-Preisliste konnte nicht geladen werden:', error);
        preiseNachNummer = new Map();
        preislisteInfo = {
            titel: 'Beckhoff-Preisliste',
            anzahl: 0,
            dateiname: '',
            importiert: false,
            importiertAm: ''
        };
    }
}


/**
 * @param {object} data
 * @returns {void}
 */
function pruefePreisliste(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.artikel)) {
        throw new Error('Die Datei enthält keine Artikelliste. Erwartet wird eine JSON-Datei mit dem Feld „artikel“.');
    }
    const gueltig = data.artikel.some(eintrag => eintrag && String(eintrag.artikelnummer || '').trim());
    if (!gueltig) {
        throw new Error('In der Datei steht keine Artikelnummer.');
    }
}


/**
 * Liest eine JSON-Preisliste ein und verwendet sie ab sofort statt der mitgelieferten Datei.
 * @param {File} datei
 * @returns {Promise<{titel: string, anzahl: number, dateiname: string}>}
 */
export async function importPreislisteAusDatei(datei) {
    const text = await datei.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('Die Datei ist kein gültiges JSON.');
    }
    pruefePreisliste(data);
    const importiertAm = new Date().toISOString();
    await schreibeGespeichertePreisliste({
        daten: data,
        dateiname: datei.name || 'preisliste.json',
        importiertAm
    });
    uebernehmePreisliste(data, {
        dateiname: datei.name || 'preisliste.json',
        importiert: true,
        importiertAm
    });
    return getPreislisteInfo();
}


/**
 * Verwirft die eingelesene Liste und lädt wieder die mitgelieferte Datei.
 * @returns {Promise<{titel: string, anzahl: number, dateiname: string}>}
 */
export async function setzeStandardPreisliste() {
    await schreibeGespeichertePreisliste(null);
    await loadPreisliste();
    return getPreislisteInfo();
}


/**
 * @returns {{titel: string, anzahl: number, dateiname: string, importiert: boolean, importiertAm: string}}
 */
export function getPreislisteInfo() {
    return { ...preislisteInfo };
}


/**
 * @param {string} artikelnummer
 * @returns {object|null}
 */
export function getPreisEintrag(artikelnummer) {
    const key = preisSchluessel(artikelnummer);
    if (!key) return null;
    return preiseNachNummer.get(key) || null;
}


/**
 * Anzeige eines Listenpreises.
 * @param {string} artikelnummer
 * @returns {{text: string, betrag: number|null, titel: string}|null}
 */
export function preisAnzeige(artikelnummer) {
    const eintrag = getPreisEintrag(artikelnummer);
    if (!eintrag) return null;
    if (eintrag.preis_eur == null || Number.isNaN(Number(eintrag.preis_eur))) {
        return { text: 'Preis prüfen', betrag: null, titel: 'In der Preisliste ohne Festpreis' };
    }
    const betrag = Number(eintrag.preis_eur);
    const teile = [formatEuro(betrag)];
    if (eintrag.laenge_m) teile.push(`${eintrag.laenge_m} m`);
    return {
        text: teile.join(' · '),
        betrag,
        titel: preislisteInfo.titel || 'Beckhoff-Preisliste'
    };
}


/**
 * Preisspanne mehrerer Artikelnummern, z. B. eine Leitungslänge-Reihe.
 * @param {string[]} nummern
 * @returns {string}
 */
export function preisSpanne(nummern) {
    const betraege = (nummern || [])
        .map(nr => preisAnzeige(nr)?.betrag)
        .filter(betrag => betrag != null);
    if (!betraege.length) return '';
    const min = Math.min(...betraege);
    const max = Math.max(...betraege);
    if (min === max) return formatEuro(min);
    return `${formatEuro(min)}–${formatEuro(max)}`;
}


/**
 * Schreibt den aktuellen Listenpreis an eine Position.
 * @param {object} ziel
 * @param {string} artikelnummer
 * @returns {void}
 */
export function hinterlegePreis(ziel, artikelnummer) {
    if (!ziel) return;
    const anzeige = preisAnzeige(artikelnummer);
    if (anzeige?.betrag == null) {
        delete ziel.preisEur;
        delete ziel.preisQuelle;
        return;
    }
    ziel.preisEur = anzeige.betrag;
    ziel.preisQuelle = preislisteInfo.titel || 'Beckhoff-Preisliste';
}
