/**
 * @file Wizard-Konfiguration.
 */
export const WIZARD_CAT = {
    ethercat: ['ethercat'],
    sensor: ['sensor'],
    power: ['power', 'sonstiges'],
    oelflex: ['oelflex'],
    antrieb: ['power', 'oelflex', 'sonstiges'],
    geber: ['sensor', 'power'],
    mts: ['power', 'sensor'],
    zuleitung: ['oelflex', 'sonstiges'],
    panel: ['ethercat', 'sonstiges']
};

/**
 * Erzeugt die Fragen für eine Spindel (Motor, Bremsen, Linearmaßstab, DMS, Temperatur, Not-Halt).
 * @param {number} spindel Spindel-Nummer (1-4)
 * @param {number} basis Basis-Gruppennummer (10, 20, 30, 40)
 * @returns {object[]}
 */
function spindelSteps(spindel, basis) {
    const g = n => `=${String(basis + n).padStart(3, '0')}`;
    return [
        {
            id: `${String(basis).padStart(3, '0')}-motorleitung`,
            gruppe: g(0),
            frage: `Motorleitung Spindel ${spindel}?`,
            allowedCategories: WIZARD_CAT.antrieb,
            defaultCategory: 'power',
            hinweis: 'In der Regel ÖLFLEX SERVO 719 CY 4G35+2x(2x1,5).\n2x(2x1,5) ist für die Temperaturfühler – hat die Leitung diese nicht, zusätzlich eine Ölflex-Leitung anlegen.'
        },
        {
            id: `${String(basis).padStart(3, '0')}-geberleitung`,
            gruppe: g(0),
            frage: `Geberleitung Spindel ${spindel}?`,
            allowedCategories: WIZARD_CAT.geber,
            defaultCategory: 'sensor',
            hinweis: 'Hersteller Baumüller oder IGUS Sonderfertigung.'
        },
        {
            id: `${String(basis + 1).padStart(3, '0')}-bremsen`,
            gruppe: g(1),
            frage: `Bremsen Spindel ${spindel}?`,
            allowedCategories: WIZARD_CAT.sensor,
            defaultCategory: 'sensor',
            bauteilTypen: ['bremse', 'ventil'],
            hinweis: 'Bremse z. B. Artikelnummer DV 030 FPM 101 R 12.\nFesto Ventil: VOFA-L26-T32C-M-G14-1C1-APP.\nSensorleitungen:\n• M12 Buchse → M8 3-polig Stift (Bremse geöffnet)\n• M8 3-polig Buchse → M12 Buchse (Ventil geöffnet)\n• M12 → Magnetventilstecker (Ventil öffnen)'
        },
        {
            id: `${String(basis + 2).padStart(3, '0')}-linearmassstab`,
            gruppe: g(2),
            frage: `Linearmaßstab Spindel ${spindel}?`,
            allowedCategories: WIZARD_CAT.mts,
            defaultCategory: 'power'
        },
        {
            id: `${String(basis + 3).padStart(3, '0')}-dms`,
            gruppe: g(3),
            frage: `DMS Sensoren Spindel ${spindel}?`,
            bauteilTypen: ['dms'],
            hinweis: 'Typ: DZ1 – Anzahl beim Bauteil eingeben.'
        },
        {
            id: `${String(basis + 4).padStart(3, '0')}-temp-tisch`,
            gruppe: g(4),
            frage: `Temperatur Tisch Spindel ${spindel}?`,
            allowedCategories: WIZARD_CAT.sensor,
            defaultCategory: 'sensor',
            hinweis: 'Sensorleitung M12 gewinkelt → offenes Ende (Regelfall, kann abweichen).'
        },
        {
            id: `${String(basis + 4).padStart(3, '0')}-temp-stoessel`,
            gruppe: g(4),
            frage: `Temperatur Stößel Spindel ${spindel}?`,
            allowedCategories: WIZARD_CAT.sensor,
            defaultCategory: 'sensor',
            hinweis: 'Sensorleitung M12 gewinkelt Buchse → M12 gewinkelt Stift (Regelfall, kann abweichen).'
        },
        {
            id: `${String(basis + 5).padStart(3, '0')}-nothalt`,
            gruppe: g(5),
            frage: `Not-Halt Taster Spindel ${spindel}?`,
            allowedCategories: WIZARD_CAT.sensor,
            defaultCategory: 'sensor',
            bauteilTypen: ['nothalt-taster', 'schild'],
            hinweis: 'Sensorleitung M12 Buchse → offenes Ende.\nTaster Typ: C22-PV-K02-P1 (mit M12-Stecker).\nNot-Halt Schild nicht vergessen.'
        }
    ];
}

export const DEFAULT_WIZARD_STEPS = [
    {
        id: '004-ethercat-presse',
        gruppe: '=004',
        frage: 'EtherCAT Schaltschrank → Presse?',
        allowedCategories: WIZARD_CAT.ethercat,
        defaultCategory: 'ethercat',
        hinweis: 'Hier werden nur die EtherCAT-Leitungen angelegt, mehr muss nicht ausgewählt werden.'
    },
    {
        id: '004-ethercat-linearmassstab',
        gruppe: '=004',
        frage: 'EtherCAT Linearmaßstab?',
        allowedCategories: WIZARD_CAT.ethercat,
        defaultCategory: 'ethercat',
        hinweis: 'Hier werden nur die EtherCAT-Leitungen angelegt, mehr muss nicht ausgewählt werden.'
    },
    {
        id: '005-ipc',
        gruppe: '=005',
        frage: 'IPC?',
        bauteilTypen: ['ipc'],
        hinweis: 'Aktuell gibt es nur den Beckhoff IPC C6930-0070, weitere können folgen.'
    },
    {
        id: '005-panel',
        gruppe: '=005',
        frage: 'Panel?',
        bauteilTypen: ['panel'],
        hinweis: 'Aktuell gibt es nur das Panel C3921-1035-0010 (000095718), weitere können folgen.'
    },
    {
        id: '005-panel-cplink',
        gruppe: '=005',
        frage: 'CP-Link Leitung für das Panel?',
        allowedCategories: WIZARD_CAT.panel,
        defaultCategory: 'sonstiges',
        hinweis: 'Standard ist C9900-K706 mit 20 m – andere Längen sind möglich.'
    },
    {
        id: '005-panel-taster',
        gruppe: '=005',
        frage: 'Panel Taster-Leitungen?',
        allowedCategories: ['sensor', 'sonstiges'],
        defaultCategory: 'sonstiges',
        hinweis: 'Hier wird immer 2x die Phoenix Leitung 632582 (Sonepar Bestellnummer) verwendet.'
    },
    {
        id: '007-tuerschalter',
        gruppe: '=007',
        frage: 'Türschalter?',
        allowedCategories: WIZARD_CAT.sensor,
        defaultCategory: 'sensor',
        bauteilTypen: ['tuerschalter'],
        hinweis: 'Hersteller SSP, Pilz oder Euchner – die Typen sind noch nicht festgelegt.\nManchmal werden zusätzlich spezielle Sensorleitungen benötigt (Leitungstyp folgt noch).'
    },
    {
        id: '007-lichtschranke',
        gruppe: '=007',
        frage: 'Lichtschranke?',
        allowedCategories: WIZARD_CAT.sensor,
        defaultCategory: 'sensor',
        bauteilTypen: ['lichtschranke'],
        optional: true,
        hinweis: 'Manchmal werden Lichtschranken verwendet: SSP, Pilz oder SICK.\nDazu kommen noch spezielle Sensorleitungen.'
    },
    {
        id: '007-fusstaster',
        gruppe: '=007',
        frage: 'Fußtaster?',
        allowedCategories: WIZARD_CAT.oelflex,
        defaultCategory: 'oelflex',
        bauteilTypen: ['fusstaster'],
        optional: true,
        hinweis: 'Typ vom Fußtaster auswählen – als Leitung wird eine Ölflex-Leitung verwendet.'
    },
    {
        id: '009-baumueller',
        gruppe: '=009',
        frage: 'Baumüller Aufbau?',
        bauteilTypen: ['netzwechselrichter', 'regler', 'drossel', 'filter', 'ringkern', 'saf-modul', 'kapazitaetsmodul', 'motor'],
        hinweis: 'Jeweils Typ und Anzahl angeben: Netzwechselrichter, Regler, Drossel, Filter, Ringkern, SAF-Modul, Kapazitätsmodul und Motor.'
    },
    ...spindelSteps(1, 10),
    ...spindelSteps(2, 20),
    ...spindelSteps(3, 30),
    ...spindelSteps(4, 40)
];
