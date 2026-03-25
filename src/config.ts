import * as dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) {
        throw new Error(`Variabile mancante: ${key}. Copia .env.example in .env e valorizzala.`);
    }
    return val;
}

export const config = {
    tenantId: requireEnv("TENANT_ID"),
    clientId: requireEnv("CLIENT_ID"),
    top:      Number(process.env["TOP"] ?? 25),
    scopes:   ["Mail.Read", "Calendars.Read", "Chat.Read"] as string[],
};
