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
            // FIRST: Try environment variables (for Render)
            if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
                this.botToken = process.env.TELEGRAM_BOT_TOKEN;
                this.chatId = process.env.TELEGRAM_CHAT_ID;
                this.enabled = true;
                console.log('✅ Telegram bot configured from environment variables');
                return true;
            }

            // SECOND: Fallback to config.json (for local development)
            const configData = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(configData);

            if (config.telegram && config.telegram.botToken && config.telegram.chatId) {
                this.botToken = config.telegram.botToken;
                this.chatId = config.telegram.chatId;
                this.enabled = true;
                console.log('✅ Telegram bot configured from config.json');
                return true;
            } else {
                console.log('⚠️ Telegram credentials not found');
                return false;
            }
        } catch (error) {
            console.log('⚠️ Telegram alerts disabled:', error.message);
            return false;
        }
    }

    // ... rest of your methods (sendMessage, formatConflictMessage, etc.) remain the same
    async sendMessage(message) {
        if (!this.enabled) return false;
        // ... your existing sendMessage code
    }

    formatConflictMessage(conflict) {
        // ... your existing formatting code
    }

    async sendConflictAlert(conflict) {
        if (!this.enabled) return false;
        // ... your existing sendConflictAlert code
    }

    async sendSummaryAlert(stats) {
        if (!this.enabled) return false;
        // ... your existing sendSummaryAlert code
    }
}

module.exports = TelegramBot;