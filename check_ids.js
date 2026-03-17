const fs = require('fs');
const html = fs.readFileSync('c:\\SVN\\_GH\\_shinjigi_WIN\\my_ms_graph_api_collector\\data\\nibol_book_page.html', 'utf8');
const pinRegex = /<div [^>]*class="[^"]*Floorplan_deskMarkerPin__[^"]*"[^>]*>/g;
let match;
while ((match = pinRegex.exec(html)) !== null) {
    const chunk = match[0];
    if (chunk.includes('aria-describedby')) {
        console.log('Pin with aria-describedby:', chunk);
    } else {
        // console.log('Pin without aria-describedby');
    }
}
const tooltipRegex = /id="[^"]*"[^>]*class="[^"]*leaflet-tooltip[^"]*"/g;
while ((match = tooltipRegex.exec(html)) !== null) {
    console.log('Tooltip found:', html.substring(match.index, match.index + 200));
}
