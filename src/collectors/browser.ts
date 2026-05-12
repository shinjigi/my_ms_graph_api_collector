import path from "node:path";
import * as nodeFs from "node:fs/promises";
import { chromium, BrowserContext, Page } from "playwright";
import { CONFIG } from "@shared/env-config";

export interface BrowserOptions {
    headless?: boolean;
    slowMo?: number;
    args?: string[];
}

export interface BrowserSession {
    context: BrowserContext;
    page: Page;
}

/**
 * Apre una sessione Chromium persistente nel profilo condiviso di automazione
 * (AUTOMATION_PROFILE_DIR). Il profilo separato evita che la cronologia delle
 * sessioni di scraping finisca nel collector della browser history.
 */
export async function createBrowserSession(options: BrowserOptions = {}): Promise<BrowserSession> {
    const { headless = true, slowMo, args = [] } = options;
    const profileDir = path.resolve(CONFIG.AUTOMATION_PROFILE_DIR);
    await nodeFs.mkdir(profileDir, { recursive: true });

    const context = await chromium.launchPersistentContext(profileDir, {
        headless,
        ...(slowMo !== undefined && { slowMo }),
        args,
    });

    const page = await context.newPage();
    return { context, page };
}
