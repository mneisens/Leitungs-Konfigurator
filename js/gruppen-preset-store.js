/**
 * @file gruppen-preset-store.js – Benutzerdefinierte Leitungs-Buttons (Presets) pro Gruppe.
 *
 * Gespeichert global in Firestore (config/gruppenPresets) oder localStorage,
 * damit alle Nutzer dieselben Gruppen-Buttons sehen.
 */
import { appState } from './state.js';
import {
    getGruppenPresetsFromFirestore,
    persistGruppenPresetsToFirestore
} from './firebase.js';
import { generateId } from './utils.js';
import { deriveArtikelPrefix, istMeterwareKategorie, splitSteckerAngabe } from './leitung-optionen.js';

export const LOCAL_GRUPPEN_PRESETS_KEY = 'leitungskonfigurator_gruppen_presets';


/**
 * @returns {boolean}
 */
function nutztFirestore() {
    return Boolean(appState.firebaseReady && appState.currentUser);
}


/**
 * @returns {{ presets: Record<string, object>, gruppen: Record<string, string[]> }}
 */
export function getEmptyGruppenPresetConfig() {
    return { presets: {}, gruppen: {} };
}


/**
 * @returns {{ presets: Record<string, object>, gruppen: Record<string, string[]> }}
 */
export function getGruppenPresetConfig() {
    if (!appState.gruppenPresetConfig) {
        appState.gruppenPresetConfig = getEmptyGruppenPresetConfig();
    }
    return appState.gruppenPresetConfig;
}


/**
 * @param {{ presets: Record<string, object>, gruppen: Record<string, string[]> }} config
 * @returns {void}
 */
export function setGruppenPresetConfig(config) {
    appState.gruppenPresetConfig = {
        presets: config?.presets && typeof config.presets === 'object' ? config.presets : {},
        gruppen: config?.gruppen && typeof config.gruppen === 'object' ? config.gruppen : {}
    };
}


/**
 * @returns {Promise<void>}
 */
export async function loadGruppenPresets() {
    try {
        if (nutztFirestore()) {
            const config = await getGruppenPresetsFromFirestore();
            setGruppenPresetConfig(config);
            return;
        }
        const raw = localStorage.getItem(LOCAL_GRUPPEN_PRESETS_KEY);
        if (!raw) {
            setGruppenPresetConfig(getEmptyGruppenPresetConfig());
            return;
        }
        setGruppenPresetConfig(JSON.parse(raw));
    } catch (error) {
        console.error('Gruppen-Presets konnten nicht geladen werden:', error);
        setGruppenPresetConfig(getEmptyGruppenPresetConfig());
    }
}


/**
 * @returns {Promise<void>}
 */
export async function saveGruppenPresets() {
    const config = getGruppenPresetConfig();
    if (nutztFirestore()) {
        await persistGruppenPresetsToFirestore(config);
    } else {
        localStorage.setItem(LOCAL_GRUPPEN_PRESETS_KEY, JSON.stringify(config));
    }
}


/**
 * @param {string} gruppenCode
 * @returns {string[]}
 */
export function getCustomPresetIdsForGruppe(gruppenCode) {
    const code = gruppenCode || '';
    const ids = getGruppenPresetConfig().gruppen[code];
    return Array.isArray(ids) ? ids.slice() : [];
}


/**
 * @param {string} presetId
 * @returns {object|null}
 */
export function getCustomLeitungPreset(presetId) {
    if (!presetId) return null;
    const preset = getGruppenPresetConfig().presets[presetId];
    if (!preset) return null;
    return { id: presetId, ...preset };
}


/**
 * Bereinigt Preset-Daten vor dem Speichern.
 * @param {object} data
 * @returns {object}
 */
export function normalizePresetData(data) {
    const preset = {
        label: (data.label || '').trim(),
        bezeichnung: (data.bezeichnung || data.label || '').trim(),
        kategorie: (data.kategorie || '').trim(),
        hersteller: (data.hersteller || '').trim(),
        custom: true
    };

    if (data.festLeitungstyp) preset.festLeitungstyp = true;
    if (data.artikelPrefix) preset.artikelPrefix = data.artikelPrefix.trim();
    if (data.artikelnummer) preset.artikelnummer = data.artikelnummer.trim();
    if (data.laenge > 0) preset.laenge = Number(data.laenge);
    if (Array.isArray(data.artikelWhitelist) && data.artikelWhitelist.length) {
        preset.artikelWhitelist = data.artikelWhitelist.slice();
    }
    if (data.steckerA) preset.steckerA = data.steckerA;
    if (data.steckerB) preset.steckerB = data.steckerB;
    if (data.ausrichtungA) preset.ausrichtungA = data.ausrichtungA;
    if (data.ausrichtungB) preset.ausrichtungB = data.ausrichtungB;
    if (data.vorgabeTyp) preset.vorgabeTyp = data.vorgabeTyp;

    return preset;
}


/**
 * @param {string} gruppenCode
 * @param {object} data
 * @returns {Promise<string>}
 */
export async function addCustomGruppenPreset(gruppenCode, data) {
    const code = gruppenCode || '';
    const preset = normalizePresetData(data);
    if (!preset.label) throw new Error('Button-Name fehlt.');
    if (!preset.kategorie) throw new Error('Leitungstyp fehlt.');

    const id = generateId('btn');
    const config = getGruppenPresetConfig();
    config.presets[id] = preset;
    if (!Array.isArray(config.gruppen[code])) config.gruppen[code] = [];
    if (!config.gruppen[code].includes(id)) config.gruppen[code].push(id);

    await saveGruppenPresets();
    return id;
}


/**
 * @param {string} presetId
 * @returns {Promise<void>}
 */
export async function deleteCustomGruppenPreset(presetId) {
    if (!presetId) return;
    const config = getGruppenPresetConfig();
    delete config.presets[presetId];
    Object.keys(config.gruppen).forEach(code => {
        config.gruppen[code] = (config.gruppen[code] || []).filter(id => id !== presetId);
    });
    await saveGruppenPresets();
}


/**
 * @param {string} stecker
 * @returns {{ basis: string, ausrichtung: string }}
 */
function splitStecker(stecker) {
    return splitSteckerAngabe(stecker);
}


/**
 * @param {object} leitung
 * @param {string} label
 * @returns {object}
 */
export function presetFromLeitung(leitung, label) {
    const preset = {
        label: (label || leitung.bezeichnung || 'Eigener Button').trim(),
        bezeichnung: (leitung.bezeichnung || label || '').trim(),
        kategorie: leitung.kategorie || '',
        hersteller: leitung.hersteller || '',
        custom: true
    };

    if (leitung.artikelPrefix) {
        preset.vorgabeTyp = 'katalog';
        preset.artikelPrefix = leitung.artikelPrefix;
        preset.artikelnummer = leitung.artikelnummer || '';
        if (leitung.laenge) preset.laenge = leitung.laenge;
        const a = splitStecker(leitung.steckerA);
        const b = splitStecker(leitung.steckerB);
        if (a.basis) {
            preset.steckerA = a.basis;
            preset.ausrichtungA = a.ausrichtung;
        }
        if (b.basis) {
            preset.steckerB = b.basis;
            preset.ausrichtungB = b.ausrichtung;
        }
    } else if (leitung.artikelnummer && !istMeterwareKategorie(leitung.kategorie)) {
        preset.vorgabeTyp = 'katalog';
        preset.artikelnummer = leitung.artikelnummer;
        preset.artikelPrefix = deriveArtikelPrefix(leitung.artikelnummer);
        if (leitung.laenge) preset.laenge = leitung.laenge;
        const a = splitStecker(leitung.steckerA);
        const b = splitStecker(leitung.steckerB);
        if (a.basis) {
            preset.steckerA = a.basis;
            preset.ausrichtungA = a.ausrichtung;
        }
        if (b.basis) {
            preset.steckerB = b.basis;
            preset.ausrichtungB = b.ausrichtung;
        }
    } else if (
        leitung.festLeitungstyp
        || leitung.artikelWhitelist?.length
        || istMeterwareKategorie(leitung.kategorie)
    ) {
        preset.vorgabeTyp = 'meterware';
        preset.festLeitungstyp = true;
        if (leitung.artikelWhitelist?.length) preset.artikelWhitelist = leitung.artikelWhitelist.slice();
        if (leitung.artikelnummer) preset.artikelnummer = leitung.artikelnummer;
    } else if (leitung.steckerA || leitung.steckerB) {
        preset.vorgabeTyp = 'stecker';
        const a = splitStecker(leitung.steckerA);
        const b = splitStecker(leitung.steckerB);
        if (a.basis) {
            preset.steckerA = a.basis;
            preset.ausrichtungA = a.ausrichtung;
        }
        if (b.basis) {
            preset.steckerB = b.basis;
            preset.ausrichtungB = b.ausrichtung;
        }
        if (leitung.laenge) preset.laenge = leitung.laenge;
        if (leitung.artikelnummer) preset.artikelnummer = leitung.artikelnummer;
    } else {
        preset.vorgabeTyp = 'basic';
    }

    return preset;
}
