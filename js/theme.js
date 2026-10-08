/**
 * @file Hell-/Dunkelmodus mit Persistenz.
 */

export const THEME_STORAGE_KEY = 'leitungskonfigurator_theme';

/**
 * @returns {'light'|'dark'}
 */
export function getPreferredTheme() {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
    } catch { /* ignore */ }

    if (typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
    }
    return 'dark';
}


/**
 * @returns {'light'|'dark'}
 */
export function getCurrentTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    return attr === 'light' ? 'light' : 'dark';
}


/**
 * Aktualisiert Beschriftungen aller Theme-Schalter.
 * @param {'light'|'dark'} [theme]
 * @returns {void}
 */
export function updateThemeToggleLabels(theme = getCurrentTheme()) {
    const nextLabel = theme === 'dark' ? 'Hell' : 'Dunkel';
    const aria = theme === 'dark' ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln';

    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
        const label = btn.querySelector('[data-theme-label]');
        if (label) label.textContent = nextLabel;
        else btn.textContent = nextLabel;
        btn.setAttribute('aria-label', aria);
        btn.setAttribute('title', aria);
        btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    });
}


/**
 * @param {'light'|'dark'} theme
 * @returns {void}
 */
export function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { /* ignore */ }
    updateThemeToggleLabels(next);
}


/**
 * Wechselt zwischen Hell und Dunkel.
 * @returns {'light'|'dark'}
 */
export function toggleTheme() {
    const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    return next;
}


/**
 * Initialisiert Theme beim App-Start (nach Early-Script erneut syncen).
 * @returns {void}
 */
export function initTheme() {
    applyTheme(getPreferredTheme());
}
