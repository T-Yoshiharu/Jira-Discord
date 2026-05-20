import { getSystemSettings } from '../core/properties';
import { JiraProjectConfig, SystemSettings } from '../core/types';
import { createDiscordMessage, sendToDiscord } from '../services/Discord';
import { fetchJiraIssues } from '../services/Jira';

type NotificationSchedule = { jql: string; title: string };

function runNotificationForProject(
    settings: SystemSettings,
    project: JiraProjectConfig,
    schedules: NotificationSchedule[]
): void {
    schedules.forEach(schedule => {
        const issues = fetchJiraIssues(schedule.jql, project.projectKey, settings);
        const title = `[${project.projectKey}] ${schedule.title}`;
        const message = createDiscordMessage(issues, title, settings.jiraDomain);
        if (message) {
            sendToDiscord(message, project.discordWebhookUrl);
        }
    });
}

function hasValidNotificationSettings(settings: SystemSettings): boolean {
    if (!settings.jiraDomain || !settings.jiraEmail || !settings.jiraApiToken) {
        console.error('Jira認証情報が未設定です。JIRA_DOMAIN/JIRA_EMAIL/JIRA_API_TOKEN を設定してください。');
        return false;
    }

    if (settings.jiraProjects.length === 0) {
        console.error('通知対象プロジェクトが未設定です。JIRA_PROJECTS_JSON または WebUI で設定してください。');
        return false;
    }

    return true;
}

export function notifyTasksFor830(): void {
    const settings = getSystemSettings();
    if (!hasValidNotificationSettings(settings)) {
        return;
    }

    const schedules: NotificationSchedule[] = [
        { jql: 'duedate < startOfDay()', title: '🚨【期限切れ】のタスク' },
        { jql: 'duedate >= startOfDay() AND duedate <= endOfDay()', title: '🔥【本日が期限】のタスク' },
        { jql: 'duedate >= startOfDay(-1) AND duedate <= endOfDay(-1)', title: '⏰【昨日が期限】だったタスク' }
    ];

    settings.jiraProjects.forEach(project => {
        runNotificationForProject(settings, project, schedules);
    });
}

export function notifyTasksFor930(): void {
    const settings = getSystemSettings();
    if (!hasValidNotificationSettings(settings)) {
        return;
    }

    const schedules: NotificationSchedule[] = [
        { jql: 'duedate >= startOfDay(3) AND duedate <= endOfDay(3)', title: '🗓️【3日後が期限】のタスク' },
        { jql: 'duedate >= startOfDay(7) AND duedate <= endOfDay(7)', title: '🗓️【1週間後が期限】のタスク' }
    ];

    settings.jiraProjects.forEach(project => {
        runNotificationForProject(settings, project, schedules);
    });
}
