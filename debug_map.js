const fs = require('fs');
const html = fs.readFileSync('c:\\SVN\\_GH\\_shinjigi_WIN\\my_ms_graph_api_collector\\data\\nibol_book_page.html', 'utf8');

const regex = /<div [^>]*class="[^"]*leaflet-tooltip[^"]*"[^>]*>/g;
let match;
while ((match = regex.exec(html)) !== null) {
    console.log('--- Tooltip Div ---');
    const start = match.index;
    const end = html.indexOf('</div>', start) + 6;
    console.log(html.substring(start, end));
}

const pinRegex = /<div [^>]*class="[^"]*Floorplan_deskMarkerPin__[^"]*"[^>]*>/g;
console.log('Searching pins...');
let pinCount = 0;
while ((match = pinRegex.exec(html)) !== null && pinCount < 5) {
    console.log('--- Pin Div ---');
    console.log(match[0]);
    pinCount++;
}
