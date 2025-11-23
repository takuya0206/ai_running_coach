import { ActivityManager } from '../src/data/ActivityManager';
import fs from 'fs';
import path from 'path';
import { Activity } from '../src/types';

import { format, subDays } from 'date-fns';

const today = new Date();
const fmt = (d: Date) => format(d, 'yyyy-MM-dd HH:mm:ss');

// Mock data
const mockActivities1: Activity[] = [
    { 'Date': fmt(subDays(today, 1)), 'Title': 'Run 1', 'Activity Type': 'Running' } as any,
    { 'Date': fmt(subDays(today, 2)), 'Title': 'Run 2', 'Activity Type': 'Running' } as any,
];

const mockActivities2: Activity[] = [
    { 'Date': fmt(subDays(today, 1)), 'Title': 'Run 1 Updated', 'Activity Type': 'Running' } as any, // Duplicate date, should update or keep? Logic says overwrite.
    { 'Date': fmt(subDays(today, 3)), 'Title': 'Run 3', 'Activity Type': 'Running' } as any,
];

const oldActivity: Activity = { 'Date': fmt(subDays(today, 100)), 'Title': 'Old Run', 'Activity Type': 'Running' } as any;

async function test() {
    const testDataDir = path.resolve(process.cwd(), 'test_data');
    if (!fs.existsSync(testDataDir)) fs.mkdirSync(testDataDir);

    // Mock the data directory in ActivityManager (we might need to subclass or adjust for testing, 
    // but for now let's just swap the path in the instance if possible, or just use the real one and clean up)
    // Since ActivityManager hardcodes 'data' dir, we should probably make it configurable or just run in a test env.
    // Let's modify ActivityManager to accept a base path or just use the current cwd which is fine if we clean up.

    // Actually, let's just use the real class and check the 'data/activities.csv' file.
    // We will backup existing if any.

    const manager = new ActivityManager();
    const activitiesFile = path.join(process.cwd(), 'data', 'activities.csv');

    if (fs.existsSync(activitiesFile)) fs.renameSync(activitiesFile, activitiesFile + '.bak');

    try {
        console.log('Test 1: Save and Load');
        manager.saveActivities(mockActivities1);
        const loaded = manager.loadActivities();
        console.assert(loaded.length === 2, 'Should load 2 activities');
        console.log('Passed.');

        console.log('Test 2: Merge');
        // Create a temp file for new activities
        const tempNewFile = path.join(process.cwd(), 'new_activities.csv');
        const tempContent = `Date,Title,Activity Type\n"${mockActivities2[0].Date}","${mockActivities2[0].Title}","Running"\n"${mockActivities2[1].Date}","${mockActivities2[1].Title}","Running"`;
        fs.writeFileSync(tempNewFile, tempContent);

        manager.mergeActivities(tempNewFile);
        const merged = manager.loadActivities();
        console.assert(merged.length === 3, `Should have 3 activities, got ${merged.length}`);
        const updated = merged.find(a => a.Date === mockActivities2[0].Date);
        console.assert(updated?.Title === 'Run 1 Updated', 'Should update duplicate');
        console.log('Passed.');

        fs.unlinkSync(tempNewFile);

        console.log('Test 3: Pruning');
        // Add an old activity
        const withOld = [...merged, oldActivity];
        manager.saveActivities(withOld);
        manager.pruneOldActivities();
        const pruned = manager.loadActivities();
        console.assert(pruned.length === 3, `Should have 3 activities after pruning, got ${pruned.length}`);
        console.assert(!pruned.find(a => a.Date === oldActivity.Date), 'Old activity should be gone');
        console.log('Passed.');

    } catch (e) {
        console.error('Test failed', e);
    } finally {
        // Cleanup
        if (fs.existsSync(activitiesFile)) fs.unlinkSync(activitiesFile);
        if (fs.existsSync(activitiesFile + '.bak')) fs.renameSync(activitiesFile + '.bak', activitiesFile);
    }
}

test();
