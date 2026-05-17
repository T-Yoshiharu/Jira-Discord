import {
    getSettingsForUi,
    saveSettingsFromUi,
    sendTestNotificationFromUi,
    testConnectionsFromUi
} from './backend/features/settings';
import { notifyTasksFor830, notifyTasksFor930 } from './backend/features/notifications';
import { doGet } from './frontend/webUI';

(globalThis as unknown as { [key: string]: unknown }).doGet = doGet;
(globalThis as unknown as { [key: string]: unknown }).notifyTasksFor830 = notifyTasksFor830;
(globalThis as unknown as { [key: string]: unknown }).notifyTasksFor930 = notifyTasksFor930;
(globalThis as unknown as { [key: string]: unknown }).getSettingsForUi = getSettingsForUi;
(globalThis as unknown as { [key: string]: unknown }).saveSettingsFromUi = saveSettingsFromUi;
(globalThis as unknown as { [key: string]: unknown }).testConnectionsFromUi = testConnectionsFromUi;
(globalThis as unknown as { [key: string]: unknown }).sendTestNotificationFromUi = sendTestNotificationFromUi;
