// index.js - COMPARING FLASHSCORE vs ODIBETS ONLY
const fs = require('fs').promises;
const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');
const path = require('path');

const execPromise = util.promisify(exec);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Debug mode - set to true to see normalization details
const DEBUG_NORMALIZATION = true;

/**
 * Check if a file exists
 */
async function fileExists(filepath) {
    try {
        await fs.access(filepath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Find the latest JSON file from a scraper in the data directory
 */
async function findLatestScraperFile(scraperName) {
    try {
        const dataDir = path.join(__dirname, 'data', scraperName);
        const latestFile = path.join(dataDir, `${scraperName}_latest.json`);

        if (await fileExists(latestFile)) {
            console.log(`✅ Found latest ${scraperName} data: ${latestFile}`);
            const data = await fs.readFile(latestFile, 'utf8');
            return JSON.parse(data);
        }

        // If no latest file, try to find any file in history
        const historyDir = path.join(dataDir, 'history');
        if (await fileExists(historyDir)) {
            const years = await fs.readdir(historyDir);
            for (const year of years.sort().reverse()) {
                const yearPath = path.join(historyDir, year);
                const months = await fs.readdir(yearPath);
                for (const month of months.sort().reverse()) {
                    const monthPath = path.join(yearPath, month);
                    const files = await fs.readdir(monthPath);
                    const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
                    if (jsonFiles.length > 0) {
                        const latestHistory = path.join(monthPath, jsonFiles[0]);
                        console.log(`✅ Found ${scraperName} history file: ${latestHistory}`);
                        const data = await fs.readFile(latestHistory, 'utf8');
                        return JSON.parse(data);
                    }
                }
            }
        }

        return null;
    } catch (error) {
        console.log(`⚠️  Error finding ${scraperName} data: ${error.message}`);
        return null;
    }
}

/**
 * Run a scraper file and get its output with detailed error handling
 */
async function runScraper(scraperFile) {
    try {
        if (!await fileExists(scraperFile)) {
            console.log(`❌ Scraper file not found: ${scraperFile}`);
            return null;
        }

        console.log(`\n📡 Running ${scraperFile}...`);

        // Set a longer timeout
        const { stdout, stderr } = await execPromise(`node ${scraperFile}`, {
            timeout: 600000, // 10 minutes
            maxBuffer: 20 * 1024 * 1024 // 20MB buffer
        });

        if (stderr) {
            // Only show warnings, not errors that might be expected
            if (!stderr.includes('ProtocolError') && !stderr.includes('Timeout')) {
                console.log(`⚠️  ${scraperFile} warnings:`, stderr);
            }
        }

        // Try to find the data in the organized structure first
        const scraperName = path.basename(scraperFile, '.js').replace('_scraper', '');
        const organizedData = await findLatestScraperFile(scraperName);
        if (organizedData) {
            return organizedData;
        }

        // Fallback to looking in current directory
        const allFiles = await fs.readdir('.');
        const jsonFiles = allFiles.filter(f => f.endsWith('.json'));

        const patterns = [
            /Saved \d+ matches to ([\w\-\.]+\.json)/,
            /💾 Saved \d+ matches to ([\w\-\.]+\.json)/,
            /💾 Matches saved to ([\w\-\.]+\.json)/,
            /saved to ([\w\-\.]+\.json)/i,
            new RegExp(`(${scraperName}_matches_[\\d\\-\\.]+\\.json)`),
            new RegExp(`(${scraperName}_latest\\.json)`)
        ];

        for (const pattern of patterns) {
            const match = stdout.match(pattern);
            if (match) {
                const filename = match[1] || match[0];
                if (await fileExists(filename)) {
                    console.log(`📂 Reading file: ${filename}`);
                    const data = await fs.readFile(filename, 'utf8');
                    return JSON.parse(data);
                }
            }
        }

        // Try to find any recent match file
        const matchFiles = jsonFiles.filter(f =>
            f.includes(scraperName) || f.includes('flashscore') || f.includes('odibets')
        );

        if (matchFiles.length > 0) {
            const latestFile = matchFiles.sort().reverse()[0];
            console.log(`📂 Using most recent file: ${latestFile}`);
            const data = await fs.readFile(latestFile, 'utf8');
            return JSON.parse(data);
        }

        return null;

    } catch (error) {
        console.log(`❌ Error running ${scraperFile}:`, error.message);
        return null;
    }
}

/**
 * Extract matches from Flashscore JSON
 */
function extractFlashscoreMatches(data) {
    if (!data) return [];

    // Handle different Flashscore data structures
    if (data.allMatches && Array.isArray(data.allMatches)) {
        return data.allMatches.map(m => ({
            home: m.home,
            away: m.away,
            kickoff: m.time || '',
            date: m.date || '',
            league: m.league || 'Football',
            source: 'Flashscore',
            timezone: 'EAT'
        }));
    }

    if (data.matches && Array.isArray(data.matches)) {
        return data.matches.map(m => ({
            home: m.home,
            away: m.away,
            kickoff: m.time || '',
            date: m.date || '',
            league: m.league || 'Football',
            source: 'Flashscore',
            timezone: 'EAT'
        }));
    }

    if (data.matchesByHour) {
        const allMatches = [];
        Object.values(data.matchesByHour).forEach(hourMatches => {
            if (Array.isArray(hourMatches)) {
                allMatches.push(...hourMatches.map(m => ({
                    home: m.home,
                    away: m.away,
                    kickoff: m.time || '',
                    date: m.date || '',
                    league: 'Football',
                    source: 'Flashscore',
                    timezone: 'EAT'
                })));
            }
        });
        return allMatches;
    }

    // Handle direct array
    if (Array.isArray(data)) {
        return data.map(m => ({
            home: m.home,
            away: m.away,
            kickoff: m.time || '',
            date: m.date || '',
            league: 'Football',
            source: 'Flashscore',
            timezone: 'EAT'
        }));
    }

    return [];
}

/**
 * Extract matches from Odibets JSON
 */
function extractOdibetsMatches(data) {
    if (!data) return [];

    if (data.matches && Array.isArray(data.matches)) {
        return data.matches.map(m => ({
            home: m.home,
            away: m.away,
            kickoff: m.kickoff || '',
            date: m.date || '',
            league: m.league || 'Football',
            source: 'Odibets',
            timezone: 'EAT'
        }));
    }

    if (Array.isArray(data)) {
        return data.map(m => ({
            home: m.home,
            away: m.away,
            kickoff: m.kickoff || '',
            date: m.date || '',
            league: 'Football',
            source: 'Odibets',
            timezone: 'EAT'
        }));
    }

    return [];
}

/**
 * Normalize team name for matching across different websites
 */
function normalizeTeamName(name, source = 'unknown') {
    if (!name) return '';

    const original = name;

    let normalized = name.toLowerCase()
        .replace(/\s+fc$|\s+f\.c\.$|\s+united$|\s+utd$|\s+city$|\s+cf$|\s+f\.c\.$/g, '')
        .replace(/\s+youth$|\s+reserves$|\s+reserve$|\s+u\d+$/g, '')
        .replace(/\s+ii$|\s+iii$|\s+iv$/g, '')
        .replace(/\s+fc\s+|\s+f\.c\.\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (DEBUG_NORMALIZATION && original !== normalized) {
        console.log(`   🔄 Name normalization: "${original}" -> "${normalized}" (${source})`);
    }

    return normalized;
}

/**
 * Create a normalized key to match same teams across different websites
 */
function normalizeMatchKey(home, away, homeSource, awaySource) {
    const homeNorm = normalizeTeamName(home, homeSource);
    const awayNorm = normalizeTeamName(away, awaySource);

    // Sort teams alphabetically to handle home/away mismatches
    const teams = [homeNorm, awayNorm].sort();
    const key = `${teams[0]}-${teams[1]}`;

    if (DEBUG_NORMALIZATION) {
        console.log(`\n   🔑 Match Key: ${key}`);
        console.log(`      Home: "${home}" -> "${homeNorm}"`);
        console.log(`      Away: "${away}" -> "${awayNorm}"`);
    }

    return key;
}

/**
 * Calculate minutes difference between two times
 */
function calculateTimeDifference(time1, time2) {
    try {
        const [h1, m1] = time1.split(':').map(Number);
        const [h2, m2] = time2.split(':').map(Number);

        const minutes1 = h1 * 60 + m1;
        const minutes2 = h2 * 60 + m2;

        return Math.abs(minutes1 - minutes2);
    } catch {
        return 999;
    }
}

/**
 * Compare kickoff times between Flashscore and Odibets only
 */
function compareFlashscoreAndOdibets(flashscoreMatches, odibetsMatches) {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 COMPARING KICKOFF TIMES: FLASHSCORE vs ODIBETS');
    console.log('='.repeat(80));

    console.log(`\n📊 Flashscore: ${flashscoreMatches.length} matches (EAT)`);
    console.log(`📊 Odibets: ${odibetsMatches.length} matches (EAT)`);

    if (DEBUG_NORMALIZATION) {
        console.log('\n🔍 NAME NORMALIZATION DEBUG MODE ENABLED');
        console.log('-'.repeat(80));
    }

    const flashscoreDict = {};
    const odibetsDict = {};

    // Process Flashscore matches
    flashscoreMatches.forEach(m => {
        const home = m.home || '';
        const away = m.away || '';
        const time = m.kickoff || '';
        const date = m.date || '';

        if (home && away && time) {
            const key = normalizeMatchKey(home, away, 'Flashscore', 'Flashscore');
            flashscoreDict[key] = { home, away, time, date, league: m.league };
        }
    });

    // Process Odibets matches
    odibetsMatches.forEach(m => {
        const home = m.home || '';
        const away = m.away || '';
        const time = m.kickoff || '';
        const date = m.date || '';

        if (home && away && time) {
            const key = normalizeMatchKey(home, away, 'Odibets', 'Odibets');
            odibetsDict[key] = { home, away, time, date, league: m.league };
        }
    });

    // Get all unique match keys
    const allKeys = new Set([
        ...Object.keys(flashscoreDict),
        ...Object.keys(odibetsDict)
    ]);

    console.log(`\n📊 Total unique matches found: ${allKeys.size}`);

    if (DEBUG_NORMALIZATION && allKeys.size > 0) {
        console.log('\n📋 Sample of generated keys:');
        const sampleKeys = Array.from(allKeys).slice(0, 5);
        sampleKeys.forEach((key, i) => {
            console.log(`   ${i+1}. ${key}`);
            if (flashscoreDict[key]) console.log(`      Flashscore: ${flashscoreDict[key].home} vs ${flashscoreDict[key].away}`);
            if (odibetsDict[key]) console.log(`      Odibets: ${odibetsDict[key].home} vs ${odibetsDict[key].away}`);
        });
    }

    const discrepancies = [];
    const matched = [];
    const onlyInFlashscore = [];
    const onlyInOdibets = [];

    for (const key of allKeys) {
        const flashscoreMatch = flashscoreDict[key];
        const odibetsMatch = odibetsDict[key];

        const sources = [];
        if (flashscoreMatch) sources.push('Flashscore');
        if (odibetsMatch) sources.push('Odibets');

        // If match appears in both sources, check for conflicts
        if (flashscoreMatch && odibetsMatch) {
            if (DEBUG_NORMALIZATION) {
                console.log(`\n🔍 Checking match: ${key}`);
                console.log(`   Found in: ${sources.join(', ')}`);
            }

            if (flashscoreMatch.time !== odibetsMatch.time) {
                // Time conflict!
                const conflict = {
                    home: flashscoreMatch.home,
                    away: flashscoreMatch.away,
                    flashscore: flashscoreMatch.time,
                    odibets: odibetsMatch.time,
                    date: flashscoreMatch.date || odibetsMatch.date,
                    league: flashscoreMatch.league || odibetsMatch.league,
                    sources: sources,
                    timestamp: new Date().toISOString()
                };
                discrepancies.push(conflict);

                console.log('\n' + '!'.repeat(70));
                console.log('🚨 TIME CONFLICT FOUND!');
                console.log('!'.repeat(70));
                console.log(`Match: ${flashscoreMatch.home} vs ${flashscoreMatch.away}`);
                console.log(`Date: ${flashscoreMatch.date || odibetsMatch.date || 'Unknown'}`);
                console.log(`   Flashscore (EAT): ${flashscoreMatch.time}`);
                console.log(`   Odibets (EAT): ${odibetsMatch.time}`);

                const diff = calculateTimeDifference(flashscoreMatch.time, odibetsMatch.time);
                console.log(`   Difference: ${diff} minutes`);
                console.log('!'.repeat(70));
            } else {
                matched.push(key);
                if (DEBUG_NORMALIZATION) {
                    console.log(`   ✅ Times match: ${flashscoreMatch.time} = ${odibetsMatch.time}`);
                }
            }
        } else {
            // Match appears in only one source
            if (flashscoreMatch) onlyInFlashscore.push(key);
            if (odibetsMatch) onlyInOdibets.push(key);
        }
    }

    console.log(`\n📊 Detailed Summary:`);
    console.log(`   ✅ Matches in both sources with same time: ${matched.length}`);
    console.log(`   ❌ Conflicts found: ${discrepancies.length}`);
    console.log(`   📍 Only in Flashscore: ${onlyInFlashscore.length}`);
    console.log(`   📍 Only in Odibets: ${onlyInOdibets.length}`);

    return discrepancies;
}

/**
 * Save discrepancies to file
 */
async function saveDiscrepancies(discrepancies) {
    if (!discrepancies || discrepancies.length === 0) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `conflicts_${timestamp}.json`;

    await fs.writeFile(filename, JSON.stringify(discrepancies, null, 2));
    console.log(`\n💾 Saved ${discrepancies.length} conflicts to ${filename}`);

    // Also append to running log
    const logFilename = 'conflict_log.json';
    try {
        let log = [];
        try {
            const logData = await fs.readFile(logFilename, 'utf8');
            log = JSON.parse(logData);
        } catch {
            // File doesn't exist yet
        }

        log.push({
            timestamp: new Date().toISOString(),
            conflicts: discrepancies
        });

        await fs.writeFile(logFilename, JSON.stringify(log, null, 2));
        console.log(`📝 Updated running log: ${logFilename}`);
    } catch (error) {
        console.log(`⚠️ Could not update log: ${error.message}`);
    }
}

/**
 * Print summary
 */
function printSummary(flashscoreCount, odibetsCount, discrepancies) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(80));
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);
    console.log(`📈 Flashscore matches: ${flashscoreCount} (EAT)`);
    console.log(`📈 Odibets matches: ${odibetsCount} (EAT)`);
    console.log(`📈 TOTAL matches: ${flashscoreCount + odibetsCount}`);
    console.log(`🚨 Conflicts found: ${discrepancies.length}`);

    if (discrepancies.length > 0) {
        console.log('\n❌ CONFLICT DETAILS:');
        discrepancies.forEach((d, i) => {
            console.log(`\n   ${i+1}. ${d.home} vs ${d.away}`);
            console.log(`      Date: ${d.date || 'Unknown'}`);
            console.log(`      League: ${d.league || 'Unknown'}`);
            console.log(`      Flashscore (EAT): ${d.flashscore}`);
            console.log(`      Odibets (EAT): ${d.odibets}`);
        });
    } else {
        console.log('\n✅ All kickoff times match between Flashscore and Odibets!');
    }
    console.log('='.repeat(80));
}

/**
 * Run once (quick test)
 */
async function quickTest() {
    console.log('\n🔧 QUICK TEST MODE - FLASHSCORE vs ODIBETS');
    console.log('='.repeat(60));

    // Define scraper files
    const flashscoreFile = './flashscore_scraper.js';
    const odibetsFile = './odibets_scraper.js';

    console.log('\n📊 Checking scraper files...');
    console.log(`   Flashscore: ${await fileExists(flashscoreFile) ? '✅' : '❌'} ${flashscoreFile}`);
    console.log(`   Odibets: ${await fileExists(odibetsFile) ? '✅' : '❌'} ${odibetsFile}`);

    // Run scrapers
    console.log('\n📊 STEP 1: Running Flashscore scraper...');
    const flashscoreData = await runScraper(flashscoreFile);

    if (!flashscoreData) {
        console.log('⚠️  Flashscore scraper failed, continuing with other sources...');
    }

    console.log('\n📊 STEP 2: Running Odibets scraper...');
    const odibetsData = await runScraper(odibetsFile);

    if (!odibetsData) {
        console.log('⚠️  Odibets scraper failed');
    }

    // Extract matches
    const flashscoreMatches = flashscoreData ? extractFlashscoreMatches(flashscoreData) : [];
    const odibetsMatches = odibetsData ? extractOdibetsMatches(odibetsData) : [];

    console.log(`\n📊 Extracted counts:`);
    console.log(`   Flashscore: ${flashscoreMatches.length} matches`);
    console.log(`   Odibets: ${odibetsMatches.length} matches`);

    // Compare them
    let discrepancies = [];
    if (flashscoreMatches.length > 0 || odibetsMatches.length > 0) {
        discrepancies = compareFlashscoreAndOdibets(flashscoreMatches, odibetsMatches);

        printSummary(
            flashscoreMatches.length,
            odibetsMatches.length,
            discrepancies
        );

        if (discrepancies.length > 0) {
            await saveDiscrepancies(discrepancies);
        }
    } else {
        console.log('\n❌ No data from any source');
    }

    return discrepancies;
}

/**
 * Run continuously at specified interval
 */
async function runContinuous(intervalMinutes) {
    console.log(`\n⏳ Running every ${intervalMinutes} minutes...`);
    console.log('Press Ctrl+C to stop\n');

    let runCount = 0;

    while (true) {
        runCount++;
        console.log(`\n${'#'.repeat(60)}`);
        console.log(`🔄 RUN #${runCount} - ${new Date().toLocaleString()}`);
        console.log(`${'#'.repeat(60)}`);

        try {
            await quickTest();

            console.log(`\n⏳ Waiting ${intervalMinutes} minutes until next run...`);
            await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60000));

        } catch (error) {
            console.log(`❌ Error in run #${runCount}: ${error.message}`);
            console.log('⏳ Waiting 5 minutes before retry...');
            await new Promise(resolve => setTimeout(resolve, 5 * 60000));
        }
    }
}

/**
 * Clean up old files
 */
async function cleanupOldFiles() {
    try {
        const files = await fs.readdir('.');
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        for (const file of files) {
            // Delete old JSON files
            if ((file.startsWith('flashscore_matches') ||
                    file.startsWith('odibets_matches') ||
                    file.startsWith('conflicts_')) &&
                file.endsWith('.json')) {
                const stats = await fs.stat(file);
                if (now - stats.mtimeMs > oneDay) {
                    await fs.unlink(file);
                    console.log(`🧹 Deleted old file: ${file}`);
                }
            }
        }
    } catch (error) {}
}

/**
 * Main function
 */
async function main() {
    console.log('\n⚽ KICKOFF TIME COMPARISON - FLASHSCORE vs ODIBETS');
    console.log('='.repeat(70));
    console.log('1. Run once (quick test)');
    console.log('2. Run continuously (custom interval)');

    // Clean up old files before starting
    await cleanupOldFiles();

    const choice = await question('\nEnter choice (1 or 2): ');

    if (choice === '1') {
        await quickTest();
    } else if (choice === '2') {
        const minutes = await question('Enter interval in minutes: ');
        const interval = parseInt(minutes);

        if (!isNaN(interval) && interval > 0) {
            await runContinuous(interval);
        } else {
            console.log('❌ Invalid number');
        }
    } else {
        console.log('❌ Invalid choice');
    }

    rl.close();
}

// Run the main function
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    compareFlashscoreAndOdibets,
    runScraper,
    normalizeMatchKey,
    extractFlashscoreMatches,
    extractOdibetsMatches
};