/**
 * @file admin.js
 */
import { appState } from './state.js';
import { escapeHtml } from './utils.js';
import { showModal } from './modal.js';
import { showView } from './navigation.js';
import { getWizardConfigDoc } from './firebase.js';
import { validateWizardSteps } from './wizard-config.js';
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


// UI-Zustand des Admin-Editors (nicht persistiert)
let adminExpandedIndex = null;
let adminSearchText = '';
let adminGruppeFilter = '';


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
 * Füllt das Gruppen-Filter-Dropdown mit allen vorhandenen Gruppen.
 * @returns {void}
 */
function populateGruppeFilter() {
    const select = document.getElementById('admin-gruppe-filter');
    if (!select) return;

    const current = select.value;
    const gruppen = Array.from(new Set(appState.wizardSteps.map(s => s.gruppe).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));

    select.innerHTML = '<option value="">Alle Gruppen</option>'
        + gruppen.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');

    if (current && gruppen.includes(current)) {
        select.value = current;
    }
}


/**
 * Liefert die Schritte, die zu Suche und Gruppenfilter passen.
 * @returns {{step: object, index: number}[]}
 */
function getFilteredSteps() {
    const text = adminSearchText.toLowerCase();
    return appState.wizardSteps
        .map((step, index) => ({ step, index }))
        .filter(({ step }) => {
            if (adminGruppeFilter && step.gruppe !== adminGruppeFilter) return false;
            if (!text) return true;
            return `${step.frage || ''} ${step.id || ''} ${step.gruppe || ''}`.toLowerCase().includes(text);
        });
}


/**
 * Übernimmt Such-/Filterwerte aus der Toolbar und rendert neu.
 * @returns {void}
 */
export function adminFilterSteps() {
    adminSearchText = document.getElementById('admin-search')?.value?.trim() || '';
    adminGruppeFilter = document.getElementById('admin-gruppe-filter')?.value || '';
    renderAdminStepsEditor();
}


/**
 * Klappt eine Frage auf oder zu.
 * @param {number} index
 * @returns {void}
 */
export function adminToggleStep(index) {
    adminExpandedIndex = adminExpandedIndex === index ? null : index;
    renderAdminStepsEditor();
}


/**
 * Kompakte Badge-Leiste für eine zugeklappte Frage.
 * @param {object} step
 * @returns {string}
 */
function renderStepBadges(step) {
    const kategorien = getAdminKategorieOptions();
    const bauteiltypen = getAdminBauteilTypOptions();

    const badges = [];
    (step.allowedCategories || []).forEach(id => {
        const label = kategorien.find(k => k.value === id)?.label || id;
        badges.push(`<span class="admin-badge badge-kategorie">${escapeHtml(label)}</span>`);
    });
    (step.bauteilTypen || []).forEach(id => {
        const label = bauteiltypen.find(t => t.value === id)?.label || id;
        badges.push(`<span class="admin-badge badge-bauteil">${escapeHtml(label)}</span>`);
    });
    if (step.mengenfeld?.aktiv) {
        badges.push('<span class="admin-badge badge-menge">Mengenfeld</span>');
    }
    if (step.vorauswahl && Object.keys(step.vorauswahl).length > 0) {
        badges.push('<span class="admin-badge badge-vorauswahl">Vorauswahl</span>');
    }
    if (step.optional) {
        badges.push('<span class="admin-badge badge-optional">Optional</span>');
    }
    return badges.join('');
}


/**
 * Formular einer aufgeklappten Frage.
 * @param {object} step
 * @returns {string}
 */
function renderStepForm(step) {
    const kategorien = getAdminKategorieOptions();
    const bauteiltypen = getAdminBauteilTypOptions();
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
        <div class="admin-step-form">
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
                    <label>Gruppe</label>
                    <input type="text" data-field="gruppe" value="${escapeHtml(step.gruppe || '')}">
                </div>
            </div>
            <div class="form-group">
                <label>Vorauswahl (wird beim Öffnen der Frage automatisch gesetzt)</label>
                <div class="form-row">
                    <div class="form-group">
                        <label>Hersteller</label>
                        <input type="text" data-field="vorauswahlHersteller" value="${escapeHtml(step.vorauswahl?.hersteller || '')}" placeholder="z. B. Beckhoff">
                    </div>
                    <div class="form-group">
                        <label>Stecker A</label>
                        <input type="text" data-field="vorauswahlSteckerA" value="${escapeHtml(step.vorauswahl?.steckerA || '')}" placeholder="z. B. M12">
                    </div>
                    <div class="form-group">
                        <label>Stecker B</label>
                        <input type="text" data-field="vorauswahlSteckerB" value="${escapeHtml(step.vorauswahl?.steckerB || '')}" placeholder="z. B. offen">
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Optionen</label>
                    <div class="admin-check-group admin-options-group">
                        <label class="admin-check">
                            <input type="checkbox" data-field="optional" ${step.optional ? 'checked' : ''}>
                            Optional
                        </label>
                        <label class="admin-check">
                            <input type="checkbox" data-field="mengenfeldAktiv" ${step.mengenfeld?.aktiv ? 'checked' : ''}>
                            Mengenfeld anzeigen
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Mengenfeld-Label</label>
                    <input type="text" data-field="mengenfeldLabel" value="${escapeHtml(step.mengenfeld?.label || 'Anzahl')}">
                </div>
            </div>
            <div class="form-group admin-id-row">
                <label>Technische ID (Verknüpfung mit bestehenden Projekten – nur ändern, wenn nötig)</label>
                <input type="text" data-field="id" value="${escapeHtml(step.id || '')}">
            </div>
        </div>
    `;
}


/**
 * renderAdminStepsEditor.
 * @returns {void}
 */
export function renderAdminStepsEditor() {
    const container = document.getElementById('admin-steps-editor');
    if (!container) return;

    populateGruppeFilter();

    const filtered = getFilteredSteps();
    const countEl = document.getElementById('admin-step-count');
    if (countEl) {
        countEl.textContent = filtered.length === appState.wizardSteps.length
            ? `${appState.wizardSteps.length} Fragen`
            : `${filtered.length} von ${appState.wizardSteps.length} Fragen`;
    }

    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-muted admin-empty">Keine Fragen gefunden.</p>';
        return;
    }

    const total = appState.wizardSteps.length;
    container.innerHTML = filtered.map(({ step, index }) => {
        const expanded = adminExpandedIndex === index;
        return `
            <div class="admin-step-card ${expanded ? 'expanded' : ''}" data-step-index="${index}">
                <div class="admin-step-row" onclick="adminToggleStep(${index})">
                    <span class="admin-step-toggle">${expanded ? '▾' : '▸'}</span>
                    <span class="admin-step-nr">${index + 1}</span>
                    <span class="admin-badge badge-gruppe">${escapeHtml(step.gruppe || '—')}</span>
                    <span class="admin-step-frage">${escapeHtml(step.frage || '(ohne Frage)')}</span>
                    <span class="admin-step-badges">${renderStepBadges(step)}</span>
                    <span class="admin-step-actions" onclick="event.stopPropagation()">
                        <button type="button" class="btn btn-secondary btn-small" onclick="adminMoveWizardStep(${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Nach oben">↑</button>
                        <button type="button" class="btn btn-secondary btn-small" onclick="adminMoveWizardStep(${index}, 1)" ${index === total - 1 ? 'disabled' : ''} title="Nach unten">↓</button>
                        <button type="button" class="btn btn-danger btn-small" onclick="adminRemoveWizardStep(${index})" title="Entfernen">🗑️</button>
                    </span>
                </div>
                ${expanded ? renderStepForm(step) : ''}
            </div>
        `;
    }).join('');
}


/**
 * Überträgt eine Formularänderung direkt in den State.
 * @param {Event} event
 * @returns {void}
 */
function handleAdminFieldChange(event) {
    const field = event.target?.dataset?.field;
    if (!field) return;

    const card = event.target.closest('.admin-step-card');
    const index = parseInt(card?.dataset?.stepIndex, 10);
    const step = appState.wizardSteps[index];
    if (!step) return;

    switch (field) {
        case 'id':
        case 'gruppe':
        case 'frage':
            step[field] = event.target.value.trim();
            break;
        case 'hinweis': {
            const hinweis = event.target.value.trim();
            if (hinweis) step.hinweis = hinweis;
            else delete step.hinweis;
            break;
        }
        case 'defaultCategory':
            if (event.target.value) step.defaultCategory = event.target.value;
            else delete step.defaultCategory;
            break;
        case 'optional':
            if (event.target.checked) step.optional = true;
            else delete step.optional;
            break;
        case 'mengenfeldAktiv':
        case 'mengenfeldLabel': {
            const aktiv = card.querySelector('[data-field="mengenfeldAktiv"]')?.checked;
            if (aktiv) {
                step.mengenfeld = {
                    aktiv: true,
                    label: card.querySelector('[data-field="mengenfeldLabel"]')?.value?.trim() || 'Anzahl'
                };
            } else {
                delete step.mengenfeld;
            }
            break;
        }
        case 'vorauswahlHersteller':
        case 'vorauswahlSteckerA':
        case 'vorauswahlSteckerB': {
            const keyMap = {
                vorauswahlHersteller: 'hersteller',
                vorauswahlSteckerA: 'steckerA',
                vorauswahlSteckerB: 'steckerB'
            };
            const vorauswahl = { ...(step.vorauswahl || {}) };
            const value = event.target.value.trim();
            if (value) vorauswahl[keyMap[field]] = value;
            else delete vorauswahl[keyMap[field]];
            if (Object.keys(vorauswahl).length > 0) step.vorauswahl = vorauswahl;
            else delete step.vorauswahl;
            break;
        }
        case 'allowedCategories':
        case 'bauteilTypen': {
            const values = Array.from(card.querySelectorAll(`[data-field="${field}"]:checked`)).map(el => el.value);
            if (values.length) step[field] = values;
            else delete step[field];
            break;
        }
    }

    syncAdminJsonTextarea();
}


/**
 * adminAddWizardStep.
 * @returns {void}
 */
export function adminAddWizardStep() {
    appState.wizardSteps.push({
        id: `frage-${Date.now()}`,
        gruppe: adminGruppeFilter || '=000',
        frage: 'Neue Frage?',
        allowedCategories: ['sensor'],
        optional: true
    });

    // Suchfilter zurücksetzen, damit die neue Frage sichtbar ist
    adminSearchText = '';
    const searchInput = document.getElementById('admin-search');
    if (searchInput) searchInput.value = '';

    adminExpandedIndex = appState.wizardSteps.length - 1;
    renderAdminStepsEditor();
    syncAdminJsonTextarea();

    document.querySelector('.admin-step-card.expanded')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}


/**
 * adminRemoveWizardStep.
 * @returns {void}
 */
export function adminRemoveWizardStep(index) {
    if (index < 0 || index >= appState.wizardSteps.length) return;
    appState.wizardSteps.splice(index, 1);

    if (adminExpandedIndex === index) adminExpandedIndex = null;
    else if (adminExpandedIndex !== null && adminExpandedIndex > index) adminExpandedIndex--;

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

    if (adminExpandedIndex === index) adminExpandedIndex = newIndex;
    else if (adminExpandedIndex === newIndex) adminExpandedIndex = index;

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

    const container = document.getElementById('admin-steps-editor');
    if (container && !container.dataset.bound) {
        container.dataset.bound = '1';
        container.addEventListener('input', handleAdminFieldChange);
        container.addEventListener('change', handleAdminFieldChange);
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

    const result = validateWizardSteps(appState.wizardSteps);
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
