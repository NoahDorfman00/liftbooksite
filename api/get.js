// /get (and /ig, /tt, /x, /yt): count the click, then forward to the App Store
// with the campaign token from ?ct= (App Store Connect → Analytics → Campaigns).
//
// Counts live in the Realtime Database at clicks/<UTC day>/<ct>. The database
// rules only allow +1 writes there, so no credentials are needed, and nothing
// about the visitor is stored.

const DB = 'https://liftbook-695fc-default-rtdb.firebaseio.com';
const storeUrl = (ct) =>
    'https://apps.apple.com/app/apple-store/id6755925820?pt=128332891&ct=' + ct + '&mt=8';

// Link previewers (Messages, X, Slack, …) and other non-browsers. Messages
// announces itself as "facebookexternalhit/1.1 Facebot Twitterbot/1.0".
const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|skype|curl|wget|python|okhttp|headless|lighthouse/i;

// What previewers get instead of a redirect — they would follow one and show
// the App Store's own preview. Title, one line and the app icon; deliberately
// no og:image, so it renders as a compact bubble instead of a full-width card.
const previewPage = (url) => `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Get Liftbook on the App Store</title>
    <meta name="description" content="As simple as a notebook. Free on the App Store.">
    <meta name="robots" content="noindex">
    <meta property="og:title" content="Get Liftbook on the App Store">
    <meta property="og:description" content="As simple as a notebook. Free on the App Store.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://liftbookapp.com/get">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Get Liftbook on the App Store">
    <meta name="twitter:description" content="As simple as a notebook. Free on the App Store.">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32.png">
    <link rel="apple-touch-icon" href="/assets/images/app-icon.png">
    <script>window.location.replace(${JSON.stringify(url)});</script>
</head>
<body>
    <p>Taking you to <a href="${url.replace(/&/g, '&amp;')}">Liftbook on the App Store</a>…</p>
</body>
</html>
`;

async function count(ct) {
    const day = new Date().toISOString().slice(0, 10);
    try {
        await fetch(`${DB}/clicks/${day}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [ct]: { '.sv': { increment: 1 } } }),
            signal: AbortSignal.timeout(1500),
        });
    } catch (e) {
        // Never hold up the redirect for the counter.
    }
}

module.exports = async (req, res) => {
    let ct = String((req.query && req.query.ct) || 'website');
    if (!/^[a-z0-9-]{1,40}$/.test(ct)) ct = 'website';
    const url = storeUrl(ct);
    const agent = req.headers['user-agent'] || '';

    res.setHeader('Cache-Control', 'no-store');

    if (!agent || BOT.test(agent)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(previewPage(url));
    }

    if (req.method === 'GET') await count(ct);
    res.setHeader('Location', url);
    return res.status(302).end();
};
