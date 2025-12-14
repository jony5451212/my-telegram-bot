const XLSX = require('xlsx-js-style'); // Switched to library with Style support
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const os = require('os'); // Add os module

// Excel generatsiya qilish
function generateExcel(data, sheetName) {
    const wb = XLSX.utils.book_new();

    // Create sheet from data
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Styling logic
    // Header Row Style (First Row)
    const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4F81BD" } }, // Blue header
        alignment: { horizontal: "center" }
    };

    // Apply style to first row (A1, B1, ...)
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_cell({ r: 0, c: C }); // Row 0
        if (!ws[address]) continue;
        ws[address].s = headerStyle;
    }

    // Auto-width columns
    if (data.length > 0) {
        const colWidths = data[0].map((_, i) => {
            const maxLen = data.reduce((max, row) => Math.max(max, (row[i] || '').toString().length), 10);
            return { wch: maxLen + 5 };
        });
        ws['!cols'] = colWidths;
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const filename = `${sheetName}_${Date.now()}.xlsx`;
    const filePath = path.join(os.tmpdir(), filename);

    XLSX.writeFile(wb, filePath);
    return filePath;
}

// PDF generatsiya qilish
function generatePDF(data, sheetName) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const filename = `${sheetName}_${Date.now()}.pdf`;
        const filePath = path.join(os.tmpdir(), filename); // Use temp dir

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.fontSize(16).text(sheetName, { align: 'center' });
        doc.moveDown();

        doc.fontSize(10);

        data.forEach((row, i) => {
            // Join row data. Replace undefined/null with empty strings
            const line = row.map(cell => cell || '-').join(' | ');
            doc.text(line);
            doc.moveDown(0.5);
        });

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
}

function deleteFile(filePath) {
    try {
        fs.unlinkSync(filePath);
    } catch (e) {
        console.error('File o\'chirishda xatolik:', e);
    }
}

module.exports = { generateExcel, generatePDF, deleteFile };
