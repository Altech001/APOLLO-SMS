import { WhatsAppButton, WhatsAppRich } from "@/api/apollosms";

export const MAX_BUTTONS = 3;
export const CAPTION_LIMIT = 1024;
const NUMBER_EMOJI = ["1️⃣", "2️⃣", "3️⃣"];

export const isRichEmpty = (rich?: WhatsAppRich | null) =>
    !rich || (!rich.image_url && !rich.header?.trim() && !rich.footer?.trim() && !(rich.buttons || []).some((b) => b.text.trim()));

const cleanButtonValue = (b: WhatsAppButton) => {
    const value = (b.value || "").trim();
    if (b.type === "url") return value && !value.includes("://") ? `https://${value}` : value;
    if (b.type === "call") return value.replace(/[^\d+]/g, "");
    return "";
};

/** Mirrors the backend layout, so the preview is exactly what recipients get. */
export function composeWhatsAppText(body: string, rich?: WhatsAppRich | null) {
    const parts: string[] = [];
    if (rich?.header?.trim()) parts.push(`*${rich.header.trim()}*`);
    parts.push(body.trim());
    const buttons = (rich?.buttons || []).filter((b) => b.text.trim());
    const actions = buttons
        .filter((b) => b.type !== "reply")
        .map((b) => (b.type === "url" ? `🔗 *${b.text.trim()}*\n${cleanButtonValue(b)}` : `📞 *${b.text.trim()}*: ${cleanButtonValue(b)}`));
    if (actions.length) parts.push(actions.join("\n\n"));
    const replies = buttons.filter((b) => b.type === "reply");
    if (replies.length) parts.push(["_Reply with a number:_", ...replies.map((b, i) => `${NUMBER_EMOJI[i]} ${b.text.trim()}`)].join("\n"));
    if (rich?.footer?.trim()) parts.push(`_${rich.footer.trim()}_`);
    return parts.filter(Boolean).join("\n\n");
}

export function buttonProblem(b: WhatsAppButton): string | null {
    if (!b.text.trim()) return "Add button text";
    if (b.text.trim().length > 25) return "Max 25 characters";
    const value = cleanButtonValue(b);
    if (b.type === "url" && !/^https?:\/\/[^\s/]+\.[^\s]+/i.test(value)) return "Add a valid link";
    if (b.type === "call" && value.replace("+", "").length < 9) return "Add a valid phone number";
    return null;
}

export interface WhatsAppTemplatePreset {
    id: string;
    category: "Promotions" | "Events" | "Payments" | "Orders" | "Customer care" | "Greetings";
    name: string;
    imageQuery?: string;
    header?: string;
    body: string;
    footer?: string;
    buttons?: WhatsAppButton[];
}

export const WHATSAPP_TEMPLATE_PRESETS: WhatsAppTemplatePreset[] = [
    {
        id: "flash-sale",
        category: "Promotions",
        name: "Flash sale",
        imageQuery: "shopping sale colorful",
        header: "⚡ Flash Sale: {discount}% OFF",
        body: "Hi {name}! For the next 48 hours, enjoy *{discount}% off* everything in store. Don't miss out, stock is limited!",
        footer: "Reply STOP to opt out",
        buttons: [{ type: "url", text: "Shop now", value: "" }, { type: "reply", text: "Remind me later" }],
    },
    {
        id: "new-arrivals",
        category: "Promotions",
        name: "New arrivals",
        imageQuery: "new products store display",
        header: "✨ Just arrived",
        body: "Hello {name}, our new collection is here! Be among the first to see it in store or online this week.",
        footer: "Reply STOP to opt out",
        buttons: [{ type: "url", text: "See what's new", value: "" }, { type: "call", text: "Call the shop", value: "" }],
    },
    {
        id: "weekend-offer",
        category: "Promotions",
        name: "Weekend offer",
        imageQuery: "weekend market fresh food",
        header: "🎉 Weekend Special",
        body: "This weekend only: buy one, get one *free* on selected items. Visit us Saturday and Sunday, 8am to 8pm.",
        footer: "Reply STOP to opt out",
        buttons: [{ type: "reply", text: "I'll come" }, { type: "reply", text: "Tell me more" }],
    },
    {
        id: "event-invite",
        category: "Events",
        name: "Event invitation",
        imageQuery: "event celebration people Africa",
        header: "📅 You're invited",
        body: "Dear {name}, join us for *{event}* on {date} at {venue}. We'd love to see you there!",
        footer: "Kindly RSVP",
        buttons: [{ type: "reply", text: "Yes, I'll attend" }, { type: "reply", text: "Sorry, can't make it" }],
    },
    {
        id: "meeting-reminder",
        category: "Events",
        name: "Meeting reminder",
        imageQuery: "meeting community hall",
        header: "⏰ Reminder",
        body: "Hi {name}, a friendly reminder about *{event}* tomorrow at {time}, {venue}. See you there!",
        buttons: [{ type: "reply", text: "Confirmed" }, { type: "reply", text: "I need to reschedule" }],
    },
    {
        id: "payment-reminder",
        category: "Payments",
        name: "Payment reminder",
        header: "Payment reminder",
        body: "Hello {name}, this is a reminder that *UGX {amount}* is due on {date}. Please pay by mobile money to {number}. Thank you!",
        footer: "Ignore this if you've already paid",
        buttons: [{ type: "call", text: "Call accounts", value: "" }, { type: "reply", text: "I've paid" }],
    },
    {
        id: "payment-received",
        category: "Payments",
        name: "Payment received",
        header: "✅ Payment received",
        body: "Thank you {name}! We've received *UGX {amount}* on {date}. Your reference is {reference}.",
        footer: "Keep this message as your receipt",
    },
    {
        id: "order-ready",
        category: "Orders",
        name: "Order ready",
        imageQuery: "package delivery parcel",
        header: "📦 Your order is ready",
        body: "Hi {name}, order *#{order}* is ready for pickup at {location}. Please bring this message when you come.",
        buttons: [{ type: "call", text: "Call us", value: "" }, { type: "reply", text: "Deliver it instead" }],
    },
    {
        id: "order-shipped",
        category: "Orders",
        name: "Out for delivery",
        imageQuery: "delivery motorcycle rider",
        header: "🚚 On the way",
        body: "Good news {name}! Order *#{order}* is out for delivery and should reach you by {time}.",
        buttons: [{ type: "url", text: "Track order", value: "" }],
    },
    {
        id: "appointment",
        category: "Customer care",
        name: "Appointment confirmation",
        imageQuery: "clinic reception friendly",
        header: "Appointment confirmed",
        body: "Hello {name}, your appointment is booked for *{date} at {time}*. Please arrive 10 minutes early.",
        buttons: [{ type: "reply", text: "Confirm" }, { type: "reply", text: "Reschedule" }, { type: "call", text: "Call us", value: "" }],
    },
    {
        id: "feedback",
        category: "Customer care",
        name: "Feedback request",
        header: "How did we do? ⭐",
        body: "Hi {name}, thank you for choosing us! How was your experience today?",
        footer: "Your feedback helps us improve",
        buttons: [{ type: "reply", text: "Excellent" }, { type: "reply", text: "Good" }, { type: "reply", text: "Needs improvement" }],
    },
    {
        id: "welcome",
        category: "Customer care",
        name: "Welcome new customer",
        imageQuery: "welcome smiling team Africa",
        header: "Welcome aboard! 👋",
        body: "Hi {name}, thanks for joining us. Save this number to get offers, updates and quick support right here on WhatsApp.",
        buttons: [{ type: "url", text: "Visit our website", value: "" }, { type: "reply", text: "Show me offers" }],
    },
    {
        id: "holiday",
        category: "Greetings",
        name: "Holiday greetings",
        imageQuery: "festive celebration lights",
        header: "Season's greetings 🎄",
        body: "Dear {name}, thank you for being with us this year. We wish you and your family a joyful festive season!",
        footer: "From all of us",
    },
    {
        id: "birthday",
        category: "Greetings",
        name: "Birthday wishes",
        imageQuery: "birthday cake celebration",
        header: "Happy Birthday, {name}! 🎂",
        body: "Wishing you a wonderful year ahead. Enjoy *{discount}% off* your next visit as our gift to you.",
        buttons: [{ type: "reply", text: "Thank you!" }],
    },
];
