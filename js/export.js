/**
 * @file export.js
 */
import { appState } from './state.js';
import { formatDate, formatDateForFile } from './utils.js';
import { showModal } from './modal.js';
import { getProjects, saveProjects, loadProjects } from './projects.js';
import { getGruppeDisplay } from './overview.js';
/**
 * exportAllProjects.
 * @returns {void}
 */
export function exportAllProjects() {
    const projects = getProjects();
    
    if (projects.length === 0) {
        showModal('Keine Projekte zum Speichern vorhanden.', { type: 'warning', title: 'Hinweis' });
        return;
    }
    
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        projects: projects
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const filename = `Leitungsprojekte_${formatDateForFile(new Date())}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showModal(`${projects.length} Projekt(e) wurden gespeichert als:\n${filename}`, { type: 'success', title: 'Gespeichert' });
}


/**
 * importProjects.
 * @returns {void}
 */
export function importProjects(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            // Prüfen ob gültiges Format
            if (!importData.projects || !Array.isArray(importData.projects)) {
                throw new Error('Ungültiges Dateiformat');
            }
            
            const existingProjects = getProjects();
            const importCount = importData.projects.length;
            
            // Fragen ob ersetzen oder hinzufügen
            if (existingProjects.length > 0) {
                const choice = await showModal(
                    `Es wurden ${importCount} Projekt(e) gefunden.\n\nSie haben bereits ${existingProjects.length} Projekt(e).\n\nMöchten Sie alle ersetzen?`,
                    { 
                        type: 'warning', 
                        title: 'Projekte importieren',
                        showCancel: true,
                        confirmText: 'Ersetzen',
                        cancelText: 'Abbrechen'
                    }
                );
                if (!choice) {
                    event.target.value = '';
                    return;
                }
            }
            
            // Projekte speichern
            saveProjects(importData.projects);
            loadProjects();
            
            showModal(`${importCount} Projekt(e) wurden erfolgreich importiert.`, { type: 'success', title: 'Import erfolgreich' });
            
        } catch (error) {
            console.error('Import-Fehler:', error);
            showModal('Fehler beim Importieren:\n' + error.message + '\n\nBitte prüfen Sie, ob die Datei ein gültiges Projektformat hat.', { type: 'danger', title: 'Fehler' });
        }
        
        // Input zurücksetzen
        event.target.value = '';
    };
    
    reader.readAsText(file);
}


/**
 * exportCSV.
 * @returns {void}
 */
export function exportCSV() {
    if (!appState.currentProjekt || !appState.currentProjekt.leitungen || appState.currentProjekt.leitungen.length === 0) {
        showModal('Keine Leitungen zum Exportieren vorhanden.', { type: 'warning', title: 'Hinweis' });
        return;
    }
    
    const kategorienDef = appState.katalog && appState.katalog.kategorien ? appState.katalog.kategorien : [
        { id: 'ethercat', name: 'EtherCAT Leitung' },
        { id: 'power', name: 'Power Leitung' },
        { id: 'sensor', name: 'Sensorleitung' },
        { id: 'oelflex', name: 'Ölflexleitung' },
        { id: 'cplink', name: 'CP-Link Leitung' },
        { id: 'sonstiges', name: 'Sonstiges' }
    ];
    
    const grouped = {};
    kategorienDef.forEach(k => grouped[k.id] = []);
    
    appState.currentProjekt.leitungen.forEach(l => {
        const kat = l.kategorie || 'sonstiges';
        if (!grouped[kat]) grouped[kat] = [];
        grouped[kat].push(l);
    });
    
    const headers = ['Position', 'Bezeichnung', 'Gruppe', 'Hersteller', 'Artikelnummer', 'Länge (m)', 'Stecker A', 'Stecker B', 'Notiz'];
    
    let csvRows = [
        `# Projekt: ${appState.currentProjekt.projektnummer} - ${appState.currentProjekt.name}`,
        `# Kunde: ${appState.currentProjekt.kunde || '-'}`,
        `# Liefertermin: ${appState.currentProjekt.liefertermin ? formatDate(appState.currentProjekt.liefertermin) : '-'}`,
        `# Erstellt: ${new Date().toLocaleDateString('de-DE')}`,
        ''
    ];
    
    kategorienDef.forEach(kat => {
        const leitungen = grouped[kat.id];
        if (!leitungen || leitungen.length === 0) return;
        
        csvRows.push('');
        csvRows.push(`# === ${kat.name} (${leitungen.length}) ===`);
        csvRows.push(headers.join(';'));
        
        leitungen.forEach(l => {
            const row = [
                l.position,
                l.bezeichnung || '',
                getGruppeDisplay(l.gruppe) === '-' ? '' : getGruppeDisplay(l.gruppe),
                l.hersteller || '',
                l.artikelnummer || l.artikelCustom || '',
                l.laenge || '',
                l.steckerA || '',
                l.steckerB || '',
                l.notiz || ''
            ];
            csvRows.push(row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'));
        });
    });
    
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `Leitungsliste_${appState.currentProjekt.projektnummer}_${formatDateForFile(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


/**
 * exportPDF.
 * @returns {void}
 */
export function exportPDF() {
    if (!appState.currentProjekt || !appState.currentProjekt.leitungen || appState.currentProjekt.leitungen.length === 0) {
        showModal('Keine Leitungen zum Exportieren vorhanden.', { type: 'warning', title: 'Hinweis' });
        return;
    }
    
    const kategorienDef = appState.katalog && appState.katalog.kategorien ? appState.katalog.kategorien : [
        { id: 'ethercat', name: 'EtherCAT Leitung', color: [37, 99, 235] },
        { id: 'power', name: 'Power Leitung', color: [245, 158, 11] },
        { id: 'sensor', name: 'Sensorleitung', color: [16, 185, 129] },
        { id: 'oelflex', name: 'Ölflexleitung', color: [139, 92, 246] },
        { id: 'cplink', name: 'CP-Link Leitung', color: [14, 116, 144] },
        { id: 'sonstiges', name: 'Sonstiges', color: [107, 114, 128] }
    ];
    
    const kategorieColors = {
        'ethercat': [242, 124, 34],
        'power': [230, 92, 0],
        'sensor': [58, 58, 58],
        'oelflex': [74, 74, 74],
        'cplink': [14, 116, 144],
        'sonstiges': [90, 90, 90]
    };
    
    const grouped = {};
    kategorienDef.forEach(k => grouped[k.id] = []);
    
    appState.currentProjekt.leitungen.forEach(l => {
        const kat = l.kategorie || 'sonstiges';
        if (!grouped[kat]) grouped[kat] = [];
        grouped[kat].push(l);
    });
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.setFontSize(18);
    doc.text('Leitungsliste', 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Projekt: ${appState.currentProjekt.projektnummer} - ${appState.currentProjekt.name}`, 14, 30);
    doc.text(`Kunde: ${appState.currentProjekt.kunde || '-'}`, 14, 36);
    doc.text(`Liefertermin: ${appState.currentProjekt.liefertermin ? formatDate(appState.currentProjekt.liefertermin) : '-'}`, 14, 42);
    
    let currentY = 55;
    
    kategorienDef.forEach(kat => {
        const leitungen = grouped[kat.id];
        if (!leitungen || leitungen.length === 0) return;
        
        if (currentY > 170) {
            doc.addPage();
            currentY = 20;
        }
        
        doc.setFontSize(12);
        doc.setTextColor(...(kategorieColors[kat.id] || [0, 0, 0]));
        doc.text(`${kat.name} (${leitungen.length})`, 14, currentY);
        currentY += 5;
        
        const tableData = leitungen.map(l => [
            l.position,
            l.bezeichnung || '-',
            l.hersteller || '-',
            l.artikelnummer || l.artikelCustom || '-',
            l.laenge ? `${l.laenge} m` : '-',
            l.steckerA || '-',
            l.steckerB || '-'
        ]);
        
        doc.autoTable({
            startY: currentY,
            head: [['Pos.', 'Bezeichnung', 'Hersteller', 'Artikelnr.', 'Länge', 'Stecker A', 'Stecker B']],
            body: tableData,
            styles: {
                fontSize: 8,
                cellPadding: 2
            },
            headStyles: {
                fillColor: kategorieColors[kat.id] || [107, 114, 128],
                textColor: 255,
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [245, 247, 250]
            },
            columnStyles: {
                0: { cellWidth: 15 },
                1: { cellWidth: 55 },
                2: { cellWidth: 40 },
                3: { cellWidth: 45 },
                4: { cellWidth: 20 },
                5: { cellWidth: 40 },
                6: { cellWidth: 40 }
            }
        });
        
        currentY = doc.lastAutoTable.finalY + 10;
    });
    
    const pageCount = doc.internal.getNumberOfPages();
    const pageHeight = doc.internal.pageSize.height;
    
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128);
        doc.text(
            `Erstellt am ${new Date().toLocaleDateString('de-DE')} | Seite ${i} von ${pageCount}`,
            14,
            pageHeight - 10
        );
    }
    
    doc.save(`Leitungsliste_${appState.currentProjekt.projektnummer}_${formatDateForFile(new Date())}.pdf`);
}
