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
            <button class="btn-secondary" type="button" onclick="testConnections()">接続テスト</button>
            <button class="btn-secondary" type="button" onclick="sendTestNotification()">通知テスト送信</button>
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
            const payload = getCurrentFormSettings();

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

        function testConnections() {
            const payload = getCurrentFormSettings();

            setStatus('接続テスト中...');
            google.script.run
                .withSuccessHandler(function (result) {
                    setStatus(result.message);
                })
                .withFailureHandler(function (error) {
                    setStatus('接続テスト失敗: ' + error.message);
                })
                .testConnectionsFromUi(payload);
        }

        function sendTestNotification() {
            const payload = getCurrentFormSettings();

            setStatus('通知テスト送信中...');
            google.script.run
                .withSuccessHandler(function (result) {
                    setStatus(result.message);
                })
                .withFailureHandler(function (error) {
                    setStatus('通知テスト失敗: ' + error.message);
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

export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
    return HtmlService
        .createHtmlOutput(getSettingsPageHtml())
        .setTitle('Jira Discord 通知設定');
}