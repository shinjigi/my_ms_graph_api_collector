const fs = require('fs');
const html = fs.readFileSync('c:\\SVN\\_GH\\_shinjigi_WIN\\my_ms_graph_api_collector\\data\\nibol_book_page.html', 'utf8');

const target = 'O13';
const idx = html.indexOf(target);
if (idx !== -1) {
    // Search backwards for the start of the div
    const startIdx = html.lastIndexOf('<div', idx);
    // Search forwards for the end of the div
    const endIdx = html.indexOf('</div>', idx) + 6;
    console.log('Context for O13:');
    console.log(html.substring(startIdx, endIdx));
} else {
    console.log('O13 not found');
}
