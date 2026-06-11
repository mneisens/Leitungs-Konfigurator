/**
 * @file admin.js
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import { showModal } from './modal.js';
import { WIZARD_CAT } from './config.js';
import { showView } from './navigation.js';
import { cloneTemplate } from './templates.js';
import { getBauteilTypName } from './catalog.js';
import { getWizardConfigDoc } from './firebase.js';
import { normalizeWizardStep, validateWizardSteps } from './wizard-config.js';
/**
 * getAdminKategorieOptions.
 * @returns {void}
 */
export function getAdminKategorieOptions() {
    return (appState.katalog?.kategorien || [
        { id: 'ethercat', name: 'EtherCAT Leitung' },
        { id: 'power', name: 'Power Leitung' },
        { id: 'sensor', name: 'Sensorleitung' },
        { id: 'oelflex', name: 'Ölflexleitung' },
        { id: 'sonstiges', name: 'Sonstiges' }
    ]).map(k => ({ value: k.id, label: k.name }));
}


/**
 * getAdminBauteilTypOptions.
 * @returns {void}
 */
export function getAdminBauteilTypOptions() {
    return (appState.bauteileKatalog?.bauteiltypen || []).map(t => ({ value: t.id, label: t.name }));
}


/**
 * Synchronisiert die Admin-JSON-Textarea.
 * @returns {void}
 */
export function syncAdminJsonTextarea() {
    const textarea = document.getElementById('admin-wizard-json');
    if (textarea) {
        textarea.value = JSON.stringify(appState.wizardSteps, null, 2);
    }
}


/**
 * renderAdminStepsEditor.
 * @returns {void}
 */
export function renderAdminStepsEditor() {
    const container = document.getElementById('admin-steps-editor');
    if (!container) return;

    const kategorien = getAdminKategorieOptions();
    const bauteiltypen = getAdminBauteilTypOptions();

    container.innerHTML = appState.wizardSteps.map((step, index) => {
        const allowed = step.allowedCategories || [];
        const bauteilTypen = step.bauteilTypen || [];
        const kategorieChecks = kategorien.map(k => `
            <label class="admin-check">
                <input type="checkbox" data-field="allowedCategories" value="${escapeHtml(k.value)}" ${allowed.includes(k.value) ? 'checked' : ''}>
                ${escapeHtml(k.label)}
            </label>
        `).join('');
        const bauteilChecks = bauteiltypen.map(t => `
            <label class="admin-check">
                <input type="checkbox" data-field="bauteilTypen" value="${escapeHtml(t.value)}" ${bauteilTypen.includes(t.value) ? 'checked' : ''}>
                ${escapeHtml(t.label)}
            </label>
        `).join('');
        const defaultOptions = ['', ...kategorien.map(k => k.value)].map(v => {
            const label = v ? kategorien.find(k => k.value === v)?.label || v : '-- Keine --';
            return `<option value="${escapeHtml(v)}" ${step.defaultCategory === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');

        return `
            <div class="admin-step-card" data-step-index="${index}">
                <div class="admin-step-header">
                    <strong>Frage ${index + 1}</strong>
                    <div class="admin-step-actions">
                        <button type="button" class="btn btn-secondary btn-small" onclick="adminMoveWizardStep(${index}, -1)" ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" class="btn btn-secondary btn-small" onclick="adminMoveWizardStep(${index}, 1)" ${index === appState.wizardSteps.length - 1 ? 'disabled' : ''}>↓</button>
                        <button type="button" class="btn btn-danger btn-small" onclick="adminRemoveWizardStep(${index})">Entfernen</button>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>ID</label>
                        <input type="text" data-field="id" value="${escapeHtml(step.id || '')}">
                    </div>
                    <div class="form-group">
                        <label>Gruppe</label>
                        <input type="text" data-field="gruppe" value="${escapeHtml(step.gruppe || '')}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Frage</label>
                    <input type="text" data-field="frage" value="${escapeHtml(step.frage || '')}">
                </div>
                <div class="form-group">
                    <label>Hinweis (optional, wird unter der Frage angezeigt)</label>
                    <textarea data-field="hinweis" rows="2">${escapeHtml(step.hinweis || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Erlaubte Leitungs-Kategorien</label>
                    <div class="admin-check-group">${kategorieChecks}</div>
                </div>
                <div class="form-group">
                    <label>Bauteiltypen</label>
                    <div class="admin-check-group">${bauteilChecks || '<span class="text-muted">Keine Bauteiltypen im Katalog</span>'}</div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Standard-Kategorie</label>
                        <select data-field="defaultCategory">${defaultOptions}</select>
                    </div>
                    <div class="form-group">
                        <label class="admin-check">
                            <input type="checkbox" data-field="optional" ${step.optional ? 'checked' : ''}>
                            Optional
                        </label>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="admin-check">
                            <input type="checkbox" data-field="mengenfeldAktiv" ${step.mengenfeld?.aktiv ? 'checked' : ''}>
                            Mengenfeld anzeigen
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Mengenfeld-Label</label>
                        <input type="text" data-field="mengenfeldLabel" value="${escapeHtml(step.mengenfeld?.label || 'Anzahl')}">
                    </div>
                </div>
            </div>
        `;
    }).join('');
}


/**
 * collectAdminStepsFromEditor.
 * @returns {void}
 */
export function collectAdminStepsFromEditor() {
    const cards = document.querySelectorAll('.admin-step-card');
    const steps = [];
    cards.forEach(card => {
        const getVal = field => card.querySelector(`[data-field="${field}"]`)?.value?.trim() || '';
        const allowedCategories = Array.from(card.querySelectorAll('[data-field="allowedCategories"]:checked')).map(el => el.value);
        const bauteilTypen = Array.from(card.querySelectorAll('[data-field="bauteilTypen"]:checked')).map(el => el.value);
        const step = {
            id: getVal('id'),
            gruppe: getVal('gruppe'),
            frage: getVal('frage')
        };
        if (allowedCategories.length) step.allowedCategories = allowedCategories;
        if (bauteilTypen.length) step.bauteilTypen = bauteilTypen;
        const defaultCategory = getVal('defaultCategory');
        if (defaultCategory) step.defaultCategory = defaultCategory;
        const hinweis = getVal('hinweis');
        if (hinweis) step.hinweis = hinweis;
        if (card.querySelector('[data-field="optional"]')?.checked) step.optional = true;
        if (card.querySelector('[data-field="mengenfeldAktiv"]')?.checked) {
            step.mengenfeld = {
                aktiv: true,
                label: getVal('mengenfeldLabel') || 'Anzahl'
            };
        }
        steps.push(step);
    });
    return steps;
}


/**
 * adminAddWizardStep.
 * @returns {void}
 */
export function adminAddWizardStep() {
    appState.wizardSteps.push({
        id: `frage-${appState.wizardSteps.length + 1}`,
        gruppe: '=000',
        frage: 'Neue Frage?',
        allowedCategories: ['sensor'],
        optional: true
    });
    renderAdminStepsEditor();
    syncAdminJsonTextarea();
}


/**
 * adminRemoveWizardStep.
 * @returns {void}
 */
export function adminRemoveWizardStep(index) {
    if (index < 0 || index >= appState.wizardSteps.length) return;
    appState.wizardSteps.splice(index, 1);
    renderAdminStepsEditor();
    syncAdminJsonTextarea();
}


/**
 * adminMoveWizardStep.
 * @returns {void}
 */
export function adminMoveWizardStep(index, delta) {
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= appState.wizardSteps.length) return;
    const tmp = appState.wizardSteps[index];
    appState.wizardSteps[index] = appState.wizardSteps[newIndex];
    appState.wizardSteps[newIndex] = tmp;
    renderAdminStepsEditor();
    syncAdminJsonTextarea();
}


/**
 * adminLoadFromJson.
 * @returns {void}
 */
export function adminLoadFromJson() {
    const textarea = document.getElementById('admin-wizard-json');
    if (!textarea) return;
    try {
        const parsed = JSON.parse(textarea.value);
        const result = validateWizardSteps(parsed);
        if (!result.ok) {
            showModal(result.message, { type: 'warning', title: 'Formatfehler' });
            return;
        }
        appState.wizardSteps = result.steps;
        renderAdminStepsEditor();
        syncAdminJsonTextarea();
    } catch (error) {
        showModal(`JSON ungültig: ${error.message}`, { type: 'danger', title: 'Fehler' });
    }
}


/**
 * renderAdminView.
 * @returns {void}
 */
export function renderAdminView() {
    if (appState.currentUserRole !== 'admin') {
        showModal('Nur Admin-Benutzer dürfen diese Seite öffnen.', { type: 'warning', title: 'Kein Zugriff' });
        showView('home');
        return;
    }

    renderAdminStepsEditor();
    syncAdminJsonTextarea();
}


/**
 * saveAdminWizardConfig.
 * @returns {void}
 */
export async function saveAdminWizardConfig() {
    if (appState.currentUserRole !== 'admin') {
        showModal('Nur Admin-Benutzer dürfen speichern.', { type: 'warning', title: 'Kein Zugriff' });
        return;
    }

    const collected = collectAdminStepsFromEditor();
    const result = validateWizardSteps(collected);
    if (!result.ok) {
        showModal(result.message, { type: 'warning', title: 'Formatfehler' });
        return;
    }

    appState.wizardSteps = result.steps;
    syncAdminJsonTextarea();

    if (appState.firebaseReady) {
        try {
            const ref = getWizardConfigDoc();
            if (ref) {
                await ref.set({
                    steps: appState.wizardSteps,
                    updatedBy: appState.currentUser?.uid || '',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (error) {
            showModal(`Speichern in Firestore fehlgeschlagen: ${error.message}`, { type: 'danger', title: 'Fehler' });
            return;
        }
    }

    showModal('Assistent-Fragen wurden gespeichert.', { type: 'success', title: 'Gespeichert' });
}
