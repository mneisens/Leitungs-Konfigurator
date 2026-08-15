/**
 * @file leitung-optionen.js – Auswahl- und Artikel-Logik für Leitungen ohne DOM-Zugriff.
 *
 * Die Funktionen bekommen alle Filterwerte als Parameter und eignen sich damit für
 * mehrere gleichzeitig sichtbare Leitungsformulare (Gruppen-Konfigurator).
 */
import { appState } from './state.js';
import { getBaseSteckerTyp, getFullSteckerTyp } from './stecker-utils.js';

/** Kategorien, die als Meterware ab Rolle konfiguriert werden. */
export const METERWARE_KATEGORIEN = ['oelflex', 'motor', 'geber'];

/** Bei EtherCAT sind nur diese Steckerbauformen sinnvoll. */
const ETHERCAT_STECKER = ['M8 4-polig', 'M12 4-polig', 'RJ45', 'offen'];


/**
 * @param {string} kategorie
 * @returns {boolean}
 */
export function istMeterwareKategorie(kategorie) {
    return METERWARE_KATEGORIEN.includes(kategorie);
}


/**
 * @returns {object[]}
 */
export function getKategorien() {
    return appState.katalog?.kategorien || [];
}


/**
 * @param {string} kategorieId
 * @returns {object|null}
 */
export function getKategorie(kategorieId) {
    return getKategorien().find(k => k.id === kategorieId) || null;
}


/**
 * @param {string} kategorieId
 * @returns {string}
 */
export function getKategorieName(kategorieId) {
    return getKategorie(kategorieId)?.name || kategorieId || '';
}


/**
 * @param {string} kategorie
 * @returns {object[]}
 */
export function getArtikelFuerKategorie(kategorie) {
    const artikel = appState.katalog?.artikel || [];
    if (!kategorie) return artikel;
    return artikel.filter(a => a.kategorie === kategorie);
}


/**
 * @param {string} steckerBase
 * @param {string} kategorie
 * @returns {boolean}
 */
function istSteckerErlaubt(steckerBase, kategorie) {
    if (kategorie !== 'ethercat') return true;
    return ETHERCAT_STECKER.some(erlaubt => steckerBase.includes(erlaubt));
}


/**
 * Hersteller, die für die Kategorie Artikel im Katalog haben.
 * @param {string} kategorie
 * @returns {string[]}
 */
export function getHerstellerFuerKategorie(kategorie) {
    const hersteller = new Set();
    getArtikelFuerKategorie(kategorie).forEach(a => {
        if (a.hersteller) hersteller.add(a.hersteller);
    });
    if (!hersteller.size) {
        (appState.katalog?.hersteller || []).forEach(h => hersteller.add(h));
    }
    return Array.from(hersteller).sort((a, b) => a.localeCompare(b, 'de'));
}


/**
 * @param {string} kategorie
 * @param {string} hersteller
 * @returns {object[]}
 */
function getArtikelPool(kategorie, hersteller) {
    return getArtikelFuerKategorie(kategorie)
        .filter(a => !hersteller || a.hersteller === hersteller);
}


/**
 * Alle Stecker-Basistypen, die bei dieser Kategorie/Hersteller-Kombination vorkommen.
 * @param {string} kategorie
 * @param {string} hersteller
 * @returns {string[]}
 */
export function getSteckerAOptionen(kategorie, hersteller) {
    const basistypen = new Set();

    getArtikelPool(kategorie, hersteller).forEach(a => {
        [a.steckerA, a.steckerB].forEach(stecker => {
            const base = getBaseSteckerTyp(stecker);
            if (base && istSteckerErlaubt(base, kategorie)) basistypen.add(base);
        });
    });

    if (!basistypen.size) {
        (appState.katalog?.steckertypen || []).forEach(typ => {
            const base = getBaseSteckerTyp(typ);
            if (base && istSteckerErlaubt(base, kategorie)) basistypen.add(base);
        });
    }

    return sortiereStecker(basistypen);
}


/**
 * Gegenstecker zu einem bereits gewählten Stecker A.
 * @param {string} kategorie
 * @param {string} hersteller
 * @param {string} steckerAFull
 * @returns {string[]}
 */
export function getSteckerBOptionen(kategorie, hersteller, steckerAFull) {
    if (!steckerAFull) return getSteckerAOptionen(kategorie, hersteller);

    const basistypen = new Set();

    getArtikelPool(kategorie, hersteller).forEach(a => {
        let gegenstueck = null;
        if (a.steckerA === steckerAFull) gegenstueck = a.steckerB;
        else if (a.steckerB === steckerAFull) gegenstueck = a.steckerA;
        if (!gegenstueck) return;

        const base = getBaseSteckerTyp(gegenstueck);
        if (base && istSteckerErlaubt(base, kategorie)) basistypen.add(base);
    });

    return sortiereStecker(basistypen);
}


/**
 * @param {Set<string>} basistypen
 * @returns {string[]}
 */
function sortiereStecker(basistypen) {
    return Array.from(basistypen).sort((a, b) => {
        if (a === 'offen') return 1;
        if (b === 'offen') return -1;
        return a.localeCompare(b, 'de');
    });
}


/**
 * Artikel, deren Steckerpaar zur Auswahl passt (Seiten sind vertauschbar).
 * @param {string} kategorie
 * @param {string} hersteller
 * @param {string} steckerAFull
 * @param {string} steckerBFull
 * @returns {object[]}
 */
export function getPassendeArtikel(kategorie, hersteller, steckerAFull, steckerBFull) {
    return getArtikelPool(kategorie, hersteller).filter(a => {
        const direkt = (!steckerAFull || a.steckerA === steckerAFull)
            && (!steckerBFull || a.steckerB === steckerBFull);
        const vertauscht = (!steckerAFull || a.steckerB === steckerAFull)
            && (!steckerBFull || a.steckerA === steckerBFull);
        return direkt || vertauscht;
    });
}


/**
 * @param {string} kategorie
 * @param {string} hersteller
 * @param {string} steckerAFull
 * @param {string} steckerBFull
 * @returns {number[]}
 */
export function getLaengenOptionen(kategorie, hersteller, steckerAFull, steckerBFull) {
    const laengen = new Set();
    getPassendeArtikel(kategorie, hersteller, steckerAFull, steckerBFull).forEach(a => {
        if (typeof a.laenge === 'number' && a.laenge > 0) laengen.add(a.laenge);
    });
    return Array.from(laengen).sort((a, b) => a - b);
}


/**
 * Sucht den Katalogartikel zur aktuellen Auswahl.
 * @param {object} auswahl
 * @param {string} auswahl.kategorie
 * @param {string} auswahl.hersteller
 * @param {string} auswahl.steckerA - Vollständiger Steckertyp inkl. Ausrichtung.
 * @param {string} auswahl.steckerB - Vollständiger Steckertyp inkl. Ausrichtung.
 * @param {number} auswahl.laenge
 * @param {string} [auswahl.bevorzugt] - Artikelnummer, die bei mehreren Treffern gewinnt.
 * @returns {{artikel: object, exakt: boolean, verfuegbareLaengen: number[]}|null}
 */
export function findArtikel({ kategorie, hersteller, steckerA, steckerB, laenge, bevorzugt }) {
    const kandidaten = getPassendeArtikel(kategorie, hersteller, steckerA, steckerB);
    if (!kandidaten.length) return null;

    const laengeNum = parseFloat(laenge);
    const konfektioniert = kandidaten.filter(a => a.laenge > 0);

    // Meterware wird auf Länge geschnitten, ein Längenvergleich entfällt.
    if (!konfektioniert.length) {
        const meterware = kandidaten.find(a => a.artikelnummer === bevorzugt) || kandidaten[0];
        return { artikel: meterware, exakt: true, verfuegbareLaengen: [] };
    }

    const verfuegbareLaengen = Array.from(new Set(konfektioniert.map(a => a.laenge))).sort((a, b) => a - b);

    if (!Number.isNaN(laengeNum) && laengeNum > 0) {
        const exakt = konfektioniert.find(a => a.laenge === laengeNum);
        if (exakt) return { artikel: exakt, exakt: true, verfuegbareLaengen };

        const sortiert = [...konfektioniert].sort((a, b) => a.laenge - b.laenge);
        const naechstGroesser = sortiert.find(a => a.laenge >= laengeNum);
        return {
            artikel: naechstGroesser || sortiert[sortiert.length - 1],
            exakt: false,
            verfuegbareLaengen
        };
    }

    return { artikel: null, exakt: false, verfuegbareLaengen };
}


/**
 * Auswählbare Meterware-Typen einer Kategorie (z. B. Ölflex- oder Motorleitungen).
 * @param {string} kategorie
 * @returns {object[]}
 */
export function getMeterwareArtikel(kategorie) {
    const alle = getArtikelFuerKategorie(kategorie);
    const meterware = alle.filter(a => a.meterware);
    return (meterware.length ? meterware : alle)
        .slice()
        .sort((a, b) => (a.beschreibung || '').localeCompare(b.beschreibung || '', 'de'));
}


/**
 * Kurztext für die Anzeige eines Artikels.
 * @param {object} artikel
 * @returns {string}
 */
export function getArtikelLabel(artikel) {
    if (!artikel) return '';
    const teile = [artikel.beschreibung, artikel.artikelnummer].filter(Boolean);
    return teile.join(' · ');
}


export { getBaseSteckerTyp, getFullSteckerTyp };
