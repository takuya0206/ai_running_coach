import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { Activity } from '../types';
import { subDays, parse as parseDate, format } from 'date-fns';

import { config } from '../config/env';

export class ActivityManager {
    private dataDir: string;
    private activitiesFile: string;

    constructor() {
        this.dataDir = path.resolve(process.cwd(), 'data');
        this.activitiesFile = path.join(this.dataDir, 'activities.csv');

        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    loadActivities(): Activity[] {
        if (!fs.existsSync(this.activitiesFile)) {
            return [];
        }
        const content = fs.readFileSync(this.activitiesFile, 'utf-8');
        return parse(content, {
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true
        });
    }

    saveActivities(activities: Activity[]) {
        const output = stringify(activities, {
            header: true
        });
        fs.writeFileSync(this.activitiesFile, output);
    }

    mergeActivities(newActivitiesFile: string) {
        const currentActivities = this.loadActivities();

        const newContent = fs.readFileSync(newActivitiesFile, 'utf-8');
        const newActivities: Activity[] = parse(newContent, {
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true
        });

        // Merge logic:
        // We assume 'Date' and 'Title' (or 'Activity Type') combined might be unique enough, 
        // but Garmin exports usually don't have a unique ID column in the CSV.
        // However, 'Date' is usually precise (e.g., "2023-10-27 18:00:00").
        // Let's use 'Date' as the primary key for deduplication.

        const activityMap = new Map<string, Activity>();

        // Load current
        for (const activity of currentActivities) {
            activityMap.set(activity['Date'], activity);
        }

        // Merge new (overwrite if exists, or just add?)
        // Usually we want to keep the latest info.
        for (const activity of newActivities) {
            activityMap.set(activity['Date'], activity);
        }

        const merged = Array.from(activityMap.values());

        // Sort by date descending
        merged.sort((a, b) => {
            const dateA = new Date(a['Date']).getTime();
            const dateB = new Date(b['Date']).getTime();
            return dateB - dateA;
        });

        this.saveActivities(merged);
        console.log(`Merged ${newActivities.length} new activities. Total: ${merged.length}`);
    }

    pruneOldActivities() {
        const activities = this.loadActivities();
        const cutoffDate = subDays(new Date(), config.ACTIVITY_RETENTION_DAYS);

        const filtered = activities.filter(activity => {
            // Date format in Garmin CSV is usually "YYYY-MM-DD HH:mm:ss" or similar.
            // We rely on standard Date parsing.
            const activityDate = new Date(activity['Date']);
            return activityDate >= cutoffDate;
        });

        if (filtered.length < activities.length) {
            console.log(`Pruned ${activities.length - filtered.length} old activities.`);
            this.saveActivities(filtered);
        }
    }
}
