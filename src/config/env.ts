import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
    GARMIN_EMAIL: process.env.GARMIN_EMAIL || '',
    GARMIN_PASSWORD: process.env.GARMIN_PASSWORD || '',
    HEADLESS: process.env.HEADLESS !== 'false', // Default to true
    ACTIVITY_RETENTION_DAYS: parseInt(process.env.ACTIVITY_RETENTION_DAYS || '90', 10),
};
