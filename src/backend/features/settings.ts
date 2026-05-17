import {
    getSystemSettings,
    normalizeProjectConfig,
    saveSystemSettings
} from '../core/properties';
import { isLikelyDiscordWebhookUrl, validateSettingsForUi } from '../core/validators';
import { SystemSettings, UiActionResult } from '../core/types';
import {
    createTestNotificationPayload,
    sendToDiscord
} from '../services/Discord';
import { checkJiraConnection } from '../services/Jira';

export function getSettingsForUi(): SystemSettings {
    return getSystemSettings();
}

export function saveSettingsFromUi(input: SystemSettings): UiActionResult {
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
        message: '設定を保存しました。'
    };
}

export function testConnectionsFromUi(input: SystemSettings): UiActionResult {
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
        .filter(project => !isLikelyDiscordWebhookUrl(project.discordWebhookUrl))
        .map(project => project.projectKey);

    if (invalidWebhookProjects.length > 0) {
        return {
            ok: false,
            message: `Jira接続は成功しましたが、Webhook URL形式が不正なプロジェクトがあります: ${invalidWebhookProjects.join(', ')}`
        };
    }

    return {
        ok: true,
        message: '接続テスト成功: Jira認証OK / Discord Webhook URL形式OK'
    };
}

export function sendTestNotificationFromUi(input: SystemSettings): UiActionResult {
    const validation = validateSettingsForUi(input);
    if (!validation.ok) {
        return validation;
    }

    const normalizedProjects = input.jiraProjects.map(normalizeProjectConfig);
    const failedProjects: string[] = [];
    let successCount = 0;

    normalizedProjects.forEach(project => {
        if (!isLikelyDiscordWebhookUrl(project.discordWebhookUrl)) {
            failedProjects.push(`${project.projectKey}(Webhook形式不正)`);
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
            message: `通知テスト: ${successCount}件成功 / ${failedProjects.length}件失敗 (${failedProjects.join(', ')})`
        };
    }

    return {
        ok: true,
        message: `通知テスト成功: ${successCount}件のWebhookへ送信しました。`
    };
}
