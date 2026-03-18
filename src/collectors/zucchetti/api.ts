/**
 * Zucchetti API Module
 * 
 * Provides direct access to Zucchetti data through internal BFF endpoints,
 * bypassing DOM scraping.
 */

export interface ZucchettiApiConfig {
    baseUrl: string; // e.g. 'https://saas.hrzucchetti.it'
    cookies: string; // Session cookies (JSESSIONID, ipclientid, spcookie)
    idCompany: string; // e.g. '000111'
    idEmploy: string; // e.g. '0000254'
    m_cCheck: string; // Dynamic token retrieved from the page context
}

export interface ZucchettiApiRawResponse {
    Fields: string[];
    Data: any[][];
}

/**
 * Fetches timesheet data directly from the Zucchetti SQLDataProviderServer.
 */
export async function fetchZucchettiTimesheet(
    config: ZucchettiApiConfig,
    year: string,
    month: string
): Promise<ZucchettiApiRawResponse> {
    const url = `${config.baseUrl}/WFzcs01/servlet/SQLDataProviderServer`;
    
    // Convert configuration and parameters into URLSearchParams (x-www-form-urlencoded)
    const body = new URLSearchParams({
        rows: '300',
        startrow: '0',
        count: 'false',
        sqlcmd: 'rows:hfpr_fcartellino3',
        IDCOMPANY: config.idCompany,
        IDEMPLOY: config.idEmploy,
        Anno: year,
        Mese: month,
        m_cCheck: config.m_cCheck,
        isclientdb: 'false',
        Visualiz: '',
        LaFlexi: 'N',
        HHMM: 'N'
    });

    const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': config.cookies,
        'Referer': `${config.baseUrl}/WFzcs01/servlet/hfpr_bcapcarte`,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: body.toString()
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Zucchetti API Request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json() as ZucchettiApiRawResponse;
    return data;
}

/**
 * Utility to map the position-based 'Data' response into objects using 'Fields' keys.
 */
export function mapRawDataToObjects<T = any>(raw: ZucchettiApiRawResponse): T[] {
    const { Fields, Data } = raw;
    return Data.map(row => {
        const obj: any = {};
        Fields.forEach((field, index) => {
            obj[field] = row[index];
        });
        return obj as T;
    });
}
