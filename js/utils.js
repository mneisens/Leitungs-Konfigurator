/**
 * @file Hilfsfunktionen.
 */
/**
 * generateId.
 * @returns {void}
 */
export function generateId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}


/**
 * escapeHtml.
 * @returns {void}
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
