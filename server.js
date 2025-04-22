const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup session middleware with a secret key
app.use(session({
    secret: require('crypto').randomBytes(24).toString('hex'),
    resave: false,
    saveUninitialized: true
}));

// Get the APPDATA environment variable and define paths
const APPDATA_PATH = process.env.APPDATA;
const SETTINGS_PATH = path.join(APPDATA_PATH, 'Zaxora', 'settings.json');

// Function to get settings from Zaxora settings file in APPDATA
function get_settings() {
    const appdata = process.env.APPDATA;
    const settings_path = path.join(appdata, 'Zaxora', 'settings.json');
    const data = fs.readFileSync(settings_path, 'utf8');
    return JSON.parse(data);
}

let settings = get_settings();
const PORT = settings.port || 8888;

// Function to load settings from SETTINGS_PATH or create default if not exists
function load_settings() {
    if (!fs.existsSync(SETTINGS_PATH)) {
        const default_settings = { "password": "admin", "token": uuidv4(), "locked": false };
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(default_settings));
    }
    const data = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return JSON.parse(data);
}

// Function to save settings to SETTINGS_PATH
function save_settings(settings) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings));
}

settings = load_settings();

// Helper function to get formatted date string "YYYY-MM-DD_HH-MM-SS"
function getFormattedDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = ("0" + (now.getMonth() + 1)).slice(-2);
    const day = ("0" + now.getDate()).slice(-2);
    const hours = ("0" + now.getHours()).slice(-2);
    const minutes = ("0" + now.getMinutes()).slice(-2);
    const seconds = ("0" + now.getSeconds()).slice(-2);
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}
// Helper function to render a template string with optional error injection
function renderTemplateString(template, context = {}) {
    if (template.includes("{% if error %}")) {
        if (context.error) {
            return template.replace("{% if error %}<p>{{ error }}</p>{% endif %}", `<p>${context.error}</p>`);
        } else {
            return template.replace("{% if error %}<p>{{ error }}</p>{% endif %}", "");
        }
    }
    return template;
}

app.get('/ping', (req, res) => {
    console.log('Received ping request');
    res.send('zaxora');
});

app.all('/', (req, res) => {
    if (req.method === 'POST') {
        if (req.body.password === settings.password) {
            req.session.token = settings.token;
            return res.redirect('/panel');
        }
        return res.send(renderTemplateString(LOGIN_TEMPLATE, { error: "Invalid password" }));
    }
    return res.send(renderTemplateString(LOGIN_TEMPLATE));
});

app.get('/panel', (req, res) => {
    if (req.session.token === settings.token) {
        return res.send(PANEL_TEMPLATE);
    }
    return res.redirect('/');
});

app.post('/update', (req, res) => {
    const data = req.body;
    if (data.token === settings.token) {
        // Update settings object with keys from data
        Object.keys(data).forEach(key => {
            settings[key] = data[key];
        });
        save_settings(settings);
        return res.json({ success: true });
    }
    return res.status(403).json({ success: false });
});

const LOGIN_TEMPLATE = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Zaxora Login</title>
<style>body{background:#111;color:white;display:flex;justify-content:center;align-items:center;height:100vh}
form{background:#222;padding:30px;border-radius:10px;display:flex;flex-direction:column}
input{padding:10px;margin:10px 0;background:#333;color:white;border:none}
button{padding:10px;background:#4caf50;border:none;color:white}</style></head>
<body><form method="POST"><h2>Login</h2><input type="password" name="password"><button type="submit">Login</button>{% if error %}<p>{{ error }}</p>{% endif %}</form></body></html>
`;

const PANEL_TEMPLATE = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Zaxora Panel</title>
<style>body{background:#111;color:white;padding:30px;font-family:sans-serif}
button{padding:15px;background:#333;color:white;border:none;margin:10px 0;width:100%;font-size:16px}</style></head>
<body><h1>Zaxora Panel</h1>
<form action="/shutdown" method="POST"><button type="submit">Shutdown</button></form>
<form action="/restart" method="POST"><button type="submit">Restart</button></form>
</body></html>
`;

app.post('/shutdown', (req, res) => {
    if (req.session.token === settings.token) {
        child_process.exec('shutdown /s /t 0');
        return res.send('Shutting down...');
    }
    return res.status(403).send('Unauthorized');
});

app.post('/restart', (req, res) => {
    if (req.session.token === settings.token) {
        child_process.exec('shutdown /r /t 0');
        return res.send('Restarting...');
    }
    return res.status(403).send('Unauthorized');
});

function run() {
    console.log(`Zaxora running at http://0.0.0.0:${PORT}`);
    app.listen(PORT, '0.0.0.0', () => {});
}

if (require.main === module) {
    run();
}
