// =====================================================
// Notification Service
// Handles push notifications, email alerts, and more
// =====================================================

import { Alert } from '../types';

// =====================================================
// TYPES
// =====================================================

export interface NotificationConfig {
    enablePush: boolean;
    enableSound: boolean;
    enableEmail: boolean;
    emailRecipients: string[];
    enableWhatsApp: boolean;
    whatsAppNumbers: string[];
    enableTelegram: boolean;
    telegramChatId: string;
    minSeverity: 'low' | 'medium' | 'high' | 'critical';
}

export interface NotificationPayload {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    data?: any;
    actions?: { action: string; title: string }[];
}

// =====================================================
// DEFAULT CONFIG
// =====================================================

const DEFAULT_CONFIG: NotificationConfig = {
    enablePush: true,
    enableSound: true,
    enableEmail: false,
    emailRecipients: [],
    enableWhatsApp: false,
    whatsAppNumbers: [],
    enableTelegram: false,
    telegramChatId: '',
    minSeverity: 'high',
};

// =====================================================
// LOCAL STORAGE
// =====================================================

const STORAGE_KEY = 'torre_control_notification_config';

export const getNotificationConfig = (): NotificationConfig => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
        }
    } catch (error) {
        console.error('Error loading notification config:', error);
    }
    return DEFAULT_CONFIG;
};

export const saveNotificationConfig = (config: NotificationConfig): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
        console.error('Error saving notification config:', error);
    }
};

// =====================================================
// PUSH NOTIFICATIONS (Web Notifications API)
// =====================================================

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
    if (!('Notification' in window)) {
        console.warn('This browser does not support notifications');
        return 'denied';
    }

    if (Notification.permission === 'granted') {
        return 'granted';
    }

    const permission = await Notification.requestPermission();
    return permission;
};

export const sendPushNotification = async (payload: NotificationPayload): Promise<boolean> => {
    try {
        if (!('Notification' in window)) {
            console.warn('Notifications not supported');
            return false;
        }

        if (Notification.permission !== 'granted') {
            const permission = await requestNotificationPermission();
            if (permission !== 'granted') {
                return false;
            }
        }

        const notification = new Notification(payload.title, {
            body: payload.body,
            icon: payload.icon || '/favicon.ico',
            tag: payload.tag,
            data: payload.data,
            requireInteraction: true,
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        return true;
    } catch (error) {
        console.error('Error sending push notification:', error);
        return false;
    }
};

// =====================================================
// ALERT NOTIFICATION
// =====================================================

const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };

export const shouldNotify = (alert: Alert, config: NotificationConfig): boolean => {
    const alertSeverity = severityOrder[alert.severity as keyof typeof severityOrder] || 0;
    const minSeverity = severityOrder[config.minSeverity as keyof typeof severityOrder] || 0;
    return alertSeverity >= minSeverity;
};

export const notifyAlert = async (alert: Alert): Promise<void> => {
    const config = getNotificationConfig();

    if (!shouldNotify(alert, config)) {
        return;
    }

    const payload: NotificationPayload = {
        title: `🚨 ${alert.type}`,
        body: `Vehículo: ${alert.plate}\nConductor: ${alert.driver}\nUbicación: ${alert.location}`,
        tag: `alert-${alert.id}`,
        data: { alertId: alert.id },
    };

    // Push notification
    if (config.enablePush) {
        await sendPushNotification(payload);
    }

    // Email notification (placeholder - requires backend)
    if (config.enableEmail && config.emailRecipients.length > 0) {
        await sendEmailNotification(alert, config.emailRecipients);
    }

    // WhatsApp notification (placeholder - requires backend)
    if (config.enableWhatsApp && config.whatsAppNumbers.length > 0) {
        await sendWhatsAppNotification(alert, config.whatsAppNumbers);
    }

    // Telegram notification (placeholder - requires backend)
    if (config.enableTelegram && config.telegramChatId) {
        await sendTelegramNotification(alert, config.telegramChatId);
    }
};

// =====================================================
// EMAIL NOTIFICATION (Placeholder)
// =====================================================

export const sendEmailNotification = async (
    alert: Alert,
    recipients: string[]
): Promise<boolean> => {
    // TODO: Implement with Supabase Edge Function or external service
    console.log('📧 Email notification would be sent to:', recipients, 'for alert:', alert.id);

    // Example implementation with a backend endpoint:
    /*
    try {
      const response = await fetch('/api/notifications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          subject: `🚨 Alerta: ${alert.type} - ${alert.plate}`,
          body: formatAlertForEmail(alert),
        }),
      });
      return response.ok;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
    */

    return true;
};

// =====================================================
// WHATSAPP NOTIFICATION (Placeholder)
// =====================================================

export const sendWhatsAppNotification = async (
    alert: Alert,
    phoneNumbers: string[]
): Promise<boolean> => {
    // TODO: Implement with WhatsApp Business API or Twilio
    console.log('📱 WhatsApp notification would be sent to:', phoneNumbers, 'for alert:', alert.id);

    // Example implementation:
    /*
    const message = formatAlertForWhatsApp(alert);
    
    for (const phone of phoneNumbers) {
      await fetch('https://api.twilio.com/...', {
        method: 'POST',
        body: JSON.stringify({ to: phone, message }),
      });
    }
    */

    return true;
};

// =====================================================
// TELEGRAM NOTIFICATION (Placeholder)
// =====================================================

export const sendTelegramNotification = async (
    alert: Alert,
    chatId: string
): Promise<boolean> => {
    // TODO: Implement with Telegram Bot API
    console.log('📢 Telegram notification would be sent to chat:', chatId, 'for alert:', alert.id);

    // Example implementation:
    /*
    const message = formatAlertForTelegram(alert);
    const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
    
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    */

    return true;
};

// =====================================================
// MESSAGE FORMATTERS
// =====================================================

export const formatAlertForWhatsApp = (alert: Alert): string => {
    const isSpeed = alert.type.toLowerCase().includes('velocidad');

    return `🚨 *ALERTA DE FLOTA*

*Tipo:* ${alert.type}
*Vehículo:* ${alert.plate}
*Conductor:* ${alert.driver}
Detalles: ${alert.details}
${isSpeed ? `*Velocidad:* ${alert.speed} km/h ⚠️` : `Velocidad: ${alert.speed} km/h`}
Ubicación: ${alert.location}
Hora: ${new Date(alert.timestamp).toLocaleString()}
${alert.contract ? `Contrato: ${alert.contract}` : ''}
Fuente: ${alert.source}`;
};

export const formatAlertForTelegram = (alert: Alert): string => {
    const severityEmoji = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢',
    };

    return `${severityEmoji[alert.severity as keyof typeof severityEmoji] || '⚪'} <b>ALERTA: ${alert.type}</b>

🚗 <b>Vehículo:</b> ${alert.plate}
👤 <b>Conductor:</b> ${alert.driver}
📍 <b>Ubicación:</b> ${alert.location}
⚡ <b>Velocidad:</b> ${alert.speed} km/h
🕐 <b>Hora:</b> ${new Date(alert.timestamp).toLocaleString()}
${alert.contract ? `📋 <b>Contrato:</b> ${alert.contract}` : ''}

<i>${alert.details}</i>`;
};

export const formatAlertForEmail = (alert: Alert): string => {
    return `
    <h2>🚨 Alerta de Flota: ${alert.type}</h2>
    
    <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Vehículo</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${alert.plate}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Conductor</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${alert.driver}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Ubicación</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${alert.location}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Velocidad</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${alert.speed} km/h</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Hora</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${new Date(alert.timestamp).toLocaleString()}</td>
      </tr>
      ${alert.contract ? `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Contrato</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${alert.contract}</td>
      </tr>
      ` : ''}
    </table>
    
    <p style="margin-top: 20px;">${alert.details}</p>
    
    <hr style="margin-top: 30px;">
    <p style="font-size: 12px; color: #666;">
      Este mensaje fue generado automáticamente por Torre de Control.<br>
      Para más detalles, accede al sistema.
    </p>
  `;
};

// =====================================================
// EXPORTS
// =====================================================

export default {
    requestNotificationPermission,
    sendPushNotification,
    notifyAlert,
    getNotificationConfig,
    saveNotificationConfig,
    formatAlertForWhatsApp,
    formatAlertForTelegram,
    formatAlertForEmail,
};
