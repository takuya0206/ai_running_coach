import { chromium, Browser, Page } from 'playwright';
import { config } from '../config/env';
import fs from 'fs';
import path from 'path';

export class GarminClient {
    private browser: Browser | null = null;
    private page: Page | null = null;

    private static readonly SETTINGS_BUTTON_SELECTORS = [
        // Selectors derived from HTML dump
        'div[class*="ActivitySettingsMenu"] button',
        'div[title="More..."] button',
        'button[aria-label="Toggle Menu"]',

        // Fallback / Standard selectors
        'button[title="Settings"]',
        'button[aria-label="Settings"]',
        'button[aria-label="Activity Options"]',
        'button[aria-label="More"]',
        'button.activity-settings',
        '#activity-settings-btn',
        'button[aria-label="Activity Settings"]',
        'i.icon-gear',
        'button:has(i.icon-gear)',
        'i[class*="gear"]',
        'button:has(i[class*="gear"])'
    ];

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

            // Standard login flow
            await this.page.waitForSelector('input#email', { timeout: 10000 });
            await this.page.fill('input#email', config.GARMIN_EMAIL);
            await this.page.fill('input#password', config.GARMIN_PASSWORD);
            await this.page.click('button[type="submit"]');

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

        try {
            const itemSelector = '[class*="ActivityListItem_listItem"]';
            await this.page.waitForSelector(itemSelector, { timeout: 10000 })
                .catch(() => console.log('Activity list might be empty or different selector'));

            await this.scrollToLoadActivities(itemSelector, 90);

            const exportLink = this.page.getByText('Export CSV');
            if (await exportLink.isVisible()) {
                const downloadPromise = this.page.waitForEvent('download');
                await exportLink.click();
                const download = await downloadPromise;
                const savePath = path.join(downloadPath, 'new_activities.csv');
                await download.saveAs(savePath);
                return savePath;
            } else {
                console.log('Export CSV button not found.');
                throw new Error('Export CSV button not found');
            }
        } catch (e) {
            console.error('Error during download flow', e);
            throw e;
        }
    }

    async downloadRecentSplits(count: number, outputDir: string): Promise<void> {
        if (!this.page) throw new Error('Browser not initialized');

        console.log(`Starting download of splits for top ${count} activities...`);
        this.ensureDirectoryExists(outputDir);

        const activityIds = await this.getRecentActivityIds(count);
        console.log(`Found ${activityIds.length} recent activities: ${activityIds.join(', ')}`);

        for (const id of activityIds) {
            try {
                await this.downloadSplitsForActivity(id, outputDir);
            } catch (err) {
                console.error(`Failed to download splits for activity ${id}`, err);
            }
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    // --- Helper Methods ---

    private ensureDirectoryExists(dir: string) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private async scrollToLoadActivities(itemSelector: string, targetCount: number) {
        let previousCount = 0;
        let currentCount = 0;
        const maxRetries = 3;
        let retries = 0;
        let scrollCount = 0;

        console.log(`Scrolling to load activities (target: ${targetCount})...`);

        while (currentCount < targetCount) {
            currentCount = await this.page!.locator(itemSelector).count();

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
            const lastItem = this.page!.locator(itemSelector).last();
            await lastItem.scrollIntoViewIfNeeded();
            await this.page!.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await this.page!.waitForTimeout(3000);
        }
    }

    private async getRecentActivityIds(count: number): Promise<string[]> {
        if (!this.page!.url().includes('/activities')) {
            await this.page!.goto('https://connect.garmin.com/modern/activities');
            await this.page!.waitForSelector('[class*="ActivityListItem_listItem"]', { timeout: 10000 });
        }

        return await this.page!.evaluate((limit) => {
            const links = Array.from(document.querySelectorAll('a[href*="/modern/activity/"]'));
            const ids = new Set<string>();
            for (const link of links) {
                const href = link.getAttribute('href');
                const match = href?.match(/\/modern\/activity\/(\d+)/);
                if (match) {
                    ids.add(match[1]);
                    if (ids.size >= limit) break;
                }
            }
            return Array.from(ids);
        }, count);
    }

    private async downloadSplitsForActivity(id: string, outputDir: string): Promise<void> {
        console.log(`Processing Activity ${id}...`);
        await this.page!.goto(`https://connect.garmin.com/modern/activity/${id}`);
        await this.page!.waitForTimeout(2000); // Give page time to settle

        const settingsSelector = await this.findAndClickSettingsButton(id, outputDir);

        if (settingsSelector) {
            await this.clickExportSplitsMenuItem(id, outputDir, settingsSelector);
        } else {
            console.warn(`Could not find settings button for activity ${id}.`);
            await this.logDebugInfo(id, outputDir, 'settings');
        }
    }

    private async findAndClickSettingsButton(id: string, outputDir: string): Promise<string | null> {
        for (const selector of GarminClient.SETTINGS_BUTTON_SELECTORS) {
            if (await this.page!.isVisible(selector)) {
                console.log(`Found settings button with selector: ${selector}`);
                await this.page!.click(selector);
                return selector;
            }
        }
        return null;
    }

    private async clickExportSplitsMenuItem(id: string, outputDir: string, settingsSelector: string): Promise<void> {
        // Wait for menu animation
        await this.page!.waitForTimeout(1000);
        const exportSplitsItem = this.page!.getByText('Export Splits to CSV');

        try {
            await exportSplitsItem.waitFor({ state: 'visible', timeout: 5000 });
            await this.triggerDownload(id, outputDir, exportSplitsItem);
        } catch (e) {
            console.warn(`"Export Splits to CSV" not found/clickable. Retrying...`);

            // Retry: Click settings again to ensure menu is open
            await this.page!.click(settingsSelector);
            await this.page!.waitForTimeout(1000);

            if (await exportSplitsItem.isVisible()) {
                await this.triggerDownload(id, outputDir, exportSplitsItem);
                console.log(`Downloaded splits for activity ${id} (after retry)`);
            } else {
                await this.logDebugInfo(id, outputDir, 'menu');
                throw new Error('Export Splits to CSV option not found after retry');
            }
        }
    }

    private async triggerDownload(id: string, outputDir: string, element: any): Promise<void> {
        const downloadPromise = this.page!.waitForEvent('download');
        await element.click();
        const download = await downloadPromise;
        const savePath = path.join(outputDir, `activity_${id}_splits.csv`);
        await download.saveAs(savePath);
        console.log(`Downloaded splits for activity ${id}`);
    }

    private async logDebugInfo(id: string, outputDir: string, type: 'settings' | 'menu') {
        const screenshotPath = path.join(outputDir, `error_activity_${id}_${type}.png`);

        // Log HTML snippet
        try {
            const container = type === 'settings'
                ? await this.page!.$('div[class*="ActivityHeader"]')
                : await this.page!.$('body');

            if (container) {
                const html = await container.innerHTML();
                console.log(`DEBUG: ${type === 'settings' ? 'Header' : 'Page'} HTML:`, html.substring(0, 5000));
            }
        } catch (e) {
            console.log('Failed to capture debug HTML');
        }

        // Capture screenshot
        try {
            await this.page!.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Saved debug screenshot to ${screenshotPath}`);
        } catch (e) {
            console.log('Failed to capture screenshot');
        }
    }
}
