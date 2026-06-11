/**
 * @file konfigurator.js – Re-Exports für den Einstiegspunkt.
 */
import { showView } from './navigation.js';
import { saveCurrentLeitung, handleLeaveKonfigurator } from './konfigurator-stecker.js';
import { assertCanEdit } from './project-access.js';

export { saveLeitung, prevLeitung, nextLeitung, addNewLeitung } from './konfigurator-stecker.js';
export { onKategorieFilterChange, onHerstellerChange, onSteckerChange, onLaengeChange } from './konfigurator-core.js';
export { toggleAusrichtung } from './konfigurator-form.js';

/**
 * Verlässt den Konfigurator Richtung Übersicht (leere Leitungen werden verworfen).
 * @returns {void}
 */
export function backToOverview() {
    handleLeaveKonfigurator();
    showView('uebersicht');
}

/**
 * Speichert die aktuelle Leitung und wechselt zur Übersicht.
 * @returns {void}
 */
export function saveLeitungAndNotify() {
    if (!assertCanEdit('Leitungen')) return;
    saveCurrentLeitung();
    showView('uebersicht');
}
