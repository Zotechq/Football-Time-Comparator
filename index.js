// index.js - COMPLETE FIXED VERSION with Betika EAT timezone
const fs = require('fs').promises;
const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');

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

        // List all JSON files before matching
        const allFiles = await fs.readdir('.');
        const jsonFiles = allFiles.filter(f => f.endsWith('.json'));
        console.log('📁 JSON files in directory:', jsonFiles.join(', '));

        // Look for the saved JSON file in the output - FIXED PATTERNS
        const patterns = [
            /Saved \d+ matches to ([\w\-\.]+\.json)/,
            /💾 Saved \d+ matches to ([\w\-\.]+\.json)/,
            /💾 Matches saved to ([\w\-\.]+\.json)/,
            /saved to ([\w\-\.]+\.json)/i,
            /(odibets_matches_[\d\-]+\.json)/,
            /(betika_matches_[\d\-]+\.json)/,
            /(sofascore_matches_[\d\-]+\.json)/
        ];

        for (const pattern of patterns) {
            const match = stdout.match(pattern);
            if (match) {
                // Use the capture group if it exists, otherwise use the full match
                const filename = match[1] || match[0];
                console.log(`✅ Found output file reference: ${filename}`);

                // Check if file exists (might be in current directory)
                if (await fileExists(filename)) {
                    console.log(`📂 Reading file: ${filename}`);
                    const data = await fs.readFile(filename, 'utf8');
                    return JSON.parse(data);
                } else {
                    console.log(`⚠️  File ${filename} not found in current directory`);

                    // Try to find any recently created match file
                    const recentMatch = jsonFiles.find(f =>
                        f.includes('odibets') || f.includes('betika') || f.includes('sofascore')
                    );

                    if (recentMatch) {
                        console.log(`📂 Using most recent match file: ${recentMatch}`);
                        const data = await fs.readFile(recentMatch, 'utf8');
                        return JSON.parse(data);
                    }
                }
            }
        }

        // If no file found, show the first 500 chars of output for debugging
        console.log(`⚠️  No output file found. First 500 chars of output:`);
        console.log(stdout.substring(0, 500));

        // Try to find any JSON file that might contain match data
        const matchFiles = jsonFiles.filter(f =>
            f.includes('odibets') || f.includes('betika') || f.includes('sofascore')
        );

        if (matchFiles.length > 0) {
            const latestFile = matchFiles.sort().reverse()[0];
            console.log(`📂 Attempting to read latest match file: ${latestFile}`);
            try {
                const data = await fs.readFile(latestFile, 'utf8');
                return JSON.parse(data);
            } catch (e) {
                console.log(`❌ Failed to read ${latestFile}: ${e.message}`);
            }
        }

        return null;

    } catch (error) {
        console.log(`❌ Error running ${scraperFile}:`, error.message);
        if (error.stdout) console.log('stdout:', error.stdout.substring(0, 200));
        if (error.stderr) console.log('stderr:', error.stderr.substring(0, 200));
        return null;
    }
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

    // Handle the direct array structure from your scraper
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
 * Extract matches from Betika JSON - Betika shows LOCAL time (EAT)
 */
function extractBetikaMatches(data) {
    if (!data) return [];

    if (data.matches && Array.isArray(data.matches)) {
        return data.matches.map(m => ({
            home: m.home,
            away: m.away,
            // Betika shows local EAT time, not GMT
            kickoff: m.kickoff || '',
            date: m.date || '',
            league: m.league || 'Unknown',
            source: 'Betika',
            timezone: 'EAT' // Changed from GMT to EAT
        }));
    }

    if (Array.isArray(data)) {
        return data.map(m => ({
            home: m.home,
            away: m.away,
            kickoff: m.kickoff || '',
            date: m.date || '',
            league: m.league || 'Unknown',
            source: 'Betika',
            timezone: 'EAT' // Changed from GMT to EAT
        }));
    }

    return [];
}

/**
 * Extract matches from Sofascore JSON - USE GMT TIME
 */
function extractSofascoreMatches(data) {
    if (!data) return [];

    if (data.matches && Array.isArray(data.matches)) {
        return data.matches.map(m => ({
            home: m.home,
            away: m.away,
            // Use GMT time (original time from API)
            kickoff: m.kickoff || m.startTimeGMT || '',
            date: m.date || m.startDate || '',
            league: m.tournament?.name || m.league || 'Unknown',
            source: 'Sofascore',
            timezone: 'GMT' // Keep as GMT since API returns UTC
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
 * Compare kickoff times across all three sources
 */
function compareAllSources(odibetsMatches, betikaMatches, sofascoreMatches) {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 COMPARING KICKOFF TIMES: ALL SOURCES');
    console.log('='.repeat(80));

    console.log(`\n📊 Odibets: ${odibetsMatches.length} matches (EAT)`);
    console.log(`📊 Betika: ${betikaMatches.length} matches (EAT)`); // Changed from GMT
    console.log(`📊 Sofascore: ${sofascoreMatches.length} matches (GMT)`);

    if (DEBUG_NORMALIZATION) {
        console.log('\n🔍 NAME NORMALIZATION DEBUG MODE ENABLED');
        console.log('-'.repeat(80));
    }

    const odibetsDict = {};
    const betikaDict = {};
    const sofascoreDict = {};

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

    // Process Betika matches (EAT time)
    betikaMatches.forEach(m => {
        const home = m.home || '';
        const away = m.away || '';
        const time = m.kickoff || '';
        const date = m.date || '';

        if (home && away && time) {
            const key = normalizeMatchKey(home, away, 'Betika', 'Betika');
            betikaDict[key] = { home, away, time, date, league: m.league };
        }
    });

    // Process Sofascore matches (GMT time)
    sofascoreMatches.forEach(m => {
        const home = m.home || '';
        const away = m.away || '';
        const time = m.kickoff || '';
        const date = m.date || '';

        if (home && away && time) {
            const key = normalizeMatchKey(home, away, 'Sofascore', 'Sofascore');
            sofascoreDict[key] = { home, away, time, date, league: m.league };
        }
    });

    // Get all unique match keys
    const allKeys = new Set([
        ...Object.keys(odibetsDict),
        ...Object.keys(betikaDict),
        ...Object.keys(sofascoreDict)
    ]);

    console.log(`\n📊 Total unique matches found: ${allKeys.size}`);

    if (DEBUG_NORMALIZATION && allKeys.size > 0) {
        console.log('\n📋 Sample of generated keys:');
        const sampleKeys = Array.from(allKeys).slice(0, 5);
        sampleKeys.forEach((key, i) => {
            console.log(`   ${i+1}. ${key}`);
            if (odibetsDict[key]) console.log(`      Odibets: ${odibetsDict[key].home} vs ${odibetsDict[key].away}`);
            if (betikaDict[key]) console.log(`      Betika: ${betikaDict[key].home} vs ${betikaDict[key].away}`);
            if (sofascoreDict[key]) console.log(`      Sofascore: ${sofascoreDict[key].home} vs ${sofascoreDict[key].away}`);
        });
    }

    const discrepancies = [];
    const matched = [];
    const onlyInOdibets = [];
    const onlyInBetika = [];
    const onlyInSofascore = [];

    for (const key of allKeys) {
        const odibetsMatch = odibetsDict[key];
        const betikaMatch = betikaDict[key];
        const sofascoreMatch = sofascoreDict[key];

        const sources = [];
        if (odibetsMatch) sources.push('Odibets');
        if (betikaMatch) sources.push('Betika');
        if (sofascoreMatch) sources.push('Sofascore');

        // If match appears in at least 2 sources, check for conflicts
        if (sources.length >= 2) {
            if (DEBUG_NORMALIZATION) {
                console.log(`\n🔍 Checking match: ${key}`);
                console.log(`   Found in: ${sources.join(', ')}`);
            }

            const times = {};
            if (odibetsMatch) times.Odibets = odibetsMatch.time;
            if (betikaMatch) times.Betika = betikaMatch.time;
            if (sofascoreMatch) times.Sofascore = sofascoreMatch.time;

            const uniqueTimes = new Set(Object.values(times));

            if (uniqueTimes.size > 1) {
                // Time conflict!
                const sampleMatch = odibetsMatch || betikaMatch || sofascoreMatch;

                const conflict = {
                    home: sampleMatch.home,
                    away: sampleMatch.away,
                    times: times,
                    date: sampleMatch.date,
                    sources: sources,
                    timestamp: new Date().toISOString()
                };
                discrepancies.push(conflict);

                console.log('\n' + '!'.repeat(70));
                console.log('🚨 TIME CONFLICT FOUND!');
                console.log('!'.repeat(70));
                console.log(`Match: ${sampleMatch.home} vs ${sampleMatch.away}`);
                console.log(`Date: ${sampleMatch.date || 'Unknown'}`);
                if (odibetsMatch) console.log(`   Odibets (EAT): ${odibetsMatch.time}`);
                if (betikaMatch) console.log(`   Betika (EAT): ${betikaMatch.time}`); // Changed from GMT
                if (sofascoreMatch) console.log(`   Sofascore (GMT): ${sofascoreMatch.time}`);

                if (Object.keys(times).length === 2) {
                    const timeValues = Object.values(times);
                    const diff = calculateTimeDifference(timeValues[0], timeValues[1]);
                    console.log(`   Difference: ${diff} minutes`);
                }
                console.log('!'.repeat(70));
            } else {
                matched.push(key);
                if (DEBUG_NORMALIZATION) {
                    console.log(`   ✅ Times match: ${Object.values(times).join(' = ')}`);
                }
            }
        } else {
            // Match appears in only one source
            if (odibetsMatch) onlyInOdibets.push(key);
            if (betikaMatch) onlyInBetika.push(key);
            if (sofascoreMatch) onlyInSofascore.push(key);
        }
    }

    console.log(`\n📊 Detailed Summary:`);
    console.log(`   ✅ Matches in multiple sources with same time: ${matched.length}`);
    console.log(`   ❌ Conflicts found: ${discrepancies.length}`);
    console.log(`   📍 Only in Odibets: ${onlyInOdibets.length}`);
    console.log(`   📍 Only in Betika: ${onlyInBetika.length}`);
    console.log(`   📍 Only in Sofascore: ${onlyInSofascore.length}`);

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
function printSummary(odibetsCount, betikaCount, sofascoreCount, discrepancies) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(80));
    console.log(`⏰ Time: ${new Date().toLocaleString()}`);
    console.log(`📈 Odibets matches: ${odibetsCount} (EAT)`);
    console.log(`📈 Betika matches: ${betikaCount} (EAT)`); // Changed from GMT
    console.log(`📈 Sofascore matches: ${sofascoreCount} (GMT)`);
    console.log(`📈 TOTAL matches: ${odibetsCount + betikaCount + sofascoreCount}`);
    console.log(`🚨 Conflicts found: ${discrepancies.length}`);

    if (discrepancies.length > 0) {
        console.log('\n❌ CONFLICT DETAILS:');
        discrepancies.forEach((d, i) => {
            console.log(`\n   ${i+1}. ${d.home} vs ${d.away}`);
            console.log(`      Date: ${d.date || 'Unknown'}`);
            console.log(`      Sources: ${d.sources.join(', ')}`);
            if (d.times.Odibets) console.log(`      Odibets (EAT): ${d.times.Odibets}`);
            if (d.times.Betika) console.log(`      Betika (EAT): ${d.times.Betika}`); // Changed from GMT
            if (d.times.Sofascore) console.log(`      Sofascore (GMT): ${d.times.Sofascore}`);
        });
    } else {
        console.log('\n✅ All kickoff times match across all sources!');
    }
    console.log('='.repeat(80));
}

/**
 * Run once (quick test)
 */
async function quickTest() {
    console.log('\n🔧 QUICK TEST MODE - ALL SOURCES');
    console.log('='.repeat(60));

    // Define scraper files - UPDATE THESE PATHS TO MATCH YOUR ACTUAL FILENAMES
    const odibetsFile = './odibets_scraper.js';
    const betikaFile = './betika_scraper.js';
    const sofascoreFile = './sofascore_scraper.js';

    console.log('\n📊 Checking scraper files...');
    console.log(`   Odibets: ${await fileExists(odibetsFile) ? '✅' : '❌'} ${odibetsFile}`);
    console.log(`   Betika: ${await fileExists(betikaFile) ? '✅' : '❌'} ${betikaFile}`);
    console.log(`   Sofascore: ${await fileExists(sofascoreFile) ? '✅' : '❌'} ${sofascoreFile}`);

    // Run all scrapers sequentially
    console.log('\n📊 STEP 1: Running Odibets scraper...');
    const odibetsData = await runScraper(odibetsFile);

    if (!odibetsData) {
        console.log('⚠️  Odibets scraper failed, continuing with other sources...');
    }

    console.log('\n📊 STEP 2: Running Betika scraper...');
    const betikaData = await runScraper(betikaFile);

    if (!betikaData) {
        console.log('⚠️  Betika scraper failed, continuing with other sources...');
    }

    console.log('\n📊 STEP 3: Running Sofascore scraper...');
    const sofascoreData = await runScraper(sofascoreFile);

    if (!sofascoreData) {
        console.log('⚠️  Sofascore scraper failed');
    }

    // Extract matches
    const odibetsMatches = odibetsData ? extractOdibetsMatches(odibetsData) : [];
    const betikaMatches = betikaData ? extractBetikaMatches(betikaData) : [];
    const sofascoreMatches = sofascoreData ? extractSofascoreMatches(sofascoreData) : [];

    console.log(`\n📊 Extracted counts:`);
    console.log(`   Odibets: ${odibetsMatches.length} matches`);
    console.log(`   Betika: ${betikaMatches.length} matches`);
    console.log(`   Sofascore: ${sofascoreMatches.length} matches`);

    // Compare them if we have at least 2 sources
    let discrepancies = [];
    if (odibetsMatches.length > 0 || betikaMatches.length > 0 || sofascoreMatches.length > 0) {
        discrepancies = compareAllSources(odibetsMatches, betikaMatches, sofascoreMatches);

        printSummary(
            odibetsMatches.length,
            betikaMatches.length,
            sofascoreMatches.length,
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
            if ((file.startsWith('odibets_matches') ||
                    file.startsWith('betika_matches') ||
                    file.startsWith('sofascore_matches') ||
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
    console.log('\n⚽ KICKOFF TIME COMPARISON - ODIBETS vs BETIKA vs SOFASCORE');
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
    compareAllSources,
    runScraper,
    normalizeMatchKey,
    extractOdibetsMatches,
    extractBetikaMatches,
    extractSofascoreMatches
}