import { GarminClient } from './garmin/GarminClient';
import { ActivityManager } from './data/ActivityManager';
import fs from 'fs';
import path from 'path';

async function main() {
    const client = new GarminClient();
    const activityManager = new ActivityManager();
    const tempDir = path.resolve(process.cwd(), 'temp_downloads');

    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
        await client.init();
        await client.login();

        console.log('Downloading activities...');
        const downloadedFile = await client.downloadActivities(tempDir);

        console.log(`Downloaded to ${downloadedFile}`);

        console.log('Downloading recent splits...');
        const splitsDir = path.resolve(process.cwd(), 'data');
        // NOTE: Since the filename is fixed to 'activity_most_recent_split.csv', 
        // if count > 1, the file will be overwritten by each subsequent download.
        // Only the last downloaded activity's splits will be preserved.
        await client.downloadRecentSplits(1, splitsDir);

        console.log('Merging activities...');
        activityManager.mergeActivities(downloadedFile);

        console.log('Pruning old activities...');
        activityManager.pruneOldActivities();

        console.log('Sync complete.');

        // Cleanup
        fs.unlinkSync(downloadedFile);
        fs.rmdirSync(tempDir);

    } catch (error) {
        console.error('Sync failed:', error);
    } finally {
        await client.close();
    }
}

main();
