/**
 * @file Minimaler xlsx-Schreiber für ein einzelnes Blatt.
 *
 * Erzeugt eine ungepackte (STORE) ZIP-Datei. Excel öffnet sie wie jede andere xlsx,
 * und es braucht keine Bibliothek.
 */

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';


/**
 * @param {number} n 1-basiert
 * @returns {string}
 */
function spalte(n) {
    let name = '';
    while (n > 0) {
        const rest = (n - 1) % 26;
        name = String.fromCharCode(65 + rest) + name;
        n = Math.floor((n - 1) / 26);
    }
    return name;
}


/**
 * @param {string} wert
 * @returns {string}
 */
function xmlText(wert) {
    return String(wert)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}


/**
 * @param {string} ref
 * @param {{v?: string|number, f?: string, s?: number}|null} zelle
 * @returns {string}
 */
function zelleXml(ref, zelle) {
    if (!zelle) return '';
    const stil = zelle.s ? ` s="${zelle.s}"` : '';
    if (zelle.f) return `<c r="${ref}"${stil}><f>${xmlText(zelle.f)}</f></c>`;
    if (typeof zelle.v === 'number' && Number.isFinite(zelle.v)) {
        return `<c r="${ref}"${stil}><v>${zelle.v}</v></c>`;
    }
    if (zelle.v == null || zelle.v === '') return '';
    const text = String(zelle.v);
    const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
    return `<c r="${ref}"${stil} t="inlineStr"><is><t${space}>${xmlText(text)}</t></is></c>`;
}


/**
 * @param {object} blatt
 * @returns {string}
 */
function blattXml(blatt) {
    const zeilen = blatt.rows.map((zellen, index) => {
        const nr = index + 1;
        const hoehe = blatt.rowHeights?.[nr];
        const inhalt = (zellen || []).map((zelle, spalteIndex) => zelleXml(spalte(spalteIndex + 1) + nr, zelle)).join('');
        if (!inhalt) return '';
        const attr = hoehe ? ` r="${nr}" ht="${hoehe}" customHeight="1"` : ` r="${nr}"`;
        return `<row${attr}>${inhalt}</row>`;
    }).join('');

    const spalten = (blatt.cols || [])
        .map((breite, index) => `<col min="${index + 1}" max="${index + 1}" width="${breite}" customWidth="1"/>`)
        .join('');
    const merges = blatt.merges || [];
    const mergeXml = merges.length
        ? `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
        : '';
    const pruefung = blatt.validation?.list?.length
        ? `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showDropDown="0" sqref="${xmlText(blatt.validation.sqref)}"><formula1>"${xmlText(blatt.validation.list.join(','))}"</formula1></dataValidation></dataValidations>`
        : '';
    const letzteZeile = Math.max(1, blatt.rows.length);
    const letzteSpalte = spalte(Math.max(1, ...(blatt.rows.map(zellen => zellen?.length || 0))));

    return [
        XML,
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        blatt.freeze
            ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${blatt.freeze}" topLeftCell="A${blatt.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
            : '',
        `<dimension ref="A1:${letzteSpalte}${letzteZeile}"/>`,
        spalten ? `<cols>${spalten}</cols>` : '',
        `<sheetData>${zeilen}</sheetData>`,
        mergeXml,
        pruefung,
        '</worksheet>'
    ].join('');
}


/** @returns {string} */
function stylesXml() {
    return [
        XML,
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<fonts count="5">',
        '<font><sz val="10"/><name val="Arial"/></font>',
        '<font><b/><sz val="14"/><name val="Arial"/></font>',
        '<font><b/><sz val="10"/><name val="Arial"/></font>',
        '<font><b/><sz val="8"/><name val="Arial"/></font>',
        '<font><b/><sz val="11"/><name val="Arial"/></font>',
        '</fonts>',
        '<fills count="3">',
        '<fill><patternFill patternType="none"/></fill>',
        '<fill><patternFill patternType="gray125"/></fill>',
        '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill>',
        '</fills>',
        '<borders count="1"><border><left/><right/><top/><bottom/></border></borders>',
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
        '<cellXfs count="6">',
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>',
        '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
        '<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
        '<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>',
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
        '</cellXfs>',
        '</styleSheet>'
    ].join('');
}


/**
 * @param {Uint8Array[]} teile
 * @returns {Uint8Array}
 */
function zusammen(teile) {
    const laenge = teile.reduce((summe, teil) => summe + teil.length, 0);
    const ausgabe = new Uint8Array(laenge);
    let offset = 0;
    teile.forEach(teil => {
        ausgabe.set(teil, offset);
        offset += teil.length;
    });
    return ausgabe;
}


/**
 * @param {number} wert
 * @returns {Uint8Array}
 */
function u16(wert) {
    return new Uint8Array([wert & 255, (wert >> 8) & 255]);
}


/**
 * @param {number} wert
 * @returns {Uint8Array}
 */
function u32(wert) {
    return new Uint8Array([wert & 255, (wert >> 8) & 255, (wert >> 16) & 255, (wert >> 24) & 255]);
}


/**
 * @param {Uint8Array} daten
 * @returns {number}
 */
function crc32(daten) {
    let crc = ~0;
    for (const byte of daten) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return ~crc >>> 0;
}


/**
 * @param {Array<{name: string, inhalt: string}>} dateien
 * @returns {Uint8Array}
 */
function packeZip(dateien) {
    const coder = new TextEncoder();
    const lokale = [];
    const zentrale = [];
    let offset = 0;
    dateien.forEach(datei => {
        const name = coder.encode(datei.name);
        const daten = coder.encode(datei.inhalt);
        const pruefsumme = crc32(daten);
        const kopf = zusammen([
            u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
            u32(pruefsumme), u32(daten.length), u32(daten.length),
            u16(name.length), u16(0), name
        ]);
        lokale.push(zusammen([kopf, daten]));
        zentrale.push(zusammen([
            u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
            u32(pruefsumme), u32(daten.length), u32(daten.length),
            u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name
        ]));
        offset += kopf.length + daten.length;
    });
    const verzeichnis = zusammen(zentrale);
    const ende = zusammen([
        u32(0x06054b50), u16(0), u16(0),
        u16(dateien.length), u16(dateien.length),
        u32(verzeichnis.length), u32(offset), u16(0)
    ]);
    return zusammen([...lokale, verzeichnis, ende]);
}


/**
 * Schreibt ein Arbeitsblatt als xlsx.
 * Zellen: `{v}` Text oder Zahl, `{f}` Formel, `{s}` Stil 0–5.
 * @param {{name?: string, cols?: number[], rows: Array<Array<{v?: string|number, f?: string, s?: number}|null>>, merges?: string[], rowHeights?: Record<number, number>, validation?: {sqref: string, list: string[]}}} blatt
 * @returns {Blob}
 */
export function baueXlsx(blatt) {
    const name = xmlText(blatt.name || 'Tabelle').slice(0, 31) || 'Tabelle';
    const dateien = [
        {
            name: '[Content_Types].xml',
            inhalt: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
        },
        {
            name: '_rels/.rels',
            inhalt: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
        },
        {
            name: 'xl/workbook.xml',
            inhalt: `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            inhalt: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
        },
        { name: 'xl/styles.xml', inhalt: stylesXml() },
        { name: 'xl/worksheets/sheet1.xml', inhalt: blattXml(blatt) }
    ];
    return new Blob([packeZip(dateien)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
}
