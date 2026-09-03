import type { Flat, NotificationChannel } from './types';

class TelegramNotifier implements NotificationChannel {
    constructor(
        private readonly token: string,
        private readonly chatId: string
    ) {}

    async sendNewListing(flat: Flat): Promise<void> {
        const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: this.chatId,
                text: formatListing(flat),
                disable_web_page_preview: false
            })
        });

        if (!response.ok) {
            throw new Error(`Telegram API zwrocilo HTTP ${response.status}.`);
        }

        const result = await response.json() as { ok?: boolean; description?: string };
        if (!result.ok) {
            throw new Error(result.description || 'Telegram API odrzucilo wiadomosc.');
        }
    }
}

function formatListing(flat: Flat): string {
    const facts = [
        `Cena: ${flat.price ?? '-'} zl`,
        `Metraz: ${flat.area ?? '-'} m2`,
        `Pokoje: ${flat.rooms ?? '-'}`,
        `Dzielnica: ${flat.district ?? '-'}`,
        `Graz: ${formatBoolean(flat.hasGarage)}`,
        `Winda: ${formatBoolean(flat.hasElevator)}`,
        `Balkon: ${formatBoolean(flat.hasBalcony)}`,
        `Rok budowy: ${flat.buildYear ?? '-'}`
    ];

    return [`NOWA OFERTA (${flat.source})`, flat.title, '', ...facts, '', flat.url].join('\n');
}

function formatBoolean(value: boolean | null): string {
    return value === null ? 'nieznane' : value ? 'tak' : 'nie';
}

export default TelegramNotifier;