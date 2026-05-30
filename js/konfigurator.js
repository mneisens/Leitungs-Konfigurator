/**
 * @file konfigurator.js – Re-Exports.
 */
import { showView } from './navigation.js';
import { saveCurrentLeitung } from './konfigurator-stecker.js';

export { initKonfigurator, populateGruppenDropdown, renderKonfigGruppenliste, onKategorieFilterChange, onHerstellerChange, onSteckerChange, loadLaengen, onLaengeChange, updateArtikelVorschlag, renderLeitungForm } from './konfigurator-core.js';
export { clearLeitungForm, saveCurrentLeitung, saveLeitung, prevLeitung, nextLeitung, addNewLeitung, getBaseSteckerTyp, hasAusrichtung, getAusrichtung, setAusrichtung } from './konfigurator-stecker.js';
export { toggleAusrichtung, getFullSteckerTyp, isSteckerErlaubtFuerKategorie, getUniqueSteckerA, getUniqueSteckerB, getAvailableLaengen, findArtikel, populateHerstellerDropdown, getArtikelForHersteller, populateKategorieDropdown } from './konfigurator-form.js';

/**
 * Speichert Leitung und kehrt zur Übersicht zurück.
 * @returns {void}
 */
export function backToOverview() {
    saveCurrentLeitung();
    showView('uebersicht');
}

/**
 * Speichert Leitung und zeigt Übersicht.
 * @returns {void}
 */
export function saveLeitungAndNotify() {
    saveCurrentLeitung();
    showView('uebersicht');
}
