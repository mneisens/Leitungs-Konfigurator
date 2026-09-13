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
    'motorleitung-spindel-servo719': {
        label: 'Motorleitung ÖLFLEX SERVO 719',
        bezeichnung: 'Motorleitung ÖLFLEX SERVO 719 CY 4G35',
        kategorie: 'motor',
        hersteller: 'Lapp Kabel',
        festLeitungstyp: true,
        artikelWhitelist: ['1020033']
    },
    'motorleitung-vorschub-zk4500': {
        label: 'Beckhoff Motorleitung ZK4500-8022',
        bezeichnung: 'Beckhoff Motorleitung Vorschub',
        kategorie: 'motor',
        hersteller: 'Beckhoff',
        artikelPrefix: 'ZK4500-8022',
        artikelnummer: 'ZK4500-8022-0150',
        laenge: 15
    },
    'beckhoff-motorleitung': {
        label: 'Beckhoff Motorleitung',
        bezeichnung: 'Beckhoff Motorleitung',
        kategorie: 'motor',
        hersteller: 'Beckhoff',
        festLeitungstyp: true,
        artikelWhitelist: ['ZK4500-8022', 'ZK4500-8003']
    },
    'zuleitung': {
        label: 'Zuleitung',
        bezeichnung: 'Zuleitung',
        kategorie: 'oelflex',
        hersteller: 'Lapp Kabel',
        festLeitungstyp: true,
        artikelWhitelist: ['OELFLEX110-5G25', 'OELFLEX110-4G25', '0021810']
    },
    'oelflex-buskasten': {
        label: 'Ölflexleitung Buskasten',
        bezeichnung: 'Ölflexleitung',
        kategorie: 'oelflex',
        hersteller: 'Lapp Kabel',
        festLeitungstyp: true,
        artikelWhitelist: ['OELFLEX110-12G25', 'OELFLEX110-18G25']
    },
    'oelflex-extern': {
        label: 'Ölflexleitung Extern',
        bezeichnung: 'Ölflexleitung 25G1,5',
        kategorie: 'oelflex',
        hersteller: 'Lapp Kabel',
        festLeitungstyp: true,
        artikelWhitelist: ['OELFLEX110-25G15']
    },
    'oelflex-extern-netzwerk': {
        label: 'Ölflexleitung Extern/Netzwerk',
        bezeichnung: 'Ölflexleitung',
        kategorie: 'oelflex',
        hersteller: 'Lapp Kabel',
        festLeitungstyp: true,
        artikelWhitelist: ['OELFLEX110-5G16', 'OELFLEX110-25G15', 'OELFLEX110-3G15']
    },
    'oelflex-kuehlung': {
        label: 'Ölflexleitung Kühlung',
        bezeichnung: 'Ölflexleitung 4G1,5',
        kategorie: 'oelflex',
        hersteller: 'Lapp Kabel',
        festLeitungstyp: true,
        artikelWhitelist: ['0021810']
    },
    'oelflex-werkzeugspanner': {
        label: 'Ölflexleitung Werkzeugspanner',
        bezeichnung: 'Ölflexleitung',
        kategorie: 'oelflex',
        hersteller: 'Lapp Kabel',
        festLeitungstyp: true,
        artikelWhitelist: ['0021810', 'OELFLEX110-12G15', 'OELFLEX110-18G15']
    },
    'oelflex-werkzeugwechsel': {
        label: 'Ölflexleitung Werkzeugwechsel',
        bezeichnung: 'Ölflexleitung 5G2,5',
        kategorie: 'oelflex',
        hersteller: 'Lapp Kabel',
        festLeitungstyp: true,
        artikelWhitelist: ['OELFLEX110-5G25']
    },
    'oelflex-steckdosen': {
        label: 'Ölflexleitung Steckdosen',
        bezeichnung: 'Ölflexleitung',
        kategorie: 'oelflex',
        hersteller: 'Lapp Kabel',
        festLeitungstyp: true,
        artikelWhitelist: ['0021814', 'OELFLEX110-3G25', 'OELFLEX110-5G25']
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
        artikelnummer: 'ZK2000-6200-0150',
        laenge: 15
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
    },
    'ethercat-zk3191-m8-rj45': {
        label: 'EtherCAT M8 → RJ45',
        bezeichnung: 'EtherCAT Bus M8 → RJ45',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'RJ45',
        artikelPrefix: 'ZK1090-3191',
        artikelnummer: 'ZK1090-3191-0200',
        laenge: 20
    },
    'ethercat-zk3131-m8-m8': {
        label: 'EtherCAT M8 → M8',
        bezeichnung: 'EtherCAT Bus M8 → M8',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'M8 4-polig', ausrichtungB: 'gerade',
        artikelPrefix: 'ZK1090-3131',
        artikelnummer: 'ZK1090-3131-0010',
        laenge: 1
    },
    'ethercat-zk9191-rj45-rj45': {
        label: 'EtherCAT RJ45 → RJ45',
        bezeichnung: 'EtherCAT Spindel/Regler',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'RJ45', steckerB: 'RJ45',
        artikelPrefix: 'ZK1090-9191',
        artikelnummer: 'ZK1090-9191-0020',
        laenge: 2
    },
    'ethercat-zk3161-linear': {
        label: 'EtherCAT M8 → M12 Linearmaßstab',
        bezeichnung: 'EtherCAT Linearmaßstab Sp1/2',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'M12 4-polig', ausrichtungB: 'gerade',
        artikelPrefix: 'ZK1090-3161',
        artikelnummer: 'ZK1090-3161-0050',
        laenge: 5
    },
    'ethercat-zk6161-linear': {
        label: 'EtherCAT M12 → M12 Linearmaßstab',
        bezeichnung: 'EtherCAT Linearmaßstab Sp3/4',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M12 4-polig', ausrichtungA: 'gerade',
        steckerB: 'M12 4-polig', ausrichtungB: 'gerade',
        artikelPrefix: 'ZK1090-6161',
        artikelnummer: 'ZK1090-6161-0050',
        laenge: 5
    },
    'ethercat-zk3333-werkzeug': {
        label: 'EtherCAT M8 gewinkelt → M8 gewinkelt',
        bezeichnung: 'EtherCAT Werkzeugsicherung',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gewinkelt',
        steckerB: 'M8 4-polig', ausrichtungB: 'gewinkelt',
        artikelPrefix: 'ZK1090-3333',
        artikelnummer: 'ZK1090-3333-0010',
        laenge: 1
    },
    'ethercat-zk3133-werkzeug': {
        label: 'EtherCAT M8 gerade → M8 gewinkelt',
        bezeichnung: 'EtherCAT Werkzeugsicherung',
        kategorie: 'ethercat', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'M8 4-polig', ausrichtungB: 'gewinkelt',
        artikelPrefix: 'ZK1090-3133',
        artikelnummer: 'ZK1090-3133-0010',
        laenge: 1
    },
    'key-system-leitung': {
        label: 'Key-System Leitung',
        bezeichnung: 'Key-System RJ45 → RJ45',
        kategorie: 'ethercat',
        hersteller: 'Murr Elektronik',
        steckerA: 'RJ45',
        steckerB: 'RJ45',
        artikelnummer: '7000-74327-7960500',
        laenge: 5
    },
    'powerleitung-zk2030': {
        label: 'Powerleitung EP-Modul',
        bezeichnung: 'Powerleitung 7/8\" → offen',
        kategorie: 'power', hersteller: 'Beckhoff',
        steckerA: '7/8\" 5-polig gewinkelt', ausrichtungA: 'gewinkelt',
        steckerB: 'offen',
        artikelPrefix: 'ZK2030-1400',
        artikelnummer: 'ZK2030-1400-0150',
        laenge: 15
    },
    'powerleitung-zk3132': {
        label: 'Powerleitung M8 → M8',
        bezeichnung: 'Powerleitung EP-Modul',
        kategorie: 'power', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'M8 4-polig', ausrichtungB: 'gerade',
        artikelPrefix: 'ZK2020-3132',
        artikelnummer: 'ZK2020-3132-0010',
        laenge: 1
    },
    'powerleitung-zk3400': {
        label: 'Powerleitung M8 → offen',
        bezeichnung: 'Powerleitung Werkzeugsicherung',
        kategorie: 'power', hersteller: 'Beckhoff',
        steckerA: 'M8 4-polig', ausrichtungA: 'gerade',
        steckerB: 'offen',
        artikelPrefix: 'ZK2020-3400',
        artikelnummer: 'ZK2020-3400-0100',
        laenge: 10
    },
    'sensorleitung-zk2162': {
        label: 'Sensorleitung M8 → M12',
        bezeichnung: 'Sensorleitung Schmierung',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M8 3-polig Stecker gerade',
        steckerB: 'M12 4-polig Buchse gerade',
        artikelPrefix: 'ZK2000-2162',
        artikelnummer: 'ZK2000-2162-0030',
        laenge: 3
    },
    'sensorleitung-zk6100': {
        label: 'Sensorleitung M12 Stecker → offen',
        bezeichnung: 'Sensorleitung M12 Stecker',
        kategorie: 'sensor', hersteller: 'Beckhoff',
        steckerA: 'M12 4-polig Stecker gerade',
        steckerB: 'offen',
        artikelPrefix: 'ZK2000-6100',
        artikelnummer: 'ZK2000-6100-0100',
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
        hinweis: 'Bustopologie laut Bestellliste: Stößel (ZK1090-3191, ZK1090-3131), MTS (ZK1090-3161, ZK1090-6161), Werkzeugsicherungen (ZK1090-3333, ZK1090-3133) und Key-System (7000-74327-7960500). Länge danach frei wählbar.',
        leitungen: [
            'ethercat-zk3191-m8-rj45',
            'ethercat-zk3131-m8-m8',
            'ethercat-zk3161-linear',
            'ethercat-zk6161-linear',
            'ethercat-zk3333-werkzeug',
            'ethercat-zk3133-werkzeug',
            'key-system-leitung'
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
        hinweis: 'Sicherheitstechnik: Fußtaster und Zweihandpult mit Ölflexleitung (Meterware). Türschalter und Lichtschranke als Bauteile erfassen.',
        leitungen: ['oelflex'],
        bauteile: ['tuerschalter', 'zweihand', 'fusstaster', 'lichtschranke'],
        ohneUniversal: true,
        nurFestgelegteBauteile: true
    },
    '=010': {
        hinweis: 'Spindel 1 Antrieb: ÖLFLEX SERVO 719 CY 4G35 (1020033) und Igus Readycable Geberleitung erfassen. Entspricht =020, =030, =040.',
        leitungen: ['motorleitung-spindel-servo719', 'geberleitung'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=020': {
        hinweis: 'Spindel 2 Antrieb: ÖLFLEX SERVO 719 CY 4G35 (1020033) und Igus Readycable Geberleitung erfassen. Entspricht =010, =030, =040.',
        leitungen: ['motorleitung-spindel-servo719', 'geberleitung'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=030': {
        hinweis: 'Spindel 3 Antrieb: ÖLFLEX SERVO 719 CY 4G35 (1020033) und Igus Readycable Geberleitung erfassen. Entspricht =010, =020, =040.',
        leitungen: ['motorleitung-spindel-servo719', 'geberleitung'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=040': {
        hinweis: 'Spindel 4 Antrieb: ÖLFLEX SERVO 719 CY 4G35 (1020033) und Igus Readycable Geberleitung erfassen. Entspricht =010, =020, =030.',
        leitungen: ['motorleitung-spindel-servo719', 'geberleitung'],
        ohneUniversal: true,
        nurLeitungen: true
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
        hinweis: 'Spindel 1 Beleuchtung: Sensorleitung Lampe erfassen (ZK2000-6200, Standard 15 m). Nach dem Anlegen nur noch die Länge wählen.',
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
        hinweis: 'Vorschub: Beckhoff Motorleitung ZK4500-8022 (Standard 15 m), Sensorleitung ZK2000-6200-0100 und Geberleitung erfassen. Länge danach frei wählbar.',
        leitungen: ['motorleitung-vorschub-zk4500', 'sensorleitung-eaton-taster', 'geberleitung'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=105': {
        hinweis: 'Beölung: diverse M8/M12 Sensorleitungen laut Schaltplan – Typ und Länge wählen.',
        leitungen: ['sensor-m12-m12', 'sensor-m8-m8', 'oelflex'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=200': {
        hinweis: 'Kühlung: Ölflex 4G1,5, zwei Sensorleitungen ZK2000-6200 (Buchse) und eine ZK2000-6100 (Stecker) erfassen.',
        leitungen: ['oelflex-kuehlung', 'sensorleitung-eaton-taster', 'sensorleitung-zk6100'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=210': {
        hinweis: 'Schmierung: Sensorleitungen ZK2000-6200-0100 und ZK2000-2162-0030 erfassen. Länge danach frei wählbar.',
        leitungen: ['sensorleitung-eaton-taster', 'sensorleitung-zk2162'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=250': {
        hinweis: 'Steckdosen: Ölflex 5G1,5, 3G2,5 oder 5G2,5 wählen und Länge eingeben.',
        leitungen: ['oelflex-steckdosen'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=270': {
        hinweis: 'Druckluft: Sensorleitung ZK2000-6200, Powerleitung ZK2020-3200 und Ölflex erfassen.',
        leitungen: ['sensorleitung-eaton-taster', 'powerleitung-mts', 'oelflex'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=281': {
        hinweis: 'Werkzeugspanner: Ölflex 4G1,5, 12G1,5 oder 18G1,5 sowie Sensorleitung ZK2000-2122 erfassen.',
        leitungen: ['oelflex-werkzeugspanner', 'bremse-geoeffnet'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=282': {
        hinweis: 'Werkzeugwechselkonsole: Ölflex 5G2,5 erfassen. Harting-Gehäuse als Bauteil.',
        leitungen: ['oelflex-werkzeugwechsel'],
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
        hinweis: 'Externe Peripherie (=110–112): Ölflex 25G1,5 und EtherCAT ZK1090-9191 erfassen. Länge danach frei wählbar.',
        leitungen: ['oelflex-extern', 'ethercat-zk9191-rj45-rj45'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=301': {
        hinweis: 'EtherCAT-Module am Stößel: EP-Module als Bauteil, Power ZK2030-1400 (Standard 15 m), ZK2020-3132 und EtherCAT-Busleitungen erfassen.',
        leitungen: [
            'powerleitung-zk2030',
            'powerleitung-zk3132',
            'ethercat-zk3191-m8-rj45',
            'ethercat-zk3131-m8-m8'
        ],
        bauteile: ['ep-modul'],
        ohneUniversal: true
    },
    '=303': {
        hinweis: 'Werkzeugsicherung: EP-Module als Bauteil, Power ZK2020-3400 (Standard 10 m) und ZK2020-3132 erfassen.',
        leitungen: ['powerleitung-zk3400', 'powerleitung-zk3132'],
        bauteile: ['ep-modul'],
        ohneUniversal: true
    },
    '=401': {
        hinweis: 'Buskasten Bedienseite: Ölflex 12G2,5 oder 18G2,5 wählen und Länge eingeben.',
        leitungen: ['oelflex-buskasten'],
        ohneUniversal: true,
        nurLeitungen: true
    },
    '=402': {
        hinweis: 'Buskasten Rückseite: Ölflex 12G2,5 oder 18G2,5 wählen und Länge eingeben.',
        leitungen: ['oelflex-buskasten'],
        ohneUniversal: true,
        nurLeitungen: true
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
 * Löst eine Liste von Preset-IDs in Presets auf, ohne Duplikate.
 * @param {string[]} ids
 * @returns {object[]}
 */
function toPresets(ids) {
    const map = new Map();
    (ids || []).forEach(id => {
        const preset = getLeitungPreset(id);
        if (preset) map.set(preset.id, preset);
    });
    return Array.from(map.values());
}


/**
 * Liefert Hinweistext, Leitungs-Presets und Bauteiltypen einer Gruppe.
 *
 * `standardLeitungen` und `standardBauteilTypen` sind die fest hinterlegten Positionen,
 * die in nahezu jedem Projekt gebraucht werden – sie erscheinen als Vorschlagszeilen.
 * `weitereLeitungen` und `weitereBauteilTypen` sind nur grobe Vorschläge aus Regeln
 * bzw. dem Katalog und stehen erst im Auswahldialog zur Verfügung.
 *
 * @param {object} gruppe - Eintrag aus data/gruppen.json.
 * @returns {object}
 */
export function getGruppenVorgaben(gruppe) {
    const code = gruppe?.code || '';
    const bezeichnung = gruppe?.bezeichnung || '';
    const fest = GRUPPEN[code] || {};

    const festeIds = fest.nurBauteile ? [] : (fest.leitungen || []);
    const customIds = getCustomPresetIdsForGruppe(code);
    const standardIds = Array.from(new Set([...festeIds, ...customIds]));

    let weitereIds = [];
    if (!fest.nurBauteile) {
        if (!festeIds.length) {
            const regel = BEZEICHNUNG_REGELN.find(r => r.test.test(bezeichnung));
            weitereIds = (regel ? regel.leitungen : FALLBACK_LEITUNGEN).slice();
        }
        if (!fest.ohneUniversal) weitereIds.push(...UNIVERSAL_PRESETS);
    }
    weitereIds = Array.from(new Set(weitereIds)).filter(id => !standardIds.includes(id));

    const standardBauteilTypen = fest.bauteile || [];
    const nurFest = fest.nurFestgelegteBauteile || fest.nurBauteile || fest.nurLeitungen;
    const weitereBauteilTypen = nurFest
        ? []
        : getBauteilTypenAusKatalog(code).filter(typ => !standardBauteilTypen.includes(typ));

    const standardLeitungen = toPresets(standardIds);
    const weitereLeitungen = toPresets(weitereIds);

    return {
        hinweis: fest.hinweis || '',
        standardLeitungen,
        weitereLeitungen,
        leitungPresets: [...standardLeitungen, ...weitereLeitungen],
        standardBauteilTypen,
        weitereBauteilTypen,
        bauteilTypen: [...standardBauteilTypen, ...weitereBauteilTypen],
        bauteilLaengen: fest.bauteilLaengen || [],
        bauteilStandardLaenge: fest.bauteilStandardLaenge,
        nurLeitungen: Boolean(fest.nurLeitungen),
        nurBauteile: Boolean(fest.nurBauteile),
        nurFestgelegteBauteile: Boolean(fest.nurFestgelegteBauteile)
    };
}
