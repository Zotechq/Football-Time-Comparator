// betika_scraper.js - FINAL FIXED VERSION
const puppeteer = require('puppeteer');
const fs = require('fs').promises;

class BetikaScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = 'https://www.betika.com/en-ke/s/soccer';
        this.matches = [];
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async init() {
        console.log('='.repeat(80));
        console.log('⚽ BETIKA SOCCER MATCH SCRAPER - FINAL');
        console.log('='.repeat(80));

        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: { width: 1366, height: 768 },
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        this.page = await this.browser.newPage();
    }

    async navigateToSoccer() {
        console.log('\n📡 Loading Betika soccer page...');
        await this.page.goto(this.baseUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        console.log('✅ Page loaded');
        await this.delay(5000);
    }

    async scrollToLoadAll() {
        console.log('\n📜 Scrolling to load all matches...');

        let previousMatchCount = 0;
        let sameCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 30;

        while (sameCount < 3 && scrollAttempts < maxScrollAttempts) {
            scrollAttempts++;

            // Count match containers
            const matchCount = await this.page.evaluate(() => {
                return document.querySelectorAll('[class*="match"]').length;
            });

            console.log(`   Scroll ${scrollAttempts}: Found ${matchCount} match containers`);

            if (matchCount === previousMatchCount) {
                sameCount++;
                console.log(`   No new matches (${sameCount}/3)`);
            } else {
                sameCount = 0;
                previousMatchCount = matchCount;
            }

            await this.page.evaluate(() => {
                window.scrollBy(0, 800);
            });

            await this.delay(2000);
        }

        console.log(`\n✅ Finished scrolling. Found ${previousMatchCount} match containers.`);
    }

    async extractMatches() {
        console.log('\n📋 Extracting matches...');

        const matches = await this.page.evaluate(() => {
            const results = [];

            // Get all text from the page
            const text = document.body.innerText;
            const lines = text.split('\n').filter(line => line.trim().length > 0);

            for (let i = 0; i < lines.length - 3; i++) {
                // Look for pattern: League • LeagueName
                const leagueMatch = lines[i].match(/(.+?)\s•\s(.+)/);

                if (leagueMatch) {
                    const league = lines[i].trim();

                    // Next line should be date and time
                    const dateTimeMatch = lines[i + 1].match(/(\d{2}\/\d{2}),\s*(\d{2}:\d{2})/);

                    if (dateTimeMatch) {
                        const date = dateTimeMatch[1];
                        const time = dateTimeMatch[2]; // This is GMT

                        // Next two lines are home and away teams
                        const home = lines[i + 2].trim();
                        const away = lines[i + 3].trim();

                        // Validate team names (not odds, not too short)
                        if (home && away &&
                            !home.match(/^\d+\.\d+$/) &&
                            !away.match(/^\d+\.\d+$/) &&
                            home.length > 2 && away.length > 2) {

                            results.push({
                                home: home,
                                away: away,
                                kickoff: time, // GMT time
                                date: date,
                                league: league,
                                bookie: 'Betika'
                            });
                        }
                    }
                }
            }

            return results;
        });

        this.matches = matches;
        console.log(`✅ Found ${matches.length} matches`);
        return matches;
    }

    async saveMatches() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = `betika_matches_${timestamp}.json`;

        await fs.writeFile(filename, JSON.stringify({
            timestamp: new Date().toISOString(),
            totalMatches: this.matches.length,
            matches: this.matches
        }, null, 2));

        console.log(`\n💾 Saved ${this.matches.length} matches to ${filename}`);

        const csvFilename = filename.replace('.json', '.csv');
        let csvContent = 'Home Team,Away Team,Kickoff (GMT),Date,League,Bookie\n';
        this.matches.forEach(m => {
            csvContent += `${m.home},${m.away},${m.kickoff},${m.date},"${m.league}",${m.bookie}\n`;
        });

        await fs.writeFile(csvFilename, csvContent);
        console.log(`💾 Saved ${this.matches.length} matches to ${csvFilename}`);
    }

    async displayMatches() {
        if (this.matches.length === 0) {
            console.log('\n📭 No matches found');
            return;
        }

        console.log('\n' + '='.repeat(100));
        console.log(`📋 BETIKA MATCHES - ${new Date().toLocaleDateString()}`);
        console.log('='.repeat(100));

        // Group by date
        const byDate = {};
        this.matches.forEach(m => {
            if (!byDate[m.date]) byDate[m.date] = [];
            byDate[m.date].push(m);
        });

        const sortedDates = Object.keys(byDate).sort((a, b) => {
            const [dayA, monthA] = a.split('/').map(Number);
            const [dayB, monthB] = b.split('/').map(Number);
            if (monthA !== monthB) return monthA - monthB;
            return dayA - dayB;
        });

        let globalIndex = 1;
        for (const date of sortedDates) {
            console.log(`\n📅 ${date} (${byDate[date].length} matches)`);

            // Group by league
            const byLeague = {};
            byDate[date].forEach(m => {
                if (!byLeague[m.league]) byLeague[m.league] = [];
                byLeague[m.league].push(m);
            });

            const sortedLeagues = Object.keys(byLeague).sort();

            for (const league of sortedLeagues) {
                console.log(`\n   🏆 ${league}`);
                byLeague[league].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
                byLeague[league].forEach(match => {
                    console.log(`   ${globalIndex.toString().padStart(3)}. ${match.home.padEnd(25)} vs ${match.away.padEnd(25)} @ ${match.kickoff} GMT`);
                    globalIndex++;
                });
            }
        }

        console.log('='.repeat(100));
        console.log(`Total matches: ${this.matches.length}`);
    }

    async run() {
        try {
            await this.init();
            await this.navigateToSoccer();
            await this.scrollToLoadAll();
            await this.extractMatches();
            await this.displayMatches();
            await this.saveMatches();

            console.log('\n' + '='.repeat(80));
            console.log('📊 SCRAPING COMPLETE');
            console.log('='.repeat(80));

        } catch (error) {
            console.error('❌ Error:', error);
        } finally {
            await this.browser.close();
        }
    }
}

// Run the scraper
if (require.main === module) {
    new BetikaScraper().run().catch(console.error);
}

module.exports = { BetikaScraper };