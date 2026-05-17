export interface JiraIssue {
    key: string;
    fields: {
        summary: string;
        duedate: string | null;
    };
}

export interface JiraProjectConfig {
    projectKey: string;
    discordWebhookUrl: string;
}

export interface SystemSettings {
    jiraDomain: string;
    jiraEmail: string;
    jiraApiToken: string;
    jiraProjects: JiraProjectConfig[];
}

export interface UiActionResult {
    ok: boolean;
    message: string;
}

export interface DiscordEmbedField {
    name: string;
    value: string;
}

export interface DiscordPayload {
    username: string;
    embeds: {
        title: string;
        color: number;
        fields: DiscordEmbedField[];
        timestamp: string;
    }[];
}
