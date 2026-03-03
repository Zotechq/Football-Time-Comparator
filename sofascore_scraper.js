// sofascore-scraper-fixed.js
const https = require('https');
const fs = require('fs').promises;

class SofascoreScraper {
    constructor() {
        this.baseUrl = 'https://www.sofascore.com/api/v1';
        this.matches = [];
        this.tournaments = [];
    }

    /**
     * Make API request with proper headers
     */
    async makeRequest(url) {
        return new Promise((resolve, reject) => {
            const options = {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://www.sofascore.com/'
                }
            };

            https.get(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        console.log(`❌ JSON parse error for ${url}: ${e.message}`);
                        resolve(null);
                    }
                });
            }).on('error', (err) => {
                console.log(`❌ Request error for ${url}: ${err.message}`);
                reject(err);
            });
        });
    }

    /**
     * Get today's scheduled football matches
     */
    async getTodaysMatches() {
        console.log('\n📡 Fetching today\'s matches from Sofascore API...');

        try {
            // Get today's date in YYYY-MM-DD format
            const today = new Date().toISOString().split('T')[0];
            const url = `${this.baseUrl}/sport/football/scheduled-events/${today}`;
            console.log(`   URL: ${url}`);

            const data = await this.makeRequest(url);

            if (data && data.events) {
                console.log(`✅ Found ${data.events.length} scheduled matches`);
                return data.events;
            }

            console.log(`⚠️ No events found in response`);
            return [];
        } catch (error) {
            console.log(`❌ API error: ${error.message}`);
            return [];
        }
    }

    /**
     * Get live matches
     */
    async getLiveMatches() {
        try {
            const url = `${this.baseUrl}/sport/football/live/1`;
            const data = await this.makeRequest(url);
            return data?.events || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Get match details including lineups, stats, etc.
     */
    async getMatchDetails(matchId) {
        try {
            const url = `${this.baseUrl}/event/${matchId}`;
            return await this.makeRequest(url);
        } catch (error) {
            return null;
        }
    }

    /**
     * Get all tournaments/leagues
     */
    async getAllTournaments() {
        console.log('\n🏆 Fetching tournaments...');

        try {
            const url = `${this.baseUrl}/sport/football/categories/all`;
            const data = await this.makeRequest(url);

            if (data && data.categories) {
                console.log(`✅ Found ${data.categories.length} categories`);
                return data.categories;
            }
            return [];
        } catch (error) {
            console.log(`❌ API error: ${error.message}`);
            return [];
        }
    }

    /**
     * Parse match data into our standard format
     */
    parseMatch(event) {
        // Format start time
        const startDate = new Date(event.startTimestamp * 1000);
        const kenyaTime = new Date(startDate.getTime() + (3 * 60 * 60 * 1000)); // Convert to EAT

        return {
            id: event.id,
            home: event.homeTeam.name,
            away: event.awayTeam.name,
            homeScore: event.homeScore?.current ?? null,
            awayScore: event.awayScore?.current ?? null,
            homeScoreDisplay: event.homeScore?.display ?? null,
            awayScoreDisplay: event.awayScore?.display ?? null,
            status: event.status?.type,
            statusDescription: event.status?.description,
            startTimestamp: event.startTimestamp,
            startTimeUTC: startDate.toLocaleString('en-GB', { timeZone: 'UTC' }),
            startTimeEAT: kenyaTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            startDateEAT: kenyaTime.toLocaleDateString('en-GB'),
            tournament: {
                id: event.tournament?.id,
                name: event.tournament?.name,
                category: event.tournament?.category?.name || 'Unknown'
            },
            round: event.roundInfo?.round,
            venue: event.customId ? `Match ${event.customId}` : 'Unknown',
            source: 'Sofascore'
        };
    }

    /**
     * Get unique tournaments from matches
     */
    extractTournaments(events) {
        const tournaments = new Map();

        events.forEach(event => {
            if (event.tournament) {
                const key = `${event.tournament.id}-${event.tournament.name}`;
                if (!tournaments.has(key)) {
                    tournaments.set(key, {
                        id: event.tournament.id,
                        name: event.tournament.name,
                        category: event.tournament.category?.name || 'Unknown',
                        country: event.tournament.category?.country?.name,
                        matchCount: 1
                    });
                } else {
                    const t = tournaments.get(key);
                    t.matchCount++;
                }
            }
        });

        return Array.from(tournaments.values());
    }

    /**
     * Filter matches - show all except those that finished long ago
     */
    filterValidMatches(matches) {
        const now = Date.now() / 1000;

        return matches.filter(m => {
            // Include if:
            // 1. Not started yet (future matches)
            // 2. In progress
            // 3. Finished within last 3 hours
            const isFuture = m.startTimestamp > now;
            const isLive = m.status === 'inprogress';
            const isRecent = m.status === 'finished' && (now - m.startTimestamp) < 10800; // 3 hours

            return isFuture || isLive || isRecent;
        });
    }

    /**
     * Sort matches by start time
     */
    sortMatches(matches) {
        return matches.sort((a, b) => a.startTimestamp - b.startTimestamp);
    }

    /**
     * Main function to scrape all matches
     */
    async scrapeAll() {
        console.log('='.repeat(80));
        console.log('⚽ SOFASCORE MATCH SCRAPER');
        console.log('='.repeat(80));

        // Get today's matches
        const events = await this.getTodaysMatches();

        if (events.length === 0) {
            console.log('\n❌ No matches found for today');
            return { matches: [], tournaments: [] };
        }

        // Parse all matches
        const allMatches = events.map(e => this.parseMatch(e));

        // Filter for valid matches (show all by default)
        const validMatches = this.sortMatches(allMatches);

        // Extract tournaments
        const tournaments = this.extractTournaments(events);

        console.log(`\n📊 Summary:`);
        console.log(`   • Total events: ${events.length}`);
        console.log(`   • Total matches: ${validMatches.length}`);
        console.log(`   • Tournaments: ${tournaments.length}`);

        // Count by status
        const liveCount = validMatches.filter(m => m.status === 'inprogress').length;
        const finishedCount = validMatches.filter(m => m.status === 'finished').length;
        const upcomingCount = validMatches.filter(m => !m.status || m.status === 'notstarted').length;

        console.log(`   • Live: ${liveCount}`);
        console.log(`   • Finished: ${finishedCount}`);
        console.log(`   • Upcoming: ${upcomingCount}`);

        // Group by tournament for display
        const byTournament = {};
        validMatches.forEach(m => {
            const key = m.tournament.name;
            if (!byTournament[key]) byTournament[key] = [];
            byTournament[key].push(m);
        });

        // Display results
        console.log('\n' + '='.repeat(100));
        console.log(`📋 SOFASCORE MATCHES - ${new Date().toLocaleDateString()}`);
        console.log('='.repeat(100));

        const sortedTournaments = Object.keys(byTournament).sort();

        for (const tournament of sortedTournaments) {
            const matches = byTournament[tournament];
            console.log(`\n🏆 ${tournament} (${matches.length} matches)`);

            matches.sort((a, b) => a.startTimestamp - b.startTimestamp);
            matches.slice(0, 10).forEach((m, i) => {
                const time = m.startTimeEAT;
                let score = '';
                let statusIcon = '';

                if (m.homeScore !== null && m.awayScore !== null) {
                    score = `${m.homeScore} - ${m.awayScore}`;
                }

                if (m.status === 'inprogress') {
                    statusIcon = '🔴 LIVE';
                } else if (m.status === 'finished') {
                    statusIcon = '✅ FT';
                } else {
                    statusIcon = '⏳';
                }

                console.log(`   ${(i+1).toString().padStart(2)}. ${m.home.padEnd(25)} vs ${m.away.padEnd(25)} @ ${time}  [${score}] ${statusIcon}`);
            });

            if (matches.length > 10) {
                console.log(`      ... and ${matches.length - 10} more matches`);
            }
        }

        console.log('='.repeat(100));
        console.log(`Total matches: ${validMatches.length}`);

        // Store results
        this.matches = validMatches;
        this.tournaments = tournaments;

        return {
            matches: validMatches,
            tournaments: tournaments
        };
    }

    /**
     * Save matches to file
     */
    async saveMatches() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = `sofascore_matches_${timestamp}.json`;

        const output = {
            timestamp: new Date().toISOString(),
            totalMatches: this.matches.length,
            totalTournaments: this.tournaments.length,
            matches: this.matches,
            tournaments: this.tournaments
        };

        await fs.writeFile(filename, JSON.stringify(output, null, 2));
        console.log(`\n💾 Saved ${this.matches.length} matches to ${filename}`);

        // Save as CSV
        const csvFilename = filename.replace('.json', '.csv');
        let csvContent = 'Home Team,Away Team,Home Score,Away Score,Kickoff (EAT),Date,Tournament,Status\n';

        this.matches.forEach(m => {
            csvContent += `${m.home},${m.away},${m.homeScore || ''},${m.awayScore || ''},${m.startTimeEAT},${m.startDateEAT},"${m.tournament.name}",${m.status || 'scheduled'}\n`;
        });

        await fs.writeFile(csvFilename, csvContent);
        console.log(`💾 Saved ${this.matches.length} matches to ${csvFilename}`);
    }

    /**
     * Run the scraper
     */
    async run() {
        try {
            await this.scrapeAll();
            await this.saveMatches();

            console.log('\n' + '='.repeat(80));
            console.log('📊 SCRAPING COMPLETE');
            console.log('='.repeat(80));

        } catch (error) {
            console.error('❌ Error:', error);
        }
    }
}

// Run the scraper
if (require.main === module) {
    new SofascoreScraper().run().catch(console.error);
}

module.exports = SofascoreScraper;