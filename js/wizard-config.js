/**
 * @file Validierung und Normalisierung der Wizard-Fragen.
 */

/**
 * Normalisiert einen Wizard-Schritt.
 * @param {object} step
 * @param {number} index
 * @returns {object}
 */
export function normalizeWizardStep(step, index) {
    const normalized = {
        id: String(step?.id || `frage-${index + 1}`).trim(),
        gruppe: String(step?.gruppe || '=000').trim(),
        frage: String(step?.frage || 'Neue Frage?').trim()
    };
    if (Array.isArray(step?.allowedCategories) && step.allowedCategories.length > 0) {
        normalized.allowedCategories = step.allowedCategories.filter(Boolean);
    }
    if (Array.isArray(step?.bauteilTypen) && step.bauteilTypen.length > 0) {
        normalized.bauteilTypen = step.bauteilTypen.filter(Boolean);
    }
    if (step?.defaultCategory) normalized.defaultCategory = step.defaultCategory;
    if (step?.hinweis) normalized.hinweis = String(step.hinweis).trim();
    if (step?.vorauswahl && typeof step.vorauswahl === 'object') {
        const vorauswahl = {};
        ['hersteller', 'steckerA', 'steckerB', 'ausrichtungA', 'ausrichtungB'].forEach(key => {
            const value = String(step.vorauswahl[key] || '').trim();
            if (value) vorauswahl[key] = value;
        });
        if (Object.keys(vorauswahl).length > 0) normalized.vorauswahl = vorauswahl;
    }
    if (step?.optional === true) normalized.optional = true;
    if (step?.motorleitung === true) normalized.motorleitung = true;
    if (step?.mengenfeld?.aktiv) {
        normalized.mengenfeld = {
            aktiv: true,
            label: String(step.mengenfeld.label || 'Anzahl').trim()
        };
    }
    return normalized;
}


/**
 * Validiert die Wizard-Schritte.
 * @param {object[]} steps
 * @returns {{ ok: boolean, message?: string, steps?: object[] }}
 */
export function validateWizardSteps(steps) {
    if (!Array.isArray(steps) || steps.length === 0) {
        return { ok: false, message: 'Bitte mindestens eine Frage angeben.' };
    }
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step?.id || !step?.gruppe || !step?.frage) {
            return { ok: false, message: `Frage ${i + 1}: id, gruppe und frage sind Pflichtfelder.` };
        }
    }
    const ids = steps.map(s => s.id);
    if (new Set(ids).size !== ids.length) {
        return { ok: false, message: 'Frage-IDs müssen eindeutig sein.' };
    }
    return { ok: true, steps: steps.map(normalizeWizardStep) };
}
