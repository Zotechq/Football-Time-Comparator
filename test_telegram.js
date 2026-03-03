// test-telegram.js
const TelegramBot = require('./telegram_bot');

async function testTelegram() {
    console.log('='.repeat(50));
    console.log('📱 TESTING TELEGRAM BOT');
    console.log('='.repeat(50));

    const bot = new TelegramBot();
    const enabled = await bot.loadConfig();

    if (!enabled) {
        console.log('❌ Telegram bot not configured');
        return;
    }

    console.log('✅ Telegram bot configured');
    console.log('📤 Sending test message...');

    // Test 1: Simple text message
    const test1 = await bot.sendMessage(
        '🤖 <b>Test Message</b>\n\n' +
        '✅ Your Telegram bot is working!\n' +
        `⏱️ Time: ${new Date().toLocaleString()}`
    );

    if (test1) {
        console.log('✅ Test 1 passed: Simple message sent');
    } else {
        console.log('❌ Test 1 failed');
    }

    // Test 2: Create a mock conflict
    const mockConflict = {
        home: 'Manchester United',
        away: 'Liverpool',
        flashscore: '20:00',
        odibets: '21:00',
        date: '03/03',
        league: 'Premier League',
        sources: ['Flashscore', 'Odibets'],
        difference: 60
    };

    const test2 = await bot.sendConflictAlert(mockConflict);
    if (test2) {
        console.log('✅ Test 2 passed: Conflict alert sent');
    } else {
        console.log('❌ Test 2 failed');
    }

    // Test 3: Send summary
    const test3 = await bot.sendSummaryAlert({
        flashscoreCount: 150,
        odibetsCount: 120,
        discrepancies: [mockConflict]
    });

    if (test3) {
        console.log('✅ Test 3 passed: Summary sent');
    } else {
        console.log('❌ Test 3 failed');
    }

    console.log('\n📊 Test complete! Check your Telegram app.');
}

testTelegram().catch(console.error);