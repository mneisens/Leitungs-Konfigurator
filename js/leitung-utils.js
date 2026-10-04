/**
 * @file Gemeinsame Leitungs-Hilfsfunktionen.
 */


/**
 * Ob eine Leitung genug Inhalt hat, um behalten zu werden.
 * @param {object|null} leitung
 * @returns {boolean}
 */
export function isLeitungMeaningful(leitung) {
    if (!leitung) return false;

    const hasBezeichnung = Boolean(leitung.bezeichnung?.trim());
    const hasArtikel = Boolean(leitung.artikelnummer?.trim() || leitung.artikelCustom?.trim());
    const hasGruppe = Boolean(leitung.gruppe?.trim());
    const hasHersteller = Boolean(leitung.hersteller?.trim());
    const hasLaenge = typeof leitung.laenge === 'number' && leitung.laenge > 0;
    const hasStecker = Boolean(leitung.steckerA?.trim() || leitung.steckerB?.trim());
    const hasKategorie = Boolean(leitung.kategorie?.trim() && leitung.kategorie !== 'sonstiges');
    const hasNotiz = Boolean(leitung.notiz?.trim());

    return hasBezeichnung || hasArtikel || hasGruppe
        || (hasHersteller && (hasLaenge || hasStecker))
        || hasKategorie || hasNotiz;
}


/**
 * Liefert die Stückzahl einer Leitung (mindestens 1).
 * @param {object|null} leitung
 * @returns {number}
 */
export function getLeitungStueckzahl(leitung) {
    const anzahl = parseInt(leitung?.anzahl, 10);
    if (Number.isNaN(anzahl) || anzahl < 1) return 1;
    return anzahl;
}
