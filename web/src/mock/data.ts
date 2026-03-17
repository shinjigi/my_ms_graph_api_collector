import type { Day, TsRow, UsCard, TlEvent, Email, Holiday } from '../types';

/** Standard contractual workday: 7h 42min = 7.7 decimal hours. */
export const WORKDAY_HOURS      = 7.7;
/** Half contractual workday: 3h 51min = 3.85 decimal hours. */
export const HALF_WORKDAY_HOURS = 3.85;

export const HOLIDAYS_IT: Holiday[] = [
    { m:  0, d:  1, name: 'Capodanno' },
    { m:  0, d:  6, name: 'Epifania' },
    { m:  3, d:  5, name: 'Pasqua 2026' },
    { m:  3, d:  6, name: "Lunedì dell'Angelo" },
    { m:  3, d: 25, name: 'Festa della Liberazione' },
    { m:  4, d:  1, name: 'Festa del Lavoro' },
    { m:  5, d:  2, name: 'Festa della Repubblica' },
    { m:  7, d: 15, name: 'Ferragosto' },
    { m: 10, d:  1, name: 'Ognissanti' },
    { m: 11, d:  8, name: 'Immacolata' },
    { m: 11, d: 25, name: 'Natale' },
    { m: 11, d: 26, name: 'Santo Stefano' },
];

export const MONTH_IT  = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                           'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
export const DAYABB_IT = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

export const DAYS: Day[] = [
    { label:'Lun', date:'1 Giu',  rend:'ok',   zucHours:8,   nibol:'🏠 SW',     holiday:false },
    { label:'Mar', date:'2 Giu',  rend:'ok',   zucHours:0,   nibol:null,         holiday:true,  holidayName:'🇮🇹 Festa della Repubblica' },
    { label:'Mer', date:'3 Giu',  rend:'warn', zucHours:WORKDAY_HOURS, nibol:'🏢 Ufficio', holiday:false },
    { label:'Gio', date:'4 Giu',  rend:'err',  zucHours:0,   nibol:'🏢 Ufficio', holiday:false },
    { label:'Ven', date:'5 Giu',  rend:null,   zucHours:WORKDAY_HOURS, nibol:'🏠 SW',     holiday:false },
    { label:'Sab', date:'6 Giu',  rend:null,   zucHours:0,   nibol:null,         holiday:false },
    { label:'Dom', date:'7 Giu',  rend:null,   zucHours:0,   nibol:null,         holiday:false },
];

export const TS_ACTIVE: TsRow[] = [
    { project:'BAU - Team ITA Web', us:'Staff company meetings #2026',      tpId:326100, state:'Inception',     totAllTime:47,  hours:[0,0,0.5,0,0,0,0],   git:[0,0,1,0,0,0,0], svn:[0,0,0,0,0,0,0], notes:[null,null,'Standup BAU ITA',null,null,null,null] },
    { project:'BAU - Team ITA Web', us:'Deploy process #2026',              tpId:326279, state:'Inception',     totAllTime:112, hours:[0,0,0,0,1,0,0],     git:[0,0,0,1,1,0,0], svn:[0,0,0,0,0,0,0], notes:[null,null,null,null,'Pipeline ACC fix',null,null] },
    { project:'BAU - Team ITA Web', us:'AssetVersioning updates',           tpId:326215, state:'Dev/Unit test', totAllTime:89,  hours:[1,0,1,0,0.5,0,0],   git:[1,0,1,0,0,0,0], svn:[0,0,0,0,0,0,0], notes:['auth config',null,'asset migr.',null,'batch fix',null,null] },
    { project:'BAU - Team ITA Web', us:'PC emails network TP #2026',        tpId:324913, state:'Inception',     totAllTime:203, hours:[1,0,2.5,1,1,0,0],   git:[0,0,0,0,0,0,0], svn:[0,0,1,0,0,0,0], notes:['graph auth',null,'filter API + paginaz.',null,'send module',null,null] },
    { project:'BAU - Team ITA Web', us:'SnapTest #2026',                    tpId:326301, state:'Inception',     totAllTime:31,  hours:[0,0,0,1,0.5,0,0],   git:[0,0,0,0,0,0,0], svn:[0,0,0,0,0,0,0], notes:[null,null,null,'analisi scenari',null,null,null] },
    { project:'BAU - Team ITA Web', us:'Incident #2026',                    tpId:326200, state:'Inception',     totAllTime:18,  hours:[0.5,0,0,0.5,0,0,0], git:[0,0,0,0,0,0,0], svn:[0,0,0,0,0,0,0], notes:['hotfix prod',null,null,'triage',null,null,null] },
    { project:'Sitecore upgrade',   us:'SC - Upgrade LocalRuntime ITA Web', tpId:326183, state:'Testing',       totAllTime:55,  hours:[0,0,0,0,0,0,0],     git:[1,0,2,1,1,0,0], svn:[0,0,0,1,0,0,0], rem:0.2 },
];

export const TS_PINNED: TsRow[] = [
    { project:'BAU - Team ITA Web',  us:'English Course - AltreAule 2025',          tpId:325800, state:'Dev/Unit test', totAllTime:24 },
    { project:'BAU - Team ITA Web',  us:'Business support / Other teams #2026',     tpId:326110, state:'Inception',     totAllTime:67 },
    { project:'BAU - Team ITA Web',  us:'Sitecore Refactors and Updates #2026',     tpId:326155, state:'Inception',     totAllTime:8,  rem:0.2 },
    { project:'BAU - Team ITA Web',  us:'Sprint ceremonies & planning #2026',       tpId:326080, state:'Inception',     totAllTime:32 },
    { project:'BAU - Team ITA Web',  us:'Code review & PR activity #2026',          tpId:326090, state:'Inception',     totAllTime:41 },
    { project:'BAU - Team ITA Web',  us:'Documentation & Confluence updates #2026', tpId:325950, state:'Inception',     totAllTime:15 },
    { project:'BAU - Team ITA Web',  us:'DevOps / CI-CD maintenance #2026',         tpId:326050, state:'Inception',     totAllTime:28 },
    { project:'BAU - Team ITA Web',  us:'Tech debt & minor bugfixes #2026',         tpId:326060, state:'Dev/Unit test', totAllTime:19 },
    { project:'Sitecore upgrade',    us:'SC - ALine upgrade prep & validation',     tpId:326190, state:'Inception',     totAllTime:12 },
    { project:'Sitecore upgrade',    us:'SC - SXA component refactor',              tpId:326195, state:'Dev/Unit test', totAllTime:34 },
    { project:'ALine Pricing',       us:'Pricing widget — performance fixes',       tpId:325900, state:'Testing',       totAllTime:21 },
    { project:'ALine Pricing',       us:'Weekly price newsletter #2026',            tpId:326375, state:'Inception',     totAllTime:9  },
];

export const TL_EVENTS: TlEvent[] = [
    { type:'email-in',  time:'08:45', label:'Re: Deploy process #2026 — test su ACC',                         top: 45,  h:18, emailId:0, corrUs:'Deploy process #2026' },
    { type:'meeting',   time:'09:00', label:'Standup BAU ITA',                                                 top: 60,  h:15 },
    { type:'email-out', time:'09:20', label:'Re: Deploy process #2026 — risolto, riprovo',                    top: 80,  h:18, emailId:1, corrUs:'Deploy process #2026' },
    { type:'commit',    time:'10:14', label:'[ALine] Fix SVN/Git author filtering',                            top:134,  h:18 },
    { type:'email-in',  time:'10:30', label:'AssetVersioning — errore su staging',                            top:150,  h:18, emailId:2, corrUs:'AssetVersioning updates' },
    { type:'email-in',  time:'11:15', label:'FW: PC emails network — aggiornamento sprint',                   top:195,  h:18, emailId:3, corrUs:'PC emails network TP #2026' },
    { type:'email-in',  time:'11:40', label:'Reminder: Sprint review alle 16:30',                             top:220,  h:18 },
    { type:'email-out', time:'13:30', label:'AssetVersioning — fix deployato su staging',                     top:330,  h:18, emailId:5, corrUs:'AssetVersioning updates' },
    { type:'email-in',  time:'14:00', label:'Re: Deploy process #2026 — ambiente ok ✓',                      top:360,  h:18, emailId:6, corrUs:'Deploy process #2026' },
    { type:'commit',    time:'14:22', label:'[LocalITA] Zucchetti scraper fix',                               top:382,  h:18 },
    { type:'meeting',   time:'15:00', label:'Code Review #326279',                                            top:420,  h:45 },
    { type:'svn',       time:'16:05', label:'[my_ms_graph_api_collector][#324913] PC emails network - send',  top:485,  h:18 },
    { type:'meeting',   time:'16:30', label:'Sprint Review',                                                  top:510,  h:30 },
    { type:'email-in',  time:'16:50', label:'Recap Sprint Review — action items',                             top:530,  h:18, emailId:7 },
    { type:'commit',    time:'17:10', label:'[shinjigi] Analyzer — multi-backend LLM',                       top:550,  h:18 },
];

export const EMAILS: Email[] = [
    { dir:'in',  from:'giulia.f@euroconsumers.org',    to:'me',                         subject:'Re: Deploy process #2026 — test su ACC fallito',      time:'08:45', body:'Ciao Lorenzo,\n\nho riprovato il deploy su ACC ma continua a dare 500 sul modulo pricing.\n\nPuoi verificare? Il ticket su TP è #326279.\n\nGrazie,\nGiulia' },
    { dir:'out', from:'me',                            to:'giulia.f@euroconsumers.org', subject:'Re: Deploy process #2026 — risolto, riprovo',         time:'09:20', body:'Ciao Giulia,\n\nho aggiornato il connection string su KeyVault e rilanciato il pipeline.\n\nLorenzo' },
    { dir:'in',  from:'marco.r@euroconsumers.org',     to:'me',                         subject:'AssetVersioning — errore su staging',                  time:'10:30', body:'Ciao,\n\nIl processo di migrazione assets si blocca al 34% con OutOfMemoryException.\n\nMarco' },
    { dir:'in',  from:'pm@euroconsumers.org',           to:'team-ita@euroconsumers.org', subject:'FW: PC emails network — aggiornamento sprint',        time:'11:15', body:'Team,\n\nScope ridotto: solo modulo invio, non ricezione.\nDeadline confermata fine sprint.\n\nGrazie' },
    { dir:'in',  from:'calendar@microsoft.com',         to:'me',                         subject:'Reminder: Sprint review alle 16:30',                  time:'11:40', body:'Promemoria: Sprint Review è programmato per oggi alle 16:30.\n\nPartecipanti: team BAU ITA Web + PO + SM\nDurata: 30 minuti' },
    { dir:'out', from:'me',                            to:'marco.r@euroconsumers.org',  subject:'AssetVersioning — fix deployato su staging',          time:'13:30', body:'Marco,\n\nHo ridotto il batch size a 100 items. Fix deployato su staging, puoi verificare.\n\nLorenzo' },
    { dir:'in',  from:'giulia.f@euroconsumers.org',    to:'me',                         subject:'Re: Deploy process #2026 — ambiente ok ✓',            time:'14:00', body:'Lorenzo,\n\nconfermato! Il deploy su ACC è andato a buon fine.\n\nGrazie mille!\nGiulia' },
    { dir:'in',  from:'scrummaster@euroconsumers.org', to:'team-ita@euroconsumers.org', subject:'Recap Sprint Review — action items',                  time:'16:50', body:'Ciao a tutti,\n\nAction items:\n- Lorenzo: aggiornare ore TP entro lunedì\n- Marco: chiudere PR #448\n- Giulia: documentare test su Confluence' },
];

export const US_TODAY_DEFAULT: UsCard[] = [
    {
        us:'Deploy process #2026', tpId:326279, state:'Inception',
        tpHours:1, zucHours:WORKDAY_HOURS, zucPercent:14,
        emails:3, commits:1, meetings:1,
        color:'#6366f1',
        note:'Pipeline ACC fix — KeyVault connection string aggiornato, deploy ripristinato.',
    },
    {
        us:'AssetVersioning updates', tpId:326215, state:'Dev/Unit test',
        tpHours:0.5, zucHours:WORKDAY_HOURS, zucPercent:7,
        emails:2, commits:1, meetings:0,
        color:'#8b5cf6',
        note:'batch size ridotto a 100 items su staging — OOM risolto, migrazione assets completata.',
    },
];
