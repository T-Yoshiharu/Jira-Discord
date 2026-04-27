// TypeScriptで作成

// ==========================================
// 1. 型定義（インターフェース）
// データの「形」をあらかじめ定義します
// ==========================================

interface JiraIssue {
    key: string;
    fields: {
        summary: string;
        duedate: string | null;
    };
}

interface JiraProjectConfig {
    projectKey: string;
    discordWebhookUrl: string;
}

interface SystemSettings {
    jiraDomain: string;
    jiraEmail: string;
    jiraApiToken: string;
    jiraProjects: JiraProjectConfig[];
}

interface DiscordEmbedField {
    name: string;
    value: string;
}

interface DiscordPayload {
    username: string;
    embeds: {
        title: string;
        color: number;
        fields: DiscordEmbedField[];
        timestamp: string;
    }[];
}

// ==========================================
// 2. 設定の読み込み
// ==========================================

const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const PROP_JIRA_DOMAIN = 'JIRA_DOMAIN';
const PROP_JIRA_EMAIL = 'JIRA_EMAIL';
const PROP_JIRA_API_TOKEN = 'JIRA_API_TOKEN';
const PROP_DISCORD_WEBHOOK_URL = 'DISCORD_WEBHOOK_URL';
const PROP_JIRA_PROJECT_KEY = 'JIRA_PROJECT_KEY';
const PROP_JIRA_PROJECTS_JSON = 'JIRA_PROJECTS_JSON';

function getStringProperty(key: string): string {
    return SCRIPT_PROPERTIES.getProperty(key) || '';
}

function normalizeProjectConfig(project: JiraProjectConfig): JiraProjectConfig {
    return {
        projectKey: project.projectKey.trim(),
        discordWebhookUrl: project.discordWebhookUrl.trim()
    };
}

function getJiraProjects(): JiraProjectConfig[] {
    const projectsJson = getStringProperty(PROP_JIRA_PROJECTS_JSON);

    if (projectsJson) {
        try {
            const parsed = JSON.parse(projectsJson) as JiraProjectConfig[];
            const normalized = parsed
                .filter(p => p && typeof p.projectKey === 'string' && typeof p.discordWebhookUrl === 'string')
                .map(normalizeProjectConfig)
                .filter(p => p.projectKey !== '' && p.discordWebhookUrl !== '');

            if (normalized.length > 0) {
                return normalized;
            }
        } catch (e) {
            console.error(`JIRA_PROJECTS_JSON の解析エラー: ${e}`);
        }
    }

    // 既存の単一プロジェクト設定との互換性を維持
    const singleProjectKey = getStringProperty(PROP_JIRA_PROJECT_KEY).trim();
    const singleWebhookUrl = getStringProperty(PROP_DISCORD_WEBHOOK_URL).trim();

    if (singleProjectKey && singleWebhookUrl) {
        return [{
            projectKey: singleProjectKey,
            discordWebhookUrl: singleWebhookUrl
        }];
    }

    return [];
}

function getSystemSettings(): SystemSettings {
    return {
        jiraDomain: getStringProperty(PROP_JIRA_DOMAIN).trim(),
        jiraEmail: getStringProperty(PROP_JIRA_EMAIL).trim(),
        jiraApiToken: getStringProperty(PROP_JIRA_API_TOKEN).trim(),
        jiraProjects: getJiraProjects()
    };
}

function saveSystemSettings(settings: SystemSettings): void {
    const normalizedProjects = settings.jiraProjects
        .map(normalizeProjectConfig)
        .filter(project => project.projectKey !== '' && project.discordWebhookUrl !== '');

    SCRIPT_PROPERTIES.setProperties({
        [PROP_JIRA_DOMAIN]: settings.jiraDomain.trim(),
        [PROP_JIRA_EMAIL]: settings.jiraEmail.trim(),
        [PROP_JIRA_API_TOKEN]: settings.jiraApiToken.trim(),
        [PROP_JIRA_PROJECTS_JSON]: JSON.stringify(normalizedProjects)
    });

    // 新方式へ移行したら旧キーはクリア
    SCRIPT_PROPERTIES.deleteProperty(PROP_JIRA_PROJECT_KEY);
    SCRIPT_PROPERTIES.deleteProperty(PROP_DISCORD_WEBHOOK_URL);
}

// ==========================================
// 3. メインの処理関数
// ==========================================

/**
 * Jira APIにリクエストを送信する共通関数
 * @param jql - Jira Query Language (JQL)
 * @returns 取得した課題の配列（JiraIssueの配列）
 */
function fetchJiraIssues(jql: string, projectKey: string, settings: SystemSettings): JiraIssue[] {
    const url: string = `https://${settings.jiraDomain}/rest/api/3/search/jql`;
    const encodedToken = Utilities.base64Encode(`${settings.jiraEmail}:${settings.jiraApiToken}`);

    const headers = {
        'Authorization': `Basic ${encodedToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    const finalJql = `project = "${projectKey}" AND ${jql}`;

    const payload = {
        jql: `${finalJql} AND statusCategory != "Done" ORDER BY duedate ASC`,
        fields: ['summary', 'duedate'],
        maxResults: 100
    };

    // 💡 GAS専用の型（GoogleAppsScript.URL_Fetch...）を使用して安全性を高めています
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        headers: headers,
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
        } else {
            console.error(`Jira APIエラー: ${responseCode} - ${responseBody}`);
            return [];
        }
    } catch (e) {
        console.error(`フェッチエラー: ${e}`);
        return [];
    }
}

/**
 * 課題リストからDiscordメッセージを生成する
 */
function createDiscordMessage(issues: JiraIssue[], title: string): DiscordPayload | null {
    if (issues.length === 0) {
        return null;
    }

    const fields: DiscordEmbedField[] = issues.map(issue => {
        const jiraDomain = getStringProperty(PROP_JIRA_DOMAIN);
        const issueUrl = `https://${jiraDomain}/browse/${issue.key}`;
        const dueDate = issue.fields.duedate || '期限なし';
        return {
            name: `${issue.key}: ${issue.fields.summary}`,
            value: `[タスクを開く](${issueUrl}) - **期限: ${dueDate}**`
        };
    });

    return {
        username: 'Jira期限通知Bot',
        embeds: [{
            title: title,
            color: 15158332,
            fields: fields,
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Discordにメッセージを送信する
 */
function sendToDiscord(payload: DiscordPayload | null, webhookUrl: string): void {
    if (!payload) return;

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload)
    };

    try {
        UrlFetchApp.fetch(webhookUrl, options);
    } catch (e) {
        console.error(`Discordへの送信エラー: ${e}`);
    }
}

function runNotificationForProject(
    settings: SystemSettings,
    project: JiraProjectConfig,
    schedules: { jql: string; title: string }[]
): void {
    schedules.forEach(schedule => {
        const issues = fetchJiraIssues(schedule.jql, project.projectKey, settings);
        const title = `[${project.projectKey}] ${schedule.title}`;
        const message = createDiscordMessage(issues, title);
        if (message) {
            sendToDiscord(message, project.discordWebhookUrl);
        }
    });
}

/**
 * 8:30の通知を実行する関数
 */
function notifyTasksFor830(): void {
    const settings = getSystemSettings();

    if (!settings.jiraDomain || !settings.jiraEmail || !settings.jiraApiToken) {
        console.error('Jira認証情報が未設定です。JIRA_DOMAIN/JIRA_EMAIL/JIRA_API_TOKEN を設定してください。');
        return;
    }

    if (settings.jiraProjects.length === 0) {
        console.error('通知対象プロジェクトが未設定です。JIRA_PROJECTS_JSON または WebUI で設定してください。');
        return;
    }

    const schedules = [
        { jql: 'duedate < startOfDay()', title: '🚨【期限切れ】のタスク' },
        { jql: 'duedate >= startOfDay() AND duedate <= endOfDay()', title: '🔥【本日が期限】のタスク' },
        { jql: 'duedate >= startOfDay(-1) AND duedate <= endOfDay(-1)', title: '⏰【昨日が期限】だったタスク' }
    ];

    settings.jiraProjects.forEach(project => {
        runNotificationForProject(settings, project, schedules);
    });
}

/**
 * 9:30の通知を実行する関数
 */
function notifyTasksFor930(): void {
    const settings = getSystemSettings();

    if (!settings.jiraDomain || !settings.jiraEmail || !settings.jiraApiToken) {
        console.error('Jira認証情報が未設定です。JIRA_DOMAIN/JIRA_EMAIL/JIRA_API_TOKEN を設定してください。');
        return;
    }

    if (settings.jiraProjects.length === 0) {
        console.error('通知対象プロジェクトが未設定です。JIRA_PROJECTS_JSON または WebUI で設定してください。');
        return;
    }

    const schedules = [
        { jql: 'duedate >= startOfDay(3) AND duedate <= endOfDay(3)', title: '🗓️【3日後が期限】のタスク' },
        { jql: 'duedate >= startOfDay(7) AND duedate <= endOfDay(7)', title: '🗓️【1週間後が期限】のタスク' }
    ];

    settings.jiraProjects.forEach(project => {
        runNotificationForProject(settings, project, schedules);
    });
}

// ==========================================
// 4. Web UI
// ==========================================

function doGet(): GoogleAppsScript.HTML.HtmlOutput {
    return HtmlService
        .createHtmlOutput(getSettingsPageHtml())
        .setTitle('Jira Discord 通知設定');
}

function getSettingsForUi(): SystemSettings {
    return getSystemSettings();
}

function saveSettingsFromUi(input: SystemSettings): { ok: boolean; message: string } {
    if (!input.jiraDomain || !input.jiraEmail || !input.jiraApiToken) {
        return {
            ok: false,
            message: 'Jira接続情報（Domain / Email / API Token）は必須です。'
        };
    }

    const normalizedProjects = input.jiraProjects
        .map(normalizeProjectConfig)
        .filter(project => project.projectKey !== '' && project.discordWebhookUrl !== '');

    if (normalizedProjects.length === 0) {
        return {
            ok: false,
            message: '少なくとも1つの Jira プロジェクト設定が必要です。'
        };
    }

    saveSystemSettings({
        jiraDomain: input.jiraDomain,
        jiraEmail: input.jiraEmail,
        jiraApiToken: input.jiraApiToken,
        jiraProjects: normalizedProjects
    });

    return {
        ok: true,
        message: '設定を保存しました。'
    };
}

function getSettingsPageHtml(): string {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Jira Discord 通知設定</title>
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
            <h1>Jira 期限通知設定</h1>
            <p>Jira接続情報と、通知対象プロジェクトごとのDiscord Webhookを管理します。</p>
        </div>

        <div class="section">
            <h2>Jira接続情報</h2>
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
            <h2>通知プロジェクト</h2>
            <div class="actions">
                <button class="btn-secondary" type="button" onclick="addProjectRow()">+ プロジェクト追加</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 220px;">Project Key</th>
                        <th>Discord Webhook URL</th>
                        <th style="width: 96px;">操作</th>
                    </tr>
                </thead>
                <tbody id="projectsBody"></tbody>
            </table>
        </div>

        <div class="footer">
            <button class="btn-primary" type="button" onclick="saveSettings()">設定を保存</button>
            <span class="status" id="status">読み込み中...</span>
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
                '<td><button class="btn-danger" type="button">削除</button></td>';
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
            const payload = {
                jiraDomain: document.getElementById('jiraDomain').value.trim(),
                jiraEmail: document.getElementById('jiraEmail').value.trim(),
                jiraApiToken: document.getElementById('jiraApiToken').value.trim(),
                jiraProjects: collectProjects()
            };

            setStatus('保存中...');
            google.script.run
                .withSuccessHandler(function (result) {
                    setStatus(result.message);
                })
                .withFailureHandler(function (error) {
                    setStatus('保存失敗: ' + error.message);
                })
                .saveSettingsFromUi(payload);
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
                    setStatus('設定を読み込みました。');
                })
                .withFailureHandler(function (error) {
                    setStatus('読み込み失敗: ' + error.message);
                })
                .getSettingsForUi();
        }

        loadSettings();
    </script>
</body>
</html>`;
}
