import { normalizeProjectConfig } from './properties';
import { SystemSettings, UiActionResult } from './types';

export function validateSettingsForUi(input: SystemSettings): UiActionResult {
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

    // 呼び出し元がそのまま使えるように、元の入力へ反映
    input.jiraProjects = normalizedProjects;

    return {
        ok: true,
        message: 'ok'
    };
}

export function isLikelyDiscordWebhookUrl(url: string): boolean {
    return /^https:\/\/discord\.com\/api\/webhooks\//.test(url.trim());
}
