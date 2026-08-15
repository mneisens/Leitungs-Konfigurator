/**
 * @file Wizard-Konfiguration.
 */
export const WIZARD_CAT = {
    ethercat: ['ethercat'],
    sensor: ['sensor'],
    power: ['power', 'sonstiges'],
    oelflex: ['oelflex'],
    motor: ['motor'],
    geber: ['geber'],
    antrieb: ['motor', 'geber', 'power', 'sensor', 'oelflex', 'sonstiges'],
    mts: ['power', 'sensor'],
    zuleitung: ['oelflex', 'sonstiges'],
    panel: ['cplink', 'sonstiges', 'sensor']
};

/**
 * Erzeugt die Fragen für eine Spindel
 * (Antrieb, Bremse, Linearmaßstab Power, Kraftsensoren, Temperatur, Not-Halt, Beleuchtung).
 * @param {number} spindel Spindel-Nummer (1-4)
 * @param {number} basis Basis-Gruppennummer (10, 20, 30, 40)
 * @returns {object[]}
 */
function spindelSteps(spindel, basis) {
    const g = n => `=${String(basis + n).padStart(3, '0')}`;
    const nr = n => String(basis + n).padStart(3, '0');
    return [
        {
            id: `${nr(0)}-antrieb`,
            gruppe: g(0),
            frage: `Spindel ${spindel} Antrieb?`,
            allowedCategories: WIZARD_CAT.antrieb,
            defaultCategory: 'motor',
            motorleitung: true,
            bauteilTypen: ['regler', 'netzwechselrichter', 'kapazitaetsmodul', 'ringkern'],
            vorauswahl: { hersteller: 'Lapp Kabel' },
            hinweis: 'Motorleitung: Kategorie Motorleitungen – nur ÖLFLEX SERVO 719 CY (Lapp), Typ und Länge wählen.\nVarianten: 4G1,5+2x(2x0,75) / 4G2,5+2x(2x1) / 4G4+(2x1)+(2x1,5) / 4G10+(2x1)+(2x1,5) / 4G16+2x(2x1,5) / 4G25+2x(2x1,5) / 4G35+2x(2x1,5).\nGeberleitung: Kategorie Geberleitung – Hersteller IGUS oder Baumüller, Länge angeben (z. B. 20 m).\nBauteile: Regler-Typ (händisch eingeben), Netzwechselrichter, Kapazitätsmodule + Anzahl, Ringkerne (Anzahl pro Netzwechselrichter).'
        },
        {
            id: `${nr(1)}-bremse`,
            gruppe: g(1),
            frage: `Spindel ${spindel} Bremse?`,
            allowedCategories: WIZARD_CAT.sensor,
            defaultCategory: 'sensor',
            bauteilTypen: ['ventil'],
            vorauswahl: { hersteller: 'Beckhoff', steckerA: 'M12', steckerB: 'M8' },
            hinweis: 'Bauteil: Bremsventil.\nSensorleitungen:\n• Beckhoff M12 Buchse → M8 3-polig Stift (Bremse geöffnet)\n• M12 Stift → M8 4-polig\n• M12 Stift → Ventilstecker (Murr)'
        },
        {
            id: `${nr(2)}-linearmassstab-power`,
            gruppe: g(2),
            frage: `Linearmaßstab Power (Spindel ${spindel})?`,
            allowedCategories: WIZARD_CAT.mts,
            defaultCategory: 'power',
            vorauswahl: { steckerA: 'M8', steckerB: 'offen' },
            hinweis: 'Powerleitung M8 → offenes Ende.'
        },
        {
            id: `${nr(3)}-kraftsensoren`,
            gruppe: g(3),
            frage: `Spindel ${spindel} Kraftsensoren?`,
            bauteilTypen: ['dms'],
            hinweis: 'Bauteil: DZ1-Sensoren.\nLängenangabe: 2 m, 4 m oder 6 m.\nAnzahl angeben.'
        },
        {
            id: `${nr(4)}-temperatur`,
            gruppe: g(4),
            frage: `Temperatursensoren (Spindel ${spindel})?`,
            allowedCategories: WIZARD_CAT.sensor,
            defaultCategory: 'sensor',
            vorauswahl: { steckerA: 'M12', steckerB: 'offen' },
            hinweis: 'Spindellager: Sensorleitung M12 gewinkelt → offenes Ende.\nMutter: Sensorleitung M12 gewinkelt → M12 gerade.'
        },
        {
            id: `${nr(5)}-nothalt`,
            gruppe: g(5),
            frage: `Not-Halt (Spindel ${spindel})?`,
            allowedCategories: WIZARD_CAT.sensor,
            defaultCategory: 'sensor',
            bauteilTypen: ['nothalt-taster', 'schild'],
            vorauswahl: { steckerA: 'M12', steckerB: 'offen' },
            hinweis: 'Bauteil: Not-Halt Taster, Typ C22-PV-K02-P1.\nSensorleitung: M12 Buchse → offenes Ende.'
        },
        {
            id: `${nr(6)}-beleuchtung`,
            gruppe: g(6),
            frage: `Beleuchtung (Spindel ${spindel})?`,
            allowedCategories: WIZARD_CAT.sensor,
            defaultCategory: 'sensor',
            vorauswahl: { steckerA: 'M12', steckerB: 'offen' },
            hinweis: 'Sensorleitung: M12 gerade Buchse → offenes Ende.'
        }
    ];
}

export const DEFAULT_WIZARD_STEPS = [
    {
        id: '004-ethercat-presse',
        gruppe: '=004',
        frage: 'EtherCAT vom IPC → Stößel?',
        allowedCategories: WIZARD_CAT.ethercat,
        defaultCategory: 'ethercat',
        vorauswahl: { hersteller: 'Beckhoff', steckerA: 'RJ45', steckerB: 'M8' },
        hinweis: 'Hier werden nur EtherCAT-Leitungen verwendet.\nHersteller Beckhoff, Leitungstyp EtherCAT und Stecker RJ45 → M8 sind vorausgewählt.'
    },
    {
        id: '004-ethercat-linearmassstab',
        gruppe: '=004',
        frage: 'EtherCAT Linearmaßstäbe?',
        allowedCategories: WIZARD_CAT.ethercat,
        defaultCategory: 'ethercat',
        vorauswahl: { hersteller: 'Beckhoff', steckerA: 'M8', steckerB: 'M12' },
        hinweis: 'Hersteller Beckhoff, Leitungstyp EtherCAT und Stecker M8 → M12 sind vorausgewählt.'
    },
    {
        id: '004-ethercat-werkzeugsicherung',
        gruppe: '=004',
        frage: 'EtherCAT Werkzeugsicherungen?',
        allowedCategories: WIZARD_CAT.ethercat,
        defaultCategory: 'ethercat',
        vorauswahl: {
            hersteller: 'Beckhoff',
            steckerA: 'M8',
            steckerB: 'M8',
            ausrichtungA: 'gerade',
            ausrichtungB: 'gewinkelt'
        },
        hinweis: 'Hersteller Beckhoff, Leitungstyp EtherCAT und Stecker M8 gerade → M8 gewinkelt sind vorausgewählt.'
    },
    {
        id: '005-ipc-panel',
        gruppe: '=005',
        frage: 'IPC und Panel?',
        bauteilTypen: ['ipc', 'panel'],
        allowedCategories: WIZARD_CAT.panel,
        defaultCategory: 'cplink',
        vorauswahl: { hersteller: 'Beckhoff', steckerA: 'RJ45', steckerB: 'RJ45 IP65' },
        hinweis: 'Bauteile: IPC C6930-0070, Panel CP3921-1035-0010.\nLeitung: CP-Link Leitung (Beckhoff, RJ45 → RJ45 IP65 für Control Panel CP39xx-0010).'
    },
    {
        id: '007-schutztueren',
        gruppe: '=007',
        frage: 'Sicherheitstechnik: Schutztüren?',
        allowedCategories: WIZARD_CAT.sensor,
        defaultCategory: 'sensor',
        bauteilTypen: ['tuerschalter'],
        hinweis: 'Bauteil: Türschalter SSP, Pilz oder Euchner – der Typ kann auch händisch eingegeben werden.\nDazu passende Sensorleitung anlegen.'
    },
    {
        id: '007-lichtschranke',
        gruppe: '=007',
        frage: 'Sicherheitstechnik: Lichtschranke?',
        allowedCategories: WIZARD_CAT.sensor,
        defaultCategory: 'sensor',
        bauteilTypen: ['lichtschranke'],
        optional: true,
        hinweis: 'Bauteil: Typ, Artikel-Nr. und Hersteller angeben (auch händisch möglich).\nDazu passende Leitungen anlegen.'
    },
    {
        id: '007-fusstaster',
        gruppe: '=007',
        frage: 'Sicherheitstechnik: Fußtaster?',
        allowedCategories: WIZARD_CAT.oelflex,
        defaultCategory: 'oelflex',
        bauteilTypen: ['fusstaster'],
        optional: true,
        hinweis: 'Ölflex-Leitung verwenden.'
    },
    {
        id: '007-zweihand',
        gruppe: '=007',
        frage: 'Sicherheitstechnik: Zweihand-Taster?',
        allowedCategories: WIZARD_CAT.oelflex,
        defaultCategory: 'oelflex',
        optional: true,
        hinweis: 'Ölflex-Leitung verwenden.'
    },
    ...spindelSteps(1, 10),
    ...spindelSteps(2, 20),
    ...spindelSteps(3, 30),
    ...spindelSteps(4, 40),
    {
        id: '100-vorschub',
        gruppe: '=100',
        frage: 'Vorschub?',
        allowedCategories: WIZARD_CAT.antrieb,
        defaultCategory: 'power',
        bauteilTypen: ['motor', 'regler'],
        hinweis: 'Motortyp und Reglertyp angeben.\nMotorleitung anlegen.\nÖlflex-Leitung für Bremse öffnen/Lüften und Materialkontrolle.'
    },
    {
        id: '101-vorschub-hoehenverstellung',
        gruppe: '=101',
        frage: 'Vorschub Höhenverstellung?',
        allowedCategories: WIZARD_CAT.antrieb,
        defaultCategory: 'power',
        bauteilTypen: ['motor', 'regler'],
        hinweis: 'Motor, Regler und Motorleitung angeben.'
    },
    {
        id: '105-bandbeoelung',
        gruppe: '=105',
        frage: 'Bandbeölung?',
        allowedCategories: WIZARD_CAT.sensor,
        defaultCategory: 'sensor',
        bauteilTypen: ['bandbeoelung'],
        vorauswahl: { steckerA: 'M12', steckerB: 'offen' },
        hinweis: 'Hersteller: Raziol.\nDazu Sensorleitung anlegen.'
    },
    {
        id: '110-externe-schnittstelle',
        gruppe: '=110',
        frage: 'Externe Schnittstelle?',
        allowedCategories: WIZARD_CAT.oelflex,
        defaultCategory: 'oelflex',
        hinweis: '400V-Anschluss (optional): Ölflex-Leitung.\nSteuerleitung: Ölflex.'
    },
    {
        id: '200-kuehlung',
        gruppe: '=200',
        frage: 'Kühlung?',
        allowedCategories: WIZARD_CAT.oelflex,
        defaultCategory: 'oelflex',
        bauteilTypen: ['kuehlgeraet', 'harting'],
        hinweis: 'Hersteller: Pfannenberg oder Hydac.\nLeitung: Ölflex.\nStecker: Harting-Stecker.'
    },
    {
        id: '210-schmierung',
        gruppe: '=210',
        frage: 'Schmierung?',
        allowedCategories: WIZARD_CAT.sensor,
        defaultCategory: 'sensor',
        mengenfeld: { aktiv: true, label: 'Anzahl Progressivverteiler' },
        vorauswahl: { steckerA: 'M12', steckerB: 'offen' },
        hinweis: 'Anzahl der Progressivverteiler angeben.\nFür jeden Progressivverteiler wird eine Sensorleitung M12 → offenes Ende benötigt.'
    },
    {
        id: '220-tuerantriebe',
        gruppe: '=220',
        frage: 'Türantriebe?',
        allowedCategories: WIZARD_CAT.oelflex,
        defaultCategory: 'oelflex',
        bauteilTypen: ['tuerantrieb'],
        optional: true,
        hinweis: 'Extern oder intern angeben (Notiz).\nMotor/Geber-Set: Anzahl + Länge angeben.\nÖlflex-Leitung anlegen.'
    },
    {
        id: '230-hba',
        gruppe: '=230',
        frage: 'HBA?',
        bauteilTypen: ['hba'],
        hinweis: 'Bauteil: HBA auswählen.'
    },
    {
        id: '240-transportband',
        gruppe: '=240',
        frage: 'Transportband?',
        allowedCategories: ['oelflex', 'sensor'],
        defaultCategory: 'oelflex',
        optional: true,
        hinweis: 'Leitung: Ölflex.\nSensorleitung: M12 → offenes Ende (optional).'
    },
    {
        id: '250-steckdosen',
        gruppe: '=250',
        frage: 'Steckdosen?',
        allowedCategories: WIZARD_CAT.oelflex,
        defaultCategory: 'oelflex',
        bauteilTypen: ['steckdose'],
        mengenfeld: { aktiv: true, label: 'Anzahl Steckdosen' },
        hinweis: 'Anzahl der Steckdosen 400 V angeben – jeweils schaltbar und nicht schaltbar.\nLeitungslänge angeben.'
    },
    {
        id: '270-druckluft',
        gruppe: '=270',
        frage: 'Druckluft / Wartungseinheit?',
        allowedCategories: WIZARD_CAT.sensor,
        defaultCategory: 'sensor',
        vorauswahl: { steckerA: 'M8', steckerB: 'offen' },
        hinweis: 'Verbaut an: Schaltschrank oder Presse? (als Notiz angeben)\nSensorleitungen:\n• M8 4-polig → offenes Ende (Druckluft-Wartungseinheit)\n• M12 → offenes Ende (Freischalten Druckluft)\n• M8 4-polig → M8 3-polig Stift (Druckluft Stößel)'
    },
    {
        id: '301-ep-module',
        gruppe: '=301',
        frage: 'EP-Module Powerleitung?',
        allowedCategories: WIZARD_CAT.power,
        defaultCategory: 'power',
        bauteilTypen: ['ep-modul'],
        hinweis: 'EP-Modul angeben:\n• EP1018-0001: Digitale Eingänge M8\n• EP3204-0002: Temperaturmodul\n• EP3356-0022: Kraftsensormodul\n• EP1957-0022: Safety-Modul\n• EP2020-4308: Powermodul\n• EP3174-0002: Werkzeugsicherung Analog\n• EP1819-0022: Werkzeugsicherung Digital Eingang\n• EP2008-0022: Werkzeugsicherung Digital Ausgang'
    },
    {
        id: '302-klemmkasten',
        gruppe: '=302',
        frage: 'Klemmkasten?',
        allowedCategories: WIZARD_CAT.oelflex,
        defaultCategory: 'oelflex',
        mengenfeld: { aktiv: true, label: 'Anzahl Klemmkästen' },
        hinweis: 'Anzahl und Position angeben (vorne oder/und hinten).\nLeitung: Ölflex.'
    }
];
