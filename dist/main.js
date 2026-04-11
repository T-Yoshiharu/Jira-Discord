"use strict";
// TypeScriptで作成

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
                .filter(p => p && typeof p.projectKey === 'string' && typeof p.discordWebhookUrl === 'string')
                .map(normalizeProjectConfig)
                .filter(p => p.projectKey !== '' && p.discordWebhookUrl !== '');
            if (normalized.length > 0) {
                return normalized;
            }
        }
        catch (e) {
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
function fetchJiraIssues(jql, projectKey, settings) {
    const url = `https://${settings.jiraDomain}/rest/api/3/search/jql`;
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
    const options = {
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
        }
        else {
            console.error(`Jira APIエラー: ${responseCode} - ${responseBody}`);
            return [];
        }
    }
    catch (e) {
        console.error(`フェッチエラー: ${e}`);
        return [];
    }
}
/**
 * 課題リストからDiscordメッセージを生成する
 */
function createDiscordMessage(issues, title) {
    if (issues.length === 0) {
        return null;
    }
    const fields = issues.map(issue => {
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
function sendToDiscord(payload, webhookUrl) {
    if (!payload)
        return;
    const options = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload)
    };
    try {
        UrlFetchApp.fetch(webhookUrl, options);
    }
    catch (e) {
        console.error(`Discordへの送信エラー: ${e}`);
    }
}
function runNotificationForProject(settings, project, schedules) {
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
function notifyTasksFor830() {
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
function notifyTasksFor930() {
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
