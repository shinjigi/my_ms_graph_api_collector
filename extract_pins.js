const fs = require('fs');
const html = fs.readFileSync('c:\\SVN\\_GH\\_shinjigi_WIN\\my_ms_graph_api_collector\\data\\nibol_book_page.html', 'utf8');
const regex = /<div [^>]*class="[^"]*Floorplan_deskMarkerPin__[^"]*"[^>]*>/g;
let match;
const matches = [];
while ((match = regex.exec(html)) !== null && matches.length < 10) {
    const chunk = html.substring(match.index, match.index + 400);
    matches.push(chunk);
}
console.log(matches.join('\n---\n'));
