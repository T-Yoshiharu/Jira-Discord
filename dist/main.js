'use strict';
// src/backend/core/properties.ts
var SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
var PROP_JIRA_DOMAIN = 'JIRA_DOMAIN';
var PROP_JIRA_EMAIL = 'JIRA_EMAIL';
var PROP_JIRA_API_TOKEN = 'JIRA_API_TOKEN';
var PROP_DISCORD_WEBHOOK_URL = 'DISCORD_WEBHOOK_URL';
var PROP_JIRA_PROJECT_KEY = 'JIRA_PROJECT_KEY';
var PROP_JIRA_PROJECTS_JSON = 'JIRA_PROJECTS_JSON';
function getStringProperty(key) {
    return SCRIPT_PROPERTIES.getProperty(key) || '';
}
function normalizeProjectConfig(project) {
    return {
        projectKey: project.projectKey.trim(),
        discordWebhookUrl: project.discordWebhookUrl.trim()
    };
}
function getJiraProjects() {
    const projectsJson = getStringProperty(PROP_JIRA_PROJECTS_JSON);
    if (projectsJson) {
        try {
            const parsed = JSON.parse(projectsJson);
            const normalized = parsed
                .filter(
                    (p) =>
                        p &&
                        typeof p.projectKey === 'string' &&
                        typeof p.discordWebhookUrl === 'string'
                )
                .map(normalizeProjectConfig)
                .filter((p) => p.projectKey !== '' && p.discordWebhookUrl !== '');
            if (normalized.length > 0) {
                return normalized;
            }
        } catch (e) {
            console.error(`JIRA_PROJECTS_JSON \u306E\u89E3\u6790\u30A8\u30E9\u30FC: ${e}`);
        }
    }
    const singleProjectKey = getStringProperty(PROP_JIRA_PROJECT_KEY).trim();
    const singleWebhookUrl = getStringProperty(PROP_DISCORD_WEBHOOK_URL).trim();
    if (singleProjectKey && singleWebhookUrl) {
        return [
            {
                projectKey: singleProjectKey,
                discordWebhookUrl: singleWebhookUrl
            }
        ];
    }
    return [];
}
function getSystemSettings() {
    return {
        jiraDomain: getStringProperty(PROP_JIRA_DOMAIN).trim(),
        jiraEmail: getStringProperty(PROP_JIRA_EMAIL).trim(),
        jiraApiToken: getStringProperty(PROP_JIRA_API_TOKEN).trim(),
        jiraProjects: getJiraProjects()
    };
}
function saveSystemSettings(settings) {
    const normalizedProjects = settings.jiraProjects
        .map(normalizeProjectConfig)
        .filter((project) => project.projectKey !== '' && project.discordWebhookUrl !== '');
    SCRIPT_PROPERTIES.setProperties({
        [PROP_JIRA_DOMAIN]: settings.jiraDomain.trim(),
        [PROP_JIRA_EMAIL]: settings.jiraEmail.trim(),
        [PROP_JIRA_API_TOKEN]: settings.jiraApiToken.trim(),
        [PROP_JIRA_PROJECTS_JSON]: JSON.stringify(normalizedProjects)
    });
}

// src/backend/core/validators.ts
function validateSettingsForUi(input) {
    if (!input.jiraDomain || !input.jiraEmail || !input.jiraApiToken) {
        return {
            ok: false,
            message:
                'Jira\u63A5\u7D9A\u60C5\u5831\uFF08Domain / Email / API Token\uFF09\u306F\u5FC5\u9808\u3067\u3059\u3002'
        };
    }
    const normalizedProjects = input.jiraProjects
        .map(normalizeProjectConfig)
        .filter((project) => project.projectKey !== '' && project.discordWebhookUrl !== '');
    if (normalizedProjects.length === 0) {
        return {
            ok: false,
            message:
                '\u5C11\u306A\u304F\u3068\u30821\u3064\u306E Jira \u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u8A2D\u5B9A\u304C\u5FC5\u8981\u3067\u3059\u3002'
        };
    }
    input.jiraProjects = normalizedProjects;
    return {
        ok: true,
        message: 'ok'
    };
}
function isLikelyDiscordWebhookUrl(url) {
    return /^https:\/\/discord\.com\/api\/webhooks\//.test(url.trim());
}

// src/backend/services/Discord.ts
function createDiscordMessage(issues, title, jiraDomain) {
    if (issues.length === 0) {
        return null;
    }
    const fields = issues.map((issue) => {
        const issueUrl = `https://${jiraDomain}/browse/${issue.key}`;
        const dueDate = issue.fields.duedate || '\u671F\u9650\u306A\u3057';
        return {
            name: `${issue.key}: ${issue.fields.summary}`,
            value: `[\u30BF\u30B9\u30AF\u3092\u958B\u304F](${issueUrl}) - **\u671F\u9650: ${dueDate}**`
        };
    });
    return {
        username: 'Jira\u671F\u9650\u901A\u77E5Bot',
        embeds: [
            {
                title,
                color: 15158332,
                fields,
                timestamp: /* @__PURE__ */ new Date().toISOString()
            }
        ]
    };
}
function createTestNotificationPayload(projectKey) {
    return {
        username: 'Jira\u671F\u9650\u901A\u77E5Bot',
        embeds: [
            {
                title: `[${projectKey}] \u{1F9EA} \u30C6\u30B9\u30C8\u901A\u77E5`,
                color: 3447003,
                fields: [
                    {
                        name: '\u901A\u77E5\u30C6\u30B9\u30C8',
                        value: 'WebUI\u304B\u3089\u30C6\u30B9\u30C8\u901A\u77E5\u304C\u9001\u4FE1\u3055\u308C\u307E\u3057\u305F\u3002'
                    }
                ],
                timestamp: /* @__PURE__ */ new Date().toISOString()
            }
        ]
    };
}
function sendToDiscord(payload, webhookUrl) {
    if (!payload) {
        return false;
    }
    const proxiedWebhookUrl = webhookUrl.replace(
        'discord.com',
        'discord-webhook-proxy.tinpani138-haru.workers.dev'
    );
    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload)
    };
    try {
        const response = UrlFetchApp.fetch(proxiedWebhookUrl, options);
        const code = response.getResponseCode();
        if (code >= 200 && code < 300) {
            return true;
        }
        console.error(
            `Discord\u3078\u306E\u9001\u4FE1\u30A8\u30E9\u30FC: HTTP ${code} - ${response.getContentText()}`
        );
        return false;
    } catch (e) {
        console.error(`Discord\u3078\u306E\u9001\u4FE1\u30A8\u30E9\u30FC: ${e}`);
        return false;
    }
}

// src/backend/services/Jira.ts
function fetchJiraIssues(jql, projectKey, settings) {
    const url = `https://${settings.jiraDomain}/rest/api/3/search/jql`;
    const encodedToken = Utilities.base64Encode(
        `${settings.jiraEmail}:${settings.jiraApiToken}`
    );
    const headers = {
        Authorization: `Basic ${encodedToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
    };
    const finalJql = `project = "${projectKey}" AND ${jql}`;
    const payload = {
        jql: `${finalJql} AND statusCategory != "Done" ORDER BY duedate ASC`,
        fields: ['summary', 'duedate'],
        maxResults: 100
    };
    const options = {
        method: 'post',
        headers,
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };
    try {
        const response = UrlFetchApp.fetch(url, options);
        const responseCode = response.getResponseCode();
        const responseBody = response.getContentText();
        if (responseCode === 200) {
            const json = JSON.parse(responseBody);
            return json.issues || [];
        }
        console.error(`Jira API\u30A8\u30E9\u30FC: ${responseCode} - ${responseBody}`);
        return [];
    } catch (e) {
        console.error(`\u30D5\u30A7\u30C3\u30C1\u30A8\u30E9\u30FC: ${e}`);
        return [];
    }
}
function checkJiraConnection(settings) {
    const url = `https://${settings.jiraDomain}/rest/api/3/myself`;
    const encodedToken = Utilities.base64Encode(
        `${settings.jiraEmail}:${settings.jiraApiToken}`
    );
    const options = {
        method: 'get',
        headers: {
            Authorization: `Basic ${encodedToken}`,
            Accept: 'application/json'
        },
        muteHttpExceptions: true
    };
    try {
        const response = UrlFetchApp.fetch(url, options);
        const code = response.getResponseCode();
        if (code >= 200 && code < 300) {
            return {
                ok: true,
                message: 'Jira\u63A5\u7D9AOK'
            };
        }
        return {
            ok: false,
            message: `Jira\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002HTTP ${code}: ${response.getContentText()}`
        };
    } catch (e) {
        return {
            ok: false,
            message: `Jira\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${e}`
        };
    }
}

// src/backend/features/settings.ts
function getSettingsForUi() {
    return getSystemSettings();
}
function saveSettingsFromUi(input) {
    const validation = validateSettingsForUi(input);
    if (!validation.ok) {
        return validation;
    }
    const normalizedProjects = input.jiraProjects.map(normalizeProjectConfig);
    saveSystemSettings({
        jiraDomain: input.jiraDomain,
        jiraEmail: input.jiraEmail,
        jiraApiToken: input.jiraApiToken,
        jiraProjects: normalizedProjects
    });
    return {
        ok: true,
        message: '\u8A2D\u5B9A\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002'
    };
}
function testConnectionsFromUi(input) {
    const validation = validateSettingsForUi(input);
    if (!validation.ok) {
        return validation;
    }
    const normalizedProjects = input.jiraProjects.map(normalizeProjectConfig);
    const jiraCheck = checkJiraConnection({
        jiraDomain: input.jiraDomain.trim(),
        jiraEmail: input.jiraEmail.trim(),
        jiraApiToken: input.jiraApiToken.trim(),
        jiraProjects: normalizedProjects
    });
    if (!jiraCheck.ok) {
        return jiraCheck;
    }
    const invalidWebhookProjects = normalizedProjects
        .filter((project) => !isLikelyDiscordWebhookUrl(project.discordWebhookUrl))
        .map((project) => project.projectKey);
    if (invalidWebhookProjects.length > 0) {
        return {
            ok: false,
            message: `Jira\u63A5\u7D9A\u306F\u6210\u529F\u3057\u307E\u3057\u305F\u304C\u3001Webhook URL\u5F62\u5F0F\u304C\u4E0D\u6B63\u306A\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u304C\u3042\u308A\u307E\u3059: ${invalidWebhookProjects.join(', ')}`
        };
    }
    return {
        ok: true,
        message:
            '\u63A5\u7D9A\u30C6\u30B9\u30C8\u6210\u529F: Jira\u8A8D\u8A3COK / Discord Webhook URL\u5F62\u5F0FOK'
    };
}
function sendTestNotificationFromUi(input) {
    const validation = validateSettingsForUi(input);
    if (!validation.ok) {
        return validation;
    }
    const normalizedProjects = input.jiraProjects.map(normalizeProjectConfig);
    const failedProjects = [];
    let successCount = 0;
    normalizedProjects.forEach((project) => {
        if (!isLikelyDiscordWebhookUrl(project.discordWebhookUrl)) {
            failedProjects.push(`${project.projectKey}(Webhook\u5F62\u5F0F\u4E0D\u6B63)`);
            return;
        }
        const sent = sendToDiscord(
            createTestNotificationPayload(project.projectKey),
            project.discordWebhookUrl
        );
        if (sent) {
            successCount += 1;
        } else {
            failedProjects.push(project.projectKey);
        }
    });
    if (failedProjects.length > 0) {
        return {
            ok: false,
            message: `\u901A\u77E5\u30C6\u30B9\u30C8: ${successCount}\u4EF6\u6210\u529F / ${failedProjects.length}\u4EF6\u5931\u6557 (${failedProjects.join(', ')})`
        };
    }
    return {
        ok: true,
        message: `\u901A\u77E5\u30C6\u30B9\u30C8\u6210\u529F: ${successCount}\u4EF6\u306EWebhook\u3078\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002`
    };
}

// src/backend/features/notifications.ts
function runNotificationForProject(settings, project, schedules) {
    schedules.forEach((schedule) => {
        const issues = fetchJiraIssues(schedule.jql, project.projectKey, settings);
        const title = `[${project.projectKey}] ${schedule.title}`;
        const message = createDiscordMessage(issues, title, settings.jiraDomain);
        if (message) {
            sendToDiscord(message, project.discordWebhookUrl);
        }
    });
}
function hasValidNotificationSettings(settings) {
    if (!settings.jiraDomain || !settings.jiraEmail || !settings.jiraApiToken) {
        console.error(
            'Jira\u8A8D\u8A3C\u60C5\u5831\u304C\u672A\u8A2D\u5B9A\u3067\u3059\u3002JIRA_DOMAIN/JIRA_EMAIL/JIRA_API_TOKEN \u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002'
        );
        return false;
    }
    if (settings.jiraProjects.length === 0) {
        console.error(
            '\u901A\u77E5\u5BFE\u8C61\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u304C\u672A\u8A2D\u5B9A\u3067\u3059\u3002JIRA_PROJECTS_JSON \u307E\u305F\u306F WebUI \u3067\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002'
        );
        return false;
    }
    return true;
}
function notifyTasksFor830() {
    const settings = getSystemSettings();
    if (!hasValidNotificationSettings(settings)) {
        return;
    }
    const schedules = [
        {
            jql: 'duedate < startOfDay()',
            title: '\u{1F6A8}\u3010\u671F\u9650\u5207\u308C\u3011\u306E\u30BF\u30B9\u30AF'
        },
        {
            jql: 'duedate >= startOfDay() AND duedate <= endOfDay()',
            title: '\u{1F525}\u3010\u672C\u65E5\u304C\u671F\u9650\u3011\u306E\u30BF\u30B9\u30AF'
        },
        {
            jql: 'duedate >= startOfDay(-1) AND duedate <= endOfDay(-1)',
            title: '\u23F0\u3010\u6628\u65E5\u304C\u671F\u9650\u3011\u3060\u3063\u305F\u30BF\u30B9\u30AF'
        }
    ];
    settings.jiraProjects.forEach((project) => {
        runNotificationForProject(settings, project, schedules);
    });
}
function notifyTasksFor930() {
    const settings = getSystemSettings();
    if (!hasValidNotificationSettings(settings)) {
        return;
    }
    const schedules = [
        {
            jql: 'duedate >= startOfDay(3) AND duedate <= endOfDay(3)',
            title: '\u{1F5D3}\uFE0F\u30103\u65E5\u5F8C\u304C\u671F\u9650\u3011\u306E\u30BF\u30B9\u30AF'
        },
        {
            jql: 'duedate >= startOfDay(7) AND duedate <= endOfDay(7)',
            title: '\u{1F5D3}\uFE0F\u30101\u9031\u9593\u5F8C\u304C\u671F\u9650\u3011\u306E\u30BF\u30B9\u30AF'
        }
    ];
    settings.jiraProjects.forEach((project) => {
        runNotificationForProject(settings, project, schedules);
    });
}

// src/frontend/webUI.ts
function getSettingsPageHtml() {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Jira Discord \u901A\u77E5\u8A2D\u5B9A</title>
<style>
    :root {
        --bg: #f5f7fb;
        --card: #ffffff;
        --text: #1c2230;
        --muted: #5e6a80;
        --line: #d9e0ec;
        --brand: #0f6fff;
        --brand-hover: #0d5fe0;
        --danger: #d64545;
    }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
        background:
            radial-gradient(circle at 15% 20%, rgba(15, 111, 255, 0.08), transparent 36%),
            radial-gradient(circle at 85% 10%, rgba(61, 201, 179, 0.12), transparent 34%),
            var(--bg);
        color: var(--text);
        min-height: 100vh;
        padding: 24px;
    }
    .container {
        max-width: 980px;
        margin: 0 auto;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 16px;
        box-shadow: 0 12px 30px rgba(26, 39, 68, 0.08);
        overflow: hidden;
    }
    .header {
        padding: 24px;
        border-bottom: 1px solid var(--line);
        background: linear-gradient(120deg, #eff5ff, #f8fffd);
    }
    .header h1 {
        margin: 0;
        font-size: 24px;
    }
    .header p {
        margin: 8px 0 0;
        color: var(--muted);
    }
    .section {
        padding: 20px 24px;
        border-bottom: 1px solid var(--line);
    }
    .section h2 {
        margin: 0 0 12px;
        font-size: 18px;
    }
    .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }
    label {
        display: block;
        margin: 0 0 6px;
        font-size: 13px;
        color: var(--muted);
    }
    input {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 14px;
        outline: none;
        background: #fff;
    }
    input:focus {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px rgba(15, 111, 255, 0.16);
    }
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
    }
    th, td {
        text-align: left;
        border-bottom: 1px solid var(--line);
        padding: 10px 8px;
        vertical-align: middle;
    }
    .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }
    button {
        border: none;
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
    }
    .btn-primary {
        background: var(--brand);
        color: #fff;
    }
    .btn-primary:hover { background: var(--brand-hover); }
    .btn-secondary {
        background: #eaf0fb;
        color: #1f2d45;
    }
    .btn-danger {
        background: #fee;
        color: var(--danger);
    }
    .footer {
        padding: 16px 24px 24px;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
    }
    .status {
        color: var(--muted);
        font-size: 13px;
    }
    @media (max-width: 760px) {
        body { padding: 12px; }
        .grid { grid-template-columns: 1fr; }
        .container { border-radius: 12px; }
        th:nth-child(2), td:nth-child(2) { min-width: 220px; }
    }
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>Jira \u671F\u9650\u901A\u77E5\u8A2D\u5B9A</h1>
        <p>Jira\u63A5\u7D9A\u60C5\u5831\u3068\u3001\u901A\u77E5\u5BFE\u8C61\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u3054\u3068\u306EDiscord Webhook\u3092\u7BA1\u7406\u3057\u307E\u3059\u3002</p>
    </div>

    <div class="section">
        <h2>Jira\u63A5\u7D9A\u60C5\u5831</h2>
        <div class="grid">
            <div>
                <label for="jiraDomain">Jira Domain</label>
                <input id="jiraDomain" placeholder="example.atlassian.net" />
            </div>
            <div>
                <label for="jiraEmail">Jira Email</label>
                <input id="jiraEmail" placeholder="user@example.com" />
            </div>
            <div style="grid-column: 1 / -1;">
                <label for="jiraApiToken">Jira API Token</label>
                <input id="jiraApiToken" type="password" placeholder="API token" />
            </div>
        </div>
    </div>

    <div class="section">
        <h2>\u901A\u77E5\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8</h2>
        <div class="actions">
            <button class="btn-secondary" type="button" onclick="addProjectRow()">+ \u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u8FFD\u52A0</button>
        </div>
        <table>
            <thead>
                <tr>
                    <th style="width: 220px;">Project Key</th>
                    <th>Discord Webhook URL</th>
                    <th style="width: 96px;">\u64CD\u4F5C</th>
                </tr>
            </thead>
            <tbody id="projectsBody"></tbody>
        </table>
    </div>

    <div class="footer">
        <button class="btn-secondary" type="button" onclick="testConnections()">\u63A5\u7D9A\u30C6\u30B9\u30C8</button>
        <button class="btn-secondary" type="button" onclick="sendTestNotification()">\u901A\u77E5\u30C6\u30B9\u30C8\u9001\u4FE1</button>
        <button class="btn-primary" type="button" onclick="saveSettings()">\u8A2D\u5B9A\u3092\u4FDD\u5B58</button>
        <span class="status" id="status">\u8AAD\u307F\u8FBC\u307F\u4E2D...</span>
    </div>
</div>

<script>
    function setStatus(text) {
        document.getElementById('status').textContent = text;
    }

    function addProjectRow(project) {
        const body = document.getElementById('projectsBody');
        const tr = document.createElement('tr');
        const projectKey = project ? escapeHtml(project.projectKey || '') : '';
        const webhookUrl = project ? escapeHtml(project.discordWebhookUrl || '') : '';
        tr.innerHTML =
            '<td><input class="projectKey" placeholder="ABC" value="' + projectKey + '" /></td>' +
            '<td><input class="webhookUrl" placeholder="https://discord.com/api/webhooks/..." value="' + webhookUrl + '" /></td>' +
            '<td><button class="btn-danger" type="button">\u524A\u9664</button></td>';
        tr.querySelector('button').addEventListener('click', function () {
            tr.remove();
        });
        body.appendChild(tr);
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function collectProjects() {
        const rows = Array.from(document.querySelectorAll('#projectsBody tr'));
        return rows.map(function (row) {
            return {
                projectKey: row.querySelector('.projectKey').value.trim(),
                discordWebhookUrl: row.querySelector('.webhookUrl').value.trim()
            };
        }).filter(function (p) {
            return p.projectKey && p.discordWebhookUrl;
        });
    }

    function saveSettings() {
        const payload = getCurrentFormSettings();

        setStatus('\u4FDD\u5B58\u4E2D...');
        google.script.run
            .withSuccessHandler(function (result) {
                setStatus(result.message);
            })
            .withFailureHandler(function (error) {
                setStatus('\u4FDD\u5B58\u5931\u6557: ' + error.message);
            })
            .saveSettingsFromUi(payload);
    }

    function testConnections() {
        const payload = getCurrentFormSettings();

        setStatus('\u63A5\u7D9A\u30C6\u30B9\u30C8\u4E2D...');
        google.script.run
            .withSuccessHandler(function (result) {
                setStatus(result.message);
            })
            .withFailureHandler(function (error) {
                setStatus('\u63A5\u7D9A\u30C6\u30B9\u30C8\u5931\u6557: ' + error.message);
            })
            .testConnectionsFromUi(payload);
    }

    function sendTestNotification() {
        const payload = getCurrentFormSettings();

        setStatus('\u901A\u77E5\u30C6\u30B9\u30C8\u9001\u4FE1\u4E2D...');
        google.script.run
            .withSuccessHandler(function (result) {
                setStatus(result.message);
            })
            .withFailureHandler(function (error) {
                setStatus('\u901A\u77E5\u30C6\u30B9\u30C8\u5931\u6557: ' + error.message);
            })
            .sendTestNotificationFromUi(payload);
    }

    function getCurrentFormSettings() {
        return {
            jiraDomain: document.getElementById('jiraDomain').value.trim(),
            jiraEmail: document.getElementById('jiraEmail').value.trim(),
            jiraApiToken: document.getElementById('jiraApiToken').value.trim(),
            jiraProjects: collectProjects()
        };
    }

    function loadSettings() {
        google.script.run
            .withSuccessHandler(function (settings) {
                document.getElementById('jiraDomain').value = settings.jiraDomain || '';
                document.getElementById('jiraEmail').value = settings.jiraEmail || '';
                document.getElementById('jiraApiToken').value = settings.jiraApiToken || '';
                const body = document.getElementById('projectsBody');
                body.innerHTML = '';
                if (settings.jiraProjects && settings.jiraProjects.length > 0) {
                    settings.jiraProjects.forEach(addProjectRow);
                } else {
                    addProjectRow();
                }
                setStatus('\u8A2D\u5B9A\u3092\u8AAD\u307F\u8FBC\u307F\u307E\u3057\u305F\u3002');
            })
            .withFailureHandler(function (error) {
                setStatus('\u8AAD\u307F\u8FBC\u307F\u5931\u6557: ' + error.message);
            })
            .getSettingsForUi();
    }

    loadSettings();
<\/script>
</body>
</html>`;
}
function doGet() {
    return HtmlService.createHtmlOutput(getSettingsPageHtml()).setTitle(
        'Jira Discord \u901A\u77E5\u8A2D\u5B9A'
    );
}

// src/main.ts
globalThis.doGet = doGet;
globalThis.notifyTasksFor830 = notifyTasksFor830;
globalThis.notifyTasksFor930 = notifyTasksFor930;
globalThis.getSettingsForUi = getSettingsForUi;
globalThis.saveSettingsFromUi = saveSettingsFromUi;
globalThis.testConnectionsFromUi = testConnectionsFromUi;
globalThis.sendTestNotificationFromUi = sendTestNotificationFromUi;
