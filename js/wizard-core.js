/**
 * @file wizard-core.js
 */
import { appState } from './state.js';
import { generateId, escapeHtml } from './utils.js';
import { showModal } from './modal.js';
import { getBauteilByNummer, getBauteilTypName, getBauteileByTyp } from './catalog.js';
import { persistCurrentProjekt, ensureWizardAnswers } from './projects.js';
import { assertCanEdit, canEditProject } from './project-access.js';
import { openBauteilEdit } from './bauteil-edit.js';
import { getCurrentWizardStep, getWizardKategorie, renderWizardCreatedLeitungen } from './wizard-leitungen.js';

export function stepHasLeitungen(step) {
    return Array.isArray(step?.allowedCategories) && step.allowedCategories.length > 0;
}


export function stepHasBauteile(step) {
    return Array.isArray(step?.bauteilTypen) && step.bauteilTypen.length > 0;
}


export function stepHasMengenfeld(step) {
    return step?.mengenfeld?.aktiv === true;
}


export function stepIsOelflexWizard(step) {
    const kategorie = getWizardKategorie();
    if (kategorie === 'oelflex') return true;
    const cats = step?.allowedCategories;
    return Array.isArray(cats) && cats.length === 1 && cats[0] === 'oelflex';
}


export function applyWizardStepVisibility(step) {
    const leitungenSection = document.getElementById('wizard-leitungen-section');
    const bauteileSection = document.getElementById('wizard-bauteile-section');
    const mengenfeldSection = document.getElementById('wizard-mengenfeld-section');
    const optionalHint = document.getElementById('wizard-optional-hint');

    if (leitungenSection) {
        leitungenSection.style.display = stepHasLeitungen(step) ? '' : 'none';
    }
    if (bauteileSection) {
        bauteileSection.style.display = stepHasBauteile(step) ? '' : 'none';
    }
    if (mengenfeldSection) {
        mengenfeldSection.style.display = stepHasMengenfeld(step) ? '' : 'none';
        const label = document.getElementById('wizard-menge-label');
        if (label && step?.mengenfeld?.label) {
            label.textContent = step.mengenfeld.label;
        }
    }
    if (optionalHint) {
        optionalHint.textContent = step?.optional
            ? 'Optional: Leitung/Bauteil anlegen oder Haken „Nicht vorhanden" setzen.'
            : 'Bitte Leitung/Bauteil anlegen oder Haken „Nicht vorhanden" setzen.';
    }
}


export function renderWizardBauteilForms(step) {
    const container = document.getElementById('wizard-bauteil-forms');
    if (!container || !step || !stepHasBauteile(step)) {
        if (container) container.innerHTML = '';
        return;
    }

    container.innerHTML = step.bauteilTypen.map(typ => {
        const bauteile = getBauteileByTyp(typ);
        const hersteller = Array.from(new Set(bauteile.map(b => b.hersteller))).sort((a, b) => a.localeCompare(b, 'de'));
        const herstellerOptions = hersteller.map(h =>
            `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`
        ).join('');
        const artikelOptions = bauteile.map(b =>
            `<option value="${escapeHtml(b.artikelnummer)}" data-hersteller="${escapeHtml(b.hersteller)}">${escapeHtml(b.artikelnummer)} – ${escapeHtml(b.beschreibung)}</option>`
        ).join('');

        return `
            <div class="wizard-bauteil-form" data-bauteil-typ="${escapeHtml(typ)}">
                <h4>${escapeHtml(getBauteilTypName(typ))}</h4>
                <div class="form-row">
                    <div class="form-group">
                        <label>Hersteller</label>
                        <select class="wizard-bauteil-hersteller" onchange="filterWizardBauteilSelect(this)">
                            <option value="">-- Alle --</option>
                            ${herstellerOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Bauteil</label>
                        <select class="wizard-bauteil-select">
                            <option value="">-- Bitte wählen --</option>
                            ${artikelOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Anzahl</label>
                        <input type="number" class="wizard-bauteil-anzahl" min="1" step="1" value="1">
                    </div>
                    <div class="form-group wizard-bauteil-action">
                        <label>&nbsp;</label>
                        <button type="button" class="btn btn-success btn-small" onclick="wizardAddBauteilFromStep('${escapeHtml(typ)}')">+ Hinzufügen</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}


export function filterWizardBauteilSelect(herstellerSelect) {
    const form = herstellerSelect.closest('.wizard-bauteil-form');
    if (!form) return;
    const hersteller = herstellerSelect.value;
    const select = form.querySelector('.wizard-bauteil-select');
    if (!select) return;
    Array.from(select.options).forEach((opt, idx) => {
        if (idx === 0) return;
        const match = !hersteller || opt.dataset.hersteller === hersteller;
        opt.hidden = !match;
        if (!match && opt.selected) opt.selected = false;
    });
}


export function renderWizardCreatedBauteile(step) {
    const container = document.getElementById('wizard-created-bauteile-list');
    if (!container || !appState.currentProjekt || !step) return;

    const bauteile = (appState.currentProjekt.bauteile || []).filter(b => b.wizardStepId === step.id);
    if (bauteile.length === 0) {
        container.innerHTML = '<p class="konfig-list-empty">Noch keine Bauteile zu dieser Frage angelegt.</p>';
        return;
    }

    const grouped = new Map();
    bauteile.forEach(b => {
        const key = `${b.artikelnummer}|||${b.bezeichnung || ''}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                artikelnummer: b.artikelnummer,
                bezeichnung: b.bezeichnung || '-',
                typ: b.typ,
                count: 0,
                ids: []
            });
        }
        const g = grouped.get(key);
        g.count += b.anzahl || 1;
        if (b.id) g.ids.push(b.id);
    });

    const canEdit = canEditProject(appState.currentProjekt);
    const rows = Array.from(grouped.values())
        .sort((a, b) => a.artikelnummer.localeCompare(b.artikelnummer, 'de'))
        .map(item => `
            <li>
                <span class="artikel">${escapeHtml(item.artikelnummer)}</span>
                <span>${escapeHtml(getBauteilTypName(item.typ))}: ${escapeHtml(item.bezeichnung)}</span>
                <span class="count">${item.count}</span>
                ${canEdit ? `
                <button type="button" class="btn btn-secondary btn-small btn-icon" data-action="edit-bauteil" data-bauteil-id="${escapeHtml(item.ids[0] || '')}" title="Bearbeiten">✏️</button>
                <button type="button" class="btn btn-danger btn-small btn-icon" data-action="delete-bauteil" data-bauteil-id="${escapeHtml(item.ids[0] || '')}" title="Eine entfernen">🗑️</button>` : ''}
            </li>
        `).join('');

    container.innerHTML = `
        <h4>Zu dieser Frage angelegte Bauteile (${bauteile.length})</h4>
        <ul>${rows}</ul>
    `;

    container.querySelectorAll('[data-action="edit-bauteil"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            openBauteilEdit(btn.getAttribute('data-bauteil-id'), () => {
                renderWizardCreatedBauteile(step);
                updateWizardSkipCheckbox(step);
            });
        });
    });

    container.querySelectorAll('[data-action="delete-bauteil"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            wizardDeleteBauteil(btn.getAttribute('data-bauteil-id'));
        });
    });
}


export function wizardAddBauteilFromStep(typ) {
    if (!appState.currentProjekt) return;
    ensureWizardAnswers(appState.currentProjekt);
    const step = getCurrentWizardStep();
    if (!step) return;

    const form = document.querySelector(`.wizard-bauteil-form[data-bauteil-typ="${typ}"]`);
    if (!form) return;

    const select = form.querySelector('.wizard-bauteil-select');
    const anzahlInput = form.querySelector('.wizard-bauteil-anzahl');
    const artikelnummer = select?.value?.trim();
    if (!artikelnummer) {
        showModal('Bitte ein Bauteil auswählen.', { type: 'warning', title: 'Bauteil fehlt' });
        return;
    }

    let anzahl = parseInt(anzahlInput?.value, 10);
    if (Number.isNaN(anzahl) || anzahl < 1) anzahl = 1;

    const bauteil = getBauteilByNummer(artikelnummer);
    const entry = {
        id: generateId('btl'),
        wizardStepId: step.id,
        gruppe: step.gruppe,
        typ: typ,
        hersteller: bauteil?.hersteller || '',
        artikelnummer: bauteil ? bauteil.artikelnummer : artikelnummer,
        bezeichnung: bauteil?.beschreibung || getBauteilTypName(typ),
        anzahl: anzahl
    };

    appState.currentProjekt.bauteile.push(entry);
    persistCurrentProjekt();
    if (select) select.value = '';
    if (anzahlInput) anzahlInput.value = '1';
    renderWizardCreatedBauteile(step);
    updateWizardSkipCheckbox(step);
}


export function wizardDeleteBauteil(bauteilId) {
    if (!appState.currentProjekt || !bauteilId) return;
    if (!assertCanEdit('Bauteile im Assistenten')) return;

    const step = getCurrentWizardStep();
    const bauteile = appState.currentProjekt.bauteile || [];
    const idx = bauteile.findIndex(b => b.id === bauteilId);
    if (idx < 0) return;

    const bauteil = bauteile[idx];
    if ((bauteil.anzahl || 1) > 1) {
        bauteil.anzahl -= 1;
    } else {
        appState.currentProjekt.bauteile = bauteile.filter(b => b.id !== bauteilId);
    }

    persistCurrentProjekt();
    renderWizardCreatedBauteile(step);
    updateWizardSkipCheckbox(step);
}


export function wizardDeleteLeitungFromStep(leitungId) {
    if (!appState.currentProjekt || !leitungId) return;
    const step = getCurrentWizardStep();
    appState.currentProjekt.leitungen = (appState.currentProjekt.leitungen || []).filter(l => l.id !== leitungId);
    appState.currentProjekt.leitungen.forEach((l, idx) => { l.position = idx + 1; });
    persistCurrentProjekt();
    renderWizardCreatedLeitungen(step);
    updateWizardSkipCheckbox(step);
}


export function wizardDeleteLeitungenGroup(idsCsv) {
    if (!appState.currentProjekt || !idsCsv) return;
    const ids = idsCsv.split(',').map(s => s.trim()).filter(Boolean);
    const step = getCurrentWizardStep();
    appState.currentProjekt.leitungen = (appState.currentProjekt.leitungen || []).filter(l => !ids.includes(l.id));
    appState.currentProjekt.leitungen.forEach((l, idx) => { l.position = idx + 1; });
    persistCurrentProjekt();
    renderWizardCreatedLeitungen(step);
    updateWizardSkipCheckbox(step);
}


export function getWizardDefaultBezeichnung(step) {
    if (!step || !step.frage) return '';
    return step.frage.replace(/\?+$/, '').trim();
}


export function wizardStepHasEntries(step) {
    if (!appState.currentProjekt || !step) return false;
    const hasLeitung = (appState.currentProjekt.leitungen || []).some(l => l.wizardStepId === step.id);
    const hasBauteil = (appState.currentProjekt.bauteile || []).some(b => b.wizardStepId === step.id);
    return hasLeitung || hasBauteil;
}


export function isWizardStepSkipped(step) {
    if (!appState.currentProjekt || !step) return false;
    return appState.currentProjekt.wizardSkipped?.[step.id] === true;
}


export function isWizardStepSatisfied(step) {
    if (!step) return true;
    const requiresEntry = stepHasLeitungen(step) || stepHasBauteile(step);
    if (!requiresEntry) return true;
    return wizardStepHasEntries(step) || isWizardStepSkipped(step);
}


/**
 * Sperrt den Weiter-Button, solange weder ein Eintrag vorhanden
 * noch „Nicht vorhanden" angehakt ist.
 * @param {object} step
 * @returns {void}
 */
export function updateWizardNextButton(step) {
    const nextBtn = document.getElementById('wizard-next');
    if (!nextBtn) return;

    const satisfied = isWizardStepSatisfied(step);
    nextBtn.disabled = !satisfied;
    nextBtn.title = satisfied
        ? ''
        : 'Bitte mindestens eine Leitung/ein Bauteil anlegen oder „Nicht vorhanden" anhaken.';
}


export function updateWizardSkipCheckbox(step) {
    updateWizardNextButton(step);

    const checkbox = document.getElementById('wizard-nicht-vorhanden');
    if (!checkbox) return;

    const box = checkbox.closest('.wizard-skip');
    const requiresEntry = step && (stepHasLeitungen(step) || stepHasBauteile(step));
    if (box) box.style.display = requiresEntry ? '' : 'none';

    if (!requiresEntry) {
        checkbox.checked = false;
        checkbox.disabled = false;
        return;
    }

    if (wizardStepHasEntries(step)) {
        checkbox.checked = false;
        checkbox.disabled = true;
        if (appState.currentProjekt?.wizardSkipped) {
            delete appState.currentProjekt.wizardSkipped[step.id];
        }
    } else {
        checkbox.disabled = false;
        checkbox.checked = isWizardStepSkipped(step);
    }
}


export function onWizardNichtVorhandenChange() {
    if (!appState.currentProjekt) return;
    const step = getCurrentWizardStep();
    if (!step) return;
    ensureWizardAnswers(appState.currentProjekt);
    if (!appState.currentProjekt.wizardSkipped) appState.currentProjekt.wizardSkipped = {};

    const checkbox = document.getElementById('wizard-nicht-vorhanden');
    if (checkbox?.checked) {
        appState.currentProjekt.wizardSkipped[step.id] = true;
    } else {
        delete appState.currentProjekt.wizardSkipped[step.id];
    }
    persistCurrentProjekt();
    updateWizardNextButton(step);
}
