import { JiraProjectConfig, SystemSettings } from './types';

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

export function normalizeProjectConfig(project: JiraProjectConfig): JiraProjectConfig {
    return {
        projectKey: project.projectKey.trim(),
        discordWebhookUrl: project.discordWebhookUrl.trim()
    };
}

export function getJiraProjects(): JiraProjectConfig[] {
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

export function getSystemSettings(): SystemSettings {
    return {
        jiraDomain: getStringProperty(PROP_JIRA_DOMAIN).trim(),
        jiraEmail: getStringProperty(PROP_JIRA_EMAIL).trim(),
        jiraApiToken: getStringProperty(PROP_JIRA_API_TOKEN).trim(),
        jiraProjects: getJiraProjects()
    };
}

export function saveSystemSettings(settings: SystemSettings): void {
    const normalizedProjects = settings.jiraProjects
        .map(normalizeProjectConfig)
        .filter(project => project.projectKey !== '' && project.discordWebhookUrl !== '');

    SCRIPT_PROPERTIES.setProperties({
        [PROP_JIRA_DOMAIN]: settings.jiraDomain.trim(),
        [PROP_JIRA_EMAIL]: settings.jiraEmail.trim(),
        [PROP_JIRA_API_TOKEN]: settings.jiraApiToken.trim(),
        [PROP_JIRA_PROJECTS_JSON]: JSON.stringify(normalizedProjects)
    });

    // // 新方式へ移行したら旧キーはクリア
    // SCRIPT_PROPERTIES.deleteProperty(PROP_JIRA_PROJECT_KEY);
    // SCRIPT_PROPERTIES.deleteProperty(PROP_DISCORD_WEBHOOK_URL);
}
