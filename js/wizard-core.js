/**
 * @file wizard-core.js
 */
import { appState } from './state.js';
import { generateId, escapeHtml, formatDate, formatDateForFile } from './utils.js';
import { showModal, closeModal } from './modal.js';
import { showView } from './navigation.js';
import { getBauteilByNummer, getBauteilTypName, getBauteileByTyp, getArtikelByNummer } from './catalog.js';
import { persistCurrentProjekt, ensureWizardAnswers } from './projects.js';
import { setWizardOelflexMode, populateWizardOelflexAdern, populateWizardOelflexQuerschnitt, findOelflexArtikel, parseOelflexVariante } from './oelflex.js';
import { getBaseSteckerTyp } from './konfigurator-stecker.js';
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
            ? 'Diese Frage ist optional – leer lassen und weiter ist möglich.'
            : 'Bitte passende Leitungen und/oder Bauteile anlegen.';
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
        g.ids.push(b.id);
    });

    const rows = Array.from(grouped.values())
        .sort((a, b) => a.artikelnummer.localeCompare(b.artikelnummer, 'de'))
        .map(item => `
            <li>
                <span class="artikel">${escapeHtml(item.artikelnummer)}</span>
                <span>${escapeHtml(getBauteilTypName(item.typ))}: ${escapeHtml(item.bezeichnung)}</span>
                <span class="count">${item.count}</span>
                <button type="button" class="btn btn-danger btn-small btn-icon" onclick="wizardDeleteBauteil('${escapeHtml(item.ids[0])}')" title="Entfernen">🗑️</button>
            </li>
        `).join('');

    container.innerHTML = `
        <h4>Zu dieser Frage angelegte Bauteile (${bauteile.length})</h4>
        <ul>${rows}</ul>
    `;
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
}


export function wizardDeleteBauteil(bauteilId) {
    if (!appState.currentProjekt || !bauteilId) return;
    const step = getCurrentWizardStep();
    appState.currentProjekt.bauteile = (appState.currentProjekt.bauteile || []).filter(b => b.id !== bauteilId);
    persistCurrentProjekt();
    renderWizardCreatedBauteile(step);
}


export function wizardDeleteLeitungFromStep(leitungId) {
    if (!appState.currentProjekt || !leitungId) return;
    const step = getCurrentWizardStep();
    appState.currentProjekt.leitungen = (appState.currentProjekt.leitungen || []).filter(l => l.id !== leitungId);
    appState.currentProjekt.leitungen.forEach((l, idx) => { l.position = idx + 1; });
    persistCurrentProjekt();
    renderWizardCreatedLeitungen(step);
}


export function wizardDeleteLeitungenGroup(idsCsv) {
    if (!appState.currentProjekt || !idsCsv) return;
    const ids = idsCsv.split(',').map(s => s.trim()).filter(Boolean);
    const step = getCurrentWizardStep();
    appState.currentProjekt.leitungen = (appState.currentProjekt.leitungen || []).filter(l => !ids.includes(l.id));
    appState.currentProjekt.leitungen.forEach((l, idx) => { l.position = idx + 1; });
    persistCurrentProjekt();
    renderWizardCreatedLeitungen(step);
}


export function getWizardDefaultBezeichnung(step) {
    if (!step || !step.frage) return '';
    return step.frage.replace(/\?+$/, '').trim();
}
