import { chromium, Browser, Page } from 'playwright';
import { config } from '../config/env';
import fs from 'fs';
import path from 'path';

export class GarminClient {
    private browser: Browser | null = null;
    private page: Page | null = null;

    async init() {
        this.browser = await chromium.launch({
            headless: config.HEADLESS,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });
        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        this.page = await context.newPage();
    }

    async login() {
        if (!this.page) throw new Error('Browser not initialized');

        console.log('Navigating to Garmin Connect login...');

        try {
            await this.page.goto('https://connect.garmin.com/signin');

            // Wait for the login iframe or redirect
            // Note: Garmin's login flow can be complex and dynamic. 
            // This is a best-effort implementation for the standard flow.
            // Often it redirects to sso.garmin.com

            // Wait for email input. It might be inside an iframe.
            // For simplicity, we'll try to find it on the main page or wait for redirect.
            // Garmin often uses a popup or redirect for SSO.

            // Let's assume standard redirect flow for now.
            await this.page.waitForSelector('input#email', { timeout: 10000 });
            await this.page.fill('input#email', config.GARMIN_EMAIL);
            await this.page.fill('input#password', config.GARMIN_PASSWORD);

            // Click login button
            await this.page.click('button[type="submit"]');

            // Wait for navigation to dashboard or activities
            await this.page.waitForURL('**/modern/**', { timeout: 30000 });
            console.log('Login successful.');
        } catch (e) {
            console.error('Login failed or timed out. Please check credentials or try non-headless mode.');
            if (this.page) {
                await this.page.screenshot({ path: 'login-error.png', fullPage: true });
                console.log('Screenshot saved to login-error.png');
            }
            throw e;
        }
    }

    async downloadActivities(downloadPath: string): Promise<string> {
        if (!this.page) throw new Error('Browser not initialized');

        console.log('Navigating to Activities page...');
        await this.page.goto('https://connect.garmin.com/modern/activities');

        // Wait for the export button or link. 
        // The URL for CSV export is usually dynamic or triggered via UI.
        // However, there is a known endpoint: https://connect.garmin.com/modern/proxy/activitylist-service/activities/search/activities?limit=20&start=0
        // But the user requested "Export CSV" button click simulation.

        // Actually, the "Export CSV" link is often visible on the activities list page.
        // Let's try to find the "Export CSV" link.
        // If it's hard to find, we might need to use the direct API endpoint if authenticated.
        // But let's stick to the requirement: "Click Export CSV".

        // Note: The UI might have changed. 
        // A common way to get all activities is hitting the endpoint directly after login.
        // But let's try to find the button first.

        // As a fallback/robust method for this task, navigating to the specific export URL 
        // or intercepting the download is better.
        // Let's try to click the button if it exists, otherwise use a direct download approach if possible.

        // Looking for "Export CSV" usually requires selecting activities or it's a link at the bottom.
        // Actually, on the modern interface, it might be hidden under a menu.

        // Strategy:
        // 1. Wait for page load.
        // 2. Look for "Export CSV" text.

        // Refined Strategy:
        // Garmin Connect Modern Activities page is a SPA.
        // The "Export CSV" link is typically `https://connect.garmin.com/modern/activities/export/csv` (if it exists) or similar.
        // Let's try to navigate directly to the CSV export URL if we can confirm it.
        // If not, we'll try to find the button.

        // Let's try to find the "Export CSV" link.
        try {
            // Wait for the list to load
            const itemSelector = '[class*="ActivityListItem_listItem"]';
            await this.page.waitForSelector(itemSelector, { timeout: 10000 }).catch(() => console.log('Activity list might be empty or different selector'));

            // Scroll to load more activities (target ~90)
            let previousCount = 0;
            let currentCount = 0;
            const targetCount = 90;
            const maxRetries = 3;
            let retries = 0;
            let scrollCount = 0;

            console.log(`Scrolling to load activities (target: ${targetCount})...`);

            while (currentCount < targetCount) {
                currentCount = await this.page.locator(itemSelector).count();

                if (currentCount > previousCount) {
                    scrollCount++;
                    console.log(`Scrolling... (${scrollCount} times)`);
                    retries = 0;
                } else {
                    retries++;
                }

                if (currentCount >= targetCount) break;

                if (retries >= maxRetries) {
                    console.log('No new activities loaded after scrolling. Stopping scroll.');
                    break;
                }

                previousCount = currentCount;

                // Scroll the last item into view to trigger load
                const lastItem = this.page.locator(itemSelector).last();
                await lastItem.scrollIntoViewIfNeeded();

                // Also try window scroll just in case
                await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

                // Wait for content to load
                await this.page.waitForTimeout(3000);
            }

            // Note: The "Export CSV" link is often at the bottom right or in a "hamburger" menu.
            // Let's try to find a link with text "Export CSV".
            const exportLink = this.page.getByText('Export CSV');

            if (await exportLink.isVisible()) {
                const downloadPromise = this.page.waitForEvent('download');
                await exportLink.click();
                const download = await downloadPromise;
                const savePath = path.join(downloadPath, 'new_activities.csv');
                await download.saveAs(savePath);
                return savePath;
            } else {
                console.log('Export CSV button not found. Trying direct navigation to export URL...');
                // This is a guess based on common Garmin patterns, might need adjustment.
                // Actually, the user requirement says "Click Export CSV". 
                // If we can't find it, we might need to ask user or refine.
                // Let's try a known export URL pattern if button fails.
                // But for now, let's fail if we can't find it, or maybe just dump the page content for debugging?
                // No, let's try to be robust.

                // Alternative: The user might mean the "Export Original" on a single activity? 
                // No, "activities" implies the list.
                // There is an "Export to CSV" link on the activities page usually.

                throw new Error('Export CSV button not found');
            }
        } catch (e) {
            console.error('Error during download flow', e);
            throw e;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}
