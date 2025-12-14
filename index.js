require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const { appendDataToSheet } = require('./sheets');

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

// Wizard qadamlari
const wizardSteps = new Scenes.WizardScene(
    'data_collection_wizard',

    // 1-qadam: Ismni qabul qilish va Familiya so'rash (Step 0)
    async (ctx) => {
        // Restart logic
        if (ctx.message && ctx.message.text === '/start') {
            await ctx.reply('Boshidan boshlaymiz.');
            return ctx.scene.reenter();
        }

        // Initialize data if missing (safety check)
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, ismingizni matn ko\'rinishida yozing.');

        ctx.wizard.state.data.ism = capitalize(ctx.message.text);
        await ctx.reply('2. Familiyangizni kiriting:');
        return ctx.wizard.next();
    },

    // 2-qadam: Familiyani qabul qilish va Ish joyini so'rash (Step 1)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, matn ko\'rinishida yozing.');
        ctx.wizard.state.data.familiya = capitalize(ctx.message.text);
        await ctx.reply('3. Ish joyingizni kiriting:');
        return ctx.wizard.next();
    },

    // 3-qadam: Ish joyini qabul qilish va Telefon so'rash (Step 2)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, matn ko\'rinishida yozing.');
        ctx.wizard.state.data.ish_joyi = capitalize(ctx.message.text);
        await ctx.reply('4. Telefon raqamingizni kiriting:', Markup.keyboard([
            [Markup.button.contactRequest('📞 Raqamni yuborish')]
        ]).oneTime().resize());
        return ctx.wizard.next();
    },

    // 4-qadam: Telefonni qabul qilish va OneID Login so'rash (Step 3)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        let phoneRaw = '';
        if (ctx.message.contact) {
            phoneRaw = ctx.message.contact.phone_number;
        } else if (ctx.message.text) {
            phoneRaw = ctx.message.text;
        } else {
            return ctx.reply('Iltimos, telefon raqamingizni yuboring yoki yozing.');
        }

        ctx.wizard.state.data.telefon = formatPhone(phoneRaw);

        await ctx.reply('5. One ID loginingizni kiriting:', Markup.removeKeyboard());
        return ctx.wizard.next();
    },

    // 5-qadam: Loginni qabul qilish va Parol so'rash (Step 4)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, matn ko\'rinishida yozing.');
        ctx.wizard.state.data.oneid_login = ctx.message.text;
        await ctx.reply('6. One ID parolingizni kiriting:');
        return ctx.wizard.next();
    },

    // 6-qadam: Parolni qabul qilish va yakunlash (Step 5)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, matn ko\'rinishida yozing.');
        ctx.wizard.state.data.oneid_parol = ctx.message.text;

        await ctx.reply('Rahmat! Ma\'lumotlar saqlanmoqda... ⏳');

        try {
            await appendDataToSheet(ctx.wizard.state.data);
            await ctx.reply('✅ Ma\'lumotlaringiz muvaffaqiyatli saqlandi! Yana qo\'shish uchun /start ni bosing.',
                Markup.keyboard([['/start']]).resize()
            );
        } catch (error) {
            console.error('Xatolik:', error);
            await ctx.reply('❌ Xatolik yuz berdi. P.S. Google Sheet "Editor" ruxsatini tekshiring. /start bilan qayta urining.');
        }
        return ctx.scene.leave();
    }
);

// Scene Entry Handler - Runs immediately when entering the scene
wizardSteps.enter(async (ctx) => {
    ctx.scene.state.data = {}; // Initialize state using ctx.scene.state, safe for entry
    // Hide the main menu keyboard when entering wizard
    await ctx.reply(
        'Assalomu alaykum! Ma\'lumotlarni kiritish uchun men sizga bir nechta savol beraman.\n\n1. Ismingizni kiriting:',
        Markup.keyboard([['/start']]).resize()
    );
});

// Xodimlar ro'yxati
const OFFICIALS = [
    'А.Бобомуродов', 'А.Рўзибоев', 'Б.Узоқов', 'И.Амиров',
    'Қ.Аллаев', 'С.Жомуродов', 'Т.Рустамов', 'Ў.Арабов',
    'У.Худоёров', 'Х.Холматов', 'Ш.Турдиев'
];

// DALOLATNOMA Wizard
const dalolatnomaWizard = new Scenes.WizardScene(
    'dalolatnoma_wizard',

    // 1. Korxona nomini qabul qilish va Kim rasmiylashtirdi so'rash (Step 0)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') {
            await ctx.reply('Boshidan boshlaymiz.');
            return ctx.scene.reenter();
        }

        if (!ctx.scene.state.data) ctx.scene.state.data = {};
        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, korxona nomini matn ko\'rinishida yozing.');

        ctx.scene.state.data.korxona = capitalize(ctx.message.text);

        // Xodimlar buttonlarini 2 qator qilib chiqarish
        const buttons = [];
        for (let i = 0; i < OFFICIALS.length; i += 2) {
            const row = [];
            row.push(OFFICIALS[i]);
            if (OFFICIALS[i + 1]) row.push(OFFICIALS[i + 1]);
            buttons.push(row);
        }
        buttons.push(['/start']);

        await ctx.reply('2. Dalolatnomani kim rasmiylashtirdi?', Markup.keyboard(buttons).resize());
        return ctx.wizard.next();
    },

    // 2. Kim rasmiylashtirdi qabul qilish va Tuman so'rash (Step 1)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.scene.state.data) ctx.scene.state.data = {};

        // Agar ro'yxatdan tanlamasa
        if (!OFFICIALS.includes(ctx.message.text)) {
            return ctx.reply('Iltimos, quyidagi xodimlardan birini tanlang.');
        }

        ctx.scene.state.data.rasmiylashtirdi = ctx.message.text;
        await ctx.reply('3. Tuman nomini kiriting:', Markup.keyboard([['/start']]).resize());
        return ctx.wizard.next();
    },

    // 3. Tuman qabul qilish va Raqam so'rash (Step 2)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.scene.state.data) ctx.scene.state.data = {};
        if (!ctx.message || !ctx.message.text) return ctx.reply('Matn kiriting.');

        ctx.scene.state.data.tuman = capitalize(ctx.message.text);
        await ctx.reply('4. Dalolatnoma raqamini kiriting (faqat raqam):');
        return ctx.wizard.next();
    },

    // 4. Raqam qabul qilish va Sana so'rash (Step 3)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.scene.state.data) ctx.scene.state.data = {};
        if (!ctx.message || !ctx.message.text) return ctx.reply('Matn kiriting.');

        // Format DKSH prefix
        const numberInput = ctx.message.text.replace(/\D/g, ''); // faqat raqamlarni olamiz
        ctx.scene.state.data.raqam = `DKSH ${numberInput}`;

        await ctx.reply('5. Dalolatnoma sanasini kiriting (kun.oy.yil):');
        return ctx.wizard.next();
    },

    // 5. Sana qabul qilish va Finish (Step 4)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.scene.state.data) ctx.scene.state.data = {};
        if (!ctx.message || !ctx.message.text) return ctx.reply('Matn kiriting.');

        ctx.scene.state.data.sana = ctx.message.text;

        await ctx.reply('Ma\'lumotlar saqlanmoqda... ⏳');

        try {
            // Pass 'Dalolatnomalar' as the second argument
            await appendDataToSheet(ctx.scene.state.data, 'Dalolatnomalar');
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
    await ctx.reply('Yangi dalolatnoma kiritish.\n\n1. Korxona nomini kiriting:', Markup.keyboard([['/start']]).resize());
});


const stage = new Scenes.Stage([wizardSteps, dalolatnomaWizard]);
bot.use(session());
bot.use(stage.middleware());

// Global error handling
bot.catch((err, ctx) => {
    console.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
    // Try to reply if possible
    try {
        ctx.reply("Texnik xatolik. /start ni bosing.");
    } catch (e) { }
});

// Main Menu Keyboard
const mainMenu = Markup.keyboard([
    ['Xodim haqida ma\'lumotlar'],
    ['Dalolatnoma kiritish']
]).resize();

// Start command - Shows the Main Menu
bot.start(async (ctx) => {
    try {
        await ctx.scene.leave(); // Ensure we are not in a scene
    } catch (e) { }

    await ctx.reply('Assalomu alaykum! Kerakli bo\'limni tanlang:', mainMenu);
});

// Handle "Xodim haqida ma'lumotlar" button
bot.hears('Xodim haqida ma\'lumotlar', async (ctx) => {
    await ctx.scene.enter('data_collection_wizard');
});

// Handle "Dalolatnoma kiritish" button
bot.hears('Dalolatnoma kiritish', async (ctx) => {
    await ctx.scene.enter('dalolatnoma_wizard');
});

bot.launch().then(() => {
    console.log('Bot ishga tushdi!');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
