// telegramBot.js
const https = require('https');

class TelegramBot {
    constructor(botToken, chatId) {
        this.botToken = botToken;
        this.chatId = chatId;
        this.apiUrl = `https://api.telegram.org/bot${botToken}`;
    }

    /**
     * Send a message to Telegram
     */
    async sendMessage(message) {
        return new Promise((resolve, reject) => {
            const url = `${this.apiUrl}/sendMessage`;
            const postData = JSON.stringify({
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML'
            });

            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(url, options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.ok) {
                            resolve(true);
                        } else {
                            console.log('❌ Telegram API error:', response);
                            resolve(false);
                        }
                    } catch (e) {
                        resolve(false);
                    }
                });
            });

            req.on('error', (error) => {
                console.log('❌ Telegram request error:', error.message);
                resolve(false);
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Format conflict message for Telegram
     */
    formatConflictMessage(conflict) {
        const timesList = [];

        if (conflict.times.Flashscore) {
            timesList.push(`🔵 Flashscore: <b>${conflict.times.Flashscore} EAT</b>`);
        }
        if (conflict.times.Odibets) {
            timesList.push(`🟠 Odibets: <b>${conflict.times.Odibets} EAT</b>`);
        }
        if (conflict.times.Betika) {
            timesList.push(`🟢 Betika: <b>${conflict.times.Betika} GMT</b>`);
        }

        return `
🚨 <b>TIME CONFLICT DETECTED!</b>

⚽ <b>${conflict.home} vs ${conflict.away}</b>
📅 Date: ${conflict.date || 'Unknown'}
🔍 Sources: ${conflict.sources.join(', ')}

${timesList.join('\n')}

⏰ Detected: ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
`;
    }

    /**
     * Send conflict alert
     */
    async sendConflictAlert(conflict) {
        if (!this.botToken || !this.chatId) {
            console.log('⚠️ Telegram bot not configured');
            return false;
        }

        const message = this.formatConflictMessage(conflict);
        return await this.sendMessage(message);
    }

    /**
     * Send summary alert
     */
    async sendSummaryAlert(flashscoreCount, odibetsCount, betikaCount, conflicts) {
        if (!this.botToken || !this.chatId) return false;

        const summaryMessage = `
📊 <b>KICKOFF TIME COMPARISON SUMMARY</b>

📈 Flashscore: ${flashscoreCount} matches
📈 Odibets: ${odibetsCount} matches
📈 Betika: ${betikaCount} matches
📊 TOTAL: ${flashscoreCount + odibetsCount + betikaCount} matches

🚨 Conflicts found: <b>${conflicts.length}</b>

${conflicts.length > 0 ? '⚠️ Check /conflicts for details' : '✅ All times match!'}

⏰ ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
`;

        return await this.sendMessage(summaryMessage);
    }
}

module.exports = TelegramBot;