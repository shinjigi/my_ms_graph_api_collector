import { CONFIG } from "@shared/env-config";

export const config = {
    tenantId: CONFIG.TENANT_ID,
    clientId: CONFIG.CLIENT_ID,
    top:      CONFIG.TOP,
    scopes:   ["Mail.Read", "Calendars.Read", "Chat.Read"] as string[],
};
