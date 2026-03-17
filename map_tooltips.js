const fs = require('fs');
const html = fs.readFileSync('c:\\SVN\\_GH\\_shinjigi_WIN\\my_ms_graph_api_collector\\data\\nibol_book_page.html', 'utf8');

const regex = /id="([^"]*)"[^>]*class="[^"]*leaflet-tooltip[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
let match;
const tooltips = {};
while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    const text = match[2].replace(/<[^>]*>/g, '').trim();
    if (text) tooltips[id] = text;
}
console.log('Tooltips found:', JSON.stringify(tooltips, null, 2));

const pinRegex = /<div [^>]*class="[^"]*Floorplan_deskMarkerPin__[^"]*"[^>]*aria-describedby="([^"]+)"/g;
const links = [];
while ((match = pinRegex.exec(html)) !== null) {
    links.push({ pinChunk: match[0].substring(0, 50), tooltipId: match[1] });
}
console.log('Links found:', JSON.stringify(links, null, 2));
