/**
 * @file gruppen-config.js – Vorgaben je Schaltplan-Gruppe für den Gruppen-Konfigurator.
 *
 * Presets sind reine Startwerte für eine neue Leitungskarte. Jede Karte bleibt danach
 * frei änderbar, die Presets sparen nur die immer gleichen Klicks.
 */
import { appState } from './state.js';
import { bauteilPasstZuGruppe } from './catalog.js';
import {
    getCustomLeitungPreset,
    getCustomPresetIdsForGruppe
} from './gruppen-preset-store.js';

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
    'beckhoff-motorleitung': {
        label: 'Beckhoff Motorleitung',
        bezeichnung: 'Beckhoff Motorleitung',
        kategorie: 'motor',
        hersteller: 'Beckhoff',
        festLeitungstyp: true
    },
    'zuleitung': {
        label: 'Zuleitung',
        bezeichnung: 'Zuleitung',
        kategorie: 'oelflex',
        hersteller: 'Lapp Kabel',
        festLeitungstyp: true,
        artikelWhitelist: ['OELFLEX110-5G25', 'OELFLEX110-4G25', '0021810']
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
    },
    'erdungsleitung': {
        label: 'Erdungsleitung 1×95 mm²',
        kategorie: 'oelflex', hersteller: 'Schaeffler',
        steckerA: 'offen', steckerB: 'offen',
        artikelnummer: '4521005'
    },
    'bremse-geoeffnet': {
        label: 'Bremse geöffnet',
        bezeichnung: 'Bremse geöffnet',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M8 3-polig Stecker', ausrichtungA: 'gerade',
        steckerB: 'M8 3-polig Buchse', ausrichtungB: 'gerade',
        artikelPrefix: 'ZK2000-2122',
        artikelnummer: 'ZK2000-2122-0015',
        laenge: 1.5
    },
    'sensorleitung-ventil': {
        label: 'Sensorleitung Ventil',
        bezeichnung: 'Sensorleitung Ventil',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M12 5-polig Stecker', ausrichtungA: 'gerade',
        steckerB: 'M8 3-polig Buchse', ausrichtungB: 'gerade',
        artikelPrefix: 'ZK2000-7122',
        artikelnummer: 'ZK2000-7122-0010',
        laenge: 1
    },
    'ventilstecker-bremse': {
        label: 'Ventilstecker Bremse',
        bezeichnung: 'Ventilstecker Bremse',
        kategorie: 'sensor', hersteller: 'Murr Elektronik',
        steckerA: 'M12 4-polig Stecker', ausrichtungA: 'gerade',
        steckerB: 'Ventilstecker DIN C',
        artikelPrefix: '7000-41081-636',
        artikelnummer: '7000-41081-6360100',
        laenge: 1
    },
    'powerleitung-mts': {
        label: 'Powerleitung MTS',
        bezeichnung: 'Powerleitung MTS',
        kategorie: 'power', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'offen',
        artikelPrefix: 'ZK2020-3200',
        artikelnummer: 'ZK2020-3200-0100',
        laenge: 10
    },
    'sensorleitung-eaton-taster': {
        label: 'Sensorleitung Eaton Taster',
        bezeichnung: 'Sensorleitung Eaton Taster',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M12 4-polig Buchse', ausrichtungA: 'gerade',
        steckerB: 'offen',
        artikelPrefix: 'ZK2000-6200',
        artikelnummer: 'ZK2000-6200-0100',
        laenge: 10
    },
    'sensorleitung-not-halt-taster': {
        label: 'Sensorleitung Not-Halt Taster',
        bezeichnung: 'Sensorleitung Not-Halt Taster',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M12 4-polig Buchse', ausrichtungA: 'gerade',
        steckerB: 'offen',
        artikelPrefix: 'ZK2000-6200',
        artikelnummer: 'ZK2000-6200-0100',
        laenge: 10
    },
    'sensorleitung-lampe': {
        label: 'Sensorleitung Lampe',
        bezeichnung: 'Sensorleitung Lampe',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M12 4-polig Buchse', ausrichtungA: 'gerade',
        steckerB: 'offen',
        artikelPrefix: 'ZK2000-6200',
        artikelnummer: 'ZK2000-6200-0100',
        laenge: 10
    },
    'sensorleitung-stoessel': {
        label: 'Sensorleitung Stößel',
        bezeichnung: 'Sensorleitung Stößel',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M12 4-polig Stecker', ausrichtungA: 'gerade',
        steckerB: 'M12 4-polig Buchse', ausrichtungB: 'gewinkelt',
        artikelPrefix: 'ZK2000-6164',
        artikelnummer: 'ZK2000-6164-0020',
        laenge: 2
    },
    'sensorleitung-tisch': {
        label: 'Sensorleitung Tisch',
        bezeichnung: 'Sensorleitung Tisch',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M12 4-polig Buchse', ausrichtungA: 'gewinkelt',
        steckerB: 'offen',
        artikelPrefix: 'ZK2000-6400',
        artikelnummer: 'ZK2000-6400-0100',
        laenge: 10
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
        hinweis: 'Einspeisung – hier wird nur die Erdungsleitung erfasst (z. B. Schaeffler 4521005, 1×95 mm²).',
        leitungen: ['erdungsleitung'],
        ohneUniversal: true,
        nurLeitungen: true
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
        ],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=005': {
        hinweis: 'IPC und Panel als Bauteile erfassen, dazu CP-Link-Leitung und Phoenix-Leitung 17-adrig.',
        leitungen: ['cplink', 'phoenix-17'],
        bauteile: ['ipc', 'panel'],
        ohneUniversal: true,
        nurFestgelegteBauteile: true
    },
    '=006': {
        hinweis: 'SPS-Aufbau im Schaltschrank.',
        leitungen: ['ethercat-m8-m8', 'ethercat-m8-rj45', 'power-m8-m8']
    },
    '=007': {
        hinweis: 'Sicherheitstechnik: Türschalter, Zweihandpult, Fußtaster und Lichtschranke. Fehlt ein Typ im Katalog, direkt beim Anlegen neu erstellen.',
        leitungen: ['sensor-m8-m8', 'sensor-m8-offen', 'sensor-m12-m12', 'sensor-m12-offen', 'oelflex'],
        bauteile: ['tuerschalter', 'zweihand', 'fusstaster', 'lichtschranke'],
        nurFestgelegteBauteile: true
    },
    '=011': {
        hinweis: 'Spindel 1 Bremse: drei Leitungen erfassen – Bremse geöffnet, Sensorleitung Ventil und Ventilstecker Bremse. Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['bremse-geoeffnet', 'sensorleitung-ventil', 'ventilstecker-bremse'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=021': {
        hinweis: 'Spindel 2 Bremse: drei Leitungen erfassen – Bremse geöffnet, Sensorleitung Ventil und Ventilstecker Bremse. Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['bremse-geoeffnet', 'sensorleitung-ventil', 'ventilstecker-bremse'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=031': {
        hinweis: 'Spindel 3 Bremse: drei Leitungen erfassen – Bremse geöffnet, Sensorleitung Ventil und Ventilstecker Bremse. Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['bremse-geoeffnet', 'sensorleitung-ventil', 'ventilstecker-bremse'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=041': {
        hinweis: 'Spindel 4 Bremse: drei Leitungen erfassen – Bremse geöffnet, Sensorleitung Ventil und Ventilstecker Bremse. Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['bremse-geoeffnet', 'sensorleitung-ventil', 'ventilstecker-bremse'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=012': {
        hinweis: 'Spindel 1 Linearmaßstab: Powerleitung MTS erfassen (ZK2020-3200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['powerleitung-mts'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=022': {
        hinweis: 'Spindel 2 Linearmaßstab: Powerleitung MTS erfassen (ZK2020-3200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['powerleitung-mts'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=032': {
        hinweis: 'Spindel 3 Linearmaßstab: Powerleitung MTS erfassen (ZK2020-3200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['powerleitung-mts'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=042': {
        hinweis: 'Spindel 4 Linearmaßstab: Powerleitung MTS erfassen (ZK2020-3200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['powerleitung-mts'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=013': {
        hinweis: 'Spindel 1 Drucksensoren: DMS-Sensor (Typ DZ1) erfassen – Länge 2 m, 4 m oder 6 m wählen.',
        bauteile: ['dms'],
        nurBauteile: true,
        nurFestgelegteBauteile: true,
        bauteilLaengen: [2, 4, 6],
        bauteilStandardLaenge: 2
    },
    '=023': {
        hinweis: 'Spindel 2 Drucksensoren: DMS-Sensor (Typ DZ1) erfassen – Länge 2 m, 4 m oder 6 m wählen.',
        bauteile: ['dms'],
        nurBauteile: true,
        nurFestgelegteBauteile: true,
        bauteilLaengen: [2, 4, 6],
        bauteilStandardLaenge: 2
    },
    '=033': {
        hinweis: 'Spindel 3 Drucksensoren: DMS-Sensor (Typ DZ1) erfassen – Länge 2 m, 4 m oder 6 m wählen.',
        bauteile: ['dms'],
        nurBauteile: true,
        nurFestgelegteBauteile: true,
        bauteilLaengen: [2, 4, 6],
        bauteilStandardLaenge: 2
    },
    '=043': {
        hinweis: 'Spindel 4 Drucksensoren: DMS-Sensor (Typ DZ1) erfassen – Länge 2 m, 4 m oder 6 m wählen.',
        bauteile: ['dms'],
        nurBauteile: true,
        nurFestgelegteBauteile: true,
        bauteilLaengen: [2, 4, 6],
        bauteilStandardLaenge: 2
    },
    '=014': {
        hinweis: 'Spindel 1 Temperatursensoren: Sensorleitung Stößel und Sensorleitung Tisch erfassen. Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-stoessel', 'sensorleitung-tisch'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=015': {
        hinweis: 'Spindel 1 Zusatzbedienung: Sensorleitung Eaton Taster und Sensorleitung Not-Halt Taster erfassen (ZK2000-6200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-eaton-taster', 'sensorleitung-not-halt-taster'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=024': {
        hinweis: 'Spindel 2 Temperatursensoren: Sensorleitung Stößel und Sensorleitung Tisch erfassen. Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-stoessel', 'sensorleitung-tisch'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=025': {
        hinweis: 'Spindel 2 Zusatzbedienung: Sensorleitung Eaton Taster und Sensorleitung Not-Halt Taster erfassen (ZK2000-6200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-eaton-taster', 'sensorleitung-not-halt-taster'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=034': {
        hinweis: 'Spindel 3 Temperatursensoren: Sensorleitung Stößel und Sensorleitung Tisch erfassen. Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-stoessel', 'sensorleitung-tisch'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=035': {
        hinweis: 'Spindel 3 Zusatzbedienung: Sensorleitung Eaton Taster und Sensorleitung Not-Halt Taster erfassen (ZK2000-6200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-eaton-taster', 'sensorleitung-not-halt-taster'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=044': {
        hinweis: 'Spindel 4 Temperatursensoren: Sensorleitung Stößel und Sensorleitung Tisch erfassen. Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-stoessel', 'sensorleitung-tisch'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=045': {
        hinweis: 'Spindel 4 Zusatzbedienung: Sensorleitung Eaton Taster und Sensorleitung Not-Halt Taster erfassen (ZK2000-6200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-eaton-taster', 'sensorleitung-not-halt-taster'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=016': {
        hinweis: 'Spindel 1 Beleuchtung: Sensorleitung Lampe erfassen (ZK2000-6200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-lampe'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=026': {
        hinweis: 'Spindel 2 Beleuchtung: Sensorleitung Lampe erfassen (ZK2000-6200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-lampe'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=036': {
        hinweis: 'Spindel 3 Beleuchtung: Sensorleitung Lampe erfassen (ZK2000-6200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-lampe'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=046': {
        hinweis: 'Spindel 4 Beleuchtung: Sensorleitung Lampe erfassen (ZK2000-6200). Nach dem Anlegen nur noch die Länge wählen.',
        leitungen: ['sensorleitung-lampe'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=100': {
        hinweis: 'Vorschub: Beckhoff Motorleitung erfassen. Typ und Länge wählen.',
        leitungen: ['beckhoff-motorleitung'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=200': {
        hinweis: 'Kühlung: Zuleitung erfassen – Ölflex 5G2,5, 4G2,5 oder 4G1,5 wählen und Länge eingeben.',
        leitungen: ['zuleitung'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=009': {
        hinweis: 'Regleraufbau – nur Bauteile: Netzwechselrichter, Kapazitätsmodul, Drossel, Filter, Ringkerne und SAF-Modul.',
        bauteile: ['netzwechselrichter', 'kapazitaetsmodul', 'drossel', 'filter', 'ringkern', 'saf-modul'],
        nurBauteile: true,
        nurFestgelegteBauteile: true
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
    const custom = getCustomLeitungPreset(presetId);
    if (custom) return custom;
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
    if (!presetIds && !fest.nurBauteile) {
        const regel = BEZEICHNUNG_REGELN.find(r => r.test.test(bezeichnung));
        presetIds = regel ? regel.leitungen : FALLBACK_LEITUNGEN;
    }
    if (fest.nurBauteile) presetIds = [];

    const alleIds = fest.ohneUniversal || fest.nurFestgelegteLeitungen
        ? (presetIds || [])
        : Array.from(new Set([...(presetIds || []), ...UNIVERSAL_PRESETS]));

    let bauteilTypen;
    if (fest.nurFestgelegteBauteile || fest.nurBauteile || fest.nurLeitungen) {
        bauteilTypen = fest.bauteile || [];
    } else {
        bauteilTypen = Array.from(new Set([
            ...(fest.bauteile || []),
            ...getBauteilTypenAusKatalog(code)
        ]));
    }

    const customIds = getCustomPresetIdsForGruppe(code);
    const presetMap = new Map();
    [...alleIds, ...customIds].forEach(id => {
        const preset = getLeitungPreset(id);
        if (preset) presetMap.set(preset.id, preset);
    });

    return {
        hinweis: fest.hinweis || '',
        leitungPresets: Array.from(presetMap.values()),
        bauteilTypen,
        bauteilLaengen: fest.bauteilLaengen || [],
        bauteilStandardLaenge: fest.bauteilStandardLaenge,
        nurLeitungen: Boolean(fest.nurLeitungen),
        nurBauteile: Boolean(fest.nurBauteile),
        nurFestgelegteBauteile: Boolean(fest.nurFestgelegteBauteile)
    };
}
