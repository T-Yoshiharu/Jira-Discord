import { DiscordEmbedField, DiscordPayload, JiraIssue } from '../core/types';

export function createDiscordMessage(
    issues: JiraIssue[],
    title: string,
    jiraDomain: string
): DiscordPayload | null {
    if (issues.length === 0) {
        return null;
    }

    const fields: DiscordEmbedField[] = issues.map(issue => {
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
            title,
            color: 15158332,
            fields,
            timestamp: new Date().toISOString()
        }]
    };
}

export function createTestNotificationPayload(projectKey: string): DiscordPayload {
    return {
        username: 'Jira期限通知Bot',
        embeds: [{
            title: `[${projectKey}] 🧪 テスト通知`,
            color: 3447003,
            fields: [{
                name: '通知テスト',
                value: 'WebUIからテスト通知が送信されました。'
            }],
            timestamp: new Date().toISOString()
        }]
    };
}

export function sendToDiscord(payload: DiscordPayload | null, webhookUrl: string): boolean {
    if (!payload) {
        return false;
    }

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload)
    };

    try {
        const response = UrlFetchApp.fetch(webhookUrl, options);
        const code = response.getResponseCode();
        if (code >= 200 && code < 300) {
            return true;
        }

        console.error(`Discordへの送信エラー: HTTP ${code} - ${response.getContentText()}`);
        return false;
    } catch (e) {
        console.error(`Discordへの送信エラー: ${e}`);
        return false;
    }
}
