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
 * @param {string} [artikelPrefix] - Nur Artikel dieser Nummern-Reihe (z. B. ZK2000-2122).
 * @returns {object[]}
 */
export function getPassendeArtikel(kategorie, hersteller, steckerAFull, steckerBFull, artikelPrefix) {
    return getArtikelPool(kategorie, hersteller).filter(a => {
        if (artikelPrefix && !(a.artikelnummer || '').startsWith(artikelPrefix)) return false;
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
 * @param {string} [artikelPrefix]
 * @returns {number[]}
 */
export function getLaengenOptionen(kategorie, hersteller, steckerAFull, steckerBFull, artikelPrefix) {
    const laengen = new Set();
    getPassendeArtikel(kategorie, hersteller, steckerAFull, steckerBFull, artikelPrefix).forEach(a => {
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
 * @param {string} [auswahl.artikelPrefix] - Nur Artikel dieser Nummern-Reihe.
 * @returns {{artikel: object, exakt: boolean, verfuegbareLaengen: number[]}|null}
 */
export function findArtikel({ kategorie, hersteller, steckerA, steckerB, laenge, bevorzugt, artikelPrefix }) {
    const kandidaten = getPassendeArtikel(kategorie, hersteller, steckerA, steckerB, artikelPrefix);
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
 * @param {string} [hersteller]
 * @param {string[]} [artikelWhitelist]
 * @returns {object[]}
 */
export function getMeterwareArtikel(kategorie, hersteller, artikelWhitelist) {
    const alle = getArtikelFuerKategorie(kategorie);
    let gefiltert = hersteller
        ? alle.filter(a => a.hersteller === hersteller)
        : alle;
    if (artikelWhitelist?.length) {
        gefiltert = gefiltert.filter(a => artikelWhitelist.includes(a.artikelnummer));
    }
    const meterware = gefiltert.filter(a => a.meterware);
    return (meterware.length ? meterware : gefiltert)
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


/**
 * Leitungsreihe aus einer Katalog-Artikelnummer ableiten (z. B. ZK2000-6200-0100 → ZK2000-6200).
 * @param {string} artikelnummer
 * @returns {string}
 */
export function deriveArtikelPrefix(artikelnummer) {
    const nr = (artikelnummer || '').trim();
    if (!nr) return '';

    const standard = nr.match(/^(.+)-(\d{4})$/);
    if (standard) return standard[1];

    const parts = nr.split('-');
    if (parts.length >= 2) {
        const last = parts[parts.length - 1];
        if (/^\d+$/.test(last) && last.length > 4) {
            return `${parts.slice(0, -1).join('-')}-${last.slice(0, -4)}`;
        }
    }

    return nr;
}


/**
 * Stecker kurz für die Anzeige (z. B. „M12 Buchse“, „offenes Ende“).
 * @param {string} stecker
 * @returns {string}
 */
export function formatSteckerKurz(stecker) {
    if (!stecker || stecker === 'offen') return 'offenes Ende';

    const gewinkelt = /\bgewinkelt/i.test(stecker) ? ' gewinkelt' : '';
    const m = stecker.match(/^(M\d+)\s+\d+-polig\s+(Stecker|Buchse)/i);
    if (m) return `${m[1]} ${m[2]}${gewinkelt}`.trim();

    const ventil = stecker.match(/^(Ventilstecker\s+DIN\s+C)/i);
    if (ventil) return ventil[1];

    const basis = getBaseSteckerTyp(stecker);
    if (/^RJ45/i.test(basis)) return basis.replace(/\s+(gerade|gewinkelt)$/i, '') + gewinkelt;
    return `${basis}${gewinkelt}`.trim();
}


/**
 * Zerlegt einen vollständigen Stecker-String in Basis und Ausrichtung.
 * @param {string} stecker
 * @returns {{ basis: string, ausrichtung: string }}
 */
export function splitSteckerAngabe(stecker) {
    if (!stecker) return { basis: '', ausrichtung: 'gerade' };
    return {
        basis: getBaseSteckerTyp(stecker),
        ausrichtung: /\bgewinkelt$/i.test(stecker) ? 'gewinkelt' : 'gerade'
    };
}


/**
 * Konfektionierte Katalog-Leitungen für die Button-Auswahl (ohne Meterware).
 * @param {{ kategorie?: string, hersteller?: string, suche?: string, limit?: number }} [filter]
 * @returns {object[]}
 */
export function getKonfektionierteKatalogArtikel(filter = {}) {
    const suche = (filter.suche || '').trim().toLowerCase();
    const limit = filter.limit ?? 150;

    return (appState.katalog?.artikel || [])
        .filter(a => !a.meterware && Number(a.laenge) > 0)
        .filter(a => !filter.kategorie || a.kategorie === filter.kategorie)
        .filter(a => !filter.hersteller || a.hersteller === filter.hersteller)
        .filter(a => {
            if (!suche) return true;
            const haystack = [
                a.artikelnummer,
                a.beschreibung,
                a.hersteller,
                formatSteckerKurz(a.steckerA),
                formatSteckerKurz(a.steckerB)
            ].join(' ').toLowerCase();
            return haystack.includes(suche);
        })
        .slice()
        .sort((a, b) => (a.artikelnummer || '').localeCompare(b.artikelnummer || '', 'de'))
        .slice(0, limit);
}


export { getBaseSteckerTyp, getFullSteckerTyp };
