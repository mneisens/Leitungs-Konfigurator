/**
 * @file gruppen-config.js – Vorgaben je Schaltplan-Gruppe für den Gruppen-Konfigurator.
 *
 * Presets sind reine Startwerte für eine neue Leitungskarte. Jede Karte bleibt danach
 * frei änderbar, die Presets sparen nur die immer gleichen Klicks.
 */
import { appState } from './state.js';
import { bauteilPasstZuGruppe } from './catalog.js';

/**
 * Wiederverwendbare Startwerte für Leitungskarten.
 * @type {Record<string, object>}
 */
const LEITUNG_PRESETS = {
    'ethercat-m8-m8': {
        label: 'EtherCAT M8 gerade → M8 gerade',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'M8 4-polig', ausrichtungB: 'gerade'
    },
    'ethercat-m8-m8-gew': {
        label: 'EtherCAT M8 gerade → M8 gewinkelt',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'M8 4-polig', ausrichtungB: 'gewinkelt'
    },
    'ethercat-m8-m12': {
        label: 'EtherCAT M8 gerade → M12 gerade',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'M12 4-polig', ausrichtungB: 'gerade'
    },
    'ethercat-m12-m12': {
        label: 'EtherCAT M12 gerade → M12 gerade',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M12 4-polig', ausrichtungA: 'gerade',
        steckerB: 'M12 4-polig', ausrichtungB: 'gerade'
    },
    'ethercat-m8-rj45': {
        label: 'EtherCAT M8 gerade → RJ45',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'RJ45'
    },
    'ethercat-rj45-rj45': {
        label: 'EtherCAT RJ45 → RJ45',
        kategorie: 'ethercat', hersteller: 'Phoenix Contact',
        steckerA: 'RJ45', steckerB: 'RJ45'
    },
    'power-m8-m8': {
        label: 'Power M8 gerade → M8 gerade',
        kategorie: 'power', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'M8 4-polig', ausrichtungB: 'gerade'
    },
    'power-m8-offen': {
        label: 'Power M8 gerade → offen',
        kategorie: 'power', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'offen'
    },
    'sensor-m8-m8': {
        label: 'Sensor M8 Stecker → M8 Buchse',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M8 3-polig Stecker', ausrichtungA: 'gerade',
        steckerB: 'M8 3-polig Buchse', ausrichtungB: 'gerade'
    },
    'sensor-m8-offen': {
        label: 'Sensor M8 Buchse → offen',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M8 3-polig Buchse', ausrichtungA: 'gerade',
        steckerB: 'offen'
    },
    'sensor-m12-m12': {
        label: 'Sensor M12 Stecker → M12 Buchse',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M12 4-polig Stecker', ausrichtungA: 'gerade',
        steckerB: 'M12 4-polig Buchse', ausrichtungB: 'gerade'
    },
    'sensor-m12-offen': {
        label: 'Sensor M12 Buchse → offen',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M12 4-polig Buchse', ausrichtungA: 'gerade',
        steckerB: 'offen'
    },
    'oelflex': {
        label: 'Ölflexleitung',
        kategorie: 'oelflex', hersteller: 'Lapp Kabel'
    },
    'motorleitung': {
        label: 'Motorleitung',
        kategorie: 'motor', hersteller: 'Lapp Kabel'
    },
    'geberleitung': {
        label: 'Geberleitung',
        kategorie: 'geber', hersteller: 'IGUS'
    },
    'cplink': {
        label: 'CP-Link Leitung',
        kategorie: 'cplink', hersteller: 'Beckhoff',
        steckerA: 'RJ45', steckerB: 'RJ45 IP65'
    },
    'phoenix-17': {
        label: 'Phoenix Leitung 17-adrig',
        kategorie: 'sonstiges', hersteller: 'Phoenix Contact',
        steckerA: 'offen', steckerB: 'offen',
        artikelnummer: 'PHOENIX-17ADRIG'
    }
};

/** Presets, die in jeder Gruppe zusätzlich angeboten werden. */
const UNIVERSAL_PRESETS = ['oelflex'];

/**
 * Feste Vorgaben für einzelne Gruppen.
 * @type {Record<string, {hinweis?: string, leitungen?: string[], bauteile?: string[]}>}
 */
const GRUPPEN = {
    '=000': {
        hinweis: 'Einspeisung – meist nur Zuleitung und Querschnitt festhalten.',
        leitungen: ['oelflex']
    },
    '=001': {
        hinweis: 'Hier ist in der Regel nichts anzugeben. Nur ausfüllen, wenn es Abweichungen gibt.',
        leitungen: ['oelflex', 'power-m8-offen']
    },
    '=004': {
        hinweis: 'Alle EtherCAT-Leitungen der Bustopologie erfassen. Bei jeder Leitung im Feld „Verwendung“ notieren, wofür sie ist.',
        leitungen: [
            'ethercat-m8-m8',
            'ethercat-m8-m8-gew',
            'ethercat-m8-m12',
            'ethercat-m12-m12',
            'ethercat-m8-rj45',
            'ethercat-rj45-rj45'
        ]
    },
    '=005': {
        hinweis: 'IPC und Panel als Bauteile erfassen, dazu CP-Link- und Phoenix-Leitung.',
        leitungen: ['cplink', 'phoenix-17', 'ethercat-m8-rj45'],
        bauteile: ['ipc', 'panel']
    },
    '=006': {
        hinweis: 'SPS-Aufbau im Schaltschrank.',
        leitungen: ['ethercat-m8-m8', 'ethercat-m8-rj45', 'power-m8-m8']
    },
    '=007': {
        hinweis: 'Sicherheitstechnik: Türschalter, Zweihandpult, Fußtaster, Lichtschranke und weitere Bauteile. Als Leitungen kommen Sensor- und Ölflexleitungen zum Einsatz.',
        leitungen: ['sensor-m8-m8', 'sensor-m8-offen', 'sensor-m12-m12', 'sensor-m12-offen', 'oelflex'],
        bauteile: ['tuerschalter', 'zweihand', 'fusstaster', 'lichtschranke', 'nothalt-taster']
    },
    '=009': {
        hinweis: 'Regleraufbau inklusive Netzteil, Drosseln und Filter.',
        leitungen: ['motorleitung', 'geberleitung', 'oelflex']
    },
    '=110': {
        hinweis: 'Schnittstelle zur externen Peripherie.',
        leitungen: ['ethercat-m8-m8', 'oelflex']
    },
    '=301': {
        hinweis: 'EtherCAT-Module am Stößel.',
        leitungen: ['ethercat-m8-m8', 'ethercat-m8-m12', 'power-m8-m8']
    },
    '=401': {
        hinweis: 'Buskasten Bedienseite.',
        leitungen: ['ethercat-m8-m8', 'power-m8-m8', 'sensor-m8-m8']
    },
    '=402': {
        hinweis: 'Buskasten Rückseite.',
        leitungen: ['ethercat-m8-m8', 'power-m8-m8', 'sensor-m8-m8']
    }
};

/**
 * Regeln für die vielen gleich aufgebauten Spindel-Gruppen (=010 bis =046).
 * @type {Array<{test: RegExp, leitungen: string[]}>}
 */
const BEZEICHNUNG_REGELN = [
    { test: /antrieb/i, leitungen: ['motorleitung', 'geberleitung', 'oelflex'] },
    { test: /bremse/i, leitungen: ['sensor-m8-offen', 'oelflex'] },
    { test: /linearma|maßstab|massstab/i, leitungen: ['sensor-m12-offen', 'ethercat-m8-m12'] },
    { test: /drucksensor|drucküberwachung|druckluft/i, leitungen: ['sensor-m12-offen', 'sensor-m8-offen'] },
    { test: /temperatursensor/i, leitungen: ['sensor-m12-offen'] },
    { test: /zusatzbedienung|joystick|bedien/i, leitungen: ['sensor-m12-offen', 'ethercat-m8-m8', 'oelflex'] },
    { test: /beleuchtung/i, leitungen: ['sensor-m12-offen', 'oelflex'] },
    { test: /netzwerk|bus/i, leitungen: ['ethercat-m8-m8', 'ethercat-m8-m12'] },
    { test: /kühlung|schmierung|beölung|band|tür|werkzeug|hubleisten/i, leitungen: ['sensor-m12-offen', 'oelflex'] },
    { test: /steckdose|einspeisung|spannungsversorgung/i, leitungen: ['oelflex', 'power-m8-offen'] }
];

/** Standard-Presets, wenn keine Regel greift. */
const FALLBACK_LEITUNGEN = ['ethercat-m8-m8', 'sensor-m8-offen', 'power-m8-offen', 'oelflex'];


/**
 * @param {string} presetId
 * @returns {object|null}
 */
export function getLeitungPreset(presetId) {
    const preset = LEITUNG_PRESETS[presetId];
    return preset ? { id: presetId, ...preset } : null;
}


/**
 * Bauteiltypen, die laut Bauteilkatalog zu dieser Gruppe gehören.
 * @param {string} gruppenCode
 * @returns {string[]}
 */
function getBauteilTypenAusKatalog(gruppenCode) {
    const typen = new Set();
    (appState.bauteileKatalog?.artikel || []).forEach(artikel => {
        if (artikel.typ && bauteilPasstZuGruppe(artikel, gruppenCode)) {
            typen.add(artikel.typ);
        }
    });
    return Array.from(typen);
}


/**
 * Liefert Hinweistext, Leitungs-Presets und Bauteiltypen einer Gruppe.
 * @param {object} gruppe - Eintrag aus data/gruppen.json.
 * @returns {{hinweis: string, leitungPresets: object[], bauteilTypen: string[]}}
 */
export function getGruppenVorgaben(gruppe) {
    const code = gruppe?.code || '';
    const bezeichnung = gruppe?.bezeichnung || '';
    const fest = GRUPPEN[code] || {};

    let presetIds = fest.leitungen;
    if (!presetIds) {
        const regel = BEZEICHNUNG_REGELN.find(r => r.test.test(bezeichnung));
        presetIds = regel ? regel.leitungen : FALLBACK_LEITUNGEN;
    }

    const alleIds = Array.from(new Set([...presetIds, ...UNIVERSAL_PRESETS]));
    const bauteilTypen = Array.from(new Set([
        ...(fest.bauteile || []),
        ...getBauteilTypenAusKatalog(code)
    ]));

    return {
        hinweis: fest.hinweis || '',
        leitungPresets: alleIds.map(getLeitungPreset).filter(Boolean),
        bauteilTypen
    };
}
