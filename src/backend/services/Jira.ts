import { JiraIssue, SystemSettings, UiActionResult } from '../core/types';

/**
 * Jira APIにリクエストを送信する共通関数
 * @param jql Jira Query Language (JQL)
 * @returns 取得した課題の配列
 */
export function fetchJiraIssues(jql: string, projectKey: string, settings: SystemSettings): JiraIssue[] {
    const url: string = `https://${settings.jiraDomain}/rest/api/3/search/jql`;
    const encodedToken = Utilities.base64Encode(`${settings.jiraEmail}:${settings.jiraApiToken}`);

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

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
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

        console.error(`Jira APIエラー: ${responseCode} - ${responseBody}`);
        return [];
    } catch (e) {
        console.error(`フェッチエラー: ${e}`);
        return [];
    }
}

export function checkJiraConnection(settings: SystemSettings): UiActionResult {
    const url = `https://${settings.jiraDomain}/rest/api/3/myself`;
    const encodedToken = Utilities.base64Encode(`${settings.jiraEmail}:${settings.jiraApiToken}`);

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
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
                message: 'Jira接続OK'
            };
        }

        return {
            ok: false,
            message: `Jira接続に失敗しました。HTTP ${code}: ${response.getContentText()}`
        };
    } catch (e) {
        return {
            ok: false,
            message: `Jira接続に失敗しました: ${e}`
        };
    }
}
