require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { appendDataToSheet } = require('./sheets');
// http server removed, Telegraf handles it now

const bot = new Telegraf(process.env.BOT_TOKEN);

// Helper functions
const capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};

const formatPhone = (input) => {
    if (!input) return '';
    // Remove all non-numeric characters
    let cleaned = input.replace(/\D/g, '');

    // If user entered +998..., remove it to get last 9 digits
    if (cleaned.length > 9) {
        cleaned = cleaned.slice(-9);
    }

    // Ensure we have 9 digits for standard formatting
    // 90 123 45 67 -> 90-123-45-67
    if (cleaned.length === 9) {
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5, 7)}-${cleaned.slice(7, 9)}`;
    }

    // Fallback: return as is if not matching expected length
    return input;
};

// Keyboards
const mainMenu = Markup.keyboard([
    ['Xodim haqida ma\'lumotlar', 'Dalolatnoma kiritish'],
    ['🔒 Admin Panel']
]).resize();

const adminKeyboard = Markup.keyboard([
    ['📊 Statistika', '👥 Foydalanuvchilar'],
    ['🤖 Shaxsiy yordamchi'],
    ['📥 Ma\'lumotlarni yuklash'],
    ['🔙 Chiqish']
]).resize();

const assistantKeyboard = Markup.keyboard([
    ['📝 Zametkalar'],
    ['💰 Pul aylanmasi'],
    ['🔙 Orqaga']
]).resize();

const moneyKeyboard = Markup.keyboard([
    ['➕ Tushum', '➖ Xarajat'],
    ['🔙 Orqaga']
]).resize();

// Navigation keyboard for wizards
const navKeyboard = Markup.keyboard([
    ['🏠 Bosh menyu']
]).resize(); // oneTime removed to keep it visible

// Wizard qadamlari
const wizardSteps = new Scenes.WizardScene(
    'data_collection_wizard',

    // 1-qadam: Ismni qabul qilish va Familiya so'rash (Step 0)
    async (ctx) => {
        // Restart logic
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Jarayon bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }

        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};
        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, ismingizni matn ko\'rinishida yozing.', navKeyboard);

        ctx.wizard.state.data.ism = capitalize(ctx.message.text);
        await ctx.reply('2. Familiyangizni kiriting:', navKeyboard);
        return ctx.wizard.next();
    },

    // 2-qadam: Familiyani qabul qilish va Ish joyini so'rash (Step 1)
    async (ctx) => {
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Jarayon bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, matn ko\'rinishida yozing.', navKeyboard);
        ctx.wizard.state.data.familiya = capitalize(ctx.message.text);
        await ctx.reply('3. Ish joyingizni kiriting:', navKeyboard);
        return ctx.wizard.next();
    },

    // 3-qadam: Ish joyini qabul qilish va Telefon so'rash (Step 2)
    async (ctx) => {
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Jarayon bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, matn ko\'rinishida yozing.', navKeyboard);
        ctx.wizard.state.data.ish_joyi = capitalize(ctx.message.text);

        await ctx.reply('4. Telefon raqamingizni kiriting:', Markup.keyboard([
            [Markup.button.contactRequest('📞 Raqamni yuborish')],
            ['🏠 Bosh menyu']
        ]).resize()); // Keep resize, remove oneTime
        return ctx.wizard.next();
    },

    // 4-qadam: Telefonni qabul qilish va OneID Login so'rash (Step 3)
    async (ctx) => {
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Jarayon bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        let phoneRaw = '';

        // Faqat Contact qabul qilamiz
        if (ctx.message.contact) {
            phoneRaw = ctx.message.contact.phone_number;
        } else {
            // Agar matn yozsa yoki boshqa narsa yuborsa -> Qaytarib yuboramiz
            await ctx.reply('⚠️ Iltimos, telefon raqamini qo\'lda yozmang!\n\nPastdagi "📞 Raqamni yuborish" tugmasini bosing 👇',
                Markup.keyboard([
                    [Markup.button.contactRequest('📞 Raqamni yuborish')],
                    ['🏠 Bosh menyu']
                ]).resize()
            );
            return; // Keyingi qadamga o'tmaymiz
        }

        ctx.wizard.state.data.telefon = formatPhone(phoneRaw);

        await ctx.reply('5. One ID loginingizni kiriting:', navKeyboard);
        return ctx.wizard.next();
    },

    // 5-qadam: Loginni qabul qilish va Parol so'rash (Step 4)
    async (ctx) => {
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Jarayon bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, matn ko\'rinishida yozing.', navKeyboard);
        ctx.wizard.state.data.oneid_login = ctx.message.text;
        await ctx.reply('6. One ID parolingizni kiriting:', navKeyboard);
        return ctx.wizard.next();
    },

    // 6-qadam: Parol qabul qilish va TASDIQLASH (Step 5 -> Step 6)
    async (ctx) => {
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Jarayon bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, matn ko\'rinishida yozing.', navKeyboard);
        ctx.wizard.state.data.oneid_parol = ctx.message.text;

        // Ma'lumotlarni yig'ib ko'rsatamiz
        const d = ctx.wizard.state.data;
        const summary = `📋 **Ma'lumotlarni tekshiring:**\n\n` +
            `👤 **Ism:** ${d.ism}\n` +
            `👤 **Familiya:** ${d.familiya}\n` +
            `🏢 **Ish joyi:** ${d.ish_joyi}\n` +
            `📞 **Telefon:** ${d.telefon}\n` +
            `🆔 **Login:** ${d.oneid_login}\n` +
            `🔑 **Parol:** ${d.oneid_parol}\n\n` +
            `Barchasi to'g'rimi?`;

        await ctx.replyWithMarkdown(summary, Markup.keyboard([
            ['✅ Ha', '❌ Yo\'q'],
            ['🏠 Bosh menyu']
        ]).resize());

        return ctx.wizard.next();
    },

    // 7-qadam: Tasdiqlashni tekshirish (Step 6)
    async (ctx) => {
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }

        const answer = ctx.message.text;

        if (answer === '❌ Yo\'q') {
            await ctx.reply('Tushunarli. Boshqatdan boshlaymiz. 🔄', navKeyboard); // Use navKeyboard here
            return ctx.scene.reenter();
        }

        if (answer !== '✅ Ha') {
            await ctx.reply('Iltimos, "✅ Ha" yoki "❌ Yo\'q" tugmasini bosing.');
            return; // Stay in this step
        }

        // Agar "Ha" bo'lsa
        await ctx.reply('Rahmat! Ma\'lumotlar saqlanmoqda... ⏳', Markup.removeKeyboard());

        try {
            await appendDataToSheet(ctx.wizard.state.data);
            await sendAdminNotification(ctx, 'Xodim', ctx.wizard.state.data); // Notify Admin
            await ctx.reply('✅ Ma\'lumotlaringiz muvaffaqiyatli saqlandi!', mainMenu);
        } catch (error) {
            console.error('Xatolik:', error);
            await ctx.reply('❌ Xatolik yuz berdi. /start bilan qayta urining.', mainMenu);
        }
        return ctx.scene.leave();
    }
);

// Scene Entry Handler
wizardSteps.enter(async (ctx) => {
    ctx.scene.state.data = {};
    await ctx.reply(
        'Assalomu alaykum! Ma\'lumotlarni kiritish uchun men sizga bir nechta savol beraman.\n\n1. Ismingizni kiriting:',
        navKeyboard // Use global navKeyboard
    );
});

// Xodimlar ro'yxati
const OFFICIALS = [
    'А.Бобомуродов', 'А.Рўзибоев', 'Б.Узоқов', 'И.Амиров',
    'Қ.Аллаев', 'С.Жомуродов', 'Т.Рустамов', 'Ў.Арабов',
    'У.Худоёров', 'Х.Холматов', 'Ш.Турдиев'
];

// Admin Notification Helper
async function sendAdminNotification(ctx, type, data) {
    const adminId = process.env.ADMIN_CHAT_ID;
    console.log('Attempting to notify admin. ID:', adminId); // DEBUG

    if (!adminId) {
        console.error('Admin ID is missing in .env!');
        return;
    }

    let message = '';
    if (type === 'Xodim') {
        message = `🔔 Yangi Xodim Qo'shildi!\n\n` +
            `👤 ${data.ism} ${data.familiya}\n` +
            `🏢 ${data.ish_joyi}\n` +
            `📞 ${data.telefon}\n` +
            `🆔 ${data.oneid_login}\n` +
            `🔑 ${data.oneid_parol}`;
    } else if (type === 'Dalolatnoma') {
        message = `🔔 Yangi Dalolatnoma!\n\n` +
            `🏢 ${data.korxona}\n` +
            `👤 ${data.rasmiylashtirdi}\n` +
            `📍 ${data.tuman}\n` +
            `🔢 ${data.raqam} | 📅 ${data.sana}`;
    }

    try {
        // Removing parse_mode: 'Markdown' to prevent errors with special characters in user input
        await ctx.telegram.sendMessage(adminId, message);
        console.log('Admin notification sent successfully!');
    } catch (e) {
        console.error('Admin notification failed:', e);
        // Retry with simple text if something obscure failed
        try {
            await ctx.telegram.sendMessage(adminId, "⚠️ Yangi ma'lumot bor, lekin formatlashda xatolik bo'ldi.");
        } catch (e2) { }
    }
}

// DALOLATNOMA Wizard
const dalolatnomaWizard = new Scenes.WizardScene(
    'dalolatnoma_wizard',

    // 1. Korxona nomini qabul qilish va Kim rasmiylashtirdi so'rash (Step 0)
    async (ctx) => {
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Jarayon bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }

        if (!ctx.scene.state.data) ctx.scene.state.data = {};
        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, korxona nomini matn ko\'rinishida yozing.', navKeyboard);

        ctx.scene.state.data.korxona = capitalize(ctx.message.text);

        // Xodimlar buttonlarini 2 qator qilib chiqarish
        const buttons = [];
        for (let i = 0; i < OFFICIALS.length; i += 2) {
            const row = [];
            row.push(OFFICIALS[i]);
            if (OFFICIALS[i + 1]) row.push(OFFICIALS[i + 1]);
            buttons.push(row);
        }
        buttons.push(['🏠 Bosh menyu']);

        await ctx.reply('2. Dalolatnomani kim rasmiylashtirdi?', Markup.keyboard(buttons).resize());
        return ctx.wizard.next();
    },

    // 2. Kim rasmiylashtirdi qabul qilish va Tuman so'rash (Step 1)
    async (ctx) => {
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Jarayon bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }
        if (!ctx.scene.state.data) ctx.scene.state.data = {};

        // Agar ro'yxatdan tanlamasa
        if (!OFFICIALS.includes(ctx.message.text)) {
            return ctx.reply('Iltimos, quyidagi xodimlardan birini tanlang.');
        }

        ctx.scene.state.data.rasmiylashtirdi = ctx.message.text;
        await ctx.reply('3. Tuman nomini kiriting:', navKeyboard);
        return ctx.wizard.next();
    },

    // 3. Tuman qabul qilish va Raqam so'rash (Step 2)
    async (ctx) => {
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Jarayon bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }
        if (!ctx.scene.state.data) ctx.scene.state.data = {};
        if (!ctx.message || !ctx.message.text) return ctx.reply('Matn kiriting.', navKeyboard);

        ctx.scene.state.data.tuman = capitalize(ctx.message.text);
        await ctx.reply('4. Dalolatnoma raqamini kiriting (faqat raqam):', navKeyboard);
        return ctx.wizard.next();
    },

    // 4. Raqam qabul qilish va Sana aniqlash (Step 3)
    async (ctx) => {
        console.log('STEP 3: Raqam qabul qilish'); // DEBUG
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Jarayon bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }
        if (!ctx.scene.state.data) ctx.scene.state.data = {};
        if (!ctx.message || !ctx.message.text) return ctx.reply('Matn kiriting.', navKeyboard);

        // Remove non-digits
        const numberInput = ctx.message.text.replace(/\D/g, '');

        // Validation: Must be exactly 12 digits
        if (numberInput.length !== 12) {
            return ctx.reply('❌ Iltimos, faqat 12 xonali raqam kiriting.\nMasalan: 010120241234', navKeyboard);
        }

        ctx.scene.state.data.raqam = `DKSH ${numberInput}`;

        // Extract Date: First 8 digits -> DDMMYYYY
        const datePart = numberInput.substring(0, 8);
        const day = parseInt(datePart.substring(0, 2), 10);
        const month = parseInt(datePart.substring(2, 4), 10);
        const year = parseInt(datePart.substring(4, 8), 10);

        // Date Validation
        if (month < 1 || month > 12) {
            return ctx.reply(`❌ Sana xato! Oy ${month} bo'lishi mumkin emas (1-12). Rakamingizni tekshirib qaytadan kiriting.`, navKeyboard);
        }
        if (year < 2023) {
            return ctx.reply(`❌ Sana xato! Yil 2023 dan kichik bo'lishi mumkin emas (${year}). Rakamingizni tekshirib qaytadan kiriting.`, navKeyboard);
        }
        if (day < 1 || day > 31) {
            return ctx.reply(`❌ Sana xato! Kun ${day} bo'lishi mumkin emas.`, navKeyboard);
        }

        const formattedDate = `${datePart.substring(0, 2)}.${datePart.substring(2, 4)}.${year}`;
        ctx.scene.state.data.sana = formattedDate;

        console.log(`Date extracted: ${formattedDate}. Moving to Step 4.`); // DEBUG

        // Ask for confirmation
        await ctx.reply(`Dalolatnoma sanasi: ${formattedDate} da rasmiylashtirilganmi?\n\nSanani tasdiqlaysizmi?`, Markup.keyboard([
            ['✅ Ha', '❌ Yo\'q'],
            ['🏠 Bosh menyu']
        ]).resize());

        return ctx.wizard.next();
    },

    // 5. Sanani tasdiqlash yoki Qo'lda kiritish (Step 4 -> Step 5)
    async (ctx) => {
        console.log('STEP 4: Sanani tasdiqlash'); // DEBUG
        try {
            if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
                await ctx.reply('Jarayon bekor qilindi.', mainMenu);
                return ctx.scene.leave();
            }
            if (!ctx.scene.state.data) ctx.scene.state.data = {};
            const text = ctx.message.text;
            console.log(`Input at Step 4: ${text}`); // DEBUG

            // Agar "Ha" desa -> Summaryga o'tamiz (Relaxed check)
            if (text.includes('Ha') || text === '✅ Ha') {
                // Sana allaqachon state da bor
                console.log('Date confirmed.');
            }
            // Agar "Yo'q" desa -> Qo'lda kiritishni so'raymiz
            else if (text.includes('Yo\'q') || text === '❌ Yo\'q') {
                console.log('Date rejected. Asking manual input.');
                await ctx.reply('Unda sanani qo\'lda kiriting (kun.oy.yil):', Markup.keyboard([['🏠 Bosh menyu']]).resize());
                return; // Stay in this step to receive manual date
            }
            // Agar boshqa matn yozsa (Sana deb hisoblaymiz)
            else {
                console.log('Manual date entered:', text);
                ctx.scene.state.data.sana = text;
            }

            // Summary generation
            const d = ctx.scene.state.data;
            const summary = `📋 **Dalolatnomani tekshiring:**\n\n` +
                `🏢 **Korxona:** ${d.korxona}\n` +
                `👤 **Rasmiylashtirdi:** ${d.rasmiylashtirdi}\n` +
                `📍 **Tuman:** ${d.tuman}\n` +
                `🔢 **Raqam:** ${d.raqam}\n` +
                `📅 **Sana:** ${d.sana}\n\n` +
                `Barchasi to'g'rimi?`;

            await ctx.replyWithMarkdown(summary, Markup.keyboard([
                ['✅ Ha', '❌ Yo\'q'],
                ['🏠 Bosh menyu']
            ]).resize());

            return ctx.wizard.next();

        } catch (err) {
            console.error('Error in Step 4:', err);
            await ctx.reply('Texnik xatolik (Step 4): ' + err.message);
        }
    },

    // 6. Tasdiqlashni tekshirish (Step 5)
    async (ctx) => {
        if (ctx.message && (ctx.message.text === '/start' || ctx.message.text === '🏠 Bosh menyu')) {
            await ctx.reply('Bekor qilindi.', mainMenu);
            return ctx.scene.leave();
        }

        const answer = ctx.message.text;

        if (answer === '❌ Yo\'q') {
            await ctx.reply('Tushunarli. Boshqatdan boshlaymiz. 🔄', navKeyboard);
            return ctx.scene.reenter(); // Use reenter instead of wizard.selectStep(0) for cleaner reset
        }

        if (answer !== '✅ Ha') {
            await ctx.reply('Iltimos, "✅ Ha" yoki "❌ Yo\'q" tugmasini bosing.');
            return;
        }

        await ctx.reply('Ma\'lumotlar saqlanmoqda... ⏳', Markup.removeKeyboard());

        try {
            // Pass 'Dalolatnomalar' as the second argument
            await appendDataToSheet(ctx.scene.state.data, 'Dalolatnomalar');
            await sendAdminNotification(ctx, 'Dalolatnoma', ctx.scene.state.data); // Notify Admin
            await ctx.reply('✅ Dalolatnoma saqlandi!', mainMenu);
        } catch (error) {
            console.error('Xatolik:', error);
            await ctx.reply('❌ Xatolik yuz berdi. "Dalolatnomalar" varog\'i ochilganiga ishonch hosil qiling.', mainMenu);
        }
        return ctx.scene.leave();
    }
);

// Bind enter logic for Dalolatnoma too (optional but good consistency)
dalolatnomaWizard.enter(async (ctx) => {
    ctx.scene.state.data = {};
    await ctx.reply('Yangi dalolatnoma kiritish.\n\n1. Korxona nomini kiriting:', navKeyboard);
});


// ZAMETKALAR WIZARD
const notesWizard = new Scenes.WizardScene(
    'notes_wizard',
    async (ctx) => {
        await ctx.reply('📝 Zametka matnini kiriting:', Markup.keyboard([['🔙 Orqaga']]).resize());
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.text === '🔙 Orqaga') {
            await ctx.reply('Shaxsiy yordamchi:', assistantKeyboard);
            return ctx.scene.leave();
        }

        const text = ctx.message.text;
        try {
            await appendDataToSheet({ matn: text }, 'Zametkalar');
            await ctx.reply('✅ Zametka saqlandi!', assistantKeyboard);
        } catch (e) {
            await ctx.reply('❌ Xatolik yuz berdi.', assistantKeyboard);
        }
        return ctx.scene.leave();
    }
);

// PUL AYLANMASI WIZARD
const moneyWizard = new Scenes.WizardScene(
    'money_wizard',
    // 1. Turi tanlanadi (Enter handlerda set qilinadi yoki shu yerda so'raladi)
    async (ctx) => {
        // We expect the user to have clicked Tushum/Xarajat to enter.
        // But to be robust, we can ask here if not set.
        if (!ctx.wizard.state.type) {
            await ctx.reply('Turini tanlang:', moneyKeyboard);
            return ctx.wizard.next();
        }
        // If type is already set by enter handler, skip to amount
        await ctx.reply(`${ctx.wizard.state.type} summasini kiriting:`, Markup.keyboard([['🔙 Orqaga']]).resize());
        return ctx.wizard.selectStep(2);
    },
    // 2. Handle Type Selection (if manually asked)
    async (ctx) => {
        const text = ctx.message.text;
        if (text === '🔙 Orqaga') {
            await ctx.reply('Shaxsiy yordamchi:', assistantKeyboard);
            return ctx.scene.leave();
        }
        if (text === '➕ Tushum' || text === '➖ Xarajat') {
            ctx.wizard.state.type = text;
            await ctx.reply(`${text} summasini kiriting:`, Markup.keyboard([['🔙 Orqaga']]).resize());
            return ctx.wizard.next();
        }
        await ctx.reply('Iltimos, tugmalardan birini tanlang.');
    },
    // 3. Amount
    async (ctx) => {
        if (ctx.message.text === '🔙 Orqaga') {
            await ctx.reply('Shaxsiy yordamchi:', assistantKeyboard);
            return ctx.scene.leave();
        }
        ctx.wizard.state.amount = ctx.message.text;
        await ctx.reply('Tavsif (Nima uchun?):', Markup.keyboard([['🔙 Orqaga']]).resize());
        return ctx.wizard.next();
    },
    // 4. Description & Save
    async (ctx) => {
        if (ctx.message.text === '🔙 Orqaga') {
            await ctx.reply('Shaxsiy yordamchi:', assistantKeyboard);
            return ctx.scene.leave();
        }

        const data = {
            turi: ctx.wizard.state.type,
            summa: ctx.wizard.state.amount,
            tavsif: ctx.message.text
        };

        try {
            await appendDataToSheet(data, 'Pul aylanmasi');
            await ctx.reply('✅ Muvaffaqiyatli saqlandi!', moneyKeyboard); // Go back to Money Menu
        } catch (e) {
            console.error(e);
            await ctx.reply('❌ Xatolik yuz berdi.', moneyKeyboard);
        }
        return ctx.scene.leave();
    }
);


// ADMIN PANEL SCENE
const adminScene = new Scenes.BaseScene('admin_scene');

adminScene.enter(async (ctx) => {
    await ctx.reply('🔒 Admin paneliga kirish uchun parolni kiriting:', Markup.keyboard([['🏠 Bosh menyu']]).resize());
});

adminScene.on('text', async (ctx) => {
    const password = process.env.ADMIN_PASSWORD || '7777'; // Fallback
    const input = ctx.message.text;

    if (input === '/start' || input === '🏠 Bosh menyu') {
        await ctx.reply('Bosh menyu', mainMenu);
        return ctx.scene.leave();
    }

    if (input === password) {
        await ctx.reply('✅ Admin rejimidasiz! Kerakli bo\'limni tanlang:', adminKeyboard);
        return ctx.scene.enter('admin_dashboard');
    } else {
        await ctx.reply('❌ Parol noto\'g\'ri! Qaytadan urining yoki Bosh menyuga qayting.', Markup.keyboard([['🏠 Bosh menyu']]).resize());
    }
});

// ADMIN DASHBOARD SCENE (To keep admin context)
const adminDashboard = new Scenes.BaseScene('admin_dashboard');

// Ensures keyboard stays visible
adminDashboard.enter(async (ctx) => {
    await ctx.reply('Admin Panel boshqaruv paneli', adminKeyboard);
});

// Helper to show stats page
async function showStatsPage(ctx, type, page = 1, isEdit = false) {
    const { getRows } = require('./sheets');

    // Choose sheet name based on type
    const sheetName = type === 'dalolatnoma' ? 'Dalolatnomalar' : 'Malumot1';
    const rows = await getRows(sheetName);

    if (!rows || rows.length <= 1) {
        const text = '📭 Hozircha ma\'lumot yo\'q.';
        if (isEdit) return ctx.editMessageText(text);
        return ctx.reply(text);
    }

    // Header row dropped
    const dataRows = rows.slice(1);
    const totalItems = dataRows.length;
    const ITEMS_PER_PAGE = 10;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    // Validate page
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;

    const start = (page - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = dataRows.slice(start, end);

    let msg = '';
    if (type === 'dalolatnoma') {
        msg = `📊 **Jami Dalolatnomalar:** ${totalItems} ta\n`;
        msg += `📄 **Sahifa:** ${page} / ${totalPages}\n\n`;
        // Dalolatnoma formati: 0=Korxona, 1=Rasmiylashtirdi, 2=Tuman, 3=Raqam, 4=Sana
        pageItems.forEach((row, index) => {
            const globalIndex = start + index + 1;
            const korxona = row[0] || '-';
            const raqam = row[3] || '-';
            const sana = row[4] || '-';
            msg += `${globalIndex}. 🏢 ${korxona} | № ${raqam} (${sana})\n`;
        });
    } else {
        msg = `📊 **Jami Xodimlar:** ${totalItems} ta\n`;
        msg += `📄 **Sahifa:** ${page} / ${totalPages}\n\n`;
        msg += `📱 **Telefon raqamlar:**\n`;
        // Xodim formati: 0=Ism, 1=Familiya, 3=Telefon
        pageItems.forEach((row, index) => {
            const globalIndex = start + index + 1;
            const name = row[0] || '-';
            const surname = row[1] || '';
            const phone = row[3] || 'Yo\'q';
            msg += `${globalIndex}. ${name} ${surname} — ${phone}\n`;
        });
    }

    // Buttons
    const buttons = [];
    const navigationRow = [];

    if (page > 1) {
        navigationRow.push(Markup.button.callback('⬅️ Oldingi', `stats:${type}:${page - 1}`));
    }
    if (page < totalPages) {
        navigationRow.push(Markup.button.callback('Keyingi ➡️', `stats:${type}:${page + 1}`));
    }

    if (navigationRow.length > 0) buttons.push(navigationRow);
    // Add "Update" button to refresh data
    buttons.push([Markup.button.callback('🔄 Yangilash', `stats:${type}:${page}`)]);

    const keyboard = Markup.inlineKeyboard(buttons);

    // Escape special characters in msg to prevent Markdown errors (basic approach)
    // Or just use 'Markdown' carefully. The previous issue was likely user input having `_` etc.
    // For stats, we control the format, but User Input (Name/Korxona) might have chars.
    // Safest is to remove markdown formatting for variable content or use simple text.
    // Let's try sending without parse_mode for content safety or just simple checks.
    // Actually, let's allow Markdown but be careful. Or better, REMOVE parse_mode for the list part to be safe?
    // User requested "Beautiful", so Markdown is good. Let's wrap unsafe content?
    // Quick Fix: Just use plain text for the user content inside the formatted string? Impossible in one msg.
    // Let's rely on robustness. If it fails, we fall back.

    try {
        if (isEdit) {
            await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
        } else {
            await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
        }
    } catch (e) {
        // Fallback if Markdown fails (e.g. name has underscore)
        const plainMsg = msg.replace(/\*\*/g, '').replace(/`/g, '');
        if (isEdit) await ctx.editMessageText(plainMsg, keyboard);
        else await ctx.reply(plainMsg, keyboard);
    }
}

// Export handlers
adminDashboard.hears('📥 Ma\'lumotlarni yuklash', async (ctx) => {
    await ctx.reply('Qaysi ma\'lumotni yuklab olmoqchisiz?', Markup.inlineKeyboard([
        [Markup.button.callback('👤 Xodimlar', 'export_type:Malumot1')],
        [Markup.button.callback('📝 Dalolatnomalar', 'export_type:Dalolatnomalar')]
    ]));
});

// 1. Type selected, ask for Format
adminDashboard.action(/export_type:(.+)/, async (ctx) => {
    const sheetName = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.deleteMessage(); // Clean up previous menu

    await ctx.reply(`"${sheetName}" uchun formatni tanlang:`, Markup.inlineKeyboard([
        [Markup.button.callback('📊 Excel (.xlsx)', `export_fmt:${sheetName}:xlsx`)],
        [Markup.button.callback('📄 PDF (.pdf)', `export_fmt:${sheetName}:pdf`)]
    ]));
});

// 2. Format selected, Perform Export
adminDashboard.action(/export_fmt:(.+):(.+)/, async (ctx) => {
    const sheetName = ctx.match[1];
    const format = ctx.match[2];
    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    await ctx.reply('⏳ Fayl tayyorlanmoqda, kuting...');

    try {
        const { getRows } = require('./sheets');
        const { generateExcel, generatePDF, deleteFile } = require('./exportService');

        const rows = await getRows(sheetName);

        if (!rows || rows.length === 0) {
            return ctx.reply('❌ Ma\'lumot topilmadi.');
        }

        let filePath;
        if (format === 'xlsx') {
            filePath = generateExcel(rows, sheetName);
        } else {
            filePath = await generatePDF(rows, sheetName);
        }

        await ctx.replyWithDocument({ source: filePath, filename: `${sheetName}.${format}` });

        // Delete temp file after sending
        deleteFile(filePath);

    } catch (e) {
        console.error('Export xatolik:', e);
        await ctx.reply('❌ Fayl yuklashda xatolik yuz berdi.');
    }
});

adminDashboard.hears('📊 Statistika', async (ctx) => {
    // Ask which stats
    await ctx.reply('Qaysi ma\'lumotlarni ko\'rmoqchisiz?', Markup.inlineKeyboard([
        [Markup.button.callback('👤 Xodimlar', 'stats_type:xodim')],
        [Markup.button.callback('📝 Dalolatnomalar', 'stats_type:dalolatnoma')]
    ]));
});

// Handle type selection
adminDashboard.action(/stats_type:(.+)/, async (ctx) => {
    const type = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.deleteMessage(); // Remove the question
    await showStatsPage(ctx, type, 1, false);
});


// Handle pagination actions (Format: stats:type:page)
adminDashboard.action(/stats:(.+):(\d+)/, async (ctx) => {
    const type = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    await showStatsPage(ctx, type, page, true);
    await ctx.answerCbQuery();
});

adminDashboard.hears('👥 Foydalanuvchilar', async (ctx) => {
    await ctx.reply('👥 Bu yerda foydalanuvchilar ro\'yxati bo\'ladi.');
});

adminDashboard.hears('🤖 Shaxsiy yordamchi', async (ctx) => {
    await ctx.reply('Shaxsiy yordamchi bo\'limi:', assistantKeyboard);
});

adminDashboard.hears('🔙 Orqaga', async (ctx) => {
    await ctx.reply('Admin Panel:', adminKeyboard);
});

// Assistant Menu Handlers
adminDashboard.hears('📝 Zametkalar', async (ctx) => {
    await ctx.scene.enter('notes_wizard');
});

adminDashboard.hears('💰 Pul aylanmasi', async (ctx) => {
    await ctx.reply('Pul aylanmasi turi:', moneyKeyboard);
});

// Money Menu Handlers (trigger wizard with state)
adminDashboard.hears(['➕ Tushum', '➖ Xarajat'], async (ctx) => {
    await ctx.scene.enter('money_wizard', { type: ctx.message.text });
});

adminDashboard.hears('🔙 Chiqish', async (ctx) => {
    await ctx.reply('Admin rejimidan chiqdingiz.', mainMenu);
    return ctx.scene.leave();
});

// Handle standard commands inside dashboard
adminDashboard.command('start', (ctx) => {
    ctx.scene.leave();
    return ctx.reply('Bosh menyu:', mainMenu);
});


const stage = new Scenes.Stage([wizardSteps, dalolatnomaWizard, adminScene, adminDashboard, notesWizard, moneyWizard]);
bot.use(session());
bot.use(stage.middleware());

// Global error handling
bot.catch((err, ctx) => {
    console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
    // Try to reply if possible
    try {
        ctx.reply(`Texnik xatolik: ${err.message}\n/start ni bosing.`);
    } catch (e) { }
});



// Start command - Shows the Main Menu
bot.start(async (ctx) => {
    try {
        await ctx.scene.leave(); // Ensure we are not in a scene
    } catch (e) { }

    await ctx.reply('Assalomu alaykum! (v2.0 Yangilandi ✅)\nKerakli bo\'limni tanlang:', mainMenu);
});

// Handle "Xodim haqida ma'lumotlar" button
bot.hears('Xodim haqida ma\'lumotlar', async (ctx) => {
    await ctx.scene.enter('data_collection_wizard');
});

// Handle "Dalolatnoma kiritish" button
bot.hears('Dalolatnoma kiritish', async (ctx) => {
    await ctx.scene.enter('dalolatnoma_wizard');
});

// Handle "Admin Panel" button
// Handle "Admin Panel" button
bot.hears('🔒 Admin Panel', async (ctx) => {
    await ctx.scene.enter('admin_scene');
});

// Global "Main Menu" handler (failsafe for session loss)
bot.hears('🏠 Bosh menyu', async (ctx) => {
    try { await ctx.scene.leave(); } catch (e) { }
    await ctx.reply('Bosh menyu:', mainMenu);
});

// Catch-all for unhandled messages
bot.on('message', async (ctx) => {
    // If not in a scene and no other handler matched
    // We suggest /start to reset
    await ctx.reply('⚠️ Tushunmadim. Agar jarayon to\'xtab qolgan bo\'lsa, iltimos /start ni bosing.');
});

const PORT = process.env.PORT || 3000;
const URL = process.env.RENDER_EXTERNAL_URL; // Render automatically sets this

if (URL) {
    // Serverda (Render) -> Webhook
    bot.launch({
        webhook: {
            domain: URL,
            port: PORT
        }
    }).then(() => {
        console.log(`✅ Bot Webhook rejimida ishga tushdi! URL: ${URL}`);
    });
} else {
    // Kompyuterda -> Polling
    bot.launch().then(() => {
        console.log('✅ Bot Polling (local) rejimida ishga tushdi!');
    });
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
