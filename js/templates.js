/**
 * @file HTML-Templates laden und klonen.
 */

let templatesLoaded = false;


/**
 * Lädt UI-Templates aus templates/ui.html.
 * @returns {Promise<void>}
 */
export async function loadTemplates() {
    if (templatesLoaded) return;

    const existing = document.getElementById('templates-root');
    if (existing) {
        templatesLoaded = true;
        return;
    }

    const response = await fetch('templates/ui.html');
    const html = await response.text();
    const container = document.createElement('div');
    container.id = 'templates-root';
    container.hidden = true;
    container.innerHTML = html;
    document.body.appendChild(container);
    templatesLoaded = true;
}


/**
 * Klont ein Template anhand seiner ID (ohne tpl-Präfix).
 * @param {string} id
 * @returns {DocumentFragment}
 */
export function cloneTemplate(id) {
    const tpl = document.getElementById(`tpl-${id}`);
    if (!tpl) {
        console.warn(`Template tpl-${id} nicht gefunden`);
        return document.createDocumentFragment();
    }
    return tpl.content.cloneNode(true);
}


/**
 * Setzt Textinhalt in einem geklonten Fragment.
 * @param {ParentNode} root
 * @param {string} selector
 * @param {string} text
 * @returns {void}
 */
export function setText(root, selector, text) {
    const el = root.querySelector(selector);
    if (el) el.textContent = text;
}
