/**
 * @file Preise aus der Beckhoff-Preisliste 05/2026.
 */

/** @type {Map<string, object>} */
let preiseNachNummer = new Map();

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
 * Lädt data/beckhoff_preisliste_05_2026.json.
 * @returns {Promise<void>}
 */
export async function loadPreisliste() {
    try {
        const response = await fetch('data/beckhoff_preisliste_05_2026.json');
        if (!response.ok) throw new Error(`Preisliste HTTP ${response.status}`);
        const data = await response.json();
        const map = new Map();
        (data.artikel || []).forEach(eintrag => {
            const key = preisSchluessel(eintrag.artikelnummer);
            if (key) map.set(key, eintrag);
        });
        preiseNachNummer = map;
    } catch (error) {
        console.error('Beckhoff-Preisliste konnte nicht geladen werden:', error);
        preiseNachNummer = new Map();
    }
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
        titel: eintrag.quelle || 'Beckhoff Preisliste 05/2026'
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
    ziel.preisQuelle = 'Beckhoff Preisliste 05/2026';
}
