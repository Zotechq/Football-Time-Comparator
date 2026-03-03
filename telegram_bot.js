// telegramBot.js
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

class TelegramBot {
    constructor() {
        this.botToken = null;
        this.chatId = null;
        this.enabled = false;
        this.configPath = path.join(__dirname, 'config.json');
    }

    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(configData);

            if (config.telegram && config.telegram.botToken && config.telegram.chatId) {
                this.botToken = config.telegram.botToken;
                this.chatId = config.telegram.chatId;
                this.enabled = true;
                console.log('✅ Telegram bot configured');
                return true;
            } else {
                console.log('⚠️ Telegram credentials not found in config');
                return false;
            }
        } catch (error) {
            console.log('⚠️ No config.json found or invalid format. Telegram alerts disabled.');
            return false;
        }
    }

    async sendMessage(message) {
        if (!this.enabled) return false;

        return new Promise((resolve) => {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

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
                            console.log('❌ Telegram API error:', response.description);
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

    formatConflictMessage(conflict) {
        const date = new Date().toLocaleString('en-KE', {
            timeZone: 'Africa/Nairobi',
            dateStyle: 'full',
            timeStyle: 'medium'
        });

        return `
🚨 <b>TIME CONFLICT DETECTED!</b>

⚽ <b>${conflict.home} vs ${conflict.away}</b>
📅 Date: ${conflict.date || 'Unknown'}
🏆 League: ${conflict.league || 'Unknown'}

⏰ Times:
   🔵 Flashscore (EAT): <b>${conflict.flashscore}</b>
   🟠 Odibets (EAT): <b>${conflict.odibets}</b>
   ⏱️ Difference: <b>${conflict.difference} minutes</b>

📊 <i>${conflict.sources.join(' & ')}</i>
⏱️ Detected: ${date}
`;
    }

    async sendConflictAlert(conflict) {
        if (!this.enabled) return false;

        const message = this.formatConflictMessage(conflict);
        return await this.sendMessage(message);
    }

    async sendSummaryAlert(stats) {
        if (!this.enabled) return false;

        const date = new Date().toLocaleString('en-KE', {
            timeZone: 'Africa/Nairobi',
            dateStyle: 'full',
            timeStyle: 'medium'
        });

        const message = `
📊 <b>KICKOFF TIME COMPARISON SUMMARY</b>

📈 Flashscore: ${stats.flashscoreCount} matches
📈 Odibets: ${stats.odibetsCount} matches
📊 TOTAL: ${stats.flashscoreCount + stats.odibetsCount} matches

🚨 Conflicts found: <b>${stats.discrepancies.length}</b>

${stats.discrepancies.length > 0
            ? '⚠️ Check /conflicts for details'
            : '✅ All times match!'}

⏱️ ${date}
`;
        return await this.sendMessage(message);
    }
}

module.exports = TelegramBot;