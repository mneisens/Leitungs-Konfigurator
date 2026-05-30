/**
 * @file Modal-Dialog.
 */
import { appState } from './state.js';

/**
 * showModal.
 * @returns {void}
 */
export function showModal(message, options = {}) {
    const overlay = document.getElementById('modal-overlay');
    const icon = document.getElementById('modal-icon');
    const title = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const bodyEl = messageEl.parentElement;
    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');
    
    // Defaults
    const type = options.type || 'info';
    const titleText = options.title || (type === 'danger' ? 'Achtung' : type === 'success' ? 'Erfolg' : 'Hinweis');
    const confirmText = options.confirmText || 'OK';
    const cancelText = options.cancelText || 'Abbrechen';
    const showCancel = options.showCancel !== undefined ? options.showCancel : false;
    const requireTextMatch = options.requireTextMatch || false;
    const expectedText = options.expectedText || '';
    const textMatchLabel = options.textMatchLabel || 'Bestätigung';
    const textMatchPlaceholder = options.textMatchPlaceholder || '';
    
    // Icons basierend auf Typ
    const icons = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        danger: '🗑️'
    };
    
    // Setze Inhalt
    icon.textContent = icons[type] || icons.info;
    title.textContent = titleText;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    
    // Zeige/verstecke Abbrechen-Button
    cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';
    
    // Setze Button-Stil basierend auf Typ
    confirmBtn.className = type === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

    // Eventhandler zurücksetzen, damit bei wiederholtem Öffnen nichts doppelt hängt
    confirmBtn.onclick = () => closeModal(true);
    cancelBtn.onclick = () => closeModal(false);

    // Vorhandene dynamische Eingaben entfernen
    const existingConfirmInput = document.getElementById('modal-text-confirm-group');
    if (existingConfirmInput) {
        existingConfirmInput.remove();
    }

    if (requireTextMatch) {
        const inputGroup = document.createElement('div');
        inputGroup.id = 'modal-text-confirm-group';
        inputGroup.className = 'modal-text-confirm-group';

        const label = document.createElement('label');
        label.setAttribute('for', 'modal-text-confirm-input');
        label.textContent = textMatchLabel;
        label.className = 'modal-text-confirm-label';

        const input = document.createElement('input');
        input.id = 'modal-text-confirm-input';
        input.type = 'text';
        input.placeholder = textMatchPlaceholder;
        input.autocomplete = 'off';
        input.className = 'modal-text-confirm-input';

        inputGroup.appendChild(label);
        inputGroup.appendChild(input);
        bodyEl.appendChild(inputGroup);

        const validateInput = () => {
            const matches = input.value.trim() === expectedText;
            confirmBtn.disabled = !matches;
        };

        confirmBtn.disabled = true;
        input.addEventListener('input', validateInput);
        setTimeout(() => input.focus(), 0);
    } else {
        confirmBtn.disabled = false;
    }
    
    // Entferne alte Typ-Klassen und füge neue hinzu
    overlay.className = 'modal-overlay active modal-' + type;
    
    // Rückgabe als Promise für async/await
    return new Promise(resolve => {
        appState.modalResolve = resolve;
    });
}


/**
 * closeModal.
 * @returns {void}
 */
export function closeModal(result = true) {
    const overlay = document.getElementById('modal-overlay');
    const confirmBtn = document.getElementById('modal-confirm');

    // Bestätigen blockieren, solange Pflicht-Eingabe nicht erfüllt ist
    if (result === true && confirmBtn && confirmBtn.disabled) {
        return;
    }

    overlay.classList.remove('active');
    
    if (appState.modalResolve) {
        appState.modalResolve(result);
        appState.modalResolve = null;
    }
}
