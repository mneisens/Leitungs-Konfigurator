/**
 * @file stecker-utils.js – Reine Hilfsfunktionen rund um Steckertypen.
 */

/**
 * Entfernt eine angehängte Ausrichtung aus einem Steckertyp.
 * @param {string} stecker
 * @returns {string}
 */
export function getBaseSteckerTyp(stecker) {
    if (!stecker) return '';
    return stecker.replace(/ (gerade|gewinkelt)$/, '');
}


/**
 * Nur M8-/M12-Stecker werden im Katalog gerade und gewinkelt geführt.
 * @param {string} stecker
 * @returns {boolean}
 */
export function hasAusrichtung(stecker) {
    if (!stecker) return false;
    const base = getBaseSteckerTyp(stecker);
    return base.includes('M8') || base.includes('M12');
}


/**
 * Setzt Basistyp und Ausrichtung zum Katalog-Steckertyp zusammen.
 * @param {string} baseTyp
 * @param {string} ausrichtung
 * @returns {string}
 */
export function getFullSteckerTyp(baseTyp, ausrichtung) {
    if (!baseTyp) return '';
    if (!hasAusrichtung(baseTyp)) return baseTyp;
    return `${baseTyp} ${ausrichtung || 'gerade'}`;
}
