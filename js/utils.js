/**
 * @file Hilfsfunktionen.
 */
/**
 * Eindeutige ID mit Präfix, z. B. `ltg-1739…-k3j9…`.
 * @param {string} prefix
 * @returns {string}
 */
export function generateId(prefix) {
    const zufall = globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : Math.random().toString(36).slice(2, 11);
    return `${prefix}-${Date.now()}-${zufall}`;
}


/**
 * Maskiert Text für HTML – auch Anführungszeichen, damit der Wert ebenso in Attributen
 * (`value="…"`, `title="…"`) sicher ist.
 * @param {*} text
 * @returns {string}
 */
export function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


/**
 * Wie escapeHtml, aber `0` bleibt erhalten.
 * @param {*} wert
 * @returns {string}
 */
export function escapeAttr(wert) {
    return escapeHtml(String(wert ?? ''));
}


/**
 * Wert als String-Argument in einem onclick-Attribut (`fn('…')`). Stecker wie
 * „7/8" 5-polig“ enthalten Anführungszeichen, die sonst das Attribut beenden.
 * @param {*} wert
 * @returns {string}
 */
export function jsArg(wert) {
    return escapeAttr(String(wert ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}


/**
 * Länge in Metern mit Dezimalkomma; leere Werte und 0 bleiben leer.
 * @param {number|string} wert
 * @returns {string}
 */
export function formatLaenge(wert) {
    if (!wert) return '';
    const n = Number(wert);
    if (Number.isNaN(n)) return String(wert);
    return String(Math.round(n * 1000) / 1000).replace('.', ',');
}


/**
 * Verzögert einen Aufruf, bis eine Weile keine neuen Aufrufe mehr kommen.
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} [ms]
 * @returns {F}
 */
export function debounce(fn, ms = 150) {
    let timer = 0;
    return /** @type {F} */ ((...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    });
}


/**
 * formatDate.
 * @returns {void}
 */
export function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}


/**
 * formatDateForFile.
 * @returns {void}
 */
export function formatDateForFile(date) {
    return date.toISOString().split('T')[0];
}
