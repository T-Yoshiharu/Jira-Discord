// スクリプトプロパティから設定を読み込む
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const JIRA_DOMAIN = SCRIPT_PROPERTIES.getProperty('JIRA_DOMAIN');
const JIRA_EMAIL = SCRIPT_PROPERTIES.getProperty('JIRA_EMAIL');
const JIRA_API_TOKEN = SCRIPT_PROPERTIES.getProperty('JIRA_API_TOKEN');
const DISCORD_WEBHOOK_URL = SCRIPT_PROPERTIES.getProperty('DISCORD_WEBHOOK_URL');
const JIRA_PROJECT_KEY = SCRIPT_PROPERTIES.getProperty('JIRA_PROJECT_KEY');

/**
 * Jira APIにリクエストを送信する共通関数
 * @param {string} jql - Jira Query Language (JQL)
 * @returns {Array} - 取得した課題の配列
 */
function fetchJiraIssues(jql) {
    const url = `https://${JIRA_DOMAIN}/rest/api/3/search`;
    const encodedToken = Utilities.base64Encode(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`);

    const headers = {
        'Authorization': `Basic ${encodedToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    // プロジェクトキーが設定されている場合はJQLに追加
    let finalJql = jql;
    if (JIRA_PROJECT_KEY) {
        finalJql = `project = "${JIRA_PROJECT_KEY}" AND ${jql}`;
    }

    const payload = {
        jql: `${finalJql} AND statusCategory != "Done" ORDER BY duedate ASC`,
        fields: ['summary', 'duedate'],
        maxResults: 100
    };

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
 * @param {Array} issues - 課題の配列
 * @param {string} title - メッセージのタイトル
 * @returns {object|null} - Discordメッセージオブジェクト
 */
function createDiscordMessage(issues, title) {
    if (issues.length === 0) {
        return null;
    }

    const fields = issues.map(issue => {
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
            color: 15158332, // 赤色
            fields: fields,
            timestamp: new Date().toISOString()
        }]
    };
}

/**
 * Discordにメッセージを送信する
 * @param {object} payload - 送信するメッセージオブジェクト
 */
function sendToDiscord(payload) {
    if (!payload) return;

    const options = {
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
function notifyTasksFor830() {
    const messages = [];

    // 1. 期限切れのタスク
    const expiredIssues = fetchJiraIssues(`duedate < startOfDay()`);
    if (expiredIssues.length > 0) {
        messages.push(createDiscordMessage(expiredIssues, '🚨【期限切れ】のタスク'));
    }

    // 2. 当日が期限のタスク
    const todayIssues = fetchJiraIssues(`duedate >= startOfDay() AND duedate <= endOfDay()`);
    if (todayIssues.length > 0) {
        messages.push(createDiscordMessage(todayIssues, '🔥【本日が期限】のタスク'));
    }

    // 3. 昨日が期限だったタスク（リマインド用）
    const yesterdayIssues = fetchJiraIssues(`duedate >= startOfDay(1) AND duedate <= endOfDay(1)`);
    if (yesterdayIssues.length > 0) {
        messages.push(createDiscordMessage(yesterdayIssues, '⏰【明日が期限】のタスク'));
    }

    // メッセージを送信
    messages.forEach(msg => sendToDiscord(msg));
}

/**
 * 9:30の通知を実行する関数
 */
function notifyTasksFor930() {
    const messages = [];

    // 1. 3日後が期限のタスク
    const threeDaysIssues = fetchJiraIssues(`duedate >= startOfDay(3) AND duedate <= endOfDay(3)`);
    if (threeDaysIssues.length > 0) {
        messages.push(createDiscordMessage(threeDaysIssues, '🗓️【3日後が期限】のタスク'));
    }

    // 2. 1週間後が期限のタスク
    const sevenDaysIssues = fetchJiraIssues(`duedate >= startOfDay(7) AND duedate <= endOfDay(7)`);
    if (sevenDaysIssues.length > 0) {
        messages.push(createDiscordMessage(sevenDaysIssues, '🗓️【1週間後が期限】のタスク'));
    }

    // メッセージを送信
    messages.forEach(msg => sendToDiscord(msg));
}