const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Excel generatsiya qilish
function generateExcel(data, sheetName) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Auto-width columns (simple estimation)
    const colWidths = data[0].map((_, i) => {
        const maxLen = data.reduce((max, row) => Math.max(max, (row[i] || '').toString().length), 10);
        return { wch: maxLen + 2 };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const filename = `${sheetName}_${Date.now()}.xlsx`;
    const filePath = path.join(__dirname, filename);

    XLSX.writeFile(wb, filePath);
    return filePath;
}

// PDF generatsiya qilish
function generatePDF(data, sheetName) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const filename = `${sheetName}_${Date.now()}.pdf`;
        const filePath = path.join(__dirname, filename);

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
