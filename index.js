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

        // Faqat Contact qabul qilamiz
        if (ctx.message.contact) {
            phoneRaw = ctx.message.contact.phone_number;
        } else {
            // Agar matn yozsa yoki boshqa narsa yuborsa -> Qaytarib yuboramiz
            await ctx.reply('⚠️ Iltimos, telefon raqamini qo\'lda yozmang!\n\nPastdagi "📞 Raqamni yuborish" tugmasini bosing 👇',
                Markup.keyboard([
                    [Markup.button.contactRequest('📞 Raqamni yuborish')]
                ]).oneTime().resize()
            );
            return; // Keyingi qadamga o'tmaymiz
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

    // 6-qadam: Parol qabul qilish va TASDIQLASH (Step 5 -> Step 6)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.wizard.state.data) ctx.wizard.state.data = {};

        if (!ctx.message || !ctx.message.text) return ctx.reply('Iltimos, matn ko\'rinishida yozing.');
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
            ['✅ Ha', '❌ Yo\'q']
        ]).oneTime().resize());

        return ctx.wizard.next();
    },

    // 7-qadam: Tasdiqlashni tekshirish (Step 6)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();

        const answer = ctx.message.text;

        if (answer === '❌ Yo\'q') {
            await ctx.reply('Tushunarli. Boshqatdan boshlaymiz. 🔄');
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
            await ctx.reply('✅ Ma\'lumotlaringiz muvaffaqiyatli saqlandi! Yana qo\'shish uchun /start ni bosing.', mainMenu);
        } catch (error) {
            console.error('Xatolik:', error);
            await ctx.reply('❌ Xatolik yuz berdi. /start bilan qayta urining.', mainMenu);
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

    // 5. Sana qabul qilish va TASDIQLASH (Step 4 -> Step 5)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();
        if (!ctx.scene.state.data) ctx.scene.state.data = {};
        if (!ctx.message || !ctx.message.text) return ctx.reply('Matn kiriting.');

        ctx.scene.state.data.sana = ctx.message.text;

        // Summary
        const d = ctx.scene.state.data;
        const summary = `📋 **Dalolatnomani tekshiring:**\n\n` +
            `🏢 **Korxona:** ${d.korxona}\n` +
            `👤 **Rasmiylashtirdi:** ${d.rasmiylashtirdi}\n` +
            `📍 **Tuman:** ${d.tuman}\n` +
            `🔢 **Raqam:** ${d.raqam}\n` +
            `📅 **Sana:** ${d.sana}\n\n` +
            `Barchasi to'g'rimi?`;

        await ctx.replyWithMarkdown(summary, Markup.keyboard([
            ['✅ Ha', '❌ Yo\'q']
        ]).oneTime().resize());

        return ctx.wizard.next();
    },

    // 6. Tasdiqlashni tekshirish (Step 5)
    async (ctx) => {
        if (ctx.message && ctx.message.text === '/start') return ctx.scene.reenter();

        const answer = ctx.message.text;

        if (answer === '❌ Yo\'q') {
            await ctx.reply('Tushunarli. Boshqatdan boshlaymiz. 🔄');
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
    await ctx.reply('Yangi dalolatnoma kiritish.\n\n1. Korxona nomini kiriting:', Markup.keyboard([['/start']]).resize());
});


// ADMIN PANEL SCENE
const adminScene = new Scenes.BaseScene('admin_scene');

adminScene.enter(async (ctx) => {
    await ctx.reply('🔒 Admin paneliga kirish uchun parolni kiriting:', Markup.keyboard([['/start']]).resize());
});

adminScene.on('text', async (ctx) => {
    const password = process.env.ADMIN_PASSWORD || '7777'; // Fallback
    const input = ctx.message.text;

    if (input === '/start') {
        return ctx.scene.leave(); // Let the global start handler pick it up? 
        // Actually global start handler might not pick it up if we just leave. 
        // Better to re-enter main menu manually or let the flow drop.
        // But bot.start is global.
    }

    if (input === password) {
        await ctx.reply('✅ Admin rejimidasiz! Kerakli bo\'limni tanlang:',
            Markup.keyboard([
                ['📊 Statistika', '👥 Foydalanuvchilar'],
                ['🔙 Chiqish']
            ]).resize()
        );
        return ctx.scene.enter('admin_dashboard');
    } else {
        await ctx.reply('❌ Parol noto\'g\'ri! Qaytadan urining yoki /start bosing.');
    }
});

// ADMIN DASHBOARD SCENE (To keep admin context)
const adminDashboard = new Scenes.BaseScene('admin_dashboard');

adminDashboard.hears('📊 Statistika', async (ctx) => {
    await ctx.reply('⏳ Ma\'lumotlar yuklanmoqda...');

    try {
        const { getRows } = require('./sheets');
        const rows = await getRows('Malumot1'); // Xodimlar sheet

        if (!rows || rows.length <= 1) {
            return ctx.reply('📭 Hozircha ro\'yxatdan o\'tganlar yo\'q.');
        }

        // Header row (0) ni tashlab ketamiz
        const dataRows = rows.slice(1);
        const total = dataRows.length;

        let msg = `📊 **Jami ro'yxatdan o'tganlar:** ${total} ta\n\n`;
        msg += `📱 **Telefon raqamlar:**\n`;

        // Oxirgi 15 tani ko'rsatish (juda ko'payib ketsa xatolik bermasligi uchun)
        const recent = dataRows.slice(-15).reverse();

        recent.forEach((row, index) => {
            // row[0] = Ism, row[1] = Familiya, row[3] = Telefon
            // Agar sheet tartibi o'zgarmagan bo'lsa
            const name = row[0] || '-';
            const surname = row[1] || '';
            const phone = row[3] || 'Yo\'q';
            msg += `${index + 1}. ${name} ${surname} — ${phone}\n`;
        });

        if (total > 15) {
            msg += `\n... va yana ${total - 15} kishi.`;
        }

        await ctx.reply(msg);
    } catch (e) {
        console.error('Statistika xatosi:', e);
        await ctx.reply('❌ Statistika olishda xatolik bo\'ldi.');
    }
});

adminDashboard.hears('👥 Foydalanuvchilar', async (ctx) => {
    await ctx.reply('👥 Bu yerda foydalanuvchilar ro\'yxati bo\'ladi.');
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


const stage = new Scenes.Stage([wizardSteps, dalolatnomaWizard, adminScene, adminDashboard]);
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
    ['Xodim haqida ma\'lumotlar', 'Dalolatnoma kiritish'],
    ['🔒 Admin Panel']
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

// Handle "Admin Panel" button
bot.hears('🔒 Admin Panel', async (ctx) => {
    await ctx.scene.enter('admin_scene');
});

// Catch-all for unhandled messages (prevents "freezing" feeling)
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
