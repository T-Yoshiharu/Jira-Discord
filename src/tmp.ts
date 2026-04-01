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
// 💡 as string をつけることで、「これは確実に文字列です」とTypeScriptに教えています
const JIRA_DOMAIN = SCRIPT_PROPERTIES.getProperty('JIRA_DOMAIN') as string;
const JIRA_EMAIL = SCRIPT_PROPERTIES.getProperty('JIRA_EMAIL') as string;
const JIRA_API_TOKEN = SCRIPT_PROPERTIES.getProperty('JIRA_API_TOKEN') as string;
const DISCORD_WEBHOOK_URL = SCRIPT_PROPERTIES.getProperty('DISCORD_WEBHOOK_URL') as string;
const JIRA_PROJECT_KEY = SCRIPT_PROPERTIES.getProperty('JIRA_PROJECT_KEY') as string;

// ==========================================
// 3. メインの処理関数
// ==========================================

/**
 * Jira APIにリクエストを送信する共通関数
 * @param jql - Jira Query Language (JQL)
 * @returns 取得した課題の配列（JiraIssueの配列）
 */
function fetchJiraIssues(jql: string): JiraIssue[] {
    const url: string = `https://${JIRA_DOMAIN}/rest/api/3/search/jql`;
    const encodedToken = Utilities.base64Encode(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`);

    const headers = {
        'Authorization': `Basic ${encodedToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    let finalJql = jql;
    if (JIRA_PROJECT_KEY) {
        finalJql = `project = "${JIRA_PROJECT_KEY}" AND ${jql}`;
    }

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
        const issueUrl = `https://${JIRA_DOMAIN}/browse/${issue.key}`;
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
function sendToDiscord(payload: DiscordPayload | null): void {
    if (!payload) return;

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload)
    };

    try {
        UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, options);
    } catch (e) {
        console.error(`Discordへの送信エラー: ${e}`);
    }
}

/**
 * 8:30の通知を実行する関数
 */
function notifyTasksFor830(): void {
    const messages: (DiscordPayload | null)[] = [];

    const expiredIssues = fetchJiraIssues(`duedate < startOfDay()`);
    if (expiredIssues.length > 0) messages.push(createDiscordMessage(expiredIssues, '🚨【期限切れ】のタスク'));

    const todayIssues = fetchJiraIssues(`duedate >= startOfDay() AND duedate <= endOfDay()`);
    if (todayIssues.length > 0) messages.push(createDiscordMessage(todayIssues, '🔥【本日が期限】のタスク'));

    const yesterdayIssues = fetchJiraIssues(`duedate >= startOfDay(-1) AND duedate <= endOfDay(-1)`);
    if (yesterdayIssues.length > 0) messages.push(createDiscordMessage(yesterdayIssues, '⏰【昨日が期限】だったタスク'));

    messages.forEach(msg => {
        if (msg) sendToDiscord(msg);
    });
}

/**
 * 9:30の通知を実行する関数
 */
function notifyTasksFor930(): void {
    const messages: (DiscordPayload | null)[] = [];

    const threeDaysIssues = fetchJiraIssues(`duedate >= startOfDay(3) AND duedate <= endOfDay(3)`);
    if (threeDaysIssues.length > 0) messages.push(createDiscordMessage(threeDaysIssues, '🗓️【3日後が期限】のタスク'));

    const sevenDaysIssues = fetchJiraIssues(`duedate >= startOfDay(7) AND duedate <= endOfDay(7)`);
    if (sevenDaysIssues.length > 0) messages.push(createDiscordMessage(sevenDaysIssues, '🗓️【1週間後が期限】のタスク'));

    messages.forEach(msg => {
        if (msg) sendToDiscord(msg);
    });
}