import { WhatsAppRich } from "@/api/apollosms";
import { cn } from "@/lib/utils";
import { Fragment, ReactNode } from "react";
import { composeWhatsAppText } from "./whatsapp-rich";

const TOKEN = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s]+)/g;

function formatLine(line: string): ReactNode[] {
    return line.split(TOKEN).map((part, i) => {
        if (!part) return null;
        if (/^https?:\/\//.test(part)) {
            return (
                <a key={i} href={part} target="_blank" rel="noreferrer" className="text-[#027eb5] dark:text-[#53bdeb] underline break-all">
                    {part}
                </a>
            );
        }
        if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <strong key={i}>{part.slice(1, -1)}</strong>;
        if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) return <em key={i}>{part.slice(1, -1)}</em>;
        if (part.length > 2 && part.startsWith("~") && part.endsWith("~")) return <s key={i}>{part.slice(1, -1)}</s>;
        return <Fragment key={i}>{part}</Fragment>;
    });
}

export function WhatsAppFormatted({ text }: { text: string }) {
    return (
        <>
            {text.split("\n").map((line, i, lines) => (
                <Fragment key={i}>
                    {formatLine(line)}
                    {i < lines.length - 1 && <br />}
                </Fragment>
            ))}
        </>
    );
}

export default function WhatsAppPreview({ message, rich, className }: { message: string; rich?: WhatsAppRich | null; className?: string }) {
    const text = composeWhatsAppText(message, rich);
    const empty = !message.trim() && !rich?.image_url;
    return (
        <div className={cn("rounded-lg bg-[#efeae2] dark:bg-[#0b141a] p-3", className)}>
            <div className="ml-auto max-w-[85%] w-fit min-w-[160px] rounded-lg rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b] p-1 shadow-sm">
                {rich?.image_url && (
                    <img src={rich.image_url} alt="" className="block w-full max-h-72 rounded-md object-cover" />
                )}
                <div className="px-2 pt-1.5 pb-1">
                    <p className="text-[13px] leading-snug text-[#111b21] dark:text-[#e9edef] break-words">
                        {empty ? <span className="text-[#667781]">Your WhatsApp message preview appears here.</span> : <WhatsAppFormatted text={text} />}
                    </p>
                    <p className="text-[10px] text-right text-[#667781] dark:text-[#8696a0] mt-1">
                        {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓
                    </p>
                </div>
            </div>
        </div>
    );
}
