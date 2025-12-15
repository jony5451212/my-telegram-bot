const { google } = require('googleapis');
const path = require('path');

// Key file path
const KEY_FILE_PATH = path.join(__dirname, 'google-key.json');

async function appendDataToSheet(data, sheetName = 'Malumot1') {
    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const googleSheets = google.sheets({ version: 'v4', auth: client });

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!spreadsheetId) {
        throw new Error('GOOGLE_SHEET_ID topilmadi. .env faylini tekshiring.');
    }

    // Determine values based on sheetName
    let values = [];

    if (sheetName === 'Malumot1') {
        values = [[
            data.ism,
            data.familiya,
            data.ish_joyi,
            data.telefon,
            data.oneid_login,
            data.oneid_parol,
            new Date().toLocaleString()
        ]];
    } else if (sheetName === 'Dalolatnomalar') {
        values = [[
            data.korxona,
            data.rasmiylashtirdi,
            data.tuman,
            data.raqam,
            data.sana,
            new Date().toLocaleString()
        ]];
    } else if (sheetName === 'Zametkalar') {
        values = [[
            new Date().toLocaleString(),
            data.matn
        ]];
    } else if (sheetName === 'Pul aylanmasi') {
        values = [[
            new Date().toLocaleString(),
            data.turi,   // Kirim yoki Chiqim
            data.summa,
            data.tavsif
        ]];
    }

    try {
        await googleSheets.spreadsheets.values.append({
            auth,
            spreadsheetId,
            range: `${sheetName}!A:Z`, // Dynamic range
            valueInputOption: 'USER_ENTERED',
            resource: {
                values,
            },
        });
        console.log(`Ma'lumotlar '${sheetName}' sahifasiga muvaffaqiyatli qo'shildi.`);
        return true;
    } catch (error) {
        console.error('Google Sheetsga yozishda xatolik:', error);
        throw error;
    }
}

async function getRows(sheetName = 'Malumot1') {
    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const googleSheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    try {
        const getRows = await googleSheets.spreadsheets.values.get({
            auth,
            spreadsheetId,
            range: `${sheetName}!A:Z`,
        });
        return getRows.data.values || [];
    } catch (error) {
        console.error('Ma\'lumot o\'qishda xatolik:', error);
        return [];
    }
}

module.exports = { appendDataToSheet, getRows };
